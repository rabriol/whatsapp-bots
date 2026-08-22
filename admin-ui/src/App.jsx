import { useState } from 'react';
import Birthdays from './pages/Birthdays';
import Announcements from './pages/Announcements';

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
        <span className="env-tag">whatsapp-bots · VPS</span>
      </div>

      {tab === 'birthdays' ? <Birthdays /> : <Announcements />}
    </div>
  );
}
