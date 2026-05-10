"use server";

import { GoogleGenAI } from "@google/genai";

function getApiKey(customApiKey?: string) {
  const apiKey = customApiKey || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === "") {
    throw new Error("No API key provided. Please open Settings and enter a valid API key for the selected model.");
  }
  return apiKey;
}

/**
 * Robustly extracts the first valid JSON object or array from a string.
 * Handles markdown code fences and raw JSON responses.
 */
function extractJson(text: string): string {
  // 1. Try to strip markdown code fences (```json ... ```)
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();

  // 2. Try to find the outermost JSON object
  const objStart = text.indexOf("{");
  const objEnd = text.lastIndexOf("}");
  if (objStart !== -1 && objEnd > objStart) {
    return text.substring(objStart, objEnd + 1);
  }

  // 3. Try to find the outermost JSON array
  const arrStart = text.indexOf("[");
  const arrEnd = text.lastIndexOf("]");
  if (arrStart !== -1 && arrEnd > arrStart) {
    return text.substring(arrStart, arrEnd + 1);
  }

  return text;
}

/**
 * Dispatches a prompt to the selected AI model and returns a parsed JSON result.
 *
 * Supported modelType values and the models they use (as of May 2026):
 *  - "gemini"   → gemini-2.5-flash (falls back to gemini-2.0-flash on 403)
 *                 Google AI — Free tier available
 *  - "claude"   → claude-sonnet-4-6      (Anthropic — Paid)
 *  - "openai"   → gpt-4.1                (OpenAI — Paid)
 *  - "deepseek" → deepseek-v4-flash      (DeepSeek — Paid, very low-cost)
 *  - "minimax"  → MiniMax-M2.5           (MiniMax — Paid)
 *  - "glm"      → glm-5                  (Zhipu AI — Paid)
 */
async function callModel(modelType: string, apiKey: string, prompt: string) {
  try {
    let outputText = "";

    if (modelType === "gemini") {
      // Try gemini-2.5-flash first (free tier on most projects).
      // Some Google Cloud projects need billing enabled even for free-quota usage
      // of 2.5-flash — silently fall back to gemini-2.0-flash in that case.
      const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"];
      const ai = new GoogleGenAI({ apiKey });
      let lastGeminiError: Error | null = null;

      for (const model of GEMINI_MODELS) {
        try {
          const response = await ai.models.generateContent({
            model,
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: { responseMimeType: "application/json" },
          });
          outputText = response.text || "";
          break; // success — stop trying fallback models
        } catch (geminiErr: any) {
          const msg: string = geminiErr?.message ?? "";
          // Only fall through to the next model on access / permission errors.
          const isAccessError =
            msg.includes("403") ||
            msg.includes("PERMISSION_DENIED") ||
            msg.includes("denied access") ||
            msg.includes("SERVICE_DISABLED") ||
            msg.includes("API_KEY_INVALID");
          if (isAccessError && model !== GEMINI_MODELS[GEMINI_MODELS.length - 1]) {
            console.warn(`[Gemini] ${model} returned access error, trying fallback…`, msg);
            lastGeminiError = geminiErr;
            continue;
          }
          throw geminiErr; // non-access error, or exhausted all fallbacks
        }
      }

      if (!outputText && lastGeminiError) {
        throw new Error(
          "Your Gemini API key doesn't have access to the required models. " +
          "Please ensure the Generative Language API is enabled in your Google Cloud project " +
          "and that your key has no API restrictions blocking it. " +
          "Visit https://aistudio.google.com/apikey to create a new unrestricted key."
        );
      }

    } else if (modelType === "claude") {
      // claude-sonnet-4-6 — current Anthropic model (paid)
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 4096,
          messages: [
            {
              role: "user",
              content: prompt + "\n\nRespond ONLY with valid JSON. Do not wrap it in markdown code fences.",
            },
          ],
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Claude API error (${res.status}): ${errText}`);
      }
      const data = await res.json();
      outputText = data.content?.[0]?.text || "";

    } else if (modelType === "openai") {
      // gpt-4.1 — current OpenAI model (paid); supports JSON mode
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4.1",
          response_format: { type: "json_object" },
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`OpenAI API error (${res.status}): ${errText}`);
      }
      const data = await res.json();
      outputText = data.choices?.[0]?.message?.content || "";

    } else if (modelType === "deepseek") {
      // deepseek-v4-flash — current DeepSeek model (paid, low-cost)
      // Note: legacy alias "deepseek-chat" routes here until July 2026 retirement
      const res = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "deepseek-v4-flash",
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`DeepSeek API error (${res.status}): ${errText}`);
      }
      const data = await res.json();
      outputText = data.choices?.[0]?.message?.content || "";

    } else if (modelType === "minimax") {
      // MiniMax-M2.5 — current MiniMax model (paid)
      const res = await fetch("https://api.minimax.chat/v1/text/chatcompletion_v2", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "MiniMax-M2.5",
          messages: [{ role: "user", content: prompt + "\n\nRespond ONLY with valid JSON." }],
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`MiniMax API error (${res.status}): ${errText}`);
      }
      const data = await res.json();
      outputText = data.choices?.[0]?.message?.content || "";

    } else if (modelType === "glm") {
      // glm-5 — current Zhipu AI model (paid)
      const res = await fetch("https://open.bigmodel.cn/api/paas/v4/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "glm-5",
          messages: [{ role: "user", content: prompt + "\n\nRespond ONLY with valid JSON." }],
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`GLM API error (${res.status}): ${errText}`);
      }
      const data = await res.json();
      outputText = data.choices?.[0]?.message?.content || "";
    }

    if (!outputText) throw new Error("No response from AI model.");

    const jsonString = extractJson(outputText);
    return { result: JSON.parse(jsonString), error: null };

  } catch (error: any) {
    console.error("AI Error:", error);
    return { result: null, error: error.message || "Failed to process text." };
  }
}

export async function detectAIText(text: string, modelType: string, customApiKey?: string) {
  const apiKey = getApiKey(customApiKey);
  const prompt = `Analyze the following text and fragment it into blocks (sentences or paragraphs) based on whether they were likely generated by an AI or written by a human. Be objective and analyze patterns like repetition, predictable phrasing, overly uniform tone, lack of natural variation, and structural consistency. Output the result in JSON format with the following structure:
{
  "score": <number between 0 and 100, where 100 means 100% AI generated overall>,
  "isAI": <boolean, true if likely AI overall, false if mostly human>,
  "indicators": ["<string describing a detected pattern>", "<string>"],
  "explanation": "<detailed summary of your findings>",
  "fragments": [
     { "text": "<exact substring of the original text>", "isAI": <boolean> }
  ]
}

The concatenated "text" fields in the "fragments" array MUST broadly cover the original text. Break it down into reasonable chunks so we can highlight AI-generated parts in yellow and human parts in green. Ensure no Markdown formatting around JSON.

Text to analyze:
${text}`;

  return await callModel(modelType, apiKey, prompt);
}

/**
 * Strips common markdown formatting from a string, returning clean plain text.
 * Used as a server-side safety net after the model response is received.
 */
function stripMarkdown(text: string): string {
  return text
    // Remove fenced code blocks
    .replace(/```[\s\S]*?```/g, "")
    // Remove inline code
    .replace(/`([^`]+)`/g, "$1")
    // Remove bold (**text** or __text__)
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    // Remove italic (*text* or _text_)
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    // Remove ATX headings (# ## ### etc.)
    .replace(/^#{1,6}\s+/gm, "")
    // Remove horizontal rules
    .replace(/^[-*_]{3,}\s*$/gm, "")
    // Remove blockquotes
    .replace(/^>\s?/gm, "")
    // Remove unordered list markers (-, *, +)
    .replace(/^[\-\*\+]\s+/gm, "")
    // Remove ordered list markers (1. 2. etc.)
    .replace(/^\d+\.\s+/gm, "")
    // Remove markdown links [text](url) → text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // Remove image markdown ![alt](url) → alt
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    // Remove remaining lone asterisks / underscores / tildes
    .replace(/[*_~]+/g, "")
    // Remove emoji (Unicode ranges)
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FEFF}]/gu, "")
    // Collapse 3+ blank lines into 2
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function humanizeText(text: string, tone: string, context: string, modelType: string, customApiKey?: string) {
  const apiKey = getApiKey(customApiKey);

  const TONE_INSTRUCTIONS: Record<string, string> = {
    Professional:
      "\nTone target: Professional." +
      "\n- Use clear, precise, and confident language appropriate for a business or workplace context." +
      "\n- Prefer active voice and direct sentences. Avoid slang, contractions, and filler words." +
      "\n- Keep a formal but approachable register — authoritative without sounding robotic." +
      "\n- Vary sentence length moderately: mix concise statements with more developed explanations." +
      "\n- Use industry-appropriate vocabulary but avoid unnecessary jargon. Define terms when needed." +
      "\n- Maintain a logical, well-organized flow that signals competence and reliability.",

    Conversational:
      "\nTone target: Conversational." +
      "\n- Write as if speaking naturally to a friend or colleague in an everyday setting." +
      "\n- Use contractions freely (it's, we're, you'll, that's)." +
      "\n- Keep sentences short to medium length; vary them to reflect natural speech rhythm." +
      "\n- Use first and second person where appropriate ('I', 'you', 'we')." +
      "\n- Occasionally use informal connectors like 'so', 'plus', 'and', 'but' at the start of sentences." +
      "\n- Avoid stiff or overly formal phrasing. The text should feel warm, direct, and easy to follow." +
      "\n- Light rhetorical questions or relatable asides are welcome if they fit naturally.",

    Academic:
      "\nTone target: Academic." +
      "\n- Write in a formal, scholarly register suitable for research papers, essays, or reports." +
      "\n- Use precise, field-appropriate vocabulary. Avoid colloquialisms, contractions, and casual phrasing." +
      "\n- Construct complex but clear sentences that reflect careful, analytical thinking." +
      "\n- Use third-person perspective and passive voice where disciplinarily appropriate." +
      "\n- Clearly distinguish between claims, evidence, and interpretation." +
      "\n- Employ logical transitions (however, furthermore, consequently, in contrast) to link ideas." +
      "\n- The writing should demonstrate depth, nuance, and intellectual rigor throughout.",

    Casual:
      "\nTone target: Casual." +
      "\n- Write in a relaxed, friendly, and informal style — like texting or chatting with someone you know." +
      "\n- Use everyday words, contractions, and simple sentence structures." +
      "\n- Keep sentences short and punchy. Do not over-explain." +
      "\n- Favor simple, concrete words over technical or abstract ones." +
      "\n- Humor, light sarcasm, or relatable observations are welcome if they fit naturally." +
      "\n- Avoid anything that sounds stiff, formal, or corporate. The reader should feel at ease." +
      "\n- Occasional sentence fragments or informal connectors ('Also', 'Anyway', 'Oh, and') are fine.",

    "No writing pattern":
      "\nTone target: No detectable writing pattern." +
      "\n- Your primary goal is to make the text undetectable as AI-generated by any AI-content detector." +
      "\n- Deliberately break all predictable AI writing patterns: uniform sentence length, parallel structure, and systematic phrasing." +
      "\n- Use highly variable sentence lengths — very short sentences alongside longer, winding ones. Be unpredictable." +
      "\n- Introduce natural human idiosyncrasies: slight redundancies, casual self-corrections, minor digressions that still make sense." +
      "\n- Avoid transition word clusters (firstly/secondly/finally, in conclusion, it is important to note)." +
      "\n- Mix formal and informal vocabulary unpredictably but coherently." +
      "\n- Write as a real person would: imperfectly structured, authentically human, yet still clear and on-topic.",
  };

  const toneInstruction = TONE_INSTRUCTIONS[tone] ?? `\nThe desired output tone is: ${tone}`;

  const prompt = `You are an expert humanization engine. Rewrite the following text to be more natural and human-like.
Strictly preserve the original meaning, intent, and factual accuracy.
Improve readability, flow, sentence diversity, and tone authenticity.${toneInstruction}
${context ? `\nAdditional user feedback for this iteration: ${context}` : ""}

CRITICAL FORMATTING RULES — you MUST follow these without exception:
- Output ONLY plain text. No markdown of any kind.
- Do NOT use asterisks (*), underscores (_), pound signs (#), tildes (~), or backticks (\`).
- Do NOT use bold, italic, or any other text emphasis.
- Do NOT use bullet points, numbered lists, or dashes as list markers.
- Do NOT use headings or subheadings.
- Do NOT include emojis, symbols, or special Unicode characters.
- Write in natural flowing paragraphs using plain sentences only.

Output the result in JSON format with the following structure:
{
  "humanizedText": "<the rewritten text — plain text only, no markdown>",
  "summaryOfChanges": "<brief plain-text explanation of what was changed>"
}

Text to rewrite:
${text}`;

  const res = await callModel(modelType, apiKey, prompt);

  // Post-process: strip any residual markdown the model may have included despite instructions.
  if (res.result?.humanizedText) {
    let textToProcess = stripMarkdown(res.result.humanizedText);
    
    // Pass to Python NLP Service for final rhythm/burstiness/grammar processing
    try {
      const pyRes = await fetch("http://localhost:8000/humanize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: textToProcess })
      });
      
      if (pyRes.ok) {
        const pyData = await pyRes.json();
        textToProcess = pyData.humanizedText || textToProcess;
      } else {
        console.warn("Python humanization service returned error status", pyRes.status);
      }
    } catch (e) {
      console.error("Failed to reach Python humanization service. Is it running on port 8000?", e);
    }
    
    res.result.humanizedText = textToProcess;
  }

  return res;
}

