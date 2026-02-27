

# Embed Pipeline Debugger as a Dashboard Tab

## Problem
The Pipeline Debugger currently opens in a new browser tab (`target="_blank"` link to `/debug/pipeline`). The user wants it embedded within the main dashboard as a regular sidebar tab, like all other views.

## Changes

### 1. Convert sidebar link to a tab button (`CFOQueryResolutionEngine.tsx`)
- Replace the `<a href="/debug/pipeline" target="_blank">` link (line 4444-4447) with a `<button>` that calls `setActiveTab('pipeline-debug')`, styled consistently with the other sidebar buttons
- Keep the "NEW" badge

### 2. Add tab content rendering (`CFOQueryResolutionEngine.tsx`)
- In the main content area (around line 4514+), add a new `{activeTab === 'pipeline-debug' && <PipelineDebugPage />}` block
- Import `PipelineDebugPage` from `@/components/pipeline-debug`

### 3. Adjust PipelineDebugPage styling (`PipelineDebugPage.tsx`)
- Remove the outer `min-h-screen` and standalone header since it will now live inside the dashboard's layout
- Keep the progress bar, step inspector, and all functionality intact
- Adjust background to blend with the dashboard (remove forced `bg-zinc-950` on the outer wrapper, let the parent handle it)

### Technical Details
- **Files modified**: `src/components/CFOQueryResolutionEngine.tsx`, `src/components/pipeline-debug/PipelineDebugPage.tsx`
- No route changes needed -- the `/debug/pipeline` route can remain as a standalone fallback but the primary access is now via the dashboard tab

