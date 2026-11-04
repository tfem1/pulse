import { Component, type ErrorInfo, type ReactNode } from 'react';
import { translate } from '@/i18n';
import { useAppearance } from '@/stores/appearance';

interface State {
  error: Error | null;
}

/** Keeps a failing page from taking the whole app down. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Pulse view crashed', error, info.componentStack);
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    const lang = useAppearance.getState().language;
    return (
      <div role="alert" className="m-page rounded-lg border-2 border-danger bg-surface p-6">
        <p className="text-base font-semibold">{translate(lang, 'error.viewCrashed')}</p>
        <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap text-xs text-muted">
          {this.state.error.message}
        </pre>
        <button
          type="button"
          className="mt-4 rounded-md border border-border-strong px-3 py-1.5 text-sm hover:bg-surface-hover"
          onClick={() => this.setState({ error: null })}
        >
          {translate(lang, 'common.retry')}
        </button>
      </div>
    );
  }
}
