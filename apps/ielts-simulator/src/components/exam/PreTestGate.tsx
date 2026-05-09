import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Headphones, ShieldCheck, Volume2, Maximize2, AlertTriangle } from 'lucide-react';
import { logIntegrityEvent } from '../../lib/platformClient';

export type PreTestGateStatus = {
  instructions_acknowledged_at?: string | null;
  headphones_checked_at?: string | null;
  identity_acknowledged_at?: string | null;
};

type Step = 'instructions' | 'headphones' | 'identity';

interface PreTestGateProps {
  accessToken: string;
  sessionId: string;
  sectionType: 'listening' | 'reading' | 'writing' | 'speaking' | 'unknown';
  examName: string;
  sectionName: string;
  durationMinutes: number | null;
  strictMode: boolean;
  status: PreTestGateStatus;
  onAcknowledged: (which: keyof PreTestGateStatus, atIso: string) => void;
  onRequestFullscreen: () => Promise<boolean>;
  onAllAcknowledged: () => void;
}

const stepNeeded = (sectionType: PreTestGateProps['sectionType'], status: PreTestGateStatus): Step | null => {
  if (!status.instructions_acknowledged_at) return 'instructions';
  if (sectionType === 'listening' && !status.headphones_checked_at) return 'headphones';
  if (!status.identity_acknowledged_at) return 'identity';
  return null;
};

export const PreTestGate: React.FC<PreTestGateProps> = ({
  accessToken,
  sessionId,
  sectionType,
  examName,
  sectionName,
  durationMinutes,
  strictMode,
  status,
  onAcknowledged,
  onRequestFullscreen,
  onAllAcknowledged,
}) => {
  const initialStep = useMemo(() => stepNeeded(sectionType, status), [sectionType, status]);
  const [step, setStep] = useState<Step | null>(initialStep);
  const [busy, setBusy] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioPlayed, setAudioPlayed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    setStep(stepNeeded(sectionType, status));
  }, [sectionType, status]);

  useEffect(() => {
    if (step === null) onAllAcknowledged();
  }, [step, onAllAcknowledged]);

  const ackEvent = async (
    eventType: 'instructions_acknowledged' | 'headphones_checked' | 'identity_acknowledged',
    metaKey: keyof PreTestGateStatus,
  ) => {
    setBusy(true);
    setError(null);
    try {
      await logIntegrityEvent(accessToken, {
        session_id: sessionId,
        event_type: eventType,
        severity: 'info',
        data: { section_type: sectionType },
      });
      onAcknowledged(metaKey, new Date().toISOString());
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error';
      setError(`Could not record acknowledgement: ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  const playToneCheck = () => {
    if (audioPlaying) return;
    try {
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) {
        setError('This browser cannot test audio. You may continue if you have already verified your headphones.');
        setAudioPlayed(true);
        return;
      }
      const ctx: AudioContext = audioCtxRef.current ?? new Ctx();
      audioCtxRef.current = ctx;

      setAudioPlaying(true);
      const tones: Array<{ freq: number; pan: number; start: number; end: number }> = [
        { freq: 660, pan: -1, start: 0.0, end: 0.6 },
        { freq: 880, pan: 1, start: 0.7, end: 1.3 },
        { freq: 770, pan: 0, start: 1.4, end: 2.0 },
      ];
      const now = ctx.currentTime;
      for (const t of tones) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const panner = (ctx as any).createStereoPanner ? (ctx as any).createStereoPanner() : null;
        osc.type = 'sine';
        osc.frequency.value = t.freq;
        gain.gain.value = 0;
        gain.gain.linearRampToValueAtTime(0.12, now + t.start + 0.05);
        gain.gain.linearRampToValueAtTime(0, now + t.end);
        osc.connect(gain);
        if (panner) {
          panner.pan.value = t.pan;
          gain.connect(panner);
          panner.connect(ctx.destination);
        } else {
          gain.connect(ctx.destination);
        }
        osc.start(now + t.start);
        osc.stop(now + t.end + 0.05);
      }
      window.setTimeout(() => {
        setAudioPlaying(false);
        setAudioPlayed(true);
      }, 2200);
    } catch (e) {
      setError('Audio test could not start. Please allow audio playback in your browser.');
      setAudioPlaying(false);
    }
  };

  if (step === null) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="bg-slate-900 text-white px-6 py-5 flex items-center gap-3">
          <ShieldCheck size={22} />
          <div>
            <div className="text-[11px] font-semibold tracking-[0.16em] uppercase text-slate-300">
              Test-day setup
            </div>
            <div className="text-lg font-semibold">{examName}</div>
          </div>
          <div className="ml-auto text-right">
            <div className="text-[11px] uppercase tracking-[0.14em] text-slate-300">Step</div>
            <div className="text-sm font-semibold">
              {step === 'instructions' ? '1 of 3' : step === 'headphones' ? '2 of 3' : '3 of 3'}
            </div>
          </div>
        </div>

        <div className="px-6 py-6 space-y-5">
          {step === 'instructions' ? (
            <>
              <div>
                <div className="text-xs font-semibold tracking-[0.14em] uppercase text-slate-500">
                  Instructions
                </div>
                <h2 className="text-xl font-bold text-slate-900 mt-1">Read these rules before starting</h2>
                <p className="text-sm text-slate-600 mt-1">
                  Section: <span className="font-semibold text-slate-800">{sectionName}</span>
                  {durationMinutes != null ? (
                    <span className="ml-2">| <span className="font-semibold text-slate-800">{durationMinutes} min</span></span>
                  ) : null}
                </p>
              </div>

              <ul className="space-y-2 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-xl p-4">
                <li>- Your answers are saved automatically.</li>
                <li>- The timer keeps running if you reload, switch tabs, or lose connection.</li>
                <li>- Listening audio plays once and cannot be paused, skipped, or replayed.</li>
                <li>- Once a section ends, you cannot return to it.</li>
                <li>- Do not leave the test window. Tab switches are recorded.</li>
                {strictMode ? (
                  <li className="text-amber-800">
                    - Strict mode is on: copy/paste is blocked and the test is monitored.
                  </li>
                ) : null}
              </ul>

              {strictMode ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 flex items-start gap-3">
                  <Maximize2 size={18} className="text-amber-700 mt-0.5" />
                  <div className="text-sm text-amber-900">
                    <div className="font-semibold">Recommended: full-screen mode</div>
                    <div className="text-xs">
                      Full-screen reduces accidental tab switches. Click below to enable it.
                    </div>
                    <button
                      type="button"
                      onClick={() => void onRequestFullscreen()}
                      className="mt-2 px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700"
                    >
                      Enter full-screen
                    </button>
                  </div>
                </div>
              ) : null}

              {error ? (
                <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm p-3 flex items-start gap-2">
                  <AlertTriangle size={16} className="mt-0.5" />
                  <span>{error}</span>
                </div>
              ) : null}

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void ackEvent('instructions_acknowledged', 'instructions_acknowledged_at')}
                  className="px-5 py-2.5 rounded-xl bg-slate-900 text-white font-semibold hover:bg-black disabled:bg-slate-400"
                >
                  {busy ? 'Saving...' : 'I understand, continue'}
                </button>
              </div>
            </>
          ) : null}

          {step === 'headphones' ? (
            <>
              <div>
                <div className="text-xs font-semibold tracking-[0.14em] uppercase text-slate-500">
                  Headphone check
                </div>
                <h2 className="text-xl font-bold text-slate-900 mt-1">Make sure your audio works</h2>
                <p className="text-sm text-slate-600 mt-1">
                  Put on your headphones and play the test tone. Confirm you can hear sound clearly in both ears.
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 flex flex-col items-center gap-3">
                <div className="flex items-center gap-2 text-slate-700">
                  <Headphones size={18} />
                  <span className="text-sm font-semibold">Audio test</span>
                </div>
                <button
                  type="button"
                  onClick={playToneCheck}
                  disabled={audioPlaying}
                  className="px-5 py-3 rounded-xl bg-slate-900 text-white font-semibold hover:bg-black disabled:bg-slate-400 flex items-center gap-2"
                >
                  <Volume2 size={16} />
                  {audioPlaying ? 'Playing...' : audioPlayed ? 'Play again' : 'Play test tone'}
                </button>
                <p className="text-xs text-slate-500 max-w-md text-center">
                  You should hear three tones: left, right, then center. If you don't, check your volume,
                  audio output device and browser audio permissions.
                </p>
              </div>

              {error ? (
                <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm p-3 flex items-start gap-2">
                  <AlertTriangle size={16} className="mt-0.5" />
                  <span>{error}</span>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  className="text-sm text-slate-600 hover:text-slate-900 underline"
                  onClick={playToneCheck}
                  disabled={audioPlaying}
                >
                  {audioPlaying ? 'Playing...' : 'Replay tone'}
                </button>
                <button
                  type="button"
                  disabled={busy || !audioPlayed}
                  onClick={() => void ackEvent('headphones_checked', 'headphones_checked_at')}
                  className="px-5 py-2.5 rounded-xl bg-slate-900 text-white font-semibold hover:bg-black disabled:bg-slate-400"
                >
                  {busy ? 'Saving...' : 'Audio is clear, continue'}
                </button>
              </div>
            </>
          ) : null}

          {step === 'identity' ? (
            <>
              <div>
                <div className="text-xs font-semibold tracking-[0.14em] uppercase text-slate-500">
                  Identity & integrity
                </div>
                <h2 className="text-xl font-bold text-slate-900 mt-1">Confirm before starting</h2>
                <p className="text-sm text-slate-600 mt-1">
                  By continuing you confirm the points below. Your session is monitored for integrity events.
                </p>
              </div>

              <ul className="space-y-2 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-xl p-4">
                <li>- I am the registered candidate for this account.</li>
                <li>- I will work alone and use only the tools provided in this window.</li>
                <li>- I will not refresh the page, switch tabs, or leave the test window.</li>
                <li>- I understand that auto-submit happens at the section deadline.</li>
              </ul>

              {error ? (
                <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm p-3 flex items-start gap-2">
                  <AlertTriangle size={16} className="mt-0.5" />
                  <span>{error}</span>
                </div>
              ) : null}

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void ackEvent('identity_acknowledged', 'identity_acknowledged_at')}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:bg-slate-400"
                >
                  {busy ? 'Saving...' : 'I confirm, start the test'}
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};
