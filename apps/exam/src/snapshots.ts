import { supabase } from '../../../packages/assessment-web/src/client';

/** A small still from a live camera stream, as JPEG. */
export async function captureStill(video: HTMLVideoElement, width = 320): Promise<Blob> {
  const ratio = video.videoHeight && video.videoWidth ? video.videoHeight / video.videoWidth : 0.75;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = Math.round(width * ratio);
  const context = canvas.getContext('2d');
  if (!context || !video.videoWidth) throw new Error('camera_not_ready');
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.7));
  if (!blob) throw new Error('camera_not_ready');
  return blob;
}

export async function openCamera(): Promise<MediaStream> {
  return await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false });
}

type Pending = { sequence: number; kind: 'identity' | 'periodic'; blob: Blob; captured_at: string };
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Uploads stills in order with retry. Numbering survives a reload of the same session. */
export class SnapshotUploader {
  private queue: Pending[] = [];
  private sending = false;
  private readonly key: string;
  constructor(private tenant: string, private session: string, private actor: string) {
    this.key = `schood-proctor-snapshot:${actor}:${session}`;
  }
  private next(): number {
    let value = 1;
    try { value = Math.max(1, Number(localStorage.getItem(this.key) ?? 1) || 1); localStorage.setItem(this.key, String(value + 1)); } catch { /* private mode */ }
    return value;
  }
  get pending() { return this.queue.length; }
  identity(blob: Blob, capturedAt: string) { this.queue.unshift({ sequence: 0, kind: 'identity', blob, captured_at: capturedAt }); }
  periodic(blob: Blob) {
    this.queue.push({ sequence: this.next(), kind: 'periodic', blob, captured_at: new Date().toISOString() });
    // Bounded memory while offline: the oldest periodic stills give way first.
    while (this.queue.length > 30) { const index = this.queue.findIndex((item) => item.kind === 'periodic'); if (index < 0) break; this.queue.splice(index, 1); }
  }
  /** Sends what is queued; returns false if something is still waiting. */
  async flush(): Promise<boolean> {
    if (this.sending || !supabase || !url || !anon) return this.queue.length === 0;
    this.sending = true;
    try {
      while (this.queue.length) {
        const item = this.queue[0];
        const { data } = await supabase.auth.getSession();
        if (!data.session || data.session.user.id !== this.actor) return false;
        const endpoint = new URL(`${url}/functions/v1/proctor/snapshots/candidate`);
        for (const [name, value] of Object.entries({ tenant_id: this.tenant, session_id: this.session, sequence: String(item.sequence), kind: item.kind, captured_at: item.captured_at })) endpoint.searchParams.set(name, value);
        let response: Response;
        try {
          response = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${data.session.access_token}`, apikey: anon, 'Content-Type': 'image/jpeg' }, body: item.blob });
        } catch {
          return false;
        }
        if (response.ok) { this.queue.shift(); continue; }
        const code = (await response.json().catch(() => ({}))).code;
        // A used number after a reload: the identity photo already exists, or take the next number.
        if (response.status === 409 && code === 'snapshot_conflict') { if (item.kind === 'identity') this.queue.shift(); else item.sequence = this.next(); continue; }
        if (response.status >= 500 || response.status === 429 || response.status === 401) return false;
        this.queue.shift();
      }
      return true;
    } finally {
      this.sending = false;
    }
  }
}
