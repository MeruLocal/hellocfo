# Munimji (HelloCFO) — Definitive Architecture v3

> **For:** Lovable Development Team
> **Date:** 27 Feb 2026
> **Status:** Phase 0 (Training Phrases) → Phase 0.5 (MCQ + Enrichment) → Phase 1 (BGE-M3) → Phase 2 (Write Fixes)
> **Model:** BGE-M3 (568M params, built on XLM-RoBERTa, 100+ languages including Hindi/Hinglish)
> **Core Principle:** Every clarification = MCQ buttons. User never types twice. Enrichment on every data response.

### v3 Change Summary (from v2)

| Area | v2 | v3 |
|---|---|---|
| **Ambiguous intent** | LLM guesses from 2 tool groups | MCQ: user clicks the right intent |
| **Multiple entity matches** | LLM asks open-ended question | MCQ: user clicks the right customer/vendor |
| **Missing parameters** | LLM asks "which period?" as text | MCQ: user clicks "This Month" / "This FY" |
| **Write operations** | Executes immediately | MCQ: confirmation card before every create/update/delete |
| **Large result sets** | Dumps everything | MCQ: filter/narrow options after first page |
| **Enrichment (Step 10)** | 8 thin rule checks | 12-type compute engine + layered LLM injection |
| **Steps** | 12 steps | 14 steps (added 4.5, 6.5, 6.6) |

---

## 🔴 Ruthless Mentor — Current State Assessment

### What's broken right now

**1. Your 1000+ intents are ghosts.**
You have 1000+ intents in the database. Most show "Pending Generation" — zero training phrases. The intent matching system (Step 4) is dead code for ~95% of queries. Everything falls through to keyword matching → LLM decides everything.

**2. You have a "Generate with AI" button. Use it.**
Lovable already built the infrastructure to auto-generate training phrases from intent name + description. This is Phase 0. Until you bulk-generate phrases for all 1000+ intents, no classifier — BGE-M3, XLM-RoBERTa, or anything — can help you.

**3. Your current intent matching is substring comparison.**
From your own gap analysis: "No fuzzy matching", "No synonym handling", "No semantic understanding", "Substring matching is fragile." This isn't a gap — this is a fundamental architectural hole.

**4. 6 features exist in code but aren't connected.**
- `selectModelTier()` exists → never called
- `response-cache.ts` exists → not used
- Intent entities defined → never extracted
- Resolution flow defined → only partly used (dataPipeline)
- Enrichments in intent config → auto-apply does its own detection
- RL logger tracks patterns → no action taken on the data

**5. You're paying Azure OpenAI to answer "hello".**
Every greeting, every "thank you", every "ok" hits your LLM. With 1000+ intents properly embedded, these should cost $0 and take 100ms.

### What this document fixes

This document replaces the previous architecture docs. It accounts for:
- The REAL file structure (classifier.ts, tool-groups.ts, enrichment-auto-apply.ts, rl-logger.ts)
- The REAL 12-step flow from your system doc
- 1000+ intents with mostly empty training phrases
- BGE-M3 as the primary classifier (not XLM-RoBERTa — see model decision below)
- All write tool fixes mapped to exact functions and files
- Debug traceability at every step

---

## Part 1: Why BGE-M3 (Not XLM-RoBERTa)

We initially planned XLM-RoBERTa as a fine-tuned classifier. That approach works for 50 intents. You have 1000+. The math changes completely.

### The Problem with Fine-Tuned Classifiers at 1000+ Classes

| Factor | Fine-tuned classifier | Embedding search (BGE-M3) |
|---|---|---|
| 1000+ class accuracy | 70-80% (class confusion) | 90-95% (similarity is independent of class count) |
| Training data needed | 15,000+ labeled phrases MINIMUM | Same phrases, but NO TRAINING step |
| Add 1 new intent | Retrain entire model (30-60 min) | Embed its phrases (~2 seconds) |
| Remove/modify intent | Retrain entire model | Delete/update embeddings |
| 950 intents with 0 phrases | Cannot train at all | Cannot search at all (same dependency) |
| Maintenance | Weekly retrain pipeline | Zero — auto-syncs with DB |
| Model hosting | Python + ONNX on Fly.io | Python + BGE-M3 on Fly.io (or Supabase native) |

### BGE-M3 Specifics

| Property | Value |
|---|---|
| Full name | BAAI General Embedding - Multi-lingual, Multi-functional, Multi-granularity |
| Architecture | XLM-RoBERTa backbone (so you get all the Hinglish benefits) |
| Parameters | 568M |
| Embedding dimension | 1024 |
| Max tokens | 8,192 (more than enough for short queries) |
| Languages | 100+ (including Hindi, English, Hinglish code-mixed) |
| Retrieval modes | Dense + Sparse + Multi-vector (we use dense) |
| Inference time | ~100-150ms per query embedding |
| Vector search time | ~5-10ms across 15,000 vectors (pgvector) |

### How It Works for Intent Classification

```
OFFLINE (once, then on every intent update):
  For each intent:
    For each training_phrase:
      → BGE-M3 embeds phrase → 1024-dim vector
      → Store in intent_embeddings table (pgvector)

RUNTIME (every user query):
  1. BGE-M3 embeds user query → 1024-dim vector        (~100ms)
  2. pgvector finds nearest training phrase vectors      (~5ms)
  3. Return top-5 intent matches with similarity scores  (~0ms)
  4. Route based on similarity + confidence gap           (~0ms)
  Total: ~105-155ms
```

---

## Part 2: Phase 0 — Generate Training Phrases (DO THIS FIRST)

Nothing works without training phrases. Your Lovable UI has "Generate with AI" which creates phrases from intent name + description.

### Bulk Generation Strategy

```
Step 1: Count current state
  SELECT 
    COUNT(*) as total_intents,
    COUNT(*) FILTER (WHERE array_length(training_phrases, 1) > 0) as has_phrases,
    COUNT(*) FILTER (WHERE array_length(training_phrases, 1) IS NULL 
                        OR array_length(training_phrases, 1) = 0) as empty_phrases
  FROM intents WHERE is_active = true;

Step 2: Bulk generate via your existing AI generation
  For each intent with 0 phrases:
    → Use the "Generate with AI" feature (generate 15 phrases per intent)
    → This uses intent name + description to generate

Step 3: Add Hinglish variants
  For each intent, add 3-5 Hinglish training phrases:
    "show all invoices" → "sab invoices dikhao"
    "create a payment" → "payment banao" / "payment record karo"
    "what is my balance" → "mera balance kya hai"

Step 4: Add edge cases
  - Misspellings: "invoce", "invioce", "recievables"
  - Abbreviations: "P&L", "BS", "TB", "GST", "TDS"
  - Short commands: "invoices", "bills list", "payments"
  - Questions: "kitne invoices pending hain?"
  - With context: "last month ke invoices", "this quarter ka P&L"
```

### Target Numbers

| Category | Intents (est.) | Phrases per intent | Total phrases |
|---|---|---|---|
| Core accounting (invoices, bills, payments) | ~100 | 20 | 2,000 |
| Reports (P&L, BS, CF, TB, etc.) | ~80 | 15 | 1,200 |
| GST/Tax compliance | ~60 | 15 | 900 |
| Customer/Vendor management | ~50 | 15 | 750 |
| Banking/Reconciliation | ~40 | 15 | 600 |
| Inventory | ~30 | 15 | 450 |
| System intents (greeting, thanks, etc.) | ~20 | 20 | 400 |
| Other modules | ~620+ | 10 | 6,200+ |
| **TOTAL** | **1000+** | **~12 avg** | **~12,500+** |

### Automation Script for Bulk AI Generation

The Lovable admin panel's "Generate with AI" button calls an API. You need a script that calls this for every intent with 0 phrases:

```typescript
// bulk-generate-phrases.ts — Run this once
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function bulkGeneratePhrases() {
  // Get all intents with 0 or null training phrases
  const { data: emptyIntents } = await supabase
    .from('intents')
    .select('id, name, description, module_id, sub_module_id')
    .or('training_phrases.is.null,training_phrases.eq.{}')
    .eq('is_active', true);

  console.log(`Found ${emptyIntents.length} intents with no training phrases`);

  for (const intent of emptyIntents) {
    console.log(`Generating for: ${intent.name} (${intent.id})`);
    
    // Call your existing AI generation endpoint
    // (This is whatever the "Generate with AI" button calls)
    const response = await fetch(`${YOUR_API_URL}/generate-training-phrases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SERVICE_TOKEN}` },
      body: JSON.stringify({
        intentId: intent.id,
        intentName: intent.name,
        description: intent.description,
        count: 15,  // Generate 15 phrases per intent
        includeHinglish: true  // If your generator supports this
      })
    });

    if (response.ok) {
      console.log(`  ✅ Generated phrases for: ${intent.name}`);
    } else {
      console.error(`  ❌ Failed for: ${intent.name} — ${response.status}`);
    }

    // Rate limit: wait 500ms between calls
    await new Promise(r => setTimeout(r, 500));
  }
}

bulkGeneratePhrases();
```

### Quality Check After Generation

```sql
-- Verify phrase distribution
SELECT 
  CASE 
    WHEN array_length(training_phrases, 1) IS NULL THEN '0 phrases'
    WHEN array_length(training_phrases, 1) < 5 THEN '1-4 phrases'
    WHEN array_length(training_phrases, 1) < 10 THEN '5-9 phrases'
    WHEN array_length(training_phrases, 1) < 15 THEN '10-14 phrases'
    ELSE '15+ phrases'
  END as phrase_bucket,
  COUNT(*) as intent_count
FROM intents WHERE is_active = true
GROUP BY 1 ORDER BY 1;

-- Intents still missing phrases (should be 0 after bulk generation)
SELECT name, description 
FROM intents 
WHERE is_active = true 
  AND (training_phrases IS NULL OR array_length(training_phrases, 1) = 0);
```

---

## Part 3: Phase 1 — BGE-M3 Integration

### Database Changes

#### 3.1 Enable pgvector

```sql
-- Enable pgvector extension (Supabase supports this natively)
CREATE EXTENSION IF NOT EXISTS vector;
```

#### 3.2 Create intent_embeddings table

```sql
CREATE TABLE intent_embeddings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  intent_id UUID NOT NULL REFERENCES intents(id) ON DELETE CASCADE,
  phrase TEXT NOT NULL,
  embedding vector(1024) NOT NULL,  -- BGE-M3 output dimension
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- HNSW index for fast approximate nearest neighbor search
-- This is what makes search across 15,000 vectors take ~5ms
CREATE INDEX idx_intent_embeddings_vector 
  ON intent_embeddings 
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Index for cleanup operations
CREATE INDEX idx_intent_embeddings_intent_id ON intent_embeddings(intent_id);

-- Unique constraint: no duplicate phrase per intent
CREATE UNIQUE INDEX idx_intent_embeddings_unique 
  ON intent_embeddings(intent_id, phrase);
```

#### 3.3 Create query_routing_logs table

```sql
CREATE TABLE query_routing_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  trace_id TEXT NOT NULL,
  query TEXT NOT NULL,
  entity_id TEXT,
  org_id TEXT,
  
  -- Embedding search results
  routing_strategy TEXT NOT NULL,
  -- 'embedding_direct' | 'embedding_canned' | 'embedding_ambiguous' | 
  -- 'embedding_low_confidence' | 'embedding_unavailable' | 'keyword_fallback'
  
  embedding_intent TEXT,
  embedding_similarity DECIMAL(5,4),
  embedding_confidence_gap DECIMAL(5,4),  -- gap between #1 and #2
  embedding_top5 JSONB,                   -- top 5 matches for debugging
  embedding_inference_ms DECIMAL(8,2),
  
  -- Legacy matching (Step 4 current)
  keyword_category TEXT,                  -- from classifier.ts
  db_matched_intent TEXT,                 -- from current substring matching
  
  -- Tool selection
  tool_selection_strategy TEXT,
  tools_selected TEXT[],
  tools_executed TEXT[],
  
  -- Write tool tracking
  write_tools_called INTEGER DEFAULT 0,
  write_tools_succeeded INTEGER DEFAULT 0,
  write_tools_failed INTEGER DEFAULT 0,
  preflight_blocked TEXT[],
  guardrail_action TEXT,
  
  -- LLM usage
  llm_calls_count INTEGER DEFAULT 0,
  llm_calls_skipped INTEGER DEFAULT 0,   -- calls saved by embedding direct route
  llm_model TEXT,
  llm_total_tokens INTEGER,
  
  -- Performance
  total_response_ms INTEGER,
  step_timings JSONB,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_routing_logs_strategy ON query_routing_logs(routing_strategy, created_at);
CREATE INDEX idx_routing_logs_intent ON query_routing_logs(embedding_intent, created_at);
CREATE INDEX idx_routing_logs_entity ON query_routing_logs(entity_id, created_at);
```

#### 3.3b MCQ pending state table ⭐ NEW (v3)

Every time the system needs clarification, it sends an MCQ card and pauses the flow. The pending state is stored here so the flow can resume when the user clicks an option.

```sql
CREATE TABLE mcq_pending_states (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL,
  mcq_id UUID NOT NULL UNIQUE,
  trigger_type TEXT NOT NULL,
  -- 'intent_disambiguation' | 'entity_resolution' | 'missing_parameter' | 
  -- 'write_confirmation' | 'filter_choice'
  trigger_step INTEGER NOT NULL,        -- which step triggered: 4, 6, 8, 9
  original_query TEXT NOT NULL,
  pending_state JSONB NOT NULL,         -- everything needed to resume
  status TEXT DEFAULT 'pending',        -- 'pending' | 'resolved' | 'expired'
  created_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  selected_option_ids TEXT[],           -- what user clicked (filled on resolve)
  expires_at TIMESTAMPTZ DEFAULT now() + INTERVAL '30 minutes'
);

CREATE INDEX idx_mcq_conv ON mcq_pending_states(conversation_id, status);
CREATE INDEX idx_mcq_id ON mcq_pending_states(mcq_id);

-- Add MCQ tracking to routing logs
ALTER TABLE query_routing_logs 
  ADD COLUMN mcq_triggered BOOLEAN DEFAULT false,
  ADD COLUMN mcq_type TEXT,
  ADD COLUMN mcq_resolution_ms INTEGER;

-- Auto-expire stale MCQs
CREATE OR REPLACE FUNCTION cleanup_expired_mcqs()
RETURNS void AS $$
  UPDATE mcq_pending_states SET status = 'expired' WHERE status = 'pending' AND expires_at < now();
$$ LANGUAGE sql;
```

#### 3.4 DB Trigger: Auto-embed on intent changes

```sql
-- Function to mark embeddings as stale when training phrases change
CREATE OR REPLACE FUNCTION notify_intent_embedding_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Delete old embeddings for this intent (they'll be regenerated)
  DELETE FROM intent_embeddings WHERE intent_id = NEW.id;
  
  -- Insert a job into an embedding_jobs queue (or use pg_notify)
  INSERT INTO embedding_jobs (intent_id, status, created_at)
  VALUES (NEW.id, 'pending', now())
  ON CONFLICT (intent_id) 
  DO UPDATE SET status = 'pending', created_at = now();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_intent_embedding_update
  AFTER INSERT OR UPDATE OF training_phrases, name, description
  ON intents
  FOR EACH ROW
  EXECUTE FUNCTION notify_intent_embedding_update();

-- Jobs table for tracking embedding generation
CREATE TABLE embedding_jobs (
  intent_id UUID PRIMARY KEY REFERENCES intents(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending',  -- 'pending' | 'processing' | 'completed' | 'failed'
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);
```

### BGE-M3 Embedding Service

#### 3.5 FastAPI Service (deploy to Fly.io)

```python
# app.py — BGE-M3 Embedding Service
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer
import numpy as np
import time
import os

app = FastAPI(title="Munimji Intent Embedding Service")

# Load BGE-M3 model at startup
# This takes ~30s on first load, then stays in memory
print("Loading BGE-M3 model...")
model = SentenceTransformer('BAAI/bge-m3')
print(f"Model loaded. Embedding dimension: {model.get_sentence_embedding_dimension()}")


class EmbedRequest(BaseModel):
    texts: list[str]  # 1 or more texts to embed
    instruction: str = "Represent this sentence for searching relevant passages: "


class EmbedResponse(BaseModel):
    embeddings: list[list[float]]
    dimension: int
    inference_ms: float


class HealthResponse(BaseModel):
    status: str
    model: str
    dimension: int


@app.get("/health", response_model=HealthResponse)
async def health():
    return HealthResponse(
        status="healthy",
        model="BAAI/bge-m3",
        dimension=model.get_sentence_embedding_dimension()
    )


@app.post("/embed", response_model=EmbedResponse)
async def embed(request: EmbedRequest):
    if not request.texts:
        raise HTTPException(400, "texts array cannot be empty")
    if len(request.texts) > 100:
        raise HTTPException(400, "Maximum 100 texts per request")
    
    start = time.time()
    
    # BGE-M3 recommends prepending instruction for queries
    # For storing training phrases, use texts as-is (no instruction prefix)
    texts_to_embed = request.texts
    
    embeddings = model.encode(
        texts_to_embed,
        normalize_embeddings=True,  # L2 normalize for cosine similarity
        batch_size=32
    )
    
    elapsed_ms = (time.time() - start) * 1000
    
    return EmbedResponse(
        embeddings=embeddings.tolist(),
        dimension=embeddings.shape[1],
        inference_ms=round(elapsed_ms, 2)
    )


@app.post("/embed-query")
async def embed_query(request: EmbedRequest):
    """
    Embed a user query with the search instruction prefix.
    Use this for runtime query embedding.
    BGE-M3 performs better when queries have the instruction prefix.
    """
    if len(request.texts) != 1:
        raise HTTPException(400, "embed-query accepts exactly 1 text")
    
    start = time.time()
    
    query_with_instruction = f"{request.instruction}{request.texts[0]}"
    
    embedding = model.encode(
        [query_with_instruction],
        normalize_embeddings=True
    )
    
    elapsed_ms = (time.time() - start) * 1000
    
    return {
        "embedding": embedding[0].tolist(),
        "dimension": embedding.shape[1],
        "inference_ms": round(elapsed_ms, 2)
    }
```

```dockerfile
# Dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install dependencies
RUN pip install --no-cache-dir \
    fastapi==0.115.0 \
    uvicorn==0.30.0 \
    sentence-transformers==3.0.0 \
    torch==2.3.0 --index-url https://download.pytorch.org/whl/cpu

COPY app.py .

# Pre-download model during build (so cold starts are fast)
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('BAAI/bge-m3')"

EXPOSE 8080

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080"]
```

```toml
# fly.toml
app = "munimji-embeddings"
primary_region = "bom"  # Mumbai — closest to your India users

[build]
  dockerfile = "Dockerfile"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = false   # Keep warm — no cold starts
  auto_start_machines = true
  min_machines_running = 1

[vm]
  memory = "2gb"   # BGE-M3 needs ~1.5GB RAM
  cpu_kind = "shared"
  cpus = 2
```

```
Deploy:
  fly launch --name munimji-embeddings --region bom
  fly deploy
```

### Embedding Sync Worker

#### 3.6 Sync Script: Embed all training phrases

```typescript
// embed-sync-worker.ts
// Run this: (1) once initially for all intents, (2) via cron every 5 min for pending jobs

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);
const EMBED_SERVICE_URL = process.env.EMBED_SERVICE_URL!; // e.g., https://munimji-embeddings.fly.dev

interface Intent {
  id: string;
  name: string;
  training_phrases: string[];
}

async function embedTexts(texts: string[]): Promise<number[][]> {
  const response = await fetch(`${EMBED_SERVICE_URL}/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texts })
  });
  
  if (!response.ok) {
    throw new Error(`Embed service error: ${response.status}`);
  }
  
  const data = await response.json();
  return data.embeddings;
}

async function syncIntentEmbeddings(intent: Intent): Promise<void> {
  const phrases = intent.training_phrases || [];
  if (phrases.length === 0) {
    console.log(`  ⚠️ ${intent.name}: No training phrases, skipping`);
    return;
  }

  // Delete existing embeddings for this intent
  await supabase
    .from('intent_embeddings')
    .delete()
    .eq('intent_id', intent.id);

  // Embed all phrases in batches of 50
  const batchSize = 50;
  let totalInserted = 0;

  for (let i = 0; i < phrases.length; i += batchSize) {
    const batch = phrases.slice(i, i + batchSize);
    const embeddings = await embedTexts(batch);

    // Insert into intent_embeddings
    const rows = batch.map((phrase, idx) => ({
      intent_id: intent.id,
      phrase: phrase,
      embedding: JSON.stringify(embeddings[idx])  // pgvector accepts JSON array
    }));

    const { error } = await supabase
      .from('intent_embeddings')
      .insert(rows);

    if (error) {
      console.error(`  ❌ Insert error for ${intent.name}: ${error.message}`);
    } else {
      totalInserted += rows.length;
    }
  }

  console.log(`  ✅ ${intent.name}: Embedded ${totalInserted} phrases`);
}

// ──── Main: Full sync (run once) ────
async function fullSync() {
  console.log('Starting full embedding sync...');
  
  const { data: intents, error } = await supabase
    .from('intents')
    .select('id, name, training_phrases')
    .eq('is_active', true)
    .not('training_phrases', 'is', null);

  if (error) throw error;
  
  console.log(`Found ${intents.length} active intents with phrases`);

  for (const intent of intents) {
    await syncIntentEmbeddings(intent);
  }

  console.log('Full sync complete!');
  
  // Log stats
  const { count } = await supabase
    .from('intent_embeddings')
    .select('*', { count: 'exact', head: true });
  
  console.log(`Total embeddings in DB: ${count}`);
}

// ──── Incremental: Process pending jobs (run every 5 min via cron) ────
async function processJobQueue() {
  const { data: jobs } = await supabase
    .from('embedding_jobs')
    .select('intent_id')
    .eq('status', 'pending')
    .limit(20);

  if (!jobs || jobs.length === 0) return;

  console.log(`Processing ${jobs.length} pending embedding jobs`);

  for (const job of jobs) {
    await supabase
      .from('embedding_jobs')
      .update({ status: 'processing' })
      .eq('intent_id', job.intent_id);

    const { data: intent } = await supabase
      .from('intents')
      .select('id, name, training_phrases')
      .eq('id', job.intent_id)
      .single();

    if (intent) {
      try {
        await syncIntentEmbeddings(intent);
        await supabase
          .from('embedding_jobs')
          .update({ status: 'completed', completed_at: new Date().toISOString() })
          .eq('intent_id', job.intent_id);
      } catch (err) {
        await supabase
          .from('embedding_jobs')
          .update({ status: 'failed', error: err.message })
          .eq('intent_id', job.intent_id);
      }
    }
  }
}

// Entry point
const mode = process.argv[2] || 'full';
if (mode === 'full') fullSync();
else if (mode === 'queue') processJobQueue();
```

### Edge Function Integration

#### 3.7 classifyWithEmbedding() — New function for index.ts

```typescript
// Add to: supabase/functions/cfo-agent-api/index.ts
// (or create as supabase/functions/_shared/embedding-classifier.ts)

const EMBED_SERVICE_URL = Deno.env.get("EMBED_SERVICE_URL");
const EMBEDDING_CONFIDENCE_THRESHOLD = 0.85;
const EMBEDDING_AMBIGUITY_GAP = 0.10;
const EMBEDDING_TIMEOUT_MS = 2000;

interface EmbeddingMatch {
  intent_name: string;
  intent_id: string;
  phrase: string;
  similarity: number;
  resolution_flow: any;
  module_id: string;
  sub_module_id: string;
}

interface EmbeddingClassification {
  matches: EmbeddingMatch[];
  topSimilarity: number;
  confidenceGap: number;
  routingStrategy: string;
  inferenceMs: number;
}

// ── System intent canned responses ──
const CANNED_RESPONSES: Record<string, string> = {
  'greeting': '🙏 Namaste! Main Munimji hoon, aapka AI accounting assistant. Aaj main aapki kya seva kar sakta hoon?',
  'farewell': 'Dhanyavaad! Agar aur kuch chahiye toh main yahan hoon. 🙏',
  'thanks': 'Seva mein hazir hoon! Aur kuch help chahiye toh batayein. 🙏',
  'unclear': 'Seth ji, thoda aur detail mein batayein? Main samajhna chahta hoon ki aapko kya chahiye.',
  'capabilities': 'Main aapki accounting se related bahut saari cheezein kar sakta hoon:\n\n• Invoices, Bills, Payments dekhna aur banana\n• GST returns aur compliance\n• P&L, Balance Sheet, Cash Flow reports\n• Customer/Vendor management\n• Bank reconciliation\n• Inventory tracking\n\nBas boliye, kya karna hai! 🙏'
};

const SYSTEM_INTENTS = new Set(Object.keys(CANNED_RESPONSES));

async function classifyWithEmbedding(
  query: string,
  supabaseClient: any,
  traceId: string
): Promise<EmbeddingClassification | null> {
  const startTime = Date.now();
  
  try {
    // Step 1: Get query embedding from BGE-M3 service
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), EMBEDDING_TIMEOUT_MS);
    
    const embedResponse = await fetch(`${EMBED_SERVICE_URL}/embed-query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts: [query] }),
      signal: controller.signal
    });
    
    clearTimeout(timeout);
    
    if (!embedResponse.ok) {
      console.warn(`[Step-4][${traceId}] Embedding service error: ${embedResponse.status}`);
      return null;
    }
    
    const { embedding, inference_ms: embedMs } = await embedResponse.json();
    
    // Step 2: Search nearest intent embeddings via pgvector
    // Using Supabase RPC for vector similarity search
    const { data: matches, error } = await supabaseClient.rpc(
      'match_intent_embeddings',
      {
        query_embedding: JSON.stringify(embedding),
        match_count: 5,
        similarity_threshold: 0.5  // Low threshold — we'll filter in code
      }
    );
    
    if (error) {
      console.warn(`[Step-4][${traceId}] pgvector search error: ${error.message}`);
      return null;
    }
    
    const inferenceMs = Date.now() - startTime;
    
    if (!matches || matches.length === 0) {
      console.log(`[Step-4][${traceId}] Embedding: No matches found | ${inferenceMs}ms`);
      return {
        matches: [],
        topSimilarity: 0,
        confidenceGap: 0,
        routingStrategy: 'embedding_low_confidence',
        inferenceMs
      };
    }
    
    // Step 3: Deduplicate by intent (take highest similarity per intent)
    const intentMap = new Map<string, EmbeddingMatch>();
    for (const match of matches) {
      const existing = intentMap.get(match.intent_name);
      if (!existing || match.similarity > existing.similarity) {
        intentMap.set(match.intent_name, match);
      }
    }
    
    const dedupedMatches = Array.from(intentMap.values())
      .sort((a, b) => b.similarity - a.similarity);
    
    const topSimilarity = dedupedMatches[0]?.similarity || 0;
    const secondSimilarity = dedupedMatches[1]?.similarity || 0;
    const confidenceGap = topSimilarity - secondSimilarity;
    
    // Step 4: Determine routing strategy
    let routingStrategy: string;
    const topIntent = dedupedMatches[0]?.intent_name || '';
    
    if (topSimilarity >= 0.90 && SYSTEM_INTENTS.has(topIntent)) {
      routingStrategy = 'embedding_canned';
    } else if (topSimilarity >= EMBEDDING_CONFIDENCE_THRESHOLD && confidenceGap >= EMBEDDING_AMBIGUITY_GAP) {
      routingStrategy = 'embedding_direct';
    } else if (topSimilarity >= EMBEDDING_CONFIDENCE_THRESHOLD && confidenceGap < EMBEDDING_AMBIGUITY_GAP) {
      routingStrategy = 'embedding_ambiguous';
    } else {
      routingStrategy = 'embedding_low_confidence';
    }
    
    console.log(
      `[Step-4][${traceId}] Embedding: "${query}" → ${topIntent} (${topSimilarity.toFixed(3)}) ` +
      `gap=${confidenceGap.toFixed(3)} | route=${routingStrategy} | ${inferenceMs}ms`
    );
    
    return {
      matches: dedupedMatches,
      topSimilarity,
      confidenceGap,
      routingStrategy,
      inferenceMs
    };
    
  } catch (err) {
    const inferenceMs = Date.now() - startTime;
    
    if (err.name === 'AbortError') {
      console.warn(`[Step-4][${traceId}] Embedding: TIMEOUT after ${EMBEDDING_TIMEOUT_MS}ms`);
    } else {
      console.warn(`[Step-4][${traceId}] Embedding: ERROR ${err.message}`);
    }
    
    return null;  // Graceful fallback — continue with existing flow
  }
}
```

#### 3.8 pgvector RPC function

```sql
-- Create this in Supabase SQL Editor
CREATE OR REPLACE FUNCTION match_intent_embeddings(
  query_embedding vector(1024),
  match_count INT DEFAULT 5,
  similarity_threshold FLOAT DEFAULT 0.5
)
RETURNS TABLE (
  intent_id UUID,
  intent_name TEXT,
  phrase TEXT,
  similarity FLOAT,
  resolution_flow JSONB,
  module_id UUID,
  sub_module_id UUID
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    i.id as intent_id,
    i.name as intent_name,
    ie.phrase,
    (1 - (ie.embedding <=> query_embedding))::FLOAT as similarity,
    i.resolution_flow,
    i.module_id,
    i.sub_module_id
  FROM intent_embeddings ie
  JOIN intents i ON i.id = ie.intent_id
  WHERE i.is_active = true
    AND (1 - (ie.embedding <=> query_embedding)) >= similarity_threshold
  ORDER BY ie.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

---

## Part 4: Updated 14-Step Flow (with BGE-M3 + MCQ + Enrichment)

Every step has: **Input → Process → Output → Error → Debug Log**

MCQ = Multiple Choice Question card. User clicks a button instead of typing. Flow pauses and resumes on click.

```
TRACE FORMAT: [Step-N][traceId] message
Generate traceId: crypto.randomUUID().slice(0, 8)
```

### Step 0: MCQ Response Handler ⭐ NEW — runs BEFORE Step 1

```
FILE: index.ts (top of request handler — first thing checked)

INPUT:  request body

PROCESS:
  IF body.query === '__MCQ_RESPONSE__' AND body.mcq_response exists:
    a. Load pending MCQ state: mcq_pending_states WHERE mcq_id = body.mcq_response.mcq_id
    b. If expired or not found → return error "Session expired, please ask again"
    c. Mark MCQ as resolved (status='resolved', selected_option_ids)
    d. Route to correct resume point based on trigger_type:

       'intent_disambiguation' (from Step 4):
         → Selected intent becomes the "direct" match
         → Resume from Step 5 (MCP connect) with selected intent
         
       'entity_resolution' (from Step 6.5):
         → Inject resolved entity (id, name) into flow context
         → Resume from Step 7 (tool selection) with resolved entity
         
       'missing_parameter' (from Step 6.6):
         → Add resolved param to param bag
         → If more params missing → send another MCQ
         → If all resolved → Resume from Step 7
         
       'write_confirmation' (from Step 9):
         → 'confirm' → execute the write tool now
         → 'modify' → ask LLM to help user change details
         → 'cancel' → respond "Cancelled. No changes made."
         
       'filter_choice' (from Step 9):
         → Apply selected filter and re-present results

  ELSE:
    → Continue to Step 1 (normal flow)

LOG: [Step-0][{traceId}] MCQ Resume: type={trigger_type} selection={selected_option_ids}
```

### Step 1: HTTP Receive + Auth

```
FILE: index.ts (request handler)

INPUT:  POST /cfo-agent-api { query, conversationId, conversationHistory, entityId, orgId, attachments }
        Authorization: Bearer <jwt>
        H-Authorization: <mcp-creds>

PROCESS:
  a. Extract JWT from Authorization header
  b. supabase.auth.getUser(token) → validate
  c. Parse request body
  d. Generate traceId = crypto.randomUUID().slice(0, 8)

OUTPUT: { user, query, entityId, orgId, mcpCreds, traceId }

ERROR:
  - 401: Invalid token → return error
  - 400: Missing body → return error

LOG: [Step-1][{traceId}] Request: "{query}" entity={entityId} org={orgId}
```

### Step 2: Load Conversation + LLM Config

```
FILE: index.ts

INPUT:  conversationId, supabase client

PROCESS:
  a. Load LLM config: llm_configs WHERE is_default = true
  b. If conversationId: Load from unified_conversations (last 20 messages)
  c. Extract pending state: pendingTool, pendingArgs, pendingPagination

OUTPUT: { llmConfig, conversationHistory, pendingState }

ERROR:
  - No LLM config → hardcoded fallback
  - DB error on history → empty history

LOG: [Step-2][{traceId}] Config: model={llmConfig.model} history={history.length}
```

### Step 3: Query Classification (classifier.ts)

```
FILE: _shared/classifier.ts

INPUT:  query

PROCESS:
  a. Check GENERAL_CHAT_PATTERNS → is it a greeting/thanks/chitchat?
  b. Check FINANCIAL_KEYWORDS (17 sub-categories) → is it accounting-related?
  c. Return: { category: 'general_chat' | 'unified', confidence, subCategory, matchedKeywords }

OUTPUT: { category, confidence, subCategory }

NOTE: This step is KEPT for backward compatibility.
      Embedding classification (Step 4) takes priority when available.
      classifier.ts becomes the last-resort fallback.

LOG: [Step-3][{traceId}] Keyword: category={category} sub={subCategory} keywords=[{matchedKeywords}]
```

### Step 4: BGE-M3 Embedding Classification ⭐ NEW

```
FILE: index.ts (calls _shared/embedding-classifier.ts)

INPUT:  query, supabase client, traceId

PROCESS:
  a. POST {EMBED_SERVICE_URL}/embed-query → get 1024-dim vector
  b. supabase.rpc('match_intent_embeddings', { query_embedding, top: 5 })
  c. Deduplicate by intent (highest similarity per intent)
  d. Calculate: topSimilarity, confidenceGap
  e. Determine routing strategy

OUTPUT: {
  matches: [{ intent_name, similarity, resolution_flow, tools }],
  routingStrategy,
  topSimilarity,
  confidenceGap
}

ROUTING DECISION:
  ┌─────────────────────────────────────────────────────────────────┐
  │                                                                 │
  │  "embedding_canned"                                             │
  │  similarity >= 0.90 AND intent is system (greeting/thanks/etc.) │
  │  → Return canned response immediately                          │
  │  → SKIP Steps 5, 6, 7, 8, 9, 10                               │
  │  → Jump to Step 11 (stream canned response)                    │
  │                                                                 │
  │  "embedding_direct"                                             │
  │  similarity >= 0.85 AND gap >= 0.10                             │
  │  → Use intent's resolution_flow.dataPipeline tools              │
  │  → SKIP Step 8 (1st LLM call) — we know which tools to call    │
  │  → Jump to Step 9 (execute tools directly)                     │
  │                                                                 │
  │  "embedding_ambiguous"                                          │
  │  similarity >= 0.85 AND gap < 0.10 (two intents are close)     │
  │  → ⭐ SEND MCQ: show top 2-3 intents as clickable options      │
  │  → PAUSE flow — save state to mcq_pending_states               │
  │  → User clicks one → resume as "embedding_direct"              │
  │  → NEVER let LLM guess between close intents                   │
  │                                                                 │
  │  "embedding_low_confidence"                                     │
  │  similarity < 0.85                                              │
  │  → Full standard flow (Steps 5-12)                             │
  │                                                                 │
  │  "embedding_unavailable"                                        │
  │  Service timeout or error                                       │
  │  → Full standard flow (Steps 5-12) — never breaks             │
  │                                                                 │
  └─────────────────────────────────────────────────────────────────┘

ERROR:
  - Timeout (>2s) → return null → standard flow continues
  - HTTP error → return null → standard flow continues
  - NEVER crashes the request

LOG:
  [Step-4][{traceId}] Embedding: "{query}" → {intent} ({similarity}) gap={gap} route={strategy} {ms}ms
  [Step-4][{traceId}] Embedding: TIMEOUT → fallback
  [Step-4][{traceId}] Embedding: UNAVAILABLE → fallback
```

### Step 5: MCP Connection

```
FILE: _shared/mcp-client.ts

INPUT:  mcpCreds, entityId, orgId

PROCESS:
  a. new StreamableMCPClient(baseUrl, authToken, entityId, orgId)
  b. client.initialize() → JSON-RPC { method: "initialize" }
  c. client.listTools() → JSON-RPC { method: "tools/list" }

OUTPUT: mcpClient, mcpTools[]

OPTIMIZATION: 🚨 Cache listTools() result!
  - Key: `mcp_tools:${entityId}:${orgId}`
  - TTL: 5 minutes
  - Tools don't change per-request — caching saves ~200-300ms

SKIP IF: routingStrategy === "embedding_canned" (no tools needed)

LOG: [Step-5][{traceId}] MCP: connected tools={mcpTools.length} {ms}ms
```

### Step 6: Intent Matching — Layer 1 (EXISTING, now secondary)

```
FILE: index.ts (inline intent matching logic)

INPUT:  query, supabase client

PROCESS:
  a. Load active intents from DB
  b. Substring/equality matching against training_phrases
  c. If matched: use adaptive threshold from intent_routing_stats

OUTPUT: matchedIntent (supplements Step 4 results)

NOTE: This step is now SECONDARY to Step 4 (embedding).
  - If Step 4 returned high confidence → Step 6 is for validation only
  - If Step 4 returned low confidence → Step 6 adds another signal
  - Long term: remove this step entirely when embedding is proven

LOG: [Step-6][{traceId}] Intent-DB: {matchedIntent?.name || 'none'} ({confidence})
```

### Step 6.5: Entity Resolution ⭐ NEW (v3)

```
FILE: _shared/entity-resolver.ts (NEW)

PURPOSE: When user says "invoices for Tata" and 3 contacts match "Tata",
         show an MCQ instead of letting LLM guess or ask open-ended.

INPUT:  query, resolvedIntent, entityId, supabaseClient

PROCESS:
  a. Check what entity types the resolved intent expects:
     - InvoicesByCustomer → expects 'customer'
     - BillsByVendor → expects 'vendor'
     - StockItemBalance → expects 'item'
     - AccountLedgerTransactions → expects 'account'
     (Map stored in intent resolution_flow.expectedEntities)

  b. Extract search term from query using intent entity patterns
     e.g., "invoices for Tata Motors" → searchTerm = "Tata Motors"
     e.g., "{{customerName}} ke bills" → extract the non-template part

  c. Fuzzy search in relevant table:
     contacts WHERE name ILIKE '%{searchTerm}%' AND contact_type = '{type}'
     items WHERE name ILIKE '%{searchTerm}%'
     accounts WHERE name ILIKE '%{searchTerm}%'

  d. DECISION:
     0 matches  → no entity found, let LLM handle (maybe wrong intent)
     1 match    → AUTO-RESOLVE, inject into flow, continue
     1 dominant  → score >= 0.95 AND gap > 0.15 → AUTO-RESOLVE
     2+ close   → ⭐ SEND MCQ with matches as options → PAUSE

MCQ CARD EXAMPLE:

  ┌─────────────────────────────────────────────────────────┐
  │ 👤 Multiple customers match "Tata". Which one?          │
  │                                                         │
  │  ⭐ Tata Motors Ltd                           [Click]   │
  │     GSTIN: 27AABCT1234F1ZV · Mumbai                    │
  │                                                         │
  │     Tata Steel Ltd                            [Click]   │
  │     GSTIN: 20AABCT5678G1ZV · Jamshedpur                │
  │                                                         │
  │     Tata Consultancy Services                 [Click]   │
  │     GSTIN: 27AABCT9012H1ZV · Mumbai                    │
  │                                                         │
  │     All Tata entities                         [Click]   │
  │                                                         │
  │     Other...                                 [Type ↗]   │
  └─────────────────────────────────────────────────────────┘

MCQ SSE EVENT:
  {
    type: 'mcq',
    data: {
      mcq_id: '<uuid>',
      question: 'Multiple customers match "Tata". Which one?',
      options: [
        { id: '<contact-uuid>', label: 'Tata Motors Ltd', 
          sublabel: 'GSTIN: 27AABCT1234F1ZV · Mumbai',
          icon: 'customer', is_recommended: true, value: { id, name, type: 'customer' } },
        ...
      ],
      style: 'single_select',
      allow_custom: true,
      metadata: { trigger_step: 6, trigger_type: 'entity_resolution', ... }
    }
  }

PENDING STATE SAVED:
  {
    entity_type, matched_entities, search_term,
    resolved_intent, embedding_result, routing_strategy
  }

ON RESUME (user clicks):
  → Inject { resolved_entity: { id, name, type } } into flow context
  → LLM receives: "User is asking about {entity_type} '{name}' (ID: {id})"
  → Resume from Step 7 (tool selection)

OUTPUT: 
  - resolved: { entity_type, id, name } → continue to Step 6.6
  - OR: MCQ sent → flow PAUSED

LOG: [Step-6.5][{traceId}] Entity: {type}="{searchTerm}" → {matches.length} found → {RESOLVED|MCQ|NONE}
```

### Step 6.6: Parameter Resolution ⭐ NEW (v3)

```
FILE: _shared/parameter-resolver.ts (NEW)

PURPOSE: When user says "show P&L" without specifying period, 
         show an MCQ with period options instead of LLM asking open-ended.

INPUT:  query, resolvedIntent, entityResolution (from 6.5)

PROCESS:
  a. Load parameter configs for resolvedIntent:
     Each intent declares which params it needs + whether they have
     finite MCQ-able options:

     PARAM CONFIGS (key examples):
     ┌───────────────────┬──────────┬────────────────────────────────────────────┐
     │ Intent            │ Param    │ MCQ Options                                │
     ├───────────────────┼──────────┼────────────────────────────────────────────┤
     │ ProfitAndLoss     │ period   │ This Month · Last Month · This Quarter ·   │
     │ CashFlowStatement │ period   │ This FY · Last FY · Custom                 │
     │ BalanceSheet      │ period   │ (same period options)                      │
     │ GSTR1Summary      │ period   │ (same period options)                      │
     │ AgedReceivables   │ basis    │ Due Date · Invoice Date                    │
     │ InvoicesByStatus  │ status   │ Awaiting Payment · Overdue · Paid · Draft  │
     │ PaymentsReceived  │ mode     │ Cash · UPI · Bank Transfer · Cheque · All  │
     │ StockByWarehouse  │ location │ (fetched from DB: warehouse list)          │
     │ ProfitAndLoss     │ scope    │ Overall · By Project · By Location         │
     └───────────────────┴──────────┴────────────────────────────────────────────┘

  b. For each required param, try EXTRACTION from natural language first:
     - "P&L for this month" → period extracted = 'this_month' → NO MCQ needed
     - "last quarter ka GSTR-1" → period extracted = 'last_quarter' → NO MCQ needed
     - "show P&L" → no period found → MCQ needed
     
     Extraction regex patterns:
       /this month|is mahine/i → this_month
       /last month|pichle mahine/i → last_month
       /this quarter/i → this_quarter
       /this year|this fy|is saal/i → this_fy
       /ytd/i → ytd
       /overdue/i → status:overdue
       /draft/i → status:draft
       /paid/i → status:paid

  c. DECISION:
     All required params extracted → continue to Step 7 (no MCQ)
     Missing param with default value → use default, continue
     Missing required param with finite options → ⭐ SEND MCQ → PAUSE

MCQ CARD EXAMPLE (period):

  ┌─────────────────────────────────────────────────────────┐
  │ 📅 Which period for the Profit & Loss report?           │
  │                                                         │
  │     This Month (Feb 2026)                     [Click]   │
  │     Last Month (Jan 2026)                     [Click]   │
  │     This Quarter (Jan-Mar 2026)               [Click]   │
  │  ⭐ This Financial Year (Apr 25 - Mar 26)     [Click]   │
  │     Last Financial Year (Apr 24 - Mar 25)     [Click]   │
  │                                                         │
  │     Custom range...                          [Type ↗]   │
  └─────────────────────────────────────────────────────────┘

MCQ CARD EXAMPLE (status):

  ┌─────────────────────────────────────────────────────────┐
  │ 📋 Which invoice status are you looking for?            │
  │                                                         │
  │  ⭐ Awaiting Payment                          [Click]   │
  │     Overdue                                   [Click]   │
  │     Paid                                      [Click]   │
  │     Draft                                     [Click]   │
  │     All Statuses                              [Click]   │
  └─────────────────────────────────────────────────────────┘

ON RESUME (user clicks):
  → Add resolved param to param bag
  → If MORE required params missing → send ANOTHER MCQ (chain)
  → If all resolved → inject params into LLM context, resume Step 7

OUTPUT:
  - all params resolved → { period: {...}, status: '...', basis: '...' } → continue
  - OR: MCQ sent → flow PAUSED

LOG: [Step-6.6][{traceId}] Params: extracted=[{found}] missing=[{missing}] → {RESOLVED|MCQ}
```

### Step 7: Tool Selection (tool-groups.ts)

```
FILE: _shared/tool-groups.ts

INPUT:  query, mcpTools, embeddingResult (from Step 4), matchedIntent (from Step 6),
        resolvedEntity (from Step 6.5), resolvedParams (from Step 6.6)  ← NEW inputs

PROCESS:
  IF routingStrategy === "embedding_direct":
    → Extract tools from intent's resolution_flow.dataPipeline
    → Map to MCP tool names
    → Done (skip keyword matching)

  ELSE IF routingStrategy === "embedding_ambiguous":
    → This should NOT happen here — Step 4 should have sent MCQ
    → If it does (edge case): Extract tools from TOP 2 intents' resolution_flows
    → Merge tool lists
    → Done (LLM picks from narrowed set)

  ELSE (low_confidence / unavailable):
    → Original keyword matching: selectToolsForQuery()
    → Scan query for keyword triggers → match categories
    → Expand related categories
    → If no match → default 12 categories
    → If 0 tools resolve → ALL MCP tools (last resort)

  THEN:
    → Supplement with matchedIntent.dataPipeline tools (if any)
    → Convert to OpenAI function-calling format

OUTPUT: { filteredTools, selectedToolNames, strategy }

LOG: [Step-7][{traceId}] Tools: strategy={strategy} selected=[{names}] count={count}
```

### Step 8: Build Prompt + First LLM Call

```
FILE: _shared/model-selector.ts (prompt) + index.ts (LLM call)

SKIP IF: routingStrategy === "embedding_direct" or "embedding_canned"

INPUT:  llmConfig, filteredTools, conversationHistory, query,
        resolvedEntity (from Step 6.5), resolvedParams (from Step 6.6)  ← NEW

PROCESS:
  a. Build system prompt: SYSTEM_PROMPT
       + WRITE_TOOL_GUIDANCE          ← FIX 2
       + ACCOUNT_SEARCH_GUIDANCE      ← FIX 4
       + enrichment instructions
       + confirmation context (if pendingTool exists)
       + ⭐ RESOLVED ENTITY CONTEXT (NEW):
         IF resolvedEntity: append "User is asking about {type} '{name}' (ID: {id}). 
         Use this ID directly in tool calls — do NOT search again."
       + ⭐ RESOLVED PARAMS CONTEXT (NEW):
         IF resolvedParams: append "User specified: period={...}, status={...}. 
         Use these values directly."

  b. messages = [...history.slice(-15), { role: 'user', content: query }]

  c. POST Azure OpenAI /responses
     → tools: filteredTools (OpenAI function format)

OUTPUT:
  A. finish_reason: "stop" → LLM responded directly → Step 10
  B. finish_reason: "tool_calls" → [{name, arguments}] → Step 9

LOG: [Step-8][{traceId}] LLM-1: finish={reason} tool_calls=[{names}] tokens={usage} {ms}ms
     [Step-8][{traceId}] LLM-1: SKIPPED (embedding_direct)
```

### Step 9: Tool Execution Loop

```
FILE: index.ts (executeToolCall function)

INPUT:  tool_calls (from Step 8 or direct from Step 4), mcpClient

PROCESS:
  while (has_tool_calls AND iterations < 10):

    For each tool_call:
      a. Parse tool name and arguments
      b. sanitizeToolArgs() → strip empty strings, null, empty arrays
      c. injectScopeIds() → add entity_id, org_id
      d. injectPaginationDefaults() → limit:15, page:1

      ★ FIX 2B: PRE-FLIGHT VALIDATION
      e. validateWriteToolArgs(toolName, finalArgs)
         IF fails → return error to LLM, don't call MCP
         Required fields:
           create_payment: Applications[], Amount, AccountId
           create_invoice: Lines[], ContactId
           create_bill: Lines[], ContactId
           create_credit_note: Lines[], ContactId

      ★ MCQ WRITE CONFIRMATION ⭐ NEW (v3)
      e2. IF tool is create_/update_/delete_/void_/approve_/send_:
          → Build human-readable summary of what will happen:
            create_payment → "💰 Record payment of ₹50,000 from Tata Motors against INV-0042"
            create_invoice → "📄 Create invoice for Reliance | 3 line items | Total: ₹2.5L"
            create_bill    → "📋 Record bill from TCS | 2 items | Total: ₹1.8L"
            void_invoice   → "🚫 Void invoice INV-0042 — cannot be undone"
            delete_*       → "🗑️ Delete {record} — cannot be undone"
            approve_bill   → "✅ Approve bill BILL-0015 for payment processing"
            send_invoice   → "📧 Send invoice INV-0042 to client@email.com"
          
          → Send MCQ:
            ┌──────────────────────────────────────────────┐
            │ Please confirm this action:                   │
            │                                              │
            │ 💰 Record payment of ₹50,000 from            │
            │    Tata Motors against INV-0042               │
            │                                              │
            │  ⭐ ✅ Yes, proceed                 [Click]   │
            │     ✏️ Modify details               [Click]   │
            │     ❌ Cancel                        [Click]   │
            └──────────────────────────────────────────────┘
          
          → Save tool_name + tool_args in pending state
          → PAUSE flow — return immediately
          
          → On resume (user clicks "Yes, proceed"):
            Execute the tool for real → continue to Step 10
          → On resume (user clicks "Modify"):
            LLM asks what to change → user types → rebuild tool args → MCQ again
          → On resume (user clicks "Cancel"):
            Respond "Cancelled. No changes made." → done

      f. mcpClient.callTool(name, finalArgs)
         Write tools: 60s timeout, 2 retries
         Read tools: 30s timeout, 1 retry

      ★ FIX 3: TRACK WRITE TOOL RESULTS
      g. IF tool is create_/update_/delete_:
           parseWriteToolResult() → { success, error }
           Push to writeToolResults[]

      h. SSE: sendEvent('tool_result', { tool, success, records })
      i. Push result to messages array

      ★ LARGE RESULT SET MCQ ⭐ NEW (v3)
      j. IF read tool returns > 50 results AND query doesn't say "all":
         → Show first 15 results normally
         → THEN send MCQ:
           ┌──────────────────────────────────────────┐
           │ Showing 15 of 247 results.                │
           │ Want to narrow down?                      │
           │                                           │
           │     Show all results              [Click] │
           │     Only overdue items            [Click] │
           │     High value (>₹1L)             [Click] │
           │     Export full list              [Click] │
           └──────────────────────────────────────────┘

    THEN:
      → Call LLM again with updated messages
      → If more tool_calls → loop
      → If "stop" → exit

  FOR EMBEDDING_DIRECT PATH:
    → Pick primary tool from resolution_flow.dataPipeline
    → Execute directly (no LLM to decide which tool)
    → Make SINGLE LLM call to format response
    → Saves 800-2000ms

OUTPUT: { responseText, writeToolResults[], toolExecutionLog[] }

LOG:
  [Step-9][{traceId}] Tool: {name}({args}) → ✅|❌ records={n} {ms}ms
  [Step-9][{traceId}] Tool: {name} BLOCKED by pre-flight: missing [{fields}]
  [Step-9][{traceId}] Tool: {name} → MCQ write_confirmation sent → PAUSED
  [Step-9][{traceId}] Loop: iteration={i}/{max}
```

### Step 10: Enhanced Enrichment Engine ⭐ EXPANDED (v3)

```
FILE: _shared/enrichment-auto-apply.ts (MAJOR REWRITE)

PURPOSE: Transform raw MCP data into CFO-grade insights BEFORE the LLM formats it.
         Two layers: computational enrichment (free) + LLM presentation instructions.

INPUT:  toolName, toolResults (raw MCP data), resolvedIntent, resolvedParams

LAYER 1 — DATA ENRICHMENT (computed, zero LLM cost):

  ┌──────────────────────────────────────────────────────────────────────────────┐
  │ #  │ Enrichment Type       │ Trigger Condition            │ What It Adds    │
  ├──────────────────────────────────────────────────────────────────────────────┤
  │ 1  │ Currency Formatting   │ Any amount fields detected   │ ₹ lakhs/crores  │
  │    │                       │                              │ totals, averages │
  │ 2  │ Aging/Overdue         │ due_date field exists        │ days_overdue,    │
  │    │                       │                              │ aging bucket,    │
  │    │                       │                              │ overdue count/amt│
  │ 3  │ Trend Analysis        │ date field + 3+ rows         │ MoM change %,   │
  │    │                       │                              │ growth direction │
  │ 4  │ Ranking + Conc.       │ 3+ rows with amounts         │ rank, % of total│
  │    │                       │                              │ top-3 conc. risk │
  │ 5  │ Budget Variance       │ budget + actual fields       │ variance amt/%,  │
  │    │                       │                              │ over/under flag  │
  │ 6  │ GST/Tax Compliance    │ GST/TDS related intent       │ rate breakdown,  │
  │    │                       │                              │ CGST+SGST split  │
  │ 7  │ Inventory Health      │ Stock/Inventory intent        │ reorder alerts,  │
  │    │                       │                              │ stock value,     │
  │    │                       │                              │ dead stock days  │
  │ 8  │ Cash Flow Impact      │ Payment/Cash intent          │ net cash impact, │
  │    │                       │                              │ vs prior period  │
  │ 9  │ Percentage of Total   │ 2+ rows with amounts         │ each row's % of │
  │    │                       │                              │ total shown      │
  │ 10 │ Alert Flags           │ any threshold breach         │ critical/warning │
  │    │                       │                              │ severity flags   │
  │ 11 │ Period Comparison     │ P&L, CF, BS intents          │ vs last period   │
  │    │                       │                              │ delta amounts    │
  │ 12 │ Payment Behavior      │ Customer/Vendor payments     │ on-time %, avg   │
  │    │                       │                              │ days to pay      │
  └──────────────────────────────────────────────────────────────────────────────┘

  OUTPUT of Layer 1:
  {
    original_data: <raw MCP results>,
    computed_fields: [
      { field: '__days_overdue', applied_to: 'each_row' },
      { field: '__overdue_bucket', applied_to: 'each_row' },
      { field: '__pct_of_total', applied_to: 'each_row' }
    ],
    aggregates: [
      { label: 'Total Outstanding', value: 1542000, type: 'sum' },
      { label: 'Overdue Items', value: 12, type: 'count' },
      { label: 'Overdue Amount', value: 845000, type: 'sum' },
      { label: 'MoM Change', value: '+8.3%', type: 'percentage' },
      { label: 'Top 3 Concentration', value: '67.2%', type: 'percentage' },
      { label: 'Average', value: 128500, type: 'avg' }
    ],
    flags: [
      { severity: 'critical', message: '3 invoices overdue by 90+ days totaling ₹4.2L', items: ['INV-41','INV-38','INV-35'] },
      { severity: 'warning', message: 'Top 3 customers = 67% of revenue — high concentration risk' }
    ]
  }

LAYER 2 — PRESENTATION ENRICHMENT (injected into LLM prompt):

  Build additional system prompt instructions that tell the LLM HOW to present:

  a. Amount formatting:
     "FORMAT ALL AMOUNTS in Indian notation. Use ₹, lakhs (L) for >=1,00,000 
      and crores (Cr) for >=1,00,00,000. Always 2 decimal places."

  b. Alert-first structure (if flags exist):
     "START with alert summary: {N} critical, {N} warning items. 
      THEN data. END with 1-2 actionable recommendations."

  c. Ranking instruction (if ranking enrichment applied):
     "Present sorted by {amountField} descending with rank numbers.
      Show each item's % of total. Flag top-3 concentration if >70%."

  d. Aging instruction (if aging enrichment applied):
     "Show aging bucket summary (0-30, 31-60, 61-90, 90+ days).
      Flag 90+ day items as CRITICAL. Show bucket-wise totals."

  e. Trend instruction (if trend enrichment applied):
     "Show MoM change as +X.X% or -X.X%. Note direction — growing, 
      declining, or stable. Compare against same period last year if available."

  f. Variance instruction (if budget enrichment applied):
     "Show budget vs actual with variance column. 
      RED for >10% over budget. GREEN for under budget."

  g. Tax instruction (if GST enrichment applied):
     "Show CGST + SGST or IGST split. Show tax-inclusive and exclusive 
      separately. Flag 0% tax on non-exempt items."

  h. Inventory instruction (if stock enrichment applied):
     "Show stock qty alongside reorder level. Flag below-reorder as CRITICAL.
      Show stock value = qty × avg cost. For dead stock show days since last movement."

  i. Pre-computed summary injection:
     "INCLUDE THESE PRE-COMPUTED SUMMARIES IN YOUR RESPONSE:
      - Total Outstanding: ₹15.42L
      - Overdue Items: 12
      - MoM Change: +8.3%
      (these are already calculated — present them, don't recalculate)"

  j. CFO communication style (ALWAYS applied):
     "You are Munimji — a trusted CFO advisor. Be concise and actionable.
      Lead with the most important number. Use Indian numbering.
      If data reveals risk or opportunity, say it directly.
      End with 1-2 actionable recommendations when relevant."

OUTPUT: enrichedData { computed_fields, aggregates, flags, enrichment_instructions[] }

INTEGRATION WITH STEP 11:
  The enrichment_instructions[] array is appended to the system prompt
  before the LLM formatting call. The aggregates and flags are also
  included as structured context so the LLM doesn't have to compute them.

LOG: [Step-10][{traceId}] Enrichment: {computed_fields.length} fields, 
     {aggregates.length} aggregates, {flags.length} flags ({critical}/{warning}),
     {enrichment_instructions.length} LLM instructions applied
```

### Step 11: Response Processing + Guardrails

```
FILE: index.ts (post-processing block)

INPUT:  responseText from LLM, writeToolResults[]

PROCESS:
  a. Standard guardrails (existing):
     - Fake success card blocking
     - parseCreatedDoc extraction
     - Document number validation
     - ```params``` block extraction → extraction_state events
     - ```card``` block stripping

  ★ FIX 3B: REVERSE GUARDRAIL (NEW)
  b. IF writeToolResults has failures:
     - Scan for false success patterns ("payment created", "✅", etc.)
     - IF detected → REPLACE with honest error message

  c. IF writeToolResults has successes:
     - Scan for false failure patterns ("couldn't create", "unable to")
     - IF detected → REPLACE with success confirmation

  d. IF pre-flight blocked a tool:
     - Check if LLM still claims success
     - IF yes → replace with "I need more info" message

OUTPUT: finalResponseText (guaranteed accurate)

LOG:
  [Step-11][{traceId}] Guardrail: {action} writes={success}/{total}
  [Step-11][{traceId}] Guardrail: REPLACED false success → error
```

### Step 12: Stream + Persist + Log

```
FILE: index.ts (SSE + DB writes)

INPUT:  finalResponseText, metadata

PROCESS:
  a. Stream in 50-char chunks via SSE
  b. sendComplete() with full metadata:
     - routing_strategy (from Step 4)
     - embedding_intent, embedding_similarity
     - tools used, LLM calls count
     - execution time
  c. Upsert to unified_conversations
  d. Insert to query_routing_logs (NEW)
  e. Log to rl-logger (intent routing stats, LLM patterns)
  f. Close MCP client + SSE stream

LOG: [Step-12][{traceId}] Done: route={strategy} intent={intent} tools=[{used}] llm_calls={n} time={ms}ms
```

---

## Part 5: Write Tool Fixes (Independent of Embedding Work)

These go into production NOW, before BGE-M3 is ready.

### Fix 2: System Prompt Guidance

**File:** `_shared/model-selector.ts` — append to SYSTEM_PROMPT:

```
## CRITICAL: Write Tool Rules

### create_payment
- Applications[] is MANDATORY — links payment to invoice(s)
- Format: [{"InvoiceId": "<uuid>", "AmountApplied": <number>}]
- ALWAYS fetch invoice first to get InvoiceId — never guess
- AccountId (bank account) is also required — fetch from get_accounts if unsure
- WORKFLOW: get_invoice_by_number → get_accounts → create_payment

### create_invoice / create_bill
- Lines[] is MANDATORY — never create with empty line items
- Each line: { Description, Quantity, UnitAmount }
- Include GST/tax type if applicable

### Account Search
- Don't assume exact name matches
- If search returns empty: list all accounts, try shorter search terms
- "HDFC" not "HDFC Bank Current Account"
```

### Fix 2B: Pre-flight Validation

**File:** `index.ts` — add before mcpClient.callTool():

```typescript
const WRITE_TOOL_VALIDATIONS: Record<string, { field: string; message: string; mustBeNonEmptyArray?: boolean }[]> = {
  create_payment: [
    { field: 'Applications', message: 'Fetch invoice first using get_all_invoices to get InvoiceId', mustBeNonEmptyArray: true },
    { field: 'Amount', message: 'Payment amount is required' },
    { field: 'AccountId', message: 'Fetch bank account using get_accounts' }
  ],
  create_invoice: [
    { field: 'Lines', message: 'Line items required: [{Description, Quantity, UnitAmount}]', mustBeNonEmptyArray: true },
    { field: 'ContactId', message: 'Fetch customer using get_all_customers' }
  ],
  create_bill: [
    { field: 'Lines', message: 'Line items required', mustBeNonEmptyArray: true },
    { field: 'ContactId', message: 'Fetch vendor using get_all_vendors' }
  ],
  create_credit_note: [
    { field: 'Lines', message: 'Line items required', mustBeNonEmptyArray: true },
    { field: 'ContactId', message: 'ContactId is required' }
  ]
};
```

If validation fails → return error to LLM as tool result → LLM self-corrects on next loop iteration.

### Fix 3 + 3B: Write Tool Tracking + Reverse Guardrail

**File:** `index.ts` — track every write tool success/failure, then cross-check against LLM's response text. See previous code document for full implementation.

---

## Part 6: Debug Backtracking Guide

### "Wrong response to user"

```
[Step-11] → Did guardrail replace text? What was original?
[Step-9]  → Which tools executed? Any failures?
[Step-8]  → What tool_calls did LLM request? Correct tools?
[Step-7]  → Were correct tools available to LLM?
[Step-4]  → What intent was matched? Was routing correct?
[Step-3]  → What keyword category was detected?
```

### "Payment creation failed"

```
[Step-9]  → Pre-flight blocked? → Check if LLM retried with correct args
[Step-9]  → What args sent to create_payment? → Applications present?
[Step-9]  → What did MCP return? → Parse error message
[Step-11] → Did guardrail catch false success? → If not, add pattern
[Step-8]  → Did system prompt include WRITE_TOOL_GUIDANCE?
```

### "Query went to wrong intent"

```
[Step-4]  → What did embedding return? Top 5 matches?
          → Similarity score → If wrong intent has highest, need better training phrases
          → Confidence gap → If gap < 0.10, intents are too similar
[Step-6]  → What did substring matching say? Agree or disagree?
[Step-7]  → Even if intent wrong, did tools end up correct?
```

### "Slow response (>5s)"

```
[Step-4]  → Embedding inference time? → If >200ms, check Fly.io health
[Step-5]  → MCP connect time? → If >500ms, implement listTools cache
[Step-8]  → 1st LLM time? → If skipped (embedding_direct), good
[Step-9]  → How many loop iterations? → >3 means LLM is struggling
[Step-9]  → Individual tool call times? → Any MCP call >1s?
```

### "New intent not being matched"

```
[Step-4]  → Is the intent in intent_embeddings table?
          → Check: SELECT COUNT(*) FROM intent_embeddings WHERE intent_id = '<id>'
          → If 0: training phrases haven't been embedded yet
          → Check embedding_jobs for status
[Phase 0] → Does the intent have training phrases at all?
          → If not: generate them first
```

---

## Part 7: Response Time Targets

| Route | Steps Hit | Target | Currently |
|---|---|---|---|
| **Canned** (greeting) | 0→1→2→3→4→12 | **<200ms** | ~2-3s ❌ |
| **Embedding Direct** (known query) | 0→1→2→3→4→5→7→9→10→11→12 | **<1.5s** | ~2.5-5s ❌ |
| **MCQ Sent** (any clarification) | 0→1→2→3→4→(6.5 or 6.6)→PAUSE | **<500ms** | N/A (new) |
| **MCQ Resume** (user clicked) | 0→7→9→10→11→12 | **<1.5s** | N/A (new) |
| **Standard/Fallback** (unknown) | All steps | **<5s** | ~3-8s ⚠️ |

---

## Part 8: Monitoring Queries

```sql
-- Daily route distribution
SELECT 
  DATE(created_at) as day,
  routing_strategy,
  COUNT(*) as queries,
  ROUND(AVG(total_response_ms)) as avg_ms,
  ROUND(AVG(embedding_similarity)::numeric, 3) as avg_similarity,
  ROUND(AVG(llm_calls_count)::numeric, 1) as avg_llm_calls,
  SUM(llm_calls_skipped) as llm_calls_saved
FROM query_routing_logs
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY 1, 2
ORDER BY 1 DESC, 3 DESC;

-- Intents needing more training phrases (low similarity)
SELECT 
  embedding_intent,
  COUNT(*) as queries,
  ROUND(AVG(embedding_similarity)::numeric, 3) as avg_sim,
  COUNT(*) FILTER (WHERE routing_strategy = 'embedding_low_confidence') as missed
FROM query_routing_logs
WHERE embedding_intent IS NOT NULL
  AND created_at > NOW() - INTERVAL '7 days'
GROUP BY 1
HAVING AVG(embedding_similarity) < 0.85
ORDER BY missed DESC;

-- Unmatched queries (no intent found — need new intents or phrases)
SELECT query, COUNT(*) as occurrences
FROM query_routing_logs
WHERE routing_strategy IN ('embedding_low_confidence', 'embedding_unavailable', 'keyword_fallback')
  AND created_at > NOW() - INTERVAL '7 days'
GROUP BY query
ORDER BY occurrences DESC
LIMIT 50;

-- Write tool success rate
SELECT 
  unnest(tools_executed) as tool,
  COUNT(*) as calls,
  SUM(write_tools_succeeded) as successes,
  SUM(write_tools_failed) as failures,
  ROUND(SUM(write_tools_succeeded)::numeric / NULLIF(COUNT(*), 0) * 100, 1) as success_pct
FROM query_routing_logs
WHERE write_tools_called > 0
  AND created_at > NOW() - INTERVAL '7 days'
GROUP BY tool
ORDER BY failures DESC;

-- Cost savings
SELECT 
  DATE(created_at) as day,
  SUM(llm_calls_skipped) * 0.003 as savings_usd,
  COUNT(*) FILTER (WHERE routing_strategy = 'embedding_canned') as zero_llm,
  COUNT(*) FILTER (WHERE routing_strategy = 'embedding_direct') as one_llm,
  COUNT(*) FILTER (WHERE routing_strategy NOT LIKE 'embedding_%') as two_llm
FROM query_routing_logs
GROUP BY 1 ORDER BY 1 DESC LIMIT 30;
```

---

## Part 9: Implementation Phases + Checklist

### Phase 0: Training Phrase Generation (THIS WEEK)

- [ ] Count intents with 0 training phrases (expect ~950)
- [ ] Write/use bulk generation script to hit "Generate with AI" for all empty intents
- [ ] Set generation count to 15 phrases per intent
- [ ] Verify: run quality check SQL — target 0 intents with 0 phrases
- [ ] Manual review: spot-check 20 random intents for phrase quality
- [ ] Add Hinglish variants for top 100 most-used intents
- [ ] Add misspelling/abbreviation variants for top 50

### Phase 0.5: MCQ Infrastructure ⭐ NEW (can start in parallel)

- [ ] Create `mcq_pending_states` table in Supabase
- [ ] Build `savePendingMCQ()` and `loadPendingMCQ()` helpers in index.ts
- [ ] Add `__MCQ_RESPONSE__` handler at TOP of index.ts (Step 0)
- [ ] Build MCQ SSE event format: `sendEvent('mcq', data)`
- [ ] **Frontend:** Build MCQCard React component
  - [ ] single_select mode (radio buttons as clickable cards)
  - [ ] multi_select mode (checkboxes)
  - [ ] allow_custom mode ("Other..." with inline text input)
  - [ ] Recommended option highlight (star badge)
  - [ ] Sublabel support (GSTIN, city, etc.)
  - [ ] Post-selection collapse animation
  - [ ] Dark mode support
- [ ] **Frontend:** Handle `mcq` SSE event type in chat stream handler
- [ ] **Frontend:** `handleMCQSelection()` — sends `__MCQ_RESPONSE__` request
- [ ] **Frontend:** Loading indicator while MCQ response processes

### Phase 0.6: MCQ Integration Points (sequential, by priority)

**Priority 1 — Write Confirmation (safety critical):**
- [ ] Detect write tools: `create_/update_/delete_/void_/approve_/send_`
- [ ] `formatWriteToolSummary()` — human-readable action descriptions
- [ ] MCQ: Yes/Modify/Cancel options
- [ ] Resume handler: execute confirmed tool, handle modify, handle cancel
- [ ] Test: create payment, create invoice, delete invoice, void invoice

**Priority 2 — Entity Resolution:**
- [ ] `_shared/entity-resolver.ts` — new file
- [ ] Fuzzy search in contacts (customers + vendors), items, accounts
- [ ] Scoring: exact > starts-with > contains > fuzzy
- [ ] Auto-resolve for single match or dominant match (score>=0.95)
- [ ] MCQ for 2+ matches with sublabels (GSTIN, city, email)
- [ ] Resume handler: inject resolved entity into LLM context
- [ ] Test: "invoices for Tata" (3 Tata entities), "stock of Steel" (5 items)

**Priority 3 — Missing Parameter:**
- [ ] `_shared/parameter-resolver.ts` — new file
- [ ] `PARAM_CONFIGS` for top 20 period-dependent intents
- [ ] Natural language extraction regex for period, status, basis
- [ ] MCQ for missing required params: period, status, format, scope
- [ ] Dynamic date labels (e.g., "This Month (Feb 2026)")
- [ ] Resume handler: add param, check if more missing, chain MCQs
- [ ] Test: "show P&L" (no period), "invoice list" (no status)

**Priority 4 — Intent Disambiguation:**
- [ ] `formatIntentAsHumanLabel()` — CamelCase to readable text
- [ ] MCQ from top 2-3 embedding matches (triggered at Step 4)
- [ ] Intent description as sublabel
- [ ] Resume handler: override as embedding_direct
- [ ] Test: "aging report" (receivables vs payables)

### Phase 0.7: Enhanced Enrichment Engine ⭐ NEW

- [ ] Expand `enrichment-auto-apply.ts` — rewrite with 2-layer architecture
- [ ] **Layer 1 computations:**
  - [ ] Currency detection + Indian formatting aggregates (₹ lakhs/crores)
  - [ ] Aging/overdue computation (days_overdue, buckets, counts)
  - [ ] Trend analysis (MoM change % from time-series data)
  - [ ] Ranking + concentration (top-N %, sort, rank numbers)
  - [ ] Budget variance (over/under, favorable/adverse)
  - [ ] GST/tax breakdown (CGST+SGST split, rate-wise)
  - [ ] Inventory health (reorder alerts, dead stock days)
  - [ ] Cash flow impact (net impact, vs prior period)
  - [ ] Percentage of total (per-row composition %)
  - [ ] Alert flag generation (critical/warning/info)
  - [ ] Period comparison (current vs previous)
  - [ ] Payment behavior (on-time %, avg days to pay)
- [ ] **Layer 2 LLM instructions:**
  - [ ] `buildEnrichedPrompt()` in model-selector.ts
  - [ ] Inject enrichment_instructions[] into system prompt
  - [ ] Inject pre-computed aggregates as structured context
  - [ ] Inject flags with severity icons
  - [ ] Always-on: CFO communication style instruction
- [ ] Test with all major reports: P&L, BS, aging, GST, stock

### Phase 1A: Infrastructure (WEEK 2)

- [ ] Enable pgvector extension in Supabase
- [ ] Create intent_embeddings table with HNSW index
- [ ] Create embedding_jobs table
- [ ] Create match_intent_embeddings RPC function
- [ ] Create query_routing_logs table (with MCQ columns)
- [ ] Create mcq_pending_states table
- [ ] Create DB trigger: on intent training_phrases change → queue embedding job

### Phase 1B: BGE-M3 Service (WEEK 2)

- [ ] Build FastAPI embed service (app.py)
- [ ] Dockerfile with pre-downloaded BGE-M3 model
- [ ] Deploy to Fly.io Mumbai region (2GB RAM, auto-start, min 1 machine)
- [ ] Verify /health endpoint
- [ ] Test /embed and /embed-query endpoints
- [ ] Set up keep-alive ping (prevent cold starts)

### Phase 1C: Embedding Sync (WEEK 2)

- [ ] Build embed-sync-worker.ts
- [ ] Run full sync: embed all training phrases → intent_embeddings
- [ ] Verify: row count in intent_embeddings ≈ total training phrases
- [ ] Test vector search: sample queries against pgvector
- [ ] Set up cron: process embedding_jobs queue every 5 min

### Phase 1D: Edge Function Integration (WEEK 3)

- [ ] Add classifyWithEmbedding() to index.ts
- [ ] Add routing logic with 5 strategies (including MCQ for ambiguous)
- [ ] Add canned responses for system intents
- [ ] Add traceId generation + structured logs at every step
- [ ] Wire MCQ triggers into Steps 4, 6.5, 6.6, 9
- [ ] Wire enrichment engine into Step 10 → Step 11 prompt
- [ ] A/B test: 50% traffic through embedding route
- [ ] Monitor via query_routing_logs for 1 week
- [ ] Full rollout if embedding_direct rate > 60% and accuracy looks good

### Phase 2: Write Tool Fixes (CAN START IN PARALLEL)

- [ ] Fix 2: WRITE_TOOL_GUIDANCE in system prompt (model-selector.ts)
- [ ] Fix 2B: validateWriteToolArgs() in index.ts
- [ ] Fix 3: parseWriteToolResult() + writeToolResults tracking
- [ ] Fix 3B: Reverse guardrail (false success/failure detection)
- [ ] Fix 4: Account search guidance in system prompt
- [ ] Test all 6 scenarios from payment fix document
- [ ] Deploy + monitor guardrail logs

### Phase 3: Optimization (WEEK 4+)

- [ ] Cache listTools() in MCP client (5 min TTL)
- [ ] Cache intents from DB (1 min TTL)
- [ ] Implement response-cache.ts (currently unused)
- [ ] Connect selectModelTier() (currently unused)
- [ ] Add Playwright e2e tests for top 20 query types
- [ ] Set up alerts: HF direct rate drops below 60%
- [ ] Set up alerts: write tool failure rate exceeds 20%
- [ ] Set up alerts: MCQ timeout/expiry rate exceeds 10%

---

## Part 10: File Changes Summary (v3 — Complete)

### New Files

| File | Purpose | Phase |
|---|---|---|
| **NEW: _shared/mcq-engine.ts** | MCQ card builders, SSE send, option formatting, pending state save/load | Phase 0.5 |
| **NEW: _shared/entity-resolver.ts** | Step 6.5 — fuzzy contact/item/account search, auto-resolve vs MCQ decision | Phase 0.6 |
| **NEW: _shared/parameter-resolver.ts** | Step 6.6 — NLP extraction for period/status/basis, MCQ for missing params | Phase 0.6 |
| **NEW: _shared/embedding-classifier.ts** | classifyWithEmbedding() — BGE-M3 query → pgvector search → routing | Phase 1D |
| **NEW: intent-classifier/** | FastAPI app.py, Dockerfile, fly.toml — BGE-M3 embed service on Fly.io | Phase 1B |
| **NEW: embed-sync-worker.ts** | Sync training phrases → intent_embeddings via BGE-M3 service | Phase 1C |

### Modified Files

| File | Changes | Phase |
|---|---|---|
| **index.ts** | Step 0 (MCQ response handler), Step 4 (embedding classification), Step 6.5/6.6 hooks, Step 9 (write confirmation MCQ), traceId, structured logs, pre-flight validation, write tool tracking, reverse guardrail, query_routing_logs insert | Phase 0.5 + 1D + 2 |
| **_shared/enrichment-auto-apply.ts** | **MAJOR REWRITE** → 2-layer engine: Layer 1 (12 computational enrichments) + Layer 2 (presentation instructions injected into LLM prompt). Renamed conceptually to enrichment pipeline. | Phase 0.7 |
| **_shared/model-selector.ts** | WRITE_TOOL_GUIDANCE + ACCOUNT_SEARCH_GUIDANCE + enrichment_instructions[] injected into SYSTEM_PROMPT | Phase 2 + 0.7 |
| **_shared/tool-groups.ts** | Accept resolvedEntity + resolvedParams from Step 6.5/6.6 as additional inputs | Phase 0.6 |
| **Frontend: ChatStream handler** | Handle new SSE event type `mcq`, render MCQCard component, send `__MCQ_RESPONSE__` | Phase 0.5 |
| **Frontend: NEW MCQCard component** | Clickable option cards with single_select, multi_select, allow_custom modes, sublabels, dark mode | Phase 0.5 |

### New Database Tables / Functions

| Table / Function | Purpose | Phase |
|---|---|---|
| `mcq_pending_states` | Store paused MCQ state (pending intent, args, entities) with TTL expiry | Phase 0.5 |
| `intent_embeddings` + HNSW index | BGE-M3 1024-dim vectors for all training phrases, pgvector search | Phase 1A |
| `embedding_jobs` | Queue for re-embedding on intent update | Phase 1A |
| `query_routing_logs` | Full request tracing: route, intent, similarity, tools, MCQ usage, timings | Phase 1A |
| `match_intent_embeddings()` RPC | pgvector cosine similarity search across intent_embeddings | Phase 1A |
| `expire_stale_mcqs()` cron function | Auto-expire MCQs older than TTL (5 min) | Phase 0.5 |
| pgvector extension | `CREATE EXTENSION vector;` | Phase 1A |
| DB trigger on intents | On training_phrases change → queue embedding job | Phase 1A |

### What Does NOT Change

| File | Why |
|---|---|
| _shared/classifier.ts | Kept as fallback (Step 3) — no changes |
| _shared/mcp-client.ts | No changes |
| _shared/rl-logger.ts | No changes (routing logs are separate) |
| _shared/response-type.ts | No changes |
| _shared/feedback-logger.ts | No changes |
| Auth backend (MongoDB) | No changes — MCQ and enrichment are entirely in Accounting backend |

---

## Part 11: MCQ Quick Reference — All 5 Trigger Points

For easy implementation reference, here are all MCQ trigger points in one place:

```
┌─────────────┬───────────────────┬──────────────────────────────────────────────┐
│ MCQ Type    │ Triggered At      │ Example                                      │
├─────────────┼───────────────────┼──────────────────────────────────────────────┤
│ INTENT      │ Step 4            │ "show aging" → Aged Receivables OR           │
│ DISAMBIG    │ (embedding        │   Aged Payables? → [Receivables] [Payables]  │
│             │  ambiguous)       │                                              │
├─────────────┼───────────────────┼──────────────────────────────────────────────┤
│ ENTITY      │ Step 6.5          │ "invoices for Tata" → 3 Tata contacts →     │
│ SELECTION   │ (entity-resolver) │   [Tata Motors] [Tata Steel] [TCS]          │
├─────────────┼───────────────────┼──────────────────────────────────────────────┤
│ MISSING     │ Step 6.6          │ "show P&L" → no period →                    │
│ PARAMETER   │ (param-resolver)  │   [This Month] [Last Month] [This FY] ...   │
├─────────────┼───────────────────┼──────────────────────────────────────────────┤
│ WRITE       │ Step 9            │ "pay 50K to Reliance from HDFC" →           │
│ CONFIRM     │ (before execute)  │   Summary card → [✅ Confirm] [✏️ Edit] [❌] │
├─────────────┼───────────────────┼──────────────────────────────────────────────┤
│ FILTER      │ Step 9            │ 247 results returned →                       │
│ RESULTS     │ (after execute)   │   [Show all] [Only overdue] [>₹1L] [Export] │
└─────────────┴───────────────────┴──────────────────────────────────────────────┘

KEY PRINCIPLE: Every MCQ pauses the flow. User taps → backend resumes from where
it left off. No typing required. Maximum 1-click to proceed.
```

---

## Part 12: Enrichment Quick Reference — All 12 Types

```
┌─────────────────────┬─────────────────────────────┬─────────────────────────────┐
│ Enrichment Type     │ Auto-Triggered When          │ What It Adds to Response    │
├─────────────────────┼─────────────────────────────┼─────────────────────────────┤
│ 1. Currency Format  │ Any amount field detected    │ ₹ lakhs/crores, totals     │
│ 2. Aging/Overdue    │ due_date field present       │ Days overdue, bucket, flags │
│ 3. Trend Analysis   │ Date field + 3+ rows         │ MoM/QoQ change %           │
│ 4. Ranking + Conc.  │ 3+ rows with amounts         │ Rank #, % of total, top-3  │
│ 5. Budget Variance  │ Budget + actual fields        │ Variance ₹ and %, flags    │
│ 6. GST/Tax          │ GST/TDS related intent        │ CGST+SGST split, rate-wise │
│ 7. Inventory Health │ Stock/Inventory intent         │ Reorder alerts, dead stock │
│ 8. Cash Flow Impact │ Payment/Cash intent            │ Net impact, vs prior       │
│ 9. % of Total       │ 2+ rows with amounts          │ Per-row composition %      │
│ 10. Alert Flags     │ Any threshold breach           │ 🔴 critical / ⚠️ warning   │
│ 11. Period Compare  │ P&L, CF, BS intents            │ Current vs previous delta  │
│ 12. Payment Behavior│ Customer/Vendor payments       │ On-time %, avg days to pay │
└─────────────────────┴─────────────────────────────┴─────────────────────────────┘

LAYER 1 (computed, ₹0 cost): Pre-calculate aggregates, flags, computed fields
LAYER 2 (LLM instructions): Tell the LLM how to present the enriched data

Both layers run automatically. No manual config needed per query.
Intent-level overrides possible via intent.enrichments[] in DB.
```
