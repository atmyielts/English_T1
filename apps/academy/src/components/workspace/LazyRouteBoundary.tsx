import { Component, Suspense, type ErrorInfo, type ReactNode } from 'react';

type LazyRouteBoundaryProps = {
  children: ReactNode;
  fallback: ReactNode;
};

type LazyRouteErrorBoundaryState = {
  error: Error | null;
};

class LazyRouteErrorBoundary extends Component<LazyRouteBoundaryProps, LazyRouteErrorBoundaryState> {
  state: LazyRouteErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): LazyRouteErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Failed to load Academy workspace section', error, errorInfo);
  }

  private retry = () => {
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      return (
        <section className="panel lazy-route-error" role="alert">
          <h2>This workspace section could not load</h2>
          <p>The section download failed. Reload the workspace to try again.</p>
          <button className="primary-btn" type="button" onClick={this.retry}>Reload workspace</button>
        </section>
      );
    }

    return this.props.children;
  }
}

export const LazyRouteBoundary = ({ children, fallback }: LazyRouteBoundaryProps) => (
  <LazyRouteErrorBoundary fallback={fallback}>
    <Suspense fallback={fallback}>{children}</Suspense>
  </LazyRouteErrorBoundary>
);
