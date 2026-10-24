import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useT } from '../i18n';
import { SEARCH_MIN_LENGTH, searchContent, type SearchResult } from '../lib/glue';
import type { SkillKey } from '../lib/skills';
import { allEntries, searchEntries, type NavEntry } from './navModel';
import { useEnglish } from './EnglishContext';

const SEARCH_DELAY_MS = 250;
/** With content results showing, pages and skills take at most this many rows. */
const PAGES_WITH_CONTENT = 4;

type Option = {
  key: string;
  label: string;
  /** Right-hand note: the group, the skill and level, or whether it is in the plan. */
  meta: string;
  to: string;
  skill?: SkillKey;
  locked?: boolean;
};

/**
 * Ctrl+K / Cmd+K: jump to any page, skill or skill page from anywhere in the
 * workspace, and search inside the content: lessons in every skill (by title,
 * topic or level, e.g. "past simple b1"), words in your notebook, your recent
 * mistakes and grammar rules (GET /hub/search).
 */
export const QuickSwitcher = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const t = useT();
  const navigate = useNavigate();
  const { access } = useEnglish();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const [content, setContent] = useState<{ query: string; results: SearchResult[] } | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const listId = useId();
  const statusId = useId();

  const entries = useMemo(() => allEntries(), []);
  const trimmed = query.trim();
  const wantsContent = trimmed.length >= SEARCH_MIN_LENGTH;

  // Content search, debounced; a newer query cancels the one in flight.
  useEffect(() => {
    if (!open || !wantsContent) {
      setContent(null);
      setSearching(false);
      setSearchFailed(false);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    const timer = window.setTimeout(() => {
      searchContent(trimmed, controller.signal)
        .then((response) => { setContent({ query: trimmed, results: response.results }); setSearchFailed(false); })
        .catch(() => { if (!controller.signal.aborted) setSearchFailed(true); })
        .finally(() => { if (!controller.signal.aborted) setSearching(false); });
    }, SEARCH_DELAY_MS);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [open, trimmed, wantsContent]);

  const navStatus = (entry: NavEntry): string => {
    if (entry.skill && entry.group === 'skills' && access.status === 'ready' && !access.unlocked.has(entry.skill)) return t('ws.locked');
    return t(`ws.group.${entry.group}`);
  };

  const contentMeta = (result: SearchResult): string => {
    if (result.access === 'locked') return t('ws.locked');
    if (result.access === 'free') return t('glue.search.free');
    const kind = t(`glue.search.kind.${result.kind}`);
    if (result.kind === 'lesson' && result.skill) return [t(`skill.${result.skill}`), result.level].filter(Boolean).join(' · ');
    return result.level ? `${kind} · ${result.level}` : kind;
  };

  const options = useMemo<Option[]>(() => {
    const found = content && content.query === trimmed ? content.results : [];
    const pages = searchEntries(query, entries, (entry) => t(entry.labelKey, entry.labelParams), found.length ? PAGES_WITH_CONTENT : 9)
      .map((entry) => ({ key: `nav:${entry.to}`, label: t(entry.labelKey, entry.labelParams), meta: navStatus(entry), to: entry.to, skill: entry.skill }));
    const results = found.map((result) => ({
      key: `${result.kind}:${result.id}`,
      label: result.detail && result.kind === 'word' ? `${result.title} — ${result.detail}` : result.title,
      meta: contentMeta(result),
      to: result.href,
      skill: result.skill ?? undefined,
      locked: result.access === 'locked',
    }));
    return [...pages, ...results];
    // navStatus/contentMeta only read t and access, which are listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, trimmed, entries, content, t, access]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setQuery('');
      setCursor(0);
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => setCursor(0), [query]);
  useEffect(() => setCursor((value) => Math.min(value, Math.max(0, options.length - 1))), [options.length]);

  const go = (option: Option | undefined) => {
    if (!option) return;
    onClose();
    navigate(option.to);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setCursor((value) => Math.min(options.length - 1, value + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setCursor((value) => Math.max(0, value - 1));
    } else if (event.key === 'Home') {
      event.preventDefault();
      setCursor(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setCursor(Math.max(0, options.length - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      go(options[cursor]);
    }
  };

  // Keep the highlighted row visible while moving with the keyboard.
  useEffect(() => {
    document.getElementById(`${listId}-${cursor}`)?.scrollIntoView({ block: 'nearest' });
  }, [cursor, listId]);

  const status = searching
    ? t('glue.search.searching')
    : searchFailed
      ? t('glue.search.failed')
      : wantsContent && content && content.query === trimmed && !content.results.length
        ? t('glue.search.noContent')
        : '';

  return (
    <dialog
      ref={dialogRef}
      className="en-switcher"
      aria-label={t('ws.searchLabel')}
      onClose={onClose}
      onClick={(event) => { if (event.target === dialogRef.current) onClose(); }}
    >
      <div className="en-switcher-box">
        <input
          type="search"
          autoFocus
          value={query}
          placeholder={t('glue.search.hint')}
          aria-label={t('ws.searchLabel')}
          role="combobox"
          aria-expanded="true"
          aria-autocomplete="list"
          aria-controls={listId}
          aria-describedby={statusId}
          aria-activedescendant={options[cursor] ? `${listId}-${cursor}` : undefined}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
        />
        {options.length ? (
          <ul id={listId} role="listbox" className="en-switcher-list">
            {options.map((option, index) => (
              <li
                key={option.key}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === cursor}
                className={`${option.skill ? `has-skill is-${option.skill}` : ''} ${option.locked ? 'is-locked' : ''}`.trim() || undefined}
                onMouseEnter={() => setCursor(index)}
                onClick={() => go(option)}
              >
                <span>{option.label}</span>
                <small>{option.meta}</small>
              </li>
            ))}
          </ul>
        ) : searching ? null : (
          <p className="hint en-switcher-empty">{t('ws.noResults')}</p>
        )}
        <p className="hint en-switcher-status" id={statusId} aria-live="polite">{status}</p>
        <p className="hint en-switcher-keys">{t('ws.keys')}</p>
      </div>
    </dialog>
  );
};
