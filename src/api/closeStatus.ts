/**
 * closeStatus — 월 마감 상태 머신
 *
 * 마감은 「UI 잠금」 이 아니라 서버 상태값으로 결정.
 * 모든 전이는 auditLog 에 기록되며, 역방향 전이(REOPEN) 은 사유 필수.
 */

export type CloseStage =
  | 'OPEN'                // 작업 진행 중
  | 'FOREMAN_CONFIRMED'   // 반장 일일확정 완료
  | 'SITE_CONFIRMED'      // 현장담당자 확인 완료
  | 'HQ_REVIEWED'         // 본사 검토 완료
  | 'WAGE_CONFIRMED'      // 노무비 마감 (지급 직전)
  | 'PAID'                // 지급 완료
  | 'INSURANCE_REPORTED'  // 4대보험 신고 완료
  | 'CLOSED';             // 월말 정산 종결

export const CLOSE_STAGE_ORDER: CloseStage[] = [
  'OPEN',
  'FOREMAN_CONFIRMED',
  'SITE_CONFIRMED',
  'HQ_REVIEWED',
  'WAGE_CONFIRMED',
  'PAID',
  'INSURANCE_REPORTED',
  'CLOSED',
];

/**
 * 정방향(전진) 전이 — 각 stage 에서 다음 단계로 갈 수 있는 단계 목록
 * 단순히 다음 stage 1개만 허용 — 단계 건너뛰기 금지.
 */
export const FORWARD_TRANSITIONS: Record<CloseStage, CloseStage[]> = {
  OPEN:                ['FOREMAN_CONFIRMED'],
  FOREMAN_CONFIRMED:   ['SITE_CONFIRMED'],
  SITE_CONFIRMED:      ['HQ_REVIEWED'],
  HQ_REVIEWED:         ['WAGE_CONFIRMED'],
  WAGE_CONFIRMED:      ['PAID'],
  PAID:                ['INSURANCE_REPORTED'],
  INSURANCE_REPORTED:  ['CLOSED'],
  CLOSED:              [],
};

/**
 * 역방향(REOPEN) 전이 — 각 stage 에서 한 단계 되돌릴 수 있다.
 * 단, CLOSED 는 본사 권한자만 + 추가 사유 필요 (UI/서버 양쪽에서 제한).
 */
export const REVERSE_TRANSITIONS: Record<CloseStage, CloseStage[]> = {
  OPEN:                [],
  FOREMAN_CONFIRMED:   ['OPEN'],
  SITE_CONFIRMED:      ['FOREMAN_CONFIRMED'],
  HQ_REVIEWED:         ['SITE_CONFIRMED'],
  WAGE_CONFIRMED:      ['HQ_REVIEWED'],
  PAID:                ['WAGE_CONFIRMED'],
  INSURANCE_REPORTED:  ['PAID'],
  CLOSED:              ['INSURANCE_REPORTED'],
};

/** 전이 가능 여부 검증 */
export function canTransition(from: CloseStage, to: CloseStage): boolean {
  return (
    FORWARD_TRANSITIONS[from].includes(to) ||
    REVERSE_TRANSITIONS[from].includes(to)
  );
}

/** 역방향 전이인지 */
export function isReverseTransition(from: CloseStage, to: CloseStage): boolean {
  return REVERSE_TRANSITIONS[from].includes(to);
}

/** UI 표시용 라벨 */
export const CLOSE_STAGE_LABELS: Record<CloseStage, string> = {
  OPEN:                '진행 중',
  FOREMAN_CONFIRMED:   '반장 확정',
  SITE_CONFIRMED:      '현장 확정',
  HQ_REVIEWED:         '본사 검토',
  WAGE_CONFIRMED:      '노무비 마감',
  PAID:                '지급 완료',
  INSURANCE_REPORTED:  '4대보험 신고',
  CLOSED:              '월 마감',
};

/** 「잠금 시작」 단계 — 이 단계 이후엔 수정 시 reopen 필요 */
export const LOCKED_FROM: CloseStage = 'SITE_CONFIRMED';

export function isLocked(stage: CloseStage): boolean {
  return CLOSE_STAGE_ORDER.indexOf(stage) >= CLOSE_STAGE_ORDER.indexOf(LOCKED_FROM);
}

/** ───────── 전이 요청 ───────── */

export interface CloseStageTransitionRequest {
  /** 어느 단위에서 전이? Day-level 도 가능 (일일 출역확정) */
  scope: 'DAY' | 'MONTH';
  siteId: string;
  /** scope=DAY 면 date, scope=MONTH 면 yearMonth */
  date?: string;
  yearMonth?: string;
  /** 다음 단계 (정방향이면 next, 역방향이면 previous) */
  toStage: CloseStage;
  /** 역방향(REOPEN) 시 필수 */
  reason?: string;
}

export interface CloseStageTransitionResponse {
  scope: 'DAY' | 'MONTH';
  siteId: string;
  date?: string;
  yearMonth?: string;
  fromStage: CloseStage;
  toStage: CloseStage;
  transitionedAt: string;
  transitionedBy: string;
  auditLogId: string;
}

/** ───────── 상태 조회 ───────── */

export interface CloseStatusEntry {
  scope: 'DAY' | 'MONTH';
  siteId: string;
  /** companyId — 사업장 단위가 아니라 (현장 × 회사) 단위 마감 시 */
  companyId?: string;
  date?: string;
  yearMonth?: string;
  stage: CloseStage;
  /** 각 stage 진입 시각·담당자 — 히스토리 */
  history: Array<{
    stage: CloseStage;
    enteredAt: string;
    enteredBy: string;
    enteredByName: string;
    reason?: string;
  }>;

  /**
   * ─── 법정 계산 추가 필드 — 각 stage 별 「최초 진입 시각」 캐시 ──
   * (history 에서 추출 가능하지만 자주 쓰는 값을 별도 필드로 보관)
   */
  foremanConfirmedAt?: string;
  siteConfirmedAt?: string;
  hqReviewedAt?: string;
  wageConfirmedAt?: string;
  paidAt?: string;
  insuranceReportedAt?: string;
  closedAt?: string;

  /** 마지막 REOPEN 사유 — 감사용 즉시 표시 */
  reopenedReason?: string;
}
