/**
 * AttSortTh — 출역 페이지 멤버 리스트 정렬 가능한 <th> 헤더.
 *
 * Phase AA3 — AttendancePage.tsx 에서 attendance/components/AttSortTh.tsx 로 분리.
 * 순수 표시 컴포넌트 — props 만 받아 JSX 반환. 콜백은 부모에서 주입.
 * Generic 타입 K 로 SortKey 종류를 부모가 지정.
 */
export function AttSortTh<K extends string>({
  label,
  col,
  cur,
  dir,
  on,
  numeric,
}: {
  label: string;
  col: K;
  cur: K;
  dir: 'asc' | 'desc';
  on: (k: K) => void;
  numeric?: boolean;
}) {
  const active = cur === col;
  return (
    <th
      className={
        (numeric ? 'att-mlist__num ' : '') +
        'att-mlist__sort' +
        (active ? ' is-active' : '')
      }
      onClick={() => on(col)}
    >
      {label}
      <span className="att-mlist__sort-ind" aria-hidden>
        {active ? (dir === 'asc' ? '▲' : '▼') : '↕'}
      </span>
    </th>
  );
}
