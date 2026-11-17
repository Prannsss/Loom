/// <reference lib="webworker" />
/**
 * Web Worker running the transformer AI-text classifier in the browser.
 *
 * Model: TMR (Target Mining RoBERTa), RoBERTa-base fine-tuned on the RAID
 * benchmark (MIT). RAID leaderboard AUROC 99.28% (all settings).
 * https://huggingface.co/Oxidane/tmr-ai-text-detector
 * ONNX build: onnx-community/tmr-ai-text-detector-ONNX (8-bit, ~126 MB,
 * downloaded once and cached by the browser).
 */
import { pipeline, env, type TextClassificationPipeline } from "@huggingface/transformers";

export const MODEL_ID = "onnx-community/tmr-ai-text-detector-ONNX";

env.allowLocalModels = false;

let classifier: Promise<TextClassificationPipeline> | null = null;

function load() {
  classifier ??= pipeline("text-classification", MODEL_ID, {
    dtype: "q8",
    device: "wasm",
    progress_callback: (p: any) => {
      if (p.status === "progress" && p.file?.endsWith(".onnx")) {
        self.postMessage({ type: "download", loaded: p.loaded, total: p.total });
      }
    },
  }) as Promise<TextClassificationPipeline>;
  return classifier;
}

type Req = { type: "classify"; jobId: number; texts: string[] };

self.onmessage = async (e: MessageEvent<Req>) => {
  const { jobId, texts } = e.data;
  try {
    const clf = await load();
    self.postMessage({ type: "ready", jobId });
    for (let i = 0; i < texts.length; i++) {
      const out = (await clf(texts[i], { top_k: 2 })) as { label: string; score: number }[];
      const ai = out.find((o) => o.label.toLowerCase() === "ai")?.score ?? 0;
      self.postMessage({ type: "result", jobId, index: i, score: ai });
    }
    self.postMessage({ type: "done", jobId });
  } catch (err: any) {
    classifier = null;
    self.postMessage({ type: "error", jobId, message: err?.message ?? String(err) });
  }
};
