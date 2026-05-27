/**
 * severance — 일용근로자 퇴직금/퇴직공제 헬퍼
 *
 * 실무 정리 (사용자 정정)
 *  · 일용근로자는 매월 별도 적립 개념이 없음. 매월 노임명세에 「퇴직적립」을
 *    찍어두는 건 의미가 없다.
 *  · 계속근로 < 1년 → 사업주가 건설근로자공제회에 「퇴직공제부금」을
 *    출역일 × 부금 일액 만큼 납부 (월 단위 신고).
 *  · 계속근로 ≥ 1년 → 그 시점부터 「퇴직공제 신고 중단」 + 법정퇴직금 지급
 *    (1일 평균임금 × 30일 × 총계속근로일수 ÷ 365).
 *
 * 이 파일은 두 가지 산식과 「1년 임박 / 1년 도래 / 1년 초과」 판정을
 * 한 곳에 모아둔다. 페이지마다 따로 계산하지 않도록.
 */

const FUND_DAILY_KEY = 'bodapass_admin:severance_fund_daily';

/**
 * 건설근로자공제회 퇴직공제부금 일액 (원)
 *
 *  · 2026-04-01 이후 최초 입찰공고 / 도급계약 공사 → 8,700원
 *  · 그 전 (2024~2026-03) 공사                      → 6,500원
 *
 * Site 의 bidNoticeDate / contractDate 를 기준으로 결정 (getSeveranceFundDaily 참조).
 */
export const FUND_DAILY_NEW = 8_700;   // 2026-04-01 이후
export const FUND_DAILY_OLD = 6_500;   // 그 전
/** 설정 화면이 「기본값으로」 누를 때 적용되는 값 — 신 정책 (8,700원) */
export const DEFAULT_FUND_DAILY = FUND_DAILY_NEW;

const CUTOFF_DATE = '2026-04-01';

/* ─────────── 일액 적용 방식 (사용자 선택) ─────────── */

/**
 * 퇴직공제부금 일액을 어떻게 결정할지.
 *  · AUTO_BY_SITE_DATE : 현장의 입찰공고일/도급계약일 기준 자동 (2026-04-01 분기)
 *  · FORCE_6500        : 기존 공사 — 6,500원 강제
 *  · FORCE_8700        : 신 정책 공사 — 8,700원 강제
 *  · CUSTOM            : 사용자 직접 입력 (시연·예외 현장)
 */
export type SeveranceFundApplyMode =
  | 'AUTO_BY_SITE_DATE'
  | 'FORCE_6500'
  | 'FORCE_8700'
  | 'CUSTOM';

/** 전역 또는 현장별 일액 설정 */
export interface SeveranceFundSetting {
  mode: SeveranceFundApplyMode;
  customAmount?: number;
  updatedAt: string;
}

/* ─────────── 영속화 — 신규 setting 키 + 기존 일액 키 (backward compat) ─────────── */

const FUND_SETTING_KEY = 'bodapass_admin:severance_fund_setting';

export function loadFundSetting(): SeveranceFundSetting | null {
  try {
    const raw = localStorage.getItem(FUND_SETTING_KEY);
    if (raw) return JSON.parse(raw) as SeveranceFundSetting;
  } catch { /* ignore */ }
  return null;
}

export function saveFundSetting(s: SeveranceFundSetting): void {
  try {
    localStorage.setItem(FUND_SETTING_KEY, JSON.stringify({
      ...s,
      updatedAt: new Date().toISOString(),
    }));
  } catch { /* ignore */ }
}



/**
 * 현장별 부금 일액 결정 — Site 의 bidNoticeDate 또는 contractDate 가
 * 2026-04-01 이후면 8,700원, 그 전이면 6,500원.
 *
 * site 가 없거나 두 날짜 모두 없으면 신 정책 (8,700) 으로 보수적 처리.
 */
export function getSeveranceFundDaily(site: { bidNoticeDate?: string; contractDate?: string; severanceFundMode?: SeveranceFundApplyMode; severanceFundCustomAmount?: number } | null | undefined): number {
  return resolveSeveranceFundDaily({ site: site ?? null, globalSetting: loadFundSetting() }).fundDaily;
}

/**
 * 부금 일액 결정 + 근거·경고 정보 (확장된 V2 구조)
 *
 *  · fundDaily: 결정된 일액 (원)
 *  · basisDate: AUTO 모드에서 결정 근거가 된 날짜
 *  · mode:      어떤 ApplyMode 로 결정됐는지
 *  · policy:    OLD_6500 / NEW_8700 / CUSTOM / AUTO_ASSUMED
 *  · confidence:'high'  → 입찰공고일 또는 명시 선택
 *               'medium'→ 도급계약일만 있음 또는 setting CUSTOM
 *               'low'   → 모두 없음 — 8,700원 가정
 *  · source:    SITE_OVERRIDE / GLOBAL_SETTING / AUTO_POLICY
 *  · warning:   confidence 가 low/medium 일 때 화면에 보여줄 경고 메시지
 */
export type SeveranceFundPolicy =
  | 'OLD_6500'
  | 'NEW_8700'
  | 'CUSTOM'
  | 'AUTO_ASSUMED'
  /** @deprecated 구버전 호환 */
  | 'NEW'
  /** @deprecated 구버전 호환 */
  | 'OLD'
  /** @deprecated 구버전 호환 */
  | 'ASSUMED_NEW';
export type SeveranceFundConfidence = 'high' | 'medium' | 'low';
export type SeveranceFundSource = 'SITE_OVERRIDE' | 'GLOBAL_SETTING' | 'AUTO_POLICY';

export interface SeveranceFundDecision {
  fundDaily: number;
  basisDate: string | null;
  mode: SeveranceFundApplyMode;
  policy: SeveranceFundPolicy;
  confidence: SeveranceFundConfidence;
  source: SeveranceFundSource;
  warning: string | null;
}

/**
 * V2 통합 결정 함수 — Site override > Global setting > Auto policy 우선순위.
 *
 * 판단 우선순위:
 *   1. site.severanceFundMode === FORCE_6500 → 6,500
 *   2. site.severanceFundMode === FORCE_8700 → 8,700
 *   3. site.severanceFundMode === CUSTOM    → site.severanceFundCustomAmount
 *   4. globalSetting.mode === FORCE_6500    → 6,500
 *   5. globalSetting.mode === FORCE_8700    → 8,700
 *   6. globalSetting.mode === CUSTOM        → globalSetting.customAmount
 *   7. AUTO — bidNoticeDate 우선 → contractDate
 *   8. 둘 다 없음 → 8,700 가정 + warning
 */
export function resolveSeveranceFundDaily(input: {
  site?: {
    bidNoticeDate?: string;
    contractDate?: string;
    severanceFundMode?: SeveranceFundApplyMode;
    severanceFundCustomAmount?: number;
  } | null;
  globalSetting?: SeveranceFundSetting | null;
}): SeveranceFundDecision {
  const site = input.site;
  const global = input.globalSetting;

  // 1~3. site override
  if (site?.severanceFundMode === 'FORCE_6500') {
    return {
      fundDaily: FUND_DAILY_OLD,
      basisDate: null,
      mode: 'FORCE_6500',
      policy: 'OLD_6500',
      confidence: 'high',
      source: 'SITE_OVERRIDE',
      warning: '사용자가 현장별로 기존 공사(6,500원) 기준 적용을 선택했습니다.',
    };
  }
  if (site?.severanceFundMode === 'FORCE_8700') {
    return {
      fundDaily: FUND_DAILY_NEW,
      basisDate: null,
      mode: 'FORCE_8700',
      policy: 'NEW_8700',
      confidence: 'high',
      source: 'SITE_OVERRIDE',
      warning: '사용자가 현장별로 신 정책(8,700원) 기준 적용을 선택했습니다.',
    };
  }
  if (site?.severanceFundMode === 'CUSTOM') {
    const amt = site.severanceFundCustomAmount ?? FUND_DAILY_NEW;
    return {
      fundDaily: amt,
      basisDate: null,
      mode: 'CUSTOM',
      policy: 'CUSTOM',
      confidence: 'medium',
      source: 'SITE_OVERRIDE',
      warning: `사용자가 현장별로 ${amt.toLocaleString()}원을 직접 입력했습니다.`,
    };
  }

  // 4~6. global setting
  if (global?.mode === 'FORCE_6500') {
    return {
      fundDaily: FUND_DAILY_OLD,
      basisDate: null,
      mode: 'FORCE_6500',
      policy: 'OLD_6500',
      confidence: 'high',
      source: 'GLOBAL_SETTING',
      warning: '전역 설정으로 6,500원이 적용됐습니다.',
    };
  }
  if (global?.mode === 'FORCE_8700') {
    return {
      fundDaily: FUND_DAILY_NEW,
      basisDate: null,
      mode: 'FORCE_8700',
      policy: 'NEW_8700',
      confidence: 'high',
      source: 'GLOBAL_SETTING',
      warning: '전역 설정으로 8,700원이 적용됐습니다.',
    };
  }
  if (global?.mode === 'CUSTOM') {
    const amt = global.customAmount ?? FUND_DAILY_NEW;
    return {
      fundDaily: amt,
      basisDate: null,
      mode: 'CUSTOM',
      policy: 'CUSTOM',
      confidence: 'medium',
      source: 'GLOBAL_SETTING',
      warning: `전역 설정으로 ${amt.toLocaleString()}원이 직접 입력됐습니다.`,
    };
  }

  // 7. AUTO_BY_SITE_DATE
  const bidDate = site?.bidNoticeDate;
  const contractDate = site?.contractDate;
  if (bidDate) {
    const isNew = bidDate >= CUTOFF_DATE;
    return {
      fundDaily: isNew ? FUND_DAILY_NEW : FUND_DAILY_OLD,
      basisDate: bidDate,
      mode: 'AUTO_BY_SITE_DATE',
      policy: isNew ? 'NEW_8700' : 'OLD_6500',
      confidence: 'high',
      source: 'AUTO_POLICY',
      warning: null,
    };
  }
  if (contractDate) {
    const isNew = contractDate >= CUTOFF_DATE;
    return {
      fundDaily: isNew ? FUND_DAILY_NEW : FUND_DAILY_OLD,
      basisDate: contractDate,
      mode: 'AUTO_BY_SITE_DATE',
      policy: isNew ? 'NEW_8700' : 'OLD_6500',
      confidence: 'medium',
      source: 'AUTO_POLICY',
      warning: '입찰공고일이 입력되지 않아 도급계약일을 기준으로 판단했습니다. 정확한 판정을 위해 입찰공고일을 입력하세요.',
    };
  }

  // 8. 모두 없음 — 8,700 가정 + warning
  return {
    fundDaily: FUND_DAILY_NEW,
    basisDate: null,
    mode: 'AUTO_BY_SITE_DATE',
    policy: 'AUTO_ASSUMED',
    confidence: 'low',
    source: 'AUTO_POLICY',
    warning: '입찰공고일·도급계약일·일액 설정이 모두 없습니다. 기본 8,700원(2026-04-01 이후 신 정책)을 가정합니다.',
  };
}

/**
 * @deprecated `resolveSeveranceFundDaily()` 를 사용하세요.
 *  · 본 함수는 backward compat — 내부적으로 resolve 호출.
 */
export function getSeveranceFundDailyDecision(
  site: { bidNoticeDate?: string; contractDate?: string; severanceFundMode?: SeveranceFundApplyMode; severanceFundCustomAmount?: number } | null | undefined,
): SeveranceFundDecision {
  return resolveSeveranceFundDaily({ site: site ?? null, globalSetting: loadFundSetting() });
}

/** 1년 임박으로 분류할 일수 (D-30 부터 알림) */
export const ONE_YEAR_SOON_DAYS = 30;

/* ─────────── 부금 일액 영속화 ─────────── */

export function loadFundDaily(): number {
  // 1) 새 setting 키 우선
  const setting = loadFundSetting();
  if (setting) {
    if (setting.mode === 'FORCE_6500') return FUND_DAILY_OLD;
    if (setting.mode === 'FORCE_8700') return FUND_DAILY_NEW;
    if (setting.mode === 'CUSTOM' && setting.customAmount && setting.customAmount > 0) {
      return setting.customAmount;
    }
    // AUTO 면 site 가 필요하므로 default 폴백
    return DEFAULT_FUND_DAILY;
  }
  // 2) backward compat — 기존 단일 숫자 키
  try {
    const raw = localStorage.getItem(FUND_DAILY_KEY);
    if (!raw) return DEFAULT_FUND_DAILY;
    const n = Number(raw);
    return isFinite(n) && n > 0 ? n : DEFAULT_FUND_DAILY;
  } catch {
    return DEFAULT_FUND_DAILY;
  }
}

export function saveFundDaily(n: number): void {
  try {
    if (isFinite(n) && n > 0) {
      localStorage.setItem(FUND_DAILY_KEY, String(Math.round(n)));
    }
  } catch {
    /* ignore */
  }
}

/* ─────────── 계속근로기간 ─────────── */

export interface ServiceTenure {
  /** 입사일부터 기준일까지의 일수 (음수 가능: 미래 입사) */
  totalDays: number;
  /** 1년 도래 여부 (totalDays >= 365) */
  hasReachedOneYear: boolean;
  /** 1년까지 남은 일수 (양수면 아직 미도달, 0 이하면 이미 도달) */
  daysUntilOneYear: number;
  /** 1년 임박 (daysUntilOneYear <= ONE_YEAR_SOON_DAYS && > 0) */
  isApproachingOneYear: boolean;
}

function diffDays(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
  return Math.round((b - a) / 86_400_000);
}

/**
 * 입사일(joinedAt) 과 기준일(refDate, 기본값 = 오늘)을 받아
 * 계속근로기간 정보를 반환.
 */
export function computeServiceTenure(joinedAt: string, refDate?: Date | string): ServiceTenure {
  const ref = refDate ? new Date(refDate) : new Date();
  const joined = new Date(joinedAt);
  if (isNaN(joined.getTime())) {
    return {
      totalDays: 0,
      hasReachedOneYear: false,
      daysUntilOneYear: 365,
      isApproachingOneYear: false,
    };
  }
  const totalDays = diffDays(joined, ref);
  const daysUntilOneYear = 365 - totalDays;
  return {
    totalDays,
    hasReachedOneYear: totalDays >= 365,
    daysUntilOneYear,
    isApproachingOneYear: daysUntilOneYear > 0 && daysUntilOneYear <= ONE_YEAR_SOON_DAYS,
  };
}

/* ─────────── 1) 1년 미만 — 퇴직공제부금 ─────────── */

/**
 * 출역일수 × 부금 일액 = 누적 부금 적립금 (사업주가 공제회에 납부).
 * 만 1년이 도래하면 그 시점부터 신고 중단 → 법정퇴직금으로 전환.
 */
export function mutualAidAccrued(opts: { workDays: number; fundDaily?: number }): number {
  const fund = opts.fundDaily ?? loadFundDaily();
  return Math.max(0, Math.round(opts.workDays * fund));
}

/* ─────────── 2) 1년 이상 — 법정퇴직금 ─────────── */

/**
 * 법정퇴직금 = 1일 평균임금 × 30일 × (총계속근로일수 ÷ 365)
 *  · 평균임금 = 직전 3개월 임금 총액 ÷ 직전 3개월 일수
 *  · 일용근로자도 1년 이상 계속근로 시 동일 적용
 *
 * 호출자가 평균임금을 계산해 넘기는 게 맞다 — 이 함수는 공식만 적용.
 */
export function legalSeverance(opts: {
  avgDailyWage: number;
  serviceDays: number;
}): number {
  if (opts.avgDailyWage <= 0 || opts.serviceDays <= 0) return 0;
  return Math.round((opts.avgDailyWage * 30 * opts.serviceDays) / 365);
}

/**
 * 「최근 3개월 평균임금」 추정 — 단순화 모드.
 *  실서버에서는 실제 지급내역에서 가져와야 한다.
 *  여기선 일당과 출역일을 기반으로 평균을 환산.
 */
export function estimateAvgDailyWage(opts: {
  recentMonthlyPays: { workDays: number; baseAmount: number }[];
}): number {
  const totalPay = opts.recentMonthlyPays.reduce((s, m) => s + m.baseAmount, 0);
  const totalDays = opts.recentMonthlyPays.reduce((s, m) => s + m.workDays, 0);
  if (totalDays <= 0) return 0;
  return Math.round(totalPay / totalDays);
}

/* ─────────── 그룹 분류 ─────────── */

export type SeveranceGroup = 'MUTUAL_AID' | 'LEGAL';

export interface ClassifyResult {
  group: SeveranceGroup;
  tenure: ServiceTenure;
  /** 사용자에게 보여줄 라벨 */
  label: string;
}

export function classifyForSeverance(joinedAt: string, refDate?: Date | string): ClassifyResult {
  const tenure = computeServiceTenure(joinedAt, refDate);
  if (tenure.hasReachedOneYear) {
    return { group: 'LEGAL', tenure, label: '1년 이상 (법정퇴직금)' };
  }
  if (tenure.isApproachingOneYear) {
    return {
      group: 'MUTUAL_AID',
      tenure,
      label: `1년 임박 (D-${tenure.daysUntilOneYear}) — 곧 법정퇴직금 전환`,
    };
  }
  return { group: 'MUTUAL_AID', tenure, label: '1년 미만 (공제회 부금)' };
}
