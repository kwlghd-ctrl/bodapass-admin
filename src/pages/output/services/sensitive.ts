import { workerApi } from '../../../api/worker';
import type { WageRow } from '../../../api/wage.types';

export interface FetchSensitiveOptions {
  yearMonth: string;
  siteId?: string;
  reason?: string;
}

/**
 * Phase X4 / Phase Y4 / Phase Y6 — 평문 주민번호는 workerApi.getSensitive() 로만 접근.
 * 응답은 파일 생성 직후 메모리에서 폐기 (state/localStorage 저장 금지).
 *
 * Y4 — 13자리 숫자만 통과. 마스킹(*)/짧음/길음 모두 Map 에 추가 안 함 → 호출자 차단.
 * Y6 — getSensitive 호출 시 options 객체 (reason/targetMonth/siteId) 를 항상 전달.
 *
 * Phase AA2 — OutputCenterPage.tsx 에서 services/sensitive.ts 로 분리.
 * 페이지 클로저에 의존하지 않도록 yearMonth/siteId 를 인자로 받음. workerApi 외 의존성 없음.
 *
 * TODO(실서비스):
 *  · 서버 audit log 누적 (reason/targetMonth/siteId/userId/requestedAt)
 *  · rate-limit (시간당 N 건 초과 시 차단)
 *  · 권한 체크 (OWNER 또는 신고 발행 권한)
 *  · 응답 헤더의 발급 ID 화면 표시
 */
export async function fetchSensitiveForRows(
  rows: WageRow[],
  options: FetchSensitiveOptions,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const reason = options.reason ?? 'INSURANCE_FILING_EXPORT';
  for (const r of rows) {
    const id = r.memberId;
    if (!id) continue;
    try {
      const sensitive = await workerApi.getSensitive(id, {
        reason,
        targetMonth: options.yearMonth,
        siteId: options.siteId,
      });
      const digits = sensitive?.idNumberRaw?.replace(/[^0-9]/g, '') ?? '';
      if (digits.length === 13) {
        result.set(id, digits);
      }
      // else: 13자리 아니면 Map 에 추가 안 함 → 호출자가 차단
    } catch (err) {
      console.warn(`[Y4] getSensitive 실패 — ${id}:`, err);
      // 실패 → Map 에 추가 안 함
    }
  }
  return result;
}
