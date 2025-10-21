/**
 * Utility helpers for normalizing report severity values and computing trust score deductions.
 */

const MIN_SEVERITY = 1;
const MAX_SEVERITY = 99;
const DEDUCTION_MULTIPLIER = 2;

/**
 * Normalize a raw severity input into an integer within the allowed range.
 */
export const normalizeSeverity = (value: unknown, fallback = MIN_SEVERITY): number => {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  const floored = Math.floor(numeric);
  if (!Number.isFinite(floored)) {
    return fallback;
  }
  return Math.min(MAX_SEVERITY, Math.max(MIN_SEVERITY, floored));
};

export type TrustScoreAdjustment = {
  deduction: number;
  nextScore: number;
};

/**
 * Calculate the deduction and resulting trust score after applying a severity value.
 */
export const applyTrustScoreDeduction = (
  currentScore: number,
  severity: number
): TrustScoreAdjustment => {
  const safeCurrent = Number.isFinite(currentScore) ? Math.max(0, Math.floor(currentScore)) : 0;
  const normalizedSeverity = normalizeSeverity(severity);
  const deduction = normalizedSeverity * DEDUCTION_MULTIPLIER;
  const nextScore = Math.max(0, safeCurrent - deduction);

  return { deduction, nextScore };
};
