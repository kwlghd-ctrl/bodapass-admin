# 보다패스 (bodapass_admin) — 코드 리뷰용 안내서

> 본 문서는 ChatGPT 또는 외부 검토자가 ZIP 한 개만 받아서 전체 구조·타입 정합성·API 전환 가능성·목업/실서버 분리·얼굴인식 연동 구조·건설현장 업무 정합성·보안 리스크를 검토할 수 있도록 정리한 안내서입니다.

---

## 1. 프로그램의 목적

**보다패스 (bodapass)** 는 한국 건설현장의 일용근로자 관리 통합 플랫폼입니다.

- **얼굴인식 기반 출퇴근 인증** — 위변조·대리출근 방지
- **건설근로자 자격·계약·임금 관리** — 1년 미만 일용 vs 1년 이상 정규 분리
- **4대보험 자격 사이클 자동 추적** — 8일룰·두루누리 자동 판별
- **퇴직공제부금 + 법정퇴직금 자동 분리 계산**
- **본사 ↔ 시공사 ↔ 현장 ↔ 반장 ↔ 근로자** 5단계 권한 분리
- **건설근로자공제회 전자카드** 와 자체 얼굴인식 출역 비교

`bodapass_admin` 은 위 플랫폼의 **본사·시공사·현장담당자·반장이 사용하는 관리자 웹**입니다. 근로자 본인은 별도의 키오스크/모바일 앱을 통해 출근하며, 그 결과를 이 관리자 웹이 조회·관리합니다.

---

## 2. 현재 상태

**시연용 목업 — V2 API/도메인 구조 준비 완료 + Phase 4 마이그레이션 대기**

현재는 V2 API/도메인 구조(Worker / Company / SiteCompany / Employment / CloseStatus / AuditLog / AttendanceAdjustmentRequest)가 준비된 시연용 목업이며, 주요 화면은 아직 legacy TeamMember/memberId 구조를 사용합니다. 실서버 전환 전 다음 작업이 필요합니다:

- **Phase 4 (필수)**: TeamListPage / AttendancePage / WagePage / GongsuClosePage / DashboardPage 의 V2 API 마이그레이션 (약 14,000줄)
- **백엔드 구축 (필수)**: 본 코드는 프런트만 — 실 백엔드(API 서버 + DB + 얼굴인식 모듈)는 별도 구축 필요
- **VITE_USE_MOCK=false** 환경변수 전환 + mockBackend 제거

코드 구조는 V2 API 가 이미 실서버 응답 shape 과 동일하게 정의돼 있어, Phase 4 마이그레이션 + 백엔드 구축 후엔 화면 재개발 없이 그대로 사용 가능합니다.

- **저장소**: 모든 데이터가 **브라우저 localStorage** 에 저장 (axios-mock-adapter 패턴)
- **백엔드**: `src/api/mockBackend.ts` + `src/api/mockBackendV2.ts` 가 axios 어댑터로 모든 요청을 가로채서 응답
- **얼굴인식**: 시연용 deterministic 매칭 (실제 얼굴 매칭 X)

---

## 3. 주요 사용자 역할

| 역할 | 영문 | 권한 |
|---|---|---|
| 본사 관리자 | OWNER | 모든 현장·회사 데이터 접근. 마감 확정·역방향 전이(REOPEN) 권한 |
| 현장담당자(소장) | MANAGER (SITE) | 본인 배정 현장만 접근. 일일 출역확정·노무비 마감 진행 |
| 반장 | FOREMAN | 본인 관리 근로자만. 출퇴근 수동 처리·일일 확정 |
| 본사 매니저 | MANAGER (HQ) | 본사 직속 — 본사가 직접 관리하는 현장 |
| 근로자 (워커) | WORKER | 키오스크·모바일 앱 (관리자 웹 X) — 얼굴 출근/퇴근만 |
| 공무담당자 | STAFF | 사무실 등록 모드 — 신규 워커 입력 보조 |

권한은 `src/contexts/AuthContext` 와 `useAuth()` 훅으로 관리.

---

## 4. 주요 화면 목록

| 라우트 | 페이지 | 설명 |
|---|---|---|
| `/` | DashboardPage | 본사 대시보드 — 오늘 출역·노무비·마감 진행 |
| `/login`, `/signup` | LoginPage, SignupRouter | 인증·회원가입 |
| `/team` | TeamListPage | 근로자 목록·등록·수정 |
| `/foremen` | ForemanPage | 반장 관리 |
| `/site` | SiteListPage | 현장 등록·관리 |
| `/attendance`, `/auth-mgmt`, `/daily-confirm` | AttendancePage | 인증관리 + 일일 출역확정 + 월간 내역 (탭) |
| `/gongsu-close` | GongsuClosePage | 월 공수마감 |
| `/wage`, `/wage-close` | WagePage (wage 탭) | 노무비 정산 |
| `/wage-pay` | WagePayPage | 노무비 지급 |
| `/tax` | TaxManagementPage | 세금 관리 |
| `/insurance` | OutputCenterPage (INSURANCE 탭) | 4대보험 신고 |
| `/severance` | WagePage (severance 탭) | 퇴직공제 + 전자카드 비교 |
| `/safety` | SafetyPage | 안전관리 (12종 카테고리) |
| `/output` | OutputCenterPage | 출력센터 (양식·신고서) |
| `/reports` | ReportsPage | 통계·리포트 |
| `/settings` | SettingsPage | 출퇴근시간·세율·계정·회사 정보·퇴직공제부금 일액 |

---

## 5. 주요 데이터 흐름

### 5-1. 단순화 다이어그램

```
사용자
  │
  ▼
React 페이지 컴포넌트  ────►  axios apiClient  ────►  mockBackend(어댑터)
                                                          │
                                                          ▼
                                                      localStorage
                                                          │
                                                          ▼
                                                    seed/bucket 데이터
```

### 5-2. 핵심 원칙 (이번 재구조화 결과)

1. **컴포넌트는 localStorage 를 직접 알지 못함** (점진적 마이그레이션 중 — 일부 UI state 는 예외)
2. **모든 도메인 데이터는 api 계층 경유** — `*Api` 모듈만 사용
3. **API 응답 shape = 실서버 응답 shape** — 백엔드 추가 시 코드 변경 불필요
4. **`VITE_USE_MOCK=true/false` 로 mock ↔ 실서버 토글** — 환경변수만 변경

### 5-3. 도메인 모델

```
Worker (워커 마스터, 1명당 1행)
  └─ workerCode (M-26-NNNNN), 신분증, 계좌, 얼굴 템플릿, 트러스트 티어
       │
       │ N:1 via Employment
       ▼
Employment (채용 관계)
  └─ workerId, siteCompanyId, trade, dailyWage, paymentAccountType, status
       │
       │ N:1 via siteCompanyId
       ▼
SiteCompany (현장 × 회사 페어)
  └─ siteId, companyId, role (PRIME/SUB/HQ), contractAmount
       │
       │  ↓ 1:N
       ▼
Site / Company
```

**중요**: 모든 출퇴근·임금·보험·세금 데이터는 **employmentId 기준** 으로 연결 (memberId 아님).

---

## 6. 출퇴근 처리 흐름

### 6-1. 얼굴인식 출근 (서버-권위)

```
근로자가 키오스크에서 얼굴 스캔
  │
  ▼
[키오스크 앱] 얼굴 이미지 + 위치 + 기기정보 업로드
  │
  ▼
POST /v2/attendance/face-checkin
  body: { siteId, faceImageId, location: {lat,lng,accuracy}, device: {kind, deviceId, appVersion}, clientTime }
  │
  ▼
[서버] 
  1. 얼굴 매칭 (워커 풀에서 best match) → matchScore
  2. 생체검증 (liveness) → PASSED/FAILED/SKIPPED
  3. 지오펜스 (현장 좌표와 거리) → INSIDE/OUTSIDE/NO_LOCATION/LOW_ACCURACY
  4. 중복 출근 체크
  5. 마감 상태 체크 (CLOSED 면 거부)
  │
  ├─ 모두 통과 → AttendanceRecord 생성 → response: { status:'OK', record }
  ├─ 거부 → response: { status:'REJECTED', reason: 'NO_FACE_MATCH'|'LIVENESS_FAILED'|'OUTSIDE_GEOFENCE'|... }
  └─ 보류 → response: { status:'PENDING_REVIEW', recordId, reason }
```

**프런트는 memberId / matchScore / liveness 결과를 직접 결정하지 않음** — 모두 서버가 판정.

### 6-2. 수동 출퇴근

```
관리자(반장/현장담당자)가 「+ 출역 추가」 클릭
  │
  ▼
POST /v2/attendance/manual-check
  body: { employmentId, action:'CHECK_IN'|'CHECK_OUT', date, at?, reason (5자 이상) }
  │
  ▼
[서버] AttendanceRecord 생성/수정 + AuditLog 자동 기록
  ├─ checkInMethod: 'MANUAL'
  ├─ manualReason, manualEntryRole, manualEntryByName 기록
  └─ AuditLog: type='MANUAL_CHECKIN', before, after, reason, performedBy
```

### 6-3. 공수 변경

```
관리자가 공수 직접 입력
  │
  ▼
POST /v2/attendance/set-gongsu { attendanceId, toGongsu, toPay?, reason }
  │
  ▼
[서버] gongsu/payAmount 갱신 + manualPayHistory 에 push + AuditLog type='GONGSU_CHANGE'
```

---

## 7. 얼굴인식 앱 연동 예상 흐름

### 7-1. 인프라

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ 키오스크 앱   │     │ 반장 모바일  │     │ 사무실 태블릿 │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                     │
       └────────────┬───────┴────────┬────────────┘
                    │                │
              얼굴 이미지         이벤트 알림
              + 위치 + 기기
                    ▼
            ┌────────────────────────┐
            │  bodapass API 서버      │
            │  ────────────────────  │
            │  1. 얼굴 임베딩 매칭    │  ← InsightFace / AWS Rekognition / Naver CLOVA
            │  2. 생체검증 (liveness) │
            │  3. 지오펜스 판정       │
            │  4. AttendanceRecord 생성 │
            └────────┬───────────────┘
                     │
                     ▼
            ┌──────────────────┐
            │  관리자 웹       │
            │ (bodapass_admin) │  ← 본 코드
            └──────────────────┘
```

### 7-2. 보안·개인정보

- 얼굴 이미지는 **암호화 후 S3** 저장 — 1년 후 Glacier 이관
- 워커 얼굴 임베딩은 **Redis 캐싱** — 매 매칭 시 DB 조회 회피
- 얼굴 데이터 수집/저장에 대한 동의는 **전자동의서 PART 2 「얼굴 등 생체정보 처리 동의」** 로 별도 받음

### 7-3. 거부 케이스 처리

거부된 출근(`REJECTED`)도 시도 자체는 로그로 남김 — 부정 출근 시도 감지·감사용:
- `NO_FACE_MATCH` — 미등록 워커가 시도
- `LIVENESS_FAILED` — 사진/영상으로 시도
- `OUTSIDE_GEOFENCE` — 다른 곳에서 시도
- `DUPLICATE_CHECKIN` — 중복 출근

---

## 8. 월마감 / 노임 / 보험 / 퇴직공제 처리 흐름

### 8-1. 마감 상태 머신

```
OPEN
  │ ← 작업 진행 중
  ▼
FOREMAN_CONFIRMED   ← 반장이 일일확정 마침
  │
  ▼
SITE_CONFIRMED      ← 현장담당자 확인 (이 단계부터 수정엔 REOPEN 필요)
  │
  ▼
HQ_REVIEWED         ← 본사 검토
  │
  ▼
WAGE_CONFIRMED      ← 노무비 마감 (지급 직전)
  │
  ▼
PAID                ← 지급 완료
  │
  ▼
INSURANCE_REPORTED  ← 4대보험 신고 완료
  │
  ▼
CLOSED              ← 월말 정산 종결
```

각 전이는:
- **정방향**: `POST /v2/close-status/advance { scope, siteId, yearMonth, toStage }` — 권한자만
- **역방향(REOPEN)**: `POST /v2/close-status/reopen` — **사유 5자 이상 필수** + AuditLog 자동 기록

모든 전이가 `bodapass_admin:close_status_v2` 키에 history 누적.

### 8-2. 노무비 계산

```
출퇴근 단건 (AttendanceRecord)
  ├─ checkInAt ~ checkOutAt → workedMinutes
  ├─ workedMinutes → gongsu (8시간 = 1.0, 0.5 단위)
  └─ gongsu × dailyWage = payAmount
       │
       ▼
월 단위 합계 (WageMonthSummary)
  ├─ baseAmount = Σ payAmount
  ├─ deductionPension/Health/Employment/Accident (4대보험 근로자분)
  ├─ deductionIncomeTax (일용직 6%)
  ├─ deductionLocalTax (소득세의 10%)
  └─ netAmount = baseAmount − deductionTotal
```

비과세 소득(`Employment.nontaxable`) 항목 — 식대 20만원 / 자가운전 20만원 / 출장비·출산보육 등 — 은 보험료·소득세 산정 기준에서 제외.

### 8-3. 4대보험 처리

자격 사이클 8일룰 (`src/utils/insuranceCycle.ts`):
- 한 달 8일 이상 근무 시 자격취득
- 이탈 시 자격상실
- 두루누리 지원 자동 판별 (10명 미만 + 월 270만원 미만 → 신규가입자 80%; 기존가입자 40% 는 legacy 옵션으로 분리)
- 보험관계 성립신고 (14일 이내)
- 자격취득/상실 신고 (8일룰)
- 확정·개산 보험료 신고 (건설업 자진신고 사업장 — 익년 3월 31일)

### 8-4. 퇴직금 / 퇴직공제

**일용근로자는 매월 적립 개념 없음**. 계속근로 기간으로 분기:

```
계속근로 < 1년
  └─ 사업주가 건설근로자공제회에 퇴직공제부금 납부 (출역일 × 적용 부금일액)
       │  · 자동 적용: 입찰공고일/도급계약일 기준 6,500원 또는 8,700원
       │  · 수동 선택: 6,500원 / 8,700원 / 직접 입력 가능
       │  · 기준일 미입력 시 8,700원 가정 + warning 표시
       │ (1년 도래)
       ▼
계속근로 ≥ 1년
  └─ 공제회 신고 중단 + 법정퇴직금 적용
       └─ (1일 평균임금 × 30일) × (총계속근로일수 ÷ 365)
```

산식·분류 헬퍼는 `src/utils/severance.ts` (resolveSeveranceFundDaily, calculateSeveranceFund) 에 통일.

**현 단계 (Phase L/M/N/O — 실전 계산 엔진 이식 진행 중)**
- 보다패스는 운영형 계산 엔진을 mock 환경에 이식하는 단계입니다.
- 화면의 모든 노임·세금·보험·퇴직공제 금액은 **「예상값」** 이며 신고용 확정값이 아닙니다.
- 실제 DB/API 연결 전까지는 「실무 검증용」 으로만 사용합니다.
- `confidence: 'OFFICIAL'` 정책만 신뢰하고, `'ASSUMED'/'DEMO'` 는 사업장별 확인이 필요합니다.

### 8-5. 건설근로자공제회 전자카드 비교

`퇴직공제` 페이지 하단에 임베드된 `ElectronicCardCompare` 컴포넌트:
- 공제회 / 김반장 시스템에서 다운로드한 전자카드 태그 이력 .xlsx 업로드
- 우리 시스템의 얼굴인식 출역과 5가지로 분류: OK / 시각차이(>30분) / 카드만 / 얼굴만 / 미등록
- 비교 결과 .xlsx 다운로드 (요약 + 상세 2시트)

---

## 9. localStorage 사용 부분

### 9-1. mockBackend 가 관리하는 도메인 데이터 (실서버 전환 시 제거)

| 키 | 용도 |
|---|---|
| `ilgampack_admin:mockdb` | 메인 DB (Workers, Sites, Companies, Foremen, Safety) |
| `ilgampack_admin:mockdb:version` | SEED_VERSION (캐시 무효화 키) |
| `att:{siteId}:{YYYY-MM}` | 월별 출퇴근 버킷 (lazy seedAttendance) |
| `bodapass_admin:close_status_v2` | 마감 상태 머신 (DAY/MONTH 별 history) |
| `bodapass_admin:audit_log_v2` | 감사 로그 누적 |
| `bodapass_admin:severance_fund_daily` | 퇴직공제부금 일액 (legacy 단일값 캐시 — 기본 8,700원) |
| `bodapass_admin:severance_fund_setting` | 퇴직공제부금 일액 적용 방식 (AUTO_BY_SITE_DATE / FORCE_6500 / FORCE_8700 / CUSTOM + customAmount). 우선순위: Site.severanceFundMode override > 본 전역 setting > 자동 정책 |
| `bodapass_admin:wage_ledger_archive` | 노임대장 발행 이력 |

### 9-2. 인증 (실서버 전환 시 그대로 사용 — JWT 토큰 저장)

| 키 | 용도 |
|---|---|
| `ilgampack_admin:user` | 현재 로그인 사용자 정보 |
| `ilgampack_admin:accessToken` | JWT access token |
| `ilgampack_admin:refreshToken` | JWT refresh token |

### 9-3. UI 상태 (그대로 유지 OK)

| 키 | 용도 |
|---|---|
| `att.tab` | 출퇴근현황 페이지의 마지막 탭 (`auth`/`daily`) |
| `dash.opsView` | 대시보드 「현장별 운영 현황」의 view 모드 (`table`/`card`) |
| `bodapass.daily.handled` | 일일확정 페이지의 「처리 완료」 사용자 표시 |
| `bodapass.auth.handled` | 인증관리의 처리 완료 표시 |

### 9-4. 페이지가 직접 호출하는 localStorage (Phase 4 마이그레이션 대상)

다음 키들은 현재 컴포넌트가 직접 read/write 하고 있어 — 향후 API 로 옮겨야 함:

```
ilgampack_admin:accounts        → accountApi
ilgampack_admin:board           → boardApi (현장 게시판)
ilgampack_admin:foremanStatus   → foremanApi
ilgampack_admin:taxRates        → taxApi
ilgampack_admin:shifts          → shiftApi
ilgampack_admin:company         → companyApi (이미 일부 마이그레이션됨)
ilgampack_admin:safety_settings → safetyApi
```

---

## 10. 실제 서버 연결 시 교체해야 할 부분

### 10-1. 환경변수만 변경 — 최소 작업

```bash
# .env.production
VITE_API_BASE_URL=https://api.bodapass.com
VITE_USE_MOCK=false
```

### 10-2. mockBackend 제거 (선택)

```bash
rm src/api/mockBackend.ts
rm src/api/mockBackendV2.ts
# main.tsx 의 setupMockBackend() 호출은 환경변수로 자동 비활성화됨
```

### 10-3. 실서버가 보장해야 할 API endpoint

| 메소드 | 경로 | 응답 shape |
|---|---|---|
| GET | `/v2/workers` | `ListWorkersResponse` |
| GET | `/v2/workers/:id` | `Worker` |
| GET | `/v2/workers/:id/sensitive` | `WorkerSensitiveInfo` (권한자만) |
| POST | `/v2/workers` | `RegisterWorkerResponse` |
| PATCH | `/v2/workers/:id` | `UpdateWorkerResponse` |
| POST | `/v2/workers/:id/face` | `Worker` |
| GET | `/v2/companies`, `/v2/companies/:id` | `ListCompaniesResponse`, `Company` |
| POST | `/v2/companies` | `Company` |
| PATCH | `/v2/companies/:id` | `Company` |
| GET | `/v2/site-companies`, `/v2/site-companies/:id` | `ListSiteCompaniesResponse`, `SiteCompany` |
| POST | `/v2/site-companies` | `SiteCompany` |
| POST | `/v2/site-companies/:id/terminate` | `SiteCompany` |
| GET | `/v2/employments`, `/v2/employments/views`, `/v2/employments/:id` | `ListEmploymentsResponse`, `ListEmploymentViewsResponse`, `EmploymentView` |
| POST | `/v2/employments` | `Employment` |
| PATCH | `/v2/employments/:id` | `Employment` |
| POST | `/v2/employments/:id/terminate` | `Employment` |
| GET | `/v2/attendance/month?siteId=X&yearMonth=YYYY-MM` | `AttendanceMonth` |
| GET | `/v2/attendance/today?siteId=X` | `TodayAttendance` |
| POST | `/v2/attendance/face-checkin` | `FaceCheckResponse` |
| POST | `/v2/attendance/face-checkout` | `FaceCheckResponse` |
| POST | `/v2/attendance/manual-check` | `ManualCheckResponse` |
| POST | `/v2/attendance/set-gongsu` | `SetGongsuResponse` |
| POST | `/v2/attendance/bulk-check-out` | `BulkCheckOutResponse` |
| GET | `/v2/close-status?scope=X&siteId=Y&...` | `CloseStatusEntry` |
| POST | `/v2/close-status/advance` | `CloseStageTransitionResponse` |
| POST | `/v2/close-status/reopen` | `CloseStageTransitionResponse` |
| GET | `/v2/close-status/bulk?yearMonth=YYYY-MM` | `[{siteId, stage}]` |
| GET | `/v2/audit-log?siteId=X&...`, `/v2/audit-log/:id` | `ListAuditLogResponse`, `AuditLogEntry` |

모든 shape 의 단일 출처: `src/api/*.types.ts`. 실서버 개발자에게 이 파일들을 OpenAPI/JSON-Schema 로 export 해서 전달하면 됨.

---

## 11. 아직 미완성인 부분

### 11-1. Phase 4 마이그레이션 (대규모)

- **TeamMember 폐기** — 109곳에서 사용 중 (`@deprecated` 마킹만 완료)
- **컴포넌트가 직접 localStorage 호출** — 30+ 곳, API 계층으로 이동 필요
- **memberId → employmentId 외래키 교체** — 모든 페이지가 아직 memberId 사용

상세 마이그레이션 가이드: `bodapass_데이터흐름/05_Phase4_마이그레이션_가이드.md` (별도 폴더)

### 11-2. 백엔드 미구현 영역

다음 도메인은 V2 라우트가 아직 없음 (필요 시 추가):
- 임금 지급 트랜잭션 (`POST /wage/pay`)
- 4대보험 신고서 자동 생성 (`POST /insurance/file`)
- 노임대장 발행 (`POST /wage/ledger`)
- 카카오톡 알림톡 발송 (`POST /notifications/kakao`)
- 안전관리 SMS 일괄 발송 (`POST /safety/broadcast`)

현재는 mockBackend 가 단순 응답만 시뮬레이션.

### 11-3. 얼굴인식 백엔드 미구축

- `faceImageId` 업로드 endpoint 미구현 (현재 시연에선 클라이언트가 임의 ID 전송)
- 워커별 얼굴 임베딩 저장소 X
- 라이브니스 검증 모델 X
- 지오펜스 계산은 클라이언트 좌표 보고를 그대로 신뢰 (실서버에선 위변조 방지 필요)

### 11-4. 권한·역할 검증

- 현재 권한 체크는 프런트 (`useAuth().viewMode`) 만
- 실서버에선 JWT claim + 백엔드 RBAC 미들웨어로 이중 검증 필요
- API 라우트 가드 미구현

---

---

## xlsx 보안 정책 (Phase S5 + BB4 + GG3 강화)

현재 보다패스는 xlsx 라이브러리를 브라우저에서 직접 사용해 사용자 업로드 파일을 파싱한다.
xlsx-js 라이브러리에는 알려진 **HIGH 등급 advisory** 가 있다.

### Advisory IDs (재확인 2026-05-13, `npm audit --json`)

| Advisory ID | Severity | Title | URL |
|---|---|---|---|
| GHSA-4r6h-8v6p-xvw6 | **HIGH** | Prototype Pollution in sheetJS | https://github.com/advisories/GHSA-4r6h-8v6p-xvw6 |
| GHSA-5pgg-2g8v-p4x9 | **HIGH** | SheetJS Regular Expression Denial of Service (ReDoS) | https://github.com/advisories/GHSA-5pgg-2g8v-p4x9 |

- `xlsx@0.18.5` (npm 공개 배포 최신 버전) 기준 — 2026-05-13 현재 npm registry 에 패치 버전 미배포
- `npm audit fix` 로 해결되지 않음 (breaking change required — `xlsx@latest` 는 CDN 만 배포)
- npm audit 전체 요약: HIGH 1, MODERATE 5 (vitest/vite/esbuild 개발의존성)

### 적용된 완화 조치 (현재)
1. **동적 import** (`vendor-xlsx` 청크 분리) — 미사용 페이지에 로드되지 않음 (Phase O / J1)
2. **화면 경고** — "목업/시연용" 라벨로 사용자에게 알림 (Phase T8, S5)
3. **파일 크기 제한 10MB** — `if (file.size > 10 * 1024 * 1024) reject` (Phase BB4)
   - 적용 위치: `src/pages/AttendancePage.tsx` 노임대장 업로드, `src/pages/TeamListPage.tsx` 멤버 일괄 업로드
4. **신뢰 경로 한정** — 파일 출처는 항상 로그인된 관리자가 직접 선택한 파일에 한함

### 권장 조치 (실서비스 출시 전 필수)
1. **(권장) exceljs 단일화** — `exceljs@^4.4.0` 이 이미 부분 로드되어 있음 (`vendor-exceljs` 청크).
   - 알려진 CVE 없음
   - 노임대장 출력은 이미 exceljs 사용. 입력(파싱) 경로만 마이그레이션 필요
   - 대상 파일: `src/utils/wageLedger.ts`, `src/utils/electronicCard.ts`, `src/utils/severance.ts`
2. **(대안) 서버측 파싱** — 업로드 파일을 서버로 보내고 안전한 라이브러리(예: openpyxl, Apache POI)로 파싱.
   브라우저에서 xlsx import 완전 제거.
3. **(보강) WebAssembly sandbox** — 위 두 옵션이 모두 불가할 경우 isolated worker 에서만 파싱.

### Timeline
- **2026-05-13 (현재)**: 목업·시연용. 완화 조치 1~4 적용. 실서비스 사용 금지.
- **실서비스 출시 전 (필수)**: exceljs 단일화 또는 서버측 파싱 둘 중 하나 완료해야 함.
- **차후 모니터링**: GitHub advisory 모니터링 — sheetjs 측 패치 배포 시 즉시 업그레이드 또는 위 마이그레이션 진행.

자세한 mitigation 계획은 `docs/xlsx-security-mitigation.md` 참고.


## 12. 현재 알고 있는 오류 / 불안한 부분

### 12-1. 보안 리스크

#### 명시된 TODO (코드 안에 주석으로 표시)

- **idNumberRaw / accountNumberRaw 분리** (`worker.types.ts`): 기본 Worker 응답에서 제외, 별도 `WorkerSensitiveInfo` 타입 + `/v2/workers/:id/sensitive` endpoint
- **refreshToken httpOnly Cookie 전환** (`client.ts`): 현재 localStorage 보관, 실서비스에서는 httpOnly Secure SameSite=Strict Cookie 로
- **auditLog append-only DB + 해시 체인** (`mockBackendV2.ts`): 현재 localStorage 라 변조 가능, 실서비스에선 prevHash SHA-256 chain
- **얼굴 이미지 보존 정책** (`docs/face-recognition-integration.md`): 1년 후 백업 → 5년 후 삭제

#### 추가 리스크

| 영역 | 리스크 | 대응 권장 |
|---|---|---|
| 평문 주민번호 (`idNumberRaw`) | DB 평문 저장 | AES-256 암호화, KMS 키 분리 |
| 평문 계좌번호 (`accountNumberRaw`) | DB 평문 저장 | 동일 |
| JWT refresh 로테이션 미구현 | 토큰 탈취 위험 | refresh 1회용 로테이션 |
| CORS 설정 미정 | 임의 도메인 호출 가능 | 화이트리스트 |
| 얼굴 이미지 보존 정책 미정 | 무한 누적 | 1년 후 Glacier·5년 후 삭제 |
| 감사로그 변조 방지 X | 단순 localStorage | append-only DB + 해시 체인 |
| API rate limiting X | DDoS·brute force 취약 | API gateway 단 limit |
| HTTPS 강제 X | MITM | HSTS 헤더 |

### 12-2. 코드 정합성 알려진 잔존 이슈

- 18일 cap 과 「오늘 보장 출근자」 충돌은 v46 에서 수정됨 — 단 데모용 deterministic 출근율이라 실서비스에선 무의미
- `/team` (legacy) 와 `/employments` (V2) 가 같은 데이터의 두 view — 데이터 정합성은 mockBackend 가 자동 동기화하지만, 실서버에선 단일 source 필요
- `localDateStr()` 가 모든 「오늘」 비교에 적용되었지만 — 사용자 PC 시간이 잘못 설정되어 있으면 여전히 영향. 서버 시각 동기화 필요
- TeamMember 의 `siteId` 가 단일 값 — 한 워커가 여러 현장에서 동시 일하는 경우 (현실에서 흔함) 표현 불가. Employment 다대다 구조로만 표현 가능 — 화면이 아직 이걸 활용 안 함

### 12-3. UI/UX 마무리 안 된 곳

- 출퇴근 페이지에서 일부 행이 「확인필요」로 분류되어도 처리 액션 버튼 미연결
- 노무비 명세서 발행 — 카카오톡 발송은 시뮬레이션만, 실제 카카오 비즈니스 API 미연동
- 출력센터의 4대보험 신고서 양식 — 공단 양식 PDF 와 1:1 매칭 미검증
- 안전관리의 SMS 발송 — 시연 alert 만

### 12-4. 시연 데이터의 비현실성

- 출근 시각이 모두 7:00 ± 25분 — 실제로는 6:30~8:30 더 넓게 분포해야 자연스러움
- 모든 워커가 한 회사 (C-001 AKOMA) 소속 — 실제로는 여러 시공사 공존
- 외국인 1명 (Rajesh Kumar) 만 — 실제 현장은 외국인 비율이 30%+
- 얼굴 매칭 점수가 항상 0.85~0.99 — 실제 매칭은 0.50~0.99 분포

---

## 13. 검토자에게 보내는 메모

이 코드는 **시연용** 이지만 구조는 **실서비스 전환 가능 목업** 으로 짜여 있습니다. 검토 시 다음 관점이 가장 유익할 것:

1. **타입 정합성** — `src/api/*.types.ts` 들이 실서버 OpenAPI spec 으로 그대로 export 가능한가? 누락 필드/모호한 union 없는가?
2. **API 전환 가능성** — `VITE_USE_MOCK=false` 로 바꿨을 때 정말 실서버 호출로 깔끔하게 전환되는가? mockBackend 와 v2 라우트의 응답 shape 이 「실서버 응답과 동일」 인지?
3. **얼굴인식 연동 구조** — `FaceCheckRequest` / `FaceCheckResponse` 가 실제 얼굴인식 서비스 (Rekognition, CLOVA Face, InsightFace 등) 와 매핑 가능한가?
4. **건설현장 업무 정합성** — 4대보험 8일룰·두루누리·퇴직공제부금 일액·법정퇴직금 산식·전자카드 비교 등이 실제 법령과 일치하는가?
5. **보안** — 평문 주민번호·계좌번호·얼굴이미지·JWT 처리에서 빠진 보호 장치?

각 영역에 대한 외부 검토 의견이 향후 백엔드 설계 + 실서비스 전환 일정의 핵심 인풋이 됩니다.

---

## 14. 폴더 구조 요약

```
bodapass_admin/
├─ README_REVIEW.md                ← 본 문서
├─ package.json
├─ package-lock.json
├─ tsconfig.json
├─ vite.config.ts
├─ index.html
├─ .env.example
├─ vercel.json
├─ public/                         ← 정적 자원
├─ docs/                           ← 추가 설계 문서 (legacy)
└─ src/
   ├─ main.tsx                     ← React 진입점
   ├─ routes/AppRouter.tsx
   ├─ layouts/                     ← AdminShell, Sidebar
   ├─ contexts/                    ← AuthContext
   ├─ data/                        ← 정적 데이터 (직무범위 등)
   │
   ├─ api/                         ← ★ 본 리뷰의 핵심
   │  ├─ client.ts                 ← axios 인스턴스 + setupMockBackend 트리거
   │  ├─ mockBackend.ts            ← Legacy 라우트 (~140KB)
   │  ├─ mockBackendV2.ts          ← V2 라우트 등록 (Worker/Employment/CloseStatus/AuditLog)
   │  │
   │  ├─ worker.ts / worker.types.ts            ← 워커 마스터
   │  ├─ company.ts / company.types.ts          ← 회사
   │  ├─ siteCompany.ts / siteCompany.types.ts  ← 현장 × 회사
   │  ├─ employment.ts / employment.types.ts    ← 채용 관계 (★ 외래키 주체)
   │  │
   │  ├─ attendanceV2.ts / attendanceV2.types.ts  ← employmentId 기반 출퇴근
   │  ├─ closeStatus.ts / closeStatus.api.ts      ← 마감 상태 머신
   │  ├─ auditLog.ts / auditLog.types.ts          ← 감사 로그
   │  │
   │  ├─ team.ts / team.types.ts                  ← @deprecated (TeamMember legacy)
   │  ├─ attendance.ts / attendance.types.ts      ← Legacy memberId 기반
   │  ├─ site.ts / site.types.ts
   │  ├─ wage.ts / wage.types.ts
   │  ├─ insurance.types.ts
   │  ├─ safety.ts / safety.types.ts
   │  ├─ auth.ts, signup.ts
   │  └─ types.ts
   │
   ├─ utils/                       ← 도메인 로직 헬퍼
   │  ├─ dateLocal.ts              ← ★ 시차 안전 날짜 헬퍼
   │  ├─ severance.ts              ← 퇴직금/공제 분류·산식
   │  ├─ electronicCard.ts         ← 공제회 xlsx 파싱 + 비교
   │  ├─ insuranceDeadlines.ts     ← 4대보험 마감일 D-day
   │  ├─ insuranceCycle.ts         ← 8일룰 자격 사이클
   │  ├─ duruunuri.ts              ← 두루누리 지원 판별
   │  ├─ nontaxable.ts             ← 비과세 한도·합계
   │  ├─ wageLedger.ts             ← 노임대장 빌드/파싱
   │  └─ ... (외 ~15개)
   │
   ├─ hooks/
   ├─ components/                  ← 재사용 UI
   │  ├─ ElectronicCardCompare.tsx ← 전자카드 비교 섹션
   │  ├─ NontaxableSection.tsx
   │  ├─ InsuranceDeadlineAlert.tsx
   │  ├─ DuruunuriiBadge.tsx
   │  └─ ... (MacSelect, Modal, PageHeader 등)
   │
   ├─ pages/                       ← 라우트별 페이지
   └─ styles/                      ← 글로벌 CSS
```

---

**문의/검토 결과는 본 코드 작성자에게 직접 전달 부탁드립니다.**

작성일: 2026-05-12 · 빌드 v46 기준

---

## 15. npm audit 취약점 대응 방향

`npm audit` 실행 시 다음 취약점이 보고됩니다 (2026-05 기준).

### 15-1. xlsx — HIGH

**문제**: `xlsx@0.18.5` 가 Prototype Pollution + ReDoS 취약점 보고 (npm 공식 advisory). 작성 시점 기준 패치 버전 미배포.

**현재 사용처**:
- `src/utils/wageLedger.ts` — 노임대장 .xlsx 파싱
- `src/utils/electronicCard.ts` — 공제회 전자카드 .xlsx 파싱
- `src/utils/severance.ts` 의 비교 결과 .xlsx 다운로드

**대응 방향**:

1. **(권장) 서버측 파싱으로 전환** — 실서비스에서는 프런트가 xlsx 를 파싱하지 않고,
   `POST /v2/attendance/ecard-compare`, `POST /v2/wage/ledger/parse` 같이 서버 endpoint
   호출. 서버는 안전한 라이브러리(예: openpyxl, Apache POI) + 격리 환경에서 처리.
   이 ZIP 의 `electronicCard.ts` 하단에 `ECardCompareRequest/Response` 타입을
   이미 정의해두었음 — 서버 endpoint 구현 시 그대로 사용.

2. **대체 라이브러리 검토**:
   - `exceljs` (이미 dep) — 동일 기능 + 보안 패치 진행 중
   - `sheetjs/ssf` — 양식 작성용만 분리
   - 단일 시트·헤더 고정 양식이면 `papaparse` (CSV) 로 대체

3. **즉시 완화**:
   - xlsx 파싱은 **사용자 본인이 업로드한 파일** 만 처리하도록 보장 (현재 그러함)
   - 업로드 전 파일 크기 제한 (5MB) 및 MIME 타입 검증 추가

### 15-2. Vite / esbuild — MODERATE (dev server)

**문제**: Vite 5.4.10 / esbuild dev server 의 origin 검증 누락. 개발자 PC 의 dev server 가
임의의 출처에서 호출될 수 있음 (rebrowsing 가능성).

**영향**: **개발 환경에서만** — 프로덕션 빌드(`vite build`) 결과물에는 영향 없음.

**대응**:

1. **Vite 5.4.21 이상으로 업그레이드** — `package.json` 에서 `^5.4.10` → `^5.4.21`.
   현재 lockfile 은 이미 5.4.21 로 잡혀있지만 명시적으로 업그레이드 권장.
2. **`vite preview` 사용 자제** — preview server 도 동일 취약점. `npm run build && serve dist` 로 대체.
3. **개발 환경 접근 제한** — `vite.config.ts` 의 `server.host: true` 를 `'localhost'` 로 한정 (현재 외부 노출됨).

### 15-3. 종합 권고

실서비스 전환 전 다음을 반드시 수행:

```bash
# 의존성 업그레이드
npm install vite@latest @vitejs/plugin-react@latest typescript@latest
npm install xlsx@latest exceljs@latest  # 최신 패치 확인

# 취약점 재검사
npm audit
npm audit fix  # 자동 수정 가능한 것
```

남는 high/critical 은 위 15-1·15-2 방식으로 mitigate.


---

## 16. Phase Z2 — 민감정보 접근 감사로그 (서버 저장)

### 16-1. 정책

평문 주민번호 / 계좌번호 조회는 **모든 호출이 서버 audit 에 기록** 된다.

| 항목 | 값 |
| --- | --- |
| Endpoint | `POST /v2/audit/sensitive-access` (audit), `GET /v2/workers/:id/sensitive` (데이터) |
| 호출 순서 | (1) audit 먼저 → (2) 평문 조회 |
| audit 실패 시 | `console.warn` 후 계속 (권한 차단은 실 서버 책임) |
| 저장 키 | `db.sensitiveAccessLogs[]` (목업), 실서비스는 별도 audit DB |
| 보존 기간 | 영구 (시연용 localStorage), 운영형 ≥ 5년 권고 |

### 16-2. 기록 필드

```ts
{
  id: 'AUD-SENS-…',        // 발급 ID (응답에 포함)
  type: 'SENSITIVE_ACCESS',
  workerId: 'W-…',          // 대상 워커
  reason: string,           // INSURANCE_FILING_EXPORT / WAGE_LEDGER_EXPORT 등
  targetMonth: 'YYYY-MM',   // 사용 대상 월
  siteId: string | null,    // 현장 ID
  accessedBy: string,       // 호출 user id
  accessedByName: string,   // 호출 user 이름
  at: ISO timestamp,        // 호출 시각
}
```

### 16-3. 실서비스 보강 항목

1. **rate-limit** — 동일 user 시간당 N 건 초과 시 차단 (현재 미적용).
2. **권한 체크** — OWNER + 노임대장 발행자만 (현재 mockBackend 는 무검사).
3. **응답 발급 ID 표시** — 화면에 "이번 다운로드 ID: AUD-SENS-…" 노출.
4. **이상 패턴 알림** — 일정 기간 내 다수 조회 시 관리자 푸시.

### 16-4. 호출 위치

`workerApi.getSensitive(workerId, { reason, targetMonth, siteId })` — 이 1개 진입점에만 audit 가 자동 첨부된다.
화면에서 `idNumberRaw` 직접 접근 금지 (Phase J6 정책 그대로).

## Phase BB5 — Vitest + React Testing Library 인프라 (옵션)

기존 `npm test` (tsx 도메인 verifier) 는 그대로 유지.
별도로 `npm run test:ui` 스크립트가 추가됨 — Vitest + React Testing Library 기반.

**현재 상태**:
- `package.json` devDependencies 에 vitest 등 5개 추가 (lockfile 미동기화)
- `vitest.config.ts` + `vitest.setup.ts` 작성
- 테스트 파일 패턴: `src/**/*.vtest.{ts,tsx}` (기존 `*.test.ts` verifier 와 충돌 방지)
- `tsconfig.json` exclude: `*.vtest.ts(x)` — tsc 미검증 (vitest 가 자체 검증)
- 샘플 테스트 2개:
  - `src/pages/wage/components/SeveranceHero.vtest.tsx` — RTL 렌더 테스트
  - `src/utils/wageReportValidator.vtest.ts` — 순수 함수 vitest 변환

**실행 가이드**:
```
npm install      # 신규 devDependencies 다운로드 + lockfile 동기화
npm run test:ui  # vitest 실행
```

`npm install` 전에는 vitest 가 로컬에 없어 `test:ui` 가 실패한다.
도메인 검증은 그대로 `npm test` 로 71+개 케이스가 PASS 한다.

---

## 17. 배포 운영 체크리스트 (Phase HH 신규)

CI/Vercel 배포, 백엔드 전환, 얼굴인식 연동, 인증 보안 강화 등 **실서비스 출시 전 운영 가이드**는 별도 문서로 정리되어 있습니다.

→ **[`docs/deployment-checklist.md`](docs/deployment-checklist.md)**

### 10개 핵심 항목 요약

1. **CI 단계 분리** — `ci:check` 한 줄 대신 각 단계를 분리 실행 (timeout 방지)
2. **`build` 스크립트** — `vite build` 단독 유지, `tsc -b` 와 묶지 않음
3. **xlsx 보안 취약점** — 단기/중기/장기 mitigation 로드맵, 실서비스 출시 전 중기까지 필수
4. **백엔드 전환** — DB 테이블 12개 (attendance_records, wage_ledgers, daily_tax_rows, daily_attendance_rows, sensitive_access_logs, close_statuses, audit_logs, workers, employments, sites, legal_policies, work_rules)
5. **얼굴인식 연동** — 서버 권한 구조 유지 (앱은 매칭/라이브니스/지오펜스 결정 X)
6. **refreshToken** — localStorage → httpOnly Secure SameSite=Strict Cookie 전환
7. **정기 점검** — 주/월/분기/년 단위 audit + 정책 갱신
8. **출시 전 최종 체크리스트** — 15개 항목 (백엔드/얼굴인식/인증/HTTPS/법무/모니터링/베타)
9. **참고 문서 목록** — 11개 docs/*.md
10. **핵심 선언** — 현재 단계 도달점 + 남은 작업 명시

### Vercel 배포 권장 설정

```
Build Command:    npm run build
Install Command:  npm ci
Output Directory: dist
Node.js Version:  18.x 또는 20.x
```

### CI 권장 단계 분리

```bash
npm ci                # 의존성 설치
npm test              # 도메인 verifier 72 케이스
npm run test:ui       # Vitest + RTL 24 케이스
npm run typecheck     # tsc -b
npm run build         # vite build (~9s)
```

`npm run ci:check` 는 로컬용 빠른 일괄 검증. **CI/Vercel 에서는 단계를 분리**하여 timeout 위험 회피.


