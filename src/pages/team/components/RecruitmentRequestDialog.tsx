import { useState } from 'react';
import { Modal } from '../../../components/Modal';
import { localDateStr } from '../../../utils/dateLocal';
import { useAuth } from '../../../hooks/useAuth';
import type { TeamMember } from '../../../api/team.types';
import type { Foreman, Site } from '../../../api/site.types';

/**
 * RecruitmentRequestDialog — 인력 요청 다이얼로그.
 *
 * Phase DD3 — TeamListPage.tsx 에서 분리.
 * 부모 state 미참조: 모든 입력은 props (availableMembers / allMembers / foremen / sites / onClose) 로 받고,
 * 내부적으로 폼/미리보기 state 만 useState 로 관리. 부모 setter 호출 없음.
 */
export function RecruitmentRequestDialog({
  availableMembers,
  allMembers,
  foremen,
  sites,
  onClose,
}: {
  availableMembers: TeamMember[];
  allMembers: TeamMember[];
  foremen: Foreman[];
  sites: Site[];
  onClose: () => void;
}) {
  const inProgressSites = sites.filter((s) => s.status !== 'COMPLETED');
  // 폼 state
  const [siteId, setSiteId] = useState<string>(inProgressSites[0]?.id ?? '');
  const [role, setRole] = useState<string>('철근공');
  const [wage, setWage] = useState<string>('250000');
  const today = localDateStr();
  const oneMonthLater = (() => {
    const d = new Date(); d.setMonth(d.getMonth() + 1);
    return localDateStr(d);
  })();
  const [startDate, setStartDate] = useState<string>(today);
  const [endDate, setEndDate] = useState<string>(oneMonthLater);
  const [headcount, setHeadcount] = useState<string>('5');
  const [perks, setPerks] = useState({
    lodging: false,    // 숙소 지원
    meal: false,       // 식대 지원
    transit: false,    // 교통비 지원
    equipment: false,  // 장비 지참
    experienced: false,// 경력자 우대
    foreigner: false,  // 외국인 가능
    etc: false,
  });
  const [perksEtc, setPerksEtc] = useState<string>('');
  // 발송 대상 반장 (멀티 선택)
  const [selectedForemen, setSelectedForemen] = useState<Set<string>>(
    () => new Set(foremen.map((f) => f.id)),
  );
  const [sending, setSending] = useState(false);
  /** 발송 전 미리보기 팝업 — 텍스트 확인 후 전송 */
  const [previewOpen, setPreviewOpen] = useState(false);
  const { user } = useAuth();

  function toggleForeman(id: string) {
    setSelectedForemen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleAllForemen() {
    if (selectedForemen.size === foremen.length) {
      setSelectedForemen(new Set());
    } else {
      setSelectedForemen(new Set(foremen.map((f) => f.id)));
    }
  }

  const selectedSite = sites.find((s) => s.id === siteId);

  /** 발송 메시지 본문 생성 — 미리보기 / 실 발송에서 동일하게 사용 */
  function buildMessage(): string {
    const perkList: string[] = [];
    if (perks.lodging) perkList.push('숙소 지원');
    if (perks.meal) perkList.push('식대 지원');
    if (perks.transit) perkList.push('교통비 지원');
    if (perks.equipment) perkList.push('장비 지참');
    if (perks.experienced) perkList.push('경력자 우대');
    if (perks.foreigner) perkList.push('외국인 가능');
    if (perks.etc && perksEtc.trim()) perkList.push(perksEtc.trim());
    const wageNum = Number(wage.replace(/[^0-9]/g, ''));
    const requester = user?.name ?? user?.companyName ?? '아코마';
    // 등록 링크 — 추후 토큰·짧은 URL 로 교체
    const link = 'https://bodapass.app/recruit/...';
    return (
      `[보다패스 인력요청]\n` +
      `현장: ${selectedSite?.name ?? siteId}\n` +
      `직종: ${role}\n` +
      `인원: ${headcount}명\n` +
      `일당: ${wageNum.toLocaleString()}원\n` +
      `기간: ${startDate} ~ ${endDate}\n` +
      (perkList.length > 0 ? `조건: ${perkList.join(', ')}\n` : '') +
      `요청자: ${requester}\n` +
      `등록 링크: ${link}`
    );
  }

  /** 1단계 — 폼 검증 후 미리보기 팝업 오픈 */
  function handleOpenPreview() {
    if (!siteId) { window.alert('현장을 선택해주세요.'); return; }
    if (!role.trim()) { window.alert('직종을 입력해주세요.'); return; }
    if (selectedForemen.size === 0) { window.alert('발송 대상 반장을 한 명 이상 선택해주세요.'); return; }
    if (perks.etc && !perksEtc.trim()) { window.alert('「기타」 특약사항 내용을 입력해주세요.'); return; }
    setPreviewOpen(true);
  }

  /** 2단계 — 미리보기 후 실제 전송 */
  function handleConfirmSend() {
    setPreviewOpen(false);
    setSending(true);
    setTimeout(() => {
      window.alert(`✓ 반장 ${selectedForemen.size}명에게 인력요청 SMS 전송됐습니다 (mock).`);
      setSending(false);
      onClose();
    }, 400);
  }

  return (
    <Modal
      open={true}
      onClose={onClose}
      title="투입 인력 요청"
      subtitle={`출근가능 인력 ${availableMembers.length}명 · 등록 반장 ${foremen.length}명에게 SMS 발송`}
      width={680}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            type="button"
            className="team-list__btn team-list__btn--ghost"
            onClick={onClose}
            disabled={sending}
          >
            취소
          </button>
          <button
            type="button"
            className="team-list__btn team-list__btn--primary"
            onClick={handleOpenPreview}
            disabled={sending || selectedForemen.size === 0}
          >
            {sending ? '요청 중…' : `반장 ${selectedForemen.size}명에게 요청`}
          </button>
        </div>
      }
    >
      <div className="recruit">
        {/* 현재 출근가능 풀 요약 */}
        <section className="recruit__pool">
          <h4 className="recruit__sec-h">출근가능 풀 ({availableMembers.length}명)</h4>
          {availableMembers.length === 0 ? (
            <p className="recruit__muted">현장 미배정 + 출근 준비된 인력이 없습니다. 반장에게 투입 인력 요청을 보내 새 인력을 받을 수 있습니다.</p>
          ) : (
            <ul className="recruit__pool-list">
              {availableMembers.slice(0, 8).map((m) => (
                <li key={m.id} className="recruit__pool-item">
                  <strong>{m.name}</strong>
                  <span className="recruit__pool-meta">{m.role} · {m.dailyWage.toLocaleString()}원</span>
                </li>
              ))}
              {availableMembers.length > 8 && (
                <li className="recruit__pool-more">외 {availableMembers.length - 8}명</li>
              )}
            </ul>
          )}
        </section>

        {/* 투입 인력 요청 폼 */}
        <section className="recruit__form">
          <h4 className="recruit__sec-h">요청 내용</h4>
          <div className="recruit__row">
            <label className="recruit__field">
              <span>현장 *</span>
              <select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
                {inProgressSites.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
            <label className="recruit__field">
              <span>직종 *</span>
              <input
                type="text"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="예: 철근공, 형틀공"
              />
            </label>
          </div>
          <div className="recruit__row">
            <label className="recruit__field">
              <span>예상 일당 *</span>
              <input
                type="text"
                value={wage}
                onChange={(e) => setWage(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="250000"
              />
            </label>
            <label className="recruit__field">
              <span>필요 인원 *</span>
              <input
                type="text"
                value={headcount}
                onChange={(e) => setHeadcount(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="5"
              />
            </label>
          </div>
          <div className="recruit__row">
            <label className="recruit__field">
              <span>근무 시작 *</span>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </label>
            <label className="recruit__field">
              <span>근무 종료</span>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </label>
          </div>

          {/* 특약사항 */}
          <div className="recruit__perks">
            <span className="recruit__perks-label">특약사항</span>
            <div className="recruit__perks-chips">
              <label className={'recruit__perk' + (perks.lodging ? ' is-on' : '')}>
                <input type="checkbox" checked={perks.lodging} onChange={(e) => setPerks((p) => ({ ...p, lodging: e.target.checked }))} />
                <span>숙소 지원</span>
              </label>
              <label className={'recruit__perk' + (perks.meal ? ' is-on' : '')}>
                <input type="checkbox" checked={perks.meal} onChange={(e) => setPerks((p) => ({ ...p, meal: e.target.checked }))} />
                <span>식대 지원</span>
              </label>
              <label className={'recruit__perk' + (perks.transit ? ' is-on' : '')}>
                <input type="checkbox" checked={perks.transit} onChange={(e) => setPerks((p) => ({ ...p, transit: e.target.checked }))} />
                <span>교통비 지원</span>
              </label>
              <label className={'recruit__perk' + (perks.equipment ? ' is-on' : '')}>
                <input type="checkbox" checked={perks.equipment} onChange={(e) => setPerks((p) => ({ ...p, equipment: e.target.checked }))} />
                <span>장비 지참</span>
              </label>
              <label className={'recruit__perk' + (perks.experienced ? ' is-on' : '')}>
                <input type="checkbox" checked={perks.experienced} onChange={(e) => setPerks((p) => ({ ...p, experienced: e.target.checked }))} />
                <span>경력자 우대</span>
              </label>
              <label className={'recruit__perk' + (perks.foreigner ? ' is-on' : '')}>
                <input type="checkbox" checked={perks.foreigner} onChange={(e) => setPerks((p) => ({ ...p, foreigner: e.target.checked }))} />
                <span>외국인 가능</span>
              </label>
              <label className={'recruit__perk' + (perks.etc ? ' is-on' : '')}>
                <input type="checkbox" checked={perks.etc} onChange={(e) => setPerks((p) => ({ ...p, etc: e.target.checked }))} />
                <span>기타</span>
              </label>
            </div>
            {perks.etc && (
              <input
                type="text"
                className="recruit__perk-etc"
                value={perksEtc}
                onChange={(e) => setPerksEtc(e.target.value)}
                placeholder="기타 특약사항을 자유롭게 입력하세요 (예: 숙소 제공, 주말 수당 등)"
              />
            )}
          </div>
        </section>

        {/* 발송 대상 반장 */}
        <section className="recruit__recipients">
          <header className="recruit__sec-head">
            <h4 className="recruit__sec-h">발송 대상 반장 ({selectedForemen.size}/{foremen.length})</h4>
            <button
              type="button"
              className="recruit__select-all"
              onClick={toggleAllForemen}
            >
              {selectedForemen.size === foremen.length ? '전체 해제' : '전체 선택'}
            </button>
          </header>
          <ul className="recruit__recipients-list">
            {foremen.map((f) => {
              const teamCount = allMembers.filter((m) => m.foremanId === f.id).length;
              const checked = selectedForemen.has(f.id);
              return (
                <li key={f.id}>
                  <label className={'recruit__recipient' + (checked ? ' is-on' : '')}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleForeman(f.id)}
                    />
                    <span className="recruit__recipient-name">{f.name}</span>
                    <span className="recruit__recipient-meta">{f.phone} · 팀원 {teamCount}명</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      {previewOpen && (
        <Modal
          open={true}
          onClose={() => setPreviewOpen(false)}
          title="문자 미리보기"
          subtitle={`반장 ${selectedForemen.size}명에게 아래 메시지가 SMS 로 전송됩니다`}
          width={460}
          footer={
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
              <button
                type="button"
                className="team-list__btn team-list__btn--ghost"
                onClick={() => setPreviewOpen(false)}
              >
                ← 수정
              </button>
              <button
                type="button"
                className="team-list__btn team-list__btn--primary"
                onClick={handleConfirmSend}
                disabled={sending}
              >
                {sending ? '전송 중…' : '전송'}
              </button>
            </div>
          }
        >
          <pre className="recruit__preview">{buildMessage()}</pre>
        </Modal>
      )}
    </Modal>
  );
}
