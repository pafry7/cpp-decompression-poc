import { useQuery } from "@powersync/react-native";
import React, { useEffect, useRef, useState } from "react";
import { Alert, View, Text, TouchableOpacity, ScrollView } from "react-native";
import { powerSync, connector } from "../powersync/SystemProvider";

type ThoughtRow = { id: string; content: string; created_at: string };
type CrudRow = { id: number; tx_id: number; data: string };
type DeadLetterRow = { id: string; target_table: string; row_id: string; op_type: string; op_data: string; retry_count: number; error_message: string };
type OplogRow = { op_id: number; row_id: string; data: string };

export default function ThoughtsApp() {
  const { data: thoughts } = useQuery<ThoughtRow>('SELECT id, content, created_at FROM thoughts ORDER BY created_at DESC');
  const { data: crudEntries } = useQuery<CrudRow>('SELECT * FROM ps_crud ORDER BY id ASC');
  const { data: deadLetters } = useQuery<DeadLetterRow>('SELECT id, target_table, row_id, op_type, op_data, retry_count, error_message FROM dead_letter ORDER BY original_client_id ASC');
  const [oplogThoughts, setOplogThoughts] = useState<OplogRow[]>([]);
  const [failureEnabled, setFailureEnabled] = useState(false);
  const [strategy, setStrategy] = useState<'auto-reapply' | 'user-resolution'>(connector.strategy);

  const refreshOplog = async () => {
    try {
      const rows = await powerSync.getAll<OplogRow>(
        `SELECT op_id, row_id, data FROM ps_oplog
         WHERE row_type = 'thoughts'
         AND row_id NOT IN (SELECT id FROM thoughts)`
      );
      setOplogThoughts(rows);
      console.log(`[OPLOG] Found ${rows.length} unapplied thoughts in oplog`);
    } catch (e: any) {
      console.error('[OPLOG] Query failed:', e.message);
    }
  };

  const toggleFailure = () => {
    const next = !failureEnabled;
    connector.simulateUploadFailure = next;
    if (!next) {
      connector.clearFailureTarget();
    }
    setFailureEnabled(next);
    console.log(`[REPRODUCER] Upload failure simulation: ${next ? "ON" : "OFF"}`);
  };

  const toggleStrategy = () => {
    const next = strategy === 'auto-reapply' ? 'user-resolution' : 'auto-reapply';
    connector.strategy = next;
    setStrategy(next);
  };

  const addThought = async () => {
    await powerSync.execute(
      "INSERT INTO thoughts (id, content, created_at, created_by) VALUES (uuid(), ?, ?, ?)",
      ['Buy milk (reproducer)', new Date().toISOString(), connector.userId]
    );
    console.log('[REPRODUCER] Inserted thought');
  };

  const addSecondThought = async () => {
    await powerSync.execute(
      "INSERT INTO thoughts (id, content, created_at, created_by) VALUES (uuid(), ?, ?, ?)",
      ['Walk the dog (reproducer)', new Date().toISOString(), connector.userId]
    );
    console.log('[REPRODUCER] Inserted second thought');
  };

  const retryDeadLetter = async (dl: DeadLetterRow) => {
    await connector.reApplyDeadLetter(powerSync, {
      ...dl,
      original_client_id: 0,
      created_at: '',
    });
    await powerSync.execute("DELETE FROM dead_letter WHERE id = ?", [dl.id]);
    console.log(`[DLQ] User retried ${dl.id}`);
  };

  const seedServerThoughts = async () => {
    const samples = [
      'Morning meditation', 'Read a chapter', 'Call a friend',
      'Take a walk', 'Write in journal', 'Learn something new',
      'Cook a meal', 'Clean the desk', 'Plan tomorrow', 'Stretch break',
    ];
    const shuffled = samples.sort(() => Math.random() - 0.5).slice(0, 5);
    const rows = shuffled.map((content) => ({
      content: `${content} (seed)`,
      created_at: new Date().toISOString(),
      created_by: connector.userId,
    }));
    const { error } = await connector.client.from('thoughts').insert(rows);
    if (error) {
      console.error('[SEED] Failed to seed server:', error.message);
      Alert.alert('Seed failed', error.message);
      return;
    }
    console.log('[SEED] Inserted 5 thoughts directly into Supabase');
  };

  const clearCrudQueue = async () => {
    await powerSync.execute("DELETE FROM ps_crud");
    console.log('[REPRODUCER] Cleared ps_crud queue');
  };

  const removeAllThoughts = async () => {
    await powerSync.execute("DELETE FROM thoughts");
    console.log('[REPRODUCER] Deleted all thoughts');
  };

  const discardDeadLetter = async (dl: DeadLetterRow) => {
    await powerSync.execute("DELETE FROM dead_letter WHERE id = ?", [dl.id]);
    console.log(`[DLQ] User discarded ${dl.id}`);
  };

  useEffect(() => {
    refreshOplog();
  }, [thoughts, crudEntries]);

  // claude --resume 660c9a1d-dadd-4830-9768-71d0dd101fb7
  const wasDownloading = useRef(false);

  useEffect(() => {
    const unsubscribe = powerSync.registerListener({
      statusChanged: async (status) => {
        const isDownloading = status.downloadProgress != null;
        console.log(`[DLQ] statusChanged — downloading: ${isDownloading}, wasDownloading: ${wasDownloading.current}, downloadProgress:`, status.downloadProgress, 'lastSyncedAt:', status.lastSyncedAt);

        if (isDownloading) {
          wasDownloading.current = true;
          return;
        }

        if (!wasDownloading.current) return;
        wasDownloading.current = false;
        console.log('[DLQ] Download finished, checking dead letters...');
        refreshOplog();

        const entries = await powerSync.getAll<DeadLetterRow>(
          'SELECT id, target_table, row_id, op_type, op_data, retry_count, error_message FROM dead_letter'
        );
        if (entries.length === 0) return;

        if (connector.strategy === 'auto-reapply') {
          // auto-reapply handles re-application immediately in uploadData
          console.log(`[DLQ] auto-reapply: ${entries.length} dead letters present after checkpoint (handled in uploadData)`);
          return;
        }

        const count = entries.length;
        Alert.alert(
          `${count} change${count !== 1 ? 's' : ''} couldn't sync`,
          'Would you like to retry or discard these changes?',
          [
            { text: 'Later', style: 'cancel' },
            {
              text: 'Discard All',
              style: 'destructive',
              onPress: async () => {
                for (const dl of entries) {
                  await discardDeadLetter(dl);
                }
              },
            },
            {
              text: 'Retry All',
              onPress: async () => {
                for (const dl of entries) {
                  await retryDeadLetter(dl);
                }
              },
            },
          ]
        );
      },
    });
    return unsubscribe;
  }, []);

  return (
    <ScrollView className="flex-1 bg-white">
      <View className="px-4 py-6">
        <Text className="text-xl font-bold mb-4 text-gray-900">Sync Data Loss Reproducer</Text>

        {/* Upload simulation toggle */}
        <View className={`rounded-lg p-3 mb-4 ${failureEnabled ? 'bg-red-50 border border-red-200' : 'bg-gray-50 border border-gray-200'}`}>
          <Text className={`font-semibold mb-2 ${failureEnabled ? 'text-red-700' : 'text-gray-700'}`}>
            Upload simulation: {failureEnabled ? 'FAILING (500)' : 'NORMAL'}
          </Text>
          <TouchableOpacity
            className={`rounded-lg py-2 px-4 ${failureEnabled ? 'bg-red-600' : 'bg-gray-600'}`}
            onPress={toggleFailure}
          >
            <Text className="text-white text-center font-semibold">
              {failureEnabled ? 'Disable Failure Mode' : 'Enable Failure Mode'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Strategy toggle */}
        <View className="rounded-lg p-3 mb-4 bg-gray-50 border border-gray-200">
          <Text className="font-semibold mb-2 text-gray-700">
            Strategy: {strategy === 'auto-reapply' ? 'Auto Re-apply (Sol 2)' : 'User Resolution (Sol 5)'}
          </Text>
          <TouchableOpacity
            className="rounded-lg py-2 px-4 bg-gray-600"
            onPress={toggleStrategy}
          >
            <Text className="text-white text-center font-semibold">
              Switch to {strategy === 'auto-reapply' ? 'User Resolution (Sol 5)' : 'Auto Re-apply (Sol 2)'}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          className="rounded-lg py-3 px-4 mb-2 bg-blue-600"
          onPress={addThought}
        >
          <Text className="text-white text-center font-semibold">
            Add "Buy milk" Thought
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          className="rounded-lg py-3 px-4 mb-2 bg-blue-500"
          onPress={addSecondThought}
        >
          <Text className="text-white text-center font-semibold">
            Add "Walk the dog" Thought
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          className="rounded-lg py-3 px-4 mb-2 bg-green-600"
          onPress={seedServerThoughts}
        >
          <Text className="text-white text-center font-semibold">
            Seed 5 Server Thoughts
          </Text>
        </TouchableOpacity>

        {/* ps_crud entries */}
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-lg font-bold text-gray-900">ps_crud Queue ({crudEntries.length})</Text>
          {crudEntries.length > 0 && (
            <TouchableOpacity onPress={clearCrudQueue}>
              <Text className="text-red-600 font-semibold">Clear Queue</Text>
            </TouchableOpacity>
          )}
        </View>
        {crudEntries.length === 0 ? (
          <Text className="text-gray-400 mb-4">Empty — no pending operations</Text>
        ) : (
          crudEntries.map((entry) => (
            <View key={entry.id} className="bg-gray-50 rounded p-2 mb-1 border border-gray-100">
              <Text className="text-xs font-mono text-gray-600">#{entry.id} tx:{entry.tx_id}</Text>
              <Text className="text-xs font-mono text-gray-500" numberOfLines={2}>{entry.data}</Text>
            </View>
          ))
        )}

        {/* Dead letter entries */}
        {deadLetters.length > 0 && (
          <>
            <View className="bg-red-50 rounded-lg p-3 mt-4 mb-2 border border-red-200">
              <Text className="font-semibold text-red-700">
                {deadLetters.length} change{deadLetters.length !== 1 ? 's' : ''} couldn't sync
              </Text>
            </View>
            {deadLetters.map((dl) => (
              <View key={dl.id} className="bg-gray-50 rounded p-2 mb-1 border border-gray-100">
                <Text className="text-xs font-mono font-semibold text-gray-700">{dl.target_table} — {dl.op_type} (attempt {dl.retry_count})</Text>
                <Text className="text-xs font-mono text-gray-400" numberOfLines={1}>{dl.error_message}</Text>
                <View className="flex-row mt-1 gap-2">
                  <TouchableOpacity
                    className="bg-gray-800 rounded px-3 py-1"
                    onPress={() => retryDeadLetter(dl)}
                  >
                    <Text className="text-white text-xs font-semibold">Retry</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    className="bg-gray-300 rounded px-3 py-1"
                    onPress={() => discardDeadLetter(dl)}
                  >
                    <Text className="text-gray-700 text-xs font-semibold">Discard</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </>
        )}

        {/* Oplog thoughts (downloaded but not yet applied) */}
        <View className="flex-row items-center justify-between mt-4 mb-2">
          <Text className="text-lg font-bold text-orange-700">
            Oplog — Pending ({oplogThoughts.length})
          </Text>
          <TouchableOpacity onPress={refreshOplog}>
            <Text className="text-orange-600 font-semibold">Refresh</Text>
          </TouchableOpacity>
        </View>
        {oplogThoughts.length === 0 ? (
          <Text className="text-gray-400 mb-4">No unapplied thoughts in oplog</Text>
        ) : (
          oplogThoughts.map((row) => {
            const parsed = JSON.parse(row.data || '{}');
            return (
              <View key={row.op_id} className="bg-orange-50 rounded p-2 mb-1 border border-orange-200">
                <Text className="font-semibold text-orange-900">{parsed.content ?? '(no content)'}</Text>
                <Text className="text-xs text-orange-400">{row.row_id}</Text>
              </View>
            );
          })
        )}

        {/* Thoughts list */}
        <View className="flex-row items-center justify-between mt-4 mb-2">
          <Text className="text-lg font-bold text-gray-900">Thoughts ({thoughts.length})</Text>
          {thoughts.length > 0 && (
            <TouchableOpacity onPress={removeAllThoughts}>
              <Text className="text-red-600 font-semibold">Remove All</Text>
            </TouchableOpacity>
          )}
        </View>
        {thoughts.map((t) => (
          <View key={t.id} className="bg-gray-50 rounded p-2 mb-1 border border-gray-100">
            <Text className="font-semibold text-gray-900">{t.content}</Text>
            <Text className="text-xs text-gray-400">{t.id}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
