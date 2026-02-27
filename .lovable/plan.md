

# Sidebar Consolidation Plan

## Current State (11 items)
1. Intent Library
2. MCP Tools
3. Enrichments
4. Business Context
5. Country Config
6. LLM Settings
7. Test Console
8. Analytics & History
9. Master Plan
10. API Console
11. Users (admin only)

This is too flat -- users must scan all 11 items to find what they need.

## Proposed Grouping (6 top-level items)

We will reorganize into **grouped sections** with collapsible sub-items where related tabs are merged under a single parent.

```text
SIDEBAR LAYOUT
--------------
[AI Engine]                        (section label)
  Intent Library         (42)      -- standalone, primary workflow
  Test Console                     -- standalone, primary workflow

[Configuration]                    (section label, collapsible)
  MCP Tools              (156)     -- was standalone
  Enrichments            (8)       -- was standalone
  Business Context                 -- was standalone
  Country Config                   -- was standalone
  LLM Settings                     -- was standalone

[Operations]                       (section label)
  Analytics & History              -- already merged
  API Console                      -- standalone
  Master Plan                      -- standalone

[Admin]                            (section label, admin only)
  Users                            -- admin only
```

### What changes:
- **5 config tabs** (MCP Tools, Enrichments, Business Context, Country Config, LLM Settings) collapse into a single **"Configuration"** group that defaults to collapsed -- these are rarely changed day-to-day
- **Intent Library** and **Test Console** stay prominent at the top as the primary working tabs
- **Operations** groups the monitoring/reference tabs together
- **Admin** section only renders for admin users (already the case, just visually separated)
- Each group uses a section label with a subtle divider -- no nested routing, just visual grouping
- The collapsed "Configuration" group can be expanded with a chevron click to reveal its 5 sub-items

### Benefits:
- Reduces visual scan from 11 flat items to **4 logical groups**
- Most-used items (Intents, Test) are always visible at top
- Rarely-changed config is tucked away but one click to expand
- No functionality removed -- everything stays accessible

## Technical Details

### Files Modified
| File | Change |
|------|--------|
| `src/components/CFOQueryResolutionEngine.tsx` | Replace flat `sidebarTabs.map()` with grouped sections using collapsible config group via Radix Collapsible. Add section labels with dividers. |

### Implementation
- Use the existing `@radix-ui/react-collapsible` (already installed) for the Configuration group
- Add a `configOpen` state boolean, default `false`
- Section labels rendered as small uppercase text (like the conversation sidebar's "Today"/"Yesterday" labels)
- Active tab highlighting works the same way -- if any config sub-item is active, auto-expand the Configuration group
- No new components needed, just restructuring the sidebar JSX in the main render

