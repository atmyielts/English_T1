import React, { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, ShieldCheck } from 'lucide-react';
import { getIntegrityEvents, type IntegrityEventRecord } from '../../lib/platformClient';

interface IntegrityLogPanelProps {
  accessToken: string;
  sessionId: string;
}

const severityClass = (severity: string): string => {
  switch (severity) {
    case 'high':
      return 'bg-rose-50 border-rose-200 text-rose-900';
    case 'warn':
      return 'bg-amber-50 border-amber-200 text-amber-900';
    default:
      return 'bg-slate-50 border-slate-200 text-slate-800';
  }
};

const formatRelative = (iso: string): string => {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
};

export const IntegrityLogPanel: React.FC<IntegrityLogPanelProps> = ({ accessToken, sessionId }) => {
  const [events, setEvents] = useState<IntegrityEventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getIntegrityEvents(accessToken, sessionId, 200);
      setEvents(res.events ?? []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, sessionId]);

  const counts = events.reduce(
    (acc, e) => {
      acc.total += 1;
      if (e.severity === 'high') acc.high += 1;
      else if (e.severity === 'warn') acc.warn += 1;
      else acc.info += 1;
      return acc;
    },
    { total: 0, info: 0, warn: 0, high: 0 },
  );

  return (
    <section className="border border-slate-200 rounded-2xl bg-white">
      <header className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
        <ShieldCheck size={18} className="text-slate-700" />
        <div>
          <div className="text-[11px] font-semibold tracking-[0.14em] uppercase text-slate-500">
            Integrity log
          </div>
          <div className="text-sm font-semibold text-slate-900">Session events</div>
        </div>
        <div className="ml-auto flex items-center gap-2 text-xs">
          <span className="px-2 py-1 rounded bg-slate-100 text-slate-700">total {counts.total}</span>
          <span className="px-2 py-1 rounded bg-amber-50 text-amber-800">warn {counts.warn}</span>
          <span className="px-2 py-1 rounded bg-rose-50 text-rose-800">high {counts.high}</span>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="ml-2 inline-flex items-center gap-1.5 px-2 py-1 rounded border border-slate-200 hover:bg-slate-50 text-slate-700"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Reload
          </button>
        </div>
      </header>

      <div className="p-4">
        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm p-3 flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5" />
            <span>{error}</span>
          </div>
        ) : null}

        {loading && events.length === 0 ? (
          <div className="text-sm text-slate-500">Loading events...</div>
        ) : null}

        {!loading && events.length === 0 ? (
          <div className="text-sm text-slate-500">No integrity events recorded for this session.</div>
        ) : null}

        <ul className="space-y-2">
          {events.map((e) => (
            <li
              key={e.id}
              className={`rounded-lg border px-3 py-2 text-xs flex items-start gap-3 ${severityClass(e.severity)}`}
            >
              <div className="font-mono uppercase tracking-wider font-semibold w-32 shrink-0">
                {e.event_type}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-slate-600">{formatRelative(e.created_at)}</div>
                {e.data && Object.keys(e.data).length > 0 ? (
                  <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[11px] text-slate-700">
                    {JSON.stringify(e.data)}
                  </pre>
                ) : null}
              </div>
              <div className="text-[10px] uppercase font-semibold tracking-wider opacity-80">{e.severity}</div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};
