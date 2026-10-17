import assert from "node:assert/strict";
import test from "node:test";
import { validateGeneratedQuestionList } from "./generatedQuestionValidation.js";

test("rejects malformed Gemini question responses", () => {
  assert.throws(
    () =>
      validateGeneratedQuestionList(
        {
          questions: [
            {
              question: "Which quantity is conserved?",
              options: "not an option list",
              answer: "Energy",
              explanation: "Energy is conserved.",
            },
          ],
        },
        { requestedCount: 1, questionType: "MCQ" }
      ),
    /malformed question/i
  );
});

test("rejects incomplete questions even when evidence is present", () => {
  assert.throws(
    () =>
      validateGeneratedQuestionList(
        {
          questions: [
            {
              question: "Which quantity is conserved?",
              options: ["Energy", "Force", "Velocity", "Position"],
              answer: "Energy",
              sourceEvidence: "Energy is conserved.",
              topic: "Classical Mechanics",
              difficulty: "Medium",
            },
          ],
        },
        { requestedCount: 1, questionType: "MCQ" }
      ),
    /malformed question/i
  );
});


test("rejects missing or placeholder source evidence", () => {
  const completeQuestion = {
    question: "Which quantity is conserved?",
    options: ["Energy", "Force", "Velocity", "Position"],
    answer: "Energy",
    explanation: "Energy is conserved in an isolated system.",
    sourceEvidence: "Energy is conserved in an isolated system.",
    topic: "Classical Mechanics",
    difficulty: "Medium",
  };

  for (const sourceEvidence of [
    "",
    "   ",
    "No supporting quotation was provided.",
    "Test question for checking the save and review workflow",
  ]) {
    assert.throws(
      () =>
        validateGeneratedQuestionList(
          {
            questions: [{ ...completeQuestion, sourceEvidence }],
          },
          { requestedCount: 1, questionType: "MCQ" }
        ),
      /malformed question/i
    );
  }
});
