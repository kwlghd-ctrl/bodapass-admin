# 보다패스 계산 엔진 — 데이터 contract & 변경 매핑

> Phase Q (2026-05) — 페이지·엑셀·대시보드가 모두 동일한 도메인 계산 엔진을 사용하도록 정리.
> 모든 도메인 함수는 **순수**. 외부 IO 없음. DB 가 들어와도 동일 시그니처 유지.

## 1. 신규 domain 모듈 목록 (src/domain/*)

총 **27개 파일** (테스트 제외).

### 1.1 attendance (출역) — 6
| 파일 | 역할 |
|---|---|
| `src/domain/attendance/attendance.types.ts` | AttendanceRecord / MonthlyAttendanceSummary 재노출 |
| `src/domain/attendance/attendanceDayCounter.ts` | countAttendanceDays / countPaidWorkDays / countSeveranceWorkDays / countInsuredWorkDays |
| `src/domain/attendance/attendanceAggregator.ts` | aggregateMonthlyAttendance / summarizeMonthlyAttendance |
| `src/domain/attendance/gongsuCalculator.ts` | calculateDailyGongsu / minutesToGongsu / aggregateGongsuByWorker/Site |
| `src/domain/attendance/attendancePolicy.ts` | WorkRule lookup + GongsuPolicy view |
| `src/domain/attendance/index.ts` | barrel |

### 1.2 tax (세금) — 4
| 파일 | 역할 |
|---|---|
| `src/domain/tax/dailyWorkerTax.types.ts` | DailyTaxRow / DailyIncomeTaxInput/Policy/Result |
| `src/domain/tax/dailyWorkerTaxCalculator.ts` | calculateDailyWorkerTaxRows / aggregateMonthlyWorkerTax |
| `src/domain/tax/dailyWorkerTaxPolicy.ts` | 세금 정책 조회 (lookupPolicy 래핑) |
| `src/domain/tax/index.ts` | barrel |

### 1.3 socialInsurance (4대보험) — 4
| 파일 | 역할 |
|---|---|
| `src/domain/socialInsurance/socialInsurance.types.ts` | SocialInsurancePolicy/Input/Result |
| `src/domain/socialInsurance/socialInsuranceCalculator.ts` | calculateSocialInsurance + determineInsuranceEligibility 재노출 |
| `src/domain/socialInsurance/socialInsurancePolicy.ts` | getSocialInsurancePolicyByDate |
| `src/domain/socialInsurance/index.ts` | barrel |

### 1.4 severance (퇴직공제) — 4
| 파일 | 역할 |
|---|---|
| `src/domain/severance/severanceFund.types.ts` | SeveranceFundPolicy/Input/Result, decision/confidence/source |
| `src/domain/severance/severanceFundCalculator.ts` | calculateSeveranceFund / resolveSeveranceDailyAmount / getSeveranceEligibleDays |
| `src/domain/severance/severanceFundPolicy.ts` | loadFundSetting / saveFundSetting / DEFAULT_FUND_DAILY |
| `src/domain/severance/index.ts` | barrel |

### 1.5 wageLedger (노무대장) — 4
| 파일 | 역할 |
|---|---|
| `src/domain/wageLedger/wageLedger.types.ts` | WageLedger 타입 |
| `src/domain/wageLedger/wageLedgerCalculator.ts` | calculateMonthlyWageLedger / summarizeWageLedgers |
| `src/domain/wageLedger/wageLedgerAggregator.ts` | aggregateWageLedgers (월 누적 KPI) |
| `src/domain/wageLedger/index.ts` | barrel |

### 1.6 legalPolicy (정책) — 4
| 파일 | 역할 |
|---|---|
| `src/domain/legalPolicy/legalPolicy.types.ts` | LegalPolicy/PolicyCategory/CalculationWarning |
| `src/domain/legalPolicy/legalPolicyTable.ts` | LEGAL_POLICIES / lookupPolicy / listPolicyHistory |
| `src/domain/legalPolicy/legalPolicyValidator.ts` | validateSeveranceInputs 등 + UI_LABEL_TEXT |
| `src/domain/legalPolicy/index.ts` | barrel |

### 1.7 루트 — 1
| 파일 | 역할 |
|---|---|
| `src/domain/index.ts` | `Attendance/Tax/SocialInsurance/Severance/WageLedger/LegalPolicy` 네임스페이스 export |

---

## 2. Deprecated / 이관된 src/utils 함수

| 기존 | 신규 위치 |
|---|---|
| `src/utils/gongsu.ts`                | `src/domain/attendance/gongsuCalculator.ts` (re-export) |
| `src/utils/severance.ts`             | `src/domain/severance/severanceFundPolicy.ts` (re-export) |
| `src/utils/severanceCalculation.ts`  | `src/domain/severance/severanceFundCalculator.ts` |
| `src/utils/incomeTaxDaily.ts`        | `src/domain/tax/dailyWorkerTaxCalculator.ts` |
| `src/utils/insuranceEligibility.ts`  | `src/domain/socialInsurance/socialInsuranceCalculator.ts` (re-export) |
| `src/utils/wageLedgerCalculation.ts` | `src/domain/wageLedger/wageLedgerCalculator.ts` |
| `src/utils/attendanceAggregation.ts` | `src/domain/attendance/attendanceAggregator.ts` |
| `src/utils/legalDataValidation.ts`   | `src/domain/legalPolicy/legalPolicyValidator.ts` |
| `src/mock/legalPolicies.ts`          | `src/domain/legalPolicy/legalPolicyTable.ts` |
| `src/mock/workRules.ts`              | `src/domain/attendance/attendancePolicy.ts` |

> 신규 코드는 모두 `src/domain/*` 에서 import. 기존 `src/utils/*` 는 backward compat 으로만 유지.

---

## 3. 테스트 결과 (verifier)

7개 도메인 × 다수 case, 자체 verifier 패턴 (no test runner).

| 도메인 | 케이스 수 | 주요 검증 |
|---|---|---|
| attendance | 4 | 중복 날짜, ABSENT/OFF 제외, paidWorkDays, 카운터 분리 |
| gongsu | 7 | 4시간 미만 0, 4~8h 0.5, 8~12h 1.0, 12~16h 1.5, 16h+ 2.0, MANUAL 승인 전/후 |
| dailyWorkerTax | 5 | 150k 0세, 200k 1,350, 160k 소액부징수 0, 800k 17,550, 지방세 floor(소득세×0.1) |
| socialInsurance | 4 | 전자격 → 4대 산출, NPS ineligible → 0, VERIFIED → no warn, NEEDS_VERIFICATION → warn |
| severanceFund | 5 | FORCE_6500/8700, AUTO 2026-03-31/04-01, CUSTOM 7,000 |
| wageLedger | 3 | 일수 분리 보존, netPay invariant, severanceFundAmount = 일수×일액 |
| integration | 3 | Records → Summary → Ledger, idempotency |
| **합계** | **31** | |

**호출:**
```ts
import('@/domain/__tests__').then(m => {
  const { totalPassed, totalCases, allPassed } = m.runAllDomainTests();
  console.log(`overall ${totalPassed}/${totalCases} (allPassed=${allPassed})`);
});
```

---

## 4. WageLedger 생성 결과 예시

**입력 (AttendanceRecord × 20 + Employment + Site):**
```json
{
  "attendance": [
    {
      "id": "A-1",
      "employmentId": "E-M-001",
      "workDate": "2026-05-01",
      "status": "NORMAL",
      "checkInAt": "2026-05-01T07:00:00Z",
      "checkOutAt": "2026-05-01T15:00:00Z",
      "workedMinutes": 480,
      "gongsu": 1,
      "dailyWage": 200000,
      "payAmount": 200000
    }
    /* ... 19건 동일 패턴 ... */
  ],
  "employment": { "id": "E-M-001", "workerId": "W-001", "dailyWage": 200000 },
  "site":       { "severanceFundMode": "FORCE_8700" }
}
```

**aggregateMonthlyAttendance() 출력:**
```json
{
  "employmentId": "E-M-001",
  "yearMonth": "2026-05",
  "attendanceDays": 20,
  "paidWorkDays": 20,
  "severanceWorkDays": 20,
  "gongsuTotal": 20,
  "workedMinutesTotal": 9600,
  "grossWage": 4000000,
  "dailyWageAverage": 200000,
  "status": "DRAFT",
  "warnings": []
}
```

**calculateMonthlyWageLedger() 출력:**
```json
{
  "employmentId": "E-M-001",
  "yearMonth": "2026-05",
  "workDays": 20,
  "grossWage": 4000000,
  "taxableWage": 4000000,
  "incomeTax": 27000,
  "localIncomeTax": 2700,
  "nationalPension": 190000,
  "healthInsurance": 141800,
  "longTermCareInsurance": 18362,
  "employmentInsurance": 36000,
  "deductionTotal": 415862,
  "netPay": 3584138,
  "severanceWorkDays": 20,
  "severanceFundDaily": 8700,
  "severanceFundAmount": 174000,
  "calculationStatus": "ESTIMATED",
  "lockLevel": "ESTIMATED",
  "warnings": ["..."]
}
```

> 모든 금액은 **예상값**. 화면 표시 시 「예상값 / 검증 필요」 라벨 동반.

---

## 5. AttendancePage / WagePage 호출 위치

| 화면 컴포넌트 | 호출 도메인 함수 |
|---|---|
| `MonthlyAttendancePanel` | `Attendance.aggregateMonthlyAttendance`, `Attendance.summarizeMonthlyAttendance` |
| `WageLedgerPanel` | `WageLedger.calculateMonthlyWageLedger`, `WageLedger.summarizeWageLedgers`, `WageLedger.aggregateWageLedgers` |
| `DashboardLegalKpi` | `WageLedger.aggregateWageLedgers`, `Attendance.summarizeMonthlyAttendance` |
| `SiteListPage` | `Severance.resolveSeveranceFundDaily` (일액 / 방식 / 기준일 / 상태 라벨) |
| `SeveranceFundPage` | `Severance.calculateSeveranceFund` |

**컴포넌트는 도메인 모듈만 호출 — 세금/공수/보험 직접 계산 금지.**
향후 DB 전환 시 각 panel 의 fetcher 부분만 교체하면 됨 (도메인 함수 시그니처 그대로).

---

## 6. 검증이 필요한 정책값

`confidence !== "OFFICIAL"` 또는 `requiresVerification = true` 인 정책.

| 정책 ID | confidence | requiresVerification | 비고 |
|---|---|---|---|
| `NPS-2026` (국민연금) | ASSUMED | true | 2026년 9.5% 인상안 — 확정 시 OFFICIAL 로 갱신 |
| `HI-2026` (건강보험) | ASSUMED | true | 보건복지부 고시 기준 — 검증 필요 |
| `LTC-2026` (장기요양) | ASSUMED | true | 건보료 × 12.95% 가정 |
| `EI-2026` (고용보험) | ASSUMED | true | 2025년 0.9% 유지 가정 |
| `IA-CONSTRUCTION-2026` (산재) | DEMO | true | 건설업 평균 3.6% — 업종별 다름. 회사별 입력 필요 |
| `SEVERANCE-FUND-2026-04` (퇴직공제 일액) | OFFICIAL | false | 8,700원 — 건설근로자공제회 고시 |
| `SEVERANCE-FUND-2024` (구) | OFFICIAL | false | 6,500원 |
| `INCOME-TAX-DAILY-2026` | OFFICIAL | false | 6% / 일액공제 150,000원 |

`socialInsurancePolicy.verificationStatus` 가 `NEEDS_VERIFICATION` 또는 `DEMO` 면
`calculateSocialInsurance()` 결과의 `verificationWarnings` 에 자동 경고 추가.

---

## 7. DB 전환 시 contract

도메인 함수는 **순수 함수** — DB가 들어와도 동일 시그니처 유지.

### 7.1 입력 contract
- `Site` (`src/api/site.types.ts`) — bidNoticeDate, contractDate, severanceFundMode, severanceFundCustomAmount, severanceApplicable
- `Worker` (`src/api/worker.types.ts`) — taxProfile, insuranceProfile, verification
- `Employment` (`src/api/employment.types.ts`) — workerId, siteCompanyId, dailyWage, insurance, nontaxable, *Applied flags
- `AttendanceRecord` (`src/api/attendanceV2.types.ts`) — workDate, employmentId, status, checkInAt/Out, workedMinutes, gongsu, payAmount, source

### 7.2 출력 contract
- `MonthlyAttendanceSummary` — attendanceDays/paidWorkDays/severanceWorkDays/gongsuTotal/grossWage + warnings
- `WageLedger` — gross/taxable/incomeTax/local/4대보험/deductionTotal/netPay + severanceFundAmount + lockLevel
- `TaxCalculationResult` (DailyIncomeTaxResult) — rows[] + totals + warnings
- `SocialInsuranceResult` — NPS/HI/LTC/EI/IA (근로자/사업주) + totals + verificationWarnings
- `SeveranceCalculationResult` — appliedDailyFund, amount, basisDate, policyVersion, warning[]

### 7.3 정책 테이블 (DB schema 후보)
```sql
CREATE TABLE legal_policies (
  id              VARCHAR PRIMARY KEY,
  category        VARCHAR NOT NULL,   -- NATIONAL_PENSION_RATE / HEALTH_INSURANCE_RATE / ...
  version         VARCHAR NOT NULL,
  effective_from  DATE NOT NULL,
  effective_to    DATE,
  value           JSONB NOT NULL,     -- { employee, employer, total } 또는 number
  confidence      VARCHAR NOT NULL,   -- OFFICIAL / ASSUMED / DEMO
  requires_verification BOOLEAN NOT NULL,
  source_name     VARCHAR,
  source_url      VARCHAR
);

CREATE TABLE work_rules (
  id                    VARCHAR PRIMARY KEY,
  site_id               VARCHAR,
  company_id            VARCHAR,
  standard_work_minutes INT NOT NULL,
  half_day_min_minutes  INT NOT NULL,
  one_day_min_minutes   INT NOT NULL,
  overtime_min_minutes  INT,
  max_gongsu_per_day    DECIMAL NOT NULL,
  rounding_unit         DECIMAL NOT NULL,
  lunch_break_minutes   INT,
  effective_from        DATE NOT NULL,
  effective_to          DATE
);
```

### 7.4 fetcher 교체 지점
- `src/api/*` 의 mockBackend → 실서비스 REST/GraphQL endpoint 교체
- 도메인 모듈은 무수정 — 동일 input/output 으로 작동

---

## 8. 최종 일관성 보장

> **"보다패스의 출역기록이 확정되면, 동일한 원본 데이터를 기준으로**
> **출역일수, 공수, 세금, 사회보험, 퇴직공제, 노무대장이 하나의 계산 엔진에서 일관되게 산출된다."**

- 모든 화면(AttendancePage / WagePage / DashboardPage / SeveranceFundPage)이 `src/domain/*` 만 호출.
- `src/utils/*` 는 backward compat — 새 코드 작성 금지.
- `integration.test.ts` 의 idempotency 검증 통과 — 동일 입력 → 동일 결과.
- 모든 도메인 함수는 순수 (외부 IO 없음). DB 전환 시 함수 시그니처 유지.


---

## 9. Phase S — 화면 → 도메인 records 전달 체크리스트

화면 (Panel/KPI 컴포넌트) 가 `calculateMonthlyWageLedger({ records })` 에 원본 출역기록을 전달하지 않으면 결과는 `calculationStatus: 'ESTIMATED'` 로 표시되며, 확정 신고나 엑셀 출력에 사용할 수 없다.

수동 점검 항목 (브라우저 검증 — Vitest/JSDOM 없이는 자동화 불가):

1. `src/components/legal/WageLedgerPanel.tsx`
   - `attendanceV2Api.month({ siteId, yearMonth })` 호출 후 `rows.flatMap(r => Object.values(r.daily ?? {}))` 로 records 평탄화.
   - 각 employment 마다 `records.filter(r => r.employmentId === summary.employmentId)` 로 분리.
   - `calculateMonthlyWageLedger({ ..., records: empRecords })` 형태로 전달.
   - 호출부에 문자열 `records:` 가 포함되어 있는지 확인.

2. `src/components/legal/DashboardLegalKpi.tsx`
   - 동일 패턴.
   - 모든 ledger 의 `calculationStatus === 'READY'` 인지 indicator 로 노출.

3. (확인 명령 — bash, repo root)
   ```bash
   grep -n "records:" src/components/legal/WageLedgerPanel.tsx
   grep -n "records:" src/components/legal/DashboardLegalKpi.tsx
   ```

   두 파일 모두 `calculateMonthlyWageLedger(` 근처에 `records:` 항목이 보여야 한다.

4. (실패 시)
   - records 미전달 → ledger.warnings 에 `"원본 출역기록 없음 — 세금 추정값 (확정 신고/엑셀 출력에 사용 금지)"` 가 추가됨.
   - 패널의 「READY 아님 N건」 인디케이터가 노출됨.

향후 React Testing Library + JSDOM 도입 시 이 체크리스트는 자동 테스트로 전환한다.
