import { Languages } from 'lucide-react';
import { SUPPORTED_LOCALES, useI18n, type LocaleCode } from '../i18n';

const localeNames: Record<LocaleCode, string> = {
  en: 'English',
  uz: 'Uzbek',
  ru: 'Russian',
};
export const LanguageSwitcher = () => {
  const { locale, setLocale, t } = useI18n();

  return (
    <label className="academy-language-switcher">
      <Languages aria-hidden="true" size={16} />
      <span className="sr-only">{t('Language')}</span>
      <select
        aria-label={t('Language')}
        value={locale}
        onChange={(event) => setLocale(event.target.value as LocaleCode)}
      >
        {SUPPORTED_LOCALES.map((code) => (
          <option key={code} value={code}>{t(localeNames[code])}</option>
        ))}
      </select>
    </label>
  );
};
