export const SAT_SIMULATOR_PRODUCT_ID = "5cf6e8e2-e6b1-4f8f-9d35-1c932866d6ef";

type Rational = { numerator: bigint; denominator: bigint };

const parseNumericAnswer = (raw: string): Rational | null => {
  const value = raw.trim().replace(/−/g, "-");
  if (value.length === 0 || value.length > 64) return null;

  const fraction = /^([+-]?\d+)\s*\/\s*(\d+)$/.exec(value);
  if (fraction) {
    const denominator = BigInt(fraction[2]);
    return denominator === 0n
      ? null
      : { numerator: BigInt(fraction[1]), denominator };
  }

  const decimal = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(value);
  if (!decimal) return null;
  const [, sign, whole, places = ""] = decimal;
  if (whole.length + places.length === 0) return null;

  const magnitude = BigInt(whole + places);
  return {
    numerator: sign === "-" ? -magnitude : magnitude,
    denominator: 10n ** BigInt(places.length),
  };
};

export const satNumericAnswerMatches = (
  actual: string,
  expected: readonly string[],
): boolean | null => {
  const numericKeys = expected.map(parseNumericAnswer).filter((
    key,
  ): key is Rational => key !== null);
  if (numericKeys.length === 0) return null;
  const answer = parseNumericAnswer(actual);
  return answer !== null &&
    numericKeys.some((key) =>
      answer.numerator * key.denominator === key.numerator * answer.denominator
    );
};
