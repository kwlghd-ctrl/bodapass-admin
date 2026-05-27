import { useState } from 'react';

export function MaskCell({
  masked,
  raw,
  label,
}: {
  masked?: string;
  raw?: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const text = open ? (raw || masked || '') : (masked || '');
  if (!masked) return null;
  return (
    <button
      type="button"
      className={'mask-cell' + (open ? ' is-open' : '')}
      onClick={(e) => {
        e.stopPropagation();
        setOpen((v) => !v);
      }}
      title={open ? `${label} — 클릭하여 마스킹` : `${label} — 클릭하여 보기`}
    >
      <span className="mask-cell__text">{text}</span>
      <span className="mask-cell__icon" aria-hidden>{open ? '🙈' : '👁'}</span>
    </button>
  );
}
