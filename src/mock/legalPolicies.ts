/**
 * legalPolicies — 법정 정책 테이블 (mock)
 *
 * 코드 중간에 하드코드하지 않고 본 테이블에서 effectiveFrom/To 기준으로 조회.
 *
 * 실서비스 전환 시:
 *   · 본 mock 배열을 DB 의 `legal_policies` 테이블로 옮긴다.
 *   · GET /v2/legal-policies?category=X&asOfDate=YYYY-MM-DD endpoint 신설.
 *   · 정책 변경 시 새 row 추가 (기존 row 의 effectiveTo 만 갱신, 행 삭제 금지).
 *   · 감사: 모든 정책 변경은 auditLog 에 기록.
 */

import type { LegalPolicy, PolicyCategory, PolicyLookupResult } from '../api/legal.types';

/* ════════════════════════════════════════════════
 *  정책 데이터 (2024~2026 주요 기준)
 * ════════════════════════════════════════════════ */

export const LEGAL_POLICIES: LegalPolicy[] = [
  // ── 퇴직공제부금 일액 ──
  {
    id: 'POL-SEV-FUND-OLD',
    category: 'SEVERANCE_FUND_DAILY',
    effectiveFrom: '2020-01-01',
    effectiveTo: '2026-03-31',
    value: 6500,
    description: '2026-04-01 이전 입찰공고/도급계약 공사 — 출역 1일당 6,500원',
    sourceName: '건설근로자 퇴직공제 부금 일액 고시 (구) — 건설근로자공제회',
    sourceUrl: 'https://www.cw.or.kr/cms/business/p2/p2.jsp',
    version: 'SEV-FUND-OLD-v1',
    confidence: 'OFFICIAL', requiresVerification: false,
  },
  {
    id: 'POL-SEV-FUND-NEW',
    category: 'SEVERANCE_FUND_DAILY',
    effectiveFrom: '2026-04-01',
    effectiveTo: null,
    value: 8700,
    description: '2026-04-01 이후 최초 입찰공고/도급계약 공사 — 출역 1일당 8,700원',
    sourceName: '건설근로자 퇴직공제 부금 일액 고시 (신) — 건설근로자공제회',
    sourceUrl: 'https://www.cw.or.kr/cms/business/p2/p2.jsp',
    version: 'SEV-FUND-NEW-v1',
    confidence: 'OFFICIAL', requiresVerification: false,
  },

  // ── 국민연금 ──
  {
    id: 'POL-NPS-2024',
    category: 'NATIONAL_PENSION_RATE',
    effectiveFrom: '2024-01-01',
    effectiveTo: '2025-12-31',
    value: { total: 0.09, employer: 0.045, employee: 0.045 },
    description: '국민연금 보험료율 9% (사업주 4.5% + 근로자 4.5%)',
    sourceName: '국민연금법 시행령 제3조 (보험료율)',
    sourceUrl: 'https://www.law.go.kr/법령/국민연금법시행령',
    version: 'NPS-2024-v1',
    confidence: 'OFFICIAL', requiresVerification: false,
  },
  {
    id: 'POL-NPS-2026',
    category: 'NATIONAL_PENSION_RATE',
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
    value: { total: 0.095, employer: 0.0475, employee: 0.0475 },
    description: '국민연금 보험료율 9.5% (사업주 4.75% + 근로자 4.75%) — 2026 인상',
    sourceName: '국민연금법 시행령 제3조 (2026 개정) — 단계적 인상안',
    sourceUrl: 'https://www.nps.or.kr/jsppage/info/easy/easy_04_06.jsp',
    version: 'NPS-2026-v1',
    confidence: 'ASSUMED', requiresVerification: true,
  },

  // ── 건강보험 ──
  {
    id: 'POL-HI-2026',
    category: 'HEALTH_INSURANCE_RATE',
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
    value: { total: 0.0719, employer: 0.03595, employee: 0.03595 },
    description: '건강보험료율 7.19% (사업주 3.595% + 근로자 3.595%) — 2026 인상',
    sourceName: '국민건강보험법 시행령 제44조 (보험료율) — 보건복지부 2026 고시',
    sourceUrl: 'https://www.nhis.or.kr/nhis/together/wbhaea01600m01.do',
    version: 'HI-2026-v2',
    confidence: 'OFFICIAL', requiresVerification: true,
  },

  // ── 장기요양보험 ──
  {
    id: 'POL-LTC-2026',
    category: 'LONG_TERM_CARE_RATE',
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
    value: 0.1314, // 건강보험료의 13.14%
    description: '장기요양보험료율 — 건강보험료의 13.14% (2026 인상)',
    sourceName: '노인장기요양보험법 제9조 (보험료) — 보건복지부 2026 고시',
    sourceUrl: 'https://www.longtermcare.or.kr/npbs/r/a/201/selectIntroNotice.web',
    version: 'LTC-2026-v2',
    confidence: 'OFFICIAL', requiresVerification: true,
  },

  // ── 고용보험 ──
  {
    id: 'POL-EI-2026',
    category: 'EMPLOYMENT_INSURANCE_RATE',
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
    value: { total: 0.018, employer: 0.009, employee: 0.009 },
    description: '고용보험료율 1.8% (사업주 0.9% + 근로자 0.9%) — 우대업종 제외 일반',
    sourceName: '고용보험법 시행령 제12조 (보험료율) — 일반 사업장 기준',
    sourceUrl: 'https://www.law.go.kr/법령/고용보험법시행령',
    version: 'EI-2026-v1',
    confidence: 'OFFICIAL', requiresVerification: true,
  },

  // ── 산재보험 (건설업 평균) ──
  {
    id: 'POL-IA-CONSTRUCTION-2026',
    category: 'INDUSTRIAL_ACCIDENT_RATE',
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
    value: 0.036, // 건설업 약 3.6% — 업종별 다름 (시연 평균값)
    description: '산재보험료율 — 건설업 평균 3.6% (사업주 전액 부담) — DEMO 평균값',
    sourceName: '산업재해보상보험법 시행령 별표 1 (업종별 요율) — 건설업 평균 (실 사업장은 업종 코드별 차등)',
    sourceUrl: 'https://www.kcomwel.or.kr/kcomwel/comp/insu/yo.jsp',
    version: 'IA-CONSTRUCTION-2026-v1',
    confidence: 'DEMO', requiresVerification: true,
  },

  // ── 두루누리 ──
  {
    id: 'POL-DURU-WAGE-2026',
    category: 'DURUNURI_WAGE_CEILING',
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
    value: 2_700_000,
    description: '두루누리 월평균 보수 한도 — 270만원 미만 (2026 기준)',
    sourceName: '두루누리 사회보험료 지원사업 운영지침 — 고용노동부·근로복지공단',
    sourceUrl: 'https://insurancesupport.or.kr/durunuri/condition.do',
    version: 'DURU-WAGE-2026-v1',
    confidence: 'OFFICIAL', requiresVerification: false,
  },
  {
    id: 'POL-DURU-SUPPORT-2026',
    category: 'DURUNURI_SUPPORT_RATE',
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
    value: { newRate: 0.8, existingRate: 0, lookbackMonths: 12, maxMonths: 36 },
    description: '두루누리 지원율 — 신규가입자 80% (신청일 전 12개월 가입 이력 없음). 기존가입자 0% (legacy 정책상 40%).',
    sourceName: '두루누리 사회보험료 지원사업 운영지침 — 지원율·기간 (2026 개정)',
    sourceUrl: 'https://insurancesupport.or.kr/durunuri/support.do',
    version: 'DURU-SUPPORT-2026-v1',
    confidence: 'OFFICIAL', requiresVerification: false,
  },

  // ── 비과세 한도 ──
  {
    id: 'POL-NONTAX-MEAL-2026',
    category: 'NONTAX_MEAL_LIMIT',
    effectiveFrom: '2024-01-01',
    effectiveTo: null,
    value: 200_000,
    description: '식대 비과세 한도 — 월 20만원 (사내급식 미제공 시)',
    sourceName: '소득세법 시행령 제12조 (실비변상적 급여) 제3호 식대',
    sourceUrl: 'https://www.law.go.kr/법령/소득세법시행령/제12조',
    version: 'NONTAX-MEAL-2024-v1',
    confidence: 'OFFICIAL', requiresVerification: false,
  },
  {
    id: 'POL-NONTAX-VEHICLE-2026',
    category: 'NONTAX_VEHICLE_LIMIT',
    effectiveFrom: '2024-01-01',
    effectiveTo: null,
    value: 200_000,
    description: '자가운전보조금 비과세 한도 — 월 20만원',
    sourceName: '소득세법 시행령 제12조 (실비변상적 급여) 제2호 자가운전보조금',
    sourceUrl: 'https://www.law.go.kr/법령/소득세법시행령/제12조',
    version: 'NONTAX-VEHICLE-2024-v1',
    confidence: 'OFFICIAL', requiresVerification: false,
  },
  {
    id: 'POL-NONTAX-CHILDCARE-2026',
    category: 'NONTAX_CHILDCARE_LIMIT',
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
    value: 200_000, // 자녀 1인당 월 20만원
    description: '출산·보육수당 비과세 한도 — 6세 이하 자녀 1인당 월 20만원 (2026 인상)',
    sourceName: '소득세법 시행령 제12조 제5호 (2026 개정) 보육수당',
    sourceUrl: 'https://www.law.go.kr/법령/소득세법시행령/제12조',
    version: 'NONTAX-CHILDCARE-2026-v1',
    confidence: 'OFFICIAL', requiresVerification: false,
  },

  // ── 소득세 ──
  {
    id: 'POL-INCOME-TAX-DAILY-2024',
    category: 'INCOME_TAX_RATE_DAILY',
    effectiveFrom: '2024-01-01',
    effectiveTo: null,
    value: { rate: 0.06, dailyDeduction: 150_000 },
    description: '일용근로자 소득세율 6% (1일 15만원 공제 후 초과분 적용)',
    sourceName: '소득세법 제14조의2 (일용근로자 원천징수세액) — 국세청',
    sourceUrl: 'https://www.law.go.kr/법령/소득세법/제14조의2',
    version: 'INCOME-TAX-DAILY-2024-v1',
    confidence: 'OFFICIAL', requiresVerification: false,
  },
  {
    id: 'POL-LOCAL-TAX-2024',
    category: 'LOCAL_TAX_RATE',
    effectiveFrom: '2024-01-01',
    effectiveTo: null,
    value: 0.1, // 소득세의 10%
    description: '지방소득세 — 소득세의 10%',
    sourceName: '지방세법 제103조의5 (개인지방소득세 표준세율)',
    sourceUrl: 'https://www.law.go.kr/법령/지방세법/제103조의5',
    version: 'LOCAL-TAX-2024-v1',
    confidence: 'OFFICIAL', requiresVerification: false,
  },
];

/* ════════════════════════════════════════════════
 *  조회 함수
 * ════════════════════════════════════════════════ */

/**
 * effectiveFrom/To 기준으로 카테고리별 정책 1건을 조회.
 *
 *  · asOfDate (YYYY-MM-DD) 가 effectiveFrom <= asOfDate <= (effectiveTo ?? ∞) 범위에 들어가는 정책 중
 *    가장 effectiveFrom 이 최근인 것을 반환.
 *  · 매치되는 정책이 없으면 undefined.
 */
export function lookupPolicy<T = number>(
  category: PolicyCategory,
  asOfDate: string,
): PolicyLookupResult<T> | undefined {
  const candidates = LEGAL_POLICIES
    .filter(p => p.category === category)
    .filter(p => p.effectiveFrom <= asOfDate)
    .filter(p => p.effectiveTo == null || p.effectiveTo >= asOfDate)
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1));

  const policy = candidates[0];
  if (!policy) return undefined;
  return {
    value: policy.value as T,
    policy,
    asOfDate,
  };
}

/** 카테고리별 전체 이력 조회 (감사·조회 화면용). */
export function listPolicyHistory(category: PolicyCategory): LegalPolicy[] {
  return LEGAL_POLICIES
    .filter(p => p.category === category)
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1));
}
