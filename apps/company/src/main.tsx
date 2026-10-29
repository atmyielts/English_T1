import React from 'react';
import { createRoot } from 'react-dom/client';
import { I18nProvider } from '../../../packages/service-i18n/src/i18n.tsx';
import { catalogs } from './i18n/index.ts';
import { SessionProvider } from './session.tsx';
import { App } from './shell.tsx';
import '../../../packages/service-design/src/platform.css';
import './style.css';

createRoot(document.getElementById('root')!).render(<I18nProvider catalogs={catalogs}><SessionProvider><App/></SessionProvider></I18nProvider>);
