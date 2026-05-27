/**
 * KCard — 출역 페이지 상단 요약 카드.
 *
 * Phase AA3 — AttendancePage.tsx 에서 attendance/components/KCard.tsx 로 분리.
 * 순수 표시 컴포넌트 — props 만 받아 JSX 반환. 내부 state/effect/setter 호출 없음.
 */
export function KCard({
  label,
  value,
  sub,
  color,
  strong,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
  strong?: boolean;
}) {
  return (
    <div className={`att-kcard card ${strong ? 'is-strong' : ''}`}>
      <div className="att-kcard__main">
        <p className="att-kcard__label">{label}</p>
        <p className="att-kcard__value" style={color ? { color } : undefined}>
          {value}
        </p>
      </div>
      {sub && <p className="att-kcard__sub">{sub}</p>}
    </div>
  );
}
