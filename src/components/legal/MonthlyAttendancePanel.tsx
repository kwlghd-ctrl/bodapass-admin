import { useEffect, useState } from 'react';
import { attendanceV2Api } from '../../api/attendanceV2';
import { employmentApi } from '../../api/employment';
import { aggregateMonthlyAttendance } from '../../domain/attendance';
import { UI_LABEL_TEXT } from '../../domain/legalPolicy';
import type { MonthlyAttendanceSummary } from '../../domain/attendance';
import type { AttendanceRecord } from '../../api/attendanceV2.types';
import type { Employment } from '../../api/employment.types';

interface Props {
  siteId: string | null | undefined;
  yearMonth: string;
}

/**
 * O2 — 월별 출역 집계 패널.
 * 내부적으로 employments + attendance.month 를 fetch 해서
 * aggregateMonthlyAttendance() 로 「예상값」 KPI 노출.
 */
export function MonthlyAttendancePanel({ siteId, yearMonth }: Props) {
  const [summaries, setSummaries] = useState<MonthlyAttendanceSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!siteId || siteId === 'ALL') {
      setLoading(false);
      setSummaries(null);
      return;
    }
    let active = true;
    setLoading(true);
    setErr(null);
    (async () => {
      try {
        const [empRes, monthRes] = await Promise.all([
          employmentApi.list({ siteId }),
          attendanceV2Api.month({ siteId, yearMonth }),
        ]);
        if (!active) return;
        const records: AttendanceRecord[] = monthRes.rows.flatMap((row) =>
          Object.values(row.daily ?? {}).filter(Boolean) as AttendanceRecord[],
        );
        const employments: Employment[] = empRes.employments ?? [];
        const result = aggregateMonthlyAttendance(records, employments);
        setSummaries(result);
        setLoading(false);
      } catch (e) {
        if (!active) return;
        setErr('월별 집계 로딩 실패');
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [siteId, yearMonth]);

  if (!siteId || siteId === 'ALL') {
    return (
      <section style={panelStyle}>
        <p style={hintStyle}>전체 현장 모드 — 현장을 선택하면 월별 출역 집계가 표시됩니다.</p>
      </section>
    );
  }
  if (loading) return <div style={{ padding: 12, fontSize: 12, color: '#8e8e93' }}>월별 집계 불러오는 중…</div>;
  if (err) return <div style={{ padding: 12, fontSize: 12, color: '#cc3333' }}>{err}</div>;
  if (!summaries || summaries.length === 0) {
    return <div style={{ padding: 12, fontSize: 12, color: '#8e8e93' }}>해당 월 출역 데이터가 없습니다.</div>;
  }

  const totalAttendanceDays = summaries.reduce((s, x) => s + x.attendanceDays, 0);
  const totalGongsu = summaries.reduce((s, x) => s + x.gongsuTotal, 0);
  const totalGross = summaries.reduce((s, x) => s + x.grossWage, 0);
  const allWarnings = summaries.flatMap((x) => x.warnings ?? []);
  const missingCheckOut = allWarnings.filter((w) => w.includes('퇴근') || w.includes('checkOut')).length;
  const manualCount = summaries.reduce((s, x) => s + (x.manualCount ?? 0), 0);
  const hasWarning = allWarnings.length > 0;

  return (
    <section style={panelStyle}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>월별 출역 집계 — {yearMonth}</h4>
        <span style={{ fontSize: 11, color: hasWarning ? '#cc7700' : '#157efb', fontWeight: 700 }}>
          {hasWarning ? UI_LABEL_TEXT.ESTIMATED : UI_LABEL_TEXT.CONFIRMED}
        </span>
      </header>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
        <Kpi label="월 출역일수 합계" value={`${totalAttendanceDays}일`} />
        <Kpi label="공수합계" value={totalGongsu.toFixed(1)} />
        <Kpi label="예상 노무비" value={`${totalGross.toLocaleString()}원`} />
        <Kpi label="퇴근 누락" value={`${missingCheckOut}건`} tone={missingCheckOut > 0 ? 'warn' : undefined} />
        <Kpi label="수동 보정" value={`${manualCount}건`} tone={manualCount > 0 ? 'info' : undefined} />
      </div>
      {hasWarning && (
        <p style={{ marginTop: 10, fontSize: 11, color: '#cc7700' }}>
          ⚠ 검증 필요 워닝 {allWarnings.length}건 — 확정 신고 전 확인하세요.
        </p>
      )}
    </section>
  );
}

const panelStyle: React.CSSProperties = {
  padding: 14,
  marginTop: 12,
  border: '1px solid #e5e5ea',
  borderRadius: 12,
  background: '#fff',
};
const hintStyle: React.CSSProperties = { margin: 0, fontSize: 12, color: '#8e8e93' };

function Kpi({ label, value, tone }: { label: string; value: string; tone?: 'warn' | 'info' }) {
  const color = tone === 'warn' ? '#cc7700' : tone === 'info' ? '#157efb' : '#1c1c1e';
  return (
    <div style={{ padding: '8px 10px', border: '1px solid #e5e5ea', borderRadius: 8, background: '#fafafc' }}>
      <div style={{ fontSize: 11, color: '#8e8e93' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}
