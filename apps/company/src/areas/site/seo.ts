// Per-page search and sharing tags. The site is client-rendered, so these appear once
// the page has run: engines that execute JavaScript read them, simple link previews see
// the defaults from index.html. Each language is its own URL through ?lang=.
import { useEffect } from 'react';
import { useI18n } from '../../../../../packages/service-i18n/src/i18n.tsx';
import { SITE_URL } from './catalog.ts';

const LANGUAGES = ['en', 'ru', 'uz'] as const;
const OG_LOCALE = { en: 'en_US', ru: 'ru_RU', uz: 'uz_UZ' } as const;
const MANAGED = 'data-site-seo';

export interface Seo {
  title: string;
  description: string;
  path: string;
  jsonLd?: Record<string, unknown>[];
  noindex?: boolean;
}

function meta(attribute: 'name' | 'property', key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, key);
    document.head.append(element);
  }
  element.content = content;
}

function link(rel: string, href: string, hreflang?: string) {
  const element = document.createElement('link');
  element.rel = rel;
  element.href = href;
  if (hreflang) element.hreflang = hreflang;
  element.setAttribute(MANAGED, '');
  document.head.append(element);
}

export const pageUrl = (path: string, language?: string) => `${SITE_URL}${path === '/' ? '/' : path}${language ? `?lang=${language}` : ''}`;

export function useSeo({ title, description, path, jsonLd, noindex }: Seo) {
  const { locale } = useI18n();
  const data = jsonLd ? JSON.stringify(jsonLd) : '';
  useEffect(() => {
    const before = { title: document.title, description: document.head.querySelector<HTMLMetaElement>('meta[name="description"]')?.content ?? '' };
    document.title = title;
    meta('name', 'description', description);
    meta('name', 'robots', noindex ? 'noindex' : 'index,follow');
    meta('property', 'og:title', title);
    meta('property', 'og:description', description);
    meta('property', 'og:url', pageUrl(path, locale));
    meta('property', 'og:locale', OG_LOCALE[locale]);
    document.head.querySelectorAll(`[${MANAGED}]`).forEach((element) => element.remove());
    link('canonical', pageUrl(path, locale));
    for (const language of LANGUAGES) link('alternate', pageUrl(path, language), language);
    link('alternate', pageUrl(path), 'x-default');
    if (data) {
      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.textContent = data.replaceAll('<', '\\u003c');
      script.setAttribute(MANAGED, '');
      document.head.append(script);
    }
    return () => {
      document.title = before.title;
      meta('name', 'description', before.description);
      meta('name', 'robots', 'index,follow');
      document.head.querySelectorAll(`[${MANAGED}]`).forEach((element) => element.remove());
    };
  }, [title, description, path, locale, data, noindex]);
}

/** Only real, checkable facts: the name and the addresses. No address, phone or ratings. */
export const organizationLd = (): Record<string, unknown> => ({
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Schood',
  url: 'https://schood.online',
  logo: `${SITE_URL}/icons/company.svg`,
  department: { '@type': 'Organization', name: 'Schood Company English', url: `${SITE_URL}/` },
});

export const faqLd = (items: { q: string; a: string }[]): Record<string, unknown> => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: items.map((item) => ({ '@type': 'Question', name: item.q, acceptedAnswer: { '@type': 'Answer', text: item.a } })),
});

export const breadcrumbLd = (crumbs: { name: string; path: string }[]): Record<string, unknown> => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: crumbs.map((crumb, index) => ({ '@type': 'ListItem', position: index + 1, name: crumb.name, item: pageUrl(crumb.path) })),
});
