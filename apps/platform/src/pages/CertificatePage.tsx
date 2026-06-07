import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

type Certificate = {
  id: string;
  public_token: string;
  exam_type: string;
  overall_band: number | null;
  overall_score: number | null;
  section_scores: Record<string, unknown> | null;
  candidate_name: string;
  exam_date: string;
  center_name: string | null;
  center_logo_url: string | null;
  issued_at: string;
  expires_at: string | null;
  exam_config: { label: string; scoreLabel: string; maxScore: number | null; useBand: boolean };
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const edgeBase = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

const fmtBand = (band: number | null, score: number | null, useBand: boolean): string => {
  if (useBand && band !== null) return band % 1 === 0 ? band.toFixed(1) : String(band);
  if (score !== null) return String(score);
  return '—';
};

const SECTION_LABELS: Record<string, string> = {
  reading: 'Reading', writing: 'Writing', listening: 'Listening', speaking: 'Speaking',
  math: 'Math', grammar: 'Grammar', reading_writing: 'Reading & Writing',
};

// ─── Certificate Print View ───────────────────────────────────────────────────

const CertificateView: React.FC<{ cert: Certificate }> = ({ cert }) => {
  const score = fmtBand(cert.overall_band, cert.overall_score, cert.exam_config.useBand);
  const sections = cert.section_scores ? Object.entries(cert.section_scores as Record<string, any>) : [];

  return (
    <div className="certificate-print bg-white" style={{ width: '210mm', minHeight: '148mm', margin: '0 auto', padding: '12mm 16mm', boxSizing: 'border-box', fontFamily: 'Georgia, serif', position: 'relative', border: '2px solid #1a1a2e', borderRadius: '4mm' }}>
      {/* Top accent bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '6mm', background: 'linear-gradient(90deg, #1a1a2e, #16213e, #0f3460)', borderRadius: '4mm 4mm 0 0' }} />

      {/* Header */}
      <div style={{ textAlign: 'center', marginTop: '6mm', marginBottom: '8mm' }}>
        {cert.center_logo_url ? (
          <img src={cert.center_logo_url} alt="Center logo" style={{ height: '12mm', objectFit: 'contain', marginBottom: '3mm' }} />
        ) : (
          <div style={{ fontSize: '6mm', fontWeight: 'bold', color: '#1a1a2e', letterSpacing: '2px', marginBottom: '2mm' }}>SCHOOD</div>
        )}
        {cert.center_name && <div style={{ fontSize: '3.5mm', color: '#555', marginBottom: '2mm' }}>{cert.center_name}</div>}
        <div style={{ fontSize: '3mm', color: '#888', letterSpacing: '3px', textTransform: 'uppercase' }}>Certificate of Achievement</div>
      </div>

      {/* Divider */}
      <div style={{ borderTop: '0.5mm solid #c9a84c', margin: '0 20mm 8mm' }} />

      {/* Main content */}
      <div style={{ textAlign: 'center', marginBottom: '8mm' }}>
        <div style={{ fontSize: '3.5mm', color: '#444', marginBottom: '4mm' }}>This certifies that</div>
        <div style={{ fontSize: '8mm', fontWeight: 'bold', color: '#1a1a2e', marginBottom: '4mm', borderBottom: '0.5mm solid #e0e0e0', paddingBottom: '3mm', display: 'inline-block', minWidth: '80mm' }}>
          {cert.candidate_name}
        </div>
        <div style={{ fontSize: '3.5mm', color: '#444', marginBottom: '3mm', marginTop: '4mm' }}>
          has successfully completed the
        </div>
        <div style={{ fontSize: '5.5mm', fontWeight: 'bold', color: '#0f3460', marginBottom: '2mm' }}>
          {cert.exam_config.label}
        </div>
        <div style={{ fontSize: '3.5mm', color: '#666', marginBottom: '6mm' }}>
          on {fmtDate(cert.exam_date)}
        </div>

        {/* Score badge */}
        <div style={{ display: 'inline-block', border: '1mm solid #c9a84c', borderRadius: '3mm', padding: '3mm 8mm', background: '#fffbf0' }}>
          <div style={{ fontSize: '3mm', color: '#888', textTransform: 'uppercase', letterSpacing: '2px' }}>{cert.exam_config.scoreLabel}</div>
          <div style={{ fontSize: '14mm', fontWeight: 'bold', color: '#1a1a2e', lineHeight: '1' }}>{score}</div>
          {cert.exam_config.maxScore && <div style={{ fontSize: '3mm', color: '#aaa' }}>out of {cert.exam_config.maxScore}</div>}
        </div>
      </div>

      {/* Section breakdown */}
      {sections.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '6mm', marginBottom: '8mm', flexWrap: 'wrap' }}>
          {sections.map(([key, val]) => {
            const band = typeof val === 'object' && val !== null ? ((val as any).band ?? (val as any).score ?? null) : val;
            if (band === null || band === undefined) return null;
            return (
              <div key={key} style={{ textAlign: 'center', minWidth: '18mm' }}>
                <div style={{ fontSize: '4mm', fontWeight: 'bold', color: '#1a1a2e' }}>{Number(band).toFixed(1)}</div>
                <div style={{ fontSize: '2.5mm', color: '#888', textTransform: 'uppercase', letterSpacing: '1px' }}>{SECTION_LABELS[key] ?? key}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Divider */}
      <div style={{ borderTop: '0.5mm solid #e0e0e0', margin: '0 10mm 5mm' }} />

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', fontSize: '2.5mm', color: '#aaa' }}>
        <div>
          <div>Certificate ID</div>
          <div style={{ fontFamily: 'monospace', color: '#666' }}>{cert.public_token.slice(0, 16).toUpperCase()}</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div>Verify at</div>
          <div style={{ color: '#0f3460' }}>schood.online/certificate</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div>Issued</div>
          <div style={{ color: '#666' }}>{fmtDate(cert.issued_at)}</div>
        </div>
      </div>
    </div>
  );
};

// ─── Issue Certificate Modal ──────────────────────────────────────────────────

export const IssueCertificateButton: React.FC<{
  sessionId: string;
  examType: string;
  overallBand?: number | null;
  overallScore?: number | null;
  accessToken: string;
}> = ({ sessionId, examType, overallBand, overallScore, accessToken }) => {
  const [loading, setLoading] = useState(false);
  const [cert, setCert] = useState<Certificate | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const navigate = useNavigate();

  const issue = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${edgeBase}/certificates`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'issue', session_id: sessionId, exam_type: examType }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setCert(data.certificate);
      setShareUrl(data.share_url);
    } finally {
      setLoading(false);
    }
  };

  const copy = () => {
    if (shareUrl) { navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  };

  if (cert) return (
    <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
      <div className="font-semibold text-amber-900 mb-2">Certificate issued!</div>
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => navigate(`/certificate?token=${cert.public_token}`)} className="px-4 py-2 bg-gray-900 text-white text-sm rounded-xl hover:bg-black">View Certificate</button>
        <button onClick={copy} className="px-4 py-2 border border-gray-300 text-sm rounded-xl hover:bg-gray-50">{copied ? 'Copied!' : 'Copy Share Link'}</button>
      </div>
    </div>
  );

  // Only show if there's a meaningful score
  if (!overallBand && !overallScore) return null;

  return (
    <button onClick={issue} disabled={loading} className="mt-4 px-4 py-2 border border-amber-300 bg-amber-50 text-amber-900 text-sm rounded-xl hover:bg-amber-100 disabled:opacity-50 font-medium">
      {loading ? 'Generating…' : '🏆 Get Certificate'}
    </button>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export const CertificatePage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const printRef = useRef<HTMLDivElement>(null);

  const [cert, setCert] = useState<Certificate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Also handle authenticated list view when no token
  const [listMode] = useState(!token);
  const [myCerts, setMyCerts] = useState<Certificate[]>([]);
  const [listLoading, setListLoading] = useState(false);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    fetch(`${edgeBase}/certificates?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.certificate) setCert(d.certificate);
        else setError(d.error ?? 'Certificate not found');
      })
      .catch(() => setError('Failed to load certificate'))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (token || !listMode) return;
    setListLoading(true);
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) return;
      fetch(`${edgeBase}/certificates?action=list`, { headers: { Authorization: `Bearer ${data.session.access_token}` } })
        .then((r) => r.json())
        .then((d) => setMyCerts(d.certificates ?? []))
        .catch(() => null)
        .finally(() => setListLoading(false));
    });
  }, [token, listMode]);

  const print = () => window.print();

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-gray-400">Loading certificate…</div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="text-center max-w-sm">
        <div className="text-4xl mb-4">🔒</div>
        <div className="text-xl font-semibold text-gray-900 mb-2">Certificate not found</div>
        <div className="text-gray-500 text-sm mb-6">{error}</div>
        <button onClick={() => navigate(-1)} className="text-sm text-gray-500 underline">Go back</button>
      </div>
    </div>
  );

  if (!token) {
    return (
      <div className="min-h-screen bg-gray-50 py-10 px-4">
        <div className="max-w-2xl mx-auto">
          <button onClick={() => navigate(-1)} className="text-sm text-gray-500 mb-6 block">← Back</button>
          <h1 className="text-2xl font-bold text-gray-900 mb-6">My Certificates</h1>
          {listLoading ? <div className="text-gray-400">Loading…</div> : myCerts.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-2xl text-gray-400">
              No certificates yet. Complete a mock exam to earn your first certificate.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {myCerts.map((c) => (
                <button key={c.id} onClick={() => navigate(`/certificate?token=${c.public_token}`)} className="border border-gray-200 rounded-2xl p-5 text-left hover:border-amber-300 hover:shadow-sm transition-all">
                  <div className="font-semibold text-gray-900">{c.exam_type?.toUpperCase()}</div>
                  <div className="text-2xl font-bold text-gray-900 mt-1">{fmtBand(c.overall_band, c.overall_score, c.overall_band !== null)}</div>
                  <div className="text-xs text-gray-400 mt-2">{fmtDate(c.exam_date)} · {c.candidate_name}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          body > * { display: none !important; }
          .certificate-print-wrapper { display: block !important; position: fixed; inset: 0; background: white; display: flex; align-items: center; justify-content: center; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="min-h-screen bg-gray-100 py-8 px-4">
        {/* Action bar */}
        <div className="no-print max-w-[230mm] mx-auto flex items-center justify-between mb-6">
          <button onClick={() => navigate(-1)} className="text-sm text-gray-500 hover:text-gray-800">← Back</button>
          <div className="flex gap-2">
            <button onClick={copyLink} className="px-4 py-2 border border-gray-300 bg-white text-sm rounded-xl hover:bg-gray-50">
              {copied ? 'Copied!' : '🔗 Share link'}
            </button>
            <button onClick={print} className="px-4 py-2 bg-gray-900 text-white text-sm rounded-xl hover:bg-black">
              🖨 Print / Save PDF
            </button>
          </div>
        </div>

        {/* Certificate */}
        <div ref={printRef} className="certificate-print-wrapper">
          {cert && <CertificateView cert={cert} />}
        </div>

        {/* Verify note */}
        <div className="no-print text-center text-xs text-gray-400 mt-6">
          This certificate can be verified at schood.online/certificate?token={token?.slice(0, 12)}…
        </div>
      </div>
    </>
  );
};
