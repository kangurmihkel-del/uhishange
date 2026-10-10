import type { AgreementSnapshot, FeePolicy } from './types.js';
import { PLATFORM_FEE_BASIS_POINTS } from './constants.js';

export const CURRENT_FEE_POLICY: Readonly<FeePolicy> = Object.freeze({
  version: 'contract-price-v1',
  basisPoints: PLATFORM_FEE_BASIS_POINTS,
  minimumCents: 1000,
});

/** Gross fee, rounded half-up per association; no additional VAT is added. */
export function calculatePlatformFee(amountCents: number, policy: FeePolicy): number {
  if (
    !Number.isSafeInteger(amountCents) ||
    amountCents < 0 ||
    !Number.isSafeInteger(policy.basisPoints) ||
    policy.basisPoints < 0 ||
    policy.basisPoints > 10000 ||
    !Number.isSafeInteger(policy.minimumCents) ||
    policy.minimumCents < 0
  )
    throw new RangeError(
      'Fees require nonnegative safe integer cents and basis points up to 10000.',
    );
  const percentage = Number((BigInt(amountCents) * BigInt(policy.basisPoints) + 5000n) / 10000n);
  return Math.max(percentage, policy.minimumCents);
}

/** Missing metadata identifies the original deposit-based agreement, never today's price policy. */
export function feePolicyForSnapshot(
  snapshot: Pick<AgreementSnapshot, 'feeBasisPoints' | 'feePolicy'>,
): FeePolicy {
  return (
    snapshot.feePolicy ?? {
      version: 'deposit-v1',
      basisPoints: snapshot.feeBasisPoints,
      minimumCents: 0,
    }
  );
}
