# 민감정보 접근 감사 로그 — 실서버 DB 설계 (Phase BB3)

> 목적: 평문 주민번호·계좌번호 등 민감정보가 조회/사용될 때마다 누가/언제/왜를 영구 기록하는 운영 DB 스키마와 API 계약을 정의한다.

## 1. 목적

- 개인정보보호법 제29조 (안전조치) — 접근권한자/접근일시/처리내역 보존
- 사고 발생 시 누가 어떤 민감정보를 언제 조회했는지 역추적 (forensics)
- RBAC 보강 — OWNER/MANAGER 외 권한에서 평문 조회 시도 차단 + 자체도 로그
- 정기 감사 — 비정상 접근 패턴 (대량 다운로드/심야 접근) 탐지

## 2. DB 스키마 (PostgreSQL 기준)

```sql
CREATE TABLE sensitive_access_logs (
  id BIGSERIAL PRIMARY KEY,
  worker_id VARCHAR(50) NOT NULL,                 -- 조회 대상 근로자
  accessed_by_user_id VARCHAR(50) NOT NULL,       -- 조회자 (operator id)
  accessed_by_name VARCHAR(100),
  accessed_by_role VARCHAR(50),                   -- OWNER / MANAGER / ACCOUNTANT 등
  reason VARCHAR(100) NOT NULL,                   -- INSURANCE_FILING_EXPORT / WAGE_LEDGER_PRINT / NTS_DAILY_REPORT 등
  target_month VARCHAR(7),                        -- YYYY-MM (월별 신고/출력 컨텍스트)
  site_id VARCHAR(50),
  access_at TIMESTAMP NOT NULL DEFAULT NOW(),
  ip_address VARCHAR(45),                         -- IPv4/IPv6
  user_agent TEXT,
  request_id VARCHAR(50),                         -- 클라이언트 발급 trace id
  fields TEXT,                                    -- 조회한 필드 목록 (rrn, accountNumber, ...) JSON
  result_status VARCHAR(20) NOT NULL DEFAULT 'OK', -- OK / DENIED / ERROR
  result_message TEXT
);

CREATE INDEX idx_worker_at ON sensitive_access_logs (worker_id, access_at DESC);
CREATE INDEX idx_accessor_at ON sensitive_access_logs (accessed_by_user_id, access_at DESC);
CREATE INDEX idx_month ON sensitive_access_logs (target_month);
CREATE INDEX idx_reason ON sensitive_access_logs (reason, access_at DESC);
```

## 3. API 계약

### POST /v2/audit/sensitive-access

- 클라이언트가 평문 민감정보를 받은 직후 호출 (또는 서버가 자동 발행)
- Body:
  ```json
  {
    "workerId": "W-0001",
    "reason": "INSURANCE_FILING_EXPORT",
    "targetMonth": "2026-05",
    "siteId": "S-001",
    "fields": ["rrn"],
    "requestId": "req-abc123"
  }
  ```
- accessedBy* / ipAddress / userAgent 는 서버가 세션·요청 컨텍스트에서 자동 채움

### GET /v2/audit/sensitive-access

- Query: `workerId` / `accessorId` / `from` / `to` / `reason` / `targetMonth` / `siteId` / `limit` / `offset`
- OWNER/MANAGER 만 호출 가능 (조회 자체도 audit)

## 4. 보존 기간

- **5년** — 개인정보보호법 (3년) + 세법 일용근로소득 신고 자료 보존 (5년) 중 긴 쪽 기준
- 5년 경과 시 별도 archive 테이블로 이관 후 운영 DB에서 삭제 (cron job)

## 5. RBAC 정책

| Role | sensitive-access 조회 | 평문 민감정보 조회 |
|------|----------------------|---------------------|
| OWNER | O | O |
| MANAGER | O | O |
| ACCOUNTANT | X | 조건부 (출력/신고 컨텍스트에서만) |
| STAFF | X | X |

- 평문 조회 시 자동으로 `result_status=OK` 로그 발행
- 권한 없는 시도는 `result_status=DENIED` 로그 발행 후 401/403 반환

## 6. 정기 점검

- **월 1회 비정상 접근 감사** (자동 리포트):
  - 단일 accessor 가 1시간 내 50건 이상 평문 조회
  - 심야 (00:00 ~ 06:00) 접근
  - 동일 worker_id 를 5명 이상의 accessor 가 1주일 내 조회
- 감사 결과 → OWNER 메일 + 대시보드 카드

## 7. mock backend 와의 차이

| 구분 | 현재 mock | 실서버 (목표) |
|------|-----------|---------------|
| 저장 | `localStorage` (`bodapass.audit.sensitiveAccess.v1`) | PostgreSQL `sensitive_access_logs` |
| 보존 | 브라우저 cleared 시 소실 | 5년 + archive |
| 인증 | mock session | OAuth2/SAML + RBAC |
| 검색 | 클라이언트 메모리 필터 | DB index 기반 server-side query |
| 비정상 탐지 | 없음 | 월 cron + alerting (ELK + Grafana) |
| 동시성 | single tab only | DB transaction + connection pool |
| 백업 | 없음 | PostgreSQL WAL archiving + S3 snapshot daily |

## 8. 이관 가이드

1. `src/api/sensitiveAccessAudit.ts` 클라이언트 모듈은 그대로 두고 endpoint 만 mock → 실 API 로 교체
2. mock 의 localStorage 로그는 1회성 export 후 폐기 (운영 데이터 아님)
3. UI (감사로그 페이지) 는 API 계약 동일하므로 무수정
4. 신규 RBAC 미들웨어 추가 — accessor role 검증 + 자체 audit 로그
