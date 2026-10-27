import type { ReactNode } from 'react';

interface Props {
  index: number;
  title: string;
  summary?: ReactNode;
  children: ReactNode;
}

export const Step = ({
  index, title, summary, children,
}: Props) => (
  <section className="step" aria-labelledby={`step-${index}`}>
    <header className="step-head">
      <span className="step-index" aria-hidden>{index}</span>
      <h2 id={`step-${index}`}>{title}</h2>
      {summary && <span className="step-summary">{summary}</span>}
    </header>
    <div className="step-body">{children}</div>
  </section>
);
