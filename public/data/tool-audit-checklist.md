# Tool Audit: What Exists vs What's Needed

## Step 1: Run This Query

Run this against your Supabase to get all existing tools:

```sql
-- All write tools (the ones that NEED validation)
SELECT tool_name, module, keywords 
FROM tool_registry 
WHERE is_active = true
  AND (tool_name LIKE 'create_%' 
    OR tool_name LIKE 'update_%' 
    OR tool_name LIKE 'delete_%' 
    OR tool_name LIKE 'void_%' 
    OR tool_name LIKE 'approve_%' 
    OR tool_name LIKE 'send_%')
ORDER BY tool_name;

-- All read tools (the ones pre-req chains depend on)
SELECT tool_name, module, keywords 
FROM tool_registry 
WHERE is_active = true
  AND (tool_name LIKE 'get_%' 
    OR tool_name LIKE 'search_%' 
    OR tool_name LIKE 'list_%'
    OR tool_name LIKE 'find_%')
ORDER BY tool_name;
```

## Step 2: Check Against This Requirement Matrix

The pre-requisite chains in v3 architecture depend on these SPECIFIC read tools.
Mark ✅ if you have it, ❌ if missing:

### Pre-Req Chain: send_invoice
```
Chain: get_invoice → get_contact → [send_invoice]

[ ] get_invoice          — Fetch single invoice by InvoiceId
                           Returns: ContactId, Status, InvoiceNumber, Total
                           Input: { InvoiceId: string }

[ ] get_contact          — Fetch single contact by ContactId  
                           Returns: EmailAddress, Name, Phone
                           Input: { ContactId: string }

[ ] send_invoice         — The actual write tool
                           Input: { InvoiceId: string, EmailAddress?: string }
```

### Pre-Req Chain: create_payment
```
Chain: get_bill_by_number OR get_invoice → get_accounts → [create_payment]

[ ] get_bill_by_number   — Fetch single bill by BillNumber
                           Returns: BillId, ContactId, Total, AmountDue, Status
                           Input: { BillNumber: string }

[ ] get_invoice          — (same as above)

[ ] get_all_invoices     — Search/list invoices with filters
                           Returns: array of invoices
                           Input: { ContactId?, Status?, InvoiceNumber? }

[ ] get_all_bills        — Search/list bills with filters
                           Returns: array of bills
                           Input: { ContactId?, Status?, BillNumber? }

[ ] get_accounts         — List accounts filtered by type
                           Returns: array of accounts with AccountId, Name, BankAccountNumber
                           Input: { Type: 'BANK' | 'REVENUE' | 'EXPENSE' | ... }

[ ] create_payment       — The actual write tool
```

### Pre-Req Chain: void_invoice
```
Chain: get_invoice → [void_invoice]

[ ] get_invoice          — Must return Status field
                           Need to verify: AUTHORISED, PAID, VOIDED, DRAFT, SUBMITTED

[ ] void_invoice         — The actual write tool
                           Input: { InvoiceId: string }
```

### Pre-Req Chain: delete_contact
```
Chain: get_contact → [delete_contact]

[ ] get_contact          — Must return OutstandingBalance field
                           Input: { ContactId: string }

[ ] delete_contact       — The actual write tool
                           Input: { ContactId: string }
```

### Pre-Req Chain: approve_bill
```
Chain: get_bill → [approve_bill]

[ ] get_bill             — Fetch single bill by BillId (NOT by number)
                           Returns: Status, Total, ContactName
                           Input: { BillId: string }
                           
                           ⚠️ This is DIFFERENT from get_bill_by_number
                           get_bill_by_number takes BillNumber (string like "BILL-001")
                           get_bill takes BillId (UUID)
                           YOU MAY NEED BOTH

[ ] approve_bill         — The actual write tool
```

### Pre-Req Chain: update_payment
```
Chain: get_payment → [update_payment]

[ ] get_payment          — Fetch single payment by PaymentId
                           Returns: IsReconciled, Amount, Date, ContactName
                           Input: { PaymentId: string }

[ ] update_payment       — The actual write tool
```

### Pre-Req Chain: create_credit_note
```
Chain: get_invoice → [create_credit_note]

[ ] get_invoice          — Must return Lines[], ContactId, Status
                           For credit note: need original invoice data

[ ] create_credit_note   — The actual write tool
```

### Pre-Req Chain: create_invoice (entity resolution)
```
Chain: search_contacts → get_items → get_tax_rates → [create_invoice]

[ ] search_contacts      — Search contacts by name (fuzzy)
                           Returns: ContactId, Name, EmailAddress
                           Input: { Name: string } or { searchTerm: string }
                           
                           ⚠️ Different from get_contact (which takes ContactId)
                           This searches by NAME for entity resolution

[ ] get_items            — Search items by name
                           Returns: ItemCode, Name, UnitPrice, TaxType
                           Input: { Name?: string } or { searchTerm?: string }
                           
                           ⚠️ Needed to resolve line item codes in create_invoice

[ ] get_tax_rates        — List available tax rates
                           Returns: TaxType, Name, Rate
                           For GST: CGST, SGST, IGST rates

[ ] create_invoice       — The actual write tool
```

### Pre-Req Chain: create_journal_entry
```
Chain: get_accounts → [create_journal_entry]

[ ] get_accounts         — (same as payment chain)
                           Need to resolve account names to AccountIds
                           For journal entries: user says "debit Cash, credit Sales"
                           System needs to resolve "Cash" → AccountId

[ ] create_journal_entry — The actual write tool
                           Input: { Lines: [{ AccountId, DebitAmount?, CreditAmount? }] }
```

## Step 3: Common Missing Tools

Based on typical accounting MCP implementations, these are MOST LIKELY to be missing:

### Probably Missing ❌

```
get_bill (by BillId)     — Most MCPs only have get_bill_by_number or get_all_bills
                           You need a way to fetch a SINGLE bill by its UUID
                           FIX: Either create this tool, or use get_all_bills 
                           with BillId filter

get_payment (by PaymentId) — Most MCPs have list_payments but not get_single_payment
                           FIX: Create this tool, or use list_payments with filter

get_contact (by ContactId) — You might have search_contacts but not get_by_id
                           FIX: Create this tool, or use get_all_customers/vendors 
                           with ContactId filter

approve_bill             — Many MCPs don't expose approval workflows
                           FIX: Check if HelloBooks API supports bill approval,
                           then create the MCP tool

void_invoice             — Some MCPs don't support voiding
                           FIX: Check HelloBooks API
```

### Probably Exists ✅

```
get_all_invoices         — Almost certainly exists
get_all_bills            — Almost certainly exists  
get_accounts             — Almost certainly exists
create_payment           — You showed this working
create_invoice           — You showed this working
search_contacts          — Likely exists as get_all_customers / get_all_vendors
get_items / search_items — Likely exists for inventory
send_invoice             — May or may not exist
```

### Might Exist But With Wrong Input Schema

```
get_invoice              — Might exist but take InvoiceNumber instead of InvoiceId
                           Pre-req chain needs: get by UUID (InvoiceId)
                           If yours takes InvoiceNumber, you need BOTH variants

get_bill_by_number       — Takes BillNumber (string)
get_bill                 — Takes BillId (UUID) ← this one might be missing
```

## Step 4: For Each Missing Tool, Create In MCP

Each missing tool needs:
1. MCP tool definition (name, description, inputSchema)
2. Backend handler that calls HelloBooks API
3. Entry in tool_registry table
4. Test in Pipeline Debugger

Template for a new read tool:

```typescript
// In your MCP server
{
  name: "get_payment",
  description: "Get a single payment by PaymentId. Returns payment details including Amount, Date, ContactName, IsReconciled status, and linked invoices/bills.",
  inputSchema: {
    type: "object",
    properties: {
      PaymentId: { 
        type: "string", 
        description: "The UUID of the payment to retrieve" 
      }
    },
    required: ["PaymentId"]
  }
}
```

And register in tool_registry:

```sql
INSERT INTO tool_registry (tool_name, module, keywords, is_active, description)
VALUES (
  'get_payment',
  'payments',
  ARRAY['payment', 'get', 'fetch', 'retrieve', 'single', 'detail'],
  true,
  'Get single payment by PaymentId with full details'
);
```

## Step 5: Priority Order for Creating Missing Tools

```
Priority 1 (blocks payment flows — your #1 use case):
  [ ] get_bill (by BillId)        — needed by void check, approve check
  [ ] get_payment (by PaymentId)  — needed by update_payment pre-req

Priority 2 (blocks invoice flows):
  [ ] get_invoice (by InvoiceId)  — needed by send, void, credit note chains
  [ ] get_contact (by ContactId)  — needed by send (email check), delete (balance check)

Priority 3 (blocks less common flows):
  [ ] approve_bill                — if HelloBooks API supports it
  [ ] void_invoice                — if HelloBooks API supports it
  [ ] get_tax_rates               — for create_invoice GST compliance
```

## Output

After running the audit query, fill in this table and share it back:

```
| Tool Name            | Exists? | Takes What Input?        | Returns What?           | Notes              |
|----------------------|---------|--------------------------|-------------------------|--------------------|
| get_invoice          |         |                          |                         |                    |
| get_bill             |         |                          |                         |                    |
| get_bill_by_number   |         |                          |                         |                    |
| get_contact          |         |                          |                         |                    |
| get_payment          |         |                          |                         |                    |
| get_accounts         |         |                          |                         |                    |
| get_all_invoices     |         |                          |                         |                    |
| get_all_bills        |         |                          |                         |                    |
| search_contacts      |         |                          |                         |                    |
| get_items            |         |                          |                         |                    |
| get_tax_rates        |         |                          |                         |                    |
| send_invoice         |         |                          |                         |                    |
| void_invoice         |         |                          |                         |                    |
| approve_bill         |         |                          |                         |                    |
| create_payment       |         |                          |                         |                    |
| create_invoice       |         |                          |                         |                    |
| create_bill          |         |                          |                         |                    |
| create_credit_note   |         |                          |                         |                    |
| create_journal_entry |         |                          |                         |                    |
| update_invoice       |         |                          |                         |                    |
| update_bill          |         |                          |                         |                    |
| update_payment       |         |                          |                         |                    |
| delete_contact       |         |                          |                         |                    |
```
