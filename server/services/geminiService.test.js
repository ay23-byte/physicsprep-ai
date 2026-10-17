import assert from "node:assert/strict";
import test from "node:test";
import { generatePhysicsQuestions } from "./geminiService.js";

const sourceText = "Energy is conserved for an isolated system.";

function validQuestion() {
  return {
    question: "What is conserved for an isolated system?",
    options: ["Energy", "Force", "Velocity", "Position"],
    answer: "Energy",
    explanation: "The supplied text states that energy is conserved.",
    sourceEvidence: "Energy is conserved for an isolated system.",
    topic: "Classical Mechanics",
    difficulty: "Medium",
  };
}

test("uses a mocked Gemini response with structured evidence", async () => {
  let request;
  const questions = await generatePhysicsQuestions({
    sourceText,
    topic: "Classical Mechanics",
    count: 1,
    difficulty: "Medium",
    questionType: "MCQ",
    generateContent: async (nextRequest) => {
      request = nextRequest;
      return { text: JSON.stringify({ questions: [validQuestion()] }) };
    },
  });

  assert.equal(questions[0].sourceEvidence, sourceText);
  assert.match(request.contents, /sourceEvidence/);
  assert.match(request.contents, /"topic": "Classical Mechanics"/);
  assert.match(request.contents, /"difficulty": "Medium"/);
});

test("rejects incomplete mocked Gemini responses despite valid evidence", async () => {
  const incompleteQuestion = validQuestion();
  delete incompleteQuestion.explanation;

  await assert.rejects(
    generatePhysicsQuestions({
      sourceText,
      topic: "Classical Mechanics",
      count: 1,
      difficulty: "Medium",
      questionType: "MCQ",
      generateContent: async () => ({
        text: JSON.stringify({ questions: [incompleteQuestion] }),
      }),
    }),
    /malformed question/i
  );
});

test("rejects malformed mocked Gemini JSON", async () => {
  await assert.rejects(
    generatePhysicsQuestions({
      sourceText,
      topic: "Classical Mechanics",
      count: 1,
      difficulty: "Medium",
      questionType: "MCQ",
      generateContent: async () => ({ text: "not valid JSON" }),
    }),
    /valid JSON/i
  );
});
