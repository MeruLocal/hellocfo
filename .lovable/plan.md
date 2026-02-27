

## Plan: Smart MCP Tool Sync with Diff Detection

### Problem
Currently, every time you fetch MCP tools, the system marks ALL existing tools as inactive and re-inserts everything. This is wasteful and risky. You also have to login each time just to see tools that are already saved.

### Solution Overview
- On page load: tools load instantly from the database (already works)
- On "Sync Tools" (re-fetch): compare fetched tools against DB, only insert genuinely new tools, update changed ones, and show a summary of what changed
- No duplicates ever -- `tool_name` uniqueness enforced via upsert

### Changes

#### 1. Update `saveToolsToDB()` in `src/hooks/useMCPTools.ts`
Replace the current "mark all inactive then upsert" logic with a smarter diff-based approach:

- Fetch current tools from DB first
- Compare fetched tools against existing by `tool_name`
- Categorize into: **new** (not in DB), **updated** (in DB but description/schema changed), **unchanged**
- Only upsert new + updated tools (keep existing ones active and untouched)
- Return a sync summary: `{ added: string[], updated: string[], unchanged: number }`

#### 2. Update `fetchTools()` in `src/hooks/useMCPTools.ts`
- After fetching from MCP server, call the new smart save function
- Show a toast with the diff summary: "Synced: 3 new tools added, 2 updated, 45 unchanged" instead of just "Loaded 50 tools"
- Merge new tools into the existing state (don't replace the full array)

#### 3. Add `lastSyncedAt` tracking
- Add a `lastSyncedAt` state to the hook, populated from the most recent `updated_at` in the DB
- Return it from the hook so the UI can show "Last synced: 2 hours ago"
- This tells the user whether they need to re-sync or not

#### 4. No schema/migration changes needed
The existing `mcp_tools_master` table already has:
- `tool_name` (unique constraint for upsert)
- `is_active` flag
- `updated_at` timestamp
- `input_schema`, `description`, `endpoint`, `method`

All we need is smarter client-side logic.

### Technical Details

**New `syncToolsToDB()` function (replaces `saveToolsToDB`):**

```text
1. SELECT * FROM mcp_tools_master (get all existing)
2. Build a Map<tool_name, existing_row>
3. For each fetched tool:
   - If tool_name NOT in map -> mark as "new"
   - If tool_name IN map but description/schema differs -> mark as "updated"  
   - Otherwise -> "unchanged"
4. Upsert only new + updated rows (with is_active: true)
5. Return { added: [...], updated: [...], unchanged: count }
```

**Updated toast messages:**
- First ever sync: "Synced 50 MCP tools to database"
- Subsequent sync, no changes: "All 50 tools are up to date"
- Subsequent sync, changes found: "Sync complete: 3 new tools, 2 updated"

### Files Modified
| File | Change |
|------|--------|
| `src/hooks/useMCPTools.ts` | Replace `saveToolsToDB` with `syncToolsToDB`, add diff logic, add `lastSyncedAt` state |

