import { Component, type ReactNode } from 'react';
import { useI18n } from '../../i18n/I18nProvider';

const RELOADED = 'saas.chunk-reload';

/** A lazy chunk that 404s or fails to compile after a deploy or dev-server update. */
const isChunkError = (e: unknown) =>
  e instanceof Error &&
  /dynamically imported module|Importing a module script failed|error loading dynamically imported|ChunkLoadError/i.test(`${e.name} ${e.message}`);

function CrashScreen({ error }: { error: unknown }) {
  const { t } = useI18n();
  return (
    <section className="page-head container" role="alert" style={{ minHeight: '70vh' }}>
      <h1 className="display">{t('crash.title')}</h1>
      <p className="lede">{t('crash.body')}</p>
      <button type="button" className="btn btn--ink" style={{ marginBlockStart: 32 }} onClick={() => window.location.reload()}>
        {t('crash.reload')}
      </button>
      {import.meta.env.DEV && (
        <pre dir="ltr" style={{ marginBlockStart: 32, whiteSpace: 'pre-wrap', fontSize: 12, color: 'var(--ink-3)' }}>
          {error instanceof Error ? `${error.message}\n\n${error.stack ?? ''}` : String(error)}
        </pre>
      )}
    </section>
  );
}

/** Keeps a render error from blanking the whole app. Reset by changing `resetKey`. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: unknown; failed: boolean }> {
  state = { error: null as unknown, failed: false };

  static getDerivedStateFromError(error: unknown) {
    return { error, failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error(error);
    if (isChunkError(error) && !sessionStorage.getItem(RELOADED)) {
      sessionStorage.setItem(RELOADED, '1');
      window.location.reload();
    }
  }

  componentDidMount() {
    window.setTimeout(() => sessionStorage.removeItem(RELOADED), 10_000);
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ error: null, failed: false });
  }

  render() {
    return this.state.failed ? <CrashScreen error={this.state.error} /> : this.props.children;
  }
}
