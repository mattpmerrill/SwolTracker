import { useCallback, useId, useLayoutEffect, useRef, useState } from 'react';

/**
 * A note clamped to a few lines with a Show more / Show less toggle. The
 * toggle appears only when the text really overflows, measured from the DOM,
 * so a short note does not get a pointless button.
 */
export default function ClampedNote({ text, lines = 3, className = 'text-xs text-zinc-400' }) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const textRef = useRef(null);
  const textId = useId();

  const measure = useCallback(() => {
    const el = textRef.current;
    if (el) setOverflows(el.scrollHeight > el.clientHeight + 1);
  }, []);

  useLayoutEffect(() => {
    if (expanded) return undefined;
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [expanded, text, measure]);

  return (
    <div>
      <p
        id={textId}
        ref={textRef}
        className={`${className} break-words whitespace-pre-line`}
        style={expanded ? undefined : { display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
      >
        {text}
      </p>
      {(overflows || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          aria-controls={textId}
          className="mt-1 text-xs font-medium text-orange-400 hover:text-orange-300 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}
