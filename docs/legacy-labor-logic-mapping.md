# 운영 시스템 노무 로직 → bodapass_admin (mock) 매핑

본 문서는 기존 운영형 시스템의 출역·노임·공제 계산 로직이 현재 bodapass_admin mock 구현에 어떻게 이식되어 있는지를 1:1로 매핑한 참고 문서입니다.
실 DB 전환 시 본 매핑을 기준으로 운영 테이블과 mock localStorage 키를 대응시킵니다.

---

## 1. 출역 / 공수 / 노임 — 필드 매핑

| 운영 (legacy)              | mock (bodapass_admin)                              | 비고 |
|----------------------------|----------------------------------------------------|------|
| `ATD_DT` (출근일)          | `AttendanceRecord.attendanceDate`                  | YYYY-MM-DD |
| `CKIN_DT_TM` (출근시각)    | `AttendanceRecord.checkInTime`                     | HH:MM:SS |
| `CKOT_DT_TM` (퇴근시각)    | `AttendanceRecord.checkOutTime`                    | HH:MM:SS |
| `WK_MIN` (실근로분)        | `AttendanceRecord.workedMinutes`                   | 휴게 차감 |
| `GNGS_VAL` (공수)          | `AttendanceRecord.gongsuValue`                     | 0.5 / 1.0 단위 |
| `GNGS_BSS` (공수산정근거)  | `AttendanceRecord.gongsuBasis`                     | AUTO_TIME / MANUAL_APPROVED / IMPORTED / BLOCKED |
| `FACE_RECOG_YN`            | `AttendanceRecord.faceVerified`                    | 얼굴인식 출역 여부 |
| `ECARD_TAG_YN`             | `AttendanceRecord.eCardTagged`                     | 전자카드 태그 여부 |
| `MTCH_AMT_SUM` (월급여)    | `MonthlyAttendanceSummary.grossWage`               | 출역일수 × 일당 (또는 record.payAmount 합) |
| `INCM_AMT_SUM` (원천공제)  | `WageLedger.incomeTax`                             | 일용 6% × (일급-15만원) |
| `LOCAL_TAX_SUM`            | `WageLedger.localIncomeTax`                        | 소득세 × 10% |
| `NPS_AMT` (국민연금)       | `WageLedger.nationalPension`                       | taxableWage × 4.75% (2026) |
| `HI_AMT` (건강보험)        | `WageLedger.healthInsurance`                       | taxableWage × 3.545% (2026) |
| `LTC_AMT` (장기요양)       | `WageLedger.longTermCareInsurance`                 | healthInsurance × 12.95% |
| `EI_AMT` (고용보험)        | `WageLedger.employmentInsurance`                   | taxableWage × 0.9% (2026) |
| `IA_AMT` (산재보험)        | `WageLedger.industrialAccidentInsurance`           | 사업주 100% — 보고용 필드 |
| `DDCT_SUM` (공제합)        | `WageLedger.deductionTotal`                        | 세금 + 4대보험 (근로자분) |
| `NET_PAY`                  | `WageLedger.netPay`                                | grossWage - deductionTotal |
| `SEVR_DAYS`                | `WageLedger.severanceWorkDays`                     | 퇴직공제 산정 일수 (출역일수와 동일 가능) |
| `SEVR_DAILY`               | `WageLedger.severanceFundDaily`                    | 6,500 또는 8,700원 |
| `SEVR_AMT`                 | `WageLedger.severanceFundAmount`                   | severanceWorkDays × severanceFundDaily |
| `LOCK_LV_TP`               | `WageLedger.lockLevel`                             | DRAFT/ESTIMATED/CONFIRMED/CLOSED |

---

## 2. 출역 집계 흐름 — legacy SP → mock 함수

| 운영 SP / Job                              | mock 함수                                    | 위치 |
|--------------------------------------------|----------------------------------------------|------|
| `SP_DAILY_AGGR_GONGSU` (일별 공수 산정)    | `calcGongsu(record, workRule)`               | `src/utils/calcGongsu.ts` |
| `SP_MONTHLY_AGGR_ATTENDANCE`               | `aggregateMonthlyAttendance(records, ...)`   | `src/utils/attendanceAggregation.ts` |
| `SP_MONTHLY_AGGR_WAGE`                     | `calculateMonthlyWageLedger(input)`          | `src/utils/wageLedgerCalculation.ts` |
| `SP_SEVERANCE_FUND_CALC`                   | `calculateSeveranceFund(input)`              | `src/utils/severanceCalculation.ts` |
| `SP_DURUNURI_ELIGIBILITY`                  | `duruunuri.evaluateEligibility(...)`         | `src/utils/duruunuri.ts` |
| `SP_INCOME_TAX_CALC` (일용직 원천세)       | wageLedgerCalculation 내부 4단계             | `src/utils/wageLedgerCalculation.ts` |

---

## 3. 정책 수치 — 코드 박힘 → 정책 테이블 조회

운영 시스템에서 코드 중간에 박혀 있던 수치들은 `LEGAL_POLICIES` 테이블 (mock) 로 분리되어 `lookupPolicy(category, asOfDate)` 로 조회됩니다.

| 운영 상수                       | 정책 카테고리                  | 2026 값                                        |
|---------------------------------|--------------------------------|------------------------------------------------|
| `CONST_FUND_DAILY_NEW`          | `SEVERANCE_FUND_DAILY`         | 8,700원 (2026-04-01 이후)                      |
| `CONST_FUND_DAILY_OLD`          | `SEVERANCE_FUND_DAILY`         | 6,500원 (2026-04-01 이전)                      |
| `CONST_NPS_RATE`                | `NATIONAL_PENSION_RATE`        | 9.5% (사업주 4.75% + 근로자 4.75%)             |
| `CONST_HI_RATE`                 | `HEALTH_INSURANCE_RATE`        | 7.09% (사업주 3.545% + 근로자 3.545%)          |
| `CONST_LTC_RATE`                | `LONG_TERM_CARE_RATE`          | 12.95% (건강보험료 기준)                       |
| `CONST_EI_RATE`                 | `EMPLOYMENT_INSURANCE_RATE`    | 1.8% (사업주 0.9% + 근로자 0.9%)               |
| `CONST_IA_RATE`                 | `INDUSTRIAL_ACCIDENT_RATE`     | 3.6% (건설업 평균 — DEMO)                      |
| `CONST_DURU_WAGE_LIMIT`         | `DURUNURI_WAGE_CEILING`        | 270만원 미만                                   |
| `CONST_DURU_SUPPORT_RATE`       | `DURUNURI_SUPPORT_RATE`        | 신규 80% / 기존 0% (legacy 40%)                |
| `CONST_NONTAX_MEAL`             | `NONTAX_MEAL_LIMIT`            | 월 20만원                                      |
| `CONST_NONTAX_VEHICLE`          | `NONTAX_VEHICLE_LIMIT`         | 월 20만원                                      |
| `CONST_NONTAX_CHILDCARE`        | `NONTAX_CHILDCARE_LIMIT`       | 6세 이하 자녀 1인당 월 20만원                  |
| `CONST_INCOME_TAX_DAILY`        | `INCOME_TAX_RATE_DAILY`        | 6% (일급 15만원 공제 후 초과분)                |
| `CONST_LOCAL_TAX`               | `LOCAL_TAX_RATE`               | 소득세의 10%                                   |

---

## 4. 퇴직공제부금 일액 결정 — 4-mode 선택

운영에서는 단일 글로벌 상수 `SEVR_FUND_DAILY` 였으나, bodapass_admin 에서는 4-mode 선택 + 현장별 override 구조로 확장:

```
우선순위:
  Site.severanceFundMode (현장 override)
    └─> 없으면 SettingsPage 의 SeveranceFundSetting (전역)
          └─> 없으면 AUTO_BY_SITE_DATE (현장 날짜 자동 판단)
                └─> 날짜 없으면 8,700원 가정 (보수적)
```

| 모드                | 일액 결정                                                       |
|---------------------|------------------------------------------------------------------|
| `AUTO_BY_SITE_DATE` | 현장 bidNoticeDate (없으면 contractDate) ≥ 2026-04-01 → 8,700 / else 6,500 |
| `FORCE_6500`        | 항상 6,500원                                                     |
| `FORCE_8700`        | 항상 8,700원                                                     |
| `CUSTOM`            | `customAmount` (시연·예외 현장)                                  |

해당 로직은 `src/utils/severance.ts` 의 `resolveSeveranceFundDaily()` 에 구현되어 있으며, 결정 결과에는 `confidence` (high/medium/low) 와 `warning` 메시지가 포함됩니다.

---

## 5. CloseStage / lockLevel — legacy 마감 흐름 매핑

| 운영                      | mock                              | 의미                                       |
|---------------------------|-----------------------------------|---------------------------------------------|
| `STG_OPEN`                | `OPEN`                            | 작성 중                                     |
| `STG_FOREMAN_CONFIRMED`   | `FOREMAN_CONFIRMED`               | 반장 확정 (출역 잠금)                       |
| `STG_HQ_REVIEWED`         | `HQ_REVIEWED`                     | 본사 1차 검토 (공수 잠금)                   |
| `STG_TAX_CALCULATED`      | `TAX_CALCULATED`                  | 세금 / 보험 계산 완료                       |
| `STG_PAY_DECIDED`         | `PAY_DECIDED`                     | 노임 결재 — 실 지급 확정                    |
| `STG_CLOSED`              | `CLOSED`                          | 월 마감 — 모든 필드 수정 불가               |
| `LOCK_LV_DRAFT`           | `lockLevel: 'DRAFT'`              | 자동 산정 미실행                            |
| `LOCK_LV_ESTIMATED`       | `lockLevel: 'ESTIMATED'`          | 자동 산정 결과 — 검토 전                    |
| `LOCK_LV_CONFIRMED`       | `lockLevel: 'CONFIRMED'`          | 본사 확정 (수정 불가)                       |
| `LOCK_LV_CLOSED`          | `lockLevel: 'CLOSED'`             | 월 마감 후 — 시스템 잠금                    |

---

## 6. 「확정값」 → 「예상값」 라벨 정책

운영 화면에서 "확정 신고금액" 으로 표시되던 모든 계산값은, mock 단계에서는 「예상값」 또는 「검증 필요」 로 표시합니다.

- `UI_LABEL_TEXT.CONFIRMED` = "기준정보 충족 — 예상값"
- `UI_LABEL_TEXT.ESTIMATED` = "일부 기준정보 누락 — 검증 필요"
- `UI_LABEL_TEXT.BLOCKED`   = "계산 불가 — 필수 데이터 누락"

위치: `src/utils/legalDataValidation.ts`

---

## 참고

- 본 매핑은 mock 단계의 추적용. 실서비스 전환 시 `docs/mock-to-database-migration-plan.md` 와 함께 참조.
- 계산 흐름 도식은 `docs/wage-and-tax-calculation-flow.md` 참조.
