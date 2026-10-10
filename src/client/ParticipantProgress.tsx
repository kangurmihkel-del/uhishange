import { number } from './api';

export default function ParticipantProgress({
  paidCount,
  threshold,
  succeeded = false,
  compact = false,
}: {
  paidCount: number;
  threshold?: number;
  succeeded?: boolean;
  compact?: boolean;
}) {
  const count = Math.max(0, Math.floor(paidCount));
  const target = threshold && threshold > 0 ? Math.floor(threshold) : undefined;
  const dotCount = Math.min(20, target ?? Math.max(1, count));
  const filled = target
    ? target <= 20
      ? Math.min(count, target)
      : Math.floor((Math.min(count, target) / target) * dotCount)
    : Math.min(count, dotCount);
  return (
    <div
      className={
        'participant-progress' +
        (!target ? ' participant-progress--count' : '') +
        (compact ? ' participant-progress--compact' : '')
      }
      data-testid="participant-progress"
      data-state={succeeded ? 'complete' : 'pending'}
    >
      <div
        className="participant-dots"
        role={target ? 'progressbar' : undefined}
        aria-label={target ? 'Makstud liitumiste eesmärk' : undefined}
        aria-valuemin={target ? 0 : undefined}
        aria-valuemax={target}
        aria-valuenow={target ? Math.min(count, target) : undefined}
        aria-valuetext={
          target ? number(count) + ' / ' + number(target) + ' makstud liitumist' : undefined
        }
        aria-hidden={!target ? true : undefined}
      >
        {Array.from({ length: dotCount }, (_, index) => (
          <span
            key={index}
            className="participant-dot"
            data-state={index < filled ? 'filled' : 'empty'}
            data-testid="participant-dot"
            aria-hidden="true"
          />
        ))}
      </div>
      <div className="participant-count">
        <strong>{number(count)} makstud liitumist</strong>
        {target && (
          <span>
            {number(count)} / {number(target)} liitunud
          </span>
        )}
      </div>
    </div>
  );
}
