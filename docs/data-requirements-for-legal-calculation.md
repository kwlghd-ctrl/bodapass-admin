# 법정 계산을 위한 필수 입력 데이터 정리

> 보다패스 4대 법정 계산 (퇴직공제부금 / 4대보험 / 소득세 / 두루누리) 을 정확히 수행하기 위해
> **반드시 입력되어야 하는 데이터 항목** 정리.

본 문서는 다음 코드 자산과 1:1 정합:
- `src/api/legal.types.ts` — 계산 입력/결과 타입
- `src/mock/legalPolicies.ts` — 정책 테이블 mock
- `src/utils/legalDataValidation.ts` — 필수 데이터 누락 검증

---

## 0. 원칙

1. **데이터 우선** — 화면 개편보다 데이터 구조 확정 우선
2. **목업 단계에서도 충분히 채워둘 것** — DB 연결 시 마이그레이션 SQL 한 번에 끝
3. **누락 시 경고** — `legalDataValidation` 가 `severity = info | warning | error` 분류
4. **「예상값」 표시 강제** — 입력이 부족하면 화면에 "확정 신고 전 검증 필요" 안내 노출

---

## 1. 계산별 필수 입력 매트릭스

| 입력 | 퇴직공제 | 4대보험 | 소득세 | 두루누리 |
|---|---|---|---|---|
| `Site.bidNoticeDate` 또는 `Site.contractDate` | ✅ 필수 (warning) | — | — | — |
| `Site.constructionEndDate` | — | — | — | — |
| `Worker.birthDate` | — | ✅ 필수 (warning) | — | ✅ 필수 (warning) |
| `Worker.gender`, `nationality`, `residentType` | — | ⚠ 권장 | ⚠ 권장 | — |
| `Worker.taxProfile.childrenUnder6Count` | — | — | ✅ 필수 (info) | — |
| `Worker.insuranceProfile.insuranceHistoryLast12Months` | — | — | — | ✅ 필수 (warning) |
| `Company.employeeCount` | — | — | — | ✅ 필수 (error) |
| `Employment.id` | ✅ 필수 (error) | ✅ 필수 (error) | ✅ 필수 (error) | ✅ 필수 (error) |
| `Employment.dailyWage` | — | ✅ 필수 (error) | ✅ 필수 (error) | ✅ 필수 (error) |
| `AttendanceRecord.gongsu × workDays` | ✅ 필수 (error) | ✅ 필수 (error) | ✅ 필수 (error) | ✅ 필수 (error) |

**severity 의미**:
- `info`: 안내만 — 기본값(0 또는 보수적)으로 계속 진행
- `warning`: 「예상값」 표기 — 신고 전 검증 권장
- `error`: 계산 중단 — 신고 진행 차단

---

## 2. 도메인별 필수 데이터 체크리스트

### 2-1. Site (현장)

| 필드 | 타입 | 용도 | 누락 시 |
|---|---|---|---|
| `bidNoticeDate` | string (YYYY-MM-DD) | 퇴직공제부금 일액 결정 (2026-04-01 분기) | warning, 보수적 기본 적용 |
| `contractDate` | string | bidNoticeDate 보조 | info |
| `constructionStartDate` | string | 마감 자동 판단 | info |
| `constructionEndDate` | string | 준공 판단 | info |
| `completionDate` | string | 실제 준공일 | info |
| `constructionAmount` | number | 4대보험 신고서 도급액 | warning |
| `constructionType` | enum | 산재 요율 결정 보조 | info |
| `severanceApplicable` | boolean | 퇴직공제 적용 여부 | warning, 기본 true |
| `insuranceReportType` | 'GENERAL' \| 'CONSTRUCTION_SELF' | 보험 신고 형태 (3/31 vs 3/15) | warning, 기본 CONSTRUCTION_SELF |
| `geofence.lat/lng/radiusM/gpsTolerance` | 좌표·반경 | 출퇴근 지오펜스 판정 | warning, 위치 검증 비활성 |

### 2-2. Company (회사)

| 필드 | 타입 | 용도 | 누락 시 |
|---|---|---|---|
| `businessNumber` | string | 보험·세금 신고서 발신자 | error |
| `companyType` | enum | 원/하도급 구분 | warning |
| `employmentInsuranceManagementNo` | string | 고용보험 신고 시 사업장 식별 | error |
| `industrialAccidentInsuranceManagementNo` | string | 산재보험 신고 시 식별 | error |
| `constructionLicenseType` | 'GENERAL'\|'SPECIALTY'\|'NONE' | 면허 종류 | info |
| `constructionLicenseNo` | string | 면허 번호 | info |
| `employeeCount` | number | 두루누리 10인 미만 조건 | error |
| `durunuriEligible` | boolean (캐시) | 두루누리 사업장 적격 | — (자동 계산) |

### 2-3. Worker (워커)

| 필드 | 타입 | 용도 | 누락 시 |
|---|---|---|---|
| `name`, `phone` | string | 신고 기본 | error |
| `birthDate` | string | 국민연금/건강보험 자격 판정 | warning |
| `gender`, `nationality`, `residentType`, `visaType` | enum | 외국인 면제·자격 | info |
| `verification.identityVerified` | boolean | 신분증 본인확인 | warning |
| `verification.faceRegistered` | boolean | 얼굴 임베딩 등록 | warning |
| `verification.bankVerified` | boolean | 본인 계좌 확인 | warning |
| `verification.privacyAgreed` | boolean | 개인정보 동의 | error |
| `verification.contractSigned` | boolean | 근로계약 서명 | warning |
| `taxProfile.dependentsCount` | number | 소득공제 | info |
| `taxProfile.childrenUnder6Count` | number | 보육수당 비과세 한도 | info |
| `taxProfile.nonTaxableItems` | array | 비과세 항목 활성화 | info |
| `insuranceProfile.nationalPensionTarget` | boolean | 국민연금 대상 | warning |
| `insuranceProfile.healthInsuranceTarget` | boolean | 건강보험 대상 | warning |
| `insuranceProfile.employmentInsuranceTarget` | boolean | 고용보험 대상 | warning |
| `insuranceProfile.industrialAccidentTarget` | boolean | 산재보험 대상 | warning |
| `insuranceProfile.durunuriCandidate` | boolean | 두루누리 후보 | info |
| `insuranceProfile.insuranceHistoryLast12Months` | boolean \| null | 두루누리 신규/기존 판정 | warning |

### 2-4. Employment (채용 관계)

| 필드 | 타입 | 용도 | 누락 시 |
|---|---|---|---|
| `workerId` | string | Worker 참조 | error |
| `siteId`, `companyId`, `siteCompanyId` | string | 사이트·회사 참조 | error |
| `foremanEmploymentId` | string | 반장 배정 | info |
| `tradeCode`, `jobTitle` | string | 직종·직책 | warning |
| `dailyWage` | number | 임금 산정 베이스 | error |
| `wageType` | 'DAILY'\|'HOURLY'\|'MONTHLY' | 임금 형태 | warning, 기본 DAILY |
| `standardWorkHours` | number | 표준 근로시간 | info, 기본 8 |
| `contractStatus` | enum | 계약 상태 | warning |
| `contractDate`, `contractNo` | string | 계약 체결일·번호 | warning |
| `workStartDate`, `workEndDate` | string | 예정 근로 기간 | warning |
| `insuranceApplied` | boolean | 4대보험 적용 | warning, 기본 true |
| `severanceApplied` | boolean | 퇴직공제 적용 | warning, 기본 true |
| `taxApplied` | boolean | 소득세 적용 | warning, 기본 true |
| `insurance.pension/health/employment/accident` | boolean | 개별 보험 가입 | warning |
| `nontaxable.meal/vehicle/travel/childcare/other` | number | 비과세 금액 | info, 기본 0 |

### 2-5. AttendanceRecord (출퇴근)

| 필드 | 타입 | 용도 | 누락 시 |
|---|---|---|---|
| `employmentId` | string | Employment 참조 | error |
| `siteId` | string | 현장 식별 | error |
| `workDate` | string | 작업 귀속일 | error |
| `checkInAt`, `checkOutAt` | ISO | 시각 | error (없으면 ABSENT) |
| `source` | 'FACE'\|'MANUAL'\|'ECARD' | 데이터 출처 | warning |
| `gongsu` | number | 공수 (0~1.5) | error |
| `workedMinutes` | number | 작업 분 | error |
| `dailyWageSnapshot` | number | 당시 일당 | warning |
| `payAmount` | number | gongsu × dailyWage | error |
| `geofencePassed`, `distanceFromSiteMeters`, `locationAccuracyMeters` | boolean/number | 지오펜스 결과 | info |
| `faceVerified`, `livenessPassed` | boolean | 얼굴/생체 검증 | info |
| `status` | enum | NORMAL/LATE/EARLY/ABSENT/OFF | error |

### 2-6. CloseStatus (마감)

| 필드 | 타입 | 용도 | 누락 시 |
|---|---|---|---|
| `siteId`, `yearMonth` | string | 마감 단위 식별 | error |
| `companyId` | string | (현장×회사) 단위 마감 | info |
| `stage` | enum | 8단계 상태 | error |
| `history[]` | array | 전이 이력·사유·담당자 | error |
| `foremanConfirmedAt` ~ `closedAt` | timestamp | stage 별 진입 시각 | info (history 에서 추출 가능) |
| `reopenedReason` | string | 최근 REOPEN 사유 | warning (역방향 전이 시 필수) |

---

## 3. 우선순위 — 어디서부터 채울 것인가

**Tier 1 — 시연 단계에서도 반드시 채울 것**:
- `Site.geofence` (지오펜스)
- `Worker.name, phone, idType, idNumberMasked`
- `Worker.verification.{identityVerified, faceRegistered, privacyAgreed}`
- `Employment.{workerId, siteId, dailyWage, startDate}`
- `Company.{name, businessNumber}`

**Tier 2 — 4대보험 신고 시점까지**:
- `Site.{bidNoticeDate, constructionAmount, insuranceReportType}`
- `Company.{employmentInsuranceManagementNo, industrialAccidentInsuranceManagementNo, employeeCount}`
- `Worker.{birthDate, residentType, taxProfile.childrenUnder6Count, insuranceProfile.*}`
- `Employment.{contractStatus, contractDate, contractNo, insuranceApplied, severanceApplied}`

**Tier 3 — 정밀 계산·감사 단계**:
- `Site.{completionDate, constructionType, severanceApplicable}`
- `Worker.{gender, nationality, visaType, taxProfile.dependentsCount, nonTaxableItems, insuranceHistoryLast12Months}`
- `Employment.{tradeCode, jobTitle, wageType, standardWorkHours, workStartDate, workEndDate}`
- `AttendanceRecord.{source, dailyWageSnapshot, geofencePassed, faceVerified, livenessPassed}`

---

## 4. 정책 추적 — 어떻게 「언제 기준의 계산」인지 보존하나

모든 계산 결과(`SeveranceCalculationResult`, `InsuranceCalculationResult` 등)에 `policyVersion: string` 필드 포함.
- 예: `'SEV-FUND-NEW-v1'` → 2026-04-01 이후 신 정책으로 계산됨
- `legalPolicies.LEGAL_POLICIES` 테이블에서 `policy.version` 으로 정책 row 역추적 가능
- DB 전환 시 `legal_policies` 테이블에 동일 row 보존 → 과거 계산 결과를 정책 변경 후에도 동일하게 재계산 가능

---

## 5. 화면 표시 강제

`legalDataValidation.summarizeWarnings()` 가 반환하는 `uiLabel`:

| uiLabel | 화면 표시 |
|---|---|
| `CONFIRMED` | 정상 — 단순 숫자만 표시 |
| `ESTIMATED` | "예상값 (확정 신고 전 검증 필요)" 라벨 동반 표시 |
| `BLOCKED` | "계산 불가 — 필수 데이터 누락" + 누락 필드 안내 |

화면에서 「예상 보험료」, 「예상 퇴직공제부금」 등 「예상」 접두어 사용 권장.

---

## 6. 검증 사용 예 (코드 예시)

```typescript
import { validateInsuranceInputs, summarizeWarnings, UI_LABEL_TEXT } from '@/utils/legalDataValidation';
import { lookupPolicy } from '@/mock/legalPolicies';

const warnings = validateInsuranceInputs(worker, employment);
const summary = summarizeWarnings(warnings);

if (summary.uiLabel === 'BLOCKED') {
  return <div>계산 불가: {summary.errors.map(e => e.message).join(', ')}</div>;
}

const npsPolicy = lookupPolicy('NATIONAL_PENSION_RATE', '2026-05-31');
// → { value: { total: 0.095, ... }, policy: {...}, asOfDate: '2026-05-31' }

return (
  <div>
    <div className="badge">{UI_LABEL_TEXT[summary.uiLabel]}</div>
    <div>예상 국민연금: {employee보험료}</div>
    <small>정책 버전: {npsPolicy.policy.version}</small>
  </div>
);
```

---

작성: 2026-05-12
