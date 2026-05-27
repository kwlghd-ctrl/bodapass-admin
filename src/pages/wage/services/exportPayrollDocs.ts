import type { WageMonthSummary, WageRow } from '../../../api/wage.types';
import type { Site } from '../../../api/site.types';
import { buildLedgerFromWage, type LedgerDoc } from '../../../utils/wageLedger';
import { buildBulkPayslipHtml, buildLaborReportHtml } from '../../../utils/payrollDocs';

/**
 * Phase II2 — WagePage 출력 핸들러의 PURE 부분을 service 로 분리.
 *
 * 정책 (docs/service-boundary-policy.md):
 *  - 페이지 = state setter / window.alert / openPrintWindow / downloadLedgerXlsx 호출
 *  - service = reportRows + summary 입력을 받아 HTML/LedgerDoc 빌드 (부수효과 없음)
 *
 * 호출 순서: prepareReportRows(rows)  →  build*FromReport(reportRows, summary, ...)
 *           ↘ 검증 실패 시 차단 (페이지 책임)
 *           ↘ 통과 후 wrapper 호출 (이 모듈)
 *
 * 백엔드 전환 영향: 본 모듈은 *Api 또는 apiClient 를 직접 사용하지 않는다.
 * 빌드 결과 (HTML / LedgerDoc) 만 반환하므로 백엔드 분리에 영향 없음.
 */

export interface CompanyInfoLike {
  companyName: string;
  bizRegNo?: string;
  representative?: string;
  address?: string;
}

export interface SiteInfoLike {
  name: string;
  address: string;
  manager: string;
  managerPhone: string;
}

/**
 * 임금명세서 HTML 생성 (pure, 일괄 페이지나눔).
 * 호출자가 prepareReportRows 한 결과를 받아 HTML 문자열 반환.
 * 검증 실패 시 호출자가 사전 차단해야 함 — 본 함수는 입력 신뢰.
 */
export function buildPayslipHtmlFromReport(
  rows: WageRow[],
  yearMonth: string,
  company: CompanyInfoLike,
  site: SiteInfoLike,
): string {
  return buildBulkPayslipHtml({
    rows,
    yearMonth,
    company: company as Parameters<typeof buildBulkPayslipHtml>[0]['company'],
    site: site as Parameters<typeof buildBulkPayslipHtml>[0]['site'],
  });
}

/**
 * 근로내용확인신고서 HTML 생성 (pure).
 * filteredSummary 를 구성해 내부 헬퍼에 위임.
 */
export function buildLaborReportHtmlFromReport(
  rows: WageRow[],
  summary: WageMonthSummary,
  company: CompanyInfoLike,
  site: SiteInfoLike,
): string {
  const filteredSummary: WageMonthSummary = { ...summary, rows };
  return buildLaborReportHtml({
    data: filteredSummary,
    company: company as Parameters<typeof buildLaborReportHtml>[0]['company'],
    site: site as Parameters<typeof buildLaborReportHtml>[0]['site'],
  });
}

/**
 * 노임대장 LedgerDoc 생성 (pure).
 * 다운로드/아카이브 부수효과는 호출자(WagePage) 가 담당.
 */
export function buildLedgerFromReport(
  rows: WageRow[],
  summary: WageMonthSummary,
  site: Site | null,
  companyName: string,
  managerName?: string,
): LedgerDoc {
  const filteredSummary: WageMonthSummary = { ...summary, rows };
  return buildLedgerFromWage({
    summary: filteredSummary,
    site,
    companyName,
    managerName,
  });
}
