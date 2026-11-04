import { useRef, useState } from 'react';
import { useDesign, useDesignStore } from '../state/context';
import { downloadJson, parseDesignJson, shareUrl } from '../state/persist';
import { TEMPLATES } from '../templates';

/** Templates, import/export and share link, in a modal dialog. */
export function DesignMenu({ onToast }: { onToast: (msg: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const store = useDesignStore();
  const design = useDesign((s) => s.design);
  const [importError, setImportError] = useState<string | null>(null);

  const close = () => dialog.current?.close();
  const open = () => {
    setImportError(null);
    dialog.current?.showModal();
  };

  const copyLink = async () => {
    const url = shareUrl(design);
    try {
      await navigator.clipboard.writeText(url);
      onToast('Share link copied. It holds the whole design, so no account is needed.');
    } catch {
      window.prompt('Copy this link', url);
    }
    close();
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    const text = await f.text();
    const r = parseDesignJson(text);
    if (!r.ok) {
      setImportError(r.error);
      return;
    }
    store.getState().load(r.design);
    onToast(`Imported “${r.design.name}”. Undo brings back the previous design.`);
    close();
  };

  return (
    <>
      <button type="button" className="btn btn--header" onClick={open} aria-haspopup="dialog">
        Design
      </button>
      <dialog ref={dialog} className="dialog" aria-label="Design" onClick={(e) => e.target === dialog.current && close()}>
        <div className="dialog-body">
          <div className="dialog-head">
            <h2>Design</h2>
            <button type="button" className="icon-btn" aria-label="Close" onClick={close}>
              ✕
            </button>
          </div>
          <h3>Start from a template</h3>
          <ul className="templates">
            {TEMPLATES.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => {
                    store.getState().load(structuredClone(t.design));
                    onToast(`Loaded “${t.name}”. Undo brings back your previous design.`);
                    close();
                  }}
                >
                  <strong>{t.name}</strong>
                  <span className="muted">{t.blurb}</span>
                </button>
              </li>
            ))}
          </ul>
          <h3>Save and share</h3>
          <p className="muted small">Your design saves itself in this browser. Use these to keep a copy or send it to someone.</p>
          <div className="btn-row">
            <button type="button" className="btn btn--primary" onClick={copyLink}>
              Copy share link
            </button>
            <button type="button" className="btn" onClick={() => { downloadJson(design); close(); }}>
              Export JSON
            </button>
            <button type="button" className="btn" onClick={() => file.current?.click()}>
              Import JSON
            </button>
            <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
          </div>
          {importError && <p className="notice notice--danger">Couldn't import: {importError}</p>}
        </div>
      </dialog>
    </>
  );
}
