import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ExternalLink, MapPin, MinusCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { enumLabel, useT } from '../i18n';
import { playbookMarketsGet, type PlaybookMarket } from '../lib/api';

type LocalGuide = {
  title?: string;
  checked_on?: string;
  cities?: string[];
  cities_note?: string;
  delivery?: string;
  booking?: string[];
  lead_time?: string;
  fees?: string;
  one_skill_retake?: string;
  ukvi?: string;
  links?: Array<{ label?: string; url?: string }>;
};

const asGuide = (value: unknown): LocalGuide | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as LocalGuide) : null;

const asList = (value: unknown): string[] => (Array.isArray(value) ? value.map((v) => String(v ?? '')).filter(Boolean) : []);

/** "Where will you sit IELTS?" — local test-path facts for the chosen country and provider. */
export const MarketGuidePanel: React.FC<{ initialCountry?: string | null; initialProvider?: string | null }> = ({
  initialCountry,
  initialProvider,
}) => {
  const t = useT();
  const [markets, setMarkets] = useState<PlaybookMarket[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [country, setCountry] = useState<string>(initialCountry || '');
  const [provider, setProvider] = useState<string>(initialProvider || '');

  useEffect(() => {
    let active = true;
    playbookMarketsGet()
      .then((res) => {
        if (active) setMarkets(Array.isArray(res.markets) ? res.markets : []);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const countries = useMemo(() => Array.from(new Set((markets ?? []).map((m) => m.country_code))).sort(), [markets]);
  const activeCountry = country && countries.includes(country) ? country : countries.includes('UZ') ? 'UZ' : countries[0] ?? '';
  const providers = (markets ?? []).filter((m) => m.country_code === activeCountry).map((m) => m.provider_key);
  const activeProvider = provider && providers.includes(provider) ? provider : providers[0] ?? '';
  const market = (markets ?? []).find((m) => m.country_code === activeCountry && m.provider_key === activeProvider) ?? null;
  const guide = asGuide(market?.metadata?.local_guide);

  if (failed) {
    return <p className="notice-banner" role="status">{t('market.unavailable')}</p>;
  }

  const flag = (on: boolean, label: string) => (
    <li className={on ? 'flag-on' : 'flag-off'}>
      {on ? <CheckCircle2 size={16} /> : <MinusCircle size={16} />}
      <span>{label}: {on ? t('market.yes') : t('market.notListed')}</span>
    </li>
  );

  return (
    <section className="market-panel" aria-labelledby="market-panel-title" data-testid="market-panel">
      <div className="section-heading compact-heading">
        <p className="eyebrow">
          <MapPin size={12} /> {t('market.eyebrow')}
        </p>
        <h2 id="market-panel-title">{t('market.title')}</h2>
        <p>{t('market.lead')}</p>
      </div>

      {markets == null ? (
        <span className="p2-skeleton p2-skeleton-block" aria-hidden="true" />
      ) : markets.length === 0 ? (
        <p>{t('market.empty')}</p>
      ) : (
        <>
          <div className="form-grid market-selectors">
            <label>
              {t('market.country')}
              <select value={activeCountry} onChange={(e) => { setCountry(e.target.value); setProvider(''); }}>
                {countries.map((code) => (
                  <option key={code} value={code}>{enumLabel(t, 'country', code.toLowerCase(), code)}</option>
                ))}
              </select>
            </label>
            <label>
              {t('market.provider')}
              <select value={activeProvider} onChange={(e) => setProvider(e.target.value)}>
                {providers.map((key) => (
                  <option key={key} value={key}>{enumLabel(t, 'provider', key, key)}</option>
                ))}
              </select>
            </label>
          </div>

          {market ? (
            <div className="market-body">
              <p className="lead-copy">{market.summary}</p>
              <ul className="market-flags">
                {flag(market.computer_available, t('market.flag.computer'))}
                {flag(market.writing_on_paper_available, t('market.flag.writingOnPaper'))}
                {flag(market.one_skill_retake_available, t('market.flag.osr'))}
                {flag(market.ukvi_available, t('market.flag.ukvi'))}
              </ul>
              {market.result_timing_note ? (
                <p><strong>{t('market.results')}:</strong> {market.result_timing_note}</p>
              ) : null}

              {guide ? (
                <div className="market-guide">
                  {asList(guide.cities).length > 0 ? (
                    <div>
                      <h3>{t('market.cities')}</h3>
                      <ul className="pill-row market-cities">
                        {asList(guide.cities).map((city) => <li key={city} className="pill">{city}</li>)}
                      </ul>
                    </div>
                  ) : null}
                  {guide.cities_note ? <p className="muted">{guide.cities_note}</p> : null}
                  {guide.delivery ? <p><strong>{t('market.delivery')}:</strong> {guide.delivery}</p> : null}
                  {asList(guide.booking).length > 0 ? (
                    <div>
                      <h3>{t('market.bookingSteps')}</h3>
                      <ol>{asList(guide.booking).map((step) => <li key={step}>{step}</li>)}</ol>
                    </div>
                  ) : null}
                  {guide.lead_time ? <p><strong>{t('market.leadTime')}:</strong> {guide.lead_time}</p> : null}
                  {guide.fees ? <p><strong>{t('market.fees')}:</strong> {guide.fees}</p> : null}
                  {guide.one_skill_retake ? <p><strong>{t('market.flag.osr')}:</strong> {guide.one_skill_retake}</p> : null}
                  {guide.ukvi ? <p><strong>{t('market.flag.ukvi')}:</strong> {guide.ukvi}</p> : null}
                  {guide.checked_on ? <p className="muted">{t('market.checkedOn', { date: guide.checked_on })}</p> : null}
                </div>
              ) : null}

              <div className="inline-actions">
                {market.booking_url ? (
                  <a href={market.booking_url} className="button button-primary" target="_blank" rel="noreferrer noopener">
                    {t('market.bookingPage')}
                    <ExternalLink size={15} />
                  </a>
                ) : null}
                {(guide?.links ?? [])
                  .filter((link) => link?.url && link.url !== market.booking_url)
                  .map((link) => (
                    <a key={link.url} href={link.url} className="button button-secondary" target="_blank" rel="noreferrer noopener">
                      {link.label || link.url}
                      <ExternalLink size={15} />
                    </a>
                  ))}
                <Link to="/onboarding" className="button button-secondary">{t('market.useInPlan')}</Link>
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
};
