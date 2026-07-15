import React from 'react';

interface Props {
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  message?: string;
}

export class LocalErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: String(error),
    };
  }

  componentDidCatch(error: unknown) {
    console.error('LocalErrorBoundary caught error', error);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="pw-overlay-scrim absolute inset-0 z-40 flex items-center justify-center">
          <div className="pw-dialog-surface max-w-md px-4 py-3 text-sm text-[var(--text-secondary)]">
            阅读面板发生错误，已隔离，不影响主界面。
            {this.state.message ? <div className="mt-1 text-xs text-[var(--text-tertiary)]">{this.state.message}</div> : null}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
