// FILE_VERSION 1778000000
// Phase CC4 — TeamListPage 에서 분리한 얼굴인증 요청 다이얼로그.
// 순수 props 기반 — 부모 상태 의존 없음.
import { useState } from 'react';
import { Modal } from '../../../components/Modal';
import type { TeamMember } from '../../../api/team.types';
import type { Foreman } from '../../../api/site.types';

export function FaceVerifyRequestDialog({
  member,
  foreman,
  siteName,
  onClose,
  onSent,
}: {
  member: TeamMember;
  foreman: Foreman | null;
  siteName: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const [sending, setSending] = useState(false);
  const targetName = foreman ? `${foreman.name} 반장` : '현장담당자';
  const targetPhone = foreman?.phone || '현장담당자';
  const messageBody =
    `[보다패스] ${targetName}님,\n` +
    `${siteName}\n${member.name}님(${member.phone})의\n얼굴인증이 아직 완료되지 않았습니다.\n\n` +
    `출퇴근 본인확인을 위해 다음 출근 시 사진 등록을 완료할 수 있도록 안내 부탁드립니다.\n\n` +
    `* 인증 안내 링크: https://bodapass.app/face/${member.id}`;

  async function handleSend() {
    setSending(true);
    try {
      await new Promise((r) => setTimeout(r, 300));
      window.alert(
        `${targetName}(${targetPhone})에게\n` +
          `${member.name}님의 얼굴인증 요청이 발송되었습니다.`,
      );
      onSent();
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="얼굴인증 요청 발송"
      subtitle={`${member.name} · ${siteName}`}
      width={520}
      footer={
        <div className="med__cta">
          <button type="button" className="team-list__btn team-list__btn--ghost" onClick={onClose} disabled={sending}>
            취소
          </button>
          <button type="button" className="team-list__btn team-list__btn--primary" onClick={handleSend} disabled={sending}>
            {sending ? '발송 중…' : '📧 요청 발송'}
          </button>
        </div>
      }
    >
      <div className="med">
        <div className="med__row">
          <label>요청 대상</label>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{targetName}</div>
            <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginTop: 2 }}>
              {foreman ? `${foreman.phone} · ${foreman.role || '반장'}` : '반장 미배정 — 현장담당자가 직접 처리'}
            </div>
          </div>
        </div>

        <div className="med__row" style={{ alignItems: 'flex-start' }}>
          <label style={{ paddingTop: 6 }}>메시지 미리보기</label>
          <pre
            style={{
              margin: 0,
              padding: '10px 12px',
              background: 'var(--color-bg-soft)',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              fontSize: 12,
              fontFamily: 'inherit',
              whiteSpace: 'pre-wrap',
              lineHeight: 1.5,
              color: 'var(--color-text)',
            }}
          >
            {messageBody}
          </pre>
        </div>
      </div>
    </Modal>
  );
}
