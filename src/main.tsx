import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppRouter } from './routes/AppRouter';
import { bootstrapCsrf } from './api/client';
import './styles/globals.css';

// 백엔드 CSRF cookie 미리 발급 (실서버 모드에서만 동작)
bootstrapCsrf().catch(() => null);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppRouter />
  </React.StrictMode>,
);
