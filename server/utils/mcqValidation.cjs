function normalizeMcqOption(option) {
  if (typeof option !== "string") return "";

  return option.trim().replace(/\s+/g, " ");
}

function getDuplicateMcqOptions(options) {
  if (!Array.isArray(options)) return [];

  const seenOptions = new Set();
  const duplicates = [];

  for (const option of options) {
    const normalizedOption = normalizeMcqOption(option);

    if (!normalizedOption) continue;

    if (seenOptions.has(normalizedOption)) {
      duplicates.push(normalizedOption);
    } else {
      seenOptions.add(normalizedOption);
    }
  }

  return duplicates;
}

function validateMcqOptions(options, answer) {
  const isOptionList = Array.isArray(options);

  return {
    hasExactlyFourOptions: isOptionList && options.length === 4,
    hasBlankOrInvalidOption:
      !isOptionList ||
      options.some(
        (option) =>
          typeof option !== "string" || !option.trim()
      ),
    hasDuplicateOptions: getDuplicateMcqOptions(options).length > 0,
    answerMatchesOption:
      typeof answer === "string" &&
      isOptionList &&
      options.some(
        (option) =>
          typeof option === "string" &&
          option.trim() === answer.trim()
      ),
  };
}

module.exports = {
  getDuplicateMcqOptions,
  normalizeMcqOption,
  validateMcqOptions,
};
