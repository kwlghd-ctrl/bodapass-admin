/**
 * workRule — 공수 계산 정책
 *
 * 사업장·현장 단위로 다른 「표준 근로시간 / 반공 / 만공 / 잔공 / 라운딩 단위」 등을
 * 별도 정책으로 분리. calcGongsu() 의 하드코드(8시간=1.0)를 대체.
 *
 * 실서비스 전환 시:
 *   `legal_policies` 와 별개로 `work_rules` 테이블.
 *   사업장이 자체 단체협약을 가진 경우 사이트별 row 추가.
 */

export interface WorkRule {
  id: string;
  /** 사이트별 override — 없으면 회사/전역 적용 */
  siteId?: string;
  /** 회사별 override */
  companyId?: string;
  name: string;

  /** 표준 1일 근로 분 — 보통 480 (8h × 60). 야간 사업장 등은 다를 수 있음. */
  standardWorkMinutes: number;
  /** 반공(0.5 공수) 최소 분 — 보통 240 (4h) */
  halfDayMinMinutes: number;
  /** 만공(1.0 공수) 최소 분 — 보통 480 (8h) */
  oneDayMinMinutes: number;
  /** 잔공/추가공수 인정 최소 분 — 보통 120 (2h) 이상 추가 */
  overtimeMinMinutes?: number;
  /** 1일 최대 인정 공수 — 보통 1.5 또는 2.0 */
  maxGongsuPerDay: number;
  /**
   * 공수 라운딩 단위
   *  · 0.5: 0.5 / 1.0 / 1.5 ...
   *  · 0.25: 0.25 / 0.5 / 0.75 ...
   *  · 1:    1.0 만 (반공 불인정)
   */
  roundingUnit: 0.5 | 0.25 | 1;
  /** 점심 휴게시간 (분) — workedMinutes 에서 자동 차감 */
  lunchBreakMinutes?: number;
  /** 야간 작업 인정 여부 */
  nightWorkEnabled?: boolean;

  /** 정책 시행 기간 */
  effectiveFrom: string;
  effectiveTo?: string;
}

/** 1일 공수 계산 결과 */
export interface DailyGongsuResult {
  workedMinutes: number;
  gongsu: number;
  /**
   * 근거
   *  · AUTO_TIME       : checkInAt/checkOutAt 기반 자동 계산
   *  · MANUAL_APPROVED : 수동 공수 (승인 완료)
   *  · IMPORTED        : 전자카드 등 외부 데이터 import
   *  · BLOCKED         : 계산 불가 (퇴근 누락 등) — gongsu=0
   */
  basis: 'AUTO_TIME' | 'MANUAL_APPROVED' | 'IMPORTED' | 'BLOCKED';
  warning?: string;
}
