import { formatGp } from '../lib/format';

export const Gp = ({ amount }: { amount: number }) => {
  const { text, band } = formatGp(amount);
  return <span className={`gp gp-${band}`} title={`${Math.round(amount).toLocaleString('en-GB')} gp`}>{text}</span>;
};
