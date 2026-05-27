# 보다패스 배포 운영 체크리스트

> 본 문서는 보다패스 관리자 웹의 CI/CD, 빌드, 보안, 백엔드 전환, 인증 전환에 대한 **운영 권장 사항**을 한 곳에 정리한 가이드입니다.
> 실서비스 전환 전 반드시 검토하세요.

마지막 갱신: 2026-05-13 (Phase HH)

---

## 1. CI / Vercel 단계 분리 — `ci:check` 한 줄 실행 금지

`package.json` 의 `ci:check` 스크립트는 로컬에서 빠른 일괄 검증용입니다.
**Vercel / GitHub Actions 등 운영 CI 에서는 단계를 분리해 실행하세요.**

### 권장 CI 구성

```yaml
# .github/workflows/ci.yml (예시)
jobs:
  verify:
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - run: npm ci                # 의존성 설치
      - run: npm test              # 도메인 verifier (tsx, ~1s)
      - run: npm run test:ui       # Vitest + RTL (~40s)
      - run: npm run typecheck     # tsc -b
      - run: npm run build         # vite build (~9s)
```

### 단계 분리의 이유

- **각 단계의 timeout 을 개별 설정** 가능 — `test:ui` 후 `typecheck` 시 일부 환경에서 timeout 재현됨
- **실패 지점 명확** — 어느 단계에서 실패했는지 즉시 파악
- **병렬 실행** 가능 — test 와 typecheck 는 독립적이므로 matrix job 으로 분산 가능

### Vercel 배포 권장 설정

```
Build Command:    npm run build
Install Command:  npm ci
Output Directory: dist
Node.js Version:  18.x 또는 20.x
```

Vercel 의 빌드 시간 9초 (Phase GG 검증 완료) — timeout 위험 없음.

---

## 2. `build` 스크립트 — vite build 단독 유지

### 현재 정책

```json
{
  "scripts": {
    "build": "vite build",
    "typecheck": "tsc -b",
    "ci:check": "npm run test && npm run test:ui && npm run typecheck && npm run build"
  }
}
```

### 금지 사항

- **`build` 안에 다시 `tsc -b` 묶지 마세요.** Vercel/CI 에서 빌드 시간이 길어지면 timeout 위험.
- typecheck 는 별도 검증 단계로만 실행.

### 이유

- `tsc -b` 는 빌드 산출물에 영향을 주지 않습니다 (검증 전용).
- vite 가 esbuild 로 직접 TS 를 transpile 하므로 `tsc -b` 결과는 빌드 산출물과 무관.
- 빌드와 typecheck 를 분리하면 각자 더 빠르고 명확하게 실행됩니다.

---

## 3. xlsx 보안 취약점 처리 — 단기/중기/장기 로드맵

### 현재 상황 (2026-05-13 기준)

`npm audit` 결과 2건의 HIGH 취약점:
- **GHSA-4r6h-8v6p-xvw6** — SheetJS Prototype Pollution
- **GHSA-5pgg-2g8v-p4x9** — SheetJS ReDoS

`npm audit fix` 로 해결 불가 — NPM registry 에 패치 버전 없음.

### 단기 (현재 적용됨)

- ✅ **동적 import** — xlsx 가 미사용 페이지에 로드되지 않음 (Phase O)
- ✅ **demo warning banner** — 업로드 화면에 「목업/시연용」 노란 배너 (Phase S5)
- ✅ **10MB 크기 제한** — 업로드 시 검증 (Phase BB4)

### 중기

- **exceljs 단일화** — 이미 일부 사용 중. xlsx 의존성을 모두 exceljs 로 교체.
- exceljs 도 CVE 가 있으므로 최신 버전 유지 + `npm audit` 정기 점검.

### 장기

- **서버측 파싱** — 사용자 업로드 xlsx 를 서버 API 로 전송 후 안전한 라이브러리로 파싱.
  - 프런트는 파일 업로드만, 결과만 받음.
- **WebAssembly sandbox** — 클라이언트 측 sandbox 환경에서 파싱 (Cloudflare Worker 등).

### 실서비스 출시 전 필수

**중기 단계까지는 반드시 완료**해야 합니다. 사용자 업로드 파일을 신뢰할 수 없는 라이브러리로 직접 파싱하면 안 됩니다.

참고 문서: [`docs/xlsx-security-mitigation.md`](xlsx-security-mitigation.md)

---

## 4. 백엔드 전환 — DB 설계 기준

실서버 백엔드 구축 시 `docs/mock-to-database-migration-plan.md` 를 기준으로 DB 설계를 진행하세요.

### 필수 테이블 목록

| 테이블 | 용도 | 현재 mock 위치 |
|--------|------|--------------|
| `attendance_records` | 출퇴근 raw 데이터 | `att:{siteId}:{YYYY-MM}` localStorage bucket |
| `wage_ledgers` | 월별 노무대장 (예상값) | `calculateMonthlyWageLedger` 결과 |
| `daily_tax_rows` | 일자별 세금 명세 (16 필드) | `WageLedger.dailyTaxRows` |
| `daily_attendance_rows` | 일자별 출역·공수 명세 | `WageLedger.dailyAttendanceRows` (Phase Z1) |
| `sensitive_access_logs` | 민감정보 조회 감사로그 | `db.sensitiveAccessLogs[]` (Phase Z2) — 상세 스키마는 [`docs/sensitive-access-audit.md`](sensitive-access-audit.md) |
| `close_statuses` | 월마감 상태머신 (OPEN→...→CLOSED) | `bodapass_admin:close_status_v2` |
| `audit_logs` | 일반 감사로그 (MANUAL_CHECKIN 등) | `bodapass_admin:audit_log_v2` |
| `workers` | 워커 마스터 | `db.workers` |
| `employments` | 채용 관계 | `db.employments` |
| `sites` / `companies` / `site_companies` | 현장·회사 마스터 | `db.sites` / `db.companies` / `db.siteCompanies` |
| `legal_policies` | 요율·한도 정책 테이블 | `LEGAL_POLICIES` array (`src/mock/legalPolicies.ts`) |
| `work_rules` | 공수 정책 (사업장별) | `WORK_RULES` array (`src/mock/workRules.ts`) |

### 마이그레이션 원칙

1. **API 응답 shape = 실서버 응답 shape** — 현재 mock 의 응답이 실서버 표준
2. **`VITE_USE_MOCK=false`** 환경변수로 전환 — mockBackend 비활성화
3. **도메인 계산 모듈 (`src/domain/*`) 은 그대로** — DB 가 들어와도 같은 시그니처로 호출
4. **employmentId 기준 연결** — 모든 출퇴근·임금·보험·세금 데이터는 `employmentId` FK

자세한 단계: [`docs/mock-to-database-migration-plan.md`](mock-to-database-migration-plan.md)

---

## 5. 얼굴인식 연동 — 서버 판정 구조 유지

`docs/face-recognition-integration.md` 기준으로 서버 권한 구조를 반드시 유지하세요.

### 핵심 원칙

```
앱은 얼굴 매칭/라이브니스/지오펜스/중복 출근을 결정하지 않는다.
서버가 전권으로 판정한다.
```

### 앱 책임 (제한적)

- 얼굴 이미지 + 위치 + 기기정보 업로드
- 응답을 표시: OK / REJECTED / PENDING_REVIEW
- 거부 사유 표시: NO_FACE_MATCH / LIVENESS_FAILED / OUTSIDE_GEOFENCE / DUPLICATE_CHECKIN

### 서버 책임 (전권)

- **얼굴 임베딩 매칭** (InsightFace / AWS Rekognition / Naver CLOVA)
- **생체검증 (liveness)** — 사진/영상 위조 차단
- **지오펜스 판정** — 현장 좌표와 거리
- **중복 출근 체크**
- **마감 상태 체크** (CLOSED 면 거부)
- **AttendanceRecord 생성** — 모든 판정 결과를 audit log 와 함께 기록

### 보안

- 얼굴 이미지: 암호화 후 S3 저장, 1년 후 Glacier
- 얼굴 임베딩: Redis 캐싱
- 별도 동의서: 「얼굴 등 생체정보 처리 동의」 (전자동의서 PART 2)

자세한 흐름: [`docs/face-recognition-integration.md`](face-recognition-integration.md)

---

## 6. 인증 — refreshToken httpOnly Secure Cookie 전환

### 현재 상태 (목업)

- `accessToken` / `refreshToken` 모두 `localStorage` 에 저장
- mockBackend 환경에서는 동작에 문제 없음

### 실서비스 전환 시 필수

```
refreshToken: localStorage  →  httpOnly Secure SameSite=Strict Cookie
accessToken:  localStorage  →  메모리 (in-memory state) 또는 짧은 expiry 의 localStorage
```

### 이유

- **localStorage 는 XSS 에 취약** — JS 가 읽을 수 있으면 공격자도 읽음
- **httpOnly Cookie 는 JS 접근 차단** — XSS 발생해도 토큰 탈취 방지
- **Secure 플래그** — HTTPS 에서만 전송
- **SameSite=Strict** — CSRF 방어

### 적용 방법

1. 백엔드 응답에서 `Set-Cookie: refreshToken=...; HttpOnly; Secure; SameSite=Strict; Path=/auth`
2. 프런트는 `localStorage.removeItem('refreshToken')` 으로 기존 토큰 제거
3. `src/api/client.ts` 의 axios `withCredentials: true` 설정
4. CORS 정책 점검 — `Access-Control-Allow-Credentials: true`

### 추가 보안 권장

- accessToken 짧은 expiry (10분~1시간)
- refresh 회전 (refreshToken 도 매 갱신마다 새로 발급)
- 비정상 갱신 패턴 감지 (다른 IP / UA 동시 사용 등)

---

## 7. 정기 점검 항목

### 매주

- `npm audit` — 신규 취약점 확인
- `npm test && npm run test:ui` — 회귀 테스트

### 매월

- 4대보험 요율 변경 확인 — `src/mock/legalPolicies.ts` 갱신
- 퇴직공제부금 일액 정책 변경 확인 (건설근로자공제회 고시)

### 분기별

- `confidence: 'ASSUMED' / 'DEMO'` 정책 항목 재검증
- 사업장별 산재보험 요율 업데이트

### 매년

- 정책 테이블 (`LEGAL_POLICIES`) 신규 effectiveFrom row 추가
- 세법 / 사회보험법 개정 사항 반영
- 감사로그 보존 기간 (5년) 도래 데이터 아카이브

---

## 8. 출시 전 최종 체크리스트

- [ ] 백엔드 API + DB 구축 완료
- [ ] 얼굴인식 모듈 (InsightFace / AWS Rekognition / CLOVA) 연동
- [ ] `VITE_USE_MOCK=false` 환경변수 적용
- [ ] mockBackend 코드 제거 또는 dev 전용 분기
- [ ] xlsx 의존성 제거 또는 서버 처리 전환
- [ ] refreshToken httpOnly Cookie 전환
- [ ] HTTPS / CSP 헤더 / CSRF 토큰 적용
- [ ] 개인정보처리방침 / 이용약관 변호사 검토
- [ ] 전자동의서 (PART 1·2·3) 법무 검토
- [ ] 감사로그 보존 정책 (5년) DB 적용
- [ ] 모니터링 (Sentry / DataDog) 통합
- [ ] 백업 / DR (Disaster Recovery) 계획
- [ ] 사내 베타 (1개 현장 50명 규모) 1개월 운영
- [ ] 외부 보안 감사 (penetration test) 통과
- [ ] 국세청 홈택스 / 근로복지공단 EDI 연동 (선택)

---

## 9. 참고 문서

- [`docs/mock-to-database-migration-plan.md`](mock-to-database-migration-plan.md) — DB 전환 단계
- [`docs/face-recognition-integration.md`](face-recognition-integration.md) — 얼굴인식 연동
- [`docs/sensitive-access-audit.md`](sensitive-access-audit.md) — 민감정보 감사로그 DB 설계
- [`docs/xlsx-security-mitigation.md`](xlsx-security-mitigation.md) — xlsx CVE 완화 로드맵
- [`docs/domain-engine.md`](domain-engine.md) — 도메인 계산 엔진 contract
- [`docs/legacy-labor-logic-mapping.md`](legacy-labor-logic-mapping.md) — 운영 SP → mock 매핑
- [`docs/wage-and-tax-calculation-flow.md`](wage-and-tax-calculation-flow.md) — 노임/세금 계산 흐름
- [`docs/data-requirements-for-legal-calculation.md`](data-requirements-for-legal-calculation.md) — 법정 계산 입력 요건
- [`docs/identity-policy.md`](identity-policy.md) — 신원 정책
- [`docs/test-ui-scenarios.md`](test-ui-scenarios.md) — UI 테스트 시나리오
- `README_REVIEW.md` — 코드 리뷰용 안내서

---

## 10. 핵심 선언

> 「보다패스 관리자 웹은 도메인 계산 엔진 + 출력 검증 게이트 + 페이지 모듈 분리까지 안정화 단계에 도달했다. 실서비스 출시 전 남은 작업은 본 체크리스트의 8번 항목 — **백엔드 구축, 얼굴인식 연동, 보안 인프라, 법무 검토**이며, 모두 별도 트랙으로 진행 가능하다.」
