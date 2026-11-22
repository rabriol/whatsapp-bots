import { useEffect, useState } from 'react';
import { api } from '../api';
import { FolderList } from '../telao/FolderList';
import { SlideGrid } from '../telao/SlideGrid';
import { NewFolderModal } from '../telao/NewFolderModal';
import { AddSlideModal } from '../telao/AddSlideModal';
import { CopySlidesModal } from '../telao/CopySlidesModal';

const SITE_URL = 'https://announcements.sdarmorangevale.com';

export default function Telao() {
  const [folders, setFolders] = useState([]);
  const [selected, setSelected] = useState(null);
  const [folder, setFolder] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [slideModal, setSlideModal] = useState(null); // 'add' | { replace, slide }
  const [copyOpen, setCopyOpen] = useState(false);
  const [warnings, setWarnings] = useState([]);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);

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
  useEffect(() => { setConfirmRemove(false); }, [selected]);

  // Deletes the whole folder (images included), then selects the newest remaining one.
  async function removeFolder() {
    setRemoving(true);
    try {
      await api.deleteSlideFolder(folder.name);
      setConfirmRemove(false);
      setWarnings([]);
      setError(null);
      const list = await api.getSlideFolders();
      setFolders(list);
      setSelected(list[0] ? list[0].name : null);
    } catch (err) {
      setError(err.message);
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="content content-wide telao-page">
      <div className="page-head">
        <div>
          <h1>Telão</h1>
          <p className="subtitle">Apresentações projetadas em announcements.sdarmorangevale.com, uma pasta por data.</p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {warnings.length > 0 && (
        <div className="telao-warning">
          {warnings.map((w) => <div key={w}>{w}</div>)}
        </div>
      )}

      <div className="telao-layout">
        <FolderList
          folders={folders}
          selected={selected}
          onSelect={(name) => { setError(null); setWarnings([]); setSelected(name); }}
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
                  <button className="btn-ghost" onClick={() => setCopyOpen(true)}>Copiar slides de outra pasta</button>
                  {!confirmRemove && (
                    <button className="btn-ghost" onClick={() => setConfirmRemove(true)}>Remover pasta</button>
                  )}
                  <a className="btn-ghost" href={`${SITE_URL}/${folder.name}/`} target="_blank" rel="noreferrer">
                    Abrir no site ↗
                  </a>
                </div>
              </div>
              {confirmRemove && (
                <div className="confirm-row telao-remove-confirm">
                  <span>
                    Remover a pasta {folder.name} e {folder.slides.length === 1 ? 'o slide' : `os ${folder.slides.length} slides`}, com as imagens?
                    {folders.find((f) => f.name === folder.name)?.live && ' Ela está no ar: o site passará a mostrar a pasta anterior.'}
                    {' '}Não dá para desfazer.
                  </span>
                  <button className="btn-ghost" onClick={() => setConfirmRemove(false)} disabled={removing}>Cancelar</button>
                  <button className="btn-danger" onClick={removeFolder} disabled={removing}>{removing ? 'Removendo...' : 'Remover pasta'}</button>
                </div>
              )}
              <SlideGrid
                folder={folder}
                onChanged={reload}
                onAddSlide={() => setSlideModal('add')}
                onReplace={(slide, role) => setSlideModal({ replace: role, slide })}
                onError={setError}
              />
            </>
          )}
        </section>
      </div>

      {slideModal && folder && (
        <AddSlideModal
          folder={folder}
          folders={folders}
          mode={slideModal}
          onClose={() => setSlideModal(null)}
          onSaved={(w) => { setWarnings(w); reload(); }}
        />
      )}

      {copyOpen && folder && (
        <CopySlidesModal
          folder={folder}
          folders={folders}
          onClose={() => setCopyOpen(false)}
          onCopied={() => { setWarnings([]); reload(); }}
        />
      )}

      {newFolderOpen && (
        <NewFolderModal
          onClose={() => setNewFolderOpen(false)}
          onCreated={(name) => { loadFolders(name); }}
        />
      )}
    </div>
  );
}
