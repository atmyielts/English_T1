import { Fragment, type ReactNode } from 'react';
import { runsText, sentenceAt, WORD_PATTERN, type InlineRun, type PassageBlock } from './markdown';

export type PickedWord = { key: string; word: string; sentence: string };

type Props = {
  blocks: PassageBlock[];
  /** When true, each word is a button the learner can pick. */
  wordMode: boolean;
  selectedKey: string | null;
  savedWords: Set<string>;
  onPick: (picked: PickedWord) => void;
};

const styled = (run: InlineRun, content: ReactNode, key: number | string) => {
  let node = content;
  if (run.em) node = <em>{node}</em>;
  if (run.strong) node = <strong>{node}</strong>;
  return <Fragment key={key}>{node}</Fragment>;
};

/** Renders one block's text, with words as buttons in word mode. */
const Runs = ({ runs, unitKey, ...props }: Omit<Props, 'blocks'> & { runs: InlineRun[]; unitKey: string }) => {
  if (!props.wordMode) return <>{runs.map((run, index) => styled(run, run.text, index))}</>;
  const text = runsText(runs);
  let offset = 0;
  return (
    <>
      {runs.map((run, runIndex) => {
        const runStart = offset;
        offset += run.text.length;
        const parts: ReactNode[] = [];
        let cursor = 0;
        for (const match of run.text.matchAll(WORD_PATTERN)) {
          const index = match.index ?? 0;
          if (index > cursor) parts.push(run.text.slice(cursor, index));
          const word = match[0];
          const key = `${unitKey}:${runStart + index}`;
          const lower = word.toLowerCase().replace(/['’]s$/, '');
          parts.push(
            <button
              key={key}
              type="button"
              className={`rd-word${props.savedWords.has(lower) ? ' is-saved' : ''}`}
              aria-pressed={props.selectedKey === key}
              onClick={() => props.onPick({ key, word, sentence: sentenceAt(text, runStart + index) })}
            >
              {word}
            </button>,
          );
          cursor = index + word.length;
        }
        if (cursor < run.text.length) parts.push(run.text.slice(cursor));
        return styled(run, parts, runIndex);
      })}
    </>
  );
};

export const Passage = ({ blocks, ...props }: Props) => (
  <div className={`en-passage rd-passage${props.wordMode ? ' is-picking' : ''}`} lang="en">
    {blocks.map((block, index) => {
      const key = String(index);
      if (block.type === 'heading') {
        const Heading = block.level === 2 ? 'h2' : 'h3';
        return <Heading key={key} className="rd-heading"><Runs runs={block.runs} unitKey={key} {...props} /></Heading>;
      }
      if (block.type === 'quote') {
        return <blockquote key={key} className="rd-quote"><Runs runs={block.runs} unitKey={key} {...props} /></blockquote>;
      }
      if (block.type === 'list') {
        const List = block.ordered ? 'ol' : 'ul';
        return (
          <List key={key} className="rd-list">
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}><Runs runs={item} unitKey={`${key}.${itemIndex}`} {...props} /></li>
            ))}
          </List>
        );
      }
      return <p key={key}><Runs runs={block.runs} unitKey={key} {...props} /></p>;
    })}
  </div>
);
