import { useEffect, useId, useRef, useState } from 'react';
import { useI18n, useT } from '../../i18n';
import type { ShadowSource } from '../../lib/shadow/api';
import { ShadowPanel } from './ShadowPanel';
import './shadow.css';

/**
 * A small "Shadow" (or "Read aloud") button that opens shadowing practice for
 * one sentence, line or paragraph in a dialog. The panel (and the microphone)
 * only exists while the dialog is open.
 */
export const ShadowButton = ({
  text,
  source,
  readAloud = false,
  className = 'quiet sh-trigger',
}: {
  text: string;
  source: ShadowSource;
  readAloud?: boolean;
  className?: string;
}) => {
  const t = useT();
  const { locale } = useI18n();
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const element = dialog.current;
    if (!open || !element) return;
    if (typeof element.showModal === 'function' && !element.open) {
      try {
        element.showModal();
      } catch {
        element.setAttribute('open', '');
      }
    } else if (!element.open) {
      element.setAttribute('open', '');
    }
  }, [open]);

  if (!text.trim()) return null;

  const close = () => {
    const element = dialog.current;
    if (element?.open && typeof element.close === 'function') element.close();
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        className={className}
        aria-label={readAloud ? t('shadow.readAloudLabel') : t('shadow.buttonLabel')}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        {readAloud ? t('shadow.readAloud') : t('shadow.button')}
      </button>
      {open ? (
        <dialog
          ref={dialog}
          className="sh-dialog"
          // Opened from inside English text (lang="en"); the dialog speaks the interface language.
          lang={locale}
          aria-labelledby={titleId}
          onClose={() => setOpen(false)}
          onCancel={() => setOpen(false)}
        >
          <div className="sh-dialog-body">
            <div className="sh-dialog-head">
              <h2 id={titleId}>{readAloud ? t('shadow.readAloudTitle') : t('shadow.dialogTitle')}</h2>
              <button type="button" className="quiet" onClick={close}>{t('shadow.close')}</button>
            </div>
            <p className="hint" style={{ margin: 0 }}>{readAloud ? t('shadow.readAloudLead') : t('shadow.lead')}</p>
            <ShadowPanel text={text} source={source} readAloud={readAloud} />
          </div>
        </dialog>
      ) : null}
    </>
  );
};
