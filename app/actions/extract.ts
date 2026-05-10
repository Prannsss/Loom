"use server";

import pdfParse from "pdf-parse";
import mammoth from "mammoth";

export async function extractTextFromFile(formData: FormData): Promise<{ text: string; error?: string }> {
  try {
    const file = formData.get("file") as File;
    if (!file) {
      return { text: "", error: "No file provided" };
    }

    // Forward the file directly to the Python backend extraction service
    const pyRes = await fetch("http://localhost:8000/extract", {
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
