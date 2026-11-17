/**
 * Deterministic post-pass for humanized text, and the no-API-key fallback.
 * Applies only the mechanical rules of the humanizer skill that are safe
 * without understanding the sentence (§8 dashes, §19 bold, §21 quotes,
 * §22 chatbot residue, §18 copula swaps, and a few stock phrases).
 */

const capFirst = (s: string) => s.replace(/^(\s*["“(]?)([a-z])/, (_, a, b) => a + b.toUpperCase());

export function mechanicalCleanup(text: string, opts: { keepDashes?: boolean } = {}): string {
  let t = text;

  // §19 bold / markdown decoration
  t = t.replace(/\*\*([^*\n]+)\*\*/g, "$1").replace(/^#{1,6}\s+/gm, "");

  // §22 chatbot residue (whole sentences)
  t = t.replace(
    /(?:^|(?<=[.!?]\s))(?:I hope this helps[^.!?]*[.!?]|Let me know if [^.!?]*[.!?]|Feel free to [^.!?]*[.!?]|Would you like me to [^.!?]*[?.]|(?:Certainly|Of course|Sure|Great question)! ?)/gi,
    ""
  );

  // §8 dashes → commas (keep numeric ranges as hyphens)
  if (!opts.keepDashes) {
    t = t.replace(/(\d)\s?[–—]\s?(\d)/g, "$1-$2");
    t = t.replace(/\s*(?:—|–|\s--\s)\s*/g, ", ");
    t = t.replace(/,\s*,/g, ",").replace(/,\s*([.!?;:])/g, "$1");
  }

  // §21 curly quotes → straight
  t = t.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");

  // §18 avoiding is/are/has
  t = t
    .replace(/\b(serves|stands) as\b/g, "is")
    .replace(/\bto (serve|stand) as\b/g, "to be")
    .replace(/\bboasts\b/g, "has");

  // Stock openers that carry no content: drop and re-capitalise.
  t = t.replace(
    /(^|[.!?]\s+)(?:It is (?:important|worth|crucial) (?:to note|noting) that|It's (?:important|worth) (?:to note|noting) that|In conclusion,|To sum up,|In today's (?:rapidly evolving|fast-paced|digital) (?:world|landscape|age),)\s*([a-z])/gi,
    (_, pre, ch) => pre + ch.toUpperCase()
  );

  // §12 plain-word swaps that are always safe
  const swaps: [RegExp, string][] = [
    [/\bdelve(s)? into\b/gi, "examine$1"],
    [/\bdelving into\b/gi, "examining"],
    [/\butiliz(e|es|ed|ing)\b/gi, "us$1"],
    [/\bshowcas(es|ed|ing)\b/gi, "show$1"],
    [/\bshowcase\b/gi, "show"],
    [/\bplays? a (?:crucial|vital|pivotal|key|significant) role in\b/gi, "matters for"],
    [/\ba testament to\b/gi, "evidence of"],
    [/\bin the realm of\b/gi, "in"],
  ];
  for (const [r, s] of swaps) t = t.replace(r, s);

  return t
    .split(/\n{2,}/)
    .map((p) => capFirst(p.replace(/[ \t]{2,}/g, " ").trim()))
    .join("\n\n")
    .trim();
}
