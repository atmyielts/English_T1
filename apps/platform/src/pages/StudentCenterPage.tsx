import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Bell,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock3,
  CreditCard,
  ExternalLink,
  GraduationCap,
  LayoutDashboard,
  Menu,
  MessageSquareText,
  RefreshCw,
  Route,
} from 'lucide-react';
import { LanguageSwitcher } from '../components/layout/LanguageSwitcher';
import { useI18n } from '../i18n';
import { studentCenterDashboard, type StudentCenterDashboard } from '../lib/platformClient';
import { supabase } from '../lib/supabase';
import './StudentCenterPage.css';

const CACHE_TTL_MS = 10 * 60_000;

const isExternal = (href: string): boolean => /^https?:\/\//i.test(href);

const formatWhen = (value: string | null | undefined, locale: string): string => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
};

const readCache = (userId: string): StudentCenterDashboard | null => {
  try {
    const raw = sessionStorage.getItem(`schood:student-center:${userId}`);
    if (!raw) return null;
    const value = JSON.parse(raw) as StudentCenterDashboard;
    if (!value.generated_at || Date.now() - Date.parse(value.generated_at) > CACHE_TTL_MS) return null;
    return value;
  } catch {
    return null;
  }
};

const writeCache = (userId: string, value: StudentCenterDashboard): void => {
  try {
    sessionStorage.setItem(`schood:student-center:${userId}`, JSON.stringify(value));
  } catch {
    // The live response still works when storage is unavailable.
  }
};

type DestinationProps = React.PropsWithChildren<{ href: string; className?: string; ariaLabel?: string }>;

const Destination: React.FC<DestinationProps> = ({ href, className, ariaLabel, children }) => isExternal(href) ? (
  <a className={className} href={href} aria-label={ariaLabel}>{children}</a>
) : (
  <Link className={className} to={href || '/'} aria-label={ariaLabel}>{children}</Link>
);

export const StudentCenterPage: React.FC = () => {
  const navigate = useNavigate();
  const { locale, t } = useI18n();
  const [dashboard, setDashboard] = useState<StudentCenterDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!session) {
        navigate(`/auth?mode=signin&returnTo=${encodeURIComponent('/student-center')}`, { replace: true });
        return;
      }
      const cached = readCache(session.user.id);
      if (!background && cached) {
        setDashboard(cached);
        setLoading(false);
        setRefreshing(true);
      }
      const { data: settings, error: settingsError } = await supabase
        .from('platform_settings')
        .select('student_center_enabled')
        .eq('id', 1)
        .maybeSingle();
      if (!settingsError && settings?.student_center_enabled === false) {
        setDisabled(true);
        return;
      }
      setDisabled(false);
      const next = await studentCenterDashboard(session.access_token);
      setDashboard(next);
      writeCache(session.user.id, next);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t('studentCenter.error.load'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [navigate, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const upcoming = useMemo(() => (dashboard?.calendar ?? [])
    .filter((item) => Date.parse(item.ends_at) >= Date.now() - 30 * 60_000)
    .sort((left, right) => Date.parse(left.starts_at) - Date.parse(right.starts_at))
    .slice(0, 8), [dashboard]);
  const actions = useMemo(() => (dashboard?.next_actions ?? []).slice(0, 10), [dashboard]);
  const urgentCount = actions.filter((action) => action.priority === 'urgent').length;
  const academyCount = dashboard?.services.filter((service) => service.source === 'academy').length ?? 0;
  const personalCount = (dashboard?.services.length ?? 0) - academyCount;

  if (disabled) {
    return (
      <main className="student-center student-center--message">
        <section className="student-center__notice" aria-labelledby="student-center-paused-title">
          <span className="student-center__eyebrow">{t('studentCenter.label')}</span>
          <h1 id="student-center-paused-title">{t('studentCenter.disabled.title')}</h1>
          <p>{t('studentCenter.disabled.body')}</p>
          <Link className="student-center__button student-center__button--primary" to="/account">{t('studentCenter.disabled.action')}</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="student-center">
      <header className="student-center__masthead">
        <div>
          <span className="student-center__eyebrow">{t('studentCenter.label')}</span>
          <h1>{t('studentCenter.title')}</h1>
          <p>{t('studentCenter.subtitle')}</p>
        </div>
        <div className="student-center__masthead-actions">
          <LanguageSwitcher compact={false} />
          <button className="student-center__button" type="button" onClick={() => void load(true)} disabled={refreshing}>
            <RefreshCw size={16} className={refreshing ? 'is-spinning' : ''} aria-hidden />
            {refreshing ? t('studentCenter.refreshing') : t('studentCenter.refresh')}
          </button>
          <Link className="student-center__avatar" to="/account" aria-label={t('studentCenter.account')}>
            {(dashboard?.identity.email ?? 'S').slice(0, 1).toUpperCase()}
          </Link>
        </div>
      </header>

      <details className="student-center__mobile-nav">
        <summary><Menu size={18} aria-hidden /> {t('studentCenter.sections')}</summary>
        <nav aria-label={t('studentCenter.sections')}>
          <a href="#today">{t('studentCenter.nav.today')}</a>
          <a href="#learning">{t('studentCenter.nav.learning')}</a>
          <a href="#calendar">{t('studentCenter.nav.calendar')}</a>
          <a href="#progress">{t('studentCenter.nav.progress')}</a>
          <a href="#access">{t('studentCenter.nav.access')}</a>
          <a href="#updates">{t('studentCenter.nav.updates')}</a>
        </nav>
      </details>

      <div className="student-center__layout">
        <aside className="student-center__rail">
          <div className="student-center__brand-mark" aria-hidden><GraduationCap size={22} /></div>
          <nav aria-label={t('studentCenter.sections')}>
            <a href="#today"><LayoutDashboard size={17} />{t('studentCenter.nav.today')}</a>
            <a href="#learning"><BookOpen size={17} />{t('studentCenter.nav.learning')}</a>
            <a href="#calendar"><CalendarDays size={17} />{t('studentCenter.nav.calendar')}</a>
            <a href="#progress"><Route size={17} />{t('studentCenter.nav.progress')}</a>
            <a href="#access"><CreditCard size={17} />{t('studentCenter.nav.access')}</a>
            <a href="#updates"><Bell size={17} />{t('studentCenter.nav.updates')}</a>
          </nav>
          <div className="student-center__rail-footer">
            <Link to="/account"><CreditCard size={16} />{t('studentCenter.nav.access')}</Link>
            <Link to="/contact"><MessageSquareText size={16} />{t('studentCenter.nav.help')}</Link>
          </div>
        </aside>

        <div className="student-center__content">
          {error ? (
            <section className="student-center__error" role="alert">
              <div><strong>{t('studentCenter.error.title')}</strong><p>{t('studentCenter.error.load')}</p></div>
              <button type="button" onClick={() => void load()}>{t('studentCenter.retry')}</button>
            </section>
          ) : null}

          {dashboard?.partial_errors.length ? (
            <section className="student-center__partial" aria-label={t('studentCenter.partial.title')}>
              <div><strong>{t('studentCenter.partial.title')}</strong><p>{t('studentCenter.partial.body')}</p></div>
              <button type="button" onClick={() => void load(true)}>{t('studentCenter.retry')}</button>
            </section>
          ) : null}

          <section className="student-center__today" id="today" aria-labelledby="today-title">
            <div className="student-center__section-heading">
              <div><span>{t('studentCenter.today.eyebrow')}</span><h2 id="today-title">{t('studentCenter.today.title')}</h2></div>
              <p>{urgentCount ? t('studentCenter.today.urgent', { count: urgentCount }) : t('studentCenter.today.clear')}</p>
            </div>
            <div className="student-center__daybook">
              {loading && !dashboard ? Array.from({ length: 4 }).map((_, index) => <div className="student-center__daybook-skeleton" key={index} />) : null}
              {actions.map((action, index) => (
                <article className={`student-center__daybook-row ${action.priority === 'urgent' ? 'is-urgent' : ''}`} key={action.id}>
                  <div className="student-center__daybook-time">
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <i aria-hidden />
                  </div>
                  <div className="student-center__daybook-copy">
                    <small>{action.context} · {action.kind.replace(/_/g, ' ')}</small>
                    <h3>{action.title}</h3>
                    <p>{action.due_at ? formatWhen(action.due_at, locale) : t('studentCenter.today.noDeadline')}</p>
                  </div>
                  <Destination className="student-center__round-action" href={action.href} ariaLabel={`${t('studentCenter.open')} ${action.title}`}>
                    <ArrowRight size={18} aria-hidden />
                  </Destination>
                </article>
              ))}
              {!loading && actions.length === 0 ? (
                <div className="student-center__empty"><CheckCircle2 size={28} /><div><h3>{t('studentCenter.today.emptyTitle')}</h3><p>{t('studentCenter.today.emptyBody')}</p></div></div>
              ) : null}
            </div>
          </section>

          <section className="student-center__learning" id="learning" aria-labelledby="learning-title">
            <div className="student-center__section-heading">
              <div><span>{t('studentCenter.learning.eyebrow')}</span><h2 id="learning-title">{t('studentCenter.learning.title')}</h2></div>
              <p>{t('studentCenter.learning.summary', { academies: academyCount, personal: personalCount })}</p>
            </div>
            <div className="student-center__service-list">
              {(dashboard?.services ?? []).map((service) => (
                <article key={service.id}>
                  <div className={`student-center__service-icon is-${service.source}`} aria-hidden>
                    {service.source === 'academy' ? <GraduationCap size={20} /> : <BookOpen size={20} />}
                  </div>
                  <div><small>{service.subtitle || service.kind}</small><h3>{service.title}</h3></div>
                  <Destination href={service.href} className="student-center__button">
                    {t('studentCenter.continue')} {isExternal(service.href) ? <ExternalLink size={15} /> : <ArrowRight size={15} />}
                  </Destination>
                </article>
              ))}
              {!loading && (dashboard?.services.length ?? 0) === 0 ? (
                <div className="student-center__empty"><BookOpen size={28} /><div><h3>{t('studentCenter.learning.emptyTitle')}</h3><p>{t('studentCenter.learning.emptyBody')}</p></div><Link to="/plans">{t('studentCenter.learning.explore')}</Link></div>
              ) : null}
            </div>
          </section>
        </div>

        <aside className="student-center__context">
          <section id="calendar" aria-labelledby="calendar-title">
            <div className="student-center__context-title"><CalendarDays size={18} /><h2 id="calendar-title">{t('studentCenter.calendar.title')}</h2></div>
            <div className="student-center__calendar-list">
              {upcoming.map((item) => (
                <article key={item.id}>
                  <time dateTime={item.starts_at}>{formatWhen(item.starts_at, locale)}</time>
                  <h3>{item.title}</h3><p>{item.context}</p>
                  <Destination href={item.href} className={item.join_available ? 'student-center__join is-open' : 'student-center__join'}>
                    {item.join_available ? t('studentCenter.calendar.join') : t('studentCenter.calendar.details')}
                  </Destination>
                </article>
              ))}
              {!loading && upcoming.length === 0 ? <p className="student-center__muted">{t('studentCenter.calendar.empty')}</p> : null}
            </div>
          </section>

          <section id="progress" aria-labelledby="progress-title">
            <div className="student-center__context-title"><Route size={18} /><h2 id="progress-title">{t('studentCenter.progress.title')}</h2></div>
            <div className="student-center__progress-list">
              {(dashboard?.progress ?? []).slice(0, 6).map((item) => (
                <Destination href={item.href} key={item.id}>
                  <div><h3>{item.title}</h3><span>{item.percent === null ? t('studentCenter.progress.starting') : `${item.percent}%`}</span></div>
                  <div className="student-center__progress-track"><i style={{ width: `${item.percent ?? 0}%` }} /></div>
                </Destination>
              ))}
              {!loading && (dashboard?.progress.length ?? 0) === 0 ? <p className="student-center__muted">{t('studentCenter.progress.empty')}</p> : null}
            </div>
          </section>

          <section id="updates" aria-labelledby="updates-title">
            <div className="student-center__context-title"><MessageSquareText size={18} /><h2 id="updates-title">{t('studentCenter.updates.title')}</h2></div>
            <div className="student-center__update-list">
              {(dashboard?.communications ?? []).slice(0, 5).map((item) => (
                <article key={item.id}><small>{item.context} · {formatWhen(item.created_at, locale)}</small><h3>{item.title}</h3><p>{item.body}</p></article>
              ))}
              {!loading && (dashboard?.communications.length ?? 0) === 0 ? <p className="student-center__muted">{t('studentCenter.updates.empty')}</p> : null}
            </div>
          </section>

          <section id="access" aria-labelledby="access-title">
            <div className="student-center__context-title"><CreditCard size={18} /><h2 id="access-title">{t('studentCenter.access.title')}</h2></div>
            <div className="student-center__access-list">
              {(dashboard?.access ?? []).slice(0, 8).map((item) => (
                <Destination href={item.href} key={item.id}>
                  <div><h3>{item.title}</h3><p>{item.expires_at ? t('studentCenter.access.expires', { date: formatWhen(item.expires_at, locale) }) : item.status}</p></div><ArrowRight size={16} aria-hidden />
                </Destination>
              ))}
              {!loading && (dashboard?.access.length ?? 0) === 0 ? <p className="student-center__muted">{t('studentCenter.access.empty')}</p> : null}
            </div>
          </section>

          <footer><Clock3 size={14} /> {dashboard?.generated_at ? t('studentCenter.updated', { time: formatWhen(dashboard.generated_at, locale) }) : t('studentCenter.loading')}</footer>
        </aside>
      </div>
    </main>
  );
};
