export type PeerDraft = {
  essay: string; prompt: string; examType: string; taskType: string; updatedAt: number;
  request?: { fingerprint: string; id: string };
};
const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const key = (actor: string) => `schood.peer.draft.v1.${actor}`;
export function loadPeerDraft(actor: string): PeerDraft | null {
  try {
    if (!uuid.test(actor)) return null;
    const raw = sessionStorage.getItem(key(actor));
    if (!raw || raw.length > 100_000) return null;
    const value = JSON.parse(raw) as PeerDraft;
    if (!value || typeof value.essay !== 'string' || value.essay.length > 20_000
      || typeof value.prompt !== 'string' || value.prompt.length > 2_000
      || !['ielts', 'itep'].includes(value.examType) || !['task1', 'task2'].includes(value.taskType)
      || !Number.isFinite(value.updatedAt) || value.updatedAt > Date.now() + 60_000 || Date.now() - value.updatedAt > 86_400_000
      || (value.request && (!uuid.test(value.request.id) || typeof value.request.fingerprint !== 'string' || value.request.fingerprint.length > 90_000))) {
      sessionStorage.removeItem(key(actor)); return null;
    }
    return value;
  } catch { return null; }
}
export function savePeerDraft(actor: string, draft: Omit<PeerDraft, 'updatedAt'>): boolean {
  try {
    if (!uuid.test(actor)) return false;
    if (!draft.essay && !draft.prompt && !draft.request) sessionStorage.removeItem(key(actor));
    else {
      const raw = JSON.stringify({ ...draft, updatedAt: Date.now() });
      if (raw.length > 100_000) return false;
      sessionStorage.setItem(key(actor), raw);
    }
    return true;
  } catch { return false; }
}
export function removePeerDraft(actor: string) {
  try { sessionStorage.removeItem(key(actor)); } catch { /* Confirmed server copy is retained. */ }
}
