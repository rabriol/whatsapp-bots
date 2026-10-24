import { PlusIcon } from '../icons';

export function FolderList({ folders, selected, onSelect, onNewFolder }) {
  return (
    <aside className="telao-sidebar">
      <button className="btn-primary telao-new-folder" onClick={onNewFolder}>
        <PlusIcon /> Nova pasta
      </button>
      {folders.length === 0 && <div className="empty-state">Nenhuma pasta ainda.</div>}
      <div className="telao-folders">
        {folders.map((f) => (
          <button
            key={f.name}
            className={`telao-folder ${selected === f.name ? 'active' : ''}`}
            onClick={() => onSelect(f.name)}
          >
            <span className="telao-folder-name">{f.name}</span>
            <span className="telao-folder-meta">
              {f.editable ? `${f.count} ${f.count === 1 ? 'slide' : 'slides'}` : `${f.count} ${f.count === 1 ? 'imagem' : 'imagens'}`}
            </span>
            <span className="telao-folder-tags">
              {f.live && <span className="pill pill-urgent">no ar</span>}
              {!f.editable && <span className="pill pill-default">só leitura</span>}
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}
