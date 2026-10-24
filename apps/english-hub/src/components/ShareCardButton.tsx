import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import { downloadBlob, renderShareCard, shareLink, shareOrDownload, type ShareCardData, type ShareCardFormat } from '../lib/shareCard';
import { Segmented } from '../ui/kit';
import './social.css';

type Status = 'idle' | 'making' | 'ready' | 'failed' | 'shared' | 'downloaded';

/**
 * A small "Share" button for result screens: opens a dialog with the
 * achievement card (Story 1080×1920 or Square 1080×1080), drawn on this
 * device, then shares it (Web Share) or downloads it.
 */
export const ShareCardButton = ({ card, label }: { card: ShareCardData; label?: string }) => {
  const t = useT();
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<ShareCardFormat>('story');
  const [status, setStatus] = useState<Status>('idle');
  const [image, setImage] = useState<{ blob: Blob; url: string } | null>(null);
  const [canShareFiles, setCanShareFiles] = useState(false);
  const cardKey = JSON.stringify(card);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setStatus('making');
    renderShareCard(card, format)
      .then((blob) => {
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        setImage((previous) => {
          if (previous) URL.revokeObjectURL(previous.url);
          return { blob, url };
        });
        try {
          const file = new File([blob], 'schood.png', { type: 'image/png' });
          setCanShareFiles(Boolean(navigator.canShare?.({ files: [file] })));
        } catch {
          setCanShareFiles(false);
        }
        setStatus('ready');
      })
      .catch(() => { if (!cancelled) setStatus('failed'); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, format, cardKey]);

  useEffect(() => () => { if (image) URL.revokeObjectURL(image.url); }, [image]);

  const show = () => {
    setOpen(true);
    dialog.current?.showModal?.();
  };
  const close = () => {
    dialog.current?.close?.();
    setOpen(false);
  };

  const filename = `schood-${card.kind}-${format}.png`;
  const share = async () => {
    if (!image) return;
    const outcome = await shareOrDownload(image.blob, { filename, title: card.headline, text: t('social.share.text'), url: shareLink(card.kind) });
    if (outcome !== 'cancelled') setStatus(outcome);
  };
  const download = () => {
    if (!image) return;
    downloadBlob(image.blob, filename);
    setStatus('downloaded');
  };

  const note = status === 'making' ? t('social.share.making')
    : status === 'failed' ? t('social.share.failed')
    : status === 'shared' ? t('social.share.shared')
    : status === 'downloaded' ? t('social.share.downloaded')
    : '';

  return (
    <>
      <button type="button" className="quiet en-share-trigger" onClick={show} aria-haspopup="dialog">
        <span aria-hidden="true">↗</span> {label ?? t('social.share.button')}
      </button>
      <dialog ref={dialog} className="en-share-dialog" aria-labelledby="en-share-title" onClose={() => setOpen(false)}>
        <div className="en-share-head">
          <h2 id="en-share-title">{t('social.share.title')}</h2>
          <button type="button" className="quiet" onClick={close} aria-label={t('social.share.close')}>✕</button>
        </div>
        <Segmented
          label={t('social.share.format')}
          value={format}
          onChange={setFormat}
          options={[{ value: 'story', label: t('social.share.story') }, { value: 'square', label: t('social.share.square') }]}
        />
        <div className={`en-share-preview is-${format}`}>
          {image && status !== 'making' ? <img src={image.url} alt={t('social.share.preview')} /> : <span className="en-skeleton" aria-hidden="true" />}
        </div>
        <div className="en-actions">
          {canShareFiles ? <button type="button" onClick={() => void share()} disabled={!image || status === 'making'}>{t('social.share.share')}</button> : null}
          <button type="button" className={canShareFiles ? 'quiet' : ''} onClick={download} disabled={!image || status === 'making'}>{t('social.share.download')}</button>
        </div>
        <p className={status === 'failed' ? 'en-error' : 'hint'} role="status" aria-live="polite" style={{ margin: 0 }}>{note}</p>
      </dialog>
    </>
  );
};
