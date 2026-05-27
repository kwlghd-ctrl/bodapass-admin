#!/usr/bin/env tsx
/**
 * scripts/run-domain-tests.ts — Node 환경 도메인 verifier 러너 (Phase R5)
 *
 * 실행:
 *   npm test
 *
 * tsx 가 설치되어 있어야 한다. (devDependencies 참고)
 * 모든 도메인 verifier 를 호출하고 pass/fail 집계 후 exit code 로 반환한다.
 *   - 전부 pass → exit 0
 *   - 1건이라도 fail → exit 1
 *
 * 브라우저 전용 console.group 출력은 plain console.log 로 대체한다.
 */
import { runAllDomainTests } from '../src/domain/__tests__/index';

// Node 에서도 console.group 은 동작하지만 출력이 모호하므로 plain log 로 재구성.
const report = runAllDomainTests();

console.log('');
console.log('==================================================');
console.log(' bodapass domain verifier — summary');
console.log('==================================================');
console.log(
  ` overall : ${report.totalPassed}/${report.totalCases} ${report.allPassed ? 'PASS' : 'FAIL'}`,
);
console.log('--------------------------------------------------');
for (const rep of report.reports) {
  const mark = rep.passed === rep.total ? 'PASS' : 'FAIL';
  console.log(
    ` ${mark}  ${rep.domain.padEnd(20)} ${String(rep.passed).padStart(3)}/${String(rep.total).padEnd(3)}`,
  );
  if (rep.passed !== rep.total) {
    for (const r of rep.results) {
      if (!r.pass) {
        console.log(`        ✗ ${r.case}`);
        console.log(`           expected: ${JSON.stringify(r.expected)}`);
        console.log(`           actual  : ${JSON.stringify(r.actual)}`);
        if (r.note) console.log(`           note    : ${r.note}`);
      }
    }
  }
}
console.log('==================================================');

process.exit(report.allPassed ? 0 : 1);
