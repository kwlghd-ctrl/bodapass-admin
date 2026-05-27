/**
 * 도메인 테스트 — 4대보험 (socialInsurance)
 *
 * Vitest 가 없으므로 자체 verifier 패턴 사용.
 * 브라우저 콘솔: import('@/domain/__tests__/socialInsurance.test').then(m => m.verifyAllSocialInsurance())
 */
import type { VerificationResult } from '../../utils/__verify__/calculationVerifier';
import { calculateSocialInsurance } from '../socialInsurance/socialInsuranceCalculator';
import type {
  SocialInsuranceInput,
  SocialInsurancePolicy,
} from '../socialInsurance/socialInsurance.types';

const POLICY_VERIFIED: SocialInsurancePolicy = {
  year: 2026,
  nationalPensionRate: 0.045,
  healthInsuranceRate: 0.03545,
  longTermCareRate: 0.1295,
  employmentInsuranceWorkerRate: 0.009,
  employmentInsuranceEmployerRate: 0.009,
  industrialAccidentRate: 0.036,
  verificationStatus: 'VERIFIED',
};

const POLICY_NEEDS_VERIFICATION: SocialInsurancePolicy = {
  ...POLICY_VERIFIED,
  verificationStatus: 'NEEDS_VERIFICATION',
};

function input(overrides: Partial<SocialInsuranceInput> = {}): SocialInsuranceInput {
  return {
    workerId: 'W-1',
    siteId: 'S-1',
    yearMonth: '2026-05',
    grossWage: 4_000_000,
    taxableWage: 4_000_000,
    insuredWorkDays: 22,
    employmentType: 'REGULAR',
    isEligibleForNationalPension: true,
    isEligibleForHealthInsurance: true,
    isEligibleForEmploymentInsurance: true,
    isEligibleForIndustrialAccident: true,
    ...overrides,
  };
}

/** ① 모든 자격 충족 시 4대보험 모두 산출 */
export function verifyInsurance01_allEligible(): VerificationResult {
  const r = calculateSocialInsurance(input(), POLICY_VERIFIED);
  const pass =
    r.nationalPensionEmployee > 0 &&
    r.healthInsuranceEmployee > 0 &&
    r.longTermCareEmployee > 0 &&
    r.employmentInsuranceEmployee > 0 &&
    r.industrialAccidentEmployer > 0;
  return {
    case: '① 모든 자격 충족 시 4대보험 모두 산출 (NPS/HI/LTC/EI/IA > 0)',
    pass,
    expected: 'all > 0',
    actual: {
      nps: r.nationalPensionEmployee,
      hi: r.healthInsuranceEmployee,
      ltc: r.longTermCareEmployee,
      ei: r.employmentInsuranceEmployee,
      ia: r.industrialAccidentEmployer,
    },
  };
}

/** ② isEligibleForNationalPension=false → NPS=0 */
export function verifyInsurance02_npsIneligible(): VerificationResult {
  const r = calculateSocialInsurance(
    input({ isEligibleForNationalPension: false }),
    POLICY_VERIFIED,
  );
  return {
    case: '② isEligibleForNationalPension=false → NPS 근로자/사업주 = 0',
    pass: r.nationalPensionEmployee === 0 && r.nationalPensionEmployer === 0,
    expected: 0,
    actual: { employee: r.nationalPensionEmployee, employer: r.nationalPensionEmployer },
  };
}

/** ③ VERIFIED 정책 → no warning */
export function verifyInsurance03_verifiedNoWarning(): VerificationResult {
  const r = calculateSocialInsurance(input(), POLICY_VERIFIED);
  return {
    case: '③ VERIFIED 정책 → verificationWarnings 비어 있음',
    pass: r.verificationWarnings.length === 0,
    expected: [],
    actual: r.verificationWarnings,
  };
}

/** ④ NEEDS_VERIFICATION 정책 → warning 포함 */
export function verifyInsurance04_needsVerificationWarning(): VerificationResult {
  const r = calculateSocialInsurance(input(), POLICY_NEEDS_VERIFICATION);
  return {
    case: '④ NEEDS_VERIFICATION 정책 → verificationWarnings 에 경고 포함',
    pass: r.verificationWarnings.length > 0,
    expected: 'length > 0',
    actual: r.verificationWarnings,
  };
}

export function verifyAllSocialInsurance(): VerificationResult[] {
  const all = [
    verifyInsurance01_allEligible(),
    verifyInsurance02_npsIneligible(),
    verifyInsurance03_verifiedNoWarning(),
    verifyInsurance04_needsVerificationWarning(),
  ];
  const passed = all.filter((r) => r.pass).length;
  console.group(`[bodapass] domain/socialInsurance — ${passed}/${all.length} passed`);
  for (const r of all) console.log(`${r.pass ? '✓' : '✗'} ${r.case}`);
  console.groupEnd();
  return all;
}
