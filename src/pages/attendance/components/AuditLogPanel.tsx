import type { AuditLogEntry } from '../../../api/attendance.types';

export function AuditLogPanel({ audit }: { audit: AuditLogEntry[] }) {
  function shortType(t: string): string {
    if (t === 'MANUAL_CHECK_IN') return '출근';
    if (t === 'MANUAL_CHECK_OUT') return '퇴근';
    if (t === 'BULK_CHECK_OUT') return '일괄퇴근';
    if (t === 'MANUAL_GONGSU') return '공수입력';
    return '기타';
  }
  function typeCls(t: string): string {
    if (t === 'BULK_CHECK_OUT') return 'bulk';
    if (t === 'MANUAL_GONGSU') return 'gongsu';
    return 'manual';
  }
  return (
    <div className="att-audit">
      <h3 className="att-audit__title">감사 로그</h3>
      {audit.length === 0 ? (
        <p className="att-audit__empty">최근 처리 기록이 없습니다.</p>
      ) : (
        <ul className="att-audit__list">
          {audit.map((a) => {
            const names = a.memberNames.join(', ') + (a.memberNames.length > 1 ? ` 외 ${a.memberNames.length - 1}명` : '');
            return (
              <li key={a.id} className="att-audit__item">
                <div className="att-audit__top">
                  <strong className="att-audit__name">
                    {a.memberNames[0] ?? '-'}
                    {a.memberNames.length > 1 && (
                      <em className="att-audit__cnt"> · {a.memberNames.length}명</em>
                    )}
                  </strong>
                  <span className={`att-audit__type att-audit__type--${typeCls(a.type)}`}>
                    {shortType(a.type)}
                  </span>
                </div>
                <p className="att-audit__bottom">
                  <span className="att-audit__by">{a.performedBy}</span>
                  <span className="att-audit__time">
                    {new Date(a.performedAt).toLocaleString('ko-KR', {
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </p>
                {a.reason && <p className="att-audit__reason" title={names}>{a.reason}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
