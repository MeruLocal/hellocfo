

## Fix: Auto-Save and Append Training Phrases

### Problem
1. **AI-generated phrases replace existing ones** instead of being appended
2. **No auto-save** -- user sees "unsaved changes" banner and must manually click Save
3. The AI prompt already receives existing phrases to avoid duplicates, but the result handling overwrites them

### Changes

#### 1. Append instead of replace (frontend)

**File:** `src/components/CFOQueryResolutionEngine.tsx` (~line 5588)

Change the training phrases result handling from:
```
result.trainingPhrases = data.trainingPhrases;
```
to:
```
result.trainingPhrases = [...(intent.trainingPhrases || []), ...data.trainingPhrases];
```

This merges new AI-generated phrases with existing ones. The prompt already tells the AI to avoid duplicating existing phrases (line 133 of `generate-intent/index.ts`).

Also add deduplication to remove any accidental duplicates after merge.

#### 2. Auto-save after AI generation

**File:** `src/components/CFOQueryResolutionEngine.tsx` (~line 2283-2296, `handleRegenerate`)

After successfully merging the generated content into `editingIntent`, automatically call `onSave` instead of just setting `hasChanges = true`. This removes the need for the user to manually click Save after AI generation.

#### 3. Update UI text

**File:** `src/components/CFOQueryResolutionEngine.tsx` (~line 977)

Change the helper text from "This will replace existing phrases" to "New phrases will be added to existing ones" to reflect the new append behavior.

### What This Fixes
- New AI-generated phrases are appended to existing ones (no data loss)
- Changes are saved automatically after AI generation (no unsaved changes banner)
- UI text accurately describes the behavior

### What Does NOT Change
- The AI prompt and edge function logic remain the same
- Manual add/edit/delete of individual phrases still works as before
- The deduplication in the prompt (passing existing phrases) continues to help the AI avoid generating duplicates
