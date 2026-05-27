import type { WageMonthSummary } from '../../../api/wage.types';

/**
 * 검토 필요 — 정산 전 확인이 필요한 항목 타일 (mock).
 *
 * 순수 표시 컴포넌트. 부모 state 미참조. WagePage.tsx 에서 분리.
 */
export function WageReviewRow({ wage }: { wage: WageMonthSummary | null }) {
  // mock 카운트 — 실 운영 시 별도 API 호출
  const total = wage?.rows.length ?? 0;
  const tiles = [
    { key: 'manual',      label: '수동보정',     value: Math.max(0, Math.round(total * 0.05)) },
    { key: 'no-contract', label: '계약미체결',   value: Math.max(0, Math.round(total * 0.04)) },
    { key: 'no-consent',  label: '동의미완료',   value: Math.max(0, Math.round(total * 0.03)) },
    { key: 'no-ins',      label: '보험정보누락', value: Math.max(0, Math.round(total * 0.06)) },
    { key: 'no-out',      label: '퇴근누락',     value: Math.max(0, Math.round(total * 0.02)) },
  ];

  return (
    <section className="wage-review">
      <header className="wage-review__head">
        <h3 className="wage-review__title">검토 필요</h3>
        <p className="wage-review__sub">정산 전에 확인이 필요한 항목입니다. 클릭 시 대상자 목록.</p>
      </header>
      <div className="wage-review__tiles">
        {tiles.map((t) => (
          <button
            key={t.key}
            type="button"
            className={'wage-review__tile' + (t.value > 0 ? ' has-value' : ' is-clean')}
            onClick={() =>
              window.alert(`「${t.label}」 ${t.value}건 — 대상자 목록 (mock).`)
            }
            title={`${t.label} 대상자 보기`}
          >
            <span className="wage-review__tile-label">{t.label}</span>
            <strong className="wage-review__tile-value">{t.value}</strong>
            <span className="wage-review__tile-unit">건</span>
          </button>
        ))}
      </div>
    </section>
  );
}
