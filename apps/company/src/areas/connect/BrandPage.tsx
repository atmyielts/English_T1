// White label: name, colour (checked for contrast as you pick) and logo, with a preview.
import React, { useEffect, useRef, useState } from 'react';
import { useAppT } from '../../i18n/index.ts';
import { useWorkspace } from '../../session.tsx';
import { BrandMark } from './BrandMark.tsx';
import { Page, send, Status, useAction, useLoad, useOrgPath } from './shared.tsx';

interface Loaded { brand: { display_name: string | null; brand_color: string | null; logo: string | null }; company_name: string }
const MAX_LOGO = 100 * 1024;
const DEFAULT_COLOR = '#1e3a8a';

const channel = (value: number) => {
  const part = value / 255;
  return part <= 0.03928 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4;
};
const contrast = (hex: string) => {
  const number = Number.parseInt(hex.slice(1), 16);
  const light = 0.2126 * channel((number >> 16) & 255) + 0.7152 * channel((number >> 8) & 255) + 0.0722 * channel(number & 255);
  return Math.round((1.05 / (light + 0.05)) * 100) / 100;
};
/** The same colour, darkened just enough to read on white. Mirrors the server's suggestion. */
function readable(hex: string) {
  let value = hex;
  for (let step = 0; step < 100 && contrast(value) < 4.5; step++) {
    const number = Number.parseInt(value.slice(1), 16);
    value = `#${[(number >> 16) & 255, (number >> 8) & 255, number & 255].map((part) => Math.floor(part * 0.96).toString(16).padStart(2, '0')).join('')}`;
  }
  return value;
}

export function BrandPage() {
  const t = useAppT();
  const { org } = useWorkspace();
  const path = useOrgPath(org.id)('brand');
  const { data, error: loadError } = useLoad<Loaded>(path);
  const { busy, error, notice, run, setError } = useAction();
  const [name, setName] = useState('');
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [useColor, setUseColor] = useState(false);
  const [logo, setLogo] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!data) return;
    setName(data.brand.display_name ?? '');
    setColor(data.brand.brand_color ?? DEFAULT_COLOR);
    setUseColor(Boolean(data.brand.brand_color));
    setLogo(data.brand.logo);
  }, [data]);

  function choose(chosen: File | undefined) {
    if (!chosen) return;
    if (!['image/png', 'image/jpeg'].includes(chosen.type)) { setError(t('connect.brand.logoType')); return; }
    if (chosen.size > MAX_LOGO) { setError(t('connect.brand.logoLarge')); return; }
    const reader = new FileReader();
    reader.onload = () => { setError(''); setLogo(String(reader.result)); };
    reader.onerror = () => setError(t('connect.brand.logoType'));
    reader.readAsDataURL(chosen);
  }
  const save = (event: React.FormEvent) => {
    event.preventDefault();
    void run(() => send<{ brand: Loaded['brand'] }>(path, 'PUT', { display_name: name.trim() || null, brand_color: useColor ? color : null, logo }), (result) => {
      setLogo(result.brand.logo);
      return t('connect.brand.saved');
    });
  };
  const ratio = contrast(color), low = useColor && ratio < 4.5, suggestion = low ? readable(color) : '';
  const shown = name.trim() || data?.company_name || org.name;
  const accent = useColor ? color : DEFAULT_COLOR;

  return <Page title={t('connect.brand.title')} lead={t('connect.brand.lead')}>
    {loadError && <p className="error" role="alert">{loadError}</p>}
    {data && <div className="connect-two">
      <section aria-labelledby="connect-brand-form">
        <h2 id="connect-brand-form" className="visually-hidden">{t('connect.brand.title')}</h2>
        <Status error={error} notice={notice}/>
        <form onSubmit={save} className="connect-stack">
          <label>{t('connect.brand.name')}<input maxLength={120} placeholder={t('connect.brand.namePlaceholder', { name: data.company_name })} value={name} onChange={(event) => setName(event.target.value)}/></label>
          <label className="check"><input type="checkbox" checked={useColor} onChange={(event) => setUseColor(event.target.checked)}/>{t('connect.brand.color')}</label>
          {useColor && <div className="connect-color">
            <label><span className="visually-hidden">{t('connect.brand.color')}</span><input type="color" value={color} onChange={(event) => setColor(event.target.value.toLowerCase())}/></label>
            <label><span className="visually-hidden">{t('connect.brand.color')}</span><input maxLength={7} pattern="#[0-9a-fA-F]{6}" value={color} onChange={(event) => { if (/^#[0-9a-fA-F]{0,6}$/.test(event.target.value)) setColor(event.target.value.toLowerCase()); }}/></label>
          </div>}
          {useColor && /^#[0-9a-f]{6}$/.test(color) && (low ? <div className="connect-warn" role="status">
            <p>{t('connect.brand.colorLow', { suggestion })}</p>
            <button type="button" className="quiet" onClick={() => setColor(suggestion)}>{t('connect.brand.useSuggestion', { suggestion })}</button>
          </div> : <p className="hint">{t('connect.brand.colorHint', { contrast: ratio })}</p>)}
          <label>{t('connect.brand.logo')}<input ref={file} type="file" accept="image/png,image/jpeg" onChange={(event) => choose(event.target.files?.[0])}/><span className="hint">{t('connect.brand.logoHint')}</span></label>
          {logo && <div className="company-actions"><button type="button" className="quiet" onClick={() => { setLogo(null); if (file.current) file.current.value = ''; }}>{t('connect.brand.logoRemove')}</button></div>}
          <div className="company-actions"><button disabled={busy || low}>{t('connect.brand.save')}</button></div>
        </form>
      </section>
      <section aria-labelledby="connect-brand-preview">
        <h2 id="connect-brand-preview">{t('connect.brand.preview')}</h2>
        <div className="connect-preview">
          <BrandMark brand={{ name: shown, color: useColor && /^#[0-9a-f]{6}$/.test(color) ? color : null, logo }}/>
          <h3>{t('connect.brand.previewTitle')}</h3>
          <p>{t('connect.brand.previewText')}</p>
          <span className="connect-preview-button" style={{ background: accent }}>{t('connect.brand.previewButton')}</span>
        </div>
      </section>
    </div>}
  </Page>;
}
