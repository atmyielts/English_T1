import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const edgeBase = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
type Branding = { id?: string; display_name: string; tagline: string; logo_url: string; favicon_url: string; primary_color: string; accent_color: string; hide_schood_logo: boolean; custom_domain: string; footer_text: string };
const EMPTY: Branding = { display_name: '', tagline: '', logo_url: '', favicon_url: '', primary_color: '#1a73e8', accent_color: '#34a853', hide_schood_logo: false, custom_domain: '', footer_text: '' };

export const WhitelabelPage: React.FC = () => {
  const navigate = useNavigate();
  const [token, setToken] = useState<string | null>(null);
  const [academyId, setAcademyId] = useState<string | null>(null);
  const [form, setForm] = useState<Branding>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { navigate('/auth?returnTo=/whitelabel', { replace: true }); return; }
      const tok = data.session.access_token;
      setToken(tok);
      fetch(`${edgeBase}/academy?action=academies`, { headers: { Authorization: `Bearer ${tok}` } })
        .then((r) => r.json()).then(async (d) => {
          const aid = d.academies?.[0]?.id;
          if (!aid) { setLoading(false); return; }
          setAcademyId(aid);
          const br = await fetch(`${edgeBase}/academy?action=branding&academy_id=${aid}`, { headers: { Authorization: `Bearer ${tok}` } }).then((r) => r.json()).catch(() => ({}));
          if (br.branding) setForm({ ...EMPTY, ...br.branding });
        }).finally(() => setLoading(false));
    });
  }, [navigate]);

  const save = async () => {
    if (!token || !academyId) return;
    setSaving(true); setError(null); setSaved(false);
    const res = await fetch(`${edgeBase}/academy`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'upsert_branding', academy_id: academyId, ...form }) }).then((r) => r.json());
    if (res.error) setError(res.error); else setSaved(true);
    setSaving(false);
  };

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="text-gray-400">Loading…</div></div>;

  const f = (key: keyof Branding) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((p) => ({ ...p, [key]: e.target.value }));

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      <div className="bg-white border-b border-gray-200 px-4 py-5">
        <div className="max-w-2xl mx-auto">
          <button onClick={() => navigate(-1)} className="text-xs text-gray-400 mb-1 block">← Back</button>
          <h1 className="text-xl font-bold text-gray-900">White-label Branding</h1>
          <p className="text-sm text-gray-500">Customise your academy's name, logo, and colours</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        {!academyId && <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">No academy found. Create an academy first from the Academy Control panel.</div>}

        {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>}
        {saved && <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-800">Branding saved successfully.</div>}

        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
          <div className="text-sm font-semibold text-gray-700">Identity</div>
          <div className="grid grid-cols-1 gap-4">
            <div><label className="block text-xs font-semibold text-gray-600 mb-1">Display Name (replaces "Schood")</label><input value={form.display_name} onChange={f('display_name')} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none" placeholder="My Academy" /></div>
            <div><label className="block text-xs font-semibold text-gray-600 mb-1">Tagline</label><input value={form.tagline} onChange={f('tagline')} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none" placeholder="Excellence in English education" /></div>
            <div><label className="block text-xs font-semibold text-gray-600 mb-1">Logo URL (PNG/SVG, hosted externally)</label><input value={form.logo_url} onChange={f('logo_url')} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none" placeholder="https://cdn.example.com/logo.png" /></div>
            {form.logo_url && <img src={form.logo_url} alt="Logo preview" className="h-12 object-contain border border-gray-200 rounded-lg p-1" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
          <div className="text-sm font-semibold text-gray-700">Colours</div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-xs font-semibold text-gray-600 mb-1">Primary Colour</label><div className="flex gap-2 items-center"><input type="color" value={form.primary_color} onChange={(e) => setForm((p) => ({ ...p, primary_color: e.target.value }))} className="h-9 w-14 rounded-lg cursor-pointer border border-gray-300" /><input value={form.primary_color} onChange={f('primary_color')} className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none" /></div></div>
            <div><label className="block text-xs font-semibold text-gray-600 mb-1">Accent Colour</label><div className="flex gap-2 items-center"><input type="color" value={form.accent_color} onChange={(e) => setForm((p) => ({ ...p, accent_color: e.target.value }))} className="h-9 w-14 rounded-lg cursor-pointer border border-gray-300" /><input value={form.accent_color} onChange={f('accent_color')} className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none" /></div></div>
          </div>
          {/* Live preview swatch */}
          <div className="flex gap-3 mt-2">
            <div className="rounded-xl px-4 py-2 text-white text-sm font-semibold" style={{ background: form.primary_color }}>Primary Button</div>
            <div className="rounded-xl px-4 py-2 text-white text-sm font-semibold" style={{ background: form.accent_color }}>Accent Button</div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
          <div className="text-sm font-semibold text-gray-700">Custom Domain</div>
          <div><label className="block text-xs font-semibold text-gray-600 mb-1">Domain</label><input value={form.custom_domain} onChange={f('custom_domain')} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none" placeholder="academy.yourdomain.com" /></div>
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800">
            <strong>Setup:</strong> Create a CNAME record pointing <code>{form.custom_domain || 'your-domain.com'}</code> → <code>academy.schood.online</code> with your DNS provider. Contact support after DNS propagation.
          </div>
          <div><label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer"><input type="checkbox" checked={form.hide_schood_logo} onChange={(e) => setForm((p) => ({ ...p, hide_schood_logo: e.target.checked }))} /><span>Hide "Powered by Schood" footer logo</span></label></div>
          <div><label className="block text-xs font-semibold text-gray-600 mb-1">Custom Footer Text</label><input value={form.footer_text} onChange={f('footer_text')} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none" placeholder="© 2026 My Academy. All rights reserved." /></div>
        </div>

        <button onClick={save} disabled={saving || !academyId} className="w-full bg-gray-900 text-white py-3 rounded-xl font-semibold text-sm hover:bg-black disabled:bg-gray-300">
          {saving ? 'Saving…' : 'Save Branding'}
        </button>
      </div>
    </div>
  );
};
