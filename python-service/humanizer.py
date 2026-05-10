import re
import random
import spacy
import pyinflect
from textblob import TextBlob
import nltk
from nltk.corpus import wordnet

# Ensure nltk data is available
try:
    nltk.data.find('corpora/wordnet')
except LookupError:
    nltk.download('wordnet')
    nltk.download('punkt')
    nltk.download('averaged_perceptron_tagger')

nlp = spacy.load("en_core_web_sm")

class Humanizer:
    def __init__(self):
        # Common transition words
        self.transitions = [
            "Honestly,", "To be fair,", "Actually,", "In fact,", "Basically,", 
            "Plus,", "Also,", "By the way,", "Now,"
        ]
        
        self.contractions = {
            "cannot": "can't",
            "do not": "don't",
            "does not": "doesn't",
            "will not": "won't",
            "are not": "aren't",
            "is not": "isn't",
            "have not": "haven't",
            "has not": "hasn't",
            "would not": "wouldn't",
            "should not": "shouldn't",
            "could not": "couldn't",
            "I am": "I'm",
            "you are": "you're",
            "we are": "we're",
            "they are": "they're",
            "he is": "he's",
            "she is": "she's",
            "it is": "it's",
            "I will": "I'll",
            "you will": "you'll",
            "we will": "we'll",
            "they will": "they'll",
            "I have": "I've",
            "you have": "you've",
            "we have": "we've",
            "they have": "they've",
            "I would": "I'd",
            "you would": "you'd",
            "he would": "he'd",
            "she would": "she'd",
            "we would": "we'd",
            "they would": "they'd"
        }

    def process(self, text: str) -> str:
        if not text.strip():
            return text
            
        paragraphs = text.split('\n\n')
        humanized_paragraphs = []
        
        for p in paragraphs:
            if not p.strip():
                continue
                
            # 1. Apply contractions
            p = self._apply_contractions(p)
            
            # 2. Process at sentence level
            doc = nlp(p)
            sentences = [sent.text.strip() for sent in doc.sents]
            
            processed_sentences = []
            for i, sent in enumerate(sentences):
                # Apply synonym substitution sparingly (10% chance per word to avoid nonsense)
                sent = self._substitute_synonyms(sent)
                
                # Randomly inject transition words at the start of some sentences
                if i > 0 and random.random() < 0.15:
                    sent = self._inject_transition(sent)
                    
                # Alter punctuation slightly
                sent = self._vary_punctuation(sent)
                
                processed_sentences.append(sent)
            
            # 3. Burstiness variation (combine or split sentences theoretically, 
            # here we simply join with varied spacing to mimic human typing)
            humanized_p = " ".join(processed_sentences)
            
            # 4. Subtle human inconsistencies (e.g. double spaces, missing comma)
            humanized_p = self._add_inconsistencies(humanized_p)
            
            humanized_paragraphs.append(humanized_p)
            
        return "\n\n".join(humanized_paragraphs)

    def _apply_contractions(self, text: str) -> str:
        for full, contracted in self.contractions.items():
            # Apply with 70% probability to keep it natural
            if random.random() < 0.7:
                text = re.sub(rf'\b{full}\b', contracted, text, flags=re.IGNORECASE)
        return text

    def _substitute_synonyms(self, text: str) -> str:
        words = text.split()
        new_words = []
        for word in words:
            clean_word = re.sub(r'[^\w]', '', word)
            if len(clean_word) > 4 and random.random() < 0.05: # Only 5% chance to substitute
                synsets = wordnet.synsets(clean_word)
                if synsets:
                    lemmas = synsets[0].lemmas()
                    if lemmas:
                        synonym = random.choice(lemmas).name().replace('_', ' ')
                        # Preserve capitalization
                        if word[0].isupper():
                            synonym = synonym.capitalize()
                        # Keep original punctuation
                        new_word = word.replace(clean_word, synonym)
                        new_words.append(new_word)
                        continue
            new_words.append(word)
        return " ".join(new_words)

    def _inject_transition(self, text: str) -> str:
        transition = random.choice(self.transitions)
        if text and text[0].isupper():
            return f"{transition} {text[0].lower()}{text[1:]}"
        return f"{transition} {text}"

    def _vary_punctuation(self, text: str) -> str:
        # Occasionally replace period with an ellipsis or exclamation (very rare)
        if text.endswith('.') and random.random() < 0.05:
            return text[:-1] + "..."
        if text.endswith('.') and random.random() < 0.02:
            return text[:-1] + "!"
        return text

    def _add_inconsistencies(self, text: str) -> str:
        # Double space after period occasionally
        if random.random() < 0.3:
            text = text.replace(". ", ".  ")
        return text
