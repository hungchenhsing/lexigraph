/**
 * React 錯誤邊界（Round 15）。
 *
 * 在 render / effect 裡未捕獲的例外會被接住，不再整片白屏。
 * 用法：
 *   <ErrorBoundary fallback="Reader 載入失敗">
 *     <PdfViewer ... />
 *   </ErrorBoundary>
 *
 * 預設 fallback 顯示簡短提示 + 堆疊（dev 模式）。
 */
import { Component, type ReactNode, type ErrorInfo } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode | ((err: Error) => ReactNode);
  label?: string;
  onError?: (err: Error, info: ErrorInfo) => void;
}
interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[ErrorBoundary${this.props.label ? " " + this.props.label : ""}] caught:`, error, info);
    this.props.onError?.(error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      const { fallback } = this.props;
      if (typeof fallback === "function") return fallback(this.state.error);
      if (fallback) return fallback;
      return <DefaultFallback error={this.state.error} label={this.props.label} onRetry={this.reset} />;
    }
    return this.props.children;
  }
}

function DefaultFallback({
  error, label, onRetry,
}: { error: Error; label?: string | undefined; onRetry: () => void }) {
  return (
    <div className="p-4 text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-md m-3">
      <div className="font-semibold mb-1">
        {"⚠"} {label ?? "Something went wrong"}
      </div>
      <div className="text-xs text-red-600 dark:text-red-400 mb-2 break-words font-mono">
        {error.message}
      </div>
      <button
        onClick={onRetry}
        className="text-xs px-2 py-1 rounded border border-red-300 dark:border-red-700 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
      >
        重試
      </button>
    </div>
  );
}
