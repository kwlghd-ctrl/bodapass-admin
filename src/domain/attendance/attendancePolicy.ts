/**
 * attendancePolicy — 공수 정책 (WorkRule 기반) 도메인 래퍼 (Phase Q)
 *
 * WorkRule 의 단순화 view 인 GongsuPolicy 를 함께 제공.
 */
import type { WorkRule } from '../../api/workRule.types';
export type { WorkRule, DailyGongsuResult } from '../../api/workRule.types';
export { lookupWorkRule, WORK_RULES } from '../../mock/workRules';

/** GongsuPolicy — 사용자 spec 형식 (WorkRule 의 단순화 view) */
export interface GongsuPolicy {
  minimumHoursForHalfDay: number;
  standardDayHours: number;
  overtimeThresholdHours: number;
  maxGongsuPerDay: number;
  roundingUnit: 0.5 | 0.25 | 0.1;
  breakTimeDeductionMinutes?: number;
}

/** WorkRule → GongsuPolicy 변환 (Phase Q 인터페이스 통일용) */
export function toGongsuPolicy(rule: WorkRule): GongsuPolicy {
  const r: 0.5 | 0.25 | 0.1 = rule.roundingUnit === 1 ? 0.5 : (rule.roundingUnit as 0.5 | 0.25);
  return {
    minimumHoursForHalfDay: rule.halfDayMinMinutes / 60,
    standardDayHours: rule.oneDayMinMinutes / 60,
    overtimeThresholdHours: (rule.overtimeMinMinutes ?? 120) / 60,
    maxGongsuPerDay: rule.maxGongsuPerDay,
    roundingUnit: r,
    breakTimeDeductionMinutes: rule.lunchBreakMinutes,
  };
}
