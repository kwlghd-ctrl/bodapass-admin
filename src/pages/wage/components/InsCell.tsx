import { krw, krwShort } from '../utils/wageUtils';

/**
 * 4대보험 / 예산 셀 — 월 금액 + 누적 / 예산 표시.
 *
 * 순수 표시 컴포넌트. 부모 state 미참조. WagePage.tsx 에서 분리.
 */
export function InsCell({
  monthly,
  spent,
  budget,
}: {
  monthly: number;
  spent: number;
  budget: number;
}) {
  const rate = budget > 0 ? Math.round((spent / budget) * 100) : 0;
  const cls = rate >= 90 ? 'is-warn' : rate >= 60 ? 'is-mid' : 'is-low';
  return (
    <div className="ins-cell">
      <div className="ins-cell__monthly">
        <em>월</em>
        <strong>{krw(monthly)}</strong>
      </div>
      <div className="ins-cell__bar">
        <span className={'ins-cell__bar-fill ' + cls} style={{ width: Math.min(100, rate) + '%' }} />
      </div>
      <div className="ins-cell__cumul">
        <span>누적 {krwShort(spent)}/{krwShort(budget)}</span>
        <span className={'ins-cell__rate ' + cls}>{rate}%</span>
      </div>
    </div>
  );
}
