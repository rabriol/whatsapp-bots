import { useEffect, useState } from 'react';
import { api } from '../api';
import { FolderList } from '../telao/FolderList';
import { SlideGrid } from '../telao/SlideGrid';
import { NewFolderModal } from '../telao/NewFolderModal';

const SITE_URL = 'https://announcements.sdarmorangevale.com';

export default function Telao() {
  const [folders, setFolders] = useState([]);
  const [selected, setSelected] = useState(null);
  const [folder, setFolder] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newFolderOpen, setNewFolderOpen] = useState(false);

  async function loadFolders(select) {
    try {
      const list = await api.getSlideFolders();
      setFolders(list);
      const name = select || selected || (list[0] && list[0].name) || null;
      setSelected(name);
      return name;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function loadFolder(name) {
    if (!name) { setFolder(null); return; }
    try {
      setFolder(await api.getSlideFolder(name));
    } catch (err) {
      setError(err.message);
    }
  }

  // After any change: refresh both the folder and the sidebar counts/"no ar" tag.
  async function reload() {
    setError(null);
    await Promise.all([loadFolders(), loadFolder(selected)]);
  }

  useEffect(() => { loadFolders(); }, []);
  useEffect(() => { loadFolder(selected); }, [selected]);

  return (
    <div className="content content-wide telao-page">
      <div className="page-head">
        <div>
          <h1>Telão</h1>
          <p className="subtitle">Apresentações projetadas em announcements.sdarmorangevale.com, uma pasta por data.</p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="telao-layout">
        <FolderList
          folders={folders}
          selected={selected}
          onSelect={(name) => { setError(null); setSelected(name); }}
          onNewFolder={() => setNewFolderOpen(true)}
        />

        <section className="card telao-main">
          {loading && <div className="empty-state">Carregando...</div>}
          {!loading && !folder && <div className="empty-state">Crie uma pasta para começar.</div>}
          {folder && (
            <>
              <div className="card-head">
                <h2>{folder.name}</h2>
                <div className="row-actions">
                  {folder.editable && (
                    <button className="btn-ghost" disabled>Copiar slides de outra pasta</button>
                  )}
                  <a className="btn-ghost" href={`${SITE_URL}/${folder.name}/`} target="_blank" rel="noreferrer">
                    Abrir no site ↗
                  </a>
                </div>
              </div>
              {!folder.editable && (
                <p className="subtitle">Apresentação feita à mão: as imagens podem ser reaproveitadas em outras pastas, mas esta pasta não é editada aqui.</p>
              )}
              <SlideGrid
                folder={folder}
                onChanged={reload}
                onAddSlide={() => {}}
                onReplace={() => {}}
                onError={setError}
              />
            </>
          )}
        </section>
      </div>

      {newFolderOpen && (
        <NewFolderModal
          onClose={() => setNewFolderOpen(false)}
          onCreated={(name) => { loadFolders(name); }}
        />
      )}
    </div>
  );
}
