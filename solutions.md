# Findings

### Auto Re-Apply

Archive the failing op to `dead_letter`, call `complete()` to drain the queue, then automatically re-apply the archived data to the app table after checkpoint. PowerSync intercepts the write and creates a new `ps_crud` entry, which gets retried on the next sync cycle. Repeats up to MAX_DEAD_LETTER_CYCLES before permanently dropping.

- Other ops in the same transaction get through
- **Checkpoint blocked**: `complete()` briefly empties `ps_crud`, but the immediate re-apply creates new entries. `_uploadAllCrud()` never exits its loop (sees new items → calls `uploadData()` again), so `notifyCompletedUploads()` never fires and the deferred checkpoint is never retried
- Failing op cycles (fail → archive → complete → re-apply → fail) until MAX_DEAD_LETTER_CYCLES, then permanently dropped — only then does the checkpoint apply
- No SDK or server changes needed

### User Resolution

Archive the failing op to `dead_letter`, delete it from `ps_crud`, and surface the failure to the user ("1 change couldn't sync"). User decides: retry, modify, or discard.

- Queue unblocked, other ops sync
- Checkpoint applies normally
- Data preserved in `dead_letter` but local table shows server state after checkpoint until user acts
- **No conflict risk** — user has full context to make the right decision
- No SDK or server changes needed

### Priority 0 Buckets vs Reading the Oplog

They address the getting current server data while the queue is blocked.

| | Priority 0 Buckets | Read Oplog |
|---|---|---|
| **How** | Assign tables to priority 0 in sync rules. The native extension skips the CRUD-empty check for priority 0, applying those buckets immediately | Query `ps_oplog` directly — it always contains current server data regardless of queue state |
| **Scope** | Only priority 0 tables get current data; others still stale | Any table's server data is readable |
| **Tradeoff** | Requires sync rule redesign; doesn't help non-priority-0 tables | Read-only — app must handle raw oplog format (`row_type`, `row_id`, `data` JSON) |

I couldn't verify the priority 0, it did not work for me.

### Retry Window

We can increase `retryDelayMs` or add exponential retry by patching Powersync.
