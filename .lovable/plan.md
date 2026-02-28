

# AI-Suggested Ideal Pipeline Feature

## Overview
Add an "AI Suggest Ideal Pipeline" section inside the Data Pipeline tab that uses AI (via Lovable AI gateway) to analyze the current intent and generate an optimal, best-in-class data pipeline. The AI considers five financial personas: Bookkeeper, Accountant, CFO, Business Owner, and Financial Adviser.

## How It Works
1. User clicks a "Suggest Ideal Pipeline" button (with a Sparkles icon) in the Data Pipeline header area
2. The system sends the intent name, description, training phrases, entities, current pipeline, and available MCP tools to a backend function
3. AI analyzes what a world-class financial chatbot would need for that intent across all 5 personas
4. Results appear in a collapsible panel below the header showing:
   - A persona-aware analysis summary (which personas benefit most)
   - The suggested ideal pipeline steps in a visual card layout
   - Each step shows: node type, tool name, output variable, description, and a "persona relevance" badge
   - An "Apply Suggested Pipeline" button to replace the current pipeline with the AI suggestion
   - A "Merge" button to add only missing steps to the existing pipeline

## Visual Design
- Purple/violet themed section (to differentiate from the blue Check Tools and orange AI Badge)
- Collapsible panel with a gradient header showing "AI Ideal Pipeline" with persona icons
- Each suggested node displayed as a card with tool availability status (cross-checked against MCP inventory)
- Missing tools flagged with amber warning + fallback suggestion

## Technical Details

### 1. New Edge Function: `supabase/functions/suggest-ideal-pipeline/index.ts`
- Accepts: intent name, description, training phrases, entities, current pipeline, available MCP tool names
- Uses Lovable AI gateway (`google/gemini-3-flash-preview`) -- no extra API key needed
- System prompt instructs the AI to think as 5 personas and design the most comprehensive pipeline
- Returns structured JSON via tool calling: array of suggested pipeline nodes with persona tags
- Handles 429/402 errors gracefully

### 2. UI Changes in `src/components/CFOQueryResolutionEngine.tsx` (DataPipelineTab)
- Add state: `suggestedPipeline`, `isSuggesting`, `showSuggestion`
- Add "Suggest Ideal Pipeline" button next to "Check Tools"
- Add collapsible results panel between the tool check banner and the pipeline nodes
- Panel shows:
  - Persona relevance summary (5 small badges: Bookkeeper, Accountant, CFO, Owner, Adviser)
  - Suggested pipeline steps as read-only cards with node type icons
  - Each card shows tool availability status (green check / amber warning)
  - "Apply All" button replaces current pipeline
  - "Merge Missing" button adds only steps not already present
  - "Dismiss" button to close

### 3. AI Prompt Strategy
The system prompt will instruct the model to:
- Analyze the intent from 5 financial personas' perspectives
- Suggest pre-requisite data fetches (e.g., fetching vendor list before analyzing spend)
- Include computation nodes for KPIs, ratios, and trend calculations
- Add conditional nodes for threshold-based branching (e.g., alert if cash runway < 3 months)
- Only reference tools from the provided MCP inventory list
- Flag where tools are missing and suggest workarounds
- Return structured output with persona relevance tags per step
