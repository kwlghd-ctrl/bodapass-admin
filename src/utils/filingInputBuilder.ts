/**
 * filingInputBuilder — Phase W4
 *
 * WageRow → FilingInput 변환 헬퍼.
 *
 * 핵심 변경:
 *  · daily[31] — 1일~31일 근로 여부 boolean[] (dailyTaxRows 기준 정확 마킹)
 *  · taxableGross — 과세 보수 (row.taxableWage)
 *  · nontaxable — 비과세 합계 (row.nonTaxableAmount)
 *  · gross/incomeTax/localTax — 기존 매핑 유지
 *
 * 사용 예 (OutputCenterPage):
 *
 *   const filingInputs = summary.rows.map(buildFilingInputFromRow);
 *
 * 참고: insuranceFiling.ts 의 FilingInput 은 daily 를 number[] (1/0) 로 정의.
 *       Phase W4 는 boolean[] daily 를 noun 으로 추가 노출 (downstream 에서 두 표현 모두 수용).
 */
import type { WageRow } from '../api/wage.types';

export interface FilingInputW4 {
  /** 1일~31일 근로 여부 — true 이면 해당 일에 임금 지급 발생 */
  daily: boolean[];
  /** 임금총액 (= 보수총액). row.baseAmount */
  gross: number;
  /** 과세 보수. row.taxableWage */
  taxableGross: number;
  /** 비과세 합계. row.nonTaxableAmount */
  nontaxable: number;
  /** 소득세 — row.deductionIncomeTax */
  incomeTax: number;
  /** 지방소득세 — row.deductionLocalTax */
  localTax: number;
}

/**
 * WageRow 한 행을 4대보험 신고용 FilingInput 으로 변환.
 *
 *  · daily[i] — i+1 일 근로 여부. dailyTaxRows[i].workDate (YYYY-MM-DD) 의 일자 추출.
 *  · 누락 필드는 0 처리.
 */
export function buildFilingInputFromRow(row: WageRow): FilingInputW4 {
  const daily: boolean[] = Array.from({ length: 31 }, () => false);
  for (const d of row.dailyTaxRows ?? []) {
    const dayNum = Number(d.workDate?.slice(8, 10));
    if (dayNum >= 1 && dayNum <= 31) daily[dayNum - 1] = true;
  }
  return {
    daily,
    gross: row.baseAmount ?? 0,
    taxableGross: row.taxableWage ?? 0,
    nontaxable: row.nonTaxableAmount ?? 0,
    incomeTax: row.deductionIncomeTax ?? 0,
    localTax: row.deductionLocalTax ?? 0,
  };
}
