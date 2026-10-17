
import { GoogleGenAI } from "@google/genai";
import { validateGeneratedQuestionList } from "./generatedQuestionValidation.js";

const model =
  process.env.GEMINI_MODEL || "gemini-3.8-flash";

function getGenerateContent() {
  const apiKey =
    process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    throw new Error(
      "Missing API key. Set GEMINI_API_KEY or GOOGLE_API_KEY in .env."
    );
  }

  const ai = new GoogleGenAI({ apiKey });

  return (request) => ai.models.generateContent(request);
}

function parseGeminiJson(rawText) {
  const cleaned = rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");

    if (start === -1 || end <= start) {
      throw new Error("Gemini did not return valid JSON.");
    }

    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      throw new Error(
        "Gemini returned malformed JSON. Please retry."
      );
    }
  }
}

export async function generatePhysicsQuestions({
  sourceText,
  topic,
  count,
  difficulty,
  questionType,
  generateContent = null,
}) {
  if (!sourceText || !sourceText.trim()) {
    throw new Error("Source text is empty. Upload a readable PDF first.");
  }

  if (!Number.isInteger(Number(count)) || Number(count) < 1) {
    throw new Error("Question count must be a positive integer.");
  }

  const requestedCount = Number(count);

  const prompt = `
You are a physics question-generation assistant.

Generate exactly ${requestedCount} physics questions.

Topic: ${topic}
Difficulty: ${difficulty}
Question type: ${questionType}

Use the source text below as the main reference.
Do not invent facts unsupported by the source.
Make the questions scientifically accurate and unambiguous.

Return only valid JSON in this format:
{
  "questions": [
    {
      "question": "Question text",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "answer": "Correct option or numerical answer",
      "explanation": "Brief explanation based on physics",
      "sourceEvidence": "Exact quotation copied from the source text",
      "topic": "${topic}",
      "difficulty": "${difficulty}"
    }
  ]
}

Rules:
- For MCQs, provide exactly four options.
- For numerical questions, options may be an empty array.
- Ensure the answer matches one option for MCQs.
- For every question, provide sourceEvidence as an exact quotation copied from SOURCE TEXT.
- The quotation must directly support the question or its answer.
- Do not invent, paraphrase, shorten, or add page numbers, citations, or quotation marks not present in the source.
- Do not include Markdown fences.
- Return exactly ${requestedCount} questions.

SOURCE TEXT:
${sourceText.slice(0, 30000)}
`;

  let response;
  let lastError;
  const requestGeneration = generateContent || getGenerateContent();

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      response = await requestGeneration({
        model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          temperature: 0.4
        }
      });

      break;
    } catch (error) {
      lastError = error;

      const status = Number(error?.status);

      const temporary = [429, 500, 502, 503, 504].includes(status);

      if (!temporary || attempt === 1) {
        throw error;
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  if (!response) {
    throw lastError || new Error("Gemini generation failed.");
  }

  const rawText = response.text;

  if (!rawText) {
    throw new Error("Gemini returned an empty response.");
  }

  const result = parseGeminiJson(rawText);

  return validateGeneratedQuestionList(result, {
    requestedCount,
    questionType,
  });
}
