/**
 * 도메인 테스트 — 노무대장 (wageLedger)
 *
 * Vitest 가 없으므로 자체 verifier 패턴 사용.
 * 브라우저 콘솔: import('@/domain/__tests__/wageLedger.test').then(m => m.verifyAllWageLedger())
 */
import type { VerificationResult } from '../../utils/__verify__/calculationVerifier';
import { calculateMonthlyWageLedger } from '../wageLedger/wageLedgerCalculator';
import type { MonthlyAttendanceSummary } from '../../api/monthlyAttendance.types';

function summary(overrides: Partial<MonthlyAttendanceSummary> = {}): MonthlyAttendanceSummary {
  return {
    employmentId: 'E-1',
    siteId: 'S-1',
    companyId: 'C-1',
    yearMonth: '2026-05',
    attendanceDays: 22,
    paidWorkDays: 22,
    severanceWorkDays: 22,
    gongsuTotal: 22,
    workedMinutesTotal: 22 * 480,
    faceCount: 22,
    manualCount: 0,
    ecardCount: 0,
    adjustedCount: 0,
    grossWage: 22 * 200_000,
    dailyWageAverage: 200_000,
    status: 'DRAFT',
    warnings: [],
    ...overrides,
  };
}

/** ① WageLedger 가 attendanceDays / paidWorkDays / severanceWorkDays 를 분리 보존 */
export function verifyWageLedger01_separateDays(): VerificationResult {
  const ledger = calculateMonthlyWageLedger({
    summary: summary({
      attendanceDays: 22,
      paidWorkDays: 20,
      severanceWorkDays: 21,
    }),
    employment: {
      id: 'E-1',
      workerId: 'W-1',
      dailyWage: 200_000,
    } as any,
    site: { severanceFundMode: 'FORCE_8700' } as any,
  });
  // wageLedger.workDays = paidWorkDays, severanceWorkDays 별도 보존
  return {
    case: '① WageLedger.workDays(=paidWorkDays 20) 와 severanceWorkDays(21) 분리 보존',
    pass: ledger.workDays === 20 && ledger.severanceWorkDays === 21,
    expected: { workDays: 20, severanceWorkDays: 21 },
    actual: { workDays: ledger.workDays, severanceWorkDays: ledger.severanceWorkDays },
  };
}

/** ② dailyTaxRows 가 존재할 때 그 합이 incomeTax 와 일치 (재계산 X) — 현재 구현은 평균방식이므로
 *    incomeTax >= 0 이며 lockLevel=ESTIMATED 라는 약한 invariant 검증 */
export function verifyWageLedger02_taxConsistency(): VerificationResult {
  const ledger = calculateMonthlyWageLedger({
    summary: summary(),
    employment: {
      id: 'E-1',
      workerId: 'W-1',
      dailyWage: 200_000,
    } as any,
    site: { severanceFundMode: 'FORCE_8700' } as any,
  });
  // grossWage = 22 * 200,000 = 4,400,000 → netPay 가 grossWage - deductionTotal 인지 확인
  const expectedNet = ledger.grossWage - ledger.deductionTotal;
  return {
    case: '② netPay = grossWage - deductionTotal (일관성 invariant)',
    pass: ledger.netPay === Math.max(0, expectedNet) && ledger.lockLevel === 'ESTIMATED',
    expected: { netPay: expectedNet, lockLevel: 'ESTIMATED' },
    actual: { netPay: ledger.netPay, lockLevel: ledger.lockLevel },
  };
}

/** ③ severanceFundAmount = severanceWorkDays × severanceFundDaily (FORCE_8700) */
export function verifyWageLedger03_severanceAmount(): VerificationResult {
  const ledger = calculateMonthlyWageLedger({
    summary: summary({ severanceWorkDays: 20 }),
    employment: {
      id: 'E-1',
      workerId: 'W-1',
      dailyWage: 200_000,
    } as any,
    site: { severanceFundMode: 'FORCE_8700' } as any,
  });
  return {
    case: '③ severanceFundAmount = 20일 × 8,700 = 174,000원',
    pass: ledger.severanceFundAmount === 174_000 && ledger.severanceFundDaily === 8_700,
    expected: { severanceFundAmount: 174_000, severanceFundDaily: 8_700 },
    actual: {
      severanceFundAmount: ledger.severanceFundAmount,
      severanceFundDaily: ledger.severanceFundDaily,
    },
  };
}

export function verifyAllWageLedger(): VerificationResult[] {
  const all = [
    verifyWageLedger01_separateDays(),
    verifyWageLedger02_taxConsistency(),
    verifyWageLedger03_severanceAmount(),
    verifyWageLedger04_dailyAggregation(),
    verifyWageLedger05_recordsMissing(),
    verifyWageLedger06_taxSumConsistency(),
    verifyWageLedger07_dailyAttendancePreserved(),
    verifyWageLedger08_buildDailyGongsuPriority(),
    verifyWageLedger09_buildDailyGongsuFallback(),
    verifyWageLedger10_emptyAttendanceWhenNoRecords(),
  ];
  const passed = all.filter((r) => r.pass).length;
  console.group(`[bodapass] domain/wageLedger — ${passed}/${all.length} passed`);
  for (const r of all) console.log(`${r.pass ? '✓' : '✗'} ${r.case}`);
  console.groupEnd();
  return all;
}

/* ───── Phase S4 (b/c/d): records 기반 검증 ───── */
import type { AttendanceRecord } from '../../api/attendanceV2.types';

function recForS4(p: Partial<AttendanceRecord>): AttendanceRecord {
  return {
    id: 'A-x',
    date: '2026-05-01',
    workDate: '2026-05-01',
    employmentId: 'E-1',
    workerCode: 'W-1',
    workerName: '홍길동',
    trade: '보통인부' as AttendanceRecord['trade'],
    siteId: 'S-1',
    companyId: 'C-1',
    checkInAt: null,
    checkOutAt: null,
    checkInMethod: null,
    checkOutMethod: null,
    checkInScore: null,
    checkOutScore: null,
    status: 'NORMAL',
    workedMinutes: 480,
    gongsu: 1,
    dailyWage: 200_000,
    payAmount: 200_000,
    ...p,
  } as AttendanceRecord;
}

/** ④ Phase S4(b) — 같은 날짜 record 2건은 일자별 합산 후 1행으로 세금 계산 */
export function verifyWageLedger04_dailyAggregation(): VerificationResult {
  const records: AttendanceRecord[] = [
    recForS4({ id: 'A-1', date: '2026-05-01', workDate: '2026-05-01', payAmount: 100_000, gongsu: 0.5 }),
    recForS4({ id: 'A-2', date: '2026-05-01', workDate: '2026-05-01', payAmount: 100_000, gongsu: 0.5 }),
  ];
  const ledger = calculateMonthlyWageLedger({
    summary: summary({
      attendanceDays: 1,
      paidWorkDays: 1,
      severanceWorkDays: 1,
      gongsuTotal: 1,
      workedMinutesTotal: 960,
      grossWage: 200_000,
      dailyWageAverage: 200_000,
    }),
    employment: { id: 'E-1', workerId: 'W-1', dailyWage: 200_000 } as any,
    site: { severanceFundMode: 'FORCE_8700' } as any,
    records,
  });
  const dtr = ledger.dailyTaxRows ?? [];
  const expected = { rowCount: 1, payAmount: 200_000, taxableDaily: 50_000 };
  const actual = {
    rowCount: dtr.length,
    payAmount: dtr[0]?.payAmount,
    taxableDaily: dtr[0]?.taxableDaily,
  };
  return {
    case: '④ Phase S4(b) — 같은 날 record 2건 → 합산 후 1행 (payAmount 200,000 / taxableDaily 50,000)',
    pass:
      actual.rowCount === expected.rowCount &&
      actual.payAmount === expected.payAmount &&
      actual.taxableDaily === expected.taxableDaily,
    expected,
    actual,
  };
}

/** ⑤ Phase S4(c) — records 미전달 시 calculationStatus !== 'READY' 및 명시 워닝 */
export function verifyWageLedger05_recordsMissing(): VerificationResult {
  const ledger = calculateMonthlyWageLedger({
    summary: summary(),
    employment: { id: 'E-1', workerId: 'W-1', dailyWage: 200_000 } as any,
    site: { severanceFundMode: 'FORCE_8700' } as any,
    // records 미전달
  });
  const warnHit = (ledger.warnings ?? []).some((w) =>
    w.includes('원본 출역기록 없음'),
  );
  return {
    case: '⑤ Phase S4(c) — records 미전달 → ESTIMATED + 원본 출역기록 없음 워닝',
    pass: ledger.calculationStatus !== 'READY' && warnHit,
    expected: { calculationStatus: '!== READY', warning: '원본 출역기록 없음 ...' },
    actual: { calculationStatus: ledger.calculationStatus, warnHit },
  };
}

/** ⑥ Phase S4(d) — dailyTaxRows 합계 === WageLedger.incomeTax */
export function verifyWageLedger06_taxSumConsistency(): VerificationResult {
  const records: AttendanceRecord[] = [];
  for (let day = 1; day <= 20; day++) {
    const dd = String(day).padStart(2, '0');
    records.push(recForS4({
      id: `A-${day}`,
      date: `2026-05-${dd}`,
      workDate: `2026-05-${dd}`,
      payAmount: 200_000,
    }));
  }
  const ledger = calculateMonthlyWageLedger({
    summary: summary({
      attendanceDays: 20,
      paidWorkDays: 20,
      severanceWorkDays: 20,
      gongsuTotal: 20,
      workedMinutesTotal: 20 * 480,
      grossWage: 20 * 200_000,
      dailyWageAverage: 200_000,
    }),
    employment: { id: 'E-1', workerId: 'W-1', dailyWage: 200_000 } as any,
    site: { severanceFundMode: 'FORCE_8700' } as any,
    records,
  });
  const sum = (ledger.dailyTaxRows ?? []).reduce((s, r) => s + r.incomeTax, 0);
  const localSum = (ledger.dailyTaxRows ?? []).reduce((s, r) => s + r.localIncomeTax, 0);
  return {
    case: '⑥ Phase S4(d) — sum(dailyTaxRows.incomeTax) === wageLedger.incomeTax (+ 지방세 일치 + READY)',
    pass:
      sum === ledger.incomeTax &&
      localSum === ledger.localIncomeTax &&
      ledger.calculationStatus === 'READY',
    expected: {
      sum: ledger.incomeTax,
      localSum: ledger.localIncomeTax,
      status: 'READY',
    },
    actual: { sum, localSum, status: ledger.calculationStatus },
  };
}


/* ─────────────────── Phase Z1 신규 테스트 (07-10) ─────────────────── */

import { buildDailyGongsuFromDailyTaxRows } from '../../utils/wageLedger';
import type { WageRow } from '../../api/wage.types';

/** ⑧ Phase Z1(a) - dailyAttendanceRows preserves records.finalGongsu (0.5/1.5/2.0) */
export function verifyWageLedger07_dailyAttendancePreserved(): VerificationResult {
  const records: AttendanceRecord[] = [
    recForS4({ id: 'A-1', date: '2026-05-01', workDate: '2026-05-01', gongsu: 1.5, payAmount: 300_000 }),
    recForS4({ id: 'A-2', date: '2026-05-03', workDate: '2026-05-03', gongsu: 0.5, payAmount: 100_000 }),
    recForS4({ id: 'A-3', date: '2026-05-05', workDate: '2026-05-05', gongsu: 2.0, payAmount: 400_000 }),
  ];
  const ledger = calculateMonthlyWageLedger({
    summary: summary({
      attendanceDays: 3,
      paidWorkDays: 3,
      severanceWorkDays: 3,
      gongsuTotal: 4,
      workedMinutesTotal: 3 * 480,
      grossWage: 800_000,
      dailyWageAverage: 200_000,
    }),
    employment: { id: 'E-1', workerId: 'W-1', dailyWage: 200_000 } as any,
    site: { severanceFundMode: 'FORCE_8700' } as any,
    records,
  });
  const rows = ledger.dailyAttendanceRows ?? [];
  const byDate = new Map(rows.map((r) => [r.workDate, r.finalGongsu]));
  const ok =
    rows.length === 3 &&
    byDate.get('2026-05-01') === 1.5 &&
    byDate.get('2026-05-03') === 0.5 &&
    byDate.get('2026-05-05') === 2.0;
  return {
    case: '⑧ Phase Z1(a) - dailyAttendanceRows.finalGongsu preserves 0.5/1.5/2.0',
    pass: ok,
    expected: { length: 3, gongsus: [1.5, 0.5, 2.0] },
    actual: { length: rows.length, rows: rows.map((r) => ({ d: r.workDate, g: r.finalGongsu })) },
  };
}

/** ⑨ Phase Z1(b) - buildDailyGongsuFromDailyTaxRows prefers dailyAttendanceRows */
export function verifyWageLedger08_buildDailyGongsuPriority(): VerificationResult {
  const row: WageRow = {
    memberId: 'M-1', memberName: 'X', idNumberMasked: '------', role: 'WORKER' as any,
    workDays: 2, dailyWage: 200_000, baseAmount: 400_000,
    deductionPension: 0, deductionHealth: 0, deductionEmployment: 0, deductionAccident: 0,
    deductionIncomeTax: 0, deductionLocalTax: 0, deductionTotal: 0, netAmount: 400_000,
    severanceAccrued: 0,
    dailyTaxRows: [
      { workDate: '2026-05-10', taxableIncome: 100_000 } as any,
      { workDate: '2026-05-20', taxableIncome: 100_000 } as any,
    ],
    dailyAttendanceRows: [
      { workDate: '2026-05-10', finalGongsu: 0.5, workedMinutes: 240 },
      { workDate: '2026-05-20', finalGongsu: 1.5, workedMinutes: 720 },
    ],
  };
  const arr = buildDailyGongsuFromDailyTaxRows(row);
  const ok = arr[9] === 0.5 && arr[19] === 1.5 && arr[0] === 0;
  return {
    case: '⑨ Phase Z1(b) - buildDailyGongsu prefers dailyAttendanceRows (0.5/1.5) over dailyTaxRows (1.0)',
    pass: ok,
    expected: { day10: 0.5, day20: 1.5, day1: 0 },
    actual: { day10: arr[9], day20: arr[19], day1: arr[0] },
  };
}

/** ⑩ Phase Z1(c) - fallback to dailyTaxRows when dailyAttendanceRows missing */
export function verifyWageLedger09_buildDailyGongsuFallback(): VerificationResult {
  const row: WageRow = {
    memberId: 'M-1', memberName: 'X', idNumberMasked: '------', role: 'WORKER' as any,
    workDays: 1, dailyWage: 200_000, baseAmount: 200_000,
    deductionPension: 0, deductionHealth: 0, deductionEmployment: 0, deductionAccident: 0,
    deductionIncomeTax: 0, deductionLocalTax: 0, deductionTotal: 0, netAmount: 200_000,
    severanceAccrued: 0,
    dailyTaxRows: [
      { workDate: '2026-05-15', taxableIncome: 100_000 } as any,
    ],
  };
  const arr = buildDailyGongsuFromDailyTaxRows(row);
  const ok = arr[14] === 1.0 && arr[0] === 0 && arr[20] === 0;
  return {
    case: '⑩ Phase Z1(c) - fallback to dailyTaxRows.workDate (1.0) when dailyAttendanceRows missing',
    pass: ok,
    expected: { day15: 1.0, day1: 0, day21: 0 },
    actual: { day15: arr[14], day1: arr[0], day21: arr[20] },
  };
}

/** ⑪ Phase Z1(d) - empty dailyAttendanceRows + warning when no records */
export function verifyWageLedger10_emptyAttendanceWhenNoRecords(): VerificationResult {
  const ledger = calculateMonthlyWageLedger({
    summary: summary({
      attendanceDays: 10,
      paidWorkDays: 10,
      severanceWorkDays: 10,
      gongsuTotal: 10,
      workedMinutesTotal: 10 * 480,
      grossWage: 2_000_000,
      dailyWageAverage: 200_000,
    }),
    employment: { id: 'E-1', workerId: 'W-1', dailyWage: 200_000 } as any,
    site: { severanceFundMode: 'FORCE_8700' } as any,
  });
  const ok = Array.isArray(ledger.dailyAttendanceRows)
    && ledger.dailyAttendanceRows.length === 0
    && ledger.warnings.some((w) => w.includes('노임대장 일자별 공수'));
  return {
    case: '⑪ Phase Z1(d) - records missing -> dailyAttendanceRows=[] + warning about 노임대장 참조',
    pass: ok,
    expected: { length: 0, warningHit: true },
    actual: {
      length: ledger.dailyAttendanceRows?.length,
      warningHit: ledger.warnings.some((w) => w.includes('노임대장')),
    },
  };
}
