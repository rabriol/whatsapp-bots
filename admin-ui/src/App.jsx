import { useState } from 'react';
import Birthdays from './pages/Birthdays';
import Announcements from './pages/Announcements';
import Events from './pages/Events';
import AllEvents from './pages/AllEvents';
import { ThemeToggle } from './ThemeToggle';
import { LogoutIcon } from './icons';

const BOT_PAGES = {
  birthdays: Birthdays,
  announcements: Announcements,
  events: Events,
};

export default function App() {
  const [group, setGroup] = useState('bots'); // 'bots' | 'allEvents'
  const [botTab, setBotTab] = useState('birthdays');

  const Page = group === 'bots' ? BOT_PAGES[botTab] : AllEvents;

  return (
    <div className="page">
      <div className="topbar">
        <div className="nav">
          <button
            className={`nav-item ${group === 'bots' ? 'active' : ''}`}
            onClick={() => setGroup('bots')}
          >
            Bots
          </button>
          <button
            className={`nav-item ${group === 'allEvents' ? 'active' : ''}`}
            onClick={() => setGroup('allEvents')}
          >
            Todos os Eventos
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

      {group === 'bots' && (
        <div className="subnav">
          <button
            className={`subnav-item ${botTab === 'birthdays' ? 'active' : ''}`}
            onClick={() => setBotTab('birthdays')}
          >
            Aniversariantes
          </button>
          <button
            className={`subnav-item ${botTab === 'announcements' ? 'active' : ''}`}
            onClick={() => setBotTab('announcements')}
          >
            Anúncios
          </button>
          <button
            className={`subnav-item ${botTab === 'events' ? 'active' : ''}`}
            onClick={() => setBotTab('events')}
          >
            Eventos
          </button>
        </div>
      )}

      <Page />
    </div>
  );
}
