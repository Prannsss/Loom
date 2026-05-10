"use server";

import { GoogleGenAI } from "@google/genai";

// ---------------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------------

/** Maximum characters sent to any LLM to avoid runaway token costs. */
const MAX_INPUT_CHARS = 24_000;

/**
 * Provider configuration table.
 * Each entry fully describes how to call that provider.
 * "endpoint" is null for SDK-based providers (Gemini).
 */
const PROVIDER_CONFIG: Record<
  string,
  {
    endpoint: string | null;
    models: string[];
    authHeader: "bearer" | "x-api-key" | null;
    jsonMode: boolean;
  }
> = {
  gemini: {
    endpoint: null,
    models: ["gemini-2.5-flash", "gemini-2.0-flash"],
    authHeader: null,
    jsonMode: true,
  },
  claude: {
    endpoint: "https://api.anthropic.com/v1/messages",
    models: ["claude-sonnet-4-6"],
    authHeader: "x-api-key",
    jsonMode: false,
  },
  openai: {
    endpoint: "https://api.openai.com/v1/chat/completions",
    models: ["gpt-4.1"],
    authHeader: "bearer",
    jsonMode: true,
  },
  deepseek: {
    endpoint: "https://api.deepseek.com/chat/completions",
    models: ["deepseek-v4-flash"],
    authHeader: "bearer",
    jsonMode: true,
  },
  minimax: {
    endpoint: "https://api.minimax.chat/v1/text/chatcompletion_v2",
    models: ["MiniMax-M2.5"],
    authHeader: "bearer",
    jsonMode: false,
  },
  glm: {
    endpoint: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    models: ["glm-5"],
    authHeader: "bearer",
    jsonMode: false,
  },
};

/** Tone → prompt instruction map, used by llmHumanize. */
const TONE_INSTRUCTIONS: Record<string, string> = {
  Professional:
    "\nTone target: Professional.\n- Use clear, precise, and confident language appropriate for a business context.",
  Conversational:
    "\nTone target: Conversational.\n- Write as if speaking naturally to a friend or colleague.",
  Academic:
    "\nTone target: Academic.\n- Write in a formal, scholarly register suitable for research papers.",
  Casual:
    "\nTone target: Casual.\n- Write in a relaxed, friendly, and informal style.",
  "No writing pattern":
    "\nTone target: No detectable writing pattern.\n- Break all predictable AI writing patterns: uniform sentence length, parallel structure.",
};

// ---------------------------------------------------------------------------
// SHARED HELPERS
// ---------------------------------------------------------------------------

/**
 * Resolves the API key, preferring the user-supplied value over the env var.
 * Throws a user-friendly error if no key is found.
 */
function resolveApiKey(customApiKey?: string): string {
  const key = (customApiKey ?? process.env.NEXT_PUBLIC_GEMINI_API_KEY ?? "").trim();
  if (!key) {
    throw new Error(
      "No API key provided. Please open Settings and enter a valid key for the selected model."
    );
  }
  return key;
}

/**
 * Sanitizes a text string before sending it to an LLM:
 * - Strips null bytes and non-printable control characters (keeps \t \n \r)
 * - Truncates to MAX_INPUT_CHARS with a visible truncation notice
 */
function sanitizeInput(text: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  if (cleaned.length <= MAX_INPUT_CHARS) return cleaned;
  return (
    cleaned.slice(0, MAX_INPUT_CHARS) +
    "\n\n[Note: input was truncated to fit the model's context window.]"
  );
}

/**
 * Strips common markdown formatting, returning clean plain text.
 * Applied to any LLM output that should be presented as plain text.
 */
function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-*_]{3,}\s*$/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^[\-\*\+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/[*_~]+/g, "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FEFF}]/gu, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Robustly extracts a JSON object or array from a string that may contain
 * surrounding prose or markdown fences.
 */
function extractJson(raw: string): unknown {
  // 1. Try the whole string first (ideal for providers with native JSON mode)
  try { return JSON.parse(raw); } catch { /* fall through */ }

  // 2. Strip markdown fences and retry
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1].trim() : raw.trim();
  try { return JSON.parse(candidate); } catch { /* fall through */ }

  // 3. Find the outermost JSON structure via bracket depth tracking
  const starts = [candidate.indexOf("{"), candidate.indexOf("[")].filter((i) => i !== -1);
  if (starts.length === 0) throw new Error("No JSON structure found in model output.");

  const startIdx = Math.min(...starts);
  const isObj = candidate[startIdx] === "{";
  const open = isObj ? "{" : "[";
  const close = isObj ? "}" : "]";

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = startIdx; i < candidate.length; i++) {
    const ch = candidate[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (!inString) {
      if (ch === open) depth++;
      else if (ch === close && --depth === 0) {
        return JSON.parse(candidate.slice(startIdx, i + 1));
      }
    }
  }

  throw new Error("Could not extract valid JSON from model output.");
}

/**
 * Returns true for HTTP status codes worth retrying (rate-limit / temporary outage).
 */
function isRetryable(status: number): boolean {
  return status === 429 || status === 503;
}

/**
 * Wraps fetch with exponential-backoff retries on transient errors.
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  attempts = 3
): Promise<Response> {
  let lastErr: Error | null = null;
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(url, init);
    if (res.ok || !isRetryable(res.status)) return res;
    const delay = 500 * 2 ** i;
    console.warn(`[fetchWithRetry] HTTP ${res.status} — retrying in ${delay}ms (attempt ${i + 1}/${attempts})`);
    await new Promise((r) => setTimeout(r, delay));
    lastErr = new Error(`HTTP ${res.status}`);
  }
  throw lastErr ?? new Error("Max retries exceeded.");
}

// ---------------------------------------------------------------------------
// CORE MODEL DISPATCHER
// ---------------------------------------------------------------------------

type ModelSuccess = { result: unknown; error: null };
type ModelFailure = { result: null; error: string };
type ModelCallResult = ModelSuccess | ModelFailure;

/**
 * Sends `prompt` to the specified provider and returns the parsed JSON result.
 * All provider-specific logic (auth headers, body shape, response extraction)
 * is contained here so callers remain provider-agnostic.
 */
async function callModel(
  modelType: string,
  apiKey: string,
  prompt: string
): Promise<ModelCallResult> {
  try {
    const config = PROVIDER_CONFIG[modelType];
    if (!config) throw new Error(`Unknown model type: "${modelType}".`);

    let rawOutput = "";

    // ── Gemini SDK path ──────────────────────────────────────────────────
    if (modelType === "gemini") {
      const ai = new GoogleGenAI({ apiKey });
      let lastError: Error | null = null;

      for (const model of config.models) {
        try {
          const response = await ai.models.generateContent({
            model,
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: { responseMimeType: "application/json" },
          });
          rawOutput = response.text ?? "";
          break;
        } catch (err: any) {
          const msg: string = err?.message ?? "";
          const isAccessError =
            msg.includes("403") ||
            msg.includes("PERMISSION_DENIED") ||
            msg.includes("SERVICE_DISABLED") ||
            msg.includes("API_KEY_INVALID");

          if (isAccessError && model !== config.models.at(-1)) {
            console.warn(`[Gemini] ${model} access error, trying fallback…`);
            lastError = err;
            continue;
          }
          throw err;
        }
      }

      if (!rawOutput) {
        throw new Error(
          lastError
            ? "Your Gemini API key doesn't have access to the required models. " +
              "Ensure the Generative Language API is enabled and visit " +
              "https://aistudio.google.com/apikey to create an unrestricted key."
            : "Empty response from Gemini."
        );
      }

    // ── REST-based providers ─────────────────────────────────────────────
    } else {
      const { endpoint, models, authHeader, jsonMode } = config;
      if (!endpoint) throw new Error(`No endpoint configured for provider "${modelType}".`);

      const model = models[0];

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (authHeader === "bearer") headers["Authorization"] = `Bearer ${apiKey}`;
      if (authHeader === "x-api-key") {
        headers["x-api-key"] = apiKey;
        headers["anthropic-version"] = "2023-06-01";
      }

      let body: Record<string, unknown>;

      if (modelType === "claude") {
        body = {
          model,
          max_tokens: 4096,
          messages: [
            {
              role: "user",
              content: `${prompt}\n\nRespond ONLY with valid JSON. Do not wrap it in markdown code fences.`,
            },
          ],
        };
      } else {
        const userContent = jsonMode
          ? prompt
          : `${prompt}\n\nRespond ONLY with valid JSON. No markdown fences.`;

        body = {
          model,
          messages: [{ role: "user", content: userContent }],
          ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
        };
      }

      const res = await fetchWithRetry(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`${modelType} API error (${res.status}): ${errText}`);
      }

      const data = await res.json();

      rawOutput =
        modelType === "claude"
          ? data.content?.[0]?.text ?? ""
          : data.choices?.[0]?.message?.content ?? "";
    }

    if (!rawOutput.trim()) throw new Error("Model returned an empty response.");

    const parsed = extractJson(rawOutput);
    return { result: parsed, error: null };

  } catch (error: any) {
    console.error("[callModel] Error:", error);
    return { result: null, error: error.message ?? "Failed to process text." };
  }
}

// ---------------------------------------------------------------------------
// DETECTION PIPELINE  (exported)
// ---------------------------------------------------------------------------

/**
 * Sends raw text to the local Python NLP service for statistical preprocessing.
 * Returns heuristic scores, fragment annotations, and cleaned filtered text.
 */
export async function pyDetectPreprocessing(text: string) {
  try {
    const res = await fetchWithRetry("http://127.0.0.1:8000/detect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: sanitizeInput(text) }),
    });
    if (res.ok) return await res.json();
    throw new Error(`Python detect endpoint returned HTTP ${res.status}.`);
  } catch (e: any) {
    console.error("[pyDetectPreprocessing]", e);
    return { error: e.message ?? "Python foundational layer is unavailable." };
  }
}

/**
 * Sends pre-filtered text to the configured LLM for semantic AI-detection.
 * Returns a score, boolean flag, indicator list, and plain-text explanation.
 */
export async function llmDetectSemantic(
  filteredText: string,
  modelType: string,
  customApiKey?: string
) {
  try {
    const apiKey = resolveApiKey(customApiKey);
    const safeText = sanitizeInput(filteredText);

    const prompt = `Analyze the following text and determine whether it was likely generated by an AI or written by a human.
Examine patterns such as: repetition, predictable phrasing, overly uniform tone, lack of natural variation, and rigid structural consistency.

Return ONLY a JSON object with this exact structure (no markdown, no preamble):
{
  "score": <integer 0–100; 100 = certainly AI-generated>,
  "isAI": <boolean>,
  "indicators": ["<detected semantic pattern>"],
  "explanation": "<detailed plain-text summary of your findings>"
}

Text to analyze:
${safeText}`;

    const res = await callModel(modelType, apiKey, prompt);

    if (res.result) {
      const r = res.result as any;
      if (typeof r.explanation === "string") r.explanation = stripMarkdown(r.explanation);
      if (Array.isArray(r.indicators)) {
        r.indicators = r.indicators.map((s: unknown) =>
          typeof s === "string" ? stripMarkdown(s) : s
        );
      }
    }

    return { result: res.result };
  } catch (e: any) {
    console.warn("[llmDetectSemantic] LLM layer bypassed:", e);
    return { error: e.message ?? "LLM bypassed." };
  }
}

/**
 * Fuses Python heuristic output with optional LLM semantic output into a
 * single detection result. Fragment scores are assessed independently;
 * the blended document score nudges ambiguous fragments (35–65 range) only.
 */
export async function fuseDetection(
  text: string,
  pyData: any,
  llmResult: any,
  pipelineLog: string
) {
  type Fragment = { text: string; score?: number; isAI: boolean };

  const baseFragments: Fragment[] =
    pyData.fragments?.length
      ? pyData.fragments
      : [{ text, score: pyData.score, isAI: (pyData.score ?? 0) > 50 }];

  const finalResult = {
    score: 0,
    isAI: false,
    indicators: [...(pyData.indicators ?? [])] as string[],
    explanation: "",
    fragments: baseFragments,
  };

  if (llmResult) {
    // Weighted blend: Python heuristics 70%, LLM semantics 30%
    const blended = Math.round((pyData.score ?? 0) * 0.7 + (llmResult.score ?? 0) * 0.3);
    finalResult.score = blended;
    finalResult.isAI = blended > 50;

    // Nudge ambiguous fragments using the LLM's document-level verdict
    const llmSaysAI = (llmResult.score ?? 0) > 50;
    finalResult.fragments = baseFragments.map((f) => {
      if (typeof f.score !== "number") return f;
      const isAmbiguous = f.score >= 35 && f.score <= 65;
      if (!isAmbiguous) return f;
      const nudged = llmSaysAI
        ? Math.min(100, f.score + 10)
        : Math.max(0, f.score - 10);
      return { ...f, score: nudged, isAI: nudged > 50 };
    });

    // Deduplicate indicators (case-insensitive)
    const seen = new Set(finalResult.indicators.map((s) => s.toLowerCase().trim()));
    for (const ind of llmResult.indicators ?? []) {
      const key = (ind as string).toLowerCase().trim();
      if (!seen.has(key)) {
        seen.add(key);
        finalResult.indicators.push(ind as string);
      }
    }

    finalResult.explanation =
      `${pipelineLog}\n\n` +
      `[Hybrid Output] Python baseline: ${pyData.score ?? 0}% | ` +
      `LLM semantic: ${llmResult.score ?? 0}% | ` +
      `Weighted confidence: ${blended}%.\n\n` +
      `AI Semantic Reasoning: ${stripMarkdown(llmResult.explanation ?? "Analyzed successfully.")}`;
  } else {
    finalResult.score = pyData.score ?? 0;
    finalResult.isAI = (pyData.score ?? 0) > 50;
    finalResult.explanation =
      `${pipelineLog}\n\n` +
      "[Python Only Output] Evaluated using deterministic statistical heuristics: " +
      "lexical diversity, n-gram repetition, entropy, burstiness, passive voice ratio, " +
      "and sentiment variance. No LLM was used.";
  }

  // Append excluded-sections note if present
  if ((pyData?.excluded_sections?.length ?? 0) > 0) {
    const totalLen = text.length || 1;
    const filteredLen = pyData.filtered_text?.length ?? 0;
    const percent = Math.round((filteredLen / totalLen) * 100);
    const names = pyData.excluded_sections.slice(0, 5).join(", ");
    const more = pyData.excluded_sections.length > 5 ? " and others" : "";
    finalResult.explanation +=
      `\n\n*Note: The Python engine automatically excluded formal academic formatting ` +
      `(${names}${more}), strictly evaluating ${percent}% of the total text.*`;
  }

  return { result: finalResult, error: null };
}

// ---------------------------------------------------------------------------
// HUMANIZATION PIPELINE  (exported)
// ---------------------------------------------------------------------------

/**
 * Sends text to the local Python NLP service for deterministic humanization.
 * Returns python_humanized — the statistically rewritten text.
 */
export async function pyHumanizeLayer(text: string) {
  try {
    const res = await fetchWithRetry("http://127.0.0.1:8000/pipeline/humanize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: sanitizeInput(text) }),
    });
    if (res.ok) return await res.json();
    throw new Error(`Python humanization returned HTTP ${res.status}.`);
  } catch (e: any) {
    console.error("[pyHumanizeLayer]", e);
    return { error: e.message ?? "Python foundational layer is unavailable." };
  }
}

/**
 * Sends Python-humanized text to the configured LLM for formatting,
 * tone application, and structural improvement.
 * Returns llmText (humanized result) and llmSummary (plain-text change log).
 */
export async function llmHumanize(
  pythonHumanizedText: string,
  tone: string,
  context: string,
  modelType: string,
  customApiKey?: string
) {
  try {
    const apiKey = resolveApiKey(customApiKey);
    const safeText = sanitizeInput(pythonHumanizedText);
    const toneInstruction = TONE_INSTRUCTIONS[tone] ?? `\nThe desired output tone is: ${tone}`;

    const prompt =
      `You are an expert semantic enhancement layer in a hybrid humanization pipeline. ` +
      `The text has already been deterministically humanized. Your job is to improve the formatting, structuring, and flow.\n` +
      `Strictly preserve the original meaning, intent, and factual accuracy.\n` +
      `Improve readability, paragraph structuring, sentence diversity, and tone authenticity.` +
      `${toneInstruction}\n` +
      (context ? `\nAdditional user feedback for this iteration: ${context}\n` : "") +
      `\nCRITICAL: The input may contain formal academic headings (e.g., CHAPTER I, Introduction, References). ` +
      `Preserve these headings EXACTLY — do not modify, rephrase, or remove them.\n` +
      `\nCRITICAL FORMATTING — no exceptions:\n` +
      `- Output ONLY plain text. No markdown whatsoever.\n` +
      `- Do NOT use *, _, #, ~, or \` characters.\n` +
      `\nReturn ONLY this JSON (no preamble, no fences):\n` +
      `{\n` +
      `  "humanizedText": "<rewritten plain text>",\n` +
      `  "summaryOfChanges": "<brief plain-text explanation of changes>"\n` +
      `}\n` +
      `\nText to rewrite:\n${safeText}`;

    const res = await callModel(modelType, apiKey, prompt);

    if (res.result) {
      const r = res.result as any;
      if (typeof r.humanizedText === "string") {
        return {
          llmText: stripMarkdown(r.humanizedText),
          llmSummary:
            typeof r.summaryOfChanges === "string"
              ? stripMarkdown(r.summaryOfChanges)
              : "",
        };
      }
    }

    throw new Error("Invalid or missing humanizedText in LLM response.");
  } catch (e: any) {
    console.warn("[llmHumanize] LLM layer bypassed:", e);
    return { error: e.message ?? "LLM bypassed." };
  }
}