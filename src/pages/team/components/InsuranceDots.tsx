import type { InsuranceFlags } from '../../../api/team.types';

export function InsuranceDots({ insurance }: { insurance?: InsuranceFlags }) {
  const ins = insurance ?? { pension: false, health: false, employment: false, accident: false };
  const items: { k: keyof InsuranceFlags; label: string; full: string }[] = [
    { k: 'pension', label: '국', full: '국민연금' },
    { k: 'health', label: '건', full: '건강보험' },
    { k: 'employment', label: '고', full: '고용보험' },
    { k: 'accident', label: '산', full: '산재보험' },
  ];
  return (
    <span className="ins-dots">
      {items.map((it) => (
        <span
          key={it.k}
          className={'ins-dot' + (ins[it.k] ? ' is-on' : '')}
          title={`${it.full} ${ins[it.k] ? '가입' : '미가입'}`}
        >
          {it.label}
        </span>
      ))}
    </span>
  );
}
