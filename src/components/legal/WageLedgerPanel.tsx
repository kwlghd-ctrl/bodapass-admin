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
import type { WageLedger } from '../../domain/wageLedger';

interface Props {
  siteId: string | null | undefined;
  yearMonth: string;
}

interface AggregateRow {
  attendanceDays: number;
  gongsuTotal: number;
  grossWage: number;
  nonTaxableAmount: number;
  taxableWage: number;
  incomeTax: number;
  localIncomeTax: number;
  nationalPension: number;
  healthInsurance: number;
  longTermCareInsurance: number;
  employmentInsurance: number;
  deductionTotal: number;
  netPay: number;
  severanceFundAmount: number;
  warningCount: number;
  ledgerCount: number;
  /** Phase S3 — calculationStatus !== 'READY' 인 ledger 수 */
  notReadyCount: number;
}

const ZERO_ROW: AggregateRow = {
  attendanceDays: 0, gongsuTotal: 0, grossWage: 0, nonTaxableAmount: 0, taxableWage: 0,
  incomeTax: 0, localIncomeTax: 0, nationalPension: 0, healthInsurance: 0,
  longTermCareInsurance: 0, employmentInsurance: 0, deductionTotal: 0, netPay: 0,
  severanceFundAmount: 0, warningCount: 0, ledgerCount: 0, notReadyCount: 0,
};

/**
 * O3 — WageLedger 전체 필드 「예상값」 패널.
 * Phase S3: 각 employment 의 record 를 calculateMonthlyWageLedger 에 전달.
 *           READY 가 아닌 ledger 가 있으면 별도 인디케이터 표시.
 */
export function WageLedgerPanel({ siteId, yearMonth }: Props) {
  const [row, setRow] = useState<AggregateRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasWarning, setHasWarning] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!siteId || siteId === 'ALL') {
      setLoading(false);
      setRow(null);
      return;
    }
    let active = true;
    setLoading(true);
    setErr(null);
    (async () => {
      try {
        const [empRes, monthRes, sitesRes, workersRes] = await Promise.all([
          employmentApi.list({ siteId }),
          attendanceV2Api.month({ siteId, yearMonth }),
          siteApi.listSites().catch(() => ({ sites: [] as Site[], total: 0 })),
          workerApi.list().catch(() => ({ workers: [] as Worker[] })),
        ]);
        if (!active) return;
        const records: AttendanceRecord[] = monthRes.rows.flatMap((r) =>
          Object.values(r.daily ?? {}).filter(Boolean) as AttendanceRecord[],
        );
        const employments: Employment[] = empRes.employments ?? [];
        const sites: Site[] = (sitesRes as any).sites ?? [];
        const workers: Worker[] = (workersRes as any).workers ?? [];
        const site = sites.find((s) => s.id === siteId) ?? null;
        const workerById = new Map(workers.map((w) => [w.id, w]));
        const summaries = aggregateMonthlyAttendance(records, employments);

        const ledgers: WageLedger[] = [];
        for (const s of summaries) {
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
            ledgers.push(wl);
          } catch { /* skip on calc error */ }
        }
        if (ledgers.length === 0) { setRow(ZERO_ROW); setLoading(false); return; }

        const agg: AggregateRow = { ...ZERO_ROW, ledgerCount: ledgers.length };
        for (const l of ledgers) {
          agg.attendanceDays += l.workDays;
          agg.gongsuTotal += l.gongsuTotal;
          agg.grossWage += l.grossWage;
          agg.nonTaxableAmount += l.nonTaxableAmount;
          agg.taxableWage += l.taxableWage;
          agg.incomeTax += l.incomeTax;
          agg.localIncomeTax += l.localIncomeTax;
          agg.nationalPension += l.nationalPension;
          agg.healthInsurance += l.healthInsurance;
          agg.longTermCareInsurance += l.longTermCareInsurance;
          agg.employmentInsurance += l.employmentInsurance;
          agg.deductionTotal += l.deductionTotal;
          agg.netPay += l.netPay;
          agg.severanceFundAmount += l.severanceFundAmount ?? 0;
          agg.warningCount += (l.warnings?.length ?? 0);
          if (l.calculationStatus !== 'READY') agg.notReadyCount += 1;
        }
        setRow(agg);
        setHasWarning(agg.warningCount > 0 || agg.notReadyCount > 0);
        setLoading(false);
      } catch (e) {
        if (!active) return;
        setErr('노임대장 계산 로딩 실패');
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [siteId, yearMonth]);

  if (!siteId || siteId === 'ALL') {
    return (
      <section style={panelStyle}>
        <p style={hintStyle}>전체 현장 모드 — 현장을 선택하면 「예상」 노임대장이 표시됩니다.</p>
      </section>
    );
  }
  if (loading) return <div style={{ padding: 12, fontSize: 12, color: '#8e8e93' }}>「예상」 노임대장 계산 중…</div>;
  if (err) return <div style={{ padding: 12, fontSize: 12, color: '#cc3333' }}>{err}</div>;
  if (!row || row.ledgerCount === 0) {
    return <div style={{ padding: 12, fontSize: 12, color: '#8e8e93' }}>해당 월 노임대장 데이터가 없습니다.</div>;
  }

  return (
    <section style={panelStyle}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>「예상」 월별 노임대장 — {yearMonth} ({row.ledgerCount}명)</h4>
        <span style={{ fontSize: 11, color: hasWarning ? '#cc7700' : '#157efb', fontWeight: 700 }}>
          {hasWarning ? UI_LABEL_TEXT.ESTIMATED : UI_LABEL_TEXT.CONFIRMED}
        </span>
      </header>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
        <Cell label="출역일수" value={`${row.attendanceDays}일`} />
        <Cell label="공수" value={row.gongsuTotal.toFixed(1)} />
        <Cell label="총노무비" value={krw(row.grossWage)} />
        <Cell label="비과세" value={krw(row.nonTaxableAmount)} />
        <Cell label="과세보수" value={krw(row.taxableWage)} />
        <Cell label="소득세" value={krw(row.incomeTax)} />
        <Cell label="지방세" value={krw(row.localIncomeTax)} />
        <Cell label="국민연금" value={krw(row.nationalPension)} />
        <Cell label="건강보험" value={krw(row.healthInsurance)} />
        <Cell label="장기요양" value={krw(row.longTermCareInsurance)} />
        <Cell label="고용보험" value={krw(row.employmentInsurance)} />
        <Cell label="공제합" value={krw(row.deductionTotal)} tone="warn" />
        <Cell label="실지급" value={krw(row.netPay)} tone="good" />
        <Cell label="퇴직공제부금" value={krw(row.severanceFundAmount)} tone="info" />
      </div>
      {row.notReadyCount > 0 && (
        <p style={{ marginTop: 10, fontSize: 11, color: '#cc7700' }}>
          ⓘ READY 아님 {row.notReadyCount}/{row.ledgerCount}건 — 확정 신고/엑셀 출력 전 검토 필요.
        </p>
      )}
      {hasWarning && (
        <p style={{ marginTop: 6, fontSize: 11, color: '#cc7700' }}>
          ⚠ 계산 워닝 {row.warningCount}건 — 모두 「예상값」, 확정 신고 전 검증 필요.
        </p>
      )}
    </section>
  );
}

const panelStyle: React.CSSProperties = {
  padding: 14, marginTop: 12, border: '1px solid #e5e5ea', borderRadius: 12, background: '#fff',
};
const hintStyle: React.CSSProperties = { margin: 0, fontSize: 12, color: '#8e8e93' };

function krw(v: number): string {
  return Math.round(v).toLocaleString() + '원';
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: 'warn' | 'info' | 'good' }) {
  const color = tone === 'warn' ? '#cc7700' : tone === 'info' ? '#157efb' : tone === 'good' ? '#1f8a44' : '#1c1c1e';
  return (
    <div style={{ padding: '6px 8px', border: '1px solid #e5e5ea', borderRadius: 8, background: '#fafafc' }}>
      <div style={{ fontSize: 10, color: '#8e8e93' }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}
