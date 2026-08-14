import { FormEvent, useCallback, useEffect, useState } from 'react';
import { translate } from '../../i18n';
import {
  academyVideoCapability,
  academyVideoCreateUpload,
  academyVideoDelete,
  academyVideoSyncStatus,
  academyVideoUploadFile,
  type AcademyVideoAsset,
  type AcademyVideoCapability,
  type TeacherStudioLesson,
} from '../../lib/client';

type ManagedVideoPanelProps = {
  academyId: string;
  lessons: TeacherStudioLesson[];
};

const reasonText: Record<string, string> = {
  GLOBAL_DISABLED: 'Managed video is disabled platform-wide.',
  VIDEO_HOSTING_NOT_CONFIGURED: 'Video hosting has not been configured by the master administrator.',
  ACADEMY_NOT_APPROVED: 'This academy has not been approved for video uploads.',
  QUOTA_NOT_CONFIGURED: 'The academy needs explicit duration, storage, and monthly upload limits.',
  STORAGE_QUOTA_REACHED: 'The academy storage quota has been reached.',
  MONTHLY_UPLOAD_QUOTA_REACHED: 'The academy monthly upload quota has been reached.',
};

export const ManagedVideoPanel = ({ academyId, lessons }: ManagedVideoPanelProps) => {
  const [capability, setCapability] = useState<AcademyVideoCapability | null>(null);
  const [lessonId, setLessonId] = useState('');
  const [title, setTitle] = useState('');
  const [maxDurationMinutes, setMaxDurationMinutes] = useState('30');
  const [file, setFile] = useState<File | null>(null);
  const [asset, setAsset] = useState<AcademyVideoAsset | null>(null);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadCapability = useCallback(async () => {
    try {
      const next = await academyVideoCapability(academyId);
      const safeCapability: AcademyVideoCapability = {
        provider: next.provider || 'cloudflare_stream',
        provider_configured: next.provider_configured === true,
        global_enabled: next.global_enabled === true,
        academy_enabled: next.academy_enabled === true,
        can_upload: next.can_upload === true,
        reason: next.reason || 'VIDEO_HOSTING_NOT_CONFIGURED',
        quota: {
          max_asset_duration_seconds: Number(next.quota?.max_asset_duration_seconds ?? 0),
          max_total_stored_minutes: Number(next.quota?.max_total_stored_minutes ?? 0),
          max_monthly_upload_minutes: Number(next.quota?.max_monthly_upload_minutes ?? 0),
        },
        usage: {
          stored_minutes: Number(next.usage?.stored_minutes ?? 0),
          monthly_upload_minutes: Number(next.usage?.monthly_upload_minutes ?? 0),
        },
      };
      setCapability(safeCapability);
      setLessonId((current) => current || lessons.find((lesson) => lesson.status === 'published')?.id || lessons[0]?.id || '');
      setMaxDurationMinutes((current) => {
        if (current !== '30' || !safeCapability.quota.max_asset_duration_seconds) return current;
        return String(Math.max(1, Math.floor(safeCapability.quota.max_asset_duration_seconds / 60)));
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [academyId, lessons]);

  useEffect(() => { void loadCapability(); }, [loadCapability]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!file || !lessonId || !title.trim() || !capability?.can_upload) return;
    setBusy(true);
    setError('');
    setProgress(0);
    try {
      const maxSeconds = Math.max(60, Math.floor(Number(maxDurationMinutes) * 60));
      const reservation = await academyVideoCreateUpload(academyId, {
        lesson_id: lessonId,
        title: title.trim(),
        max_duration_seconds: maxSeconds,
      });
      setAsset(reservation.asset);
      await academyVideoUploadFile(reservation.upload_url, file, setProgress);
      let current = await academyVideoSyncStatus(academyId, reservation.asset.id);
      setAsset(current);
      for (let attempt = 0; attempt < 10 && ['reserved', 'uploading', 'processing'].includes(current.status); attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 3_000));
        current = await academyVideoSyncStatus(academyId, current.id);
        setAsset(current);
      }
      await loadCapability();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!asset) return;
    setBusy(true);
    setError('');
    try {
      await academyVideoDelete(academyId, asset.id);
      setAsset(null);
      setFile(null);
      setProgress(0);
      await loadCapability();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const disabledReason = capability?.reason ? reasonText[capability.reason] ?? capability.reason : null;

  return (
    <section className="panel managed-video-panel" aria-labelledby="managed-video-title">
      <div className="row between wrap">
        <div><h3 id="managed-video-title">{translate('Recorded lessons')}</h3><p className="muted">{translate('Attach cost-controlled, private recordings to published lessons. Arbitrary video links are not accepted.')}</p></div>
        <span className={capability?.can_upload ? 'status status--ok' : 'status status--pending'}>{capability?.can_upload ? translate('Available') : translate('Unavailable')}</span>
      </div>
      {disabledReason ? <div className="info-banner">{translate(disabledReason)}</div> : null}
      {error ? <div className="error-banner">{translate(error)}</div> : null}
      {capability ? <div className="row wrap small muted"><span>{capability.usage.stored_minutes}/{capability.quota.max_total_stored_minutes || 0} {translate('stored min')}</span><span>{capability.usage.monthly_upload_minutes}/{capability.quota.max_monthly_upload_minutes || 0} {translate('uploaded this month')}</span></div> : null}
      <form className="grid" onSubmit={submit}>
        <label>{translate('Lesson')}<select className="input" value={lessonId} onChange={(event) => setLessonId(event.target.value)} disabled={!capability?.can_upload} required><option value="">{translate('Choose a lesson')}</option>{lessons.map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.title} · {lesson.status}</option>)}</select></label>
        <label>{translate('Recording title')}<input className="input" value={title} onChange={(event) => setTitle(event.target.value)} disabled={!capability?.can_upload} maxLength={240} required /></label>
        <div className="grid two">
          <label>{translate('Maximum duration (minutes)')}<input className="input" type="number" min="1" max={Math.max(1, Math.floor((capability?.quota.max_asset_duration_seconds ?? 60) / 60))} value={maxDurationMinutes} onChange={(event) => setMaxDurationMinutes(event.target.value)} disabled={!capability?.can_upload} required /></label>
          <label>{translate('Video file (maximum 200 MB)')}<input className="input" type="file" accept="video/*" onChange={(event) => setFile(event.target.files?.[0] ?? null)} disabled={!capability?.can_upload} required /></label>
        </div>
        {busy ? <progress max="100" value={progress} aria-label={translate('Video upload progress')}>{progress}%</progress> : null}
        <button className="primary-btn" type="submit" disabled={busy || !capability?.can_upload || !file || !lessonId}>{busy ? translate('Uploading and processing…') : translate('Upload recording')}</button>
      </form>
      {asset ? <div className="managed-video-panel__asset"><div><strong>{asset.title}</strong><p className="small muted">{asset.status}{asset.duration_seconds ? ` · ${Math.ceil(asset.duration_seconds / 60)} min` : ''}</p>{asset.failure_message ? <p className="error-text">{asset.failure_message}</p> : null}</div><button className="small-btn" type="button" disabled={busy} onClick={() => void remove()}>{translate('Delete recording')}</button></div> : null}
    </section>
  );
};
