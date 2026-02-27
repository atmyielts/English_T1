import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
    children?: ReactNode;
}

interface State {
    hasError: boolean;
    error?: Error;
    errorInfo?: ErrorInfo;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        // Keep console noise in dev only; in prod we want a clean UI and rely on server logs/monitoring.
        if (import.meta.env.DEV) console.error('Uncaught error:', error, errorInfo);
        this.setState({ errorInfo });
    }

    public render() {
        if (this.state.hasError) {
            const showDetails =
                import.meta.env.DEV ||
                String((import.meta as any).env?.VITE_SHOW_ERROR_DETAILS ?? '').toLowerCase() === 'true';

            return (
                <div className="p-8 bg-red-50 min-h-screen text-red-900 font-sans">
                    <h1 className="text-2xl font-bold mb-4">Something went wrong</h1>
                    <p className="text-sm text-red-800">
                        The page crashed unexpectedly. Please refresh and try again.
                    </p>

                    <div className="mt-5 flex flex-wrap gap-2">
                        <button
                            type="button"
                            className="px-4 py-2 rounded-lg bg-red-700 hover:bg-red-800 text-white font-semibold"
                            onClick={() => window.location.reload()}
                        >
                            Reload
                        </button>
                        <a
                            href="/"
                            className="px-4 py-2 rounded-lg border border-red-200 hover:bg-red-100 font-semibold"
                        >
                            Go to landing
                        </a>
                    </div>

                    {showDetails ? (
                        <div className="mt-6">
                            <p className="font-bold mb-2">{this.state.error?.toString()}</p>
                            <pre className="bg-red-100 p-4 rounded overflow-auto text-sm whitespace-pre-wrap">
                                {this.state.errorInfo?.componentStack}
                            </pre>
                        </div>
                    ) : null}
                </div>
            );
        }

        return this.props.children;
    }
}
