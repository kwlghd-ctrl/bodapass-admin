/**
 * socialInsurancePolicy — 일자 기준 4대보험 정책 조회 (Phase Q 신규)
 *
 * src/mock/legalPolicies 의 lookupPolicy 를 호출하여 SocialInsurancePolicy 형태로 변환.
 * 정책의 confidence / requiresVerification 를 종합하여 verificationStatus 결정.
 */
import { lookupPolicy } from '../../mock/legalPolicies';
import type { SocialInsurancePolicy } from './socialInsurance.types';

export function getSocialInsurancePolicyByDate(asOfDate: string): SocialInsurancePolicy {
  const nps = lookupPolicy<{ employee: number }>('NATIONAL_PENSION_RATE', asOfDate);
  const hi = lookupPolicy<{ employee: number }>('HEALTH_INSURANCE_RATE', asOfDate);
  const ltc = lookupPolicy<number>('LONG_TERM_CARE_RATE', asOfDate);
  const ei = lookupPolicy<{ employee: number; employer: number }>(
    'EMPLOYMENT_INSURANCE_RATE',
    asOfDate,
  );
  const ia = lookupPolicy<number>('INDUSTRIAL_ACCIDENT_RATE', asOfDate);

  const year = Number(asOfDate.slice(0, 4));
  const allOfficial =
    nps?.policy.confidence === 'OFFICIAL' &&
    hi?.policy.confidence === 'OFFICIAL' &&
    ei?.policy.confidence === 'OFFICIAL';
  const allRequiresVerification =
    (nps?.policy.requiresVerification ?? true) ||
    (hi?.policy.requiresVerification ?? true) ||
    (ei?.policy.requiresVerification ?? true);

  let status: SocialInsurancePolicy['verificationStatus'] = 'NEEDS_VERIFICATION';
  if (ia?.policy.confidence === 'DEMO') status = 'DEMO';
  else if (allOfficial && !allRequiresVerification) status = 'VERIFIED';

  return {
    year,
    nationalPensionRate: nps?.value.employee ?? 0.045,
    healthInsuranceRate: hi?.value.employee ?? 0.03545,
    longTermCareRate: (ltc?.value as number | undefined) ?? 0.1295,
    employmentInsuranceWorkerRate: ei?.value.employee ?? 0.009,
    employmentInsuranceEmployerRate: ei?.value.employer ?? 0.009,
    industrialAccidentRate: (ia?.value as number | undefined) ?? 0.036,
    verificationStatus: status,
    sourceNote: 'src/mock/legalPolicies.ts',
  };
}
