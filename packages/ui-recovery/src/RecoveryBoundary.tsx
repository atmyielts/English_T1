import { Component, createRef, type ErrorInfo, type ReactNode } from 'react';
import './recovery.css';

const copy = {
  en: { title: 'This page could not load', body: 'Reload the page to try again. If the problem continues, return to the home page.', warning: 'Changes that had not finished saving may need to be entered again.', reload: 'Reload page', home: 'Go to home page', reference: 'Support reference' },
  uz: { title: 'Sahifani yuklab bo‘lmadi', body: 'Qayta urinib ko‘rish uchun sahifani yangilang. Muammo davom etsa, bosh sahifaga qayting.', warning: 'Saqlanishi tugamagan o‘zgarishlarni qayta kiritish kerak bo‘lishi mumkin.', reload: 'Sahifani yangilash', home: 'Bosh sahifaga qaytish', reference: 'Yordam uchun kod' },
  ru: { title: 'Не удалось загрузить страницу', body: 'Обновите страницу, чтобы повторить попытку. Если проблема сохраняется, вернитесь на главную.', warning: 'Изменения, которые не успели сохраниться, возможно, придётся ввести заново.', reload: 'Обновить страницу', home: 'На главную', reference: 'Код для поддержки' },
};
type Locale = keyof typeof copy;
const locale = (): Locale => {
  if (typeof window === 'undefined') return 'en';
  let stored: string | null = null;
  try { stored = window.localStorage.getItem('schood.locale'); } catch { /* Private browsing may deny storage. */ }
  const requested = new URLSearchParams(window.location.search).get('lang');
  for (const value of [requested, stored, document.documentElement.lang]) {
    const key = value?.toLowerCase().split('-')[0];
    if (key === 'en' || key === 'uz' || key === 'ru') return key;
  }
  return 'en';
};

type Props = {
  children?: ReactNode;
  app: string;
  title?: string;
  reloadLabel?: string | Record<Locale, string>;
  homeHref?: string;
  homeLabel?: string | Record<Locale, string>;
  compact?: boolean;
  onError?: (error: Error) => void | Promise<void>;
};
type State = { failed: boolean; reference: string };

// React 19's default caught-error callback logs the raw error independently of
// componentDidCatch. Boundaries own reporting so production logs stay bounded.
export const recoveryRootOptions = { onCaughtError: () => undefined };

export class RecoveryBoundary extends Component<Props, State> {
  state: State = { failed: false, reference: '' };
  private heading = createRef<HTMLHeadingElement>();

  static getDerivedStateFromError(): Partial<State> { return { failed: true }; }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    const reference = `UI-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`;
    this.setState({ reference });
    this.heading.current?.focus();
    // Never copy error text, component stacks, URLs, tokens or user input into
    // the customer screen or production diagnostic record.
    console.info('Schood UI recovery', { reference, app: this.props.app,
      release: String(import.meta.env.VITE_RELEASE_SHA ?? 'unknown').slice(0, 64) });
    if (import.meta.env.DEV) console.error('Development UI diagnostic', error, info);
    try {
      const reporting = this.props.onError?.(error instanceof Error ? error : new Error('UI render failed'));
      void Promise.resolve(reporting).catch(() => undefined);
    } catch { /* A failed reporter must never break the recovery screen. */ }
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const lang = locale();
    const labels = copy[lang];
    const reloadLabel = typeof this.props.reloadLabel === 'string' ? this.props.reloadLabel : this.props.reloadLabel?.[lang];
    const homeLabel = typeof this.props.homeLabel === 'string' ? this.props.homeLabel : this.props.homeLabel?.[lang];
    return (
      <div className={`schood-recovery${this.props.compact ? ' schood-recovery--compact' : ''}`} lang={lang}>
        <section className="schood-recovery__card" aria-label={this.props.title ?? labels.title}>
          <p className="schood-recovery__brand">Schood</p>
          <h1 ref={this.heading} tabIndex={-1}>{this.props.title ?? labels.title}</h1>
          <p>{labels.body}</p>
          <p className="schood-recovery__warning">{labels.warning}</p>
          <div className="schood-recovery__actions">
            <button type="button" onClick={() => window.location.reload()}>{reloadLabel ?? labels.reload}</button>
            <a href={this.props.homeHref ?? '/'}>{homeLabel ?? labels.home}</a>
          </div>
          {this.state.reference ? <p className="schood-recovery__reference">{labels.reference}: <span>{this.state.reference}</span></p> : null}
        </section>
      </div>
    );
  }
}
