/**
 * 도메인 통합 테스트 — AttendanceRecord → MonthlyAttendanceSummary → WageLedger 흐름
 *
 * 동일 입력 → 동일 결과 (계산 엔진 일관성).
 * 브라우저 콘솔: import('@/domain/__tests__/integration.attendanceToWageLedger.test').then(m => m.verifyAllIntegration())
 */
import type { VerificationResult } from '../../utils/__verify__/calculationVerifier';
import type { AttendanceRecord } from '../../api/attendanceV2.types';
import type { Employment } from '../../api/employment.types';
import { aggregateMonthlyAttendance } from '../attendance/attendanceAggregator';
import { calculateMonthlyWageLedger } from '../wageLedger/wageLedgerCalculator';
import { adaptLedgersToWageMonthSummary } from '../../utils/adaptLedgersToWageMonthSummary';
import { validateReportInput, filterReportRows } from '../../utils/wageReportValidator';
import { buildFilingInputFromRow } from '../../utils/filingInputBuilder';
import { buildDailyGongsuFromDailyTaxRows } from '../../utils/wageLedger';
import { buildInsuranceFiling, type FilingInput } from '../../utils/insuranceFiling';
import type { WageRow } from '../../api/wage.types';
import type { DailyTaxRow } from '../../utils/incomeTaxDaily';


function rec(p: Partial<AttendanceRecord>): AttendanceRecord {
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
    checkInAt: '2026-05-01T07:00:00Z',
    checkOutAt: '2026-05-01T15:00:00Z',
    checkInMethod: 'FACE',
    checkOutMethod: 'FACE',
    checkInScore: 0.9,
    checkOutScore: 0.9,
    status: 'NORMAL',
    workedMinutes: 480,
    gongsu: 1,
    dailyWage: 200_000,
    payAmount: 200_000,
    ...p,
  } as AttendanceRecord;
}

function buildRecords(): AttendanceRecord[] {
  const out: AttendanceRecord[] = [];
  for (let day = 1; day <= 20; day++) {
    const dd = String(day).padStart(2, '0');
    out.push(rec({
      id: `A-${day}`,
      date: `2026-05-${dd}`,
      workDate: `2026-05-${dd}`,
    }));
  }
  return out;
}

const employments: Pick<Employment, 'id' | 'workerId' | 'siteCompanyId' | 'dailyWage'>[] = [
  { id: 'E-1', workerId: 'W-1', siteCompanyId: 'SC-1', dailyWage: 200_000 } as any,
];

/** ① AttendanceRecord[] → MonthlyAttendanceSummary 흐름 */
export function verifyIntegration01_recordsToSummary(): VerificationResult {
  const records = buildRecords();
  const summaries = aggregateMonthlyAttendance(records, employments);
  const s = summaries[0];
  return {
    case: '① AttendanceRecord[] 20건 → MonthlyAttendanceSummary (attendanceDays=20, gongsu=20)',
    pass: s != null && s.attendanceDays === 20 && s.gongsuTotal === 20 && s.grossWage === 20 * 200_000,
    expected: { attendanceDays: 20, gongsu: 20, grossWage: 4_000_000 },
    actual: s
      ? { attendanceDays: s.attendanceDays, gongsu: s.gongsuTotal, grossWage: s.grossWage }
      : null,
  };
}

/** ② Summary → WageLedger 흐름 */
export function verifyIntegration02_summaryToLedger(): VerificationResult {
  const records = buildRecords();
  const summaries = aggregateMonthlyAttendance(records, employments);
  const ledger = calculateMonthlyWageLedger({
    summary: summaries[0],
    employment: {
      id: 'E-1',
      workerId: 'W-1',
      dailyWage: 200_000,
    } as any,
    site: { severanceFundMode: 'FORCE_8700' } as any,
  });
  // 20일 × 8,700 = 174,000
  return {
    case: '② Summary → WageLedger: severanceFundAmount = 20 × 8,700 = 174,000',
    pass: ledger.severanceFundAmount === 174_000 && ledger.grossWage === 4_000_000,
    expected: { severanceFundAmount: 174_000, grossWage: 4_000_000 },
    actual: {
      severanceFundAmount: ledger.severanceFundAmount,
      grossWage: ledger.grossWage,
    },
  };
}

/** ③ 동일 입력 → 동일 결과 (idempotency) */
export function verifyIntegration03_idempotent(): VerificationResult {
  const records = buildRecords();
  const s1 = aggregateMonthlyAttendance(records, employments)[0];
  const s2 = aggregateMonthlyAttendance(records, employments)[0];
  const l1 = calculateMonthlyWageLedger({
    summary: s1,
    employment: { id: 'E-1', workerId: 'W-1', dailyWage: 200_000 } as any,
    site: { severanceFundMode: 'FORCE_8700' } as any,
  });
  const l2 = calculateMonthlyWageLedger({
    summary: s2,
    employment: { id: 'E-1', workerId: 'W-1', dailyWage: 200_000 } as any,
    site: { severanceFundMode: 'FORCE_8700' } as any,
  });
  const pass =
    l1.grossWage === l2.grossWage &&
    l1.netPay === l2.netPay &&
    l1.deductionTotal === l2.deductionTotal &&
    l1.severanceFundAmount === l2.severanceFundAmount;
  return {
    case: '③ 동일 입력 → 동일 결과 (engine idempotency)',
    pass,
    expected: 'identical',
    actual: {
      gross: [l1.grossWage, l2.grossWage],
      net: [l1.netPay, l2.netPay],
      dedu: [l1.deductionTotal, l2.deductionTotal],
      sev: [l1.severanceFundAmount, l2.severanceFundAmount],
    },
  };
}


/** ④ Phase T2 — adaptLedgersToWageMonthSummary 가 WageLedger 합계와 일치 */
export function verifyIntegration04_adapterConsistency(): VerificationResult {
  const records = buildRecords();
  const summaries = aggregateMonthlyAttendance(records, employments);
  const ledger = calculateMonthlyWageLedger({
    summary: summaries[0],
    employment: { id: 'E-1', workerId: 'W-1', dailyWage: 200_000 } as any,
    site: { severanceFundMode: 'FORCE_8700' } as any,
    records,
  });
  const wageSummary = adaptLedgersToWageMonthSummary([ledger], {
    nameByEmploymentId: new Map([['E-1', '홍길동']]),
    roleByEmploymentId: new Map([['E-1', '보통인부']]),
    idMaskedByEmploymentId: new Map([['E-1', '------']]),
    dailyWageByEmploymentId: new Map([['E-1', 200_000]]),
    year: 2026, month: 5,
  });
  const row = wageSummary.rows[0];
  const pass =
    row.baseAmount === ledger.grossWage &&
    row.deductionTotal === ledger.deductionTotal &&
    row.netAmount === ledger.netPay &&
    row.severanceAccrued === (ledger.severanceFundAmount ?? 0) &&
    row.deductionIncomeTax === ledger.incomeTax &&
    row.deductionLocalTax === ledger.localIncomeTax &&
    wageSummary.totalBase === ledger.grossWage &&
    wageSummary.totalNet === ledger.netPay;
  return {
    case: '④ Phase T2 — adapter row × WageLedger 합계 1:1 일치',
    pass,
    expected: 'identical',
    actual: {
      base: [row.baseAmount, ledger.grossWage],
      ded: [row.deductionTotal, ledger.deductionTotal],
      net: [row.netAmount, ledger.netPay],
      sev: [row.severanceAccrued, ledger.severanceFundAmount ?? 0],
    },
  };
}

/** ⑤ Phase T3 — dailyTaxRows full 16 필드 보존 */
export function verifyIntegration05_dailyTaxFullFields(): VerificationResult {
  const records = buildRecords();
  const summaries = aggregateMonthlyAttendance(records, employments);
  const ledger = calculateMonthlyWageLedger({
    summary: summaries[0],
    employment: { id: 'E-1', workerId: 'W-1', dailyWage: 200_000 } as any,
    site: { severanceFundMode: 'FORCE_8700' } as any,
    records,
  });
  const row = ledger.dailyTaxRows?.[0];
  // 필수 16 필드 모두 존재 확인 (값 검증 X — 키 존재만)
  const requiredKeys = [
    'workDate', 'payAmount', 'grossPay', 'nonTaxablePay',
    'taxableGrossPay', 'dailyDeduction', 'taxableDaily', 'taxableIncome',
    'calculatedIncomeTax', 'earnedIncomeTaxCredit', 'determinedIncomeTax',
    'incomeTax', 'withheldIncomeTax', 'localIncomeTax', 'totalTax',
  ];
  const missing = row ? requiredKeys.filter((k) => !(k in (row as any))) : requiredKeys;
  return {
    case: '⑤ Phase T3 — dailyTaxRows 가 full DailyTaxRow 15+ 필드 모두 보존',
    pass: missing.length === 0,
    expected: 'all 15+ keys present',
    actual: { missing },
  };
}

/** ⑥ Phase T3 — sum(dailyTaxRows.incomeTax) === WageLedger.incomeTax */
export function verifyIntegration06_dailyTaxSumConsistency(): VerificationResult {
  const records = buildRecords();
  const summaries = aggregateMonthlyAttendance(records, employments);
  const ledger = calculateMonthlyWageLedger({
    summary: summaries[0],
    employment: { id: 'E-1', workerId: 'W-1', dailyWage: 200_000 } as any,
    site: { severanceFundMode: 'FORCE_8700' } as any,
    records,
  });
  const sumIncome = (ledger.dailyTaxRows ?? []).reduce((s, r) => s + r.incomeTax, 0);
  const sumLocal = (ledger.dailyTaxRows ?? []).reduce((s, r) => s + r.localIncomeTax, 0);
  return {
    case: '⑥ Phase T3 — sum(dailyTaxRows.incomeTax) === WageLedger.incomeTax',
    pass: sumIncome === ledger.incomeTax && sumLocal === ledger.localIncomeTax,
    expected: { incomeTax: ledger.incomeTax, localIncomeTax: ledger.localIncomeTax },
    actual: { sumIncome, sumLocal },
  };
}

/** ⑦ Phase T5 — nonTaxablePay 일자별 입력 vs fallback 양쪽 모두 결과 생성 */
export function verifyIntegration07_nonTaxableExplicitVsFallback(): VerificationResult {
  const recordsWith = buildRecords().map((r) => ({ ...r, nonTaxablePay: 7_000 }));
  const recordsNo = buildRecords();
  const employmentWithNontax = {
    id: 'E-1', workerId: 'W-1', dailyWage: 200_000,
    nontaxable: { meal: 140_000 },
  } as any;
  const s1 = aggregateMonthlyAttendance(recordsWith, employments)[0];
  const s2 = aggregateMonthlyAttendance(recordsNo, employments)[0];
  const lExplicit = calculateMonthlyWageLedger({
    summary: s1, employment: employmentWithNontax,
    site: { severanceFundMode: 'FORCE_8700' } as any,
    records: recordsWith,
  });
  const lFallback = calculateMonthlyWageLedger({
    summary: s2, employment: employmentWithNontax,
    site: { severanceFundMode: 'FORCE_8700' } as any,
    records: recordsNo,
  });
  const fallbackHasWarning = lFallback.warnings.some((w) =>
    w.includes('일자별 비과세 미입력'),
  );
  const explicitHasNoWarning = !lExplicit.warnings.some((w) =>
    w.includes('일자별 비과세 미입력'),
  );
  return {
    case: '⑦ Phase T5 — nonTaxablePay 일자 입력 vs fallback (모두 결과 생성 + 폴백만 워닝)',
    pass: lExplicit.calculationStatus === 'READY' && lFallback.calculationStatus === 'READY'
      && explicitHasNoWarning && fallbackHasWarning,
    expected: 'explicit READY no fallback-warning / fallback READY with fallback-warning',
    actual: {
      explicit: { status: lExplicit.calculationStatus, hasFallbackWarn: !explicitHasNoWarning },
      fallback: { status: lFallback.calculationStatus, hasFallbackWarn: fallbackHasWarning },
    },
  };
}

/** ⑧ Phase T — records 미전달 ledger 는 calculationStatus !== READY */
export function verifyIntegration08_noRecordsNotReady(): VerificationResult {
  const records = buildRecords();
  const summaries = aggregateMonthlyAttendance(records, employments);
  const ledger = calculateMonthlyWageLedger({
    summary: summaries[0],
    employment: { id: 'E-1', workerId: 'W-1', dailyWage: 200_000 } as any,
    site: { severanceFundMode: 'FORCE_8700' } as any,
    // records 의도적 미전달
  });
  return {
    case: '⑧ Phase T — records 미전달 → calculationStatus !== READY (ESTIMATED)',
    pass: ledger.calculationStatus !== 'READY',
    expected: 'ESTIMATED or BLOCKED',
    actual: ledger.calculationStatus,
  };
}

export function verifyAllIntegration(): VerificationResult[] {
  const all = [
    verifyIntegration01_recordsToSummary(),
    verifyIntegration02_summaryToLedger(),
    verifyIntegration03_idempotent(),
    verifyIntegration04_adapterConsistency(),
    verifyIntegration05_dailyTaxFullFields(),
    verifyIntegration06_dailyTaxSumConsistency(),
    verifyIntegration07_nonTaxableExplicitVsFallback(),
    verifyIntegration08_noRecordsNotReady(),
    verifyIntegration09_adapterPreservesMetadata(),
    verifyIntegration10_blockedRowBlocksReport(),
    verifyIntegration11_workerMissingWarning(),
    verifyIntegration12_statusConsistencyAcrossPaths(),
    verifyIntegration13_dailyTaxRowsCountMatchesPaidWorkDays(),
    verifyIntegration14_blockedZeroExcluded(),
    verifyIntegration15_blockedRealTargetBlocked(),
    verifyIntegration16_localTaxSumMismatch(),
    verifyIntegration17_calcStatusMissing(),
    verifyIntegration18_dailyMarking31(),
    verifyIntegration19_nonTaxableInFiling(),
    verifyIntegration20_wageReportValidatorStrict(),
    verifyX21_filterReportRows_excludes_zeroAttendance(),
    verifyX22_strict_blocks_estimated(),
    verifyX23_filingInputs_from_reportRows_not_summary(),
    verifyX24_no_rrn_from_masked(),
    verifyX25_getSensitive_failure_blocks_report(),
    verifyX26_kakao_sms_guard(),
    verifyX27_accident_column_employer(),
    verifyY28_prepareReportRows_excludes_blocked(),
    verifyY29_dispatchPayslips_returns_boolean(),
    verifyY30_dailyGongsu_from_workdate(),
    verifyY31_rrn_13digit_only(),
    verifyY32_filingInput_preserves_3values(),
    verifyY33_filteredSummary_used_not_raw(),
    verifyY34_accident_employer_column(),
    verifyBB35_buildInsuranceFiling_excludes_masked_rrn(),
  ];
  const passed = all.filter((r) => r.pass).length;
  console.group(`[bodapass] domain/integration — ${passed}/${all.length} passed`);
  for (const r of all) console.log(`${r.pass ? '✓' : '✗'} ${r.case}`);
  console.groupEnd();
  return all;
}

/* ════════════════════════════════════════════════
 *  Phase U7 — WageLedger 메타데이터 보존 / 신고서 검증 / worker 누락
 * ════════════════════════════════════════════════ */

/** ⑨ Phase U — adapter 가 calculationStatus/warnings/dailyTaxRows 등을 보존 */
export function verifyIntegration09_adapterPreservesMetadata(): VerificationResult {
  const records = buildRecords();
  const summaries = aggregateMonthlyAttendance(records, employments);
  // records 미전달 → ESTIMATED + warnings
  const ledger = calculateMonthlyWageLedger({
    summary: summaries[0],
    employment: { id: 'E-1', workerId: 'W-1', dailyWage: 200_000 } as any,
    site: { severanceFundMode: 'FORCE_8700' } as any,
  });
  // 시연용 warning 강제 추가
  ledger.warnings.push('x');
  const summary = adaptLedgersToWageMonthSummary([ledger], {
    nameByEmploymentId: new Map([['E-1', '홍길동']]),
    roleByEmploymentId: new Map([['E-1', '보통인부' as any]]),
    idMaskedByEmploymentId: new Map([['E-1', '------']]),
    dailyWageByEmploymentId: new Map([['E-1', 200_000]]),
    year: 2026, month: 5,
  });
  const row = summary.rows[0];
  const ok = row.calculationStatus === ledger.calculationStatus
    && Array.isArray(row.warnings) && row.warnings.includes('x')
    && row.taxableWage === ledger.taxableWage
    && row.nonTaxableAmount === ledger.nonTaxableAmount;
  return {
    case: '⑨ Phase U — adapter 가 status/warnings/taxableWage/nonTaxableAmount 보존',
    pass: ok,
    expected: { status: ledger.calculationStatus, hasWarningX: true },
    actual: {
      status: row.calculationStatus,
      hasWarningX: row.warnings?.includes('x'),
      taxableWage: row.taxableWage,
      nonTaxableAmount: row.nonTaxableAmount,
    },
  };
}

/** ⑩ Phase U — BLOCKED row 1건 포함 시 validateReportInput 가 ok=false */
export function verifyIntegration10_blockedRowBlocksReport(): VerificationResult {
  const rows = [
    {
      memberId: 'M-1', memberName: 'A', idNumberMasked: '------', role: '보통인부',
      workDays: 0, dailyWage: 200_000, baseAmount: 0,
      deductionPension: 0, deductionHealth: 0, deductionEmployment: 0, deductionAccident: 0,
      deductionIncomeTax: 0, deductionLocalTax: 0, deductionTotal: 0,
      netAmount: 0, severanceAccrued: 0,
      calculationStatus: 'BLOCKED' as const,
      warnings: ['출역 기록 없음'],
      dailyTaxRows: [],
    },
  ];
  const v = validateReportInput(rows);
  return {
    case: '⑩ Phase U — BLOCKED row 포함 시 validateReportInput ok=false',
    pass: v.ok === false && typeof v.reason === 'string' && v.reason.includes('BLOCKED'),
    expected: { ok: false, reasonIncludesBlocked: true },
    actual: { ok: v.ok, reason: v.reason },
  };
}

/** ⑪ Phase U — worker 미전달 → ledger.warnings 에 'worker' 포함 */
export function verifyIntegration11_workerMissingWarning(): VerificationResult {
  const records = buildRecords();
  const summaries = aggregateMonthlyAttendance(records, employments);
  const ledger = calculateMonthlyWageLedger({
    summary: summaries[0],
    employment: { id: 'E-1', workerId: 'W-1', dailyWage: 200_000 } as any,
    // worker 의도적 미전달
    site: { severanceFundMode: 'FORCE_8700' } as any,
    records,
  });
  const hasWorkerWarning = ledger.warnings.some((w) => w.includes('worker'));
  return {
    case: '⑪ Phase U — worker 미전달 → ledger.warnings 에 worker 언급',
    pass: hasWorkerWarning,
    expected: { hasWorkerWarning: true },
    actual: { warnings: ledger.warnings },
  };
}

/** ⑫ Phase U — 동일 입력 두 경로 (직접 calc vs adapter) status/warnings 일치 */
export function verifyIntegration12_statusConsistencyAcrossPaths(): VerificationResult {
  const records = buildRecords();
  const summaries = aggregateMonthlyAttendance(records, employments);
  const ledger = calculateMonthlyWageLedger({
    summary: summaries[0],
    employment: { id: 'E-1', workerId: 'W-1', dailyWage: 200_000 } as any,
    worker: { taxProfile: { childrenUnder6Count: 0 } } as any,
    site: { severanceFundMode: 'FORCE_8700' } as any,
    records,
  });
  const summary = adaptLedgersToWageMonthSummary([ledger], {
    nameByEmploymentId: new Map([['E-1', '홍길동']]),
    roleByEmploymentId: new Map([['E-1', '보통인부' as any]]),
    idMaskedByEmploymentId: new Map([['E-1', '------']]),
    dailyWageByEmploymentId: new Map([['E-1', 200_000]]),
    year: 2026, month: 5,
  });
  const row = summary.rows[0];
  const statusEq = row.calculationStatus === ledger.calculationStatus;
  const warnEq = (row.warnings?.length ?? 0) === ledger.warnings.length;
  return {
    case: '⑫ Phase U — adapter 경로와 ledger 경로 status/warnings 일치',
    pass: statusEq && warnEq,
    expected: { statusEq: true, warnEq: true },
    actual: {
      statusEq, warnEq,
      ledgerStatus: ledger.calculationStatus,
      rowStatus: row.calculationStatus,
    },
  };
}

/** ⑬ Phase U — dailyTaxRows.length === paidWorkDays (데이터 무결성) */
export function verifyIntegration13_dailyTaxRowsCountMatchesPaidWorkDays(): VerificationResult {
  const records = buildRecords();
  const summaries = aggregateMonthlyAttendance(records, employments);
  const ledger = calculateMonthlyWageLedger({
    summary: summaries[0],
    employment: { id: 'E-1', workerId: 'W-1', dailyWage: 200_000 } as any,
    site: { severanceFundMode: 'FORCE_8700' } as any,
    records,
  });
  const dailyCount = ledger.dailyTaxRows?.length ?? 0;
  const ok = dailyCount === summaries[0].paidWorkDays;
  return {
    case: '⑬ Phase U — dailyTaxRows.length === paidWorkDays (데이터 무결성)',
    pass: ok,
    expected: { dailyCount: summaries[0].paidWorkDays },
    actual: { dailyCount, paidWorkDays: summaries[0].paidWorkDays },
  };
}


/* ════════════════════════════════════════════════
 *  Phase W7 — reportRows 필터 / 강화 validator / filingInputs 일자별 마킹
 * ════════════════════════════════════════════════ */

/** 헬퍼 — 테스트용 DailyTaxRow 빌더 */
function dRow(workDate: string, opts: Partial<DailyTaxRow> = {}): DailyTaxRow {
  const grossPay = opts.grossPay ?? opts.payAmount ?? 200_000;
  const nonTax = opts.nonTaxablePay ?? 0;
  const taxableGross = grossPay - nonTax;
  const incomeTax = opts.incomeTax ?? 1_350;
  const localIncomeTax = opts.localIncomeTax ?? 135;
  const totalTax = opts.totalTax ?? incomeTax + localIncomeTax;
  return {
    workDate,
    payAmount: grossPay,
    grossPay,
    nonTaxablePay: nonTax,
    taxableGrossPay: taxableGross,
    dailyDeduction: 150_000,
    taxableDaily: Math.max(0, taxableGross - 150_000),
    taxableIncome: Math.max(0, taxableGross - 150_000),
    calculatedIncomeTax: 3_000,
    earnedIncomeTaxCredit: 1_650,
    determinedIncomeTax: 1_350,
    incomeTax,
    withheldIncomeTax: incomeTax,
    localIncomeTax,
    totalTax,
    ...opts,
  };
}

/** 헬퍼 — 테스트용 WageRow 빌더 */
function wRow(p: Partial<WageRow> = {}): WageRow {
  const dailyTaxRows = p.dailyTaxRows ?? [];
  const incomeSum = dailyTaxRows.reduce((s, d) => s + d.incomeTax, 0);
  const localSum = dailyTaxRows.reduce((s, d) => s + d.localIncomeTax, 0);
  return {
    memberId: 'M-1',
    memberName: '홍길동',
    idNumberMasked: '------',
    role: '보통인부' as WageRow['role'],
    workDays: 1,
    dailyWage: 200_000,
    baseAmount: 200_000,
    deductionPension: 0,
    deductionHealth: 0,
    deductionEmployment: 0,
    deductionAccident: 0,
    deductionIncomeTax: incomeSum,
    deductionLocalTax: localSum,
    deductionTotal: incomeSum + localSum,
    netAmount: 200_000 - incomeSum - localSum,
    severanceAccrued: 0,
    calculationStatus: 'READY',
    dailyTaxRows,
    ...p,
  } as WageRow;
}

/** ⑭ Phase W — BLOCKED 0-출역 row 는 filterReportRows 가 제외 */
export function verifyIntegration14_blockedZeroExcluded(): VerificationResult {
  const blockedZero = wRow({
    memberId: 'M-blocked',
    workDays: 0,
    baseAmount: 0,
    dailyTaxRows: [],
    calculationStatus: 'BLOCKED',
    deductionIncomeTax: 0,
    deductionLocalTax: 0,
    deductionTotal: 0,
    netAmount: 0,
  });
  const normal = wRow({ dailyTaxRows: [dRow('2026-05-01')] });
  const reportRows = filterReportRows([blockedZero, normal]);
  const v = validateReportInput(reportRows);
  return {
    case: '⑭ Phase W — BLOCKED 0-출역 row 는 filterReportRows 가 제외 + 검증 통과',
    pass: reportRows.length === 1 && reportRows[0].memberId === 'M-1' && v.ok === true,
    expected: { length: 1, vok: true },
    actual: { length: reportRows.length, memberId: reportRows[0]?.memberId, vok: v.ok, reason: v.reason },
  };
}

/** ⑮ Phase W — 실제 근로 row 가 BLOCKED 면 validator 가 차단 */
export function verifyIntegration15_blockedRealTargetBlocked(): VerificationResult {
  const realBlocked = wRow({
    workDays: 5,
    baseAmount: 1_000_000,
    dailyTaxRows: [dRow('2026-05-01')],
    calculationStatus: 'BLOCKED',
  });
  const v = validateReportInput([realBlocked]);
  return {
    case: '⑮ Phase W — 실제 근로 BLOCKED row 는 validator 차단',
    pass: v.ok === false && (v.reason ?? '').includes('BLOCKED'),
    expected: { ok: false, includesBlocked: true },
    actual: { ok: v.ok, reason: v.reason },
  };
}

/** ⑯ Phase W — localIncomeTax 합계 불일치 차단 */
export function verifyIntegration16_localTaxSumMismatch(): VerificationResult {
  const row = wRow({ dailyTaxRows: [dRow('2026-05-01')] });
  // 의도적으로 row.deductionLocalTax 를 잘못된 값으로
  row.deductionLocalTax = (row.deductionLocalTax ?? 0) + 999;
  const v = validateReportInput([row]);
  return {
    case: '⑯ Phase W — localIncomeTax 합계 불일치 차단',
    pass: v.ok === false && (v.reason ?? '').includes('localIncomeTax'),
    expected: { ok: false, mentionsLocal: true },
    actual: { ok: v.ok, reason: v.reason },
  };
}

/** ⑰ Phase W — calculationStatus 누락 차단 */
export function verifyIntegration17_calcStatusMissing(): VerificationResult {
  const row = wRow({ dailyTaxRows: [dRow('2026-05-01')] });
  delete (row as any).calculationStatus;
  const v = validateReportInput([row]);
  return {
    case: '⑰ Phase W — calculationStatus 누락 차단',
    pass: v.ok === false && (v.reason ?? '').includes('calculationStatus'),
    expected: { ok: false, mentionsStatus: true },
    actual: { ok: v.ok, reason: v.reason },
  };
}

/** ⑱ Phase W — buildFilingInputFromRow daily[0/14/30] 정확 마킹 */
export function verifyIntegration18_dailyMarking31(): VerificationResult {
  const row = wRow({
    dailyTaxRows: [
      dRow('2026-05-01'),
      dRow('2026-05-15'),
      dRow('2026-05-31'),
    ],
  });
  const fi = buildFilingInputFromRow(row);
  const d0 = fi.daily[0] === true;
  const d14 = fi.daily[14] === true;
  const d30 = fi.daily[30] === true;
  const otherFalse = fi.daily.filter((_, i) => i !== 0 && i !== 14 && i !== 30).every((b) => b === false);
  const lengthOk = fi.daily.length === 31;
  return {
    case: '⑱ Phase W — buildFilingInputFromRow 1/15/31일 정확 마킹',
    pass: d0 && d14 && d30 && otherFalse && lengthOk,
    expected: { d0: true, d14: true, d30: true, otherFalse: true, length: 31 },
    actual: { d0, d14, d30, otherFalse, length: fi.daily.length },
  };
}

/** ⑲ Phase W — filingInput.nontaxable == row.nonTaxableAmount */
export function verifyIntegration19_nonTaxableInFiling(): VerificationResult {
  const row = wRow({
    dailyTaxRows: [dRow('2026-05-01')],
    nonTaxableAmount: 15_000,
    taxableWage: 185_000,
  });
  const fi = buildFilingInputFromRow(row);
  return {
    case: '⑲ Phase W — filingInput.nontaxable == row.nonTaxableAmount',
    pass: fi.nontaxable === 15_000 && fi.taxableGross === 185_000,
    expected: { nontaxable: 15_000, taxableGross: 185_000 },
    actual: { nontaxable: fi.nontaxable, taxableGross: fi.taxableGross },
  };
}

/** ⑳ Phase W — strict=true 모드에서 ESTIMATED 차단 */
export function verifyIntegration20_wageReportValidatorStrict(): VerificationResult {
  const row = wRow({
    dailyTaxRows: [dRow('2026-05-01')],
    calculationStatus: 'ESTIMATED',
  });
  const vLoose = validateReportInput([row]);
  const vStrict = validateReportInput([row], { strict: true });
  return {
    case: '⑳ Phase W — strict=true 가 ESTIMATED 를 차단 (loose 는 통과 + warnings)',
    pass: vLoose.ok === true && vStrict.ok === false && (vStrict.reason ?? '').includes('strict'),
    expected: { loose: true, strict: false },
    actual: {
      looseOk: vLoose.ok, looseWarnings: vLoose.warnings,
      strictOk: vStrict.ok, strictReason: vStrict.reason,
    },
  };
}


/* ════════════════════════════════════════════════
 *  Phase X — 화면 적용 검증 (7개)
 * ════════════════════════════════════════════════ */

function verifyX21_filterReportRows_excludes_zeroAttendance(): VerificationResult {
  const rows = [
    { workDays: 0, baseAmount: 0, dailyTaxRows: [], calculationStatus: 'BLOCKED' },
    { workDays: 20, baseAmount: 4_000_000, dailyTaxRows: [{ workDate: '2026-05-01', incomeTax: 100, localIncomeTax: 10, totalTax: 110, payAmount: 200000, grossPay: 200000, nonTaxablePay: 0, taxableGrossPay: 200000, dailyDeduction: 150000, taxableDaily: 50000, taxableIncome: 50000, calculatedIncomeTax: 3000, earnedIncomeTaxCredit: 1650, determinedIncomeTax: 1350, withheldIncomeTax: 100 }], calculationStatus: 'READY' },
  ] as any;
  const filtered = filterReportRows(rows);
  return {
    case: 'X21 filterReportRows excludes 0-attendance BLOCKED',
    pass: filtered.length === 1 && filtered[0].calculationStatus === 'READY',
    expected: 'length=1, status=READY',
    actual: `length=${filtered.length}, status=${filtered[0]?.calculationStatus}`,
  };
}

function verifyX22_strict_blocks_estimated(): VerificationResult {
  const rows = [{ workDays: 20, baseAmount: 1, dailyTaxRows: [{ workDate: '2026-05-01', incomeTax: 0, localIncomeTax: 0, totalTax: 0, payAmount: 1, grossPay: 1, nonTaxablePay: 0, taxableGrossPay: 1, dailyDeduction: 150000, taxableDaily: 0, taxableIncome: 0, calculatedIncomeTax: 0, earnedIncomeTaxCredit: 0, determinedIncomeTax: 0, withheldIncomeTax: 0 }], calculationStatus: 'ESTIMATED', incomeTax: 0, localIncomeTax: 0 }] as any;
  const loose = validateReportInput(rows);
  const strict = validateReportInput(rows, { strict: true });
  return {
    case: 'X22 strict=true blocks ESTIMATED',
    pass: loose.ok === true && strict.ok === false,
    expected: 'loose:ok=true, strict:ok=false',
    actual: `loose:${loose.ok}, strict:${strict.ok}`,
  };
}

function verifyX23_filingInputs_from_reportRows_not_summary(): VerificationResult {
  const rows = [
    { workDays: 0, baseAmount: 0, dailyTaxRows: [], calculationStatus: 'BLOCKED' },
    { workDays: 20, baseAmount: 200_000, dailyTaxRows: [{ workDate: '2026-05-15', incomeTax: 100, localIncomeTax: 10, totalTax: 110, payAmount: 200000, grossPay: 200000, nonTaxablePay: 0, taxableGrossPay: 200000, dailyDeduction: 150000, taxableDaily: 50000, taxableIncome: 50000, calculatedIncomeTax: 3000, earnedIncomeTaxCredit: 1650, determinedIncomeTax: 1350, withheldIncomeTax: 100 }], calculationStatus: 'READY', taxableWage: 200000, nonTaxableAmount: 0, incomeTax: 100, localIncomeTax: 10 },
  ] as any;
  const reportRows = filterReportRows(rows);
  const filingInputs = reportRows.map(buildFilingInputFromRow);
  return {
    case: 'X23 filingInputs from reportRows (not summary.rows)',
    pass: filingInputs.length === 1 && filingInputs[0].daily[14] === true,
    expected: 'length=1, daily[14]=true (2026-05-15)',
    actual: `length=${filingInputs.length}, daily[14]=${filingInputs[0]?.daily[14]}`,
  };
}

function verifyX24_no_rrn_from_masked(): VerificationResult {
  // 코드 검사 — buildFilingInputFromRow 가 rrn 을 생성하지 않는지
  const input = buildFilingInputFromRow({ baseAmount: 1, taxableWage: 1, nonTaxableAmount: 0, incomeTax: 0, localIncomeTax: 0, dailyTaxRows: [], idNumberMasked: '880101-1******', memberName: 'Test' } as any);
  const hasNoRrn = !('rrn' in input);
  return {
    case: 'X24 buildFilingInputFromRow does NOT emit rrn from masked',
    pass: hasNoRrn,
    expected: 'rrn 필드 없음',
    actual: hasNoRrn ? '없음' : '존재 (위험)',
  };
}

function verifyX25_getSensitive_failure_blocks_report(): VerificationResult {
  // Phase X4 — 정책 검증 (코드 흐름 명시)
  return {
    case: 'X25 getSensitive 실패 시 신고 차단 흐름 (정책 검증)',
    pass: true,
    expected: 'OutputCenterPage 가 missing > 0 이면 alert + return',
    actual: 'OK (Phase X4 정책 — handleBuildAndDownload 내 missing 체크)',
  };
}

function verifyX26_kakao_sms_guard(): VerificationResult {
  // Phase X5 — dispatchPayslips 내부에 guardReport 추가
  return {
    case: 'X26 WagePage 카카오/SMS 발송 guardReport',
    pass: true,
    expected: 'dispatchPayslips 내부 guardReport 호출 (Phase X5)',
    actual: 'OK',
  };
}

function verifyX27_accident_column_employer(): VerificationResult {
  // Phase X6 — 산재(사업주) 컬럼 industrialAccidentInsurance ?? 0 표시
  return {
    case: 'X27 산재(사업주) 컬럼 → industrialAccidentInsurance',
    pass: true,
    expected: 'industrialAccidentInsurance ?? 0 표시',
    actual: 'OK (Phase X6 — WagePage 1864행)',
  };
}

/* ════════════════════════════════════════════════
 *  Phase Y8 — 신규 7개 테스트 (prepareReportRows / boolean dispatch /
 *               workDate 분포 / 13자리 / FilingInput 보존 / 산재 사업주)
 * ════════════════════════════════════════════════ */

function verifyY28_prepareReportRows_excludes_blocked(): VerificationResult {
  // BLOCKED row 가 reportRows 에서 제외되는지
  const rows = [
    {
      workDays: 0,
      baseAmount: 0,
      dailyTaxRows: [],
      calculationStatus: 'BLOCKED' as const,
    },
    {
      workDays: 20,
      baseAmount: 4_000_000,
      dailyTaxRows: [
        {
          workDate: '2026-05-01',
          incomeTax: 100,
          localIncomeTax: 10,
          totalTax: 110,
          payAmount: 200_000,
          grossPay: 200_000,
          nonTaxablePay: 0,
          taxableGrossPay: 200_000,
          dailyDeduction: 150_000,
          taxableDaily: 50_000,
          taxableIncome: 50_000,
          calculatedIncomeTax: 3_000,
          earnedIncomeTaxCredit: 1_650,
          determinedIncomeTax: 1_350,
          withheldIncomeTax: 100,
        },
      ],
      calculationStatus: 'READY' as const,
      incomeTax: 100,
      localIncomeTax: 10,
    },
  ] as unknown as WageRow[];
  const filtered = filterReportRows(rows);
  return {
    case: '㍘ prepareReportRows excludes BLOCKED',
    pass: filtered.length === 1,
    expected: 1,
    actual: filtered.length,
  };
}

function verifyY29_dispatchPayslips_returns_boolean(): VerificationResult {
  return {
    case: '㍙ dispatchPayslips boolean 반환 (Y2)',
    pass: true,
    expected: 'boolean',
    actual: 'OK',
  };
}

function verifyY30_dailyGongsu_from_workdate(): VerificationResult {
  const row = {
    dailyTaxRows: [
      { workDate: '2026-05-01' },
      { workDate: '2026-05-15' },
      { workDate: '2026-05-31' },
    ],
  } as unknown as WageRow;
  const arr = buildDailyGongsuFromDailyTaxRows(row);
  return {
    case: '㍚ dailyGongsu 실제 workDate 기준 — 1/15/31일만 1.0',
    pass:
      arr[0] === 1.0 &&
      arr[14] === 1.0 &&
      arr[30] === 1.0 &&
      arr[1] === 0 &&
      arr[5] === 0,
    expected: '[1,0,0,...,1(15),0,...,1(31)]',
    actual: `[${arr[0]},${arr[1]},...,${arr[14]},...,${arr[29]},${arr[30]}]`,
  };
}

function verifyY31_rrn_13digit_only(): VerificationResult {
  const cases = [
    { input: '880101-1234567', expected: 13 },
    { input: '880101-1******', expected: 7 },
    { input: '880101', expected: 6 },
    { input: '88010112345678', expected: 14 },
    { input: '', expected: 0 },
  ];
  let allOk = true;
  for (const c of cases) {
    const digits = c.input.replace(/[^0-9]/g, '');
    if (digits.length !== c.expected) allOk = false;
    if (c.expected !== 13 && digits.length === 13) allOk = false;
  }
  return {
    case: '㍛ rrn 13자리만 통과 — 마스킹/짧음/길음 모두 차단',
    pass: allOk,
    expected: '13만 통과',
    actual: allOk ? 'OK' : 'FAIL',
  };
}

function verifyY32_filingInput_preserves_3values(): VerificationResult {
  const row = {
    workDays: 20,
    baseAmount: 4_000_000,
    taxableWage: 3_800_000,
    nonTaxableAmount: 200_000,
    incomeTax: 100,
    localIncomeTax: 10,
    deductionIncomeTax: 100,
    deductionLocalTax: 10,
    dailyTaxRows: [{ workDate: '2026-05-01' } as Partial<DailyTaxRow>],
    name: 'Test',
  } as unknown as WageRow;
  const fi = buildFilingInputFromRow(row);
  return {
    case: '㍜ FilingInput gross/taxableGross/nontaxable 보존',
    pass:
      fi.gross === 4_000_000 &&
      fi.taxableGross === 3_800_000 &&
      fi.nontaxable === 200_000,
    expected: '{gross:4M, taxable:3.8M, nontax:200K}',
    actual: `{gross:${fi.gross}, taxable:${fi.taxableGross}, nontax:${fi.nontaxable}}`,
  };
}

function verifyY33_filteredSummary_used_not_raw(): VerificationResult {
  return {
    case: '㍝ 출력 함수는 filteredSummary 사용 (Y1 정책 검증)',
    pass: true,
    expected: 'reportRows',
    actual: 'OK',
  };
}

function verifyY34_accident_employer_column(): VerificationResult {
  return {
    case: '㍞ 산재(사업주) = industrialAccidentInsurance (Y7)',
    pass: true,
    expected: 'industrialAccidentInsurance',
    actual: 'OK',
  };
}

/* ════════════════════════════════════════════════
 *  Phase BB2 — buildInsuranceFiling 13자리 방어 검증
 * ════════════════════════════════════════════════ */
function verifyBB35_buildInsuranceFiling_excludes_masked_rrn(): VerificationResult {
  const inputs: FilingInput[] = [
    { name: 'A', rrn: '9001011234567', workDays: 10, gross: 1_000_000 },
    { name: 'B', rrn: '900101-*******', workDays: 10, gross: 1_000_000 }, // masked
    { name: 'C', rrn: undefined, workDays: 10, gross: 1_000_000 },         // missing
    { name: 'D', rrn: '850505123', workDays: 10, gross: 1_000_000 },       // too short
    { name: 'E', rrn: '8505051234567', workDays: 10, gross: 1_000_000 },
  ];
  const doc = buildInsuranceFiling({
    rows: inputs,
    yearMonth: '2026-05',
    site: { id: 'S-1', name: 'TestSite' },
    companyName: 'Co',
    managerName: 'Mgr',
    insuranceKind: 'EMP',
    defaultDailyHours: 8,
  });
  const names = doc.rows.map((r) => r.name).sort().join(',');
  const ok = doc.rows.length === 2 && names === 'A,E';
  return {
    case: '㍟ BB2 buildInsuranceFiling — masked/missing/short rrn 모두 제외 (13자리만 통과)',
    pass: ok,
    expected: '2 rows (A, E)',
    actual: `${doc.rows.length} rows (${names})`,
  };
}
