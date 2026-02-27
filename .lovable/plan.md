

## Plan: AI Tool Gap Analysis Panel (using Azure OpenAI)

### Overview
Add a collapsible panel at the bottom of the MCP Tools view that uses your existing Azure OpenAI (GPT-5.2) to analyze your current tool inventory against standard accounting software capabilities and GAAP/IFRS requirements, identifying missing tools you should add.

### Architecture

```text
[MCP Tools View]
       |
       v
[Analyze Gaps button] --> Edge Function (analyze-tool-gaps)
                              |
                              v
                     Azure OpenAI GPT-5.2 (same secrets)
                              |
                              v
                     Structured gap analysis response
                              |
                              v
                     [Gap Analysis Panel - grouped by category]
```

### Changes

#### 1. Create Edge Function: `supabase/functions/analyze-tool-gaps/index.ts`
- Uses existing `OPENAI_GPT_5_2_API_KEY` and `OPENAI_GPT_5_2_BASE_URL` secrets (same as intent generation)
- Receives current tool names from frontend
- Sends a detailed accounting-domain system prompt comparing against: AR, AP, GL, Banking, Inventory, Payroll, Tax/GST, Fixed Assets, Budgeting, Audit Trail, Multi-currency, Reporting
- References standard software capabilities (Tally, QuickBooks, Xero, Zoho Books, SAP)
- Uses tool-calling to return structured output: array of `{ category, priority, missingTools: [{ name, description, rationale }] }`
- Handles 429/402 errors gracefully

#### 2. Modify: `src/components/CFOQueryResolutionEngine.tsx`
- Add a collapsible "AI Tool Gap Analysis" section at the bottom of `MCPToolsView`
- "Analyze Gaps" button triggers the edge function with current tool names
- Results displayed grouped by accounting category with priority badges:
  - **Critical** (red) -- core accounting gaps
  - **Recommended** (amber) -- important but not blocking
  - **Nice-to-have** (blue) -- enhancements
- Loading spinner during analysis
- Results cached in component state

#### 3. Update `supabase/config.toml`
- Add `[functions.analyze-tool-gaps]` with `verify_jwt = false`

### UI Design

```text
+----------------------------------------------------------+
| AI Tool Gap Analysis                    [Analyze Gaps]    |
| Compare your tools against accounting standards           |
+----------------------------------------------------------+
| Fixed Assets (3 missing)                         CRITICAL |
|   - create_fixed_asset: Register new fixed assets         |
|   - depreciation_schedule: Calculate depreciation         |
|   - dispose_asset: Record asset disposal                  |
|                                                           |
| Payroll (2 missing)                          RECOMMENDED  |
|   - process_payroll: Run payroll for employees            |
|   - get_payroll_summary: View payroll reports             |
|                                                           |
| Audit Trail (1 missing)                      NICE-TO-HAVE |
|   - get_audit_log: View change history for records        |
+----------------------------------------------------------+
```

### Files

| File | Action |
|------|--------|
| `supabase/functions/analyze-tool-gaps/index.ts` | **Create** -- Edge function using Azure OpenAI GPT-5.2 |
| `src/components/CFOQueryResolutionEngine.tsx` | **Modify** -- Add gap analysis panel to MCP Tools view |
| `supabase/config.toml` | **Auto-updated** -- Add function entry |

### Technical Details

**Azure OpenAI Integration (same pattern as existing functions):**
- Reads `OPENAI_GPT_5_2_BASE_URL` and `OPENAI_GPT_5_2_API_KEY` from Deno env
- Applies same URL normalization (protocol fix, `/chat/completions` suffix)
- Uses `api-key` header for Azure authentication
- Tool-calling for structured JSON extraction (no raw JSON parsing needed)

**System Prompt Strategy:**
- Lists 15+ standard accounting modules with expected tool coverage
- References GAAP/IFRS requirements for completeness
- Compares against Tally, QuickBooks, Xero, Zoho Books module lists
- Categorizes gaps by priority based on how fundamental the module is

