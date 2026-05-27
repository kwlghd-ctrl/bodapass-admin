/**
 * 도메인 테스트 — 공수 (gongsu)
 *
 * Vitest 가 없으므로 자체 verifier 패턴 사용.
 * 브라우저 콘솔: import('@/domain/__tests__/gongsu.test').then(m => m.verifyAllGongsu())
 */
import type { VerificationResult } from '../../utils/__verify__/calculationVerifier';
import { minutesToGongsu, calculateDailyGongsu } from '../attendance/gongsuCalculator';
import type { WorkRule } from '../../api/workRule.types';

const RULE: WorkRule = {
  id: 'WR-TEST',
  name: 'test rule',
  standardWorkMinutes: 480,
  halfDayMinMinutes: 240,
  oneDayMinMinutes: 480,
  overtimeMinMinutes: 120,
  maxGongsuPerDay: 2.0,
  roundingUnit: 0.5,
  lunchBreakMinutes: 0,
  effectiveFrom: '2024-01-01',
};

/** ① 4시간 미만 → 0 */
export function verifyGongsu01_under4h(): VerificationResult {
  const actual = minutesToGongsu(239);
  return {
    case: '① 4시간(240분) 미만 → 0 공수',
    pass: actual === 0,
    expected: 0,
    actual,
  };
}

/** ② 4~8시간 → 0.5 */
export function verifyGongsu02_4to8h(): VerificationResult {
  const a = minutesToGongsu(240);
  const b = minutesToGongsu(479);
  return {
    case: '② 4~8시간 (240~479분) → 0.5 공수',
    pass: a === 0.5 && b === 0.5,
    expected: 0.5,
    actual: { at240: a, at479: b },
  };
}

/** ③ 8~12시간 → 1.0 */
export function verifyGongsu03_8to12h(): VerificationResult {
  const a = minutesToGongsu(480);
  const b = minutesToGongsu(719);
  return {
    case: '③ 8~12시간 (480~719분) → 1.0 공수',
    pass: a === 1.0 && b === 1.0,
    expected: 1.0,
    actual: { at480: a, at719: b },
  };
}

/** ④ 12~16시간 → 1.5 */
export function verifyGongsu04_12to16h(): VerificationResult {
  const a = minutesToGongsu(720);
  const b = minutesToGongsu(959);
  return {
    case: '④ 12~16시간 (720~959분) → 1.5 공수',
    pass: a === 1.5 && b === 1.5,
    expected: 1.5,
    actual: { at720: a, at959: b },
  };
}

/** ⑤ 16시간 이상 → 2.0 */
export function verifyGongsu05_16hPlus(): VerificationResult {
  const a = minutesToGongsu(960);
  const b = minutesToGongsu(1200);
  return {
    case: '⑤ 16시간 이상 (960분+) → 2.0 공수 (상한)',
    pass: a === 2.0 && b === 2.0,
    expected: 2.0,
    actual: { at960: a, at1200: b },
  };
}

/** ⑥ 수동 공수 승인 전 → BLOCKED */
export function verifyGongsu06_manualBeforeApproved(): VerificationResult {
  const r = calculateDailyGongsu({
    checkInAt: '2026-05-01T07:00:00Z',
    checkOutAt: '2026-05-01T15:00:00Z',
    source: 'MANUAL',
    manualGongsu: 1,
    adjustmentApproved: false,
    workRule: RULE,
  });
  return {
    case: '⑥ 수동 공수 승인 전 → basis=BLOCKED, gongsu=0',
    pass: r.basis === 'BLOCKED' && r.gongsu === 0,
    expected: { basis: 'BLOCKED', gongsu: 0 },
    actual: { basis: r.basis, gongsu: r.gongsu },
    note: r.warning,
  };
}

/** ⑦ 수동 공수 승인 후 → MANUAL_APPROVED */
export function verifyGongsu07_manualAfterApproved(): VerificationResult {
  const r = calculateDailyGongsu({
    checkInAt: '2026-05-01T07:00:00Z',
    checkOutAt: '2026-05-01T15:00:00Z',
    source: 'MANUAL',
    manualGongsu: 1.5,
    adjustmentApproved: true,
    workRule: RULE,
  });
  return {
    case: '⑦ 수동 공수 승인 후 → basis=MANUAL_APPROVED, gongsu=1.5',
    pass: r.basis === 'MANUAL_APPROVED' && r.gongsu === 1.5,
    expected: { basis: 'MANUAL_APPROVED', gongsu: 1.5 },
    actual: { basis: r.basis, gongsu: r.gongsu },
  };
}

export function verifyAllGongsu(): VerificationResult[] {
  const all = [
    verifyGongsu01_under4h(),
    verifyGongsu02_4to8h(),
    verifyGongsu03_8to12h(),
    verifyGongsu04_12to16h(),
    verifyGongsu05_16hPlus(),
    verifyGongsu06_manualBeforeApproved(),
    verifyGongsu07_manualAfterApproved(),
  ];
  const passed = all.filter((r) => r.pass).length;
  console.group(`[bodapass] domain/gongsu — ${passed}/${all.length} passed`);
  for (const r of all) console.log(`${r.pass ? '✓' : '✗'} ${r.case}`);
  console.groupEnd();
  return all;
}
