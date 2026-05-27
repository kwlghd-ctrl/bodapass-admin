/**
 * socialInsuranceCalculator — 4대보험 계산기 (Phase Q 신규)
 *
 * 정책 verificationStatus !== VERIFIED 면 결과 verificationWarnings 에 경고 추가.
 */
import type {
  SocialInsuranceInput,
  SocialInsurancePolicy,
  SocialInsuranceResult,
} from './socialInsurance.types';

export function calculateSocialInsurance(
  input: SocialInsuranceInput,
  policy: SocialInsurancePolicy,
): SocialInsuranceResult {
  const verificationWarnings: string[] = [];
  if (policy.verificationStatus !== 'VERIFIED') {
    verificationWarnings.push(
      `정책 ${policy.year} verificationStatus=${policy.verificationStatus} — 검증 필요`,
    );
  }

  // 국민연금 - 사업주 동일 부담
  const npsBase = input.isEligibleForNationalPension ? input.taxableWage : 0;
  const nationalPensionEmployee = Math.floor(npsBase * policy.nationalPensionRate);
  const nationalPensionEmployer = nationalPensionEmployee;

  // 건강보험 - 사업주 동일 부담
  const hiBase = input.isEligibleForHealthInsurance ? input.taxableWage : 0;
  const healthInsuranceEmployee = Math.floor(hiBase * policy.healthInsuranceRate);
  const healthInsuranceEmployer = healthInsuranceEmployee;

  // 장기요양 - 건강보험료 × LTC rate
  const longTermCareEmployee = Math.floor(healthInsuranceEmployee * policy.longTermCareRate);
  const longTermCareEmployer = Math.floor(healthInsuranceEmployer * policy.longTermCareRate);

  // 고용보험 - 사업주 별도
  const eiBase = input.isEligibleForEmploymentInsurance ? input.taxableWage : 0;
  const employmentInsuranceEmployee = Math.floor(eiBase * policy.employmentInsuranceWorkerRate);
  const employmentInsuranceEmployer = Math.floor(
    eiBase * (policy.employmentInsuranceEmployerRate ?? policy.employmentInsuranceWorkerRate),
  );

  // 산재보험 - 사업주 100%
  const iaBase = input.isEligibleForIndustrialAccident ? input.taxableWage : 0;
  const industrialAccidentEmployer = Math.floor(iaBase * (policy.industrialAccidentRate ?? 0));

  const totalEmployeeDeduction =
    nationalPensionEmployee +
    healthInsuranceEmployee +
    longTermCareEmployee +
    employmentInsuranceEmployee;
  const totalEmployerCost =
    nationalPensionEmployer +
    healthInsuranceEmployer +
    longTermCareEmployer +
    employmentInsuranceEmployer +
    industrialAccidentEmployer;

  return {
    nationalPensionEmployee,
    nationalPensionEmployer,
    healthInsuranceEmployee,
    healthInsuranceEmployer,
    longTermCareEmployee,
    longTermCareEmployer,
    employmentInsuranceEmployee,
    employmentInsuranceEmployer,
    industrialAccidentEmployer,
    totalEmployeeDeduction,
    totalEmployerCost,
    verificationWarnings,
  };
}

export function validateSocialInsurancePolicy(p: SocialInsurancePolicy): string[] {
  const w: string[] = [];
  if (p.verificationStatus !== 'VERIFIED') w.push('정책 verificationStatus != VERIFIED');
  if (p.industrialAccidentRate == null) w.push('산재요율 미설정 — 업종별 다름');
  return w;
}

export { determineInsuranceEligibility } from '../../utils/insuranceEligibility';
