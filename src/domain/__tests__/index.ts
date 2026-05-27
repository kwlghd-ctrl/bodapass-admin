/**
 * src/domain/__tests__/index — 도메인 verifier 일괄 실행
 *
 * 브라우저 콘솔:
 *   import('@/domain/__tests__').then(m => m.runAllDomainTests())
 *
 * Node (Phase R5):
 *   npm test   (scripts/run-domain-tests.ts 진입점)
 */
import type { VerificationResult } from '../../utils/__verify__/calculationVerifier';
import { verifyAllAttendance } from './attendance.test';
import { verifyAllGongsu } from './gongsu.test';
import { verifyAllDailyWorkerTax } from './dailyWorkerTax.test';
import { verifyAllSocialInsurance } from './socialInsurance.test';
import { verifyAllSeveranceFund } from './severanceFund.test';
import { verifyAllWageLedger } from './wageLedger.test';
import { verifyAllIntegration } from './integration.attendanceToWageLedger.test';

export interface DomainTestReport {
  domain: string;
  results: VerificationResult[];
  passed: number;
  total: number;
}

export function runAllDomainTests(): {
  reports: DomainTestReport[];
  totalPassed: number;
  totalCases: number;
  allPassed: boolean;
} {
  const runners: Array<{ domain: string; run: () => VerificationResult[] }> = [
    { domain: 'attendance', run: verifyAllAttendance },
    { domain: 'gongsu', run: verifyAllGongsu },
    { domain: 'dailyWorkerTax', run: verifyAllDailyWorkerTax },
    { domain: 'socialInsurance', run: verifyAllSocialInsurance },
    { domain: 'severanceFund', run: verifyAllSeveranceFund },
    { domain: 'wageLedger', run: verifyAllWageLedger },
    { domain: 'integration', run: verifyAllIntegration },
  ];

  const reports: DomainTestReport[] = [];
  let totalPassed = 0;
  let totalCases = 0;

  for (const r of runners) {
    const results = r.run();
    const passed = results.filter((x) => x.pass).length;
    reports.push({ domain: r.domain, results, passed, total: results.length });
    totalPassed += passed;
    totalCases += results.length;
  }

  // Node + 브라우저 양쪽에서 동일하게 보이도록 plain log 사용 (console.group 제거).
  console.log(`[bodapass] runAllDomainTests — overall ${totalPassed}/${totalCases}`);
  for (const rep of reports) {
    console.log(`  ${rep.passed === rep.total ? 'OK ' : 'FAIL'} ${rep.domain} ${rep.passed}/${rep.total}`);
  }

  return {
    reports,
    totalPassed,
    totalCases,
    allPassed: totalPassed === totalCases,
  };
}

export {
  verifyAllAttendance,
  verifyAllGongsu,
  verifyAllDailyWorkerTax,
  verifyAllSocialInsurance,
  verifyAllSeveranceFund,
  verifyAllWageLedger,
  verifyAllIntegration,
};
