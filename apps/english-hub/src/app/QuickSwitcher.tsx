import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useT } from '../i18n';
import { allEntries, searchEntries, type NavEntry } from './navModel';
import { useEnglish } from './EnglishContext';

/** Ctrl+K / Cmd+K: jump to any page, skill or skill page from anywhere in the workspace. */
export const QuickSwitcher = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const t = useT();
  const navigate = useNavigate();
  const { access } = useEnglish();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const listId = useId();

  const labelOf = (entry: NavEntry) => t(entry.labelKey, entry.labelParams);
  const entries = useMemo(() => allEntries(), []);
  const results = useMemo(
    () => searchEntries(query, entries, (entry) => t(entry.labelKey, entry.labelParams), 9),
    [query, entries, t],
  );

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

  const go = (entry: NavEntry | undefined) => {
    if (!entry) return;
    onClose();
    navigate(entry.to);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setCursor((value) => Math.min(results.length - 1, value + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setCursor((value) => Math.max(0, value - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      go(results[cursor]);
    }
  };

  const status = (entry: NavEntry): string | null => {
    if (!entry.skill || entry.group !== 'skills' || access.status !== 'ready') return null;
    return access.unlocked.has(entry.skill) ? null : t('ws.locked');
  };

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
          placeholder={t('ws.searchHint')}
          aria-label={t('ws.searchLabel')}
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={results[cursor] ? `${listId}-${cursor}` : undefined}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
        />
        {results.length ? (
          <ul id={listId} role="listbox" className="en-switcher-list">
            {results.map((entry, index) => (
              <li
                key={entry.to}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === cursor}
                className={entry.skill ? `has-skill is-${entry.skill}` : undefined}
                onMouseEnter={() => setCursor(index)}
                onClick={() => go(entry)}
              >
                <span>{labelOf(entry)}</span>
                <small>{status(entry) ?? t(`ws.group.${entry.group}`)}</small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint en-switcher-empty">{t('ws.noResults')}</p>
        )}
        <p className="hint en-switcher-keys">{t('ws.keys')}</p>
      </div>
    </dialog>
  );
};
