/**
 * socialInsurance.types — 4대보험 도메인 타입 (Phase Q 신규)
 */
export interface SocialInsurancePolicy {
  year: number;
  nationalPensionRate: number;
  healthInsuranceRate: number;
  longTermCareRate: number;
  employmentInsuranceWorkerRate: number;
  employmentInsuranceEmployerRate?: number;
  industrialAccidentRate?: number;
  verificationStatus: 'VERIFIED' | 'NEEDS_VERIFICATION' | 'DEMO';
  sourceNote?: string;
}

export interface SocialInsuranceInput {
  workerId: string;
  siteId: string;
  yearMonth: string;
  grossWage: number;
  taxableWage: number;
  insuredWorkDays: number;
  employmentType: string;
  isEligibleForNationalPension: boolean;
  isEligibleForHealthInsurance: boolean;
  isEligibleForEmploymentInsurance: boolean;
  isEligibleForIndustrialAccident: boolean;
}

export interface SocialInsuranceResult {
  nationalPensionEmployee: number;
  nationalPensionEmployer: number;
  healthInsuranceEmployee: number;
  healthInsuranceEmployer: number;
  longTermCareEmployee: number;
  longTermCareEmployer: number;
  employmentInsuranceEmployee: number;
  employmentInsuranceEmployer: number;
  industrialAccidentEmployer: number;
  totalEmployeeDeduction: number;
  totalEmployerCost: number;
  verificationWarnings: string[];
}

// Re-export existing eligibility module
export type {
  InsuranceEligibilityInput,
  InsuranceEligibilityResult,
} from '../../utils/insuranceEligibility';
