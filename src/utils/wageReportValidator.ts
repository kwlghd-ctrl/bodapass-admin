/**
 * wageReportValidator — Phase U3 + W1/W2
 *
 * 신고서 생성 직전 WageRow 데이터의 무결성 검증.
 *
 * 차단 조건 (ok=false):
 *  1) calculationStatus === 'BLOCKED' 인 행이 1건 이상
 *  2) calculationStatus === undefined 인 행이 1건 이상 (Phase W2)
 *  3) dailyTaxRows 없는 행이 1건 이상 (정확 세금 산출 불가)
 *  4) dailyTaxRows.incomeTax 합 ≠ row.deductionIncomeTax 합 (계산 불일치)
 *  5) dailyTaxRows.localIncomeTax 합 ≠ row.deductionLocalTax 합 (Phase W2)
 *  6) dailyTaxRows.totalTax 합 ≠ row 의 소득세+지방세 합 (Phase W2)
 *  7) strict=true 모드에서 calculationStatus !== 'READY' 인 행이 있으면 차단 (Phase W2)
 *
 * 경고 (ok=true, warnings 채워짐):
 *  · calculationStatus === 'ESTIMATED' 인 행이 있으면 경고 (strict=false 일 때)
 *  · 행 자체의 warnings 도 합쳐서 반환
 *
 * 사용 예 (OutputCenterPage 의 신고서 생성 버튼):
 *
 *   const reportRows = filterReportRows(rows);
 *   const v = validateReportInput(reportRows);
 *   if (!v.ok) { alert('신고서 생성 차단:\n\n' + v.reason); return; }
 *   if (v.warnings?.length) {
 *     if (!confirm('다음 경고가 있습니다. 그래도 진행하시겠습니까?\n\n' + v.warnings.join('\n'))) return;
 *   }
 *   // proceed with original report generation
 */
import type { WageRow } from '../api/wage.types';

export interface ValidateReportInputResult {
  ok: boolean;
  reason?: string;
  warnings?: string[];
}

export interface ValidateReportInputOptions {
  /** strict=true 일 때 ESTIMATED 도 차단 사유로 간주 */
  strict?: boolean;
}

/**
 * Phase W1: 신고 대상 row 만 골라낸다.
 *  · 출역 0건 (workDays===0 && baseAmount===0 && dailyTaxRows 없음) BLOCKED row 제외
 *  · 실제 임금 지급 또는 일자별 세금 row 가 있는 경우만 신고 대상
 *
 * @param rows  전체 WageRow 목록 (BLOCKED 0-출역 row 포함 가능)
 * @returns     신고 대상 row 만 추린 새 배열
 */
export function filterReportRows(rows: WageRow[]): WageRow[] {
  return rows.filter(
    (r) =>
      (r.workDays ?? 0) > 0 ||
      (r.baseAmount ?? 0) > 0 ||
      (r.dailyTaxRows?.length ?? 0) > 0,
  );
}

export function validateReportInput(
  rows: WageRow[],
  options?: ValidateReportInputOptions,
): ValidateReportInputResult {
  const strict = options?.strict === true;

  // 1) BLOCKED 차단
  const blocked = rows.filter((r) => r.calculationStatus === 'BLOCKED');
  if (blocked.length > 0) {
    return {
      ok: false,
      reason: `BLOCKED row ${blocked.length}건 — 신고서 생성 불가. 출역 기록 확인 후 재시도.`,
    };
  }

  // 2) calculationStatus 누락 차단 (Phase W2)
  const missingStatus = rows.filter((r) => r.calculationStatus === undefined);
  if (missingStatus.length > 0) {
    return {
      ok: false,
      reason: `calculationStatus 필드 누락 — 신고서 생성 불가 (${missingStatus.length}건)`,
    };
  }

  // 3) strict 모드 — ESTIMATED 도 차단 (Phase W2)
  if (strict) {
    const notReadyStrict = rows.filter((r) => r.calculationStatus !== 'READY');
    if (notReadyStrict.length > 0) {
      return {
        ok: false,
        reason: `strict 모드 — calculationStatus !== 'READY' 인 행 ${notReadyStrict.length}건 차단`,
      };
    }
  }

  const notReady = rows.filter((r) => r.calculationStatus && r.calculationStatus !== 'READY');
  const missingDaily = rows.filter((r) => !r.dailyTaxRows || r.dailyTaxRows.length === 0);
  const allWarnings = rows.flatMap((r) => r.warnings ?? []);
  if (missingDaily.length > 0) {
    return {
      ok: false,
      reason: `dailyTaxRows 없음 ${missingDaily.length}건 — 정확 세금 산출 불가.`,
    };
  }

  // 4) incomeTax 합계 일치 (기존)
  const dailySumIncomeTax = rows.reduce(
    (s, r) => s + (r.dailyTaxRows ?? []).reduce((ss, d) => ss + (d.incomeTax ?? 0), 0),
    0,
  );
  const rowSumIncomeTax = rows.reduce((s, r) => s + (r.deductionIncomeTax ?? 0), 0);
  if (dailySumIncomeTax !== rowSumIncomeTax) {
    return {
      ok: false,
      reason: `dailyTaxRows 합계(${dailySumIncomeTax}) ≠ row.incomeTax 합계(${rowSumIncomeTax})`,
    };
  }

  // 5) localIncomeTax 합계 일치 (Phase W2)
  const dailySumLocal = rows.reduce(
    (s, r) => s + (r.dailyTaxRows ?? []).reduce((ss, d) => ss + (d.localIncomeTax ?? 0), 0),
    0,
  );
  const rowSumLocal = rows.reduce((s, r) => s + (r.deductionLocalTax ?? 0), 0);
  if (dailySumLocal !== rowSumLocal) {
    return {
      ok: false,
      reason: `localIncomeTax 합계 불일치: dailyTaxRows=${dailySumLocal} vs row=${rowSumLocal}`,
    };
  }

  // 6) totalTax 합계 일치 (Phase W2)
  const dailyTotalTax = rows.reduce(
    (s, r) => s + (r.dailyTaxRows ?? []).reduce((ss, d) => ss + (d.totalTax ?? 0), 0),
    0,
  );
  const rowTotalTax = rows.reduce(
    (s, r) => s + (r.deductionIncomeTax ?? 0) + (r.deductionLocalTax ?? 0),
    0,
  );
  if (dailyTotalTax !== rowTotalTax) {
    return {
      ok: false,
      reason: `totalTax 합계 불일치: dailyTaxRows=${dailyTotalTax} vs row=${rowTotalTax}`,
    };
  }

  const warnings = [
    ...new Set(
      allWarnings.concat(
        notReady.length > 0 ? [`예상값 ${notReady.length}건 — 검증 필요`] : [],
      ),
    ),
  ];
  return { ok: true, warnings };
}
