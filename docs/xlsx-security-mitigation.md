# xlsx 라이브러리 보안 취약점 — Mitigation 정책 (Phase BB4)

> `xlsx@0.18.5` (SheetJS Community Edition) 에 HIGH 등급 CVE 가 있어 단기/중기/장기 단계 mitigation 을 정의한다.

## 1. 현재 상황 (2026-05)

### 알려진 취약점

| CVE / Advisory | 등급 | 유형 | 영향 |
|---------------|------|------|------|
| GHSA-4r6h-8v6p-xvw6 | HIGH | Prototype Pollution | 악의적 xlsx 가 Object.prototype 오염 → 임의 코드 실행 가능 |
| GHSA-5pgg-2g8v-p4x9 | HIGH | ReDoS | 특정 정규식 패턴 입력으로 CPU 100% 점유 |

- `npm audit` — HIGH 2건 보고
- 작성 시점 기준 **패치 버전 미배포** (SheetJS Pro 로 마이그레이션 권유)

### 코드 내 사용처

- `src/utils/wageLedger.ts` — 노임대장 .xlsx 파싱
- `src/utils/electronicCard.ts` — 공제회 전자카드 .xlsx 파싱

### 화면 업로드 지점

- `src/pages/AttendancePage.tsx` — 노임대장 업로드
- `src/pages/TeamListPage.tsx` — 멤버 일괄 업로드

## 2. 단기 완화 (Short-term, 적용 완료)

### 2-1. 동적 import (Phase J1)

`src/utils/wageLedger.ts`, `src/utils/electronicCard.ts` 에서 `xlsx` 를 동적 import 로 호출.
Vite build 시 `vendor-xlsx` 청크로 분리되어 **xlsx 사용 페이지에 진입할 때만 로드**.

### 2-2. 화면 경고 (Phase T8 + S5)

업로드 UI 에 다음 경고를 표시:

> ⚠ 목업/시연용 — 사용자 업로드 xlsx 파싱은 브라우저에서 직접 처리됩니다. 실서비스에서는 서버 처리로 전환됩니다.

### 2-3. 업로드 파일 크기 제한 10MB (Phase BB4, 신규)

```typescript
if (file.size > 10 * 1024 * 1024) {
  alert('파일 크기 10MB 초과 — 거부 (xlsx 보안 정책)');
  return;
}
```

적용 위치:
- `src/pages/AttendancePage.tsx` — `handleFile()`
- `src/pages/TeamListPage.tsx` — 멤버 업로드 input onChange

**효과**: ReDoS 공격은 입력 크기에 비례. 10MB 상한으로 worst-case CPU 점유 시간을 수 초 이내로 제한.

## 3. 중기 완화 (Mid-term)

### 3-1. exceljs 단일화

현재 `exceljs@4.4.0` 도 이미 일부 사용 중 (출력 전용). exceljs 는 작성 시점 기준 알려진 HIGH CVE 가 없음.

- 파싱(xlsx) → 출력(exceljs) 라이브러리 이원화 상태
- 목표: 파싱도 exceljs 로 단일화
- 작업: `src/utils/wageLedger.ts`, `src/utils/electronicCard.ts` 의 `import('xlsx')` → `import('exceljs')` 교체 + 파서 코드 재작성

### 3-2. 호환성 검증

기존 .xlsx (특히 김반장·공제회 export) 가 exceljs 로 파싱되는지 회귀 테스트 필요.

## 4. 장기 완화 (Long-term, 실서비스 전환 시)

### 4-1. 서버 처리

업로드 파일을 서버로 보내고 서버 (Node + sandbox 컨테이너) 에서 안전한 라이브러리로 파싱:

```
Client (file 선택) → POST /v2/upload/ledger?type=xlsx (multipart)
                  → Server: sandbox 컨테이너 (memory limit, CPU limit, network 차단)
                  → Parsing 결과 JSON 반환
```

- 장점: 클라이언트에 raw xlsx 가 들어오지 않음. 서버에서 안티바이러스 스캔 + 격리된 파싱
- 단점: 인프라 비용 + 네트워크 round-trip

### 4-2. WebAssembly sandbox

파싱 라이브러리를 WASM 으로 컴파일하고 격리된 환경에서 실행. Prototype Pollution 차단 + CPU 제한 가능.

## 5. 점검 주기

- **분기 1회** — `npm audit` 결과 검토. 새 CVE 가 나오면 본 문서 갱신
- **연 1회** — SheetJS 공식 라이선스 상태 점검 (Community Edition 유지보수 종료 가능성)

## 6. 관련 문서

- `README_REVIEW.md` § "xlsx 보안 정책 (Phase S5 + BB4 강화)"
- `README_REVIEW.md` § "15-1. xlsx — HIGH"
