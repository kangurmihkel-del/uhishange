import type { ReactNode } from 'react';
import type { AcceptanceSnapshot, FinalContractSnapshot, Organization } from '../shared/types';
import { date, euro, number } from './api';
import { isSnowService, serviceLabel } from '../shared/serviceForms';
import { feePolicyForSnapshot } from '../shared/pricing';
import ServiceScope from './ServiceScope';
import FeeTerms, { feeAmounts, feePolicyText } from './FeeTerms';

type Snapshot = AcceptanceSnapshot | FinalContractSnapshot;

function Fact({
  label,
  children,
  testId,
}: {
  label: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd data-testid={testId}>{children}</dd>
    </div>
  );
}
function Party({ label, organization }: { label: string; organization: Organization }) {
  return (
    <div className="agreement-party">
      <h5>{label}</h5>
      <strong>{organization.name}</strong>
      <p>{organization.address}</p>
      <span>Registrikood: {organization.registryCode}</span>
    </div>
  );
}

export default function AgreementHistory({ snapshot }: { snapshot: Snapshot }) {
  const final = 'finalizedAt' in snapshot;
  const spec = snapshot.spec;
  const snow = isSnowService(spec);
  const policy = feePolicyForSnapshot(snapshot);
  const finalAmounts = final
    ? feeAmounts(snapshot.finalPriceCents, snapshot.depositCents, policy)
    : undefined;
  return (
    <section
      className="agreement-history"
      aria-label="Salvestatud kokkulepe"
      data-testid="agreement-history"
    >
      <p className="agreement-history-note">
        See on {final ? 'lepingu loomisel' : 'liitumisel'} salvestatud kokkulepe. Hilisemad
        profiilimuudatused ega loobumine ei muuda selle sisu.
      </p>
      <h4>{snapshot.title}</h4>
      {snapshot.description && <p className="agreement-description">{snapshot.description}</p>}
      <dl className="agreement-facts">
        <Fact label={final ? 'Leping loodud' : 'Liitumine kinnitatud'}>
          {date(final ? snapshot.finalizedAt : snapshot.acceptedAt, true)}
        </Fact>
        <Fact label="Liitumise tähtaeg">{date(snapshot.joinDeadlineAt, true)}</Fact>
      </dl>
      <div className="agreement-parties">
        <Party label="Tellija" organization={snapshot.buyerOrganization} />
        <Party label="Teenusepakkuja" organization={snapshot.supplierOrganization} />
        <Party label="Hanke algataja" organization={snapshot.initiatorOrganization} />
      </div>
      <h5>Teenuse ulatus</h5>
      <p className="agreement-form-label">
        {serviceLabel(spec)}
        {'formId' in spec ? ` · vormi versioon ${spec.version}` : ' · varasem lumekoristuse vorm'}
      </p>
      <ServiceScope spec={spec} className="agreement-facts" />
      <h5>Hinnad ühe ühistu kohta</h5>
      <dl className="agreement-facts">
        <Fact label={snow ? 'Hooaja tavahind' : 'Teenuse tavahind'}>
          {euro(snapshot.basePriceCents)}
        </Fact>
        <Fact label="Testtagatis">{euro(snapshot.depositCents)}</Fact>
        {final && (
          <>
            <Fact label={snow ? 'Lõplik hooaja hind' : 'Lõplik teenuse hind'}>
              {euro(snapshot.finalPriceCents)}
            </Fact>
            <Fact label="Hinna sisse arvestatud testtagatis">
              {euro(snapshot.depositCreditCents)}
            </Fact>
            <Fact label="Ülejäänud teenuse tasu">{euro(snapshot.remainingInvoiceCents)}</Fact>
            <Fact label="Portaali teenustasu · TEST" testId="contract-service-fee">
              {euro(snapshot.serviceFeeCents ?? finalAmounts!.fee)}
            </Fact>
            <Fact label="Teenusepakkujale tagatisest · TEST" testId="supplier-deposit-payout">
              {euro(snapshot.supplierPayoutCents ?? finalAmounts!.payout)}
            </Fact>
          </>
        )}
        <Fact label="Salvestatud teenustasu tingimus">{feePolicyText(policy)}</Fact>
        <Fact label="Teenustasu maksja">Teenusepakkuja</Fact>
      </dl>
      <FeeTerms policy={policy} />
      <p className="fee-terms">
        Enne hanke õnnestumist loobudes tagastatakse kogu makstud testtagatis. Pärast õnnestumist
        enne lepingu loomist loobudes jääb tagatis alles; teenustasu on{' '}
        {number(policy.basisPoints / 100)}% allesjäetud tagatisest, miinimumtasuta. Pärast lepingu
        loomist loobudes jääb salvestatud teenustasu arvestus kehtima. Teenusepakkuja tühistamise
        korral tagastatakse kogu makstud testtagatis ja teenustasu arvestus pööratakse tagasi.
      </p>
      <ul className="agreement-tiers" aria-label="Salvestatud hinnatasemed">
        {snapshot.tiers.map((tier, index) => (
          <li key={tier.minParticipants}>
            <span>
              Vähemalt {number(tier.minParticipants)} ühistut
              {index === 0 ? ' · õnnestumise lävend' : ''}
            </span>
            <strong>{euro(tier.priceCents)}</strong>
          </li>
        ))}
      </ul>
      <h5>Teenusepakkuja tingimused</h5>
      <p className="agreement-terms">{snapshot.terms}</p>
      {!final && (
        <p className="agreement-confirmations">
          Esindusõigus ja ühise teenuse ulatus kinnitatud liitumisel.
        </p>
      )}
      <p className="agreement-test-note">
        TESTMAKSE · Tegelikku raha ei liigu. Ülejäänud teenuse tasu arveldatakse otse
        teenusepakkujaga. Tühistatud lepingu hinnad säilivad ajaloona.
      </p>
    </section>
  );
}
