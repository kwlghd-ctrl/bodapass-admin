import { useState } from 'react';
import { Modal } from '../../../components/Modal';

/**
 * AuthReasonPicker — 출역 인증 사유 선택 모달.
 *
 * Phase DD2 — AttendancePage.tsx 에서 분리. 부모 state 미참조 (모든 입력/콜백을 props 로 받음).
 * 내부적으로 picked / other 만 로컬 useState 로 관리.
 */
export function AuthReasonPicker({
  memberName,
  actionLabel,
  action,
  reasonRequired,
  onClose,
  onConfirm,
}: {
  memberName: string;
  actionLabel: string;
  action: 'approved' | 'rejected' | 'confirmed';
  reasonRequired: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const PRESETS_APPROVED = [
    '현장 확인 완료',
    '반장 확인 완료',
    '근로자 확인 완료',
    '사진·CCTV 확인 완료',
  ];
  const PRESETS_REJECTED = [
    '본인 확인 불가',
    '출근시간 불일치',
    '현장 외 위치',
    '중복 출근',
  ];
  const PRESETS_CONFIRMED = [
    '현장 확인 완료',
    '반장 확인 완료',
    '근로자 확인 완료',
    '추가 검토 완료',
  ];
  const presets = action === 'approved' ? PRESETS_APPROVED
                : action === 'rejected' ? PRESETS_REJECTED
                : PRESETS_CONFIRMED;

  // 첫 프리셋을 기본 선택 — reasonRequired 인 케이스(수동/얼굴실패)에서도 사용자가
  // 한 번만 클릭하면 즉시 승인 가능하도록. 다른 프리셋이나 「기타」 선택 시 갱신.
  const [picked, setPicked] = useState<string | null>(presets[0] ?? null);
  const [other, setOther] = useState<string>('');
  const isOther = picked === '__other__';
  const finalReason = isOther ? other.trim() : (picked ?? '');
  const canSubmit = !reasonRequired || finalReason.length > 0;

  const tone = action === 'rejected' ? 'danger' : 'ok';

  return (
    <Modal
      open
      onClose={onClose}
      title={`${memberName} · ${actionLabel}`}
      subtitle={reasonRequired ? '사유를 선택하거나 직접 입력해주세요 (감사 로그에 기록됩니다)' : '사유 부가 (선택 안해도 바로 처리 가능)'}
      width={520}
      footer={
        <>
          <button type="button" className="att__btn att__btn--ghost" onClick={onClose}>취소</button>
          <button
            type="button"
            className={'att__btn ' + (tone === 'danger' ? 'att__btn--danger' : 'att__btn--primary')}
            onClick={() => onConfirm(finalReason)}
            disabled={!canSubmit}
          >
            {actionLabel}
          </button>
        </>
      }
    >
      <div className="att-reason">
        <div className="att-reason__chips">
          {presets.map((p) => (
            <button
              key={p}
              type="button"
              className={'att-reason__chip' + (picked === p ? ' is-active' : '')}
              onClick={() => setPicked(p)}
            >
              {p}
            </button>
          ))}
          <button
            type="button"
            className={'att-reason__chip att-reason__chip--other' + (isOther ? ' is-active' : '')}
            onClick={() => setPicked('__other__')}
          >
            기타 (직접 입력)
          </button>
        </div>
        {isOther && (
          <textarea
            className="att-reason__textarea"
            rows={3}
            placeholder="사유를 입력해주세요"
            value={other}
            onChange={(e) => setOther(e.target.value)}
            autoFocus
          />
        )}
      </div>
    </Modal>
  );
}
