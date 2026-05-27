# 페이지 ↔ Service ↔ API 경계 정책 (Phase II 결과)

본 문서는 페이지(*Page.tsx)와 도메인/서비스/API 모듈 사이의 호출 경계를
정의합니다. 백엔드 분리(mock → 실서버)를 안전하게 진행하기 위한 기준입니다.

## 1. 4-layer 구조

```
┌──────────────────────────────────────────────────────────┐
│ Page  (src/pages/*.tsx)                                  │
│   - useState / useEffect / JSX / event handler          │
│   - alert / confirm / navigate / setOpen                │
└──────────────────────────────────────────────────────────┘
           │  (1) prepareReportRows → service wrapper
           ▼
┌──────────────────────────────────────────────────────────┐
│ Page-services  (src/pages/<page>/services/*.ts)          │
│   - PURE 빌더: HTML, LedgerDoc, FilingInput 등           │
│   - 페이지 state 의존 없음, 부수효과 최소화               │
│   ex) wage/services/exportPayrollDocs.ts                 │
│       wage/services/reportGate.ts                        │
│       output/services/sensitive.ts                       │
│       output/services/buildFilings.ts                    │
└──────────────────────────────────────────────────────────┘
           │  (2) *Api 호출 / domain 함수 호출
           ▼
┌──────────────────────────────────────────────────────────┐
│ Domain + *Api  (src/domain/*.ts, src/api/*.ts)           │
│   - calculateMonthlyWageLedger / calculateDailyGongsu    │
│   - workerApi / siteApi / wageApi / attendanceApi        │
│   - 비즈니스 규칙 + REST 계약                              │
└──────────────────────────────────────────────────────────┘
           │  (3) apiClient (axios instance)
           ▼
┌──────────────────────────────────────────────────────────┐
│ apiClient  (src/api/client.ts)                           │
│   - VITE_USE_MOCK / VITE_API_BASE_URL 토글               │
│   - 토큰 자동 첨부 + 401 재발급                          │
│   - mock 모드: mockBackend 어댑터로 네트워크 차단         │
└──────────────────────────────────────────────────────────┘
```

## 2. 금지 사항 (페이지 레이어)

| 금지 | 대체 |
|------|------|
| `import axios from "axios"` 직접 사용 | `*Api` 모듈을 통해 호출 |
| `Math.floor(amount * 0.045)` 인라인 세율 | `src/domain/` 함수 (calculateSocialInsurance 등) |
| `buildLedgerFromWage({...})` 직접 호출 | `buildLedgerFromReport()` wrapper |
| `buildBulkPayslipHtml({...})` 직접 호출 | `buildPayslipHtmlFromReport()` wrapper |
| `workerApi.getSensitive(id)` 직접 호출 | `fetchSensitiveForRows()` (audit log 자동 첨부) |
| `localStorage.setItem("rate.xxx", ...)` 비즈니스 데이터 | 백엔드 endpoint (`/v2/settings/*`) |

UI 상태 캐시용 `localStorage` (탭 선택, 보드 상태, 처리 마킹 등)는 허용.
다만 백엔드 전환 시 사용자별 동기화 필요 여부를 함께 결정해야 함.

## 3. 권장 호출 패턴

### 임금명세서 출력 (예시)
```ts
// 페이지 (WagePage.tsx)
function printPayslips(rows, summary, ym) {
  const reportRows = prepareReportRows(rows);  // (1) 검증/필터
  if (!reportRows) return false;
  const html = buildPayslipHtmlFromReport(     // (2) PURE 빌드
    reportRows, ym, companyInfo, siteInfo,
  );
  openPrintWindow({ title: ..., bodyHtml: html }); // (3) 부수효과
  return true;
}
```

### 민감정보 (주민번호) 조회
```ts
// 페이지 (OutputCenterPage.tsx)
const sensitiveMap = await fetchSensitiveForRows(reportRows, {
  yearMonth, siteId,
});
// → 내부에서 workerApi.getSensitive() + audit log
```

## 4. 백엔드 전환 시 영향 layer

| Layer | 영향 | 작업 |
|-------|------|------|
| Page (*.tsx) | **없음** | 인터페이스만 일치하면 변경 0 |
| Page-services | **없음** | PURE 함수, 입출력 타입만 일치 |
| Domain (src/domain/) | **없음** | 순수 계산, 서버에서도 동일 산식 |
| *Api modules | **수정 가능** | 응답 shape 변경 시 adapter 추가 |
| apiClient | **환경 변수만** | `VITE_USE_MOCK=false` + `VITE_API_BASE_URL=실서버` |
| mockBackend | **제거 또는 보존** | 개발/E2E 환경에서 계속 사용 가능 |

핵심: **Page 와 Page-services 는 백엔드 전환에 영향받지 않는 격리 계층** 으로 유지.

## 5. 알려진 예외 (II4 시점)

II4 현재 시점에서 정책을 미준수하는 케이스 — 다음 phase 후보:

1. **apiClient 직접 사용 (페이지 → /companies, /site-companies):**
   `AttendancePage.tsx`, `DashboardPage.tsx`, `ReportsPage.tsx`, `SiteListPage.tsx`,
   `ForemanPage.tsx`, `GongsuClosePage.tsx`, `LoginPage.tsx`,
   `TeamInvitePage.tsx`, `TeamListPage.tsx`, `TeamRegisterPage.tsx`, `WagePage.tsx`
   - 대부분 `getErrorMessage` import 만 사용 (허용)
   - 실 호출은 9건 (3개 페이지 × company/site lookup) — `companyApi.list()` / `siteApi.list()`
     로 wrapping 필요 (별도 phase)
2. **localStorage 비즈니스 데이터:**
   - `bodapass.daily.handled` / `bodapass.auth.handled` — 일별 처리 마킹
   - `FOREMAN_STATUS_KEY` — 십장 상태 캐시
   - 백엔드 전환 시 `/v2/operations/daily-mark` 같은 endpoint 로 이관 검토

## 6. 환경 변수 (apiClient)

| 변수 | 기본값 | 의미 |
|------|--------|------|
| `VITE_USE_MOCK` | `true` | `true` 이면 mockBackend 어댑터 활성, 실 네트워크 차단 |
| `VITE_API_BASE_URL` | `/api` | 실 백엔드 prefix (Vercel rewrite 또는 직접 URL) |

전환 시 `.env.production`:
```
VITE_USE_MOCK=false
VITE_API_BASE_URL=https://api.bodapass.example.com
```
