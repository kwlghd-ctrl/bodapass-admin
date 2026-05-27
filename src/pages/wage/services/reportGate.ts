import type { WageRow } from '../../../api/wage.types';
import { filterReportRows, validateReportInput } from '../../../utils/wageReportValidator';

/**
 * Phase Y1 — 출력용 reportRows 준비 + 검증.
 *
 * BLOCKED / 출역 0건 row 를 filterReportRows 로 제외한 뒤,
 * validateReportInput(strict:true) 로 무결성 검증.
 * 모든 출력 핸들러(임금명세서/노임대장/근로내용확인신고/카톡·SMS 발송)는
 * 이 헬퍼가 반환한 reportRows 로 filteredSummary 를 만들어 사용해야 함.
 *
 * Phase AA1 — WagePage.tsx 에서 services/reportGate.ts 로 분리.
 * 부수효과(window.alert/window.confirm)는 보존 — DOM 외 의존성은 없음.
 *
 * @returns 검증 통과 시 reportRows (출력 진행), 차단 시 null (사용자에게 alert 표시 완료)
 */
export function prepareReportRows(rows: WageRow[]): WageRow[] | null {
  const reportRows = filterReportRows(rows);
  const v = validateReportInput(reportRows, { strict: true });
  if (!v.ok) {
    window.alert('출력 차단:\n\n' + v.reason);
    return null;
  }
  if (v.warnings && v.warnings.length > 0) {
    const ok = window.confirm(
      '다음 경고가 있습니다. 그래도 진행하시겠습니까?\n\n' + v.warnings.join('\n'),
    );
    if (!ok) return null;
  }
  return reportRows;
}
