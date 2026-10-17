import mcqValidation from "../utils/mcqValidation.cjs";

const { validateMcqOptions } = mcqValidation;
const DIFFICULTIES = ["Easy", "Medium", "Hard"];

export function validateGeneratedQuestionList(
  result,
  { requestedCount, questionType }
) {
  if (
    !result ||
    !Array.isArray(result.questions) ||
    result.questions.length !== requestedCount
  ) {
    throw new Error(
      `Gemini returned an invalid question list. Expected ${requestedCount} questions.`
    );
  }

  for (const question of result.questions) {
    if (
      !question ||
      typeof question !== "object" ||
      typeof question.question !== "string" ||
      !question.question.trim() ||
      !Array.isArray(question.options) ||
      typeof question.answer !== "string" ||
      !question.answer.trim() ||
      typeof question.explanation !== "string" ||
      !question.explanation.trim() ||
      typeof question.sourceEvidence !== "string" ||
      !question.sourceEvidence.trim() ||
      /no supporting quotation was provided|test question for checking the save and review workflow/i.test(question.sourceEvidence.trim()) ||
      typeof question.topic !== "string" ||
      !question.topic.trim() ||
      !DIFFICULTIES.includes(question.difficulty)
    ) {
      throw new Error(
        "Gemini returned a malformed question. Please retry."
      );
    }

    if (questionType === "MCQ") {
      const mcqOptions = validateMcqOptions(
        question.options,
        question.answer
      );

      if (
        !mcqOptions.hasExactlyFourOptions ||
        mcqOptions.hasBlankOrInvalidOption ||
        mcqOptions.hasDuplicateOptions ||
        !mcqOptions.answerMatchesOption
      ) {
        throw new Error(
          "Gemini returned an invalid MCQ. Please retry."
        );
      }
    }
  }

  return result.questions;
}
