

# Auto-Save AI-Generated Content (Remove Manual Save for AI Actions)

## Problem
When the AI regenerates content (training phrases, entities, pipeline steps, etc.) via the "Regenerate" button inside the Intent Detail Screen, the changes are held in local state and require the user to manually click the "Save" button. AI-generated content should auto-save immediately.

## What Already Auto-Saves (No Change Needed)
- AI Pipeline Suggestions (via `autoSaveAISuggestion`) -- already auto-saves to DB
- AI Intent Generator Modal (`AIIntentGeneratorModal`) -- saves directly to DB on generation

## What Needs Fixing
The `handleRegenerate` function in `IntentDetailScreen` sets `hasUnsavedChanges = true` after AI regeneration, forcing users to manually click "Save". This should auto-save instead.

## Changes

### File: `src/components/CFOQueryResolutionEngine.tsx`

**1. Update `handleRegenerate` to auto-save after AI regeneration**

In the `IntentDetailScreen` component, modify `handleRegenerate` so that after receiving AI-generated updates, it immediately calls `onSave` with the merged intent instead of just setting `hasUnsavedChanges = true`.

```typescript
const handleRegenerate = async (section?: string) => {
  setIsRegenerating(true);
  try {
    const updates = await onRegenerate(intent.id, section);
    if (updates) {
      const updatedIntent = { ...intent, ...updates };
      setIntent(updatedIntent);
      // Auto-save AI-generated content immediately
      onSave(updatedIntent);
      // No need to set hasUnsavedChanges since it's already saved
    }
  } finally {
    setIsRegenerating(false);
  }
};
```

**2. Keep the Save button for manual (non-AI) edits only**

The Save button remains for when users manually edit fields (description, name, etc.), but AI regeneration no longer triggers the "Unsaved changes" state. No UI changes needed -- the button simply won't activate after AI actions since `hasUnsavedChanges` won't be set.

### Summary
- One function change in `IntentDetailScreen.handleRegenerate` (lines ~2904-2914)
- AI regeneration results auto-persist to the database immediately
- Manual edits still use the existing Save button workflow
- No new files, no database changes

