/**
 * AttendancePage 페이지 내부 타입 모음.
 *
 * Phase DD2 — AttendancePage.tsx 에서 분리. 행위/계산 없는 순수 타입 선언.
 * 페이지 외부에서 import 하는 경우는 없으며, 내부 컴포넌트와 hook 들이 공유.
 */

import type { SubVerifyChannel } from '../../utils/subVerifyRequest';

/** 멤버 정렬 키 — MemberSummaryList / AttSortTh 가 사용. */
export type AttSortKey = 'name' | 'role' | 'gongsu' | 'days';

/** 엑셀 업로드 양식 모드. */
export type UploadFormat = 'INPUT' | 'LEDGER';

/** 출역확인 요청 모달 상태. */
export interface SubVerifyRequestModalState {
  siteCompanyId: string;
  companyName: string;
  siteName: string;
  memberCount: number;
  todayTotal: number;
  todayWorking: number;
  message: string;
  channels: SubVerifyChannel[];
  sending: boolean;
}
