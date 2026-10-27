import {
  type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState,
} from 'react';

const WIDTH = 280;
const MARGIN = 8;

type Position = { left: number; top?: number; bottom?: number };

/**
 * A "?" button that explains a setting on hover, focus or tap. The tooltip is fixed-positioned so the scrolling
 * sidebar can't clip it. Place it after any input in the same label, so the label keeps targeting the input.
 */
export const InfoTip = ({ label, children }: { label: string; children: ReactNode }) => {
  const id = useId();
  const ref = useRef<HTMLButtonElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<Position | null>(null);

  const show = () => {
    const r = ref.current!.getBoundingClientRect();
    const left = Math.min(Math.max(MARGIN, r.left + r.width / 2 - WIDTH / 2), window.innerWidth - WIDTH - MARGIN);
    setPos({ left, top: r.bottom + 6 });
  };
  const hide = () => setPos(null);

  // Flip above the button when the rendered tooltip would run off the bottom of the screen.
  useLayoutEffect(() => {
    if (pos?.top === undefined || !tipRef.current) return;
    if (pos.top + tipRef.current.offsetHeight > window.innerHeight - MARGIN) {
      const r = ref.current!.getBoundingClientRect();
      setPos({ left: pos.left, bottom: window.innerHeight - r.top + 6 });
    }
  }, [pos]);

  useEffect(() => {
    if (!pos) return undefined;
    window.addEventListener('scroll', hide, true);
    return () => window.removeEventListener('scroll', hide, true);
  }, [pos]);

  return (
    <>
      <button
        ref={ref}
        type="button"
        className="infotip"
        aria-label={`About ${label}`}
        aria-describedby={id}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={(e) => {
          e.preventDefault();
          if (pos) hide();
          else show();
        }}
        onKeyDown={(e) => { if (e.key === 'Escape') hide(); }}
      >
        ?
      </button>
      <span ref={tipRef} role="tooltip" id={id} className="infotip-text" hidden={!pos} style={{ ...pos, width: WIDTH }}>
        {children}
      </span>
    </>
  );
};
