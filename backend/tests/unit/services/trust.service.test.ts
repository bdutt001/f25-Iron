import { applyTrustScoreDeduction, normalizeSeverity } from "../../../src/services/trust.service";

describe("trust.service", () => {
  describe("normalizeSeverity", () => {
    it("defaults to fallback when value is not finite", () => {
      expect(normalizeSeverity("not a number", 5)).toBe(5);
      expect(normalizeSeverity(NaN, 7)).toBe(7);
      expect(normalizeSeverity(undefined, 3)).toBe(3);
    });

    it("floors values and clamps to min/max", () => {
      expect(normalizeSeverity(1.9)).toBe(1);
      expect(normalizeSeverity(0)).toBe(1);
      expect(normalizeSeverity(-5)).toBe(1);
      expect(normalizeSeverity(150)).toBe(99);
    });

    it("coerces numeric strings", () => {
      expect(normalizeSeverity("10")).toBe(10);
      expect(normalizeSeverity("42.8")).toBe(42);
    });
  });

  describe("applyTrustScoreDeduction", () => {
    it("deducts severity * 2 and clamps at 0", () => {
      expect(applyTrustScoreDeduction(100, 5)).toEqual({ deduction: 10, nextScore: 90 });
      expect(applyTrustScoreDeduction(5, 5)).toEqual({ deduction: 10, nextScore: 0 });
    });

    it("normalizes severity input before calculating", () => {
      expect(applyTrustScoreDeduction(80, 1.8)).toEqual({ deduction: 2, nextScore: 78 });
      expect(applyTrustScoreDeduction(80, "200")).toEqual({ deduction: 198, nextScore: 0 });
    });

    it("handles invalid current scores gracefully", () => {
      expect(applyTrustScoreDeduction(NaN, 10)).toEqual({ deduction: 20, nextScore: 0 });
      expect(applyTrustScoreDeduction(-50, 1)).toEqual({ deduction: 2, nextScore: 0 });
    });
  });
});
