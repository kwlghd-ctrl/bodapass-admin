# 스마트폰 얼굴인식 출퇴근 — 연동 가이드 (v2)

**대상 시스템:** 보다패스 작업자용 모바일 앱 / 키오스크 (작업자 본인 폰 또는 현장 키오스크)
**연동 시점:** 본 admin 웹과 Mock 백엔드는 이미 동일 contract 로 동작.
실서버 도입 시 동일 endpoint 만 구현하면 화면 코드 변경 없이 즉시 작동.

> **중요:** 본 문서는 v2 API (서버-권위 판정 구조) 기준입니다. 이전 v1 (앱이 memberId/matchScore/liveness 결정) 은 deprecated.

---

## 핵심 원칙 — 「서버 권위」

**앱은 판정하지 않는다.** 앱은 단지 「얼굴 이미지 + 위치 + 기기 정보」 를 서버에 보낼 뿐, 다음은 모두 서버가 판정한다:

- 어느 워커인지 (얼굴 매칭 → employmentId)
- 매칭 점수 (matchScore)
- 라이브니스 (사진/영상 위변조 차단)
- 지오펜스 (현장 좌표와 비교)
- 출퇴근 가능 여부 (마감 상태·중복출근 등)

이 구조 덕분에 클라이언트(앱)가 위변조되더라도 부정 출근을 막을 수 있다.

---

## 1. 등록 단계 (1회)

작업자가 시스템에 가입할 때 1회 실행.

```
┌────────────────┐     ┌──────────────────┐     ┌────────────────────┐
│ 모바일 앱       │ →  │ POST             │ →  │ 서버 측 임베딩 추출 │
│ (정면 얼굴      │     │ /v2/workers/     │     │ + faceTemplateId   │
│  사진 1장)      │     │   :id/face       │     │ 발급                │
└────────────────┘     └──────────────────┘     └────────────────────┘
```

요청:
```json
POST /v2/workers/{workerId}/face
{
  "faceImageId": "img-2026-05-11-abc123"
}
```

응답: `Worker` (faceVerified=true 로 갱신)

- 이미지는 서버가 처리 — 앱은 원본 이미지를 보관·전송하지 않음 (uploadImage endpoint 로 별도 업로드)
- 얼굴 임베딩(512-d 또는 모델별)은 서버 DB 에 암호화 저장
- `Worker.faceVerified = true` 로 바뀌면 trustTier 1/2 자격 부여
- 원본 사진은 임베딩 추출 후 즉시 폐기 (개인정보 최소 수집 원칙)

---

## 2. 매일 출근 흐름

```
모바일 앱 / 키오스크:
  1. 카메라 ON
  2. 얼굴 촬영 + GPS 위치 + 기기 ID 수집
  3. 이미지를 서버에 업로드 → faceImageId 발급
  4. POST /v2/attendance/face-checkin 호출 ↓

서버:
  1. 얼굴 매칭 — 현장 활성 워커들의 임베딩 풀과 비교 (cosine similarity)
     · 최고점 워커 선정 + matchScore 계산
     · matchScore < 0.7 → REJECTED: NO_FACE_MATCH
  2. 라이브니스 검증 (위변조 차단)
     · 단일 이미지 PAD (Presentation Attack Detection)
     · 실패 → REJECTED: LIVENESS_FAILED
  3. 지오펜스 판정 — site.geofence 와 거리 계산
     · INSIDE / OUTSIDE / LOW_ACCURACY / NO_LOCATION
     · OUTSIDE → REJECTED: OUTSIDE_GEOFENCE
  4. 중복 출근 체크
     · 이미 오늘 checkInAt 있으면 → REJECTED: DUPLICATE_CHECKIN
  5. 현장 마감 상태 체크
     · CLOSED → REJECTED: SITE_CLOSED
  6. AttendanceRecord 생성
     · employmentId, matchScore, livenessCheckIn, geofenceResult 모두 서버 기록
     · auditLog 자동 추가

응답: FaceCheckResponse
```

---

## 3. API 계약

### Request — `POST /v2/attendance/face-checkin`

```typescript
interface FaceCheckRequest {
  siteId: string;
  faceImageId: string;          // 서버에 업로드된 이미지 ID

  location?: {                  // GPS — 옵션 (없으면 NO_LOCATION 처리)
    lat: number;
    lng: number;
    accuracy: number;           // m
    capturedAt: string;         // ISO
  };

  device: {
    kind: string;               // 'KIOSK' | 'FOREMAN_MOBILE' | 'SITE_TABLET' 등
    deviceId: string;
    appVersion?: string;
  };

  clientTime: string;           // ISO — 서버가 자체 시각과 비교 (drift 감지)
}
```

**중요:** Request 에는 `memberId / matchScore / liveness` 가 **없다**. 앱이 그 결정을 못 한다.

### Response — `FaceCheckResponse`

```typescript
type FaceCheckResponse =
  | { status: 'OK'; record: AttendanceRecord }
  | {
      status: 'REJECTED';
      reason:
        | 'NO_FACE_MATCH'
        | 'LIVENESS_FAILED'
        | 'OUTSIDE_GEOFENCE'
        | 'DUPLICATE_CHECKIN'
        | 'NOT_EMPLOYED'
        | 'SITE_CLOSED'
        | 'OTHER';
      detail?: string;
    }
  | {
      status: 'PENDING_REVIEW';
      recordId: string;
      reason: string;            // 라이브니스 애매 / 매칭 0.7~0.85
      detail?: string;
    };
```

- `OK`: 정상 출근. 앱은 record 의 employmentId·checkInAt·gongsu 등 표시
- `REJECTED`: 거부됨. 앱은 reason 코드로 UX 결정 (재시도 / 반장에게 알림 / 수동 처리 요청)
- `PENDING_REVIEW`: 보류 — 본사 검토 후 확정/취소 결정. 앱은 「곧 확정됩니다」 메시지 노출

---

## 4. 퇴근 흐름

`POST /v2/attendance/face-checkout` — 요청·응답 shape 동일.

서버 추가 로직:
- 출근 기록 존재 확인 (없으면 REJECTED: OTHER)
- workedMinutes / gongsu / payAmount 자동 계산 (`utils/gongsu.calcGongsu`)
- 18시 미퇴근자는 시스템이 별도 cron 으로 일괄 처리 (`/v2/attendance/bulk-check-out`)

---

## 5. 키오스크 vs 본인 모바일

| 항목 | 키오스크 (현장 입구 고정 단말) | 본인 모바일 (반장 앱·작업자 앱) |
|---|---|---|
| `device.kind` | `'KIOSK'` | `'WORKER_MOBILE'` / `'FOREMAN_MOBILE'` |
| 화면 | 「얼굴 인식 중...」 → 결과 표시 | 동일 |
| 위치 | 현장 고정 → location 생략 가능 | 필수 — GPS 권한 필요 |
| 라이브니스 | 권장 | 필수 (개인 단말은 위변조 위험 더 높음) |
| 인증 | 키오스크 자체 토큰 | 사용자 JWT |

---

## 6. 보안 / 개인정보

### 클라이언트 측

- 얼굴 사진 원본 — 메모리에서만 처리, 디스크 미저장
- 임베딩 추출 — 서버에서만 수행 (on-device 추출은 금지)
- faceImageId 는 일회용 — 사용 후 5분 이내 만료 (uploadImage endpoint 에서 발급한 short-lived presigned URL 사용)

### 서버 측

- 얼굴 임베딩 — AES-256 + KMS 키 분리 저장
- 1년 후 자동 백업 → 5년 후 자동 삭제 (개인정보 보존기간 정책)
- 모든 API 호출 audit log 기록 (성공·실패 무관)

### 동의

작업자 가입 시 「전자동의서 PART 2 — 얼굴 등 생체정보 처리 동의」 명시적 동의 필수.
동의 철회 시 임베딩 삭제 + 얼굴인증 모드 비활성화 (수동 출퇴근만 가능).

---

## 7. 에러 처리 (앱 UX)

| reason | 사용자 메시지 | 권장 액션 |
|---|---|---|
| `NO_FACE_MATCH` | 「얼굴이 등록된 워커와 일치하지 않습니다」 | 재시도 (3회 실패 시 반장 호출) |
| `LIVENESS_FAILED` | 「실제 얼굴인지 확인되지 않습니다」 | 모자·마스크 제거 후 재촬영 |
| `OUTSIDE_GEOFENCE` | 「현장 반경 밖입니다 — {거리}m」 | 현장 입구로 이동 후 재시도 |
| `DUPLICATE_CHECKIN` | 「오늘 이미 출근하셨습니다」 | 출근 상태 표시 |
| `NOT_EMPLOYED` | 「이 현장에 등록된 워커가 아닙니다」 | 반장에게 등록 요청 |
| `SITE_CLOSED` | 「현장이 마감되어 출근 처리 불가」 | 본사에 문의 |
| `PENDING_REVIEW` | 「확정 대기 중 — 본사 검토 후 알림드립니다」 | 푸시 알림 수신 후 확인 |

---

## 8. 로컬 시연 (Mock)

`VITE_USE_MOCK=true` 상태에서:
- 임의 faceImageId 로 호출하면 mockBackend 가 결정적 해시로 워커를 선정
- matchScore: 0.85~0.99 랜덤
- liveness: 95% PASSED
- 지오펜스: site.geofence 가 있으면 실제 거리 계산

실서버 전환 시 mockBackend 제거 + `VITE_USE_MOCK=false` 만 변경.

---

## 9. v1 → v2 마이그레이션 (이미 적용됨)

| v1 (deprecated) | v2 (현재) |
|---|---|
| 앱이 memberId 전송 | 서버가 얼굴 매칭 후 employmentId 결정 |
| 앱이 matchScore 전송 | 서버가 cosine similarity 계산 |
| 앱이 liveness 결과 전송 | 서버가 PAD 모델로 판정 |
| 앱이 distanceFromSiteM 계산 | 서버가 haversine 으로 계산 |
| 단일 status 응답 | OK / REJECTED(reason) / PENDING_REVIEW 3-state |

---

> **연락처**: 백엔드 엔지니어가 본 endpoint 를 구현할 때, mockBackend.ts 의 `handleFaceCheck` 함수를 참조하면 동일 contract 를 보장할 수 있습니다.

작성: 2026-05-12 (v2)
