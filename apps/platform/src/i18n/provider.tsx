import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { en, type TranslationKey } from './locales/en';
import { ru } from './locales/ru';
import { uz } from './locales/uz';
import { SUPPORTED_LOCALES, type LocaleCode, type TranslationParams } from './types';

const STORAGE_KEY = 'schood.locale';

const dictionaries: Record<LocaleCode, Partial<Record<TranslationKey, string>>> = {
  en,
  uz,
  ru,
};

const supportedLocaleSet = new Set<string>(SUPPORTED_LOCALES);
let profileLocaleColumnAvailable = true;
let profileLocaleColumnWarned = false;

const normalizeLocale = (value: string | null | undefined): LocaleCode => {
  if (!value) return 'en';
  const normalized = value.trim().toLowerCase();
  if (supportedLocaleSet.has(normalized)) return normalized as LocaleCode;
  return 'en';
};

const isMissingPreferredLocaleColumnError = (message: string): boolean => {
  const text = message.toLowerCase();
  return text.includes('preferred_locale') && (text.includes('does not exist') || text.includes('schema cache'));
};

const disableProfileLocaleSync = (message: string): void => {
  profileLocaleColumnAvailable = false;
  if (profileLocaleColumnWarned) return;
  profileLocaleColumnWarned = true;
  console.warn(
    '[i18n] preferred_locale column is missing in user_profiles. Falling back to localStorage only. Apply migration 20260227140000_user_profiles_preferred_locale.sql.',
    message,
  );
};

const readStoredLocale = (): LocaleCode => {
  if (typeof window === 'undefined') return 'en';
  try {
    return normalizeLocale(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return 'en';
  }
};

const storeLocale = (locale: LocaleCode): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Keep locale in memory when storage is unavailable.
  }
};

const formatTemplate = (template: string, params?: TranslationParams): string => {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = params[key];
    return value === undefined || value === null ? '' : String(value);
  });
};

const fetchProfileLocale = async (session: Session | null): Promise<LocaleCode | null> => {
  if (!session?.user?.id) return null;
  if (!profileLocaleColumnAvailable) return null;
  const { data, error } = await supabase
    .from('user_profiles')
    .select('preferred_locale')
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (error) {
    if (isMissingPreferredLocaleColumnError(error.message)) {
      disableProfileLocaleSync(error.message);
      return null;
    }
    // Non-blocking by design: keep local locale when profile read fails.
    console.warn('[i18n] Failed to load preferred locale from profile:', error.message);
    return null;
  }

  return normalizeLocale((data as { preferred_locale?: string } | null)?.preferred_locale ?? null);
};

const persistProfileLocale = async (session: Session | null, locale: LocaleCode): Promise<void> => {
  if (!session?.user?.id) return;
  if (!profileLocaleColumnAvailable) return;

  const payload = {
    user_id: session.user.id,
    preferred_locale: locale,
  };

  const { error } = await supabase.from('user_profiles').upsert(payload, { onConflict: 'user_id' });
  if (error) {
    if (isMissingPreferredLocaleColumnError(error.message)) {
      disableProfileLocaleSync(error.message);
      return;
    }
    console.warn('[i18n] Failed to persist preferred locale to profile:', error.message);
  }
};

type I18nContextValue = {
  locale: LocaleCode;
  ready: boolean;
  setLocale: (nextLocale: LocaleCode) => Promise<void>;
  t: (key: TranslationKey, params?: TranslationParams) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocaleState] = useState<LocaleCode>(() => readStoredLocale());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;

      const profileLocale = await fetchProfileLocale(data.session ?? null);
      if (cancelled) return;

      if (profileLocale) {
        setLocaleState(profileLocale);
        storeLocale(profileLocale);
      } else {
        setLocaleState(readStoredLocale());
      }

      setReady(true);
    };

    void bootstrap();

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      const applyAuthLocale = async () => {
        if (!session) {
          if (!cancelled) setLocaleState(readStoredLocale());
          return;
        }

        const profileLocale = await fetchProfileLocale(session);
        if (cancelled) return;

        if (profileLocale) {
          setLocaleState(profileLocale);
          storeLocale(profileLocale);
          return;
        }

        const fallbackLocale = readStoredLocale();
        setLocaleState(fallbackLocale);
        await persistProfileLocale(session, fallbackLocale);
      };

      void applyAuthLocale();
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const setLocale = useCallback(async (nextLocale: LocaleCode) => {
    const normalized = normalizeLocale(nextLocale);
    setLocaleState(normalized);
    storeLocale(normalized);

    const { data } = await supabase.auth.getSession();
    await persistProfileLocale(data.session ?? null, normalized);
  }, []);

  const t = useCallback(
    (key: TranslationKey, params?: TranslationParams): string => {
      const selected = dictionaries[locale][key] ?? en[key] ?? key;
      return formatTemplate(selected, params);
    },
    [locale],
  );

  const value = useMemo<I18nContextValue>(
    () => ({ locale, ready, setLocale, t }),
    [locale, ready, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = (): I18nContextValue => {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return ctx;
};

export { normalizeLocale, readStoredLocale, STORAGE_KEY as I18N_STORAGE_KEY };
