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

test("rejects empty source text before calling Gemini", async () => {
  let called = false;
  await assert.rejects(
    generatePhysicsQuestions({
      sourceText: "   ",
      topic: "Classical Mechanics",
      count: 1,
      difficulty: "Medium",
      questionType: "MCQ",
      generateContent: async () => {
        called = true;
        return { text: JSON.stringify({ questions: [validQuestion()] }) };
      },
    }),
    /source text is empty/i
  );
  assert.equal(called, false);
});

test("rejects zero, fractional, and non-numeric question counts", async (t) => {
  for (const count of [0, -1, 1.5, "not-a-number"]) {
    await t.test(String(count), async () => {
      await assert.rejects(
        generatePhysicsQuestions({
          sourceText,
          topic: "Classical Mechanics",
          count,
          difficulty: "Medium",
          questionType: "MCQ",
          generateContent: async () => ({ text: "{}" }),
        }),
        /positive integer/i
      );
    });
  }
});

test("rejects a response with the wrong number of questions", async () => {
  await assert.rejects(
    generatePhysicsQuestions({
      sourceText,
      topic: "Classical Mechanics",
      count: 2,
      difficulty: "Medium",
      questionType: "MCQ",
      generateContent: async () => ({
        text: JSON.stringify({ questions: [validQuestion()] }),
      }),
    }),
    /expected 2 questions/i
  );
});

test("rejects MCQs with duplicate options or an answer not in the options", async (t) => {
  const cases = [
    {
      name: "duplicate options",
      mutate(question) {
        question.options[1] = question.options[0];
      },
    },
    {
      name: "answer not present",
      mutate(question) {
        question.answer = "Momentum";
      },
    },
    {
      name: "not four options",
      mutate(question) {
        question.options = ["Energy", "Force", "Velocity"];
      },
    },
  ];

  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      const question = validQuestion();
      scenario.mutate(question);
      await assert.rejects(
        generatePhysicsQuestions({
          sourceText,
          topic: "Classical Mechanics",
          count: 1,
          difficulty: "Medium",
          questionType: "MCQ",
          generateContent: async () => ({
            text: JSON.stringify({ questions: [question] }),
          }),
        }),
        /invalid mcq/i
      );
    });
  }
});

test("retries a temporary Gemini error once and succeeds", async () => {
  let calls = 0;
  const questions = await generatePhysicsQuestions({
    sourceText,
    topic: "Classical Mechanics",
    count: 1,
    difficulty: "Medium",
    questionType: "MCQ",
    generateContent: async () => {
      calls += 1;
      if (calls === 1) {
        const error = new Error("Temporary overload");
        error.status = 503;
        throw error;
      }
      return { text: JSON.stringify({ questions: [validQuestion()] }) };
    },
  });

  assert.equal(calls, 2);
  assert.equal(questions.length, 1);
});

test("does not retry non-temporary Gemini errors", async () => {
  let calls = 0;
  const authError = new Error("Invalid API key");
  authError.status = 401;

  await assert.rejects(
    generatePhysicsQuestions({
      sourceText,
      topic: "Classical Mechanics",
      count: 1,
      difficulty: "Medium",
      questionType: "MCQ",
      generateContent: async () => {
        calls += 1;
        throw authError;
      },
    }),
    /invalid api key/i
  );
  assert.equal(calls, 1);
});

test("rejects an empty Gemini response", async () => {
  await assert.rejects(
    generatePhysicsQuestions({
      sourceText,
      topic: "Classical Mechanics",
      count: 1,
      difficulty: "Medium",
      questionType: "MCQ",
      generateContent: async () => ({ text: "" }),
    }),
    /empty response/i
  );
});

