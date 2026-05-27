import { useEffect, useState } from 'react';
import { attendanceV2Api } from '../../api/attendanceV2';
import { employmentApi } from '../../api/employment';
import { siteApi } from '../../api/site';
import { workerApi } from '../../api/worker';
import { aggregateMonthlyAttendance } from '../../domain/attendance';
import { calculateMonthlyWageLedger } from '../../domain/wageLedger';
import { UI_LABEL_TEXT } from '../../domain/legalPolicy';
import type { AttendanceRecord } from '../../api/attendanceV2.types';
import type { Employment } from '../../api/employment.types';
import type { Site } from '../../api/site.types';
import type { Worker } from '../../api/worker.types';

interface Props {
  /** undefined / 'ALL' → 모든 현장 누적 */
  siteId?: string | null;
  yearMonth: string;
}

interface Totals {
  attendanceDays: number;
  gongsuTotal: number;
  grossWage: number;
  severanceFund: number;
  warningCount: number;
  /** Phase S3 — calculationStatus !== 'READY' 인 ledger 수 */
  notReadyCount: number;
  ledgerCount: number;
}

/**
 * O4 — Dashboard 법정 계산 KPI.
 * 선택된 현장 (또는 ALL) 의 월 누적 출역·노무비·퇴직공제부금 + warning 카운트.
 * Phase S3: per-employment record 전달 + notReady 인디케이터.
 */
export function DashboardLegalKpi({ siteId, yearMonth }: Props) {
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setErr(null);
    (async () => {
      try {
        const [sitesRes, workersRes] = await Promise.all([
          siteApi.listSites().catch(() => ({ sites: [] as Site[], total: 0 })),
          workerApi.list().catch(() => ({ workers: [] as Worker[], totalActive: 0 })),
        ]);
        if (!active) return;
        const sites: Site[] = (sitesRes as any).sites ?? [];
        const workers: Worker[] = (workersRes as any).workers ?? [];
        const workerById = new Map(workers.map((w) => [w.id, w]));

        const targetSites = !siteId || siteId === 'ALL'
          ? sites
          : sites.filter((s) => s.id === siteId);

        const agg: Totals = {
          attendanceDays: 0,
          gongsuTotal: 0,
          grossWage: 0,
          severanceFund: 0,
          warningCount: 0,
          notReadyCount: 0,
          ledgerCount: 0,
        };

        for (const site of targetSites) {
          const sid = site.id;
          const [empRes, monthRes] = await Promise.all([
            employmentApi.list({ siteId: sid }).catch(() => ({ employments: [] as Employment[] })),
            attendanceV2Api.month({ siteId: sid, yearMonth }).catch(() => null),
          ]);
          if (!active) return;
          if (!monthRes) continue;
          const records: AttendanceRecord[] = monthRes.rows.flatMap((r) =>
            Object.values(r.daily ?? {}).filter(Boolean) as AttendanceRecord[],
          );
          const employments: Employment[] = empRes.employments ?? [];
          const summaries = aggregateMonthlyAttendance(records, employments);
          for (const s of summaries) {
            agg.attendanceDays += s.attendanceDays;
            agg.gongsuTotal += s.gongsuTotal;
            agg.grossWage += s.grossWage;
            agg.warningCount += (s.warnings?.length ?? 0);
            const emp = employments.find((e) => e.id === s.employmentId);
            if (!emp) continue;
            const worker = workerById.get(emp.workerId) ?? null;
            // Phase S3 — 해당 employment 의 record 만 필터해 전달
            const empRecords = records.filter((r) => r.employmentId === s.employmentId);
            try {
              const wl = calculateMonthlyWageLedger({
                summary: s,
                employment: emp,
                worker,
                site,
                records: empRecords,
              });
              agg.severanceFund += wl.severanceFundAmount ?? 0;
              agg.warningCount += (wl.warnings?.length ?? 0);
              agg.ledgerCount += 1;
              if (wl.calculationStatus !== 'READY') agg.notReadyCount += 1;
            } catch { /* skip */ }
          }
        }

        if (!active) return;
        setTotals(agg);
        setLoading(false);
      } catch (e) {
        if (!active) return;
        setErr('월 누적 KPI 계산 실패');
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [siteId, yearMonth]);

  if (loading) return <div style={{ padding: 12, fontSize: 12, color: '#8e8e93' }}>월 누적 KPI 계산 중…</div>;
  if (err) return <div style={{ padding: 12, fontSize: 12, color: '#cc3333' }}>{err}</div>;
  if (!totals) return null;
  const hasWarning = totals.warningCount > 0 || totals.notReadyCount > 0;
  const scopeLabel = !siteId || siteId === 'ALL' ? '전체 현장' : '선택 현장';

  return (
    <section style={panelStyle}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>월 누적 법정 KPI — {scopeLabel} / {yearMonth}</h4>
        <span style={{ fontSize: 11, color: hasWarning ? '#cc7700' : '#157efb', fontWeight: 700 }}>
          {hasWarning ? UI_LABEL_TEXT.ESTIMATED : UI_LABEL_TEXT.CONFIRMED}
        </span>
      </header>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        <Tile label="월 출역일수" value={`${totals.attendanceDays}일`} />
        <Tile label="월 공수" value={totals.gongsuTotal.toFixed(1)} />
        <Tile label="예상 노무비" value={`${Math.round(totals.grossWage).toLocaleString()}원`} />
        <Tile label="예상 퇴직공제부금" value={`${Math.round(totals.severanceFund).toLocaleString()}원`} tone="info" />
        <Tile label="경고 건수" value={`${totals.warningCount}건`} tone={hasWarning ? 'warn' : undefined} />
        {totals.ledgerCount > 0 && (
          <Tile
            label="READY 비율"
            value={`${totals.ledgerCount - totals.notReadyCount}/${totals.ledgerCount}`}
            tone={totals.notReadyCount > 0 ? 'warn' : undefined}
          />
        )}
      </div>
    </section>
  );
}

const panelStyle: React.CSSProperties = {
  padding: 14, marginTop: 12, border: '1px solid #e5e5ea', borderRadius: 12, background: '#fff',
};

function Tile({ label, value, tone }: { label: string; value: string; tone?: 'warn' | 'info' }) {
  const color = tone === 'warn' ? '#cc7700' : tone === 'info' ? '#157efb' : '#1c1c1e';
  return (
    <div style={{ padding: '10px 12px', border: '1px solid #e5e5ea', borderRadius: 10, background: '#fafafc' }}>
      <div style={{ fontSize: 11, color: '#8e8e93' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}
