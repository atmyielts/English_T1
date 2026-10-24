import { Fragment, type ReactNode } from 'react';
import { TapScope, TapWords } from '../../components/WordLookup';
import type { TapSource } from '../../lib/wordLookup';
import { runsText, sentenceAt, WORD_PATTERN, type InlineRun, type PassageBlock } from './markdown';

export type PickedWord = { key: string; word: string; sentence: string };

type Props = {
  blocks: PassageBlock[];
  /** When true, each word is a button the learner can pick. */
  wordMode: boolean;
  selectedKey: string | null;
  savedWords: Set<string>;
  onPick: (picked: PickedWord) => void;
  /** Outside word mode, words can be tapped for their meaning. */
  tapSource: TapSource;
  onTapSaved?: (word: string, sentence: string) => void;
  /** Outside word mode: something shown under each paragraph (Read aloud). */
  paragraphAction?: (text: string, key: string) => ReactNode;
};

const styled = (run: InlineRun, content: ReactNode, key: number | string) => {
  let node = content;
  if (run.em) node = <em>{node}</em>;
  if (run.strong) node = <strong>{node}</strong>;
  return <Fragment key={key}>{node}</Fragment>;
};

/** Renders one block's text, with words as buttons in word mode. */
type RunsProps = Omit<Props, 'blocks' | 'tapSource' | 'onTapSaved' | 'paragraphAction'> & { runs: InlineRun[]; unitKey: string };

const Runs = ({ runs, unitKey, ...props }: RunsProps) => {
  if (!props.wordMode) return <>{runs.map((run, index) => styled(run, <TapWords text={run.text} />, index))}</>;
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

const Blocks = ({ blocks, paragraphAction, ...props }: Omit<Props, 'tapSource' | 'onTapSaved'>) => (
  <>
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
      const action = paragraphAction && !props.wordMode ? paragraphAction(runsText(block.runs), key) : null;
      return (
        <Fragment key={key}>
          <p><Runs runs={block.runs} unitKey={key} {...props} /></p>
          {action ? <div className="sh-paragraph-action">{action}</div> : null}
        </Fragment>
      );
    })}
  </>
);

export const Passage = ({ tapSource, onTapSaved, ...props }: Props) => (
  props.wordMode ? (
    <div className="en-passage rd-passage is-picking" lang="en">
      <Blocks {...props} />
    </div>
  ) : (
    <TapScope className="en-passage rd-passage" source={tapSource} onSaved={onTapSaved}>
      <Blocks {...props} />
    </TapScope>
  )
);
