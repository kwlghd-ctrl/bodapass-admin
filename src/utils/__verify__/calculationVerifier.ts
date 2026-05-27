/**
 * calculationVerifier — Phase O 계산 모듈 자체 검증 (no test runner)
 *
 * Vitest 등 정식 test runner 가 도입되기 전까지 사용하는 간단한 검증 함수.
 * 브라우저 콘솔에서 `import('@/utils/__verify__/calculationVerifier').then(m => m.runAllVerifications())`
 * 로 실행하거나 임시 스크립트에서 호출.
 *
 * 검증 케이스 (사용자 요구):
 *   ① 20일 출역 × 6,500원 = 130,000원
 *   ② 20일 출역 × 8,700원 = 174,000원
 *   ③ 입찰공고일 2026-03-31 → 6,500원
 *   ④ 입찰공고일 2026-04-01 → 8,700원
 *   ⑤ 입찰공고일 없음 → 8,700원 + warning
 *   ⑥ 퇴근 누락 → 공수 BLOCKED
 *   ⑦ 수동 공수 승인 전 → 미반영
 *   ⑧ 수동 공수 승인 후 → 반영
 *   ⑨ 일자별 payAmount 가 다른 경우 → 평균 일급 방식이 아니라 일자별 세금 합산
 */

import { resolveSeveranceFundDaily } from '../severance';
import { calculateSeveranceFund } from '../severanceCalculation';
import { calculateDailyGongsu } from '../gongsu';
import { calculateDailyIncomeTaxRows } from '../incomeTaxDaily';
import type { WorkRule } from '../../api/workRule.types';

export interface VerificationResult {
  case: string;
  pass: boolean;
  expected: unknown;
  actual: unknown;
  note?: string;
}

const STANDARD_WORK_RULE: WorkRule = {
  id: 'WR-VERIFY-DEFAULT',
  name: 'verify default',
  standardWorkMinutes: 480,
  halfDayMinMinutes: 240,
  oneDayMinMinutes: 480,
  overtimeMinMinutes: 120,
  maxGongsuPerDay: 2.0,
  roundingUnit: 0.5,
  lunchBreakMinutes: 60,
  effectiveFrom: '2024-01-01',
};

/** 1: 20일 × 6,500 = 130,000 (FORCE_6500 시) */
export function verifyCase01_20days_6500(): VerificationResult {
  const r = calculateSeveranceFund({
    employmentId: 'E-VERIFY',
    yearMonth: '2026-03',
    severanceWorkDays: 20,
    site: { severanceFundMode: 'FORCE_6500', contractDate: '2026-03-01' },
  });
  const expected = 130_000;
  return {
    case: '① 20일 × 6,500원 = 130,000원 (FORCE_6500)',
    pass: r.amount === expected,
    expected,
    actual: r.amount,
    note: `appliedDailyFund=${r.appliedDailyFund} basisDate=${r.basisDate}`,
  };
}

/** 2: 20일 × 8,700 = 174,000 (FORCE_8700 시) */
export function verifyCase02_20days_8700(): VerificationResult {
  const r = calculateSeveranceFund({
    employmentId: 'E-VERIFY',
    yearMonth: '2026-05',
    severanceWorkDays: 20,
    site: { severanceFundMode: 'FORCE_8700', contractDate: '2026-05-01' },
  });
  const expected = 174_000;
  return {
    case: '② 20일 × 8,700원 = 174,000원 (FORCE_8700)',
    pass: r.amount === expected,
    expected,
    actual: r.amount,
    note: `appliedDailyFund=${r.appliedDailyFund}`,
  };
}

/** 3: 입찰공고일 2026-03-31 → 6,500원 (AUTO) */
export function verifyCase03_autoBefore0401(): VerificationResult {
  const d = resolveSeveranceFundDaily({
    site: { bidNoticeDate: '2026-03-31' },
    globalSetting: { mode: 'AUTO_BY_SITE_DATE', updatedAt: '' },
  });
  const expected = 6500;
  return {
    case: '③ 입찰공고일 2026-03-31 → 6,500원 (AUTO)',
    pass: d.fundDaily === expected,
    expected,
    actual: d.fundDaily,
    note: `confidence=${d.confidence} basisDate=${d.basisDate}`,
  };
}

/** 4: 입찰공고일 2026-04-01 → 8,700원 (AUTO) */
export function verifyCase04_autoOn0401(): VerificationResult {
  const d = resolveSeveranceFundDaily({
    site: { bidNoticeDate: '2026-04-01' },
    globalSetting: { mode: 'AUTO_BY_SITE_DATE', updatedAt: '' },
  });
  const expected = 8700;
  return {
    case: '④ 입찰공고일 2026-04-01 → 8,700원 (AUTO)',
    pass: d.fundDaily === expected,
    expected,
    actual: d.fundDaily,
    note: `confidence=${d.confidence} basisDate=${d.basisDate}`,
  };
}

/** 5: 입찰공고일 없음 → 8,700원 + low confidence + warning */
export function verifyCase05_autoNoBasis(): VerificationResult {
  const d = resolveSeveranceFundDaily({
    site: {},
    globalSetting: { mode: 'AUTO_BY_SITE_DATE', updatedAt: '' },
  });
  const expectedAmount = 8700;
  const expectedConfidenceLow = d.confidence === 'low';
  const hasWarning = !!d.warning;
  return {
    case: '⑤ 입찰공고일 없음 → 8,700원 + warning (AUTO)',
    pass: d.fundDaily === expectedAmount && expectedConfidenceLow && hasWarning,
    expected: { fundDaily: 8700, confidence: 'low', warning: '(not empty)' },
    actual: { fundDaily: d.fundDaily, confidence: d.confidence, warning: d.warning },
  };
}

/** 6: 퇴근 누락 → BLOCKED */
export function verifyCase06_blockedNoCheckOut(): VerificationResult {
  const r = calculateDailyGongsu({
    checkInAt: '2026-05-12T07:00:00',
    checkOutAt: null,
    workRule: STANDARD_WORK_RULE,
  });
  return {
    case: '⑥ 퇴근 누락 → basis=BLOCKED, gongsu=0',
    pass: r.basis === 'BLOCKED' && r.gongsu === 0,
    expected: { basis: 'BLOCKED', gongsu: 0 },
    actual: { basis: r.basis, gongsu: r.gongsu, warning: r.warning },
  };
}

/** 7: 수동 공수 승인 전 → 미반영 (BLOCKED) */
export function verifyCase07_manualUnapproved(): VerificationResult {
  const r = calculateDailyGongsu({
    checkInAt: '2026-05-12T07:00:00',
    checkOutAt: '2026-05-12T16:00:00',
    source: 'MANUAL',
    manualGongsu: 1.0,
    adjustmentApproved: false,
    workRule: STANDARD_WORK_RULE,
  });
  return {
    case: '⑦ 수동 공수 승인 전 → 미반영 (BLOCKED)',
    pass: r.basis === 'BLOCKED' && r.gongsu === 0,
    expected: { basis: 'BLOCKED', gongsu: 0 },
    actual: { basis: r.basis, gongsu: r.gongsu, warning: r.warning },
  };
}

/** 8: 수동 공수 승인 후 → 반영 (MANUAL_APPROVED, gongsu=1.0) */
export function verifyCase08_manualApproved(): VerificationResult {
  const r = calculateDailyGongsu({
    checkInAt: '2026-05-12T07:00:00',
    checkOutAt: '2026-05-12T16:00:00',
    source: 'MANUAL',
    manualGongsu: 1.0,
    adjustmentApproved: true,
    workRule: STANDARD_WORK_RULE,
  });
  return {
    case: '⑧ 수동 공수 승인 후 → 반영 (MANUAL_APPROVED, gongsu=1.0)',
    pass: r.basis === 'MANUAL_APPROVED' && r.gongsu === 1.0,
    expected: { basis: 'MANUAL_APPROVED', gongsu: 1.0 },
    actual: { basis: r.basis, gongsu: r.gongsu },
  };
}

/** 9: 일자별 payAmount 가 다른 경우 — 평균 방식 vs 일자별 합산 차이
 *  (Q1 정확화 후 산식 반영: 산출세액 - 55% 공제 - 소액부징수 1,000원)
 */
export function verifyCase09_dailyTaxNotAverage(): VerificationResult {
  // 시나리오: 19일은 140,000원 (소득공제 150,000원 이하 → 과표 0 → 세금 0)
  //           1일은 800,000원 (특근)
  //
  // 일자별 정확 산식:
  //   19일 × 0 = 0
  //   1일:
  //     과표 = max(0, 800000 - 0 - 150000) = 650,000
  //     산출 = floor(650000 × 0.06) = 39,000
  //     공제 = floor(39000 × 0.55) = 21,450
  //     결정 = 39,000 - 21,450 = 17,550
  //     17,550 ≥ 1,000 → 징수 17,550
  //   월 합계 = 17,550
  //
  // 평균 일급 방식 (구식 — 사용 금지):
  //   평균: 173,000 → 과표 23,000 → 산출 1,380 → 공제 759 → 결정 621 → 1000 미만 → 0
  //   ×20일 = 0 → 일자별과 17,550 차이 발생.

  const records = [
    ...Array.from({ length: 19 }, (_, i) => ({
      workDate: `2026-05-${String(i + 1).padStart(2, '0')}`,
      payAmount: 140_000,
    })),
    { workDate: '2026-05-20', payAmount: 800_000 },
  ];
  const r = calculateDailyIncomeTaxRows(records, { rate: 0.06, dailyDeduction: 150_000, localRate: 0.1 });

  const expected = 17_550;
  return {
    case: '⑨ 일자별 payAmount 다름 → 정확 산식 (산출-55%공제-소액부징수)',
    pass: r.totalIncomeTax === expected,
    expected,
    actual: r.totalIncomeTax,
    note: `행수=${r.rows.length}, 평균방식이면 0원(소액부징수), 일자별이면 ${r.totalIncomeTax}원`,
  };
}

/** 모든 케이스 일괄 실행. 콘솔에 결과 출력. */
export function runAllVerifications(): VerificationResult[] {
  const all = [
    verifyCase01_20days_6500(),
    verifyCase02_20days_8700(),
    verifyCase03_autoBefore0401(),
    verifyCase04_autoOn0401(),
    verifyCase05_autoNoBasis(),
    verifyCase06_blockedNoCheckOut(),
    verifyCase07_manualUnapproved(),
    verifyCase08_manualApproved(),
    verifyCase09_dailyTaxNotAverage(),
  ];
  const passed = all.filter((r) => r.pass).length;
  // eslint-disable-next-line no-console
  console.group(`[bodapass] Phase O verifier — ${passed}/${all.length} passed`);
  for (const r of all) {
    // eslint-disable-next-line no-console
    console.log(
      `${r.pass ? '✓' : '✗'} ${r.case}\n   expected: ${JSON.stringify(r.expected)}\n   actual:   ${JSON.stringify(r.actual)}${r.note ? '\n   note: ' + r.note : ''}`,
    );
  }
  // eslint-disable-next-line no-console
  console.groupEnd();
  return all;
}
