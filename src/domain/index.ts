/**
 * src/domain — Phase Q 도메인 계산 엔진 (사용자 spec).
 *
 * 모든 페이지/대시보드/엑셀 출력은 본 모듈만 사용한다.
 * 화면 컴포넌트 안에서 직접 세금/공수/보험 계산 금지.
 *
 * 기존 src/utils 파일들은 backward compat 을 위해 유지하되,
 * 새 코드는 본 도메인 모듈에서 import 한다.
 */
export * as Attendance from './attendance';
export * as Tax from './tax';
export * as SocialInsurance from './socialInsurance';
export * as Severance from './severance';
export * as WageLedger from './wageLedger';
export * as LegalPolicy from './legalPolicy';
