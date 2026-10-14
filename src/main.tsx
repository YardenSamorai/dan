import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { auth } from './data';
import { I18nProvider, primeDocumentLocale } from './i18n/I18nProvider';
import { startNativeShell } from './lib/native';
import './styles/tokens.css';
import './styles/base.css';
import './styles/ui.css';

primeDocumentLocale();

void auth.ready().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <I18nProvider>
          <App />
        </I18nProvider>
      </BrowserRouter>
    </StrictMode>,
  );
  void startNativeShell();
});
