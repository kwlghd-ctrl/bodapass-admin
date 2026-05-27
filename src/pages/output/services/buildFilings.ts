import type { WageRow } from '../../../api/wage.types';
import { buildFilingInputFromRow } from '../../../utils/filingInputBuilder';
import type { FilingInput } from '../../../utils/insuranceFiling';

/**
 * Phase X2: filingInputs 는 reportRows 기준 (summary.rows 직접 map 금지).
 * Phase X4: rrn 은 빌드 시점에 비워두고, 다운로드 핸들러에서 workerApi.getSensitive 로 주입.
 * Phase Y5: gross / taxableGross / nontaxable 세 값을 모두 보존해 신고서 양식별로 정확히 매핑.
 *
 * Phase AA2 — OutputCenterPage.tsx 에서 services/buildFilings.ts 로 분리.
 * 순수 함수 — reportRows 만 받아 FilingInput[] 반환. 페이지 클로저 의존 없음.
 */
export function buildFilingInputsFromReportRows(reportRows: WageRow[]): FilingInput[] {
  return reportRows.map((r) => {
    const fi = buildFilingInputFromRow(r);
    // boolean[] daily → number[] (1/0) — insuranceFiling.FilingInput 호환
    const dailyNumeric = fi.daily.map((b) => (b ? 1 : 0));
    return {
      name: r.memberName,
      // Phase X4 — 평문 주민번호는 빌드 시점에 비워두고 다운로드 직전 주입. idNumberMasked 직접 사용 금지.
      rrn: '',
      workDays: r.workDays,
      daily: dailyNumeric,
      gross: fi.gross,
      // Phase Y5 — 과세보수 (taxableGross) 보존
      taxableGross: fi.taxableGross,
      nontaxable: fi.nontaxable,
      incomeTax: fi.incomeTax,
      localTax: fi.localTax,
      jobCode: undefined, // KECO 직종코드 — 추후 멤버 매핑 추가
      foreigner: false,
    };
  });
}
