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
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-900/20">
          <div className="rounded border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
            阅读面板发生错误，已隔离，不影响主界面。
            {this.state.message ? <div className="mt-1 text-xs text-slate-500">{this.state.message}</div> : null}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
