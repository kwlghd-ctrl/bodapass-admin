// SettleStatusBadge — Wage 페이지 정산 진행 미니 배지 (Phase Z3 분리)
//
// 6단계 진행 표시: 현장출역확정 / 본사출역확정 / 노무비확정 / 지급완료 / 명세서발행 / 마감.
// 순수 컴포넌트 — props: monthClose 만. 상태 없음.
import type { MonthClose } from '../../../api/attendance.types';

export function SettleStatusBadge({ monthClose }: { monthClose: MonthClose | null }) {
  const att = monthClose?.attStage ?? 'OPEN';
  const wage = monthClose?.wageStage ?? 'OPEN';
  const payslipsIssued = !!monthClose?.payslipsIssuedAt;
  const steps: Array<{ label: string; done: boolean }> = [
    { label: '현장 출역확정(월)', done: att === 'SITE_CLOSED' || att === 'HQ_CONFIRMED' },
    { label: '본사 출역확정',     done: att === 'HQ_CONFIRMED' },
    { label: '노무비확정',  done: wage === 'HQ_CONFIRMED' || wage === 'PAID' || wage === 'SETTLED' },
    { label: '지급완료',           done: wage === 'PAID' || wage === 'SETTLED' },
    { label: '명세서발행',         done: payslipsIssued || wage === 'SETTLED' },
    { label: '마감',               done: wage === 'SETTLED' },
  ];
  const currentIdx = steps.findIndex((s) => !s.done);
  return (
    <div className="settle-mini" role="img" aria-label={`진행: ${steps.map((s, i) => `${i + 1}.${s.label}${s.done ? '✓' : ''}`).join(' / ')}`}>
      {steps.map((s, i) => (
        <span
          key={s.label}
          className={
            'settle-mini__step'
            + (s.done ? ' is-done' : '')
            + (i === currentIdx ? ' is-current' : '')
          }
        >
          <span className="settle-mini__dot">{s.done ? '✓' : i + 1}</span>
          <span className="settle-mini__label">{s.label}</span>
        </span>
      ))}
    </div>
  );
}
