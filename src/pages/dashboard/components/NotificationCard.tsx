import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getDispatchLogs, type DispatchLog } from '../../../utils/messageTemplates';

export function NotificationCard({ siteId: _siteId }: { siteId: string }) {
  const [logs, setLogs] = useState<DispatchLog[]>([]);
  useEffect(() => {
    setLogs(getDispatchLogs().slice(0, 5));
  }, [_siteId]);

  return (
    <div className="board-card">
      <header className="board-card__head">
        <div>
          <h3>💬 알림톡 발송</h3>
          <p>최근 카카오/SMS 발송 5건</p>
        </div>
        <Link to="/notifications" className="board-card__more">전체 보기 →</Link>
      </header>
      {logs.length === 0 ? (
        <p className="board-card__empty">발송 내역이 없습니다. 팀원 등록·임금 발송 시 자동 추가됩니다.</p>
      ) : (
        <ul className="board-card__list">
          {logs.map((l) => (
            <li key={l.id} className="board-post">
              <span className={'board-post__cat board-post__cat--' + (l.channel === 'KAKAO' ? 'kakao' : 'sms')}>
                {l.channel === 'KAKAO' ? '카톡' : 'SMS'}
              </span>
              <span className="board-post__title">{l.toName} · {l.toPhone}</span>
              <span className="board-post__meta">
                {new Date(l.sentAt).toLocaleString()} · {l.status === 'SENT' ? '✓' : '실패'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
