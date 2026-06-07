import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const edgeBase = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
type Assessment = { id: string; title: string; exam_type: string; passing_band: number | null; status: string; created_at: string };
type Candidate = { id: string; email: string; full_name: string | null; status: string; overall_band: number | null; overall_score: number | null; invited_at: string; completed_at: string | null };

const statusColor = (s: string) => ({ invited: 'bg-blue-100 text-blue-700', started: 'bg-amber-100 text-amber-700', completed: 'bg-emerald-100 text-emerald-700', expired: 'bg-gray-100 text-gray-500' }[s] ?? 'bg-gray-100 text-gray-500');
const fmtDate = (s: string | null) => s ? new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

export const CorporateAssessmentPage: React.FC = () => {
  const navigate = useNavigate();
  const [token, setToken] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [selectedAssess, setSelectedAssess] = useState<Assessment | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ title: '', description: '', exam_type: 'ielts', passing_band: '' });
  const [creating, setCreating] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteText, setInviteText] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteResults, setInviteResults] = useState<any[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { navigate('/auth?returnTo=/corporate-assessment', { replace: true }); return; }
      const tok = data.session.access_token;
      setToken(tok);
      const acads = await fetch(`${edgeBase}/academy?action=academies`, { headers: { Authorization: `Bearer ${tok}` } }).then((r) => r.json());
      const tid = acads.academies?.[0]?.id;
      if (!tid) { setLoading(false); return; }
      setTenantId(tid);
      const as = await fetch(`${edgeBase}/corporate-assessment`, { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'list_assessments', tenant_id: tid }) }).then((r) => r.json());
      setAssessments(as.assessments ?? []);
      setLoading(false);
    });
  }, [navigate]);

  const openAssessment = async (a: Assessment) => {
    setSelectedAssess(a);
    if (!token) return;
    const c = await fetch(`${edgeBase}/corporate-assessment`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'list_candidates', assessment_id: a.id }) }).then((r) => r.json());
    setCandidates(c.candidates ?? []);
  };

  const createAssessment = async () => {
    if (!token || !tenantId || !createForm.title) return;
    setCreating(true);
    const res = await fetch(`${edgeBase}/corporate-assessment`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create_assessment', tenant_id: tenantId, ...createForm, passing_band: createForm.passing_band ? Number(createForm.passing_band) : null }) }).then((r) => r.json());
    if (res.assessment) { setAssessments((a) => [res.assessment, ...a]); setShowCreate(false); setCreateForm({ title: '', description: '', exam_type: 'ielts', passing_band: '' }); }
    setCreating(false);
  };

  const inviteCandidates = async () => {
    if (!token || !selectedAssess) return;
    const lines = inviteText.trim().split('\n').filter(Boolean);
    const candidates = lines.map((line) => { const parts = line.split(/[\t,]/).map((p) => p.trim()); const email = parts.find((p) => p.includes('@')) ?? parts[0]; const full_name = parts.find((p) => !p.includes('@') && p.length > 1) ?? ''; return { email, full_name }; }).filter((c) => c.email.includes('@'));
    if (!candidates.length) return;
    setInviting(true);
    const res = await fetch(`${edgeBase}/corporate-assessment`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'invite_candidates', assessment_id: selectedAssess.id, candidates, expires_in_days: 14 }) }).then((r) => r.json());
    setInviteResults(res.results ?? []);
    const c = await fetch(`${edgeBase}/corporate-assessment`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'list_candidates', assessment_id: selectedAssess.id }) }).then((r) => r.json());
    setCandidates(c.candidates ?? []);
    setInviting(false);
  };

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="text-gray-400">Loading…</div></div>;

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      <div className="bg-white border-b border-gray-200 px-4 py-5">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div><button onClick={selectedAssess ? () => setSelectedAssess(null) : () => navigate(-1)} className="text-xs text-gray-400 mb-1 block">← {selectedAssess ? 'All Assessments' : 'Back'}</button><h1 className="text-xl font-bold text-gray-900">{selectedAssess ? selectedAssess.title : 'Corporate Assessments'}</h1><p className="text-sm text-gray-500">{selectedAssess ? `${selectedAssess.exam_type?.toUpperCase()} · Passing band: ${selectedAssess.passing_band ?? '—'}` : 'Test candidates and issue certified results'}</p></div>
          {!selectedAssess && <button onClick={() => setShowCreate(true)} className="px-4 py-2 bg-gray-900 text-white text-sm rounded-xl hover:bg-black">+ New Assessment</button>}
          {selectedAssess && <button onClick={() => setShowInvite(true)} className="px-4 py-2 bg-gray-900 text-white text-sm rounded-xl hover:bg-black">+ Invite Candidates</button>}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {!tenantId && <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">No academy found. Create an academy first.</div>}

        {/* Assessments list */}
        {!selectedAssess && assessments.length === 0 && <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-2xl text-gray-400">No assessments yet. Create your first to start inviting candidates.</div>}
        {!selectedAssess && assessments.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {assessments.map((a) => (
              <button key={a.id} onClick={() => openAssessment(a)} className="bg-white border border-gray-200 rounded-2xl p-5 text-left hover:border-gray-400 hover:shadow-sm transition-all">
                <div className="font-semibold text-gray-900">{a.title}</div>
                <div className="text-sm text-gray-500 mt-1">{a.exam_type?.toUpperCase()}{a.passing_band ? ` · Band ${a.passing_band}+` : ''}</div>
                <div className="text-xs text-gray-400 mt-2">{fmtDate(a.created_at)}</div>
                <span className={`inline-block mt-2 text-xs px-2 py-0.5 rounded-full ${a.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{a.status}</span>
              </button>
            ))}
          </div>
        )}

        {/* Candidates list */}
        {selectedAssess && (
          <div>
            <div className="grid grid-cols-3 gap-3 mb-5">
              {[{ label: 'Invited', val: candidates.length }, { label: 'Completed', val: candidates.filter((c) => c.status === 'completed').length }, { label: 'Avg Band', val: (() => { const done = candidates.filter((c) => c.overall_band !== null); return done.length > 0 ? (done.reduce((a, c) => a + (c.overall_band ?? 0), 0) / done.length).toFixed(1) : '—'; })() }].map((s) => (
                <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4 text-center"><div className="text-2xl font-bold text-gray-900">{s.val}</div><div className="text-xs text-gray-500 mt-0.5">{s.label}</div></div>
              ))}
            </div>
            {candidates.length === 0 ? <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-2xl text-gray-400">No candidates yet. Invite them with the button above.</div> : (
              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-4 py-2.5 bg-gray-50 text-xs font-semibold text-gray-500 border-b">
                  <span>Candidate</span><span>Status</span><span>Band</span><span>Date</span>
                </div>
                {candidates.map((c) => (
                  <div key={c.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-4 items-center px-4 py-3 border-b border-gray-100 last:border-0 text-sm">
                    <div><div className="font-medium text-gray-900">{c.full_name ?? c.email}</div><div className="text-xs text-gray-400">{c.email}</div></div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor(c.status)}`}>{c.status}</span>
                    <span className="font-semibold text-gray-900">{c.overall_band ?? c.overall_score ?? '—'}</span>
                    <span className="text-xs text-gray-400">{fmtDate(c.completed_at ?? c.invited_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Create modal */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
              <h2 className="font-semibold text-gray-900">New Assessment</h2>
              <div><label className="block text-xs font-semibold text-gray-600 mb-1">Title *</label><input value={createForm.title} onChange={(e) => setCreateForm((f) => ({ ...f, title: e.target.value }))} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none" placeholder="English Proficiency Test 2026" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-semibold text-gray-600 mb-1">Exam Type</label><select value={createForm.exam_type} onChange={(e) => setCreateForm((f) => ({ ...f, exam_type: e.target.value }))} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm"><option value="ielts">IELTS</option><option value="sat">SAT</option><option value="toefl">TOEFL</option></select></div>
                <div><label className="block text-xs font-semibold text-gray-600 mb-1">Passing Band</label><input type="number" min={1} max={9} step={0.5} value={createForm.passing_band} onChange={(e) => setCreateForm((f) => ({ ...f, passing_band: e.target.value }))} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none" placeholder="6.0" /></div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowCreate(false)} className="flex-1 border border-gray-200 rounded-xl py-2.5 text-sm hover:bg-gray-50">Cancel</button>
                <button onClick={createAssessment} disabled={creating || !createForm.title} className="flex-1 bg-gray-900 text-white rounded-xl py-2.5 text-sm font-semibold disabled:bg-gray-300 hover:bg-black">{creating ? 'Creating…' : 'Create'}</button>
              </div>
            </div>
          </div>
        )}

        {/* Invite modal */}
        {showInvite && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
              <h2 className="font-semibold text-gray-900">Invite Candidates</h2>
              <p className="text-xs text-gray-500">One per line: email or "Name, email"</p>
              <textarea value={inviteText} onChange={(e) => setInviteText(e.target.value)} rows={8} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none" placeholder={"john@company.com\nJane Smith, jane@company.com"} />
              {inviteResults.length > 0 && <div className="text-sm text-emerald-700 bg-emerald-50 rounded-xl p-3">{inviteResults.filter((r) => r.status === 'ok').length} invited, {inviteResults.filter((r) => r.status !== 'ok').length} failed</div>}
              <div className="flex gap-2">
                <button onClick={() => { setShowInvite(false); setInviteResults([]); setInviteText(''); }} className="flex-1 border border-gray-200 rounded-xl py-2.5 text-sm hover:bg-gray-50">Close</button>
                <button onClick={inviteCandidates} disabled={inviting || !inviteText.trim()} className="flex-1 bg-gray-900 text-white rounded-xl py-2.5 text-sm font-semibold disabled:bg-gray-300 hover:bg-black">{inviting ? 'Inviting…' : 'Send Invites'}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
