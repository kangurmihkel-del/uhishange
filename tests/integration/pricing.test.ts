import { describe, expect, it } from 'vitest';
import {
  calculatePlatformFee,
  CURRENT_FEE_POLICY,
  feePolicyForSnapshot,
} from '../../src/shared/pricing.js';

describe('versioned gross service fees', () => {
  it('charges 10% of the deposit without a minimum and rounds exact cents half-up', () => {
    expect(CURRENT_FEE_POLICY).toEqual({
      version: 'deposit-v1',
      basisPoints: 1000,
      minimumCents: 0,
    });
    expect(calculatePlatformFee(10_000, CURRENT_FEE_POLICY)).toBe(1_000);
    expect(calculatePlatformFee(1_000, CURRENT_FEE_POLICY)).toBe(100);
    expect(calculatePlatformFee(10_004, CURRENT_FEE_POLICY)).toBe(1_000);
    expect(calculatePlatformFee(10_005, CURRENT_FEE_POLICY)).toBe(1_001);
    expect(
      calculatePlatformFee(Number.MAX_SAFE_INTEGER, {
        version: 'deposit-v1',
        basisPoints: 10000,
        minimumCents: 0,
      }),
    ).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('preserves frozen custom terms and treats missing metadata as the legacy deposit policy', () => {
    const policy = { version: 'contract-price-v1' as const, basisPoints: 500, minimumCents: 1234 };
    expect(feePolicyForSnapshot({ feeBasisPoints: 500, feePolicy: policy })).toBe(policy);
    expect(calculatePlatformFee(19_000, policy)).toBe(1234);
    expect(calculatePlatformFee(70_000, policy)).toBe(3500);
    expect(calculatePlatformFee(70_000, feePolicyForSnapshot({ feeBasisPoints: 625 }))).toBe(4_375);
    expect(feePolicyForSnapshot({ feeBasisPoints: 625 })).toEqual({
      version: 'deposit-v1',
      basisPoints: 625,
      minimumCents: 0,
    });
    expect(calculatePlatformFee(13, feePolicyForSnapshot({ feeBasisPoints: 400 }))).toBe(1);
    expect(calculatePlatformFee(12, feePolicyForSnapshot({ feeBasisPoints: 400 }))).toBe(0);
  });

  it('rejects fractional, negative and unsafe money or fee parameters', () => {
    for (const amount of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1])
      expect(() => calculatePlatformFee(amount, CURRENT_FEE_POLICY)).toThrow(RangeError);
    for (const basisPoints of [-1, 0.5, 10001])
      expect(() => calculatePlatformFee(1000, { ...CURRENT_FEE_POLICY, basisPoints })).toThrow(
        RangeError,
      );
    expect(() => calculatePlatformFee(1000, { ...CURRENT_FEE_POLICY, minimumCents: 0.5 })).toThrow(
      RangeError,
    );
  });
});
