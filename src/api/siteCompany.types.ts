/**
 * SiteCompany — 「현장 × 회사」 관계 (다대다)
 *
 * 한 현장에 여러 회사가 공동 시공할 때 각 회사의 역할을 기록.
 * Employment 의 외래키 주체이며, 노임대장·세금계산서·신고서가 모두
 * SiteCompany 단위로 발행된다.
 */

export type SiteCompanyRole =
  | 'PRIME'   // 원도급사
  | 'SUB'     // 하도급사
  | 'HQ';     // 본사 직접 관리

export type SiteCompanyStatus = 'ACTIVE' | 'TERMINATED';

export interface SiteCompany {
  id: string;

  siteId: string;
  companyId: string;

  role: SiteCompanyRole;

  /** 계약 시작/종료일 */
  startDate: string;
  endDate?: string;

  status: SiteCompanyStatus;

  /** 도급액 (원) — 옵션 */
  contractAmount?: number;

  /** 현장 내 이 회사의 노무 담당자 */
  laborManagerName?: string;
  laborManagerPhone?: string;

  createdAt: string;
}

export interface ListSiteCompaniesQuery {
  siteId?: string;
  companyId?: string;
  status?: SiteCompanyStatus | 'ALL';
}

export interface ListSiteCompaniesResponse {
  siteCompanies: SiteCompany[];
}

export interface CreateSiteCompanyRequest {
  siteId: string;
  companyId: string;
  role: SiteCompanyRole;
  startDate: string;
  endDate?: string;
  contractAmount?: number;
  laborManagerName?: string;
  laborManagerPhone?: string;
}
