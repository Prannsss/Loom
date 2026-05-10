"use server";

import pdfParse from "pdf-parse";
import mammoth from "mammoth";

/** Python backend service URL (configurable via environment variable) */
const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL ?? "http://127.0.0.1:8000";

export async function extractTextFromFile(formData: FormData): Promise<{ text: string; error?: string }> {
  try {
    const file = formData.get("file") as File;
    if (!file) {
      return { text: "", error: "No file provided" };
    }

    // Forward the file directly to the Python backend extraction service
    const pyRes = await fetch(`${PYTHON_SERVICE_URL}/extract`, {
      method: "POST",
      body: formData,
    });

    if (!pyRes.ok) {
      const errText = await pyRes.text();
      throw new Error(`Python extraction service error: ${errText}`);
    }

    const data = await pyRes.json();
    return { text: data.text || "" };

  } catch (error: any) {
    console.error("Error extracting text:", error);
    return { text: "", error: "Failed to extract text from the document. Ensure Python service is running on port 8000." };
  }
}
