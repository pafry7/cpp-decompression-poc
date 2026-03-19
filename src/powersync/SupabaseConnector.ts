import {
  AbstractPowerSyncDatabase,
  BaseObserver,
  PowerSyncBackendConnector,
  UpdateType,
} from "@powersync/react-native";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { DeadLetterRecord } from "./AppSchema";
export type SupabaseConfig = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  powersyncUrl: string;
};

/// Postgres Response codes that we cannot recover from by retrying.
const FATAL_RESPONSE_CODES = [
  // Class 22 — Data Exception
  // Examples include data type mismatch.
  new RegExp("^22...$"),
  // Class 23 — Integrity Constraint Violation.
  // Examples include NOT NULL, FOREIGN KEY and UNIQUE violations.
  new RegExp("^23...$"),
  // INSUFFICIENT PRIVILEGE - typically a row-level security violation
  new RegExp("^42501$"),
];

const MAX_RETRIES = 3;
const MAX_DEAD_LETTER_CYCLES = 3;
const KNOWN_TABLES = ["thoughts", "reactions"];

export type SupabaseConnectorListener = {
  initialized: () => void;
};

export class SupabaseConnector
  extends BaseObserver<SupabaseConnectorListener>
  implements PowerSyncBackendConnector
{
  readonly client: SupabaseClient;
  readonly config: SupabaseConfig;
  userId?: string;
  simulateUploadFailure = false;
  strategy: 'auto-reapply' | 'user-resolution' = 'auto-reapply';
  private failingRowId: string | null = null;
  private retryCounts = new Map<string, number>();

  constructor() {
    super();
    this.config = {
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL!,
      powersyncUrl: process.env.EXPO_PUBLIC_POWERSYNC_URL!,
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
    };
    this.client = createClient(
      this.config.supabaseUrl,
      this.config.supabaseAnonKey
    );
    this.loadUserId();
  }

  async loadUserId(): Promise<void> {
    let {
      data: { session },
    } = await this.client.auth.getSession();
    if (session == null) {
      const { data, error } = await this.client.auth.signInAnonymously();
      if (error) {
        throw error;
      }
      session = data.session;
    }
    if (session == null || session.user == null) {
      throw new Error(`Failed to get Supabase session or user`);
    }
    this.userId = session.user.id;
  }

  async fetchCredentials() {
    let {
      data: { session },
    } = await this.client.auth.getSession();
    if (session == null) {
      const { data, error } = await this.client.auth.signInAnonymously();
      if (error) {
        throw error;
      }
      session = data.session;
    }
    if (session == null) {
      throw new Error(`Failed to get Supabase session`);
    }
    return {
      endpoint: this.config.powersyncUrl,
      token: session.access_token,
    };
  }

  clearFailureTarget() {
    this.failingRowId = null;
  }

  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    console.log("[REPRODUCER] uploadData called, simulateFailure:", this.simulateUploadFailure);
    const transaction = await database.getNextCrudTransaction();
    if (!transaction) {
      console.log("[REPRODUCER] no transaction, returning");
      return;
    }
    console.log("[REPRODUCER] transaction has", transaction.crud.length, "ops");

    await this.logSyncState(database, "uploadData start");

    const archivedIds: string[] = [];

    for (let i = 0; i < transaction.crud.length; i++) {
      const op = transaction.crud[i];
      const key = `${op.table}:${op.op}:${op.id}`;
      console.log(`[DLQ] Processing op ${i + 1}/${transaction.crud.length}: ${key} (clientId=${op.clientId}, strategy=${this.strategy})`);

      try {
        if (this.simulateUploadFailure) {
          if (!this.failingRowId) {
            this.failingRowId = op.id;
            console.log(`[DLQ] Locked failure onto row ${op.id}`);
          }
          if (op.id === this.failingRowId) {
            const error: any = new Error("Simulated upload failure (HTTP 500)");
            error.status = 500;
            throw error;
          }
        }

        const table = this.client.from(op.table);
        let result: any = null;
        switch (op.op) {
          case UpdateType.PUT:
            result = await table.upsert({ ...op.opData, id: op.id });
            break;
          case UpdateType.PATCH:
            result = await table.update(op.opData).eq("id", op.id);
            break;
          case UpdateType.DELETE:
            result = await table.delete().eq("id", op.id);
            break;
        }
        if (result?.error) {
          result.error.message = `Could not ${op.op} data to Supabase: ${JSON.stringify(result)}`;
          throw result.error;
        }

        this.retryCounts.delete(key);
        await database.execute("DELETE FROM dead_letter WHERE id = ?", [op.table + ":" + op.id]);
      } catch (error: any) {
        const status = error.status ?? null;
        const isFatal =
          typeof error.code === "string" &&
          FATAL_RESPONSE_CODES.some((regex) => regex.test(error.code));

        if (status !== 500 && !isFatal) {
          throw error;
        }

        const count = (this.retryCounts.get(key) ?? 0) + 1;
        this.retryCounts.set(key, count);
        console.log(`[DLQ] Retry ${count}/${MAX_RETRIES} for ${key}`);

        await this.logSyncState(database, `after retry ${count}`);

        if (count >= MAX_RETRIES) {
          const dlId = `${op.table}:${op.id}`;
          const existing = await database.getOptional<DeadLetterRecord>(
            "SELECT * FROM dead_letter WHERE id = ?",
            [dlId]
          );
          const retryCount = (existing?.retry_count ?? 0) + 1;

          if (retryCount > MAX_DEAD_LETTER_CYCLES) {
            console.error(`[DLQ] Permanently dropping op after ${MAX_DEAD_LETTER_CYCLES} cycles: ${key}`);
            await database.execute("DELETE FROM dead_letter WHERE id = ?", [dlId]);
          } else {
            console.log(`[DLQ] Archiving op to dead_letter (cycle ${retryCount}/${MAX_DEAD_LETTER_CYCLES}): ${key}`);
            await database.execute(
              `INSERT OR REPLACE INTO dead_letter (id, target_table, row_id, op_type, op_data, error_message, retry_count, original_client_id, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                dlId,
                op.table,
                op.id,
                op.op,
                JSON.stringify(op.opData),
                error.message ?? String(error),
                retryCount,
                op.clientId,
                existing?.created_at ?? new Date().toISOString(),
              ]
            );
            archivedIds.push(dlId);
          }

          this.retryCounts.delete(key);

          if (this.strategy === 'user-resolution') {
            console.log(`[DLQ] user-resolution: deleting ps_crud entry clientId=${op.clientId} and returning`);
            await database.execute('DELETE FROM ps_crud WHERE id = ?', [op.clientId]);
            await this.logSyncState(database, 'after user-resolution delete');
            return;
          }
          console.log(`[DLQ] auto-reapply: skipping archived op, continuing to next op`);
          continue;
        }

        console.log(`[DLQ] Retry ${count}/${MAX_RETRIES} — throwing to let SDK retry uploadData`);
        throw error;
      }
    }

    console.log("[DLQ] All ops processed, calling transaction.complete()...");
    await transaction.complete();
    console.log("[DLQ] transaction.complete() done");

    if (this.strategy === 'auto-reapply' && archivedIds.length > 0) {
      console.log(`[DLQ] auto-reapply: immediately re-applying ${archivedIds.length} archived ops`);
      const placeholders = archivedIds.map(() => "?").join(", ");
      const archived = await database.getAll<DeadLetterRecord>(
        `SELECT * FROM dead_letter WHERE id IN (${placeholders}) ORDER BY original_client_id ASC`,
        archivedIds
      );
      for (const dl of archived) {
        await this.reApplyDeadLetter(database, dl);
      }
      console.log(`[DLQ] auto-reapply: done re-applying ${archived.length} dead letters`);
    }

    await this.logSyncState(database, "after complete");
  }

  async reApplyDeadLetter(database: AbstractPowerSyncDatabase, dl: DeadLetterRecord): Promise<void> {
    if (!KNOWN_TABLES.includes(dl.target_table)) {
      console.error(`[DLQ] Unknown table "${dl.target_table}", skipping re-apply for ${dl.id}`);
      return;
    }

    const opData = JSON.parse(dl.op_data);

    switch (dl.op_type) {
      case UpdateType.PUT: {
        const columns = ["id", ...Object.keys(opData)];
        const placeholders = columns.map(() => "?").join(", ");
        const values = [dl.row_id, ...Object.values(opData)];
        await database.execute(
          `INSERT OR REPLACE INTO ${dl.target_table} (${columns.join(", ")}) VALUES (${placeholders})`,
          values
        );
        break;
      }
      case UpdateType.PATCH: {
        const setClauses = Object.keys(opData).map((col) => `${col} = ?`).join(", ");
        const values = [...Object.values(opData), dl.row_id];
        await database.execute(
          `UPDATE ${dl.target_table} SET ${setClauses} WHERE id = ?`,
          values
        );
        break;
      }
      case UpdateType.DELETE: {
        await database.execute(
          `DELETE FROM ${dl.target_table} WHERE id = ?`,
          [dl.row_id]
        );
        break;
      }
      default:
        console.error(`[DLQ] Unknown op_type "${dl.op_type}", skipping re-apply for ${dl.id}`);
        return;
    }

    console.log(`[DLQ] Re-applied ${dl.op_type} to ${dl.target_table} row ${dl.row_id} (cycle ${dl.retry_count})`);
  }

  private async logSyncState(database: AbstractPowerSyncDatabase, label: string) {
    const crud = await database.getAll("SELECT * FROM ps_crud");
    console.log(`\n=== ${label} ===`);
    console.log(`  ps_crud: ${crud.length} entries`);
  }
}