# 노임 · 세금 · 보험 · 퇴직공제 계산 흐름

본 문서는 출역 raw 데이터 (AttendanceRecord) 가 화면에 표시되는 「예상 노임명세」 까지 어떻게 변환되는지의 전체 데이터 플로우를 도식화합니다.

---

## 0. 전체 흐름 도식

```
┌─────────────────────────┐
│ AttendanceRecord[]      │   ← 얼굴인식·전자카드·수동·반장보정·관리자보정
│ (일별 출역 raw)         │
└──────────┬──────────────┘
           │
           │  aggregateMonthlyAttendance()
           │  ─ 일별 공수 합산, 출역일수 / 퇴직공제 산정일수 분리
           ▼
┌─────────────────────────┐
│ MonthlyAttendanceSummary│   ← 월별 집계 (employmentId × yearMonth)
│  · attendanceDays       │
│  · paidWorkDays         │
│  · severanceWorkDays    │
│  · gongsuTotal          │
│  · grossWage            │
│  · status (ESTIMATED..) │
└──────────┬──────────────┘
           │
           │  calculateMonthlyWageLedger()  ← 정책 lookupPolicy() 호출
           │  ─ 비과세 한도, 4대보험율, 일용 소득세 6%, 지방세 10%
           ▼
┌─────────────────────────┐
│ WageLedger              │   ← 「월별 노임명세」 행 (화면 표시 단위)
│  · grossWage            │
│  · nonTaxableAmount     │
│  · taxableWage          │
│  · incomeTax            │
│  · localIncomeTax       │
│  · nationalPension      │
│  · healthInsurance      │
│  · longTermCareInsurance│
│  · employmentInsurance  │
│  · industrialAccident…  │ (사업주 100% — 공제 0)
│  · deductionTotal       │
│  · netPay               │
│  · severanceFund…       │
│  · calculationStatus    │
│  · lockLevel            │
│  · policyVersion        │
│  · warnings             │
└──────────┬──────────────┘
           │
           │  (옵션) 세부 결과 객체 — 화면 모달·내보내기용
           ▼
┌─────────────────────────────────────────────────────────────────────┐
│ TaxCalculationResult │ InsuranceCalculationResult │ SeveranceCalc..  │
│  · 소득세            │  · 4대보험 (모두 「예상값」) │  · 퇴직공제부금  │
│  · 지방세            │  · employerTotal           │  · appliedDailyFund │
│  · netPay            │  · employeeTotal           │  · amount         │
│  · warning[]         │  · warning[]               │  · warning[]      │
└─────────────────────────────────────────────────────────────────────┘
           │
           │  화면 표시 — 「예상 노임」 / 「예상 보험료」 라벨
           ▼
┌─────────────────────────┐
│ WagePage                │   ← summarizeWageLedgers() 로 hero KPI 산출
│ MonthlyClosePage        │
│ SeverancePage           │
└─────────────────────────┘
```

---

## 1. 단계별 상세

### Stage A : AttendanceRecord → MonthlyAttendanceSummary

**파일**: `src/utils/attendanceAggregation.ts`
**함수**: `aggregateMonthlyAttendance(records, employments, options)`

핵심 처리:

1. employmentId × yearMonth 로 그룹핑
2. 일별 공수(`gongsuValue`) 합산 → `gongsuTotal`
3. 출역일수 분리:
   - `attendanceDays` : 출근 기록이 있는 일자 (중복 제거)
   - `paidWorkDays`   : 노임 지급 대상 일수 (반장확정 + 본사검토 통과만)
   - `severanceWorkDays` : 퇴직공제 산정 일수 (기본은 attendanceDays 와 동일하나 별도 보정 가능)
4. 검증 워닝 추가:
   - 동일 일자 중복 출역
   - checkOut 누락
   - gongsuValue=0 인 비정상 기록

산출: `MonthlyAttendanceSummary[]`

### Stage B : MonthlyAttendanceSummary → WageLedger

**파일**: `src/utils/wageLedgerCalculation.ts`
**함수**: `calculateMonthlyWageLedger({ summary, employment, worker, site })`

처리 순서 (12 단계):

```
1.  grossWage              = summary.grossWage  (또는 record.payAmount 합)
2.  nonTaxableAmount       = totalNontaxable(employment.nontaxable, ctx)
                             (식대·자가운전·보육수당 등 한도 적용)
3.  taxableWage            = max(0, grossWage - nonTaxableAmount)
4.  incomeTax              = ⌊(평균일급 - 150,000) × 6%⌋ × paidWorkDays
                             (employment.taxApplied !== false 일 때만)
5.  localIncomeTax         = ⌊incomeTax × 10%⌋
6.  nationalPension        = ⌊taxableWage × 4.75%⌋     (2026)
7.  healthInsurance        = ⌊taxableWage × 3.545%⌋    (2026)
    longTermCareInsurance  = ⌊healthInsurance × 12.95%⌋
8.  employmentInsurance    = ⌊taxableWage × 0.9%⌋      (2026)
9.  industrialAccident…    = ⌊taxableWage × 3.6%⌋      (사업주 100%, 보고용)
10. deductionTotal         = incomeTax + localIncomeTax + 4대보험(근로자분)
11. netPay                 = max(0, grossWage - deductionTotal)
12. severanceFundAmount    = severanceWorkDays × resolveSeveranceFundDaily(...).fundDaily
                             (employment.severanceApplied !== false && site.severanceApplicable !== false 일 때)
```

특이사항:
- 모든 요율은 `lookupPolicy(category, yearMonth-01)` 로 조회 — 정책 변경 추적 가능
- `policyVersion` 에 사용된 정책 버전 식별자 누적 (예: `NPS-2026-v1 / HI-2026-v1 / EI-2026-v1`)
- `calculationStatus`:
  - `READY`     : 모든 데이터 충족 + 워닝 없음
  - `ESTIMATED` : 일부 데이터 누락 또는 추정값 사용
  - `BLOCKED`   : grossWage=0 또는 paidWorkDays=0
- `lockLevel`: 외부에서 강제하지 않으면 `ESTIMATED`

### Stage C : 별도 결과 객체 (세부 표시·내보내기 용)

이 객체들은 WageLedger 의 부분 정보를 「확인·검증 가능한」 형태로 재구성한 것입니다. 신고서·정산서 발행 시 사용.

#### TaxCalculationResult
**파일**: `src/api/legal.types.ts`
**필드**: `incomeTax`, `localIncomeTax`, `netPay`, `policyVersion`, `warning[]`

#### InsuranceCalculationResult
**파일**: `src/api/legal.types.ts`
**필드**: `nationalPension`, `healthInsurance`, `longTermCareInsurance`, `employmentInsurance`, `industrialAccidentInsurance`, `employerTotal`, `employeeTotal`, `warning[]`

#### SeveranceCalculationResult
**파일**: `src/api/legal.types.ts`
**계산**: `src/utils/severanceCalculation.ts` 의 `calculateSeveranceFund({ employmentId, yearMonth, severanceWorkDays, site, globalSetting })`
**필드**: `appliedDailyFund`, `amount`, `basisDate`, `policyVersion`, `warning[]`

### Stage D : 화면 표시 (hero KPI)

**파일**: `src/utils/wageLedgerCalculation.ts`
**함수**: `summarizeWageLedgers(ledgers): { grossWage, deductionTotal, netPay, severanceFundAmount }`

WagePage 의 상단 KPI 카드와 MonthlyClosePage 합계행에 사용.

화면 라벨:
- 항상 「예상」 prefix (예: 「예상 노임」, 「예상 보험료」)
- 워닝 1건 이상 → 「확정 신고 전 검증 필요」 배지
- error severity 워닝 → 신고 진행 차단

---

## 2. 검증 (Validation) 위치

| 검증 대상         | 함수                              | 파일 |
|-------------------|-----------------------------------|------|
| 퇴직공제 입력     | `validateSeveranceInputs()`       | `src/utils/legalDataValidation.ts` |
| 4대보험 입력      | `validateInsuranceInputs()`       | 〃 |
| 소득세 입력       | `validateTaxInputs()`             | 〃 |
| 두루누리 입력     | `validateDurunuriInputs()`        | 〃 |
| 마감/준공 입력    | `validateCloseInputs()`           | 〃 |

각 검증 함수는 `CalculationWarning[]` 을 반환하며, 결과 객체의 `warning` 필드에 포함됩니다.

화면 표시는 `summarizeWarnings(warnings)` 헬퍼로 다음을 구분:

- `BLOCKED`   : error 1건 이상 — 신고 진행 차단
- `ESTIMATED` : warning 만 — 「검증 필요」 안내
- `CONFIRMED` : 모두 충족 — 「기준정보 충족 — 예상값」 표시

---

## 3. 테스트 케이스 예시

### Case 1 : 20일 출역, 일당 200,000원, 2026-04-01 이후 신규공사

```
attendanceDays = 20
paidWorkDays   = 20
severanceWorkDays = 20
grossWage      = 4,000,000
nonTaxableAmount = 200,000 (식대 한도)
taxableWage    = 3,800,000
incomeTax      = ⌊(200,000 - 150,000) × 6%⌋ × 20 = 3,000 × 20 = 60,000
localIncomeTax = 6,000
nationalPension = ⌊3,800,000 × 4.75%⌋ = 180,500
healthInsurance = ⌊3,800,000 × 3.545%⌋ = 134,710
longTermCare    = ⌊134,710 × 12.95%⌋ = 17,444
employmentIns   = ⌊3,800,000 × 0.9%⌋ = 34,200
deductionTotal  = 60,000 + 6,000 + 180,500 + 134,710 + 17,444 + 34,200 = 432,854
netPay          = 4,000,000 - 432,854 = 3,567,146
severanceFund   = 20 × 8,700 = 174,000
```

### Case 2 : 같은 조건이지만 2026-04-01 이전 공사

```
severanceFund   = 20 × 6,500 = 130,000
```

### Case 3 : Site.severanceFundMode = 'FORCE_6500'

```
severanceFund   = 20 × 6,500 = 130,000  (현장 override 우선)
```

### Case 4 : Site.severanceFundMode = 'CUSTOM', customAmount = 7,500

```
severanceFund   = 20 × 7,500 = 150,000
```

---

## 4. 책임 분리 요약

| 단계 | 책임                                       | 산출물                          |
|------|--------------------------------------------|----------------------------------|
| A    | 출역 raw → 월별 출역 요약                  | `MonthlyAttendanceSummary`       |
| B    | 월별 요약 → 노임명세 (정책 + 비과세 적용)  | `WageLedger`                     |
| C    | 노임명세 → 신고용 세부 객체                | `Tax / Insurance / Severance Result` |
| D    | 노임명세[] → 화면 합계                     | `summarizeWageLedgers` 결과       |

각 단계는 독립적으로 테스트 가능하며, 실 DB 전환 시에도 함수 시그니처는 그대로 유지하고 내부에서 `lookupPolicy()` 를 DB 호출로 대체합니다.

---

## 참고

- 정책 테이블: `src/mock/legalPolicies.ts`
- 정책 카테고리 / 결과 타입: `src/api/legal.types.ts`
- 운영 시스템과의 매핑: `docs/legacy-labor-logic-mapping.md`
- DB 전환 계획: `docs/mock-to-database-migration-plan.md`
