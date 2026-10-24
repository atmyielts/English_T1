// Tap-to-translate. Wrap any English learning text in <TapScope> and render its
// strings with <TapWords> (or use <TapText> for a single string). Tapping or
// clicking a word, or choosing it with the arrow keys and pressing Enter,
// opens a small card with its meaning, translation, an example and a
// "Save to My words" button.
//
// Words are plain spans (no button per word), so screen readers still read the
// text as text. Clicks are handled once on the scope, not per word.
import {
  createElement,
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../i18n';
import { ApiError } from '../lib/api';
import { sentenceAround, tapTokens } from '../lib/tapWords';
import { lookupWord, saveGloss, type TapSource, type WordGloss } from '../lib/wordLookup';
import './wordLookup.css';

const WORD_SELECTOR = '.tt-w';
const BLOCK_SELECTOR = 'ins, p, li, h1, h2, h3, h4, blockquote, dd, td, [data-tt-block]';
const HINT_ID = 'tt-keyboard-hint';
/** Theme tokens copied from the tapped word, so the card matches the skill's colours. */
const TOKENS = ['--ink', '--ink-700', '--muted', '--line', '--soft-line', '--card', '--accent', '--primary-bg', '--highlight-bg', '--highlight-line', '--focus'];
const POS_KEYS = new Set(['noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition', 'conjunction', 'determiner', 'interjection', 'modal', 'phrase']);

/** A string with each word ready to tap. Use inside a TapScope. */
export const TapWords = memo(({ text }: { text: string }) => (
  <>
    {tapTokens(text).map((token, index) => (token.word
      ? <span key={index} className="tt-w" data-tt={token.word} tabIndex={-1}>{token.text}</span>
      : token.text))}
  </>
));
TapWords.displayName = 'TapWords';

type OpenWord = { anchor: HTMLElement; word: string; tapped: string; context: string };

type ScopeProps = {
  as?: 'div' | 'p' | 'ul' | 'ol' | 'blockquote' | 'section';
  className?: string;
  style?: CSSProperties;
  /** The scope's language; null when it mixes interface text with English (wrap the English in lang="en"). */
  lang?: string | null;
  /** Where saved words come from, shown in My words. */
  source: TapSource;
  /** Called after a word was saved to My words. */
  onSaved?: (word: string, context: string) => void;
  children: ReactNode;
};

/** One shared, hidden description for keyboard users. */
const useKeyboardHint = (text: string) => {
  useEffect(() => {
    let node = document.getElementById(HINT_ID);
    if (!node) {
      node = document.createElement('span');
      node.id = HINT_ID;
      node.hidden = true;
      document.body.appendChild(node);
    }
    node.textContent = text;
  }, [text]);
};

export const TapScope = ({ as = 'div', className, style, lang = 'en', source, onSaved, children }: ScopeProps) => {
  const { t } = useI18n();
  const rootRef = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState<OpenWord | null>(null);
  useKeyboardHint(t('translate.keyboardHint'));

  const openWord = (anchor: HTMLElement) => {
    const word = anchor.dataset.tt;
    const root = rootRef.current;
    if (!word || !root) return;
    const closest = anchor.closest(BLOCK_SELECTOR);
    const block = closest && root.contains(closest) ? closest : root;
    const range = document.createRange();
    range.selectNodeContents(block);
    range.setEnd(anchor, 0);
    const context = sentenceAround(block.textContent ?? '', range.toString().length);
    setOpen((current) => (current?.anchor === anchor ? null : { anchor, word, tapped: anchor.textContent ?? word, context }));
  };

  const close = (returnFocus: boolean) => {
    const anchor = open?.anchor;
    setOpen(null);
    if (!returnFocus) return;
    if (anchor?.isConnected) anchor.focus();
    else rootRef.current?.focus();
  };

  // Mark the open word so it stays highlighted while its card is shown.
  useEffect(() => {
    const anchor = open?.anchor;
    anchor?.setAttribute('data-tt-open', '');
    return () => anchor?.removeAttribute('data-tt-open');
  }, [open]);

  // Events from the card bubble here through the portal; only handle the text itself.
  const fromText = (target: EventTarget) => target instanceof Node && Boolean(rootRef.current?.contains(target));

  const onClick = (event: ReactMouseEvent<HTMLElement>) => {
    if (!fromText(event.target)) return;
    const target = (event.target as HTMLElement).closest?.(WORD_SELECTOR);
    if (!(target instanceof HTMLElement) || !rootRef.current?.contains(target)) return;
    // The learner is selecting text, not tapping a word.
    if (window.getSelection()?.toString().trim()) return;
    openWord(target);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    const root = rootRef.current;
    if (!root || !fromText(event.target)) return;
    const words = Array.from(root.querySelectorAll<HTMLElement>(WORD_SELECTOR));
    if (!words.length) return;
    const active = document.activeElement;
    const index = active instanceof HTMLElement ? words.indexOf(active) : -1;
    if (event.key === 'Enter' || event.key === ' ') {
      if (event.target !== root && index < 0) return;
      event.preventDefault();
      if (index >= 0) openWord(words[index]!);
      else words[0]!.focus();
      return;
    }
    let next = -1;
    if (event.key === 'ArrowRight') next = index < 0 ? 0 : Math.min(words.length - 1, index + 1);
    else if (event.key === 'ArrowLeft') next = index < 0 ? 0 : Math.max(0, index - 1);
    else if (event.key === 'Home' && index >= 0) next = 0;
    else if (event.key === 'End' && index >= 0) next = words.length - 1;
    if (next < 0) return;
    event.preventDefault();
    words[next]!.focus();
  };

  return (
    <>
      {createElement(as, {
        ref: rootRef,
        className: `tt-scope${className ? ` ${className}` : ''}`,
        style,
        lang: lang ?? undefined,
        tabIndex: 0,
        'aria-describedby': HINT_ID,
        onClick,
        onKeyDown,
      }, children)}
      {open ? createPortal(
        <WordCard
          key={`${open.word}|${open.context}`}
          open={open}
          scope={rootRef}
          source={source}
          onClose={close}
          onSaved={onSaved}
        />,
        document.body,
      ) : null}
    </>
  );
};

/** A plain string as tappable text. */
export const TapText = ({ text, ...props }: Omit<ScopeProps, 'children'> & { text: string }) => (
  <TapScope {...props}><TapWords text={text} /></TapScope>
);

type CardState =
  | { status: 'loading' }
  | { status: 'ready'; gloss: WordGloss }
  | { status: 'error'; error: unknown };

const errorKey = (error: unknown): { key: string; retry: boolean } => {
  if (!(error instanceof ApiError)) return { key: 'translate.error', retry: true };
  if (error.status === 0) return { key: 'translate.offline', retry: true };
  if (error.status === 401) return { key: 'translate.signedOut', retry: false };
  if (error.status === 404 || error.status === 400) return { key: 'translate.notFound', retry: false };
  if (error.status === 429) return { key: 'translate.limit', retry: false };
  if (error.status === 503) return { key: 'translate.unavailable', retry: true };
  return { key: 'translate.error', retry: true };
};

const WordCard = ({ open, scope, source, onClose, onSaved }: {
  open: OpenWord;
  scope: { current: HTMLElement | null };
  source: TapSource;
  onClose: (returnFocus: boolean) => void;
  onSaved?: (word: string, context: string) => void;
}) => {
  const { t, locale } = useI18n();
  const ref = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<CardState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [savedNow, setSavedNow] = useState(false);
  const [place, setPlace] = useState<{ top: number; left: number; width: number; above: boolean } | null>(null);
  const [tokens] = useState<CSSProperties>(() => {
    const computed = getComputedStyle(open.anchor);
    const values: Record<string, string> = {};
    for (const name of TOKENS) {
      const value = computed.getPropertyValue(name).trim();
      if (value) values[name] = value;
    }
    return values as CSSProperties;
  });

  useEffect(() => {
    let live = true;
    setState({ status: 'loading' });
    lookupWord(open.word, open.context).then(
      (gloss) => { if (live) setState({ status: 'ready', gloss }); },
      (error: unknown) => { if (live) setState({ status: 'error', error }); },
    );
    return () => { live = false; };
  }, [open.word, open.context, attempt]);

  // Keep the card next to the word and inside the screen (down to 320px wide).
  useLayoutEffect(() => {
    const measure = () => {
      const card = ref.current;
      if (!card || !open.anchor.isConnected) return;
      const rect = open.anchor.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = window.innerHeight;
      const width = Math.min(320, viewportWidth - 16);
      const height = card.offsetHeight;
      const left = Math.min(Math.max(8, rect.left + rect.width / 2 - width / 2), viewportWidth - width - 8);
      const roomBelow = viewportHeight - rect.bottom - 8;
      const above = roomBelow < height + 8 && rect.top - 8 > roomBelow;
      const top = above ? rect.top - 8 - height : rect.bottom + 8;
      setPlace((current) => {
        const next = { top: Math.round(top + window.scrollY), left: Math.round(left + window.scrollX), width, above };
        return current && current.top === next.top && current.left === next.left && current.width === next.width ? current : next;
      });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [open.anchor, state, saving, saveFailed]);

  // Focus the card once it is placed (a hidden card cannot take focus), so
  // keyboard and screen reader users land in it.
  const placed = place !== null;
  useEffect(() => {
    if (placed) ref.current?.focus({ preventScroll: true });
  }, [placed]);

  // Close on Escape and on a tap outside (a tap on another word opens that word instead).
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (ref.current?.contains(target) || open.anchor.contains(target)) return;
      if (target instanceof Element && target.closest(WORD_SELECTOR) && scope.current?.contains(target)) return;
      onClose(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose(true);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open.anchor, scope, onClose]);

  // Tabbing out of the card closes it and returns to the word.
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab' || !ref.current) return;
    const focusable = Array.from(ref.current.querySelectorAll<HTMLElement>('button:not([disabled])'));
    const active = document.activeElement;
    const leaving = event.shiftKey
      ? active === ref.current || active === focusable[0]
      : active === focusable[focusable.length - 1] || focusable.length === 0;
    if (!leaving) return;
    event.preventDefault();
    onClose(true);
  };

  const save = async (gloss: WordGloss) => {
    setSaving(true);
    setSaveFailed(false);
    try {
      const next = await saveGloss(gloss, open.context, source);
      setState({ status: 'ready', gloss: next });
      setSavedNow(true);
      // The button is now disabled; keep focus in the card.
      ref.current?.focus({ preventScroll: true });
      onSaved?.(next.headword, open.context);
    } catch {
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  };

  const gloss = state.status === 'ready' ? state.gloss : null;
  const headword = gloss?.headword ?? open.word;
  const posKey = gloss?.part_of_speech && POS_KEYS.has(gloss.part_of_speech) ? `translate.pos.${gloss.part_of_speech}` : null;
  const wanted: Array<'ru' | 'uz'> = locale === 'ru' ? ['ru'] : locale === 'uz' ? ['uz'] : ['ru', 'uz'];
  const translations = gloss ? wanted.filter((lang) => gloss[lang]) : [];
  const failure = state.status === 'error' ? errorKey(state.error) : null;
  const tappedDiffers = Boolean(gloss) && open.word !== headword;

  return (
    <div
      ref={ref}
      className={`tt-card${place?.above ? ' is-above' : ''}`}
      role="dialog"
      aria-label={t('translate.dialogLabel', { word: headword })}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      style={{
        ...tokens,
        top: place?.top ?? 0,
        left: place?.left ?? 0,
        width: place?.width ?? 'min(320px, calc(100vw - 16px))',
        visibility: place ? 'visible' : 'hidden',
      }}
    >
      <div className="tt-card-head">
        <p className="tt-card-title">
          <strong className="tt-card-word" lang="en">{headword}</strong>
          {posKey ? <span className="tt-card-pos">{t(posKey)}</span> : null}
        </p>
        <button type="button" className="quiet tt-card-close" aria-label={t('translate.close')} onClick={() => onClose(true)}>
          <span aria-hidden="true">×</span>
        </button>
      </div>

      {state.status === 'loading' ? (
        <div className="tt-card-loading" role="status">
          <span className="visually-hidden">{t('translate.loading')}</span>
          <span className="tt-skeleton" aria-hidden="true" />
          <span className="tt-skeleton is-short" aria-hidden="true" />
        </div>
      ) : null}

      {failure ? (
        <>
          <p className="tt-card-note" role="alert">{t(failure.key)}</p>
          {failure.retry ? (
            <div className="tt-card-actions">
              <button type="button" className="quiet" onClick={() => setAttempt((count) => count + 1)}>{t('translate.retry')}</button>
            </div>
          ) : null}
        </>
      ) : null}

      {gloss ? (
        <>
          {tappedDiffers ? <p className="tt-card-form">{t('translate.fromForm', { word: open.tapped })}</p> : null}
          <p className="tt-card-def" lang="en">{gloss.definition}</p>
          {translations.length ? (
            <dl className="tt-card-tr">
              {translations.map((lang) => (
                <div key={lang}>
                  <dt>{t(lang === 'ru' ? 'translate.inRussian' : 'translate.inUzbek')}</dt>
                  <dd lang={lang}>{gloss[lang]}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="tt-card-note">{t(gloss.notice === 'limit' ? 'translate.limitNote' : 'translate.noTranslation')}</p>
          )}
          {gloss.example ? (
            <p className="tt-card-example" lang="en">
              <span className="visually-hidden">{t('translate.example')}: </span>
              {gloss.example}
            </p>
          ) : null}
          {saveFailed ? <p className="tt-card-note is-error" role="alert">{t('translate.saveFailed')}</p> : null}
          <div className="tt-card-actions">
            <button type="button" disabled={saving || gloss.saved} onClick={() => void save(gloss)}>
              {gloss.saved ? `✓ ${t('translate.saved')}` : saving ? t('translate.saving') : t('translate.save')}
            </button>
            <span className="visually-hidden" role="status">{savedNow ? t('translate.saved') : ''}</span>
          </div>
        </>
      ) : null}
    </div>
  );
};
