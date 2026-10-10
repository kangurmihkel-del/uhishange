import { ArrowRight, Check, MapPin, Mail } from 'lucide-react';
import type { Organization, ProcurementDetail } from '../shared/types';
import { date } from './api';

export type FlowTarget =
  'offers' | 'offer-form' | 'neighbors' | 'participants' | 'join' | 'contracts';

export default function ProcurementFlow({
  detail,
  organization,
  representative,
  busy,
  onNavigate,
  onPublish,
}: {
  detail: ProcurementDetail;
  organization?: Organization;
  representative: boolean;
  busy: boolean;
  onNavigate: (target: FlowTarget) => void;
  onPublish: () => void;
}) {
  const { procurement: p, offers, commitments, contracts, invitations, nearby } = detail;
  const selected = offers.find((item) => item.id === p.selectedOfferId);
  const own = representative && organization?.id === p.organizationId;
  const supplier = representative && organization?.orgType === 'SUPPLIER';
  const commitment = commitments.find(
    (item) =>
      item.organizationId === organization?.id &&
      ['PENDING', 'ACTIVE', 'CONTRACTED'].includes(item.status),
  );
  const eligible =
    organization?.orgType === 'BUYER' &&
    (organization.id === p.organizationId || nearby.some((item) => item.id === organization.id));
  const terminal = ['FAILED', 'CANCELLED'].includes(p.status);
  const finalized = ['FINALIZED', 'COMPLETED'].includes(p.status);
  const expired = Date.now() >= new Date(p.joinDeadlineAt).getTime();
  const stage =
    p.status === 'DRAFT'
      ? 0
      : finalized
        ? 4
        : expired
          ? 3
          : commitment?.status === 'ACTIVE' || p.succeededAt
            ? 3
            : selected
              ? 2
              : 1;
  const steps = [
    'Avalda hange',
    'Kutsu naabrid ja vali pakkumine',
    'Liitu ja tee testmakse',
    'Oota liitumise tähtaega',
    'Leping ja teenuse lõpetamine',
  ];
  let title = '';
  let description = '';
  let label = '';
  let target: FlowTarget | undefined;
  let publish = false;
  if (terminal) {
    title = p.status === 'FAILED' ? 'Hange ei täitunud' : 'Hange on tühistatud';
    description =
      'Liitumine on suletud. TEST tagatiste tagastused ja varasem osalemine säilivad ajaloos.';
    label = 'Vaata osalemise ajalugu';
    target = 'participants';
  } else if (finalized) {
    title = p.status === 'COMPLETED' ? 'Teenus on lõpetatud' : 'Lepingud on valmis';
    description = contracts.length
      ? 'Ava leping, vaata lõpphinda ja TEST tagatise arvestust. Pärast teenuse osutamist märgi see lõpetatuks ja anna hinnang.'
      : 'Liitumine on lõppenud. Lepingud loodi jätkavatele ühistutele; sinu varasem osalemine säilib ajaloos.';
    label = contracts.length ? 'Vaata lepinguid' : 'Vaata osalemise ajalugu';
    target = contracts.length ? 'contracts' : 'participants';
  } else if (p.status === 'DRAFT') {
    title = 'Alusta hanke avaldamisest';
    description =
      'Pärast avaldamist saad kaardilt naabrid leida, neile kutsed saata ning pakkumisi koguda.';
    if (own) {
      label = 'Avalda hange';
      publish = true;
    } else
      description =
        'Algataja peab hanke avaldama. Seejärel saab kutsuda naabreid ja esitada pakkumisi.';
  } else if (expired) {
    title = 'Liitumise tähtaeg on lõppenud';
    description =
      'Töötleja koostab lepingud või tagastab ebaõnnestunud hanke TEST tagatised. Vaade uueneb automaatselt; uusi liitumisi enam ei kinnitata.';
    label = 'Vaata osalemise ajalugu';
    target = 'participants';
  } else if (!representative) {
    title = 'Tutvu hankega';
    description =
      'Pakkumise esitamiseks või ühistu liitmiseks on vajalik administraatori kinnitatud esindusõigus. Kutse seda õigust ei anna.';
    label = 'Vaata naabreid kaardil';
    target = 'neighbors';
  } else if (supplier) {
    if (p.frozenAt) {
      title = 'Pakkumise tingimused on kinnitatud';
      description =
        'Ühistud on alustanud liitumist. Jälgi hanke edenemist; tähtajal tekivad jätkavate ostjate lepingud.';
    } else if (selected?.organizationId === organization?.id) {
      title = 'Sinu pakkumine on valitud';
      description =
        'Ühistud saavad nüüd liituda ja tasuda TEST tagatise. Esimese liitumisega lukustuvad tingimused.';
    } else if (offers.some((item) => item.organizationId === organization?.id)) {
      title = 'Sinu pakkumine on esitatud';
      description =
        'Algataja võrdleb pakkumisi. Valiku teavitus jõuab sinu postkasti. Pakkumist saad muuta kuni esimese liitumiseni.';
    } else {
      title = 'Esita lumekoristuse pakkumine';
      description =
        'Määra hooaja brutohind, osalejate hinnatasemed ja TEST tagatis. Algataja valib ühe ühise pakkumise.';
    }
    const hasOffer = offers.some((item) => item.organizationId === organization?.id);
    label = !p.frozenAt && !hasOffer ? 'Esita pakkumine' : 'Vaata pakkumist';
    target = !p.frozenAt && !hasOffer ? 'offer-form' : 'offers';
  } else if (commitment?.status === 'PENDING') {
    title = 'Kinnita osalemine testmaksega';
    description =
      'Tingimused on kinnitatud. Ühistu läheb osalejate hulka alles pärast TEST tagatisraha makse kinnitamist. Tegelikku raha ei liigu.';
    label = 'Tee testmakse';
    target = 'join';
  } else if (commitment?.status === 'ACTIVE') {
    title = 'Sinu ühistu on liitunud';
    description =
      'TEST tagatis on makstud. Kutsu naabreid kaasa, et jõuda soodsama hinnatasemeni. Tähtajal luuakse õnnestunud hanke lepingud.';
    label = 'Vaata naabreid kaardil';
    target = 'neighbors';
  } else if (selected && eligible) {
    title = 'Pakkumine on valitud — liitu ühishankega';
    description =
      'Tutvu teenuse ulatuse ja tingimustega, kinnita esindusõigus ning seejärel tasu TEST tagatis. Ka algataja peab liitumise eraldi kinnitama.';
    label = 'Kinnita liitumine';
    target = 'join';
  } else if (own && offers.length && !selected) {
    title = 'Vali ühine teenusepakkuja';
    description =
      'Võrdle hooaja hindu ja tingimusi. Pärast ühe pakkumise valimist saavad ühistud oma osalemise kinnitada.';
    label = 'Võrdle ja vali pakkumine';
    target = 'offers';
  } else if (own && !invitations.length) {
    title = 'Kutsu naaberühistud kaasa';
    description =
      'Ava kaart ning saada sobivatele naabritele ja teenusepakkujatele kutsed. Kutsed jõuavad nende rakendusesisesesse postkasti.';
    label = 'Kutsu naabrid';
    target = 'neighbors';
  } else if (own && !selected) {
    title = 'Kutsed on saadetud — kogu pakkumisi';
    description =
      'Teenusepakkujad saavad lisada pakkumisi. Uue pakkumise teavitus jõuab postkasti; seejärel vali ühine teenusepakkuja.';
    label = 'Vaata pakkumisi';
    target = 'offers';
  } else {
    title = selected ? 'Vaata valitud pakkumist' : 'Oota algataja pakkumise valikut';
    description = selected
      ? 'Hankega saavad liituda piirkonda jäävad kinnitatud ühistute esindajad.'
      : 'Algataja valib ühe pakkumise enne liitumise algust. Kutse võid postkastis juba vastu võtta.';
    label = 'Vaata pakkumisi';
    target = 'offers';
  }
  return (
    <section
      className="procurement-flow card"
      data-testid="procurement-flow"
      aria-label="Hanke sammud"
    >
      <div className="flow-heading">
        <span className="eyebrow">HANKE TEEKOND</span>
        <span>Liitumise tähtaeg: {date(p.joinDeadlineAt, true)}</span>
      </div>
      <ol className="flow-steps">
        {steps.map((step, index) => (
          <li
            key={step}
            className={
              (index < stage ? 'done ' : '') + (index === stage && !terminal ? 'current' : '')
            }
            aria-current={index === stage && !terminal ? 'step' : undefined}
          >
            <span className="flow-step-number">
              {index < stage ? <Check size={16} /> : index + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <div className="flow-next" data-testid="next-action">
        <div>
          <span className="eyebrow">{terminal ? 'HANKE SEIS' : 'SINU JÄRGMINE SAMM'}</span>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        {label && (
          <button
            className="button button-primary"
            disabled={busy}
            onClick={() => {
              if (publish) onPublish();
              else if (target) onNavigate(target);
            }}
          >
            {label}
            <ArrowRight size={17} />
          </button>
        )}
      </div>
      <div className="flow-shortcuts">
        <button className="text-link" onClick={() => onNavigate('neighbors')}>
          <MapPin size={16} />
          Naabrite kaart ja kutsed
        </button>
        <button className="text-link" onClick={() => onNavigate('offers')}>
          Pakkumised ({offers.length})
        </button>
        <a href="#mailbox" className="text-link">
          <Mail size={16} />
          Postkast
        </a>
      </div>
    </section>
  );
}
