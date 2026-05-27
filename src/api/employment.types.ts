/**
 * Employment — 채용 관계
 *
 * 한 워커(Worker) 가 한 SiteCompany (현장×회사 페어) 에서 일하는 단위.
 * 같은 워커가 여러 회사·현장에서 일하면 Employment 행이 여러 개 생긴다.
 *
 *  · 내부 키: (workerId, siteCompanyId) unique
 *  · UI 표시: workerCode + companyCode + 현장명 조합
 *  · 임금·출퇴근·세금·보험은 모두 employmentId 단위로 누적
 */

import type { TrustTier } from './worker.types';

export type EmploymentStatus =
  | 'ACTIVE'      // 재직 중
  | 'PAUSED'      // 일시 중단 (휴직·자재 부족 등)
  | 'TERMINATED'; // 이탈

/**
 * 임금 지급 계좌 명의자 유형
 *  · 'OWN'     : 본인 명의 계좌 → T1
 *  · 'FAMILY'  : 가족 명의 계좌 → T2/T3 (배우자·직계존비속)
 *  · 'FOREMAN' : 반장 명의 계좌 → T2/T3 (반장이 일괄 수령 후 분배)
 */
export type PaymentAccountType = 'OWN' | 'FAMILY' | 'FOREMAN';

/** 직종 — 직무범위.xlsx 의 303개 직종 중 하나 */
export type Trade = string;

/** 4대보험 가입 여부 */
export interface InsuranceFlags {
  pension: boolean;
  health: boolean;
  employment: boolean;
  accident: boolean;
}

/**
 * 비과세 소득 항목 — 월 단위 (원). Employment 단위 설정.
 *  · meal      : 식대 (월 20만원 한도)
 *  · vehicle   : 자가운전보조금 (월 20만원 한도)
 *  · travel    : 출장비·차량유지비 (조건부)
 *  · childcare : 출산·보육수당 (월 10만원 한도)
 *  · other     : 기타 비과세
 */
export interface NontaxableConfig {
  meal?: number;
  vehicle?: number;
  travel?: number;
  childcare?: number;
  other?: number;
}

/**
 * 근로계약 상태 — 기존 운영 소스의 cntrStatTp 매핑.
 *  · DRAFT     : 작성 중 (서명 전)
 *  · REQUESTED : 워커에게 서명 요청 발송됨
 *  · SIGNED    : 워커가 서명 완료 (계약 효력 발생)
 *  · ACTIVE    : 실제 근로 중 (SIGNED + startDate 도래)
 *  · REJECTED  : 워커가 서명 거부
 *  · TERMINATED: 종료 (endDate 도래 또는 중도 해지)
 */
export type ContractStatus =
  | 'DRAFT'
  | 'REQUESTED'
  | 'SIGNED'
  | 'ACTIVE'
  | 'REJECTED'
  | 'TERMINATED';

export interface Employment {
  id: string;

  /** 내부 FK — Worker.id */
  workerId: string;
  /** 내부 FK — SiteCompany.id (현장+회사 페어). 이 한 줄로 site/company 모두 추출 가능. */
  siteCompanyId: string;
  /** 내부 FK — 같은 SiteCompany 내 반장의 Employment.id (자기 참조). 미배정이면 비어둠 */
  foremanEmploymentId?: string;
  /** 현장담당자(소장) 직접 관리 모드 — 반장 자동 배정 비활성화 */
  assignedToSiteManager?: boolean;

  trade: Trade;
  dailyWage: number;
  paymentAccountType: PaymentAccountType;

  /**
   * 채용 시작·종료 (Employment 자체의 effective 기간).
   *
   *  · startDate: 「실제 근로 시작일」 — 기존 운영 소스의 wrkStrDd.
   *  · endDate:   「실제 근로 종료일」 — 기존 운영 소스의 wrkEndDd. 미정이면 undefined.
   */
  startDate: string;
  endDate?: string;

  /**
   * 「근로 시작 예정일·종료 예정일」 — startDate/endDate 와 다를 수 있음.
   *   계약서 작성 시점에 잡힌 예정일과 실제 출근일이 다른 케이스 분리.
   *   미사용 시 startDate/endDate 와 동일.
   */
  workStartDate?: string;
  workEndDate?: string;

  /** 근로계약 상태 — 운영 소스의 cntrStatTp */
  contractStatus?: ContractStatus;
  /** 계약 체결일 (서명 완료일) — 운영 소스의 cntrDd */
  contractDate?: string;
  /** 계약서 일련번호 — 운영 소스의 cntrSn */
  contractNo?: string;

  status: EmploymentStatus;

  /** 채용 시점의 워커 트러스트 티어 스냅샷 (감사 보존용) */
  identityTier: TrustTier;

  /** 4대보험 가입 여부 — 일용직은 산재만 의무, 나머지는 선택 */
  insurance?: InsuranceFlags;
  /** 비과세 소득 항목 — Employment 단위 (한 워커가 회사 두 곳에 채용되어도 다르게 설정 가능) */
  nontaxable?: NontaxableConfig;

  /** 근로계약서 체결 여부 */
  contractSigned?: boolean;
  contractSignedAt?: string;

  /**
   * ─── 법정 계산 추가 필드 ─────────────────────
   */

  /** 직종 코드 — 직무범위.xlsx 의 303개 직종 코드 */
  tradeCode?: string;
  /** 직책 — 반장, 작업자 등 */
  jobTitle?: string;
  /** 임금 형태 */
  wageType?: 'DAILY' | 'HOURLY' | 'MONTHLY';
  /** 표준 근로시간 (시간) — 1일당 (기본 8) */
  standardWorkHours?: number;
  /** 4대보험 가입 적용 여부 (단순 플래그) */
  insuranceApplied?: boolean;
  /** 퇴직공제 적용 여부 (legacy: cntr 의 jntrsfnInsrYn) */
  severanceApplied?: boolean;
  /** 소득세 적용 여부 (외국인 일부 면제 케이스 등) */
  taxApplied?: boolean;

  createdAt: string;
}

// ───────── 등록 / 수정 ─────────

export interface CreateEmploymentRequest {
  workerId: string;
  siteCompanyId: string;
  foremanEmploymentId?: string;
  assignedToSiteManager?: boolean;
  trade: Trade;
  dailyWage: number;
  paymentAccountType: PaymentAccountType;
  startDate: string;
  insurance?: InsuranceFlags;
  nontaxable?: NontaxableConfig;
}

export interface UpdateEmploymentRequest {
  trade?: Trade;
  dailyWage?: number;
  paymentAccountType?: PaymentAccountType;
  foremanEmploymentId?: string;
  assignedToSiteManager?: boolean;
  endDate?: string;
  workStartDate?: string;
  workEndDate?: string;
  contractStatus?: ContractStatus;
  contractDate?: string;
  contractNo?: string;
  status?: EmploymentStatus;
  insurance?: InsuranceFlags;
  nontaxable?: NontaxableConfig;
}

// ───────── 조회 ─────────

export interface ListEmploymentsQuery {
  siteId?: string;
  companyId?: string;
  siteCompanyId?: string;
  workerId?: string;
  status?: EmploymentStatus | 'ALL';
  /** 자유 검색 — 워커 이름/workerCode/직종 */
  q?: string;
}

export interface ListEmploymentsResponse {
  employments: Employment[];
}

/**
 * 화면용 합쳐진 뷰 — Employment + Worker + SiteCompany 의 joined view.
 * 목록·상세 화면이 한 번에 표시할 때 사용.
 */
export interface EmploymentView extends Employment {
  // worker 발췌
  workerCode: string;
  workerName: string;
  workerPhone: string;
  workerIdNumberMasked: string;
  workerBankName: string;
  workerAccountMasked: string;
  workerFaceVerified: boolean;
  workerTrustTier: TrustTier;
  // siteCompany 발췌
  siteId: string;
  siteName: string;
  companyId: string;
  companyCode: string;
  companyName: string;
  /** 반장 이름 (foremanEmploymentId 가 있으면) */
  foremanName?: string;
}

export interface ListEmploymentViewsResponse {
  views: EmploymentView[];
  totalActive: number;
}
