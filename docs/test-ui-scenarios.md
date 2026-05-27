# test:ui 버튼 시나리오 (Phase EE5)

이 문서는 신고서·임금명세서 출력 버튼이 검증 실패 시 어떻게 차단되는지 정리한다.
대응 테스트 파일은 vitest 기반(`*.vtest.tsx`)이고, `npm run test:ui` 로 실행된다.

## 1. dispatchPayslips (카카오/SMS 발송)

**파일:** `src/pages/wage/components/PayslipDispatch.vtest.tsx`

- BLOCKED row 입력 → `prepareReportRows()` 가 `window.alert("출력 차단:...")` 후 `null` 반환
- `dispatchPayslips()` 는 `null` 분기에서 `false` 반환
- 호출자(WagePage 의 onDispatch) 는 `if (!ok) return;` 으로 "발송됐습니다" alert 차단
- 테스트 방식: `vi.spyOn(window, 'alert')` 로 alert 호출 여부 검증

## 2. buildInsuranceFiling (4대보험 신고서 다운로드)

**파일:** `src/pages/output/OutputCenter.vtest.tsx`

- `OutputCenterPage` 의 다운로드 핸들러는 `buildInsuranceFiling(..., { strictRrn: true })` 호출
- 13자리 아닌 rrn 발견 시 `Error("buildInsuranceFiling: invalid rrn... strictRrn mode")` throw
- 호출자의 try/catch 가 잡아서 `window.alert("신고서 생성 실패: ...")` 표시
- 파일 다운로드 (`downloadInsuranceFilingXlsx`) 는 호출되지 않음
- 테스트 방식: `expect(() => buildInsuranceFiling(...)).toThrow(/strictRrn/)`

## 3. printPayslips (임금명세서 인쇄)

**파일:** `src/pages/wage/PrintPayslips.vtest.tsx`

- BLOCKED row 입력 → `prepareReportRows()` null 반환 → `printPayslips()` false 반환
- 호출자(PayslipIssueDialog 의 onPrint 핸들러):
  ```ts
  onPrint={() => {
    const ok = printPayslips(filteredRows, data, yearMonth);
    if (!ok) return;            // ← false 시 모달 유지
    setIssueOpen(false);        // ← true 시에만 모달 닫음
  }}
  ```
- 테스트 방식: `setIssueOpen` 을 `vi.fn()` 으로 모킹하고 호출 여부 검증

## 4. wageReportValidator 자체 무결성 검증

**파일:** `src/utils/wageReportValidator.vtest.ts` (Phase EE2 에서 fixture 재작성)

- filterReportRows: BLOCKED 0-출역 row 제외 확인
- validateReportInput: dailyTaxRows 합계 == row.deduction* 합계 검증
- READY fixture 는 `incomeTax:100 / localIncomeTax:10 / totalTax:110` 으로 정확히 매칭

## 실행

```bash
npm run test:ui
```

vitest 가 jsdom 환경에서 위 시나리오를 실행한다.
`npm test` (tsx 도메인 러너) 는 vtest 파일을 실행하지 않는다 — 도메인 verifier 와 분리되어 있다.

## 인프라 의존성

- 실행 환경에 `node_modules/` 가 풀려 있어야 함 (Linux/macOS).
- Windows + OneDrive 동기화 환경에서는 `npm install` 시 ENOTEMPTY 가 간헐 발생할 수 있다.
  재시도하거나, CI(GitHub Actions Linux) 에서 실행한다.
