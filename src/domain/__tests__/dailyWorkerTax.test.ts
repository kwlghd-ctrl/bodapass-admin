/**
 * 도메인 테스트 — 일용근로 소득세 (dailyWorkerTax)
 *
 * Vitest 가 없으므로 자체 verifier 패턴 사용.
 * 브라우저 콘솔: import('@/domain/__tests__/dailyWorkerTax.test').then(m => m.verifyAllDailyWorkerTax())
 */
import type { VerificationResult } from '../../utils/__verify__/calculationVerifier';
import { calculateDailyWorkerTaxRows } from '../tax/dailyWorkerTaxCalculator';
import type { DailyIncomeTaxPolicy } from '../tax/dailyWorkerTax.types';

const POLICY: DailyIncomeTaxPolicy = {
  rate: 0.06,
  dailyDeduction: 150_000,
  localRate: 0.1,
  earnedIncomeTaxCreditRate: 0.55,
  smallAmountThreshold: 1000,
};

/** ① 일급 150,000원 → 과표 0 → 세금 0 */
export function verifyTax01_150k_noTax(): VerificationResult {
  const r = calculateDailyWorkerTaxRows(
    [{ workDate: '2026-05-01', payAmount: 150_000 }],
    POLICY,
  );
  const row = r.rows[0];
  return {
    case: '① 일급 150,000원 → 과표 0 → 세금 0',
    pass: row.taxableDaily === 0 && row.incomeTax === 0 && row.localIncomeTax === 0,
    expected: { taxableDaily: 0, incomeTax: 0, localIncomeTax: 0 },
    actual: {
      taxableDaily: row.taxableDaily,
      incomeTax: row.incomeTax,
      localIncomeTax: row.localIncomeTax,
    },
  };
}

/** ② 일급 200,000원 → 산출 3,000 → 공제 1,650 → 결정 1,350 → 1000 이상 → 1,350 */
export function verifyTax02_200k_smallButCollected(): VerificationResult {
  const r = calculateDailyWorkerTaxRows(
    [{ workDate: '2026-05-01', payAmount: 200_000 }],
    POLICY,
  );
  const row = r.rows[0];
  const expected = {
    taxableDaily: 50_000,
    calculatedIncomeTax: 3_000,
    earnedIncomeTaxCredit: 1_650,
    determinedIncomeTax: 1_350,
    incomeTax: 1_350,
    localIncomeTax: 135,
  };
  const actual = {
    taxableDaily: row.taxableDaily,
    calculatedIncomeTax: row.calculatedIncomeTax,
    earnedIncomeTaxCredit: row.earnedIncomeTaxCredit,
    determinedIncomeTax: row.determinedIncomeTax,
    incomeTax: row.incomeTax,
    localIncomeTax: row.localIncomeTax,
  };
  const pass =
    actual.taxableDaily === expected.taxableDaily &&
    actual.calculatedIncomeTax === expected.calculatedIncomeTax &&
    actual.earnedIncomeTaxCredit === expected.earnedIncomeTaxCredit &&
    actual.determinedIncomeTax === expected.determinedIncomeTax &&
    actual.incomeTax === expected.incomeTax &&
    actual.localIncomeTax === expected.localIncomeTax;
  return {
    case: '② 일급 200,000원 → 산출 3,000 → 공제 1,650 → 결정 1,350 → 1,350 징수, 지방 135',
    pass,
    expected,
    actual,
  };
}

/** ③ 일급 160,000원 → 산출 600 → 공제 330 → 결정 270 → 1000 미만 → 0 (소액부징수) */
export function verifyTax03_160k_smallAmountExempt(): VerificationResult {
  const r = calculateDailyWorkerTaxRows(
    [{ workDate: '2026-05-01', payAmount: 160_000 }],
    POLICY,
  );
  const row = r.rows[0];
  const expected = {
    taxableDaily: 10_000,
    calculatedIncomeTax: 600,
    earnedIncomeTaxCredit: 330,
    determinedIncomeTax: 270,
    incomeTax: 0,
    localIncomeTax: 0,
  };
  const actual = {
    taxableDaily: row.taxableDaily,
    calculatedIncomeTax: row.calculatedIncomeTax,
    earnedIncomeTaxCredit: row.earnedIncomeTaxCredit,
    determinedIncomeTax: row.determinedIncomeTax,
    incomeTax: row.incomeTax,
    localIncomeTax: row.localIncomeTax,
  };
  const pass =
    actual.taxableDaily === expected.taxableDaily &&
    actual.calculatedIncomeTax === expected.calculatedIncomeTax &&
    actual.earnedIncomeTaxCredit === expected.earnedIncomeTaxCredit &&
    actual.determinedIncomeTax === expected.determinedIncomeTax &&
    actual.incomeTax === expected.incomeTax &&
    actual.localIncomeTax === expected.localIncomeTax;
  return {
    case: '③ 일급 160,000원 → 결정 270 → 1,000 미만 → 0 (소액부징수)',
    pass,
    expected,
    actual,
  };
}

/** ④ 일급 800,000원 → 17,550 (case 9: 일자별 다른 payAmount → 평균 X) */
export function verifyTax04_800k_highWage(): VerificationResult {
  const r = calculateDailyWorkerTaxRows(
    [{ workDate: '2026-05-01', payAmount: 800_000 }],
    POLICY,
  );
  const row = r.rows[0];
  // 과표 650,000 → 산출 39,000 → 공제 21,450 → 결정 17,550
  const expected = 17_550;
  return {
    case: '④ 일급 800,000원 → 결정세액 17,550원 (case 9 검증)',
    pass: row.incomeTax === expected,
    expected,
    actual: row.incomeTax,
    note: `taxableDaily=${row.taxableDaily} calculated=${row.calculatedIncomeTax} credit=${row.earnedIncomeTaxCredit}`,
  };
}

/** ⑤ 지방세 = floor(소득세 × 0.1) */
export function verifyTax05_localTax(): VerificationResult {
  const r = calculateDailyWorkerTaxRows(
    [
      { workDate: '2026-05-01', payAmount: 200_000 },
      { workDate: '2026-05-02', payAmount: 800_000 },
    ],
    POLICY,
  );
  const row0 = r.rows[0];
  const row1 = r.rows[1];
  const e0 = Math.floor(row0.incomeTax * 0.1);
  const e1 = Math.floor(row1.incomeTax * 0.1);
  return {
    case: '⑤ 지방세 = floor(소득세 × 0.1)',
    pass: row0.localIncomeTax === e0 && row1.localIncomeTax === e1,
    expected: { day1: e0, day2: e1 },
    actual: { day1: row0.localIncomeTax, day2: row1.localIncomeTax },
  };
}

export function verifyAllDailyWorkerTax(): VerificationResult[] {
  const all = [
    verifyTax01_150k_noTax(),
    verifyTax02_200k_smallButCollected(),
    verifyTax03_160k_smallAmountExempt(),
    verifyTax04_800k_highWage(),
    verifyTax05_localTax(),
    verifyTax06_20days_200k(),
    verifyTax07_S1_aliasFields(),
  ];
  const passed = all.filter((r) => r.pass).length;
  console.group(`[bodapass] domain/dailyWorkerTax — ${passed}/${all.length} passed`);
  for (const r of all) console.log(`${r.pass ? '✓' : '✗'} ${r.case}`);
  console.groupEnd();
  return all;
}

/** ⑥ Phase S4(a) — 20일 × 200,000 → 소득세 27,000원 / 지방세 2,700원 */
export function verifyTax06_20days_200k(): VerificationResult {
  const inputs = [];
  for (let day = 1; day <= 20; day++) {
    const dd = String(day).padStart(2, '0');
    inputs.push({ workDate: `2026-05-${dd}`, payAmount: 200_000 });
  }
  const r = calculateDailyWorkerTaxRows(inputs, POLICY);
  const expected = { totalIncomeTax: 27_000, totalLocalIncomeTax: 2_700, rowCount: 20 };
  const actual = {
    totalIncomeTax: r.totalIncomeTax,
    totalLocalIncomeTax: r.totalLocalIncomeTax,
    rowCount: r.rows.length,
  };
  const pass =
    actual.totalIncomeTax === expected.totalIncomeTax &&
    actual.totalLocalIncomeTax === expected.totalLocalIncomeTax &&
    actual.rowCount === expected.rowCount;
  return {
    case: '⑥ Phase S4(a) — 20일 × 200,000 → 소득세 27,000 / 지방세 2,700',
    pass,
    expected,
    actual,
  };
}

/** ⑦ Phase S1 — DailyTaxRow alias 필드 (grossPay/taxableIncome/withheldIncomeTax/totalTax) 일치 */
export function verifyTax07_S1_aliasFields(): VerificationResult {
  const r = calculateDailyWorkerTaxRows(
    [{ workDate: '2026-05-01', payAmount: 200_000, workerId: 'W-A', siteId: 'S-1', employmentId: 'E-1' }],
    POLICY,
  );
  const row = r.rows[0];
  const checks = {
    grossPayEqPayAmount: row.grossPay === row.payAmount,
    taxableIncomeEqTaxableDaily: row.taxableIncome === row.taxableDaily,
    withheldEqIncomeTax: row.withheldIncomeTax === row.incomeTax,
    totalTaxEqSum: row.totalTax === row.incomeTax + row.localIncomeTax,
    taxableGrossPay: row.taxableGrossPay === 200_000 - 0,
    workerIdPropagated: row.workerId === 'W-A',
    siteIdPropagated: row.siteId === 'S-1',
    employmentIdPropagated: row.employmentId === 'E-1',
  };
  const pass = Object.values(checks).every(Boolean);
  return {
    case: '⑦ Phase S1 — alias 필드 (grossPay/taxableIncome/withheldIncomeTax/totalTax) + id 전파',
    pass,
    expected: 'all true',
    actual: checks,
  };
}
