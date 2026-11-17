/**
 * Client-side document text extraction (PDF, DOCX, TXT).
 *
 * Runs in the browser so large files never hit Vercel's 4.5 MB
 * serverless request-body limit, and no Python service is needed.
 */

export type Extracted = { text: string; pages?: number; format: "pdf" | "docx" | "txt" };

export const ACCEPTED_EXTENSIONS = ".pdf,.docx,.txt,.md";
const MAX_BYTES = 50 * 1024 * 1024;

export async function extractFile(file: File): Promise<Extracted> {
  if (file.size > MAX_BYTES) throw new Error("File is larger than 50 MB.");
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return extractPdf(await file.arrayBuffer());
  if (name.endsWith(".docx")) return extractDocx(await file.arrayBuffer());
  if (name.endsWith(".doc")) throw new Error("Legacy .doc files are not supported. Save as .docx or PDF and try again.");
  if (name.endsWith(".txt") || name.endsWith(".md")) return { text: await file.text(), format: "txt" };
  throw new Error("Unsupported file type. Upload a PDF, DOCX or TXT file.");
}

async function extractDocx(buf: ArrayBuffer): Promise<Extracted> {
  const mammoth = (await import("mammoth")).default;
  const { value } = await mammoth.extractRawText({ arrayBuffer: buf });
  // mammoth separates paragraphs with "\n\n"; collapse runs of empty paragraphs.
  return { text: value.replace(/\n{3,}/g, "\n\n").trim(), format: "docx" };
}

type Item = { str: string; x: number; y: number; height: number; fontSize: number; hasEOL: boolean };
type Line = { text: string; x: number; y: number; size: number };

async function extractPdf(buf: ArrayBuffer): Promise<Extracted> {
  const { extractTextItems } = await import("unpdf");
  const { totalPages, items } = await extractTextItems(new Uint8Array(buf));
  return { text: pdfItemsToText(items as Item[][]), pages: totalPages, format: "pdf" };
}

/**
 * Rebuild paragraphs from positioned PDF text.
 * Body text = the most common line font size. A new paragraph starts on a
 * vertical gap clearly larger than normal line spacing, a first-line indent
 * relative to the previous line, or a change between body and non-body size
 * (headings, captions, footnotes). Moving to a new column or page continues
 * the paragraph unless the previous line ended a sentence.
 */
export function pdfItemsToText(itemPages: Item[][]): string {
  const pages: Line[][] = itemPages.map(groupLines);
  const repeated = findRunningHeaders(pages);
  const all = pages.flat();
  const bodySize = mode(all.map((l) => Math.round(l.size * 2) / 2)) || 10;
  const isBody = (l: Line) => Math.abs(l.size - bodySize) <= 0.6;

  const bodyGaps: number[] = [];
  for (const lines of pages) {
    for (let i = 1; i < lines.length; i++) {
      const g = lines[i - 1].y - lines[i].y;
      if (isBody(lines[i]) && isBody(lines[i - 1]) && g > 0 && g < bodySize * 3) bodyGaps.push(Math.round(g * 2) / 2);
    }
  }
  const lineGap = mode(bodyGaps) || bodySize * 1.2;

  const paragraphs: string[] = [];
  let para = "";
  let prev: Line | null = null;
  const flush = () => {
    if (para.trim()) paragraphs.push(para.trim());
    para = "";
  };

  for (const lines of pages) {
    for (const l of lines) {
      if (repeated.has(key(l.text)) || /^(?:page\s+)?\d{1,4}(?:\s+of\s+\d+)?$/i.test(l.text)) continue;
      if (prev) {
        const gap = prev.y - l.y;
        const sameColumn = gap > 0 && Math.abs(l.x - prev.x) < 60;
        const ended = /[.!?:"”)]$/.test(para);
        let startsNew: boolean;
        if (isBody(l) !== isBody(prev)) startsNew = true;
        else if (!sameColumn) startsNew = ended || gap > 0; // column/page jump
        else startsNew = gap > lineGap * 1.35 || (l.x - prev.x > 5 && ended);
        if (startsNew) flush();
      }
      para = joinLine(para, l.text);
      prev = l;
    }
  }
  flush();
  return paragraphs.join("\n\n");
}

function groupLines(items: Item[]): Line[] {
  const lines: Line[] = [];
  let cur: Item[] = [];
  const push = () => {
    const text = cur.map((i) => i.str).join("").replace(/\s+/g, " ").trim();
    if (text) {
      lines.push({
        text,
        x: Math.min(...cur.map((i) => i.x)),
        y: cur[0].y,
        size: Math.max(...cur.map((i) => i.fontSize || i.height || 0)),
      });
    }
    cur = [];
  };
  for (const it of items) {
    if (cur.length && Math.abs(it.y - cur[cur.length - 1].y) > 2) push();
    if (it.str) cur.push(it);
    if (it.hasEOL) push();
  }
  push();
  return lines;
}

/** Lines that appear at the same text on ≥40% of pages are running headers/footers. */
function findRunningHeaders(pages: Line[][]): Set<string> {
  const counts = new Map<string, number>();
  for (const lines of pages) {
    const edge = [...lines.slice(0, 2), ...lines.slice(-2)];
    for (const k of new Set(edge.map((l) => key(l.text)))) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const min = Math.max(3, Math.ceil(pages.length * 0.4));
  return new Set([...counts].filter(([k, c]) => c >= min && k.length > 0).map(([k]) => k));
}

const key = (s: string) => s.toLowerCase().replace(/\d+/g, "#").trim();

function joinLine(para: string, line: string): string {
  if (!para) return line;
  if (/[a-z]-$/.test(para) && /^[a-z]/.test(line)) return para.slice(0, -1) + line; // hyphenation
  return para + " " + line;
}

function mode(xs: number[]): number {
  const counts = new Map<number, number>();
  let best = 0;
  let bestN = 0;
  for (const x of xs) {
    const n = (counts.get(x) ?? 0) + 1;
    counts.set(x, n);
    if (n > bestN) {
      best = x;
      bestN = n;
    }
  }
  return best;
}
