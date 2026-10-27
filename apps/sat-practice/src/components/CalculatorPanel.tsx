import { ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { type AngleMode, evaluate } from '../lib/calc';
import { useAppT } from '../i18n';

const KEYS: string[][] = [
  ['sin(', 'cos(', 'tan(', 'π'],
  ['√(', '^', '(', ')'],
  ['7', '8', '9', '÷'],
  ['4', '5', '6', '×'],
  ['1', '2', '3', '−'],
  ['0', '.', 'ans', '+'],
];

/** Desmos link plus a small built-in scientific calculator (not the embedded Bluebook calculator). */
export function CalculatorPanel(props: { onClose?: () => void }) {
  const t = useAppT();
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<AngleMode>('deg');
  const [ans, setAns] = useState(0);
  const [output, setOutput] = useState<string>('');
  const [history, setHistory] = useState<Array<{ input: string; result: string }>>([]);
  const run = () => {
    const result = evaluate(input, mode, ans);
    if (result.ok) {
      setAns(result.value); setOutput(result.text);
      setHistory(items => [{ input, result: result.text }, ...items].slice(0, 5));
    } else if (result.error !== 'empty') setOutput(t(result.error === 'math' ? 'calc.error.math' : 'calc.error.syntax'));
  };
  return <aside className="calculator-panel" aria-label={t('calc.title')}>
    <div className="section-head">
      <h2>{t('calc.title')}</h2>
      {props.onClose ? <button type="button" className="btn ghost compact" onClick={props.onClose}>{t('calc.hide')}</button> : null}
    </div>
    <p className="calc-note">{t('calc.note')}</p>
    <a className="btn ghost" href="https://www.desmos.com/calculator" target="_blank" rel="noopener noreferrer">
      {t('calc.desmos')} <ExternalLink size={16} aria-hidden="true" />
    </a>
    <div className="calc-body">
      <input aria-label={t('calc.input')} value={input} inputMode="text" autoComplete="off" spellCheck={false}
        onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); run(); } }} />
      <output className="calc-output" aria-live="polite" aria-label={t('calc.result')}>{output || '0'}</output>
      <div className="calc-toolbar">
        <button type="button" className="btn ghost compact" aria-pressed={mode === 'deg'} onClick={() => setMode(m => m === 'deg' ? 'rad' : 'deg')}
          aria-label={t('calc.angle', { mode: t(mode === 'deg' ? 'calc.deg' : 'calc.rad') })}>{t(mode === 'deg' ? 'calc.deg' : 'calc.rad')}</button>
        <button type="button" className="btn ghost compact" onClick={() => { setInput(''); setOutput(''); }}>{t('calc.clear')}</button>
        <button type="button" className="btn ghost compact" onClick={() => setInput(v => v.slice(0, -1))}>{t('calc.delete')}</button>
      </div>
      <div className="calc-keys">
        {KEYS.flat().map(key => <button key={key} type="button" className="calc-key" onClick={() => setInput(v => v + key)}>{key.length > 1 ? key.replace('(', '') : key}</button>)}
        <button type="button" className="calc-key equals" onClick={run}>=</button>
      </div>
      {history.length ? <details className="calc-history"><summary>{t('calc.history')}</summary>
        <ul>{history.map((h, i) => <li key={i}><button type="button" className="link-button" onClick={() => setInput(h.input)}>{h.input} = {h.result}</button></li>)}</ul></details> : null}
    </div>
  </aside>;
}
