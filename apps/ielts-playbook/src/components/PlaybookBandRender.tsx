import React, { useState } from 'react';
import { Sparkles, Crosshair, ChevronDown, ChevronUp } from 'lucide-react';
import { playbookBandRender, type PlaybookBandRenderResponse } from '../lib/api';

interface Props {
  accessToken: string | null;
  pageSlug: string;
  defaultBand?: number;
}

const BAND_OPTIONS = [5, 5.5, 6, 6.5, 7, 7.5, 8];

export const PlaybookBandRender: React.FC<Props> = ({ accessToken, pageSlug, defaultBand = 6.5 }) => {
  const [targetBand, setTargetBand] = useState<number>(defaultBand);
  const [data, setData] = useState<PlaybookBandRenderResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async (band: number) => {
    if (!accessToken) return;
    setBusy(true);
    setError(null);
    try {
      const res = await playbookBandRender(accessToken, pageSlug, band);
      setData(res);
      setOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate framing');
    } finally {
      setBusy(false);
    }
  };

  if (!accessToken) return null;

  return (
    <section
      style={{
        margin: '24px 0',
        padding: 18,
        borderRadius: 12,
        border: '1px solid color-mix(in srgb, #6c4ab8 22%, transparent)',
        background: 'color-mix(in srgb, #6c4ab8 4%, white)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Crosshair size={18} color="#6c4ab8" />
          <strong style={{ fontFamily: 'Fraunces, serif', fontSize: 16 }}>
            Re-frame for my band
          </strong>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 13, color: '#3b352a' }}>
            Target band:
            <select
              value={String(targetBand)}
              onChange={(e) => setTargetBand(Number(e.target.value))}
              style={{
                marginLeft: 6,
                padding: '4px 8px',
                fontSize: 13,
                border: '1px solid #d4cdb9',
                borderRadius: 6,
                background: '#fff',
              }}
            >
              {BAND_OPTIONS.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="button button-primary"
            onClick={() => void generate(targetBand)}
            disabled={busy}
            style={{ padding: '8px 14px', fontSize: 13 }}
          >
            {busy ? 'Generating…' : data ? 'Re-frame' : 'Frame for me'} <Sparkles size={13} style={{ marginLeft: 4 }} />
          </button>
          {data ? (
            <button
              type="button"
              className="button button-secondary"
              onClick={() => setOpen((o) => !o)}
              style={{ padding: '8px 14px', fontSize: 13 }}
            >
              {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          ) : null}
        </div>
      </div>

      {error ? <p style={{ color: '#9b2c2c', margin: '10px 0 0', fontSize: 13 }}>{error}</p> : null}

      {data && open ? (
        <div
          style={{
            marginTop: 14,
            padding: 14,
            background: '#fff',
            border: '1px solid #e8e2d0',
            borderRadius: 8,
          }}
        >
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#6c4ab8', margin: '0 0 8px' }}>
            Framing for band {data.target_band}
          </p>
          <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: '#1a1814' }}>
            {data.framing}
          </p>
          {data.focus_points.length > 0 ? (
            <>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#6c4ab8', margin: '14px 0 6px' }}>
                Priorities at this band
              </p>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.55, color: '#3b352a' }}>
                {data.focus_points.map((point, i) => (
                  <li key={i} style={{ marginBottom: 4 }}>{point}</li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
};
