import re
import math
import statistics
from collections import Counter

import spacy
from textblob import TextBlob

nlp = spacy.load("en_core_web_sm")


class Detector:
    def __init__(self):

        # ---------------------------------------------------
        # TUNABLE THRESHOLDS (all in one place for easy tuning)
        # ---------------------------------------------------
        self.thresholds = {
            # Ratio of AI-marker words to total words
            "marker_density": 0.005,  # Lowered from 0.01 — stricter
            # Coefficient of variation for sentence length (low = uniform = AI-like)
            "cv_burstiness": 0.35,
            # Type-token ratio (low = repetitive = AI-like)
            "lexical_diversity": 0.35,  # Lowered from 0.42 — stricter
            # Single-token repetition ratio
            "repetition_score": 0.08,  # Lowered from 0.12 — stricter
            # Shannon entropy of vocabulary (low = AI-like)
            "entropy": 5.5,  # Lowered from 6.0 — stricter
            # Ratio of passive sentences
            "passive_voice": 0.25,  # Lowered from 0.35 — stricter
            # Ratio of sentences starting with a formal transition
            "transition_ratio": 0.12,  # Lowered from 0.15 — stricter
            # Average sentence word count (high = verbose = AI-like)
            "avg_sentence_len": 20,  # Lowered from 24 — stricter
            # Variance of per-sentence TextBlob polarity (low = flat = AI-like)
            "sentiment_variance": 0.015,  # Lowered from 0.02 — stricter
            # Minimum words required for a reliable analysis
            "min_words": 50,
            # Per-sentence score above which a sentence is flagged AI
            "sentence_ai_threshold": 45,  # Lowered from 50 — stricter
        }

        # ---------------------------------------------------
        # AI VOCABULARY MARKERS
        # Each entry is (word_or_phrase, weight).
        # Weight reflects how specifically the token signals AI authorship
        # rather than appearing in ordinary academic prose.
        # ---------------------------------------------------
        self.ai_markers = {
            # High specificity – very rare in genuine human academic writing
            "delve": 3,
            "tapestry": 3,
            "underscore": 2,
            "multifaceted": 2,
            "nuanced": 2,
            "fostering": 2,
            "paramount": 2,
            "realm": 2,
            "landscape": 2,
            "navigate": 2,
            "testament": 2,
            # Medium specificity – common in AI but also in human formal writing
            "crucial": 1,
            "pivotal": 1,
            "moreover": 1,
            "furthermore": 1,
            "additionally": 1,
            "overall": 1,
            "firstly": 1,
            "secondly": 1,
            "finally": 1,
        }

        # Multi-word AI phrase markers (checked separately against full text)
        self.ai_phrases = [
            "in conclusion",
            "it is important to note",
            "it is worth noting",
            "it is essential to",
            "plays a crucial role",
            "serves as a testament",
            "shed light on",
            "in today's world",
            "in the realm of",
        ]

        # ---------------------------------------------------
        # ACADEMIC BOILERPLATE PATTERNS
        # Anchored regexes that match ONLY headings/labels,
        # never substantive paragraph text.
        # ---------------------------------------------------
        self.academic_patterns = [
            r'^(\d+(\.\d+)*\s*)?(table\s+of\s+contents)([:.\-]?\s*)?$',
            r'^(\d+(\.\d+)*\s*)?(title\s+page)([:.\-]?\s*)?$',
            r'^(\d+(\.\d+)*\s*)?(approval\s+sheet)([:.\-]?\s*)?$',
            r'^(\d+(\.\d+)*\s*)?(acknowledg(e)?ment[s]?)([:.\-]?\s*)?$',
            r'^(\d+(\.\d+)*\s*)?(dedication)([:.\-]?\s*)?$',
            r'^(\d+(\.\d+)*\s*)?(abstract)([:.\-]?\s*)?$',
            r'^(\d+(\.\d+)*\s*)?(list\s+of\s+(tables|figures|appendices))([:.\-]?\s*)?$',
            r'^(\d+(\.\d+)*\s*)?(chapter\s+(i{1,10}|\d+))([:.\-]?\s*.*)?$',
            r'^(\d+(\.\d+)*\s*)?(introduction)([:.\-]?\s*)?$',
            r'^(\d+(\.\d+)*\s*)?(background\s+of\s+the\s+study)([:.\-]?\s*)?$',
            r'^(\d+(\.\d+)*\s*)?(statement\s+of\s+the\s+problem)([:.\-]?\s*)?$',
            r'^(\d+(\.\d+)*\s*)?(research\s+questions?)([:.\-]?\s*)?$',
            r'^(\d+(\.\d+)*\s*)?(objectives?\s+of\s+the\s+study)([:.\-]?\s*)?$',
            r'^(\d+(\.\d+)*\s*)?(scope\s+and\s+limitations?)([:.\-]?\s*)?$',
            r'^(\d+(\.\d+)*\s*)?(significance\s+of\s+the\s+study)([:.\-]?\s*)?$',
            r'^(\d+(\.\d+)*\s*)?(review\s+of\s+related\s+literature(\s+and\s+studies)?)([:.\-]?\s*)?$',
            r'^(\d+(\.\d+)*\s*)?(methodology)([:.\-]?\s*)?$',
            r'^(\d+(\.\d+)*\s*)?(results\s+and\s+discussion)([:.\-]?\s*)?$',
            r'^(\d+(\.\d+)*\s*)?(conclusion[s]?)([:.\-]?\s*)?$',
            r'^(\d+(\.\d+)*\s*)?(recommendation[s]?)([:.\-]?\s*)?$',
            r'^(\d+(\.\d+)*\s*)?(references|bibliography)([:.\-]?\s*)?$',
            r'^(figure|table)\s+\d+[:.]?.*$',
            r'^\d+$',
            r'^[ivxlcdm]+$',
        ]

    # ---------------------------------------------------
    # ACADEMIC BOILERPLATE FILTER
    # ---------------------------------------------------

    def _is_academic_boilerplate(self, line: str) -> bool:
        line = line.strip()
        if not line:
            return False
        # Never exclude long lines — they are substantive paragraphs
        if len(line.split()) > 15:
            return False
        for pattern in self.academic_patterns:
            if re.match(pattern, line, re.IGNORECASE):
                return True
        return False

    # ---------------------------------------------------
    # PDF LINE-BREAK REASSEMBLY
    # Merges lines that were broken mid-sentence by PDF extraction.
    # A line is considered a continuation if it does NOT end with
    # sentence-terminal punctuation.
    # ---------------------------------------------------

    def _merge_pdf_lines(self, lines: list[str]) -> list[str]:
        merged = []
        buffer = ""
        terminal_punct = re.compile(r'[.!?:]\s*$')

        for line in lines:
            stripped = line.strip()
            if not stripped:
                if buffer:
                    merged.append(buffer)
                    buffer = ""
                continue

            if buffer:
                if terminal_punct.search(buffer):
                    merged.append(buffer)
                    buffer = stripped
                else:
                    buffer += " " + stripped
            else:
                buffer = stripped

        if buffer:
            merged.append(buffer)

        return merged

    # ---------------------------------------------------
    # LEXICAL DIVERSITY  (type-token ratio)
    # ---------------------------------------------------

    def lexical_diversity(self, words: list[str]) -> float:
        if not words:
            return 0.0
        return len(set(words)) / len(words)

    # ---------------------------------------------------
    # SINGLE-TOKEN REPETITION SCORE
    # ---------------------------------------------------

    def repetition_score(self, words: list[str]) -> float:
        if not words:
            return 0.0
        freq = Counter(words)
        repeated = sum(count for count in freq.values() if count > 3)
        return repeated / len(words)

    # ---------------------------------------------------
    # N-GRAM REPETITION SCORE
    # Catches repeated phrases, not just repeated words.
    # ---------------------------------------------------

    def ngram_repetition(self, words: list[str], n: int = 3) -> float:
        if len(words) < n + 1:
            return 0.0
        ngrams = [tuple(words[i:i + n]) for i in range(len(words) - n + 1)]
        freq = Counter(ngrams)
        repeated = sum(c for c in freq.values() if c > 1)
        return repeated / len(ngrams)

    # ---------------------------------------------------
    # SHANNON ENTROPY
    # ---------------------------------------------------

    def entropy(self, words: list[str]) -> float:
        if not words:
            return 0.0
        freq = Counter(words)
        total = len(words)
        return -sum((c / total) * math.log2(c / total) for c in freq.values())

    # ---------------------------------------------------
    # BURSTINESS
    # Proper burstiness parameter: values near -1 = uniform (AI-like),
    # near +1 = highly variable (human-like).
    # ---------------------------------------------------

    def burstiness(self, sentence_lengths: list[int]) -> float:
        if len(sentence_lengths) < 3:
            return 0.0
        mean = statistics.mean(sentence_lengths)
        std = statistics.stdev(sentence_lengths)
        variance = std ** 2
        denom = variance + mean
        return (variance - mean) / denom if denom else 0.0

    # ---------------------------------------------------
    # PASSIVE VOICE RATIO  (spaCy dep parse — single implementation)
    # ---------------------------------------------------

    def passive_voice_ratio(self, doc) -> float:
        passive_sentences = 0
        total_sentences = 0
        for sent in doc.sents:
            total_sentences += 1
            if any(token.dep_ == "auxpass" for token in sent):
                passive_sentences += 1
        return passive_sentences / total_sentences if total_sentences else 0.0

    # ---------------------------------------------------
    # SENTIMENT VARIANCE
    # Low variance across sentences → emotionally flat → AI-like.
    # Uses TextBlob polarity (-1 to +1).
    # ---------------------------------------------------

    def sentiment_variance(self, sentences: list[str]) -> float:
        if len(sentences) < 2:
            return 1.0  # Can't measure — don't penalise
        polarities = [TextBlob(s).sentiment.polarity for s in sentences]
        return statistics.variance(polarities)

    # ---------------------------------------------------
    # WEIGHTED AI MARKER DENSITY
    # Counts weighted marker hits rather than binary presence.
    # ---------------------------------------------------

    def _weighted_marker_density(self, words: list[str], full_text: str) -> float:
        if not words:
            return 0.0

        word_score = sum(
            self.ai_markers.get(w, 0) for w in words
        )

        phrase_score = sum(
            3 for phrase in self.ai_phrases
            if phrase in full_text.lower()
        )

        total_weight = word_score + phrase_score
        # Normalise against word count so longer docs aren't unfairly penalised
        return total_weight / len(words)

    # ---------------------------------------------------
    # PER-SENTENCE SCORER
    # Uses spaCy for passive detection (consistent with document level).
    # ---------------------------------------------------

    def _score_sentence(self, sent_text: str) -> int:
        words = [w.lower() for w in re.findall(r'\b\w+\b', sent_text)]
        if len(words) < 4:
            return 0

        score = 0

        # Weighted AI vocabulary markers
        marker_weight = sum(self.ai_markers.get(w, 0) for w in words)
        phrase_hits = sum(1 for phrase in self.ai_phrases if phrase in sent_text.lower())
        marker_weight += phrase_hits * 3
        if marker_weight > 0:
            score += min(marker_weight * 15, 50)

        # Passive voice via spaCy (single implementation)
        sent_doc = nlp(sent_text)
        if any(token.dep_ == "auxpass" for token in sent_doc):
            score += 15

        # Formal transitions at sentence start
        transitions = {
            "however", "furthermore", "moreover", "firstly", "secondly",
            "finally", "overall", "consequently", "thus", "therefore",
            "additionally", "notably", "importantly"
        }
        if words and words[0] in transitions:
            score += 20

        # High ratio of long words → complex/verbose phrasing
        long_words = sum(1 for w in words if len(w) > 8)
        if (long_words / len(words)) > 0.3:
            score += 15

        # Excessive sentence length → LLM verbosity
        if len(words) > 35:
            score += 15

        return min(score, 100)

    # ---------------------------------------------------
    # MAIN ANALYSIS
    # ---------------------------------------------------

    def analyze(self, text: str) -> dict:
        if not text.strip():
            return {
                "score": 0,
                "indicators": ["Empty text."],
                "fragments": [],
                "statistics": {},
            }

        # --------------------------------------------------
        # STEP 1 — Split into chunks, preserving whitespace
        # --------------------------------------------------
        raw_chunks = re.split(r'(\n+)', text)

        processed_chunks = []
        raw_substantive_lines = []
        excluded = []

        for chunk in raw_chunks:
            if not chunk.strip():
                processed_chunks.append({"text": chunk, "type": "whitespace"})
            elif self._is_academic_boilerplate(chunk):
                excluded.append(chunk.strip())
                processed_chunks.append({"text": chunk, "type": "boilerplate"})
            else:
                raw_substantive_lines.append(chunk)
                processed_chunks.append({"text": chunk, "type": "substantive"})

        # --------------------------------------------------
        # STEP 2 — Reassemble PDF line breaks in substantive lines
        # --------------------------------------------------
        substantive_lines = self._merge_pdf_lines(raw_substantive_lines)
        filtered_text = "\n".join(substantive_lines)

        # --------------------------------------------------
        # STEP 3 — Build per-sentence fragments for highlighting
        # (boilerplate chunks pass through unscored)
        # --------------------------------------------------
        fragments = []
        current_block = ""

        for chunk_data in processed_chunks:
            if chunk_data["type"] == "boilerplate":
                if current_block:
                    for sent in nlp(current_block).sents:
                        s = self._score_sentence(sent.text)
                        fragments.append({
                            "text": sent.text_with_ws,
                            "score": s,
                            "isAI": s > self.thresholds["sentence_ai_threshold"],
                        })
                    current_block = ""
                fragments.append({"text": chunk_data["text"], "score": 0, "isAI": False})
            else:
                current_block += chunk_data["text"]

        if current_block:
            for sent in nlp(current_block).sents:
                s = self._score_sentence(sent.text)
                fragments.append({
                    "text": sent.text_with_ws,
                    "score": s,
                    "isAI": s > self.thresholds["sentence_ai_threshold"],
                })

        # --------------------------------------------------
        # STEP 4 — Run document-level NLP on filtered text ONCE
        # --------------------------------------------------
        if not filtered_text.strip():
            return {
                "score": 0,
                "indicators": ["No substantive content found after filtering."],
                "excluded_sections": excluded,
                "fragments": fragments,
                "statistics": {},
            }

        doc = nlp(filtered_text)

        sentences = [
            sent.text.strip()
            for sent in doc.sents
            if len(sent.text.strip()) > 5
        ]

        words = [
            token.text.lower()
            for token in doc
            if token.is_alpha
        ]

        # --------------------------------------------------
        # STEP 5 — Guard: too little text for reliable scoring
        # --------------------------------------------------
        if len(words) < self.thresholds["min_words"]:
            return {
                "score": None,
                "indicators": [
                    f"Insufficient text for reliable analysis "
                    f"({len(words)} words; minimum is {self.thresholds['min_words']})."
                ],
                "excluded_sections": excluded,
                "fragments": fragments,
                "statistics": {},
            }

        indicators = []
        score = 0

        # --------------------------------------------------
        # 1. WEIGHTED AI MARKER DENSITY  (max +20)
        # --------------------------------------------------
        marker_density = self._weighted_marker_density(words, filtered_text)

        if marker_density > self.thresholds["marker_density"]:
            # Scale: 30 pts at threshold, up to 30 pts for anything above
            pts = min(30, int(30 * (marker_density / self.thresholds["marker_density"]) ** 0.5))
            score += pts
            indicators.append(
                f"High AI-associated vocabulary density (weighted density: {marker_density:.4f})."
            )

        # --------------------------------------------------
        # 2. BURSTINESS  (max +20)
        # --------------------------------------------------
        sentence_lengths = [len(s.split()) for s in sentences]

        if len(sentence_lengths) > 2:
            burst = self.burstiness(sentence_lengths)
            # burst < 0 means uniform; very negative = very uniform = very AI-like
            if burst < 0:
                # Map [-1, 0] → [25, 0] pts
                pts = min(25, int(25 * abs(burst)))
                score += pts
                indicators.append(
                    f"Low sentence burstiness (burstiness={burst:.3f}; negative = uniform)."
                )

        # --------------------------------------------------
        # 3. LEXICAL DIVERSITY  (max +15)
        # --------------------------------------------------
        diversity = self.lexical_diversity(words)

        if diversity < self.thresholds["lexical_diversity"]:
            score += 20  # Increased from 15
            indicators.append(
                f"Low lexical diversity (TTR={diversity:.3f})."
            )

        # --------------------------------------------------
        # 4. SINGLE-TOKEN REPETITION  (max +10)
        # --------------------------------------------------
        rep_score = self.repetition_score(words)

        if rep_score > self.thresholds["repetition_score"]:
            score += 10
            indicators.append(
                f"High single-token repetition (ratio={rep_score:.3f})."
            )

        # --------------------------------------------------
        # 5. N-GRAM REPETITION  (max +10)
        # --------------------------------------------------
        ngram_rep = self.ngram_repetition(words, n=3)

        if ngram_rep > 0.05:
            score += 10
            indicators.append(
                f"High trigram repetition (ratio={ngram_rep:.3f})."
            )

        # --------------------------------------------------
        # 6. SHANNON ENTROPY  (max +10)
        # --------------------------------------------------
        entropy_val = self.entropy(words)

        if entropy_val < self.thresholds["entropy"]:
            score += 10
            indicators.append(
                f"Low vocabulary entropy ({entropy_val:.3f})."
            )

        # --------------------------------------------------
        # 7. PASSIVE VOICE  (max +10) — single implementation
        # --------------------------------------------------
        passive_ratio = self.passive_voice_ratio(doc)

        if passive_ratio > self.thresholds["passive_voice"]:
            score += 15  # Increased from 10
            indicators.append(
                f"Excessive passive voice usage (ratio={passive_ratio:.3f})."
            )

        # --------------------------------------------------
        # 8. TRANSITION OVERUSE  (max +10)
        # --------------------------------------------------
        transitions = {
            "however", "moreover", "furthermore", "additionally",
            "therefore", "overall", "notably", "importantly",
            "consequently", "thus"
        }
        transition_count = sum(
            1 for sent in sentences
            if sent.split() and sent.split()[0].lower().strip(",.") in transitions
        )
        transition_ratio = transition_count / len(sentences) if sentences else 0.0

        if transition_ratio > self.thresholds["transition_ratio"]:
            score += 10
            indicators.append(
                f"Overuse of formal transitions (ratio={transition_ratio:.3f})."
            )

        # --------------------------------------------------
        # 9. AVERAGE SENTENCE LENGTH  (max +5)
        # --------------------------------------------------
        avg_sentence_len = statistics.mean(sentence_lengths) if sentence_lengths else 0

        if avg_sentence_len > self.thresholds["avg_sentence_len"]:
            score += 5
            indicators.append(
                f"Overly long average sentence length ({avg_sentence_len:.1f} words)."
            )

        # --------------------------------------------------
        # 10. SENTIMENT VARIANCE  (max +15)
        # Low variance = emotionally flat = AI-like
        # --------------------------------------------------
        sent_variance = self.sentiment_variance(sentences)

        if sent_variance < self.thresholds["sentiment_variance"]:
            score += 15  # Increased from 10
            indicators.append(
                f"Very low sentiment variance ({sent_variance:.4f}); text is emotionally flat."
            )

        # --------------------------------------------------
        # FINAL SCORE  (clamped to [0, 100])
        # NOTE: We do NOT override fragment-level flags based on
        # the document score — each sentence is evaluated independently.
        # --------------------------------------------------
        final_score = max(0, min(100, int(score)))

        return {
            "score": final_score,
            "excluded_sections": excluded,
            "indicators": indicators,
            "fragments": fragments,
            "filtered_text": filtered_text,
            "statistics": {
                "lexical_diversity": round(diversity, 3),
                "repetition_score": round(rep_score, 3),
                "ngram_repetition": round(ngram_rep, 3),
                "entropy": round(entropy_val, 3),
                "burstiness": round(self.burstiness(sentence_lengths), 3) if len(sentence_lengths) > 2 else None,
                "passive_voice_ratio": round(passive_ratio, 3),
                "transition_ratio": round(transition_ratio, 3),
                "avg_sentence_len": round(avg_sentence_len, 1),
                "sentiment_variance": round(sent_variance, 4),
                "weighted_marker_density": round(marker_density, 4),
            },
        }