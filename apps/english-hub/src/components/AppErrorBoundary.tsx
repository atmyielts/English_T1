import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportEnglishRecovery } from '../lib/clientRecovery';
import { buildPlatformHref } from '../lib/navigation';
import { platformUrl } from '../lib/supabase';

type AppErrorBoundaryProps = { children: ReactNode };
type AppErrorBoundaryState = { error: Error | null };

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Schood English UI boundary caught an error', {
      name: error.name,
      message: error.message,
      componentStack: info.componentStack,
    });
    void reportEnglishRecovery(error);
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;

    const returnTo = typeof window === 'undefined' ? '/' : window.location.href;
    return (
      <main className="app-crash-container" role="alert" aria-live="assertive">
        <section className="frame app-crash-card">
          <p className="kicker">Recovery mode</p>
          <h1>This English page could not finish loading.</h1>
          <p>
            Your account and previously saved learning data are safe. Reload the latest app version, or return to your learning centre.
          </p>
          <div className="hero-actions">
            <button className="btn btn-solid" type="button" onClick={() => window.location.reload()}>
              Reload English
            </button>
            <a
              className="btn btn-ghost"
              href={buildPlatformHref(platformUrl, '/student-center', { returnTo })}
            >
              Learning centre
            </a>
          </div>
        </section>
      </main>
    );
  }
}
