import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { LanguageSwitcher } from './components/LanguageSwitcher';
import { I18nProvider } from './i18n';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing root element');

createRoot(root).render(
  <I18nProvider>
    <BrowserRouter>
      <LanguageSwitcher />
      <App />
    </BrowserRouter>
  </I18nProvider>,
);
