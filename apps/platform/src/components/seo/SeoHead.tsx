import React, { useEffect } from 'react';

export type SeoSchemaNode = Record<string, unknown>;

type SeoHeadProps = {
  title: string;
  description: string;
  path: string;
  keywords?: string[];
  robots?: string;
  image?: string;
  imageAlt?: string;
  type?: 'website' | 'article';
  lang?: string;
  schema?: SeoSchemaNode[];
};

export const SITE_NAME = 'Schood';
export const SITE_ORIGIN = 'https://schood.online';
export const DEFAULT_SEO_IMAGE = `${SITE_ORIGIN}/schood-logo.png`;

const MANAGED_META = 'data-schood-managed';

const buildAbsoluteUrl = (path: string): string => {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return new URL(normalized, SITE_ORIGIN).toString();
};

const upsertMeta = (kind: 'name' | 'property', key: string, content: string) => {
  let node = document.head.querySelector<HTMLMetaElement>(`meta[${kind}="${key}"]`);
  if (!node) {
    node = document.createElement('meta');
    node.setAttribute(kind, key);
    document.head.appendChild(node);
  }
  node.setAttribute('content', content);
  node.setAttribute(MANAGED_META, 'meta');
};

const upsertLink = (rel: string, href: string) => {
  let node = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!node) {
    node = document.createElement('link');
    node.setAttribute('rel', rel);
    document.head.appendChild(node);
  }
  node.setAttribute('href', href);
  node.setAttribute(MANAGED_META, 'link');
};

const replaceSchemas = (schemas: SeoSchemaNode[]) => {
  document.head
    .querySelectorAll<HTMLScriptElement>(`script[${MANAGED_META}="schema"]`)
    .forEach((node) => node.remove());

  schemas.forEach((schema, index) => {
    const node = document.createElement('script');
    node.type = 'application/ld+json';
    node.text = JSON.stringify(schema);
    node.setAttribute(MANAGED_META, 'schema');
    node.setAttribute('data-schood-schema-index', String(index));
    document.head.appendChild(node);
  });
};

export const createOrganizationSchema = (): SeoSchemaNode => ({
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: SITE_NAME,
  url: SITE_ORIGIN,
  logo: DEFAULT_SEO_IMAGE,
  description:
    'Schood connects IELTS, TOEFL, SAT, and English learning services inside one connected learning platform.',
});

export const createWebSiteSchema = (title: string, description: string, path = '/'): SeoSchemaNode => ({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: title,
  url: buildAbsoluteUrl(path),
  inLanguage: 'en',
  description,
  publisher: {
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_ORIGIN,
  },
});

export const createWebPageSchema = ({
  title,
  description,
  path,
  type = 'WebPage',
}: {
  title: string;
  description: string;
  path: string;
  type?: string;
}): SeoSchemaNode => ({
  '@context': 'https://schema.org',
  '@type': type,
  name: title,
  url: buildAbsoluteUrl(path),
  description,
  inLanguage: 'en',
  isPartOf: {
    '@type': 'WebSite',
    name: SITE_NAME,
    url: SITE_ORIGIN,
  },
});

export const createBreadcrumbSchema = (
  items: Array<{ name: string; path: string }>,
): SeoSchemaNode => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map((item, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    name: item.name,
    item: buildAbsoluteUrl(item.path),
  })),
});

export const createSoftwareApplicationSchema = ({
  name,
  description,
  url,
  applicationCategory,
}: {
  name: string;
  description: string;
  url: string;
  applicationCategory: string;
}): SeoSchemaNode => ({
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name,
  description,
  applicationCategory,
  operatingSystem: 'Web',
  url,
  publisher: {
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_ORIGIN,
  },
});

export const createFaqSchema = (
  items: Array<{ question: string; answer: string }>,
): SeoSchemaNode => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: items.map((item) => ({
    '@type': 'Question',
    name: item.question,
    acceptedAnswer: {
      '@type': 'Answer',
      text: item.answer,
    },
  })),
});

export const SeoHead: React.FC<SeoHeadProps> = ({
  title,
  description,
  path,
  keywords,
  robots = 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1',
  image = DEFAULT_SEO_IMAGE,
  imageAlt = 'Schood logo',
  type = 'website',
  lang = 'en',
  schema = [],
}) => {
  useEffect(() => {
    const canonicalUrl = buildAbsoluteUrl(path);

    document.title = title;
    document.documentElement.lang = lang;

    upsertMeta('name', 'description', description);
    upsertMeta('name', 'robots', robots);
    upsertMeta('name', 'keywords', (keywords ?? []).join(', '));
    upsertMeta('property', 'og:type', type);
    upsertMeta('property', 'og:site_name', SITE_NAME);
    upsertMeta('property', 'og:title', title);
    upsertMeta('property', 'og:description', description);
    upsertMeta('property', 'og:url', canonicalUrl);
    upsertMeta('property', 'og:image', image);
    upsertMeta('property', 'og:image:alt', imageAlt);
    upsertMeta('name', 'twitter:card', 'summary_large_image');
    upsertMeta('name', 'twitter:title', title);
    upsertMeta('name', 'twitter:description', description);
    upsertMeta('name', 'twitter:image', image);

    upsertLink('canonical', canonicalUrl);
    replaceSchemas(schema);
  }, [description, image, imageAlt, keywords, lang, path, robots, schema, title, type]);

  return null;
};

export { buildAbsoluteUrl };
