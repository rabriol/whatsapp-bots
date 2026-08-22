import { useState } from 'react';
import Birthdays from './pages/Birthdays';
import Announcements from './pages/Announcements';
import { ThemeToggle } from './ThemeToggle';
import { LogoutIcon } from './icons';

export default function App() {
  const [tab, setTab] = useState('birthdays');

  return (
    <div className="page">
      <div className="topbar">
        <div className="nav">
          <button
            className={`nav-item ${tab === 'birthdays' ? 'active' : ''}`}
            onClick={() => setTab('birthdays')}
          >
            Aniversariantes
          </button>
          <button
            className={`nav-item ${tab === 'announcements' ? 'active' : ''}`}
            onClick={() => setTab('announcements')}
          >
            Anúncios
          </button>
        </div>
        <div className="topbar-right">
          <span className="env-tag">whatsapp-bots · VPS</span>
          <ThemeToggle />
          <a className="icon-btn" href="/cdn-cgi/access/logout" title="Sair">
            <LogoutIcon />
          </a>
        </div>
      </div>

      {tab === 'birthdays' ? <Birthdays /> : <Announcements />}
    </div>
  );
}
