import re
import random
import statistics
from collections import Counter

import nltk
import spacy
from nltk.corpus import wordnet
from textblob import TextBlob

nlp = spacy.load("en_core_web_sm")


class Humanizer:

    def __init__(self):

        self.casual_transitions = [
            "Honestly,",
            "To be fair,",
            "At the same time,",
            "In many ways,",
            "That said,",
            "Still,",
            "At this point,",
            "At the end of the day,"
        ]

        self.academic_fillers = [
            "in many cases",
            "to some extent",
            "in practice",
            "based on the findings",
            "from this perspective",
            "in most situations"
        ]

        self.contractions = {
            "do not": "don't",
            "does not": "doesn't",
            "cannot": "can't",
            "will not": "won't",
            "is not": "isn't",
            "are not": "aren't",
            "have not": "haven't",
            "has not": "hasn't",
            "would not": "wouldn't",
            "should not": "shouldn't",
            "could not": "couldn't",
        }

        self.ai_phrases = [
            "it is important to note",
            "in conclusion",
            "overall",
            "moreover",
            "furthermore",
            "delve into",
            "plays a crucial role",
            "underscores the importance"
        ]

    # ---------------------------------------------------
    # MAIN PROCESS
    # ---------------------------------------------------

    def process(self, text):

        if not text.strip():
            return text

        paragraphs = text.split("\n\n")

        processed_paragraphs = []

        for paragraph in paragraphs:

            if not paragraph.strip():
                continue

            paragraph = self._remove_ai_phrases(paragraph)

            paragraph = self._apply_contractions(
                paragraph
            )

            doc = nlp(paragraph)

            sentences = [
                sent.text.strip()
                for sent in doc.sents
            ]

            transformed = []

            for i, sentence in enumerate(sentences):

                sentence = self._humanize_sentence(
                    sentence
                )

                sentence = self._vary_sentence_length(
                    sentence
                )

                if random.random() < 0.12:
                    sentence = self._inject_transition(
                        sentence
                    )

                transformed.append(sentence)

            paragraph = self._rebuild_paragraph(
                transformed
            )

            paragraph = self._inject_human_rhythm(
                paragraph
            )

            processed_paragraphs.append(
                paragraph
            )

        return "\n\n".join(
            processed_paragraphs
        )

    # ---------------------------------------------------
    # REMOVE AI PHRASES
    # ---------------------------------------------------

    def _remove_ai_phrases(self, text):

        for phrase in self.ai_phrases:

            pattern = re.compile(
                re.escape(phrase),
                re.IGNORECASE
            )

            if random.random() < 0.8:
                text = pattern.sub("", text)

        return re.sub(r"\s+", " ", text)

    # ---------------------------------------------------
    # CONTRACTIONS
    # ---------------------------------------------------

    def _apply_contractions(self, text):

        for full, contracted in self.contractions.items():

            if random.random() < 0.65:

                text = re.sub(
                    rf"\b{full}\b",
                    contracted,
                    text,
                    flags=re.IGNORECASE
                )

        return text

    # ---------------------------------------------------
    # MAIN SENTENCE HUMANIZATION
    # ---------------------------------------------------

    def _humanize_sentence(self, sentence):

        sentence = self._smart_synonyms(
            sentence
        )

        sentence = self._reduce_formality(
            sentence
        )

        sentence = self._inject_fillers(
            sentence
        )

        sentence = self._vary_punctuation(
            sentence
        )

        return sentence

    # ---------------------------------------------------
    # SMART SYNONYM ENGINE
    # ---------------------------------------------------

    def _smart_synonyms(self, text):

        doc = nlp(text)

        new_words = []

        for token in doc:

            word = token.text

            if (
                token.pos_ in ["ADJ", "VERB", "ADV"]
                and len(word) > 5
                and random.random() < 0.04
            ):

                synonym = self._get_contextual_synonym(
                    token
                )

                if synonym:
                    word = synonym

            new_words.append(word)

        return self._reconstruct(
            new_words
        )

    # ---------------------------------------------------
    # CONTEXTUAL SYNONYMS
    # ---------------------------------------------------

    def _get_contextual_synonym(self, token):

        synsets = wordnet.synsets(
            token.text
        )

        candidates = []

        for syn in synsets:

            for lemma in syn.lemmas():

                candidate = lemma.name().replace(
                    "_", " "
                )

                if (
                    candidate.lower()
                    != token.text.lower()
                    and len(candidate.split()) == 1
                    and candidate.isalpha()
                ):
                    candidates.append(candidate)

        if not candidates:
            return None

        synonym = random.choice(candidates)

        if token.text[0].isupper():
            synonym = synonym.capitalize()

        return synonym

    # ---------------------------------------------------
    # REDUCE AI FORMALITY
    # ---------------------------------------------------

    def _reduce_formality(self, text):

        replacements = {

            "utilize": "use",
            "numerous": "many",
            "individuals": "people",
            "assistance": "help",
            "demonstrate": "show",
            "therefore": "so",
            "however": "but",
        }

        for formal, natural in replacements.items():

            if random.random() < 0.7:

                text = re.sub(
                    rf"\b{formal}\b",
                    natural,
                    text,
                    flags=re.IGNORECASE
                )

        return text

    # ---------------------------------------------------
    # HUMAN FILLERS
    # ---------------------------------------------------

    def _inject_fillers(self, text):

        if random.random() < 0.08:

            filler = random.choice(
                self.academic_fillers
            )

            comma_positions = [
                m.start()
                for m in re.finditer(",", text)
            ]

            if comma_positions:

                pos = random.choice(
                    comma_positions
                )

                text = (
                    text[:pos]
                    + f", {filler},"
                    + text[pos:]
                )

        return text

    # ---------------------------------------------------
    # SENTENCE LENGTH VARIATION
    # ---------------------------------------------------

    def _vary_sentence_length(self, sentence):

        words = sentence.split()

        if len(words) > 25 and random.random() < 0.35:

            split_point = random.randint(
                10,
                len(words) - 8
            )

            first = " ".join(
                words[:split_point]
            )

            second = " ".join(
                words[split_point:]
            )

            return first + ". " + second

        return sentence

    # ---------------------------------------------------
    # PARAGRAPH RHYTHM
    # ---------------------------------------------------

    def _rebuild_paragraph(self, sentences):

        paragraph = ""

        for i, sent in enumerate(sentences):

            paragraph += sent

            if random.random() < 0.15:
                paragraph += "  "
            else:
                paragraph += " "

        return paragraph.strip()

    # ---------------------------------------------------
    # HUMAN RHYTHM ENGINE
    # ---------------------------------------------------

    def _inject_human_rhythm(self, text):

        if random.random() < 0.1:

            text += " "

        if random.random() < 0.07:

            text = text.replace(
                ", however,",
                " however,"
            )

        return text

    # ---------------------------------------------------
    # TRANSITIONS
    # ---------------------------------------------------

    def _inject_transition(self, text):

        transition = random.choice(
            self.casual_transitions
        )

        if text[0].isupper():

            text = (
                text[0].lower()
                + text[1:]
            )

        return f"{transition} {text}"

    # ---------------------------------------------------
    # PUNCTUATION
    # ---------------------------------------------------

    def _vary_punctuation(self, text):

        if text.endswith("."):

            r = random.random()

            if r < 0.03:
                return text[:-1] + "..."

            if r < 0.05:
                return text[:-1] + "."

        return text

    # ---------------------------------------------------
    # TOKEN RECONSTRUCTION
    # ---------------------------------------------------

    def _reconstruct(self, tokens):

        text = ""

        for token in tokens:

            if re.match(r"[.,!?;:]", token):
                text += token
            else:
                text += " " + token

        return text.strip()