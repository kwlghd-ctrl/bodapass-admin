/**
 * 도메인 테스트 — 퇴직공제부금 (severanceFund)
 *
 * Vitest 가 없으므로 자체 verifier 패턴 사용.
 * 브라우저 콘솔: import('@/domain/__tests__/severanceFund.test').then(m => m.verifyAllSeveranceFund())
 */
import type { VerificationResult } from '../../utils/__verify__/calculationVerifier';
import {
  calculateSeveranceFund,
  resolveSeveranceFundDaily,
} from '../severance/severanceFundCalculator';

/** ① FORCE_6500: 20일 → 130,000 */
export function verifySeverance01_force6500(): VerificationResult {
  const r = calculateSeveranceFund({
    employmentId: 'E-1',
    yearMonth: '2026-05',
    severanceWorkDays: 20,
    site: { severanceFundMode: 'FORCE_6500', contractDate: '2026-05-01' },
  });
  return {
    case: '① FORCE_6500: 20일 → 130,000원',
    pass: r.amount === 130_000,
    expected: 130_000,
    actual: r.amount,
    note: `appliedDailyFund=${r.appliedDailyFund}`,
  };
}

/** ② FORCE_8700: 20일 → 174,000 */
export function verifySeverance02_force8700(): VerificationResult {
  const r = calculateSeveranceFund({
    employmentId: 'E-1',
    yearMonth: '2026-05',
    severanceWorkDays: 20,
    site: { severanceFundMode: 'FORCE_8700', contractDate: '2026-05-01' },
  });
  return {
    case: '② FORCE_8700: 20일 → 174,000원',
    pass: r.amount === 174_000,
    expected: 174_000,
    actual: r.amount,
    note: `appliedDailyFund=${r.appliedDailyFund}`,
  };
}

/** ③ AUTO + bidDate 2026-03-31 → 6,500 */
export function verifySeverance03_autoBeforeCutoff(): VerificationResult {
  const d = resolveSeveranceFundDaily({
    site: { bidNoticeDate: '2026-03-31' },
    globalSetting: { mode: 'AUTO_BY_SITE_DATE', updatedAt: '' },
  });
  return {
    case: '③ AUTO + 입찰공고일 2026-03-31 → 6,500원',
    pass: d.fundDaily === 6_500,
    expected: 6_500,
    actual: d.fundDaily,
    note: `confidence=${d.confidence}`,
  };
}

/** ④ AUTO + bidDate 2026-04-01 → 8,700 */
export function verifySeverance04_autoOnCutoff(): VerificationResult {
  const d = resolveSeveranceFundDaily({
    site: { bidNoticeDate: '2026-04-01' },
    globalSetting: { mode: 'AUTO_BY_SITE_DATE', updatedAt: '' },
  });
  return {
    case: '④ AUTO + 입찰공고일 2026-04-01 → 8,700원',
    pass: d.fundDaily === 8_700,
    expected: 8_700,
    actual: d.fundDaily,
    note: `confidence=${d.confidence}`,
  };
}

/** ⑤ CUSTOM + customDailyAmount 7,000 → 7,000 */
export function verifySeverance05_custom(): VerificationResult {
  const d = resolveSeveranceFundDaily({
    site: { severanceFundMode: 'CUSTOM', severanceFundCustomAmount: 7_000 },
    globalSetting: { mode: 'AUTO_BY_SITE_DATE', updatedAt: '' },
  });
  return {
    case: '⑤ CUSTOM + customDailyAmount 7,000 → 7,000원',
    pass: d.fundDaily === 7_000,
    expected: 7_000,
    actual: d.fundDaily,
    note: `source=${d.source} mode=${d.mode}`,
  };
}

export function verifyAllSeveranceFund(): VerificationResult[] {
  const all = [
    verifySeverance01_force6500(),
    verifySeverance02_force8700(),
    verifySeverance03_autoBeforeCutoff(),
    verifySeverance04_autoOnCutoff(),
    verifySeverance05_custom(),
  ];
  const passed = all.filter((r) => r.pass).length;
  console.group(`[bodapass] domain/severanceFund — ${passed}/${all.length} passed`);
  for (const r of all) console.log(`${r.pass ? '✓' : '✗'} ${r.case}`);
  console.groupEnd();
  return all;
}
