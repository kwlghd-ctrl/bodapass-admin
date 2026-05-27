# 목업 → 실제 DB 마이그레이션 계획

> 현재 보다패스는 localStorage + mockBackend 기반 목업으로 동작.
> 향후 실제 DB(PostgreSQL/Oracle) 와 API 서버로 전환할 때의 단계별 계획.

본 문서는 **「DB 전환 직전」 의 준비 상태** 를 정의. 코드는 이미 V2 도메인 구조로 분리돼 있어 DB 스키마 매핑이 단순함.

---

## 0. 전환 원칙

1. **localStorage 키 ↔ DB 테이블** 1:1 매핑 — 데이터 ETL 단순화
2. **API 응답 shape 동일성 보장** — 화면 코드 무수정
3. **`VITE_USE_MOCK` 환경변수 전환** 만으로 실서버 호출 활성화
4. **점진 전환 가능** — 일부 endpoint 만 실서버로 옮기고 나머지는 mock 유지 가능

---

## 1. 현재 localStorage 키 → DB 테이블 매핑

### 1-1. mockBackend 가 관리하는 도메인 데이터

| localStorage 키 | DB 테이블 | 주요 컬럼 | 비고 |
|---|---|---|---|
| `ilgampack_admin:mockdb` | `workers`, `sites`, `companies`, `foremen`, `site_companies`, `employments` | 메인 도메인 객체들 | 단일 JSON 을 6개 테이블로 분해 |
| `ilgampack_admin:mockdb:version` | (불필요) | SEED_VERSION | DB 마이그레이션은 Flyway/Knex 로 관리 |
| `att:{siteId}:{yearMonth}` | `attendance_records` | 출퇴근 단건 | `PRIMARY KEY (employment_id, work_date)` |
| `bodapass_admin:close_status_v2` | `close_statuses` + `close_status_history` | 마감 상태 + 전이 이력 | history 는 별도 테이블로 normalize |
| `bodapass_admin:audit_log_v2` | `audit_logs` | append-only + 해시 체인 | 변조 방지 hash 체인 추가 |
| `bodapass_admin:severance_fund_daily` | `legal_policies` (category=SEVERANCE_FUND_DAILY) | 정책 테이블 row 로 통합 | 사용자 커스텀 값은 별도 row 로 |
| `bodapass_admin:wage_ledger_archive` | `wage_ledgers` + `wage_ledger_rows` | 노임대장 발행 이력 | 시간순 보존 |
| `bodapass_admin:attendance_adjustments_v2` | `attendance_adjustments` | 출퇴근 보정 신청 | 신청·승인 이력 보존 |

### 1-2. 인증 — JWT 토큰

| localStorage 키 | 실서비스 처리 |
|---|---|
| `ilgampack_admin:user` | sessionStorage 또는 in-memory (탭 닫으면 만료) |
| `ilgampack_admin:accessToken` | sessionStorage / in-memory |
| `ilgampack_admin:refreshToken` | **httpOnly Secure Cookie** (XSS 방어) |

### 1-3. UI 상태 (그대로 유지 OK)

| localStorage 키 | 유지 여부 |
|---|---|
| `att.tab` | ✅ 유지 (사용자 마지막 탭) |
| `dash.opsView` | ✅ 유지 (대시보드 뷰 모드) |
| `bodapass.daily.handled` | ⚠ 서버 측으로 흡수 권장 |
| `bodapass.auth.handled` | ⚠ 서버 측으로 흡수 권장 |

### 1-4. 사용자 설정 — DB 또는 사용자별 settings 테이블로

| localStorage 키 | 실서비스 처리 |
|---|---|
| `ilgampack_admin:taxRates` | `tax_rate_settings` 테이블 (사용자/사업장별) |
| `ilgampack_admin:shifts` | `shift_settings` 테이블 |
| `ilgampack_admin:accounts` | `accounts` 테이블 (이미 인증 시스템에 통합) |
| `ilgampack_admin:company` | `companies` 테이블 (도메인 데이터로 통합) |
| `ilgampack_admin:safety_settings` | `safety_settings` 테이블 |
| `ilgampack_admin:board` | `board_posts` 테이블 |
| `ilgampack_admin:foremanStatus` | `foreman_status` 테이블 |

---

## 2. DB 스키마 골격 (PostgreSQL)

### 2-1. 핵심 도메인 테이블

```sql
-- 회사
CREATE TABLE companies (
  id                                       VARCHAR(20) PRIMARY KEY,
  company_code                             VARCHAR(20) UNIQUE,
  name                                     VARCHAR(200) NOT NULL,
  business_number                          VARCHAR(20),
  representative                           VARCHAR(100),
  company_type                             VARCHAR(20),  -- PRIME/SUB/PARTNER/HQ
  employment_insurance_management_no       VARCHAR(50),
  industrial_accident_insurance_management_no VARCHAR(50),
  construction_license_type                VARCHAR(20),  -- GENERAL/SPECIALTY/NONE
  construction_license_no                  VARCHAR(50),
  employee_count                           INT,
  durunuri_eligible                        BOOLEAN,
  is_hq                                    BOOLEAN DEFAULT FALSE,
  created_at                               TIMESTAMP DEFAULT NOW()
);

-- 현장
CREATE TABLE sites (
  id                          VARCHAR(20) PRIMARY KEY,
  name                        VARCHAR(300) NOT NULL,
  bid_notice_date             DATE,
  contract_date               DATE,
  construction_start_date     DATE,
  construction_end_date       DATE,
  completion_date             DATE,
  contract_amount             BIGINT,
  construction_amount         BIGINT,
  construction_type           VARCHAR(30),
  severance_applicable        BOOLEAN DEFAULT TRUE,
  insurance_report_type       VARCHAR(30) DEFAULT 'CONSTRUCTION_SELF',
  geofence_lat                DOUBLE PRECISION,
  geofence_lng                DOUBLE PRECISION,
  geofence_radius_m           INT,
  geofence_gps_tolerance      INT,
  status                      VARCHAR(20),
  owner_company_id            VARCHAR(20) REFERENCES companies(id),
  created_at                  TIMESTAMP DEFAULT NOW()
);

-- 현장 × 회사
CREATE TABLE site_companies (
  id              VARCHAR(40) PRIMARY KEY,
  site_id         VARCHAR(20) REFERENCES sites(id),
  company_id      VARCHAR(20) REFERENCES companies(id),
  role            VARCHAR(20),  -- PRIME/SUB/HQ
  start_date      DATE,
  end_date        DATE,
  contract_amount BIGINT,
  status          VARCHAR(20),
  created_at      TIMESTAMP DEFAULT NOW(),
  UNIQUE (site_id, company_id)
);

-- 워커 마스터
CREATE TABLE workers (
  id                    VARCHAR(40) PRIMARY KEY,
  worker_code           VARCHAR(20) UNIQUE,
  name                  VARCHAR(100) NOT NULL,
  phone                 VARCHAR(20),
  birth_date            DATE,
  gender                CHAR(1),
  nationality           VARCHAR(5),
  resident_type         VARCHAR(20),
  visa_type             VARCHAR(10),
  id_type               INT,
  id_number_masked      VARCHAR(20),
  id_number_encrypted   BYTEA,             -- AES-256 + KMS
  bank_name             VARCHAR(20),
  account_masked        VARCHAR(50),
  account_encrypted     BYTEA,             -- AES-256 + KMS
  face_template_id      VARCHAR(40),
  trust_tier            INT,
  status                VARCHAR(20),
  safety_edu_completed  BOOLEAN,
  -- 검증 단계 (verification.*)
  verification_identity BOOLEAN DEFAULT FALSE,
  verification_face     BOOLEAN DEFAULT FALSE,
  verification_bank     BOOLEAN DEFAULT FALSE,
  verification_privacy  BOOLEAN DEFAULT FALSE,
  verification_contract BOOLEAN DEFAULT FALSE,
  -- 세무 프로필 (taxProfile.*)
  dependents_count           INT,
  children_under6_count      INT,
  nontaxable_items           JSONB,
  -- 보험 프로필 (insuranceProfile.*)
  national_pension_target    BOOLEAN,
  health_insurance_target    BOOLEAN,
  employment_insurance_target BOOLEAN,
  industrial_accident_target BOOLEAN,
  durunuri_candidate         BOOLEAN,
  insurance_history_last_12mo BOOLEAN,
  registered_at              TIMESTAMP DEFAULT NOW()
);

-- 채용 관계
CREATE TABLE employments (
  id                        VARCHAR(40) PRIMARY KEY,
  worker_id                 VARCHAR(40) REFERENCES workers(id),
  site_company_id           VARCHAR(40) REFERENCES site_companies(id),
  foreman_employment_id     VARCHAR(40) REFERENCES employments(id),
  assigned_to_site_manager  BOOLEAN DEFAULT FALSE,
  trade                     VARCHAR(50),
  trade_code                VARCHAR(20),
  job_title                 VARCHAR(50),
  daily_wage                BIGINT,
  wage_type                 VARCHAR(20) DEFAULT 'DAILY',
  standard_work_hours       NUMERIC(4,2) DEFAULT 8,
  payment_account_type      VARCHAR(20),
  start_date                DATE,
  end_date                  DATE,
  work_start_date           DATE,
  work_end_date             DATE,
  contract_status           VARCHAR(20),
  contract_date             DATE,
  contract_no               VARCHAR(50),
  contract_signed           BOOLEAN,
  contract_signed_at        TIMESTAMP,
  status                    VARCHAR(20),
  identity_tier             INT,
  insurance_applied         BOOLEAN DEFAULT TRUE,
  severance_applied         BOOLEAN DEFAULT TRUE,
  tax_applied               BOOLEAN DEFAULT TRUE,
  insurance                 JSONB,
  nontaxable                JSONB,
  created_at                TIMESTAMP DEFAULT NOW(),
  UNIQUE (worker_id, site_company_id)
);

-- 출퇴근
CREATE TABLE attendance_records (
  id                          VARCHAR(60) PRIMARY KEY,
  employment_id               VARCHAR(40) REFERENCES employments(id),
  site_id                     VARCHAR(20) REFERENCES sites(id),
  work_date                   DATE NOT NULL,
  check_in_at                 TIMESTAMPTZ,
  check_out_at                TIMESTAMPTZ,
  check_in_method             VARCHAR(20),
  check_out_method            VARCHAR(20),
  source                      VARCHAR(20),  -- FACE/MANUAL/ECARD
  check_in_score              NUMERIC(4,3),
  check_out_score             NUMERIC(4,3),
  liveness_check_in           VARCHAR(20),
  liveness_check_out          VARCHAR(20),
  liveness_passed             BOOLEAN,
  face_verified               BOOLEAN,
  geofence_result             VARCHAR(20),
  geofence_passed             BOOLEAN,
  distance_from_site_meters   INT,
  location_accuracy_meters    INT,
  status                      VARCHAR(20),
  worked_minutes              INT,
  gongsu                      NUMERIC(3,1),
  daily_wage                  BIGINT,
  daily_wage_snapshot         BIGINT,
  pay_amount                  BIGINT,
  manual_reason               TEXT,
  manual_entry_role           VARCHAR(20),
  manual_entry_by_name        VARCHAR(100),
  UNIQUE (employment_id, work_date)
);
CREATE INDEX idx_attendance_site_date ON attendance_records (site_id, work_date);
CREATE INDEX idx_attendance_employment ON attendance_records (employment_id);

-- 출퇴근 보정 신청
CREATE TABLE attendance_adjustments (
  id                  VARCHAR(40) PRIMARY KEY,
  employment_id       VARCHAR(40) REFERENCES employments(id),
  attendance_date     DATE,
  request_type        VARCHAR(20),
  requested_by        VARCHAR(40),
  requested_by_name   VARCHAR(100),
  reason              TEXT NOT NULL,
  requested_gongsu    NUMERIC(3,1),
  requested_check_out_at TIMESTAMPTZ,
  status              VARCHAR(20) DEFAULT 'REQUESTED',
  approved_by         VARCHAR(40),
  approved_by_name    VARCHAR(100),
  approved_at         TIMESTAMPTZ,
  rejection_reason    TEXT,
  audit_log_id        VARCHAR(40),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- 마감 상태
CREATE TABLE close_statuses (
  scope            VARCHAR(10) NOT NULL,  -- DAY/MONTH
  site_id          VARCHAR(20) REFERENCES sites(id),
  company_id       VARCHAR(20),
  date             DATE,
  year_month       CHAR(7),
  stage            VARCHAR(30) NOT NULL,
  foreman_confirmed_at  TIMESTAMPTZ,
  site_confirmed_at     TIMESTAMPTZ,
  hq_reviewed_at        TIMESTAMPTZ,
  wage_confirmed_at     TIMESTAMPTZ,
  paid_at               TIMESTAMPTZ,
  insurance_reported_at TIMESTAMPTZ,
  closed_at             TIMESTAMPTZ,
  reopened_reason       TEXT,
  PRIMARY KEY (scope, site_id, date, year_month)
);

CREATE TABLE close_status_history (
  id              BIGSERIAL PRIMARY KEY,
  scope           VARCHAR(10),
  site_id         VARCHAR(20),
  date            DATE,
  year_month      CHAR(7),
  stage           VARCHAR(30),
  entered_at      TIMESTAMPTZ DEFAULT NOW(),
  entered_by      VARCHAR(40),
  entered_by_name VARCHAR(100),
  reason          TEXT
);

-- 감사로그 (append-only + 해시 체인)
CREATE TABLE audit_logs (
  id                 VARCHAR(40) PRIMARY KEY,
  type               VARCHAR(40) NOT NULL,
  target_type        VARCHAR(40),
  target_id          VARCHAR(60),
  context            JSONB,
  before_data        JSONB,
  after_data         JSONB,
  reason             TEXT,
  performed_by       VARCHAR(40),
  performed_by_name  VARCHAR(100),
  performed_at       TIMESTAMPTZ DEFAULT NOW(),
  prev_hash          VARCHAR(64),   -- SHA-256 chain
  this_hash          VARCHAR(64)
);
CREATE INDEX idx_audit_target ON audit_logs (target_type, target_id);
CREATE INDEX idx_audit_performed_at ON audit_logs (performed_at);

-- 법정 정책 테이블
CREATE TABLE legal_policies (
  id              VARCHAR(40) PRIMARY KEY,
  category        VARCHAR(40) NOT NULL,
  effective_from  DATE NOT NULL,
  effective_to    DATE,
  value_json      JSONB NOT NULL,
  description     TEXT,
  source_name     VARCHAR(200),
  source_url      TEXT,
  version         VARCHAR(40)
);
CREATE INDEX idx_policy_category_from ON legal_policies (category, effective_from);
```

---

## 3. ETL 스크립트 골격

```javascript
// Node.js + pg + browser localStorage export
// 1) 사용자가 「localStorage 내보내기」 버튼 클릭 → JSON 파일 다운로드
// 2) 백엔드 admin endpoint 가 그 JSON 을 받아 INSERT
//
// 또는 mock 데이터 자체는 다음 절차로 옮긴다:

const mockdb = JSON.parse(localStorage.getItem('ilgampack_admin:mockdb'));

// 회사
for (const c of mockdb.companies) {
  await pg.query(
    'INSERT INTO companies (id, name, business_number, ...) VALUES ($1, $2, $3, ...)',
    [c.id, c.name, c.bizRegNo, ...]
  );
}

// 사이트 (geofence 분해)
for (const s of mockdb.sites) {
  await pg.query(
    `INSERT INTO sites (id, name, bid_notice_date, contract_date, ...,
                        geofence_lat, geofence_lng, geofence_radius_m, geofence_gps_tolerance, ...)
     VALUES ($1, $2, $3, $4, ..., $10, $11, $12, $13, ...)`,
    [s.id, s.name, s.bidNoticeDate, s.contractDate, ...,
     s.geofence?.lat, s.geofence?.lng, s.geofence?.radiusM, s.geofence?.gpsTolerance, ...]
  );
}

// 워커 (verification·taxProfile·insuranceProfile 평탄화)
for (const w of mockdb.members) {  // TeamMember
  await pg.query(
    `INSERT INTO workers (id, worker_code, name, ...,
                          verification_identity, verification_face, verification_bank, ...,
                          children_under6_count, insurance_history_last_12mo, ...)
     VALUES ($1, $2, $3, ..., $20, $21, $22, ..., $30, $31, ...)`,
    [w.id, w.workerCode, w.name, ...,
     /* worker.verification 으로부터 추출 */, ...,
     /* worker.taxProfile.childrenUnder6Count */, ...]
  );
}

// 출퇴근 — att:* 키 전부 순회
const attKeys = Object.keys(localStorage).filter(k => k.startsWith('att:'));
for (const key of attKeys) {
  const bucket = JSON.parse(localStorage.getItem(key));
  for (const rec of Object.values(bucket.records ?? {})) {
    await pg.query(
      'INSERT INTO attendance_records (id, employment_id, site_id, work_date, ...) VALUES (...)',
      [rec.id, 'E-' + rec.memberId, rec.siteId, rec.date, ...]
    );
  }
}
```

---

## 4. 단계별 진행 순서

### Phase A — 백엔드 구축 (별도 프로젝트, 2~3주)

1. PostgreSQL 인스턴스 + 위 DDL 적용
2. Node.js / Spring / Django API 서버 — V2 endpoint 구현
3. 인증 (JWT + httpOnly Cookie)
4. 권한 (RBAC: OWNER/MANAGER/FOREMAN/STAFF)
5. 얼굴인식 모듈 — InsightFace 또는 Rekognition 연동

### Phase B — Phase 4 페이지 마이그레이션 (3~5일)

1. `useEmploymentList()`, `useWorkerSensitive()` 훅 신설
2. TeamListPage → workerApi + employmentApi.listViews
3. AttendancePage → attendanceV2Api
4. GongsuClosePage → closeStatusApi
5. WagePage → memberId 제거, employmentId 기반 집계
6. DashboardPage → V2 listViews + closeStatusApi.bulkBySite

### Phase C — 데이터 ETL (1~2일)

1. 「localStorage 내보내기」 버튼 추가
2. 관리자가 운영 PC 의 mockdb 를 JSON 으로 export
3. 백엔드 `/admin/import-mockdb` endpoint 에 업로드
4. 위 ETL 스크립트로 DB 에 INSERT
5. 검증 — 모든 도메인 row 수 == localStorage 개수

### Phase D — 전환 시점 (반나절)

1. `.env.production` 에 `VITE_USE_MOCK=false`, `VITE_API_BASE_URL=https://api.bodapass.com`
2. Vercel 환경변수 등록
3. 빌드 + 배포
4. mockBackend 코드는 그대로 두되 `setupMockBackend` 가 환경변수로 무력화됨
5. 모니터링 (Sentry/DataDog) 으로 API 호출 정상 확인

### Phase E — Cleanup (1주~)

1. mockBackend.ts / mockBackendV2.ts 삭제
2. TeamMember legacy 타입 삭제
3. 모든 페이지의 V1 attendance API 호출 제거
4. localStorage 키 중 도메인 데이터 자동 삭제 로직 추가 (실서버 데이터와 충돌 방지)

---

## 5. 데이터 검증 체크리스트 (Phase C 후)

- [ ] `SELECT COUNT(*) FROM workers` == `localStorage.mockdb.members.length`
- [ ] `SELECT COUNT(*) FROM sites` == `localStorage.mockdb.sites.length`
- [ ] `SELECT COUNT(*) FROM employments` == `localStorage.mockdb.members.length` (1:1 매핑)
- [ ] `SELECT COUNT(*) FROM attendance_records` == Σ Object.keys(att:* buckets)
- [ ] 모든 worker 의 verification 단계가 마이그레이션됨
- [ ] 모든 site 의 geofence 좌표·반경이 마이그레이션됨
- [ ] AuditLog 의 hash chain 이 모든 row 에 채워져 있음

---

## 6. 롤백 계획

전환 실패 시:
1. Vercel 환경변수 `VITE_USE_MOCK` 을 다시 `true` 로 변경 → 즉시 배포 → 5분 내 복구
2. DB 데이터는 그대로 유지 (다음 재시도 때 재사용)
3. 사용자 PC localStorage 는 영향 없음 (mockBackend 가 그대로 동작)

---

작성: 2026-05-12
