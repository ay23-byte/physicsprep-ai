const assert = require("node:assert/strict");
const test = require("node:test");
const { validateMcqOptions } = require("./mcqValidation.cjs");

const mathematicalOptions = [
  "p / P = Q / q",
  "P / p = Q / q",
  "p / P = -Q / q",
  "P / p = -Q / q",
];

test("accepts four distinct mathematical options", () => {
  const result = validateMcqOptions(
    mathematicalOptions,
    "p / P = -Q / q"
  );

  assert.equal(result.hasExactlyFourOptions, true);
  assert.equal(result.hasBlankOrInvalidOption, false);
  assert.equal(result.hasDuplicateOptions, false);
  assert.equal(result.answerMatchesOption, true);
});

test("preserves case-sensitive mathematical variables", () => {
  const result = validateMcqOptions(
    ["p", "P", "q", "Q"],
    "P"
  );

  assert.equal(result.hasDuplicateOptions, false);
  assert.equal(result.answerMatchesOption, true);
});

test("detects duplicates that differ only by whitespace", () => {
  const result = validateMcqOptions(
    ["p/P = Q/q", "  p/P   =   Q/q  ", "P/p = Q/q", "P/p = -Q/q"],
    "p/P = Q/q"
  );

  assert.equal(result.hasDuplicateOptions, true);
});

test("rejects empty MCQ options", () => {
  const result = validateMcqOptions(
    ["Option A", "", "Option C", "Option D"],
    "Option A"
  );

  assert.equal(result.hasBlankOrInvalidOption, true);
});

test("requires exactly four MCQ options", () => {
  assert.equal(
    validateMcqOptions(["A", "B", "C"], "A").hasExactlyFourOptions,
    false
  );
  assert.equal(
    validateMcqOptions(["A", "B", "C", "D", "E"], "A")
      .hasExactlyFourOptions,
    false
  );
});

test("requires the answer to match an option", () => {
  const result = validateMcqOptions(
    ["Option A", "Option B", "Option C", "Option D"],
    "Option E"
  );

  assert.equal(result.answerMatchesOption, false);
});
