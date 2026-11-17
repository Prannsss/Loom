# Loom AI Text Analysis

Loom checks documents for AI-generated writing and rewrites flagged passages so they read like a person wrote them.

Upload a PDF, DOCX or TXT (or paste text). Loom reports **what share of the text appears AI-generated**, highlights the paragraphs responsible, and explains each flag.

## How detection works

Grammarly's detector is proprietary, so Loom does not copy it. Loom follows the same approach commercial detectors describe publicly: a trained classifier scores each passage, and the results roll up into "N% of the text appears AI-generated". Three signals are combined per paragraph:

1. **Transformer classifier (in your browser).** [TMR AI text detector](https://huggingface.co/Oxidane/tmr-ai-text-detector), a RoBERTa-base model fine-tuned on the RAID benchmark (reported AUROC 99.28%, MIT license). It runs on-device via transformers.js in a Web Worker. The ~126 MB quantised model downloads once and is then cached by the browser. No text leaves your machine for this step.
2. **AI-writing patterns.** 25 pattern families from the [humanizer skill](https://github.com/blader/humanizer) (based on Wikipedia's *Signs of AI writing*): "not X but Y" contrasts, one-line closers, inflated significance, stock AI vocabulary, tacked-on "-ing" phrases, chatbot residue, dash overuse, and more. Matches are underlined in the document.
3. **Optional LLM second opinion.** If you add an API key in Settings, the selected model scores each paragraph and gives a short reason.

Signals are fused in log-odds space (`lib/detect/engine.ts`). A classifier hit with no supporting evidence is shown as **Possibly AI** rather than flagged, because the classifier also fires on formal human prose (academic papers, encyclopedic text). Headings, captions, tables, page numbers, running headers and the reference list are excluded before scoring.

**Limits.** No detector proves authorship. Formal academic writing and non-native English can score high, and lightly edited AI text can score low. The fusion weights were hand-tuned on a small labelled set, so treat scores as one piece of evidence, not a verdict.

## Humanizer

Rewrites follow the [humanizer skill](https://github.com/blader/humanizer) (MIT), embedded verbatim in `lib/humanize/skill-text.ts`. The model marks the tells, drafts, checks that no fact, number or citation was lost, then returns the final text. Only flagged paragraphs are rewritten by default; headings and references are never touched. You can choose a tone, paste a sample of your own writing to match its voice, and refine with notes. After rewriting, Loom re-scans and shows the before/after AI share.

Without an API key, Loom applies only the mechanical rules (dashes, stock openers, chatbot residue, "serves as" → "is").

## Supported providers

Claude (`claude-opus-5-5`, via the official Anthropic SDK), Gemini, OpenAI, DeepSeek, MiniMax, GLM. Keys are stored in your browser's `localStorage` and sent only to the server action that calls the provider.

## Running locally

Requires Node.js 18+.

```bash
npm install
npm run dev
```

Open http://localhost:3000. No Python service is needed.

## Deploying to Vercel

Import the repository in Vercel and deploy with the defaults (framework: Next.js). No environment variables are required. Files are parsed in the browser, so large PDFs are not limited by Vercel's 4.5 MB request-body limit.

## Project layout

| Path | Purpose |
| --- | --- |
| `lib/extract.ts` | PDF (unpdf, layout-aware paragraph rebuild) and DOCX (mammoth) extraction in the browser |
| `lib/detect/engine.ts` | Segmentation, stylometry, fusion, document report |
| `lib/detect/patterns.ts` | AI-writing pattern catalog |
| `lib/detect/classifier*.ts` | transformers.js classifier in a Web Worker |
| `lib/humanize/` | Humanizer skill text and mechanical cleanup |
| `app/actions/ai.ts` | LLM server actions (paragraph scoring, humanizing) |
| `components/main-panel.tsx` | UI |
