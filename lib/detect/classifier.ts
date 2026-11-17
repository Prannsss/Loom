"use client";
/**
 * Browser-side wrapper around classifier.worker.ts.
 * One worker per tab; the model loads once and stays warm.
 */

export type ClassifierProgress =
  | { stage: "download"; loaded: number; total: number }
  | { stage: "classify"; done: number; total: number };

let worker: Worker | null = null;
let nextJob = 1;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./classifier.worker.ts", import.meta.url), { type: "module" });
  }
  return worker;
}

/** Score each text with the transformer classifier. Returns AI probabilities (0..1). */
export function classifyTexts(texts: string[], onProgress?: (p: ClassifierProgress) => void): Promise<number[]> {
  if (texts.length === 0) return Promise.resolve([]);
  const w = getWorker();
  const jobId = nextJob++;
  const scores = new Array<number>(texts.length).fill(0);
  let done = 0;

  return new Promise((resolve, reject) => {
    const onMsg = (e: MessageEvent) => {
      const m = e.data;
      if (m.type === "download") {
        onProgress?.({ stage: "download", loaded: m.loaded, total: m.total });
        return;
      }
      if (m.jobId !== jobId) return;
      if (m.type === "ready") onProgress?.({ stage: "classify", done: 0, total: texts.length });
      if (m.type === "result") {
        scores[m.index] = m.score;
        onProgress?.({ stage: "classify", done: ++done, total: texts.length });
      }
      if (m.type === "done") {
        w.removeEventListener("message", onMsg);
        resolve(scores);
      }
      if (m.type === "error") {
        w.removeEventListener("message", onMsg);
        reject(new Error(m.message));
      }
    };
    w.addEventListener("message", onMsg);
    w.postMessage({ type: "classify", jobId, texts });
  });
}
