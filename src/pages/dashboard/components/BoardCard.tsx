import { useEffect, useState } from 'react';
import { localDateStr } from '../../../utils/dateLocal';

interface BoardPost {
  id: string;
  siteId: string;
  category: '공지' | '안전' | '일정' | '자재';
  title: string;
  author: string;
  date: string;
}

const BOARD_KEY = 'ilgampack_admin:board';

/** 시드 기본 게시글 (현장별 소량) */
function seedBoardPosts(siteId: string, siteName: string): BoardPost[] {
  const today = new Date();
  const d = (offset: number) =>
    localDateStr(new Date(today.getTime() - offset * 86_400_000));
  return [
    { id: `${siteId}-1`, siteId, category: '공지', title: `${siteName.split(' ').slice(0, 2).join(' ')} 1차 자재 검수 일정 안내`, author: '김홍길', date: d(0) },
    { id: `${siteId}-2`, siteId, category: '안전', title: '주말 근무자 안전모 착용 의무', author: '이안전', date: d(1) },
    { id: `${siteId}-3`, siteId, category: '일정', title: '다음 주 콘크리트 타설 (3일차)', author: '박철수', date: d(2) },
    { id: `${siteId}-4`, siteId, category: '자재', title: '거푸집 추가 발주 — 관리자 확인 요청', author: '김홍길', date: d(4) },
  ];
}

function loadBoardPosts(siteId: string, siteName: string): BoardPost[] {
  try {
    const raw = localStorage.getItem(BOARD_KEY);
    if (raw) {
      const all = JSON.parse(raw) as BoardPost[];
      const here = all.filter((p) => p.siteId === siteId);
      if (here.length > 0) return here;
    }
  } catch { /* ignore */ }
  // 시드
  const seeded = seedBoardPosts(siteId, siteName);
  try {
    const raw = localStorage.getItem(BOARD_KEY);
    const all: BoardPost[] = raw ? JSON.parse(raw) : [];
    localStorage.setItem(BOARD_KEY, JSON.stringify([...all, ...seeded]));
  } catch { /* ignore */ }
  return seeded;
}

function categoryClass(c: BoardPost['category']): string {
  switch (c) {
    case '공지': return 'notice';
    case '안전': return 'safety';
    case '일정': return 'schedule';
    case '자재': return 'material';
  }
}

export function BoardCard({ siteId, siteName }: { siteId: string; siteName: string }) {
  const [posts, setPosts] = useState<BoardPost[]>([]);
  useEffect(() => {
    setPosts(loadBoardPosts(siteId, siteName));
  }, [siteId, siteName]);

  return (
    <div className="board-card">
      <header className="board-card__head">
        <div>
          <h3>📋 현장 게시판</h3>
          <p>현장 공지·안전·일정·자재 메모</p>
        </div>
        <button type="button" className="board-card__more">+ 글 작성</button>
      </header>
      {posts.length === 0 ? (
        <p className="board-card__empty">게시글이 없습니다.</p>
      ) : (
        <ul className="board-card__list">
          {posts.slice(0, 5).map((p) => (
            <li key={p.id} className="board-post">
              <span className={'board-post__cat board-post__cat--' + categoryClass(p.category)}>
                {p.category}
              </span>
              <span className="board-post__title">{p.title}</span>
              <span className="board-post__meta">
                {p.author} · {p.date}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
