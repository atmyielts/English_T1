import React from 'react';
import { ChevronDown, Languages } from 'lucide-react';
import { SUPPORTED_LOCALES, useI18n, type LocaleCode, type TranslationKey } from '../../i18n';

type LanguageSwitcherProps = {
  compact?: boolean;
  className?: string;
};

const localeLabelKeys: Record<LocaleCode, TranslationKey> = {
  en: 'language.en',
  uz: 'language.uz',
  ru: 'language.ru',
};

export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({ compact = true, className = '' }) => {
  const { locale, setLocale, t } = useI18n();
  const showLabel = !compact;

  return (
    <label className={`inline-flex items-center gap-2 text-xs font-semibold text-gray-700 ${className}`.trim()}>
      {showLabel ? <span className="uppercase tracking-wide text-gray-600">{t('language.label')}</span> : null}
      <span className="relative inline-flex items-center">
        <select
          value={locale}
          onChange={(event) => {
            const next = event.target.value as LocaleCode;
            void setLocale(next);
          }}
          className={`appearance-none rounded-full border border-[#1f2937] bg-white/90 pl-3 pr-14 text-xs font-semibold text-gray-800 h-8 ${compact ? 'w-[112px]' : 'min-w-[150px]'}`}
          aria-label={t('language.label')}
        >
          {SUPPORTED_LOCALES.map((code) => (
            <option key={code} value={code}>
              {t(localeLabelKeys[code])}
            </option>
          ))}
        </select>

        <span className="pointer-events-none absolute right-8 top-1/2 -translate-y-1/2 text-gray-500" aria-hidden>
          <Languages size={12} />
        </span>
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-500" aria-hidden>
          <ChevronDown size={12} />
        </span>
      </span>
    </label>
  );
};
