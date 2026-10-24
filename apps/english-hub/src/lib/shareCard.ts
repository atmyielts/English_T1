// Shareable achievement cards, drawn in the browser (canvas → PNG; nothing is
// rendered on a server). The layout follows the Schood brand kit's Story
// master (brand-materials/05-layout-masters/story-*.svg): navy canvas, the
// outlined "Schood English" signature, one big message, the logo-derived
// ribbon at the edge, a lime rule and the destination underneath.

import { CARD_SIZES, shareLink, SITE, type ShareCardData, type ShareCardFormat, wrapLines } from './shareCardLayout';

export { CARD_SIZES, shareLink, wrapLines };
export type { ShareCardData, ShareCardFormat, ShareCardKind } from './shareCardLayout';

// Brand tokens (brand-materials/02-colour/brand-tokens.json).
const NAVY = '#0F172A';
const PAPER = '#F6F1E8';
const LIME = '#C1FF72';

/** Sora has no Cyrillic, so Russian headlines use Manrope ExtraBold (brand typography rule). */
const headingFont = (text: string, size: number) => (/[Ѐ-ӿ]/.test(text) ? `800 ${size}px Manrope, sans-serif` : `700 ${size}px Sora, Manrope, sans-serif`);

const loadImage = (src: string): Promise<HTMLImageElement | null> =>
  new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });

const ensureFonts = async (sample: string) => {
  if (typeof document === 'undefined' || !document.fonts) return;
  await Promise.race([
    Promise.all([
      document.fonts.load('700 88px Sora', sample),
      document.fonts.load('800 88px Manrope', sample),
      document.fonts.load('400 36px Manrope', sample),
      document.fonts.load('600 28px Manrope', sample),
    ]).catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, 2500)),
  ]);
};

/** Draws the card and returns a PNG. */
export const renderShareCard = async (data: ShareCardData, format: ShareCardFormat): Promise<Blob> => {
  const { width, height } = CARD_SIZES[format];
  const story = format === 'story';
  await ensureFonts(`${data.headline} ${data.detail ?? ''} ${data.label}`);
  const [logo, ribbon] = await Promise.all([loadImage('/brand/english-white.png'), loadImage('/brand/ribbon-colour.png')]);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available');

  ctx.fillStyle = NAVY;
  ctx.fillRect(0, 0, width, height);

  const margin = 64;
  const contentWidth = width - margin * 2;

  // The ribbon crops off the right edge, clear of the text column.
  if (ribbon) {
    const ribbonWidth = story ? 760 : 560;
    const ribbonHeight = ribbonWidth * (ribbon.height / ribbon.width);
    ctx.drawImage(ribbon, width - ribbonWidth + 120, story ? 1100 : 640, ribbonWidth, ribbonHeight);
    // Keep the area under the rule calm.
    ctx.fillStyle = NAVY;
    ctx.fillRect(0, story ? 1610 : 930, width, height);
  }

  const logoTop = story ? 200 : 72;
  if (logo) {
    const logoWidth = story ? 440 : 360;
    ctx.drawImage(logo, margin - 12, logoTop, logoWidth, logoWidth * (logo.height / logo.width));
  }

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = PAPER;
  ctx.globalAlpha = 0.85;
  ctx.font = '600 28px Manrope, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(data.label.toUpperCase().slice(0, 32), width - margin, logoTop + (story ? 72 : 60));
  ctx.textAlign = 'left';
  ctx.globalAlpha = 1;

  // The big value in lime.
  const bigSize = story ? 260 : 190;
  ctx.font = headingFont(data.big, bigSize);
  let big = data.big;
  while (ctx.measureText(big).width > contentWidth && big.length > 1) big = big.slice(0, -1);
  ctx.fillStyle = LIME;
  const bigBaseline = story ? 700 : 420;
  ctx.fillText(big, margin - 6, bigBaseline);

  // Headline and supporting line in ivory.
  const headSize = story ? 88 : 66;
  ctx.font = headingFont(data.headline, headSize);
  ctx.fillStyle = PAPER;
  const headLines = wrapLines((text) => ctx.measureText(text).width, data.headline, contentWidth, story ? 3 : 2);
  let y = bigBaseline + (story ? 150 : 110);
  for (const line of headLines) {
    ctx.fillText(line, margin, y);
    y += Math.round(headSize * 1.14);
  }
  if (data.detail) {
    const detailSize = story ? 38 : 32;
    ctx.font = `400 ${detailSize}px Manrope, sans-serif`;
    ctx.globalAlpha = 0.9;
    y += story ? 20 : 4;
    // Narrower than the headline so the ribbon never runs through body text.
    for (const line of wrapLines((text) => ctx.measureText(text).width, data.detail, contentWidth - (story ? 180 : 260), story ? 3 : 2)) {
      ctx.fillText(line, margin, y);
      y += Math.round(detailSize * 1.4);
    }
    ctx.globalAlpha = 1;
  }

  // Lime rule and destination.
  const ruleY = story ? 1665 : 966;
  ctx.fillStyle = LIME;
  ctx.fillRect(margin, ruleY, contentWidth, 3);
  ctx.fillStyle = PAPER;
  ctx.font = '400 34px Manrope, sans-serif';
  ctx.fillText(SITE, margin, ruleY + (story ? 62 : 56));

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not create the image'))), 'image/png');
  });
};

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled';

/** Web Share with the image when the device supports it, otherwise a download. */
export const shareOrDownload = async (blob: Blob, input: { filename: string; title: string; text: string; url: string }): Promise<ShareOutcome> => {
  const file = typeof File === 'undefined' ? null : new File([blob], input.filename, { type: 'image/png' });
  const nav = typeof navigator === 'undefined' ? null : navigator;
  if (file && nav?.canShare?.({ files: [file] }) && typeof nav.share === 'function') {
    try {
      await nav.share({ files: [file], title: input.title, text: `${input.text} ${input.url}` });
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
      // Not allowed here (e.g. inside some in-app browsers): fall back to a download.
    }
  }
  downloadBlob(blob, input.filename);
  return 'downloaded';
};

export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
};
