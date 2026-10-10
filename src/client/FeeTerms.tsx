import type { FeePolicy } from '../shared/types';
import { calculatePlatformFee } from '../shared/pricing';
import { euro, number } from './api';

export function feePolicyText(policy: FeePolicy) {
  const rate = `${number(policy.basisPoints / 100)}%`;
  return policy.version === 'contract-price-v1'
    ? `${rate} ühe ühistu lõplikust teenuse brutohinnast, vähemalt ${euro(policy.minimumCents)}`
    : `${rate} testtagatisest, miinimumtasuta`;
}

export default function FeeTerms({ policy }: { policy: FeePolicy }) {
  return (
    <p className="fee-terms">
      <strong>
        {policy.version === 'deposit-v1'
          ? 'Salvestatud varasem teenustasu'
          : 'Teenusepakkuja teenustasu'}
        :
      </strong>{' '}
      {feePolicyText(policy)}. Tasu arvestatakse testtagatisest. Ühistule lisatasu ei lisandu; kogu
      tagatis vähendab teenuse tasu.
      {policy.version === 'contract-price-v1' &&
        ' Teenustasu sisaldab käibemaksu, kui see kohaldub.'}
    </p>
  );
}

export function feeAmounts(priceCents: number, depositCents: number, policy: FeePolicy) {
  const fee = calculatePlatformFee(
    policy.version === 'contract-price-v1' ? priceCents : depositCents,
    policy,
  );
  return { fee, payout: depositCents - fee };
}

export function SupplierFeePreview({
  tiers,
  depositCents,
  policy,
  live = false,
}: {
  tiers: Array<{ minParticipants?: number; priceCents: number }>;
  depositCents?: number;
  policy: FeePolicy;
  live?: boolean;
}) {
  if (!tiers.length) return null;
  return (
    <section
      className="supplier-fee-preview"
      data-testid={live ? 'service-fee-preview' : 'offer-fee-preview'}
      aria-label="Teenusepakkuja teenustasu arvestus"
      aria-live={live ? 'polite' : undefined}
    >
      <h4>Teenusepakkuja arvestus ühe ühistu kohta</h4>
      <p>TESTARVESTUS · Lõplik tasu selgub saavutatud hinnatasemest.</p>
      <div className="fee-preview-rows">
        {tiers.map((tier, index) => {
          const { fee, payout } = feeAmounts(tier.priceCents, depositCents ?? 0, policy);
          return (
            <dl className="fee-preview-row" data-testid="service-fee-row" key={index}>
              <div>
                <dt>
                  {tier.minParticipants
                    ? `${number(tier.minParticipants)}+ ühistut`
                    : `Hinnatase ${number(index + 1)}`}
                </dt>
                <dd>{euro(tier.priceCents)}</dd>
              </div>
              <div>
                <dt>Portaali teenustasu</dt>
                <dd>{euro(fee)}</dd>
              </div>
              <div>
                <dt>Teenusepakkujale tagatisest</dt>
                <dd>
                  {depositCents === undefined
                    ? 'Sisesta tagatis'
                    : payout < 0
                      ? 'Tagatis on teenustasust väiksem.'
                      : euro(payout)}
                </dd>
              </div>
            </dl>
          );
        })}
      </div>
    </section>
  );
}
