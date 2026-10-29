import { useEffect, useState } from 'react';
import type { Phase, Progress } from '../engine/search';

interface Props {
  progress: Progress | null;
  startedAt: number;
  onCancel: () => void;
}

/** Each phase's share of the progress bar: the first does most of the work. */
const STEPS: [Phase, string, share: number][] = [
  ['curves', 'Find the best setup at every price, for each monster and style', 0.7],
  ['joint', 'Find the gear that helps most across all your monsters at once', 0.1],
  ['cross', 'Check what each setup\'s items do at your other monsters', 0.2],
];

/** Whole seconds, e.g. "48s" or "2m 5s". */
const formatElapsed = (seconds: number) => {
  const s = Math.round(seconds);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
};

export const ProgressPanel = ({ progress, startedAt, onCancel }: Props) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const activeIndex = STEPS.findIndex(([phase]) => phase === progress?.phase);
  const start = STEPS.slice(0, Math.max(0, activeIndex)).reduce((sum, [, , share]) => sum + share, 0);
  const size = progress ? STEPS[activeIndex][2] : 0;
  const fraction = progress ? start + (progress.total ? (size * progress.done) / progress.total : 0) : 0;
  const elapsed = (now - startedAt) / 1000;
  const remaining = fraction > 0.04 ? (elapsed * (1 - fraction)) / fraction : null;

  return (
    <section className="search-progress" aria-label="Search progress">
      <div className="search-progress-head">
        <span className="search-progress-percent">{`${Math.floor(fraction * 100)}%`}</span>
        <span className="search-progress-time">
          {`${formatElapsed(elapsed)} elapsed`}
          {remaining !== null && `, about ${formatElapsed(remaining)} left`}
        </span>
        <button type="button" className="quiet" onClick={onCancel}>Stop search</button>
      </div>
      <div
        className="progress-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.floor(fraction * 100)}
      >
        <div style={{ width: `${fraction * 100}%` }} />
      </div>
      <ol className="search-steps">
        {STEPS.map(([phase, label], i) => {
          const state = i < activeIndex ? 'done' : i === activeIndex ? 'active' : 'pending';
          return (
            <li key={phase} className={`is-${state}`} aria-current={state === 'active' ? 'step' : undefined}>
              <span>{label}</span>
              {state === 'active' && progress && <small>{`${progress.done} of ${progress.total}`}</small>}
            </li>
          );
        })}
      </ol>
      <p className="hint" aria-live="polite">
        {`${(progress?.calcs ?? 0).toLocaleString('en-GB')} DPS calculations so far.`}
      </p>
    </section>
  );
};
