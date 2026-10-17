
import "dotenv/config";
import { GoogleGenAI } from "@google/genai";

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY is missing from .env");
    process.exitCode = 1;
    return;
  }

  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
  });

  try {
    console.log("Checking models available to your Gemini API key...\n");

    const pager = await ai.models.list();

    for await (const model of pager) {
      console.log("Model:", model.name);
      console.log(
        "Supported actions:",
        model.supportedActions ?? model.supportedGenerationMethods ?? "Not listed"
      );
      console.log("-----------------------------------");
    }
  } catch (error) {
    console.error("Could not list models.");
    console.error("Status:", error.status ?? error.code ?? "Unknown");
    console.error("Message:", error.message);
  }
}

main();
