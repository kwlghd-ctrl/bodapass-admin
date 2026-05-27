/**
 * dailyWorkerTaxPolicy — 일용근로 소득세 정책 조회 (Phase Q)
 *
 * src/mock/legalPolicies 에서 일자 기준 정책 lookup → DailyIncomeTaxPolicy 형태로 반환.
 */
import { lookupPolicy } from '../../mock/legalPolicies';
import type { DailyIncomeTaxPolicy } from '../../utils/incomeTaxDaily';

/** 정책 테이블에서 일자 기준 일용근로세 정책 조회. 한국 기본값과 정합. */
export function getDailyWorkerTaxPolicy(asOfDate: string): DailyIncomeTaxPolicy {
  const incomeTaxPolicy = lookupPolicy<{ rate: number; dailyDeduction: number }>(
    'INCOME_TAX_RATE_DAILY',
    asOfDate,
  );
  const localTaxPolicy = lookupPolicy<number>('LOCAL_TAX_RATE', asOfDate);

  return {
    rate: incomeTaxPolicy?.value.rate ?? 0.06,
    dailyDeduction: incomeTaxPolicy?.value.dailyDeduction ?? 150_000,
    localRate: (localTaxPolicy?.value as number | undefined) ?? 0.1,
    earnedIncomeTaxCreditRate: 0.55,
    smallAmountThreshold: 1000,
  };
}
