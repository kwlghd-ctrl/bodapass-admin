import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Phase BB5 — Vitest + React Testing Library 컴포넌트 테스트 인프라
 *
 * 실행: npm run test:ui
 *   (별도 스크립트. 기존 `npm test` = tsx 도메인 verifier 는 그대로 유지)
 *
 * 주의:
 *   - 신규 devDependency 추가만 한 상태이므로 `npm install` 이후 실행 가능.
 *   - 파일 패턴은 `*.vtest.{ts,tsx}` — 기존 `src/domain/__tests__/*.test.ts`
 *     (verifier 패턴, tsc 가 type-check 함) 와 충돌하지 않도록 분리.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    // ⚠ 패턴 주의:
    //   - vitest 표준 test 파일은 *.vtest.{ts,tsx} 한정.
    //   - 자체 도메인 verifier 들 (src/domain/__tests__/*.test.ts) 는
    //     scripts/run-domain-tests.ts 가 tsx 로 실행. vitest 가 잡으면 fail.
    include: ['src/**/*.vtest.{ts,tsx}'],
    exclude: [
      'node_modules',
      'dist',
      'build',
      '.git',
      'src/domain/__tests__/**',
      'src/**/*.test.{ts,tsx}',   // .test 패턴은 vitest 가 손대지 않음
      'scripts/**',
    ],
    // Vitest 가 자동 디스커버하는 default include 도 끔
    typecheck: { enabled: false },
  },
});
