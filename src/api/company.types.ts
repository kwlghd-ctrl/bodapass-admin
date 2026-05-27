/**
 * Company — 회사 (사업자)
 *
 * 본사·시공사 등을 포함하는 사업자 마스터.
 * 한 워커가 여러 회사에 동시 채용될 수 있고 (Employment 다대다),
 * 한 현장은 여러 회사가 공동 시공 가능 (SiteCompany 다대다).
 */

export interface Company {
  /** 내부 PK */
  id: string;
  /** 회사 표시 코드 — 'C-001' 형태, UI 표시용 */
  companyCode: string;

  name: string;
  /** 사업자등록번호 — 'XXX-XX-XXXXX' */
  bizRegNo: string;
  representative: string;

  address?: string;
  phone?: string;
  /** 업종 — 종합건설 / 전문건설 / 인테리어 등 */
  industry?: string;

  /** 본사 회사 여부 — 본사가 직접 시공·관리하는 회사 1개 */
  isHQ?: boolean;

  /**
   * ─── 법정 계산 추가 필드 ─────────────────────
   */

  /** 사업자등록번호 — 'XXX-XX-XXXXX' (기존 bizRegNo 의 alias) */
  businessNumber?: string;
  /**
   * 회사 유형 (원도급/하도급/협력업체)
   *  · 'PRIME'   : 원도급사
   *  · 'SUB'     : 하도급사
   *  · 'PARTNER' : 협력업체
   *  · 'HQ'      : 본사
   */
  companyType?: 'PRIME' | 'SUB' | 'PARTNER' | 'HQ';
  /** 고용보험 관리번호 — 고용센터 발급 */
  employmentInsuranceManagementNo?: string;
  /** 산재보험 관리번호 — 근로복지공단 발급 */
  industrialAccidentInsuranceManagementNo?: string;
  /** 건설업 면허 종류 — 종합건설 / 전문건설 / 무면허 */
  constructionLicenseType?: 'GENERAL' | 'SPECIALTY' | 'NONE';
  /** 건설업 면허 번호 */
  constructionLicenseNo?: string;
  /** 상시근로자 수 (두루누리 적격성 판정용) */
  employeeCount?: number;
  /** 두루누리 사업장 적격 — employeeCount < 10 이면 true (캐시) */
  durunuriEligible?: boolean;

  createdAt: string;
}

// ───────── 조회 ─────────

export interface ListCompaniesQuery {
  q?: string;
  /** 본사·하도급 등 필터 */
  isHQ?: boolean;
}

export interface ListCompaniesResponse {
  companies: Company[];
}

export interface CreateCompanyRequest {
  name: string;
  bizRegNo: string;
  representative: string;
  address?: string;
  phone?: string;
  industry?: string;
}

export interface UpdateCompanyRequest {
  name?: string;
  bizRegNo?: string;
  representative?: string;
  address?: string;
  phone?: string;
  industry?: string;
}
