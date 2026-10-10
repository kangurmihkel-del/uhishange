import type { ProcurementSpec } from '../shared/types';
import { serviceSpecFacts } from '../shared/serviceForms';

export default function ServiceScope({
  spec,
  className = 'scope-grid',
}: {
  spec: ProcurementSpec;
  className?: string;
}) {
  return (
    <dl className={className} data-testid="service-scope">
      {serviceSpecFacts(spec).map((fact) => (
        <div key={fact.label} className="scope-item">
          <dt>{fact.label}</dt>
          <dd>{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}
