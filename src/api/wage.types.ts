/**
 * 노임비 / 퇴직금 도메인 타입 — 와이어프레임 030, 033, 034.png
 */

import type { WorkerRole } from './team.types';

/** 월간 노임 시트의 한 행 (한 명의 그달 정산 결과) */
export interface WageRow {
  memberId: string;
  memberName: string;
  /** 마스킹된 주민번호 (감사용) */
  idNumberMasked: string;
  role: WorkerRole;
  /** 근로일수 */
  workDays: number;
  /** 일당 (원) */
  dailyWage: number;
  /** 기본급 = workDays × dailyWage */
  baseAmount: number;
  /** 공제 — 4대보험 + 소득세 + 40H공단 등 */
  deductionPension: number; // 국민연금
  deductionHealth: number; // 건강보험
  deductionEmployment: number; // 고용보험
  deductionAccident: number; // 산재보험
  deductionIncomeTax: number; // 소득세
  deductionLocalTax: number; // 지방소득세
  deductionTotal: number;
  /** 실지급액 */
  netAmount: number;
  /** 퇴직금 적립 (이번 달 분) */
  severanceAccrued: number;

  /* ── Phase U1: WageLedger 메타데이터 보존 (모두 선택, 레거시 호환 유지) ── */
  /** 계산 상태 — READY/ESTIMATED/BLOCKED */
  calculationStatus?: 'READY' | 'ESTIMATED' | 'BLOCKED';
  /** 경고 메시지 목록 */
  warnings?: string[];
  /** 과세 보수 */
  taxableWage?: number;
  /** 비과세 합계 */
  nonTaxableAmount?: number;
  /** 사용된 정책 버전 */
  policyVersion?: string;
  /** 일자별 소득세 명세 (16-field full row) */
  dailyTaxRows?: import('../utils/incomeTaxDaily').DailyTaxRow[];
  /**
   * 일자별 출역·공수 명세 (Phase Z1 신규).
   * 노임대장 1~31일 칸의 finalGongsu 출력에 사용.
   * dailyTaxRows 가 「지급 기준」인 반면, 이건 「출역 기준」이라 별도 보존.
   */
  dailyAttendanceRows?: Array<{
    workDate: string;
    workerId?: string;
    employmentId?: string;
    finalGongsu: number;
    workedMinutes: number;
    payAmount?: number;
  }>;
  /** 퇴직공제부금 일액 */
  severanceFundDaily?: number;
  /** 퇴직공제부금 금액 (= severanceFundDaily × severanceWorkDays) */
  severanceFundAmount?: number;
  /** 산재보험 (사업주 100% 부담분, 표시용) */
  industrialAccidentInsurance?: number;
}

export interface WageMonthSummary {
  year: number;
  month: number;
  totalDays: number;
  totalBase: number;
  totalDeduction: number;
  totalNet: number;
  totalSeverance: number;
  /** 직종별 합계 */
  byRole: Array<{
    role: WorkerRole;
    count: number;
    days: number;
    net: number;
  }>;
  /** 행 데이터 */
  rows: WageRow[];
}

export interface WageQuery {
  siteId: string;
  yearMonth: string; // 'YYYY-MM'
}

// ───────── 퇴직금 ─────────

export interface SeveranceRow {
  memberId: string;
  memberName: string;
  idNumberMasked: string;
  role: WorkerRole;
  /** 입사일 */
  joinedAt: string;
  /** 일당 (원) — 평균임금 추정의 베이스 */
  dailyWage: number;
  /** 누적 근무일 */
  totalWorkDays: number;
  /** 총 누적 적립 */
  accruedTotal: number;
  /** 이미 지급된 퇴직금 */
  paidTotal: number;
  /** 잔액 */
  balance: number;
  /** 마지막 지급일 */
  lastPaidAt?: string;
}

export interface SeveranceMonthSummary {
  year: number;
  month: number;
  /** 당일 출력된 인원 — 와이어프레임 034 */
  attendedToday: number;
  totalAccrued: number;
  totalPaid: number;
  totalBalance: number;
  rows: SeveranceRow[];
}

export interface SeveranceQuery {
  siteId: string;
  yearMonth: string;
}

/** 출력 / 발송 응답 */
export interface PayoutDispatchResponse {
  count: number; // 처리된 인원
  channel: 'EXCEL' | 'KAKAO' | 'SMS' | 'PRINT';
  exportedAt: string;
}
