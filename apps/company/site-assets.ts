// Build-time assets share the same public-page catalogue as the application.
import { PUBLIC_PATHS, SITE_URL } from './src/areas/site/catalog.ts';

export const COMPANY_ICON = '/icons/company.svg';
const languages = ['en', 'ru', 'uz'];
const xml = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

export function companySiteAssets() {
  const urls = PUBLIC_PATHS.flatMap((path) => languages.map((language) => {
    const alternates = languages.map((lang) => `<xhtml:link rel="alternate" hreflang="${lang}" href="${xml(`${SITE_URL}${path}?lang=${lang}`)}"/>`).join('');
    return `<url><loc>${xml(`${SITE_URL}${path}?lang=${language}`)}</loc>${alternates}<xhtml:link rel="alternate" hreflang="x-default" href="${xml(`${SITE_URL}${path}`)}"/></url>`;
  }));
  return {
    'sitemap.xml': `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${urls.join('\n')}</urlset>\n`,
    'robots.txt': `User-agent: *\nAllow: /\nDisallow: /w/\nDisallow: /staff\nDisallow: /join/\nDisallow: /t/\nDisallow: /r/\nDisallow: /feedback/\nSitemap: ${SITE_URL}/sitemap.xml\n`,
    'manifest.webmanifest': JSON.stringify({
      id: '/', name: 'Schood Company English', short_name: 'Company English',
      start_url: '/', scope: '/', display: 'standalone',
      background_color: '#ffffff', theme_color: '#0f172a',
      icons: [{ src: COMPANY_ICON, sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
    }, null, 2),
  };
}
