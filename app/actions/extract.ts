"use server";

import pdfParse from "pdf-parse";
import mammoth from "mammoth";

export async function extractTextFromFile(formData: FormData): Promise<{ text: string; error?: string }> {
  try {
    const file = formData.get("file") as File;
    if (!file) {
      return { text: "", error: "No file provided" };
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (file.type === "application/pdf") {
      const data = await pdfParse(buffer);
      return { text: data.text || "" };
    } else if (
      file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      file.name.endsWith(".docx")
    ) {
      const result = await mammoth.extractRawText({ buffer });
      return { text: result.value || "" };
    } else {
      return { text: "", error: "Unsupported file type. Please upload a PDF or DOCX file." };
    }
  } catch (error: any) {
    console.error("Error extracting text:", error);
    return { text: "", error: error.message || "Failed to extract text from the document." };
  }
}
