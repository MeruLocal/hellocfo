

## Problem Analysis

From the screenshots and logs, there are **two distinct issues** causing incorrect invoice detail responses:

### Issue 1: Created document ID not captured from `create_invoice` response

The `parseCreatedDoc` function (line 120-144) tries to extract the internal ID from the create result by looking at keys: `parsed.data`, `parsed.result`, or the root object. However, the actual `create_invoice` response uses the key `resOfCreation`:

```text
{"message": "Invoice(s) created successfully", "resOfCreation": [{"id": "ad1b7696-...", "InvoiceNumber": "INV-000021", ...}]}
```

Since `parseCreatedDoc` never checks `resOfCreation`, the `internalId` is always `null`. This means when the user asks "give me details for INV-000021", the system can't find the internal ID from session history.

### Issue 2: Detail lookup falls back to list tool with incomplete data

Because the internal ID is missing (Issue 1), the `detailLookupContext` (line 1416) tells the LLM: "Search by the document NUMBER/reference." The LLM then calls `get_invoices` with `invoiceNumber: "INV-000021"`, which is a **list/summary** endpoint. This endpoint returns sparse data -- no customer name, no dates, no line items -- resulting in the "Not available" fields shown in the chatbot.

The correct approach would be to use the internal ID with a detail-specific tool (like `get_invoice_by_id`) that returns the full record.

---

## Fix Plan

### Step 1: Fix `parseCreatedDoc` to handle `resOfCreation` key

**File:** `supabase/functions/cfo-agent-api/index.ts` (lines 128-132)

Update the record extraction logic to also check for `resOfCreation` (and similar response keys like `resOfUpdate`) in addition to `data` and `result`. This ensures the internal ID, document number, and other metadata are correctly captured from create/update tool responses.

```text
Before: const obj = parsed?.data || parsed?.result || parsed || {};
After:  const obj = parsed?.data || parsed?.result || parsed?.resOfCreation || parsed?.resOfUpdate || parsed || {};
         // Then handle array: const record = Array.isArray(obj) ? obj[0] : obj;
```

### Step 2: Improve detail lookup context to prefer ID-based lookups

**File:** `supabase/functions/cfo-agent-api/index.ts` (lines 1404-1418)

When the internal ID IS found (after Step 1 fix), the existing context already instructs the LLM to use the detail tool with the internal ID -- this path is correct.

When the internal ID is NOT found (e.g., document from a previous session), improve the fallback context to explicitly tell the LLM to:
1. First try a detail/view tool with the document number
2. Only fall back to the list tool if no detail tool exists

### Step 3: Redeploy `cfo-agent-api`

Deploy the updated edge function.

---

## What This Fixes

- "Customer: Not available" -- will now show the actual customer name
- "Issued date: Not available" -- will now show the real date  
- "No line items visible" -- the detail tool returns full line item data
- Future detail lookups for recently created documents will use the fast internal ID path instead of the slow list-search path

## What Does NOT Change

- No changes to tool selection, routing, or sanitization logic
- No changes to the MCP client or pagination system
- No frontend changes needed

