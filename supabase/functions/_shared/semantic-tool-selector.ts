// Semantic Tool Selector — Uses Lovable AI (Gemini Flash Lite) for true semantic matching
// Replaces the old fuzzy substring-based getDynamicToolNames approach

const LOVABLE_AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const SEMANTIC_MODEL = "google/gemini-2.5-flash-lite";
const MAX_SEMANTIC_TOOLS = 20;
const SEMANTIC_TIMEOUT_MS = 5000;

/**
 * Given a user query and a list of MCP tools (candidates not already matched
 * by static keyword categories), use a fast LLM call to semantically select
 * the most relevant tools.
 *
 * Returns an array of tool names that are semantically relevant to the query.
 */
export async function selectToolsSemantically(
  query: string,
  candidateTools: Array<{ name: string; description: string }>,
  reqId: string,
): Promise<{ toolNames: string[]; strategy: string }> {
  if (candidateTools.length === 0) {
    return { toolNames: [], strategy: "semantic_no_candidates" };
  }

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    console.warn(`[${reqId}] LOVABLE_API_KEY not set — skipping semantic tool selection`);
    return { toolNames: [], strategy: "semantic_no_api_key" };
  }

  // Build a condensed tool catalog: "tool_name — description" per line
  // If too many candidates (>300), truncate descriptions to save tokens
  const condensed = candidateTools.length > 300;
  const toolCatalog = candidateTools
    .map(t => {
      const desc = condensed
        ? (t.description || "").slice(0, 60)
        : (t.description || "").slice(0, 120);
      return `- ${t.name}: ${desc}`;
    })
    .join("\n");

  const systemPrompt = `You are a tool selector for a financial CFO assistant.
Given a user's financial query, select ONLY the tools that are directly relevant to answering it.
Be precise — do NOT select tools that are tangentially related.
Return a JSON array of tool names. Select at most ${MAX_SEMANTIC_TOOLS} tools.
If no tools are relevant, return an empty array [].
Return ONLY the JSON array, nothing else.`;

  const userPrompt = `User query: "${query}"

Available tools:
${toolCatalog}

Which tools are relevant? Return JSON array of tool names:`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SEMANTIC_TIMEOUT_MS);

    const response = await fetch(LOVABLE_AI_GATEWAY, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: SEMANTIC_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 500,
        temperature: 0,
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      console.warn(`[${reqId}] Semantic tool selection failed: ${response.status}`);
      return { toolNames: [], strategy: "semantic_api_error" };
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content || "[]";

    // Parse the JSON array from the response
    const cleaned = content
      .replace(/```json?\s*/gi, "")
      .replace(/```/g, "")
      .trim();

    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) {
      console.warn(`[${reqId}] Semantic selector returned non-array`);
      return { toolNames: [], strategy: "semantic_parse_error" };
    }

    // Validate: only keep names that exist in candidates
    const candidateSet = new Set(candidateTools.map(t => t.name));
    const validated = parsed
      .filter((name: unknown): name is string => typeof name === "string" && candidateSet.has(name))
      .slice(0, MAX_SEMANTIC_TOOLS);

    console.log(`[${reqId}] Semantic tool selection: ${validated.length} tools from ${candidateTools.length} candidates`);
    return { toolNames: validated, strategy: "semantic_llm_matched" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("abort")) {
      console.warn(`[${reqId}] Semantic tool selection timed out after ${SEMANTIC_TIMEOUT_MS}ms`);
      return { toolNames: [], strategy: "semantic_timeout" };
    }
    console.warn(`[${reqId}] Semantic tool selection error: ${msg}`);
    return { toolNames: [], strategy: "semantic_error" };
  }
}
