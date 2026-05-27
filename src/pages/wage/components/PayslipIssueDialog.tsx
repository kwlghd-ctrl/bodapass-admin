import { Modal } from '../../../components/Modal';

export function PayslipIssueDialog({
  count,
  yearMonth,
  onClose,
  onPrint,
  onKakao,
  onSms,
}: {
  count: number;
  yearMonth: string;
  onClose: () => void;
  onPrint: () => void;
  onKakao: () => void;
  onSms: () => void;
}) {
  const options: Array<{
    icon: string;
    label: string;
    sub: string;
    onClick: () => void;
  }> = [
    { icon: '🖨', label: '출력', sub: 'PDF 새 창 → 인쇄', onClick: onPrint },
    { icon: '💬', label: '카카오톡', sub: '등록된 연락처로 일괄 발송', onClick: onKakao },
    { icon: '📱', label: 'SMS', sub: '카톡 미가입자 대비 일괄 발송', onClick: onSms },
  ];
  return (
    <Modal
      open
      onClose={onClose}
      title="임금명세서 일괄 발행"
      subtitle={`${yearMonth} · 대상 ${count}명`}
      width={520}
    >
      <p className="payslip-dlg__hint">
        선택한 방식으로 임금명세서를 일괄 발행/발송합니다.
      </p>
      <div className="payslip-dlg__grid">
        {options.map((o) => (
          <button
            key={o.label}
            type="button"
            className="payslip-dlg__opt"
            onClick={o.onClick}
          >
            <span className="payslip-dlg__opt-icon" aria-hidden>{o.icon}</span>
            <span className="payslip-dlg__opt-label">{o.label}</span>
            <span className="payslip-dlg__opt-sub">{o.sub}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
