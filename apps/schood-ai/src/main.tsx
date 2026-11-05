// Must be first: Supabase captures fetch when a client is created, so the region
// wrapper has to be installed before any module creates one.
import '../../../packages/edge-region/src/install';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { I18nProvider, initialLocale } from '../../../packages/service-i18n/src/i18n.tsx';
import { App } from './App.tsx';
import { SessionProvider } from './core/auth.tsx';
import { catalogs, loadLocale } from './core/i18n/index.ts';
import { WorkspaceProvider } from './core/workspace.tsx';
import './index.css';

// The person's language loads before the first paint (core's included), so nothing flashes untranslated.
const render = () => createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nProvider catalogs={catalogs}>
      <SessionProvider>
        <WorkspaceProvider>
          <App/>
        </WorkspaceProvider>
      </SessionProvider>
    </I18nProvider>
  </React.StrictMode>,
);
void loadLocale(initialLocale()).finally(render);
