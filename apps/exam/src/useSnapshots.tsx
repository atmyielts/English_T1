import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { captureStill, openCamera, SnapshotUploader } from './snapshots';
import { useAppT } from './i18n/index.ts';

export type SnapshotCamera = { stream: MediaStream; identity: { blob: Blob; captured_at: string } | null };

/** Connects a stream to whichever video element is mounted, including one that mounts later. */
function useVideo(stream: MediaStream | null) {
  const element = useRef<HTMLVideoElement | null>(null);
  const attach = useCallback((video: HTMLVideoElement | null) => {
    element.current = video;
    if (!video) return;
    if (video.srcObject !== stream) video.srcObject = stream;
    if (stream) void video.play().catch(() => undefined);
  }, [stream]);
  // A callback ref that also exposes the mounted element, like an object ref.
  return useMemo(() => Object.defineProperty(attach, "current", { get: () => element.current }) as typeof attach & { readonly current: HTMLVideoElement | null }, [attach]);
}

/** Before the test: camera preview and the identity photo (face with ID card). */
export function SnapshotSetup({ camera, setCamera }: { camera: SnapshotCamera | null; setCamera: (camera: SnapshotCamera | null) => void }) {
  const t = useAppT();
  const [stream, setStream] = useState<MediaStream | null>(camera?.stream ?? null), [problem, setProblem] = useState(''), [preview, setPreview] = useState('');
  const video = useVideo(stream);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  async function enable() {
    setProblem('');
    try { setStream(await openCamera()); } catch { setProblem(t('exam.snapshots.cameraDenied')); }
  }
  async function take() {
    if (!video.current || !stream) return;
    try {
      const blob = await captureStill(video.current, 480);
      setPreview(URL.createObjectURL(blob));
      setCamera({ stream, identity: { blob, captured_at: new Date().toISOString() } });
    } catch { setProblem(t('exam.snapshots.cameraNotReady')); }
  }
  return <section className="snapshot-setup" aria-labelledby="snapshot-setup-title">
    <h2 id="snapshot-setup-title">{t('exam.snapshots.title')}</h2>
    <p>{t('exam.snapshots.explain')}</p>
    {!stream ? <button type="button" onClick={() => void enable()}>{t('exam.snapshots.enable')}</button> : <>
      <div className="snapshot-preview">
        <video ref={video} muted playsInline autoPlay aria-label={t('exam.snapshots.preview')} />
        {preview && <img src={preview} alt={t('exam.snapshots.identityAlt')} />}
      </div>
      <p className="hint">{t('exam.snapshots.identityHint')}</p>
      <button type="button" className={camera?.identity ? 'quiet' : ''} onClick={() => void take()}>{camera?.identity ? t('exam.snapshots.retake') : t('exam.snapshots.take')}</button>
      {camera?.identity && <p role="status">{t('exam.snapshots.ready')}</p>}
    </>}
    {problem && <p role="alert" className="error">{problem}</p>}
  </section>;
}

/** During the test: one still per interval, uploaded with retry; camera loss is reported as an event. */
export function useSnapshots({ tenant, user, session, interval, running, camera, setCamera, emit }: {
  tenant: string; user: string; session: string; interval: number; running: boolean;
  camera: SnapshotCamera | null; setCamera: (camera: SnapshotCamera | null) => void;
  emit: (kind: 'camera_lost' | 'camera_restored') => void;
}) {
  const t = useAppT();
  const [state, setState] = useState<{ on: boolean; pending: number; lost: boolean }>({ on: false, pending: 0, lost: false });
  const video = useVideo(camera?.stream ?? null);
  const emitRef = useRef(emit); emitRef.current = emit;
  const active = Boolean(session && interval > 0 && user && running);
  useEffect(() => {
    if (!active || !camera) { setState((current) => ({ ...current, on: false })); return; }
    const uploader = new SnapshotUploader(tenant, session, user);
    if (camera.identity) uploader.identity(camera.identity.blob, camera.identity.captured_at);
    let stopped = false, lost = false;
    const track = camera.stream.getVideoTracks()[0];
    const ended = () => { if (!lost) { lost = true; emitRef.current('camera_lost'); } setState((current) => ({ ...current, lost: true, on: false })); };
    track?.addEventListener('ended', ended);
    const tick = async () => {
      if (stopped) return;
      if (track?.readyState === 'live' && video.current?.videoWidth) {
        try { uploader.periodic(await captureStill(video.current)); } catch { /* next interval */ }
      }
      await uploader.flush().catch(() => false);
      if (!stopped) setState({ on: track?.readyState === 'live', pending: uploader.pending, lost });
    };
    const first = setTimeout(() => void tick(), 3000);
    const timer = setInterval(() => void tick(), interval * 1000);
    return () => { stopped = true; clearTimeout(first); clearInterval(timer); track?.removeEventListener('ended', ended); };
  }, [active, camera, tenant, session, user, interval]);
  // The camera turns off when the test ends or the camera is replaced.
  useEffect(() => { if (!running && session) camera?.stream.getTracks().forEach((track) => track.stop()); }, [running, session, camera]);
  useEffect(() => () => { camera?.stream.getTracks().forEach((track) => track.stop()); }, [camera]);
  async function reconnect() {
    try {
      const stream = await openCamera();
      if (state.lost) emitRef.current('camera_restored');
      setCamera({ stream, identity: null });
    } catch { setState((current) => ({ ...current, lost: true })); }
  }
  const view = !active ? null : <aside className="snapshot-status" aria-label={t('exam.snapshots.statusLabel')}>
    {camera && <video ref={video} muted playsInline autoPlay aria-hidden="true" />}
    <p>{camera && state.on ? t('exam.snapshots.on') : t('exam.snapshots.off')}{state.pending ? ` · ${t('exam.snapshots.pending', { count: state.pending })}` : ''}</p>
    {(!camera || state.lost) && <button type="button" onClick={() => void reconnect()}>{t('exam.snapshots.reconnect')}</button>}
  </aside>;
  return { view };
}
