/**
 * severanceFund.types — 퇴직공제부금 도메인 타입 (Phase Q)
 */
export type SeveranceFundMode =
  | 'FORCE_6500'
  | 'FORCE_8700'
  | 'AUTO_BY_SITE_DATE'
  | 'CUSTOM';

export interface SeveranceFundPolicy {
  mode: SeveranceFundMode;
  defaultDailyAmount: 6500 | 8700;
  customDailyAmount?: number;
  effectiveDate?: string;
}

export interface SeveranceFundInput {
  workerId: string;
  siteId: string;
  yearMonth: string;
  severanceWorkDays: number;
  siteBidDate?: string;
  siteContractDate?: string;
  policy: SeveranceFundPolicy;
}

export interface SeveranceFundResult {
  dailyAmount: number;
  workDays: number;
  totalAmount: number;
  appliedMode: SeveranceFundMode;
  reason: string;
}

// Re-export internal types
export type {
  SeveranceFundApplyMode,
  SeveranceFundSetting,
  SeveranceFundDecision,
  SeveranceFundConfidence,
  SeveranceFundSource,
} from '../../utils/severance';

export type { SeveranceCalculationResult } from '../../api/legal.types';
