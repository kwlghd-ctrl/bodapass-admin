# 기존 운영형 소스 ↔ V2 도메인 모델 매핑표

> 기존 운영 시스템(Spring/Oracle 기반 추정)의 컬럼·endpoint 를 본 보다패스 V2 도메인 모델로 매핑하는 가이드.
>
> 본 매핑이 정확해야 데이터 마이그레이션과 백엔드 endpoint 구현이 1:1 으로 정합됩니다.

---

## 0. 매핑 원칙

1. 한국어 필드명 ↔ V2 필드명은 **의미 기반** 매핑 (단순 이름 매칭 X)
2. 「그대로 차용 가능」 = 컬럼·로직 변경 없이 본 시스템 그대로 사용
3. 「수정 필요」 = 명세 변경 또는 코드 수정 필요
4. 「보안상 분리」 = 평문/마스킹 분리 또는 별도 endpoint 로 격리

---

## 1. 현장 (Site) 좌표·반경

| 기존 컬럼 | 기존 데이터 | 업무 의미 | V2 모델 대응 | 차용 가능 | 수정/보안 |
|---|---|---|---|---|---|
| `siteCoorX` | float | 현장 GPS 위도 | `Site.geofence.lat` | ✅ 그대로 | — |
| `siteCoorY` | float | 현장 GPS 경도 | `Site.geofence.lng` | ✅ 그대로 | — |
| `rad` | int (m) | 지오펜스 반경 | `Site.geofence.radiusM` | ✅ 그대로 | — |
| (신규) | — | GPS 허용 정확도 | `Site.geofence.gpsTolerance` | — | 신규 컬럼 추가 (기본 50m) |

**얼굴인식 출퇴근 흐름**: 서버가 `Site.geofence` 와 클라이언트 보고 좌표를 비교해 `INSIDE/OUTSIDE/LOW_ACCURACY/NO_LOCATION` 4단으로 판정 → `AttendanceRecord.geofenceResult` 에 기록.

---

## 2. 워커 검증 (Worker.verification)

| 기존 컬럼 | 값 | 업무 의미 | V2 모델 대응 | 차용 가능 | 수정/보안 |
|---|---|---|---|---|---|
| `idCetYn` | Y/N | 신분증 본인확인 완료 | `Worker.verification.identityVerified` | ✅ 그대로 (Y→true) | 신분증 OCR 처리 결과 |
| `faceRgstYn` | Y/N | 얼굴 임베딩 등록 완료 | `Worker.verification.faceRegistered` | ✅ 그대로 | 임베딩은 별도 vector DB 저장 |
| `acctCetYn` | Y/N | 본인 계좌 검증 완료 | `Worker.verification.bankVerified` | ✅ 그대로 | 1원 송금 검증 또는 오픈뱅킹 API |
| `privacyYn` | Y/N | 개인정보 동의 완료 | `Worker.verification.privacyAgreed` | ✅ 그대로 | 전자동의서 PART 1 |
| — | — | 근로계약 서명 완료 | `Worker.verification.contractSigned` | — | Employment.contractStatus='SIGNED' 와 sync |

**Trust Tier 자동 계산**:
- T1: 모든 검증 true
- T2: identityVerified + faceRegistered + (bankVerified 또는 paymentAccountType !== 'OWN')
- T3: faceRegistered 만
- T4: 미등록 (DB 외부)

---

## 3. 근로계약 (Employment.contract*)

| 기존 컬럼 | 값 | 업무 의미 | V2 모델 대응 | 차용 가능 | 수정/보안 |
|---|---|---|---|---|---|
| `cntrStatTp` | DRAFT/REQ/SIGNED/REJ/TER | 계약 상태 | `Employment.contractStatus` | ✅ 그대로 (코드 변환 표 필요) | enum 매핑 1:1 |
| `cntrDd` | YYYYMMDD | 계약 체결일 (서명일) | `Employment.contractDate` | ✅ 그대로 | YYYY-MM-DD 형식 변환 |
| `cntrSn` | string | 계약서 일련번호 | `Employment.contractNo` | ✅ 그대로 | — |
| `wrkStrDd` | YYYYMMDD | 실제 근로 시작일 | `Employment.startDate` | ✅ 그대로 | 형식 변환 |
| `wrkEndDd` | YYYYMMDD | 실제 근로 종료일 | `Employment.endDate` | ✅ 그대로 | 형식 변환 |
| `ordrPrc` | int (원) | 도급단가 (일당) | `Employment.dailyWage` | ✅ 그대로 | 원 단위 그대로 |
| (신규) | — | 계약 예정 시작일 | `Employment.workStartDate` | — | startDate 와 분리 운영 |
| (신규) | — | 계약 예정 종료일 | `Employment.workEndDate` | — | endDate 와 분리 운영 |

**계약 상태 머신**:
```
DRAFT → REQUESTED → SIGNED → ACTIVE → TERMINATED
                          ↓
                       REJECTED
```

---

## 4. 임금/노임대장 (WageMonthSummary + WageLedger)

| 기존 컬럼 | 값 | 업무 의미 | V2 모델 대응 | 차용 가능 | 수정/보안 |
|---|---|---|---|---|---|
| `mtchQtySum` | float | 월 공수 합계 | `WageRow.workDays` 또는 `totalGongsu` | ✅ 그대로 | — |
| `mtchAmtSum` | int | 월 임금 총액 | `WageRow.baseAmount` | ✅ 그대로 | — |
| `ddctAmtSum` | int | 월 공제 총액 | `WageRow.deductionTotal` | ✅ 그대로 | — |
| `netPayAmt` | int | 월 실지급액 | `WageRow.netAmount` | ✅ 그대로 | — |
| `taxAmt` | int | 소득세 | `WageRow.deductionIncomeTax` | ✅ 그대로 | — |
| `lcltAmt` | int | 지방소득세 | `WageRow.deductionLocalTax` | ✅ 그대로 | — |
| `npAmt` | int | 국민연금 (근로자분) | `WageRow.deductionPension` | ✅ 그대로 | 사업주분 별도 |
| `hcAmt` | int | 건강보험 (근로자분) | `WageRow.deductionHealth` | ✅ 그대로 | — |
| `eiAmt` | int | 고용보험 | `WageRow.deductionEmployment` | ✅ 그대로 | — |
| `wcAmt` | int | 산재보험 | `WageRow.deductionAccident` | ✅ 그대로 | 사업주만 부담 (실 = 0) |

---

## 5. 마감 상태 (CloseStatus)

| 기존 컬럼 | 값 | 업무 의미 | V2 모델 대응 | 차용 가능 | 수정/보안 |
|---|---|---|---|---|---|
| `lockLvTp` | 0/1/2/3 | 잠금 단계 | `CloseStage` | ⚠ 수정 | 0=OPEN, 1=SITE_CONFIRMED, 2=WAGE_CONFIRMED, 3=CLOSED 매핑 필요. 본 시스템은 7단계로 세분화 |
| (신규) | — | 단계 전이 history | `CloseStatusEntry.history[]` | — | 신규 필요 (감사용) |
| (신규) | — | REOPEN 사유 | `history[i].reason` | — | 5자 이상 필수 |

**전이 매트릭스**:
```
OPEN → FOREMAN_CONFIRMED → SITE_CONFIRMED → HQ_REVIEWED
   → WAGE_CONFIRMED → PAID → INSURANCE_REPORTED → CLOSED
```
각 stage 에서 역방향 전이(REOPEN) 1단계 가능 + 사유 필수.

---

## 6. 출퇴근 보정 신청 (AttendanceAdjustmentRequest)

| 기존 컬럼 | 값 | 업무 의미 | V2 모델 대응 | 차용 가능 | 수정/보안 |
|---|---|---|---|---|---|
| `RQST_STAT_TP` | REQ/APR/REJ/CXL | 신청 상태 | `AdjustmentStatus` | ✅ 그대로 (코드 변환) | REQUESTED/APPROVED/REJECTED/CANCELLED |
| `RQST_TP` | OT/CO/GA | 신청 유형 | `AdjustmentRequestType` | ✅ 그대로 | OVERTIME/CHECK_OUT/GONGSU_ADJUST |
| `RQST_RSN` | text | 신청 사유 | `reason` | ✅ 그대로 | 5자 이상 |
| `APR_RSN` | text | 승인/반려 메모 | `rejectionReason` 또는 별도 memo | ✅ 그대로 | — |
| `RQST_GS` | float | 신청 공수 | `requestedGongsu` | ✅ 그대로 | — |

**승인 흐름**: REQUESTED → APPROVED (자동으로 AttendanceRecord 갱신 + auditLog 생성) 또는 REJECTED (사유 필수).

---

## 7. 보안상 분리 필요 컬럼

| 컬럼 | 위험 | 분리 방법 |
|---|---|---|
| `idNumberRaw` (주민번호 평문) | 개보법 위반 위험 | `WorkerSensitiveInfo` 별도 endpoint `/v2/workers/:id/sensitive`. DB 는 AES-256 + KMS |
| `accountNumberRaw` (계좌번호 평문) | 동일 | 동일 |
| `faceImageBlob` (얼굴 원본) | 생체정보 | S3 암호화 + 1년 후 Glacier · 5년 후 삭제. 임베딩만 메인 DB 보관 |
| `phoneRaw` (전화번호) | 개인정보 | 마스킹 phone 응답 + 권한자만 평문 |
| `addressRaw` (주소) | 개인정보 | 동일 |

---

## 8. 코드 변환 표 — 기존 ↔ V2 enum

### 8-1. 계약 상태 (cntrStatTp ↔ ContractStatus)

| 기존 | V2 |
|---|---|
| `DRAFT` | `DRAFT` |
| `REQ` | `REQUESTED` |
| `SIGNED` | `SIGNED` |
| `ACTIVE` | `ACTIVE` |
| `REJ` | `REJECTED` |
| `TER` | `TERMINATED` |

### 8-2. 마감 단계 (lockLvTp ↔ CloseStage)

| 기존 | V2 |
|---|---|
| `0` | `OPEN` |
| `1` | `SITE_CONFIRMED` |
| `2` | `WAGE_CONFIRMED` |
| `3` | `CLOSED` |
| — | `FOREMAN_CONFIRMED` (신규) |
| — | `HQ_REVIEWED` (신규) |
| — | `PAID` (신규) |
| — | `INSURANCE_REPORTED` (신규) |

기존 4단계 → V2 8단계 확장. 마이그레이션 시 기존 lockLvTp 값을 V2 의 대응 stage 로 그대로 옮기되, 나머지 4개 신규 stage 는 첫 전이부터 사용.

### 8-3. 신청 상태 (RQST_STAT_TP ↔ AdjustmentStatus)

| 기존 | V2 |
|---|---|
| `REQ` | `REQUESTED` |
| `APR` | `APPROVED` |
| `REJ` | `REJECTED` |
| `CXL` | `CANCELLED` |

### 8-4. 인증 단계 Y/N → boolean

기존 시스템의 `idCetYn`, `faceRgstYn`, `acctCetYn`, `privacyYn` 모두 `'Y' | 'N'` 단일 문자 → V2 의 `boolean` (true/false) 로 변환.

```typescript
// 변환 헬퍼 예시
function yToBool(v: string | undefined): boolean {
  return v === 'Y';
}
```

---

## 9. 데이터 마이그레이션 SQL 골격 (예시)

PostgreSQL 기준:

```sql
-- 1) Site 좌표·반경
INSERT INTO sites (id, name, geofence_lat, geofence_lng, geofence_radius_m, ...)
SELECT site_id, site_nm, site_coor_x, site_coor_y, rad, ...
FROM legacy.tb_site
WHERE site_stat_tp <> 'D';

-- 2) Worker 마스터 + verification
INSERT INTO workers (id, worker_code, name, phone, id_number_masked, ...,
                     verification_identity, verification_face, verification_bank, verification_privacy)
SELECT w.id, w.worker_cd, w.name, w.phone, mask(w.id_no),
       w.id_cet_yn = 'Y', w.face_rgst_yn = 'Y', w.acct_cet_yn = 'Y', w.privacy_yn = 'Y'
FROM legacy.tb_worker w;

-- 3) Employment (계약 관계)
INSERT INTO employments (id, worker_id, site_company_id, trade, daily_wage,
                          start_date, end_date, contract_status, contract_date, contract_no)
SELECT c.cntr_sn, c.worker_id, sc.id, c.trade_cd, c.ordr_prc,
       c.wrk_str_dd, c.wrk_end_dd,
       case c.cntr_stat_tp
         when 'REQ' then 'REQUESTED'
         when 'SIGNED' then 'SIGNED'
         when 'TER' then 'TERMINATED'
         else c.cntr_stat_tp end,
       c.cntr_dd, c.cntr_sn
FROM legacy.tb_contract c
JOIN site_companies sc ON sc.site_id = c.site_id AND sc.company_id = c.company_id;
```

---

## 10. 호환성 우선순위

1. **이미 정합** (그대로 매핑 가능): geofence, 임금, 검증 단계, 신청 도메인
2. **enum 변환 필요**: contractStatus, closeStage, adjustmentStatus
3. **신규 필드**: workStartDate/workEndDate, verification.contractSigned, FOREMAN_CONFIRMED 등 신규 마감 stage 4개
4. **보안 분리**: idNumberRaw, accountNumberRaw, faceImageBlob, phoneRaw, addressRaw

마이그레이션 시 우선순위 1~2 는 1:1 매핑으로 처리, 3~4 는 백엔드·DB 스키마 신규 컬럼 추가 필요.

---

> 본 매핑표를 백엔드 개발자에게 SQL DDL + ETL 스크립트 명세 작성 시 1차 입력 자료로 활용 가능합니다.

작성: 2026-05-12 (V2 v3 기준)
