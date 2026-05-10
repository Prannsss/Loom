# Loom AI Text Analysis

Loom AI is an advanced text detection and humanization platform. It is designed to analyze documents or raw text to determine the statistical likelihood of artificial intelligence authorship and provides a sophisticated hybrid pipeline to rewrite ("humanize") AI-generated content into natural, human-like prose.

## Core Features

- **AI Detection and Confidence Scoring**
  Analyzes input text against language models to evaluate structural uniformity, repetitive patterns, and deterministic phrasing. The results are presented through a dual-arc gauge showing exact percentage likelihoods for AI versus Human authorship.

- **Hybrid Humanization Pipeline**
  To rewrite text naturally without triggering "anti-AI" heuristics, the system uses a two-stage process:
  1.  **Semantic Rewrite (LLM Layer):** A configurable AI provider restructures the text strictly preserving meaning and intent based on the desired tone.
  2.  **Structural Manipulation (Python NLP Layer):** The text is passed through a deterministic Python backend powered by spaCy and NLTK. This layer introduces natural text burstiness, rhythm variations, contextual contractions, transition injections, and subtle human-like typing inconsistencies.

- **Diff Viewer and Refinement**
  The user interface features a side-by-side difference viewer to compare original and humanized texts. Users can supply subsequent refinement notes to continuously adjust the output tone.

- **Multi-Provider AI Support**
  Supports various advanced language models for semantic processing, including Gemini (with built-in fallback cascades), Claude, OpenAI GPT models, DeepSeek, MiniMax, and GLM. Keys can be managed locally via the application settings.

- **Document Extraction**
  Users can upload PDF and DOCX files. The extraction is handled robustly by the Python backend utilizing `pdfplumber` and `python-docx` to preserve formatting for analysis.

## Technology Stack

- **Frontend:** Next.js (App Router), React, Tailwind CSS
- **Backend (Node):** Next.js Server Actions for UI orchestration and LLM communication
- **Backend (Python):** FastAPI service for document parsing and NLP transformations
- **NLP Libraries:** spaCy, NLTK (WordNet), TextBlob, pyinflect

---

## Local Environment Setup

Running Loom AI requires running both the Next.js frontend server and the Python FastAPI backend service concurrently.

### Prerequisites

- Node.js (v18 or higher)
- Python (3.9 or higher)
- Git

### 1. Frontend Setup (Next.js)

1.  Navigate to the root directory of the project.
2.  Install the Node.js dependencies:
    ```bash
    npm install
    ```
3.  Start the Next.js development server:
    ```bash
    npm run dev
    ```
    The frontend will be available at `http://localhost:3000`.

### 2. Backend Setup (Python NLP Service)

The Python service handles document parsing and deterministic NLP humanization. It must be running on port 8000 for the frontend to function correctly.

1.  Navigate to the Python service directory:
    ```bash
    cd python-service
    ```
2.  (Optional but recommended) Create and activate a virtual environment:
    **Windows:**
    ```bash
    python -m venv venv
    venv\Scripts\activate
    ```
    **macOS/Linux:**
    ```bash
    python3 -m venv venv
    source venv/bin/activate
    ```
3.  Install the required Python packages:
    ```bash
    pip install -r requirements.txt
    ```
4.  Download the required spaCy language model:
    ```bash
    python -m spacy download en_core_web_sm
    ```
    _Note: NLTK corpora (such as WordNet) will automatically download upon starting the server for the first time._
5.  Start the FastAPI server:
    ```bash
    python main.py
    ```
    The backend service will start at `http://localhost:8000`.

### 3. Application Configuration

1.  Open your browser and navigate to `http://localhost:3000`.
2.  Click the Settings icon in the header to open the configuration sidebar.
3.  Select your preferred AI provider (e.g., Gemini, Claude) and input your corresponding API key. These keys are stored securely in your browser's `localStorage`.
4.  You are now ready to upload documents or paste text to begin analysis and humanization.
