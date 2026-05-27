import type { FilingInput } from '../../../utils/insuranceFiling';

/**
 * Phase CC2 — OutputCenterPage handleBuildAndDownload 에서 분리한 순수 매퍼.
 *
 * 평문 주민번호(rrn)를 메모리 내 sensitiveMap 으로부터 filingInputs 에 일회성 주입.
 *
 * 입력:
 *  - filingInputs       : FilingInput[] (buildFilingInputsFromReportRows 결과)
 *  - memberIds          : reportRows[idx].memberId 와 1:1 매칭되는 식별자 배열.
 *                         length 는 filingInputs.length 와 같아야 함 (인덱스 맞춤).
 *  - sensitiveMap       : memberId → 평문 13자리 RRN 매핑.
 *
 * 동작:
 *  - sensitiveMap 에 없거나 13자리 아닌 항목은 rrn 을 빈 문자열로 채움.
 *  - 호출자 측에서 사전에 missing 13자리 검증을 수행해야 함 (이 함수는 차단/throw 하지 않음).
 *  - spread 로 gross/taxableGross/nontaxable/daily 등 다른 필드 모두 보존.
 *
 * 순수 함수 — 페이지 클로저/상태 의존 없음.
 */
export function injectRrnToFilingInputs(
  filingInputs: FilingInput[],
  memberIds: Array<string | undefined>,
  sensitiveMap: Map<string, string>,
): FilingInput[] {
  return filingInputs.map((fi, idx) => {
    const id = memberIds[idx];
    const rrn = id ? sensitiveMap.get(id) : undefined;
    if (!rrn || rrn.length !== 13) return { ...fi, rrn: '' };
    return { ...fi, rrn };
  });
}
