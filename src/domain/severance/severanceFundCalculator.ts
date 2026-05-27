/**
 * severanceFundCalculator — 퇴직공제부금 계산 도메인 래퍼 (Phase Q)
 *
 * SeveranceFundInput 을 받아 site/global 정책을 해석 후 totalAmount 까지 계산.
 */
import { resolveSeveranceFundDaily, type SeveranceFundApplyMode } from '../../utils/severance';
import type { SeveranceFundInput, SeveranceFundResult } from './severanceFund.types';

export { calculateSeveranceFund } from '../../utils/severanceCalculation';
export { resolveSeveranceFundDaily };

/** Phase Q 사용자 spec — 일액·일수·합계를 한번에 결정 */
export function resolveSeveranceDailyAmount(input: SeveranceFundInput): SeveranceFundResult {
  const mode = input.policy.mode as SeveranceFundApplyMode;
  const d = resolveSeveranceFundDaily({
    site: {
      bidNoticeDate: input.siteBidDate,
      contractDate: input.siteContractDate,
      severanceFundMode: mode,
      severanceFundCustomAmount: input.policy.customDailyAmount,
    },
    globalSetting: {
      mode,
      customAmount: input.policy.customDailyAmount,
      updatedAt: '',
    },
  });
  return {
    dailyAmount: d.fundDaily,
    workDays: input.severanceWorkDays,
    totalAmount: Math.round(input.severanceWorkDays * d.fundDaily),
    appliedMode: input.policy.mode,
    reason: d.warning ?? `${d.source}/${d.policy}/${d.confidence}`,
  };
}

import type { AttendanceRecord } from '../../api/attendanceV2.types';
import { countSeveranceWorkDays } from '../attendance/attendanceDayCounter';

/** 퇴직공제 산정 대상 일수 — attendance 도메인 위임 */
export function getSeveranceEligibleDays(records: AttendanceRecord[]): number {
  return countSeveranceWorkDays(records);
}
