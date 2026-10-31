import { useState, type FormEvent } from 'react';
import { FileText, Search, Trash2, Upload } from 'lucide-react';
import { ApiErrorState, Badge, Button, Card, CreditCost, EmptyState, Field, PageHeader, TextArea, TextInput, Thinking, useT } from '../../core/index.ts';
import { CentreGate, Loaded, newKey, Section, Table, useCentre, useCentreApi, useFormat, useLoad, useSubmit } from '../kit.tsx';

// C13 staff knowledge assistant: the office uploads policies and procedures (PDF,
// text or Markdown; text is taken out page by page in the browser), staff ask
// questions, and every answer cites the document and page it comes from.

interface Doc { id: string; title: string; filename: string | null; pages: number; chars: number; stored_file: boolean; created_at: string }
interface Answer { answer: string | null; found: boolean; credits: number; sources: { ref: number; title: string; page: number; excerpt: string }[] }
const MAX_FILE = 6_000_000;

/** Text per page: PDF pages through pdf.js (loaded only here), text files split on form feeds or "Page N" lines. */
async function extract(file: File): Promise<{ pages: { page: number; text: string }[]; bytes: Uint8Array }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    const task = pdfjs.getDocument({ data: bytes.slice() });
    const doc = await task.promise;
    const pages: { page: number; text: string }[] = [];
    for (let n = 1; n <= Math.min(doc.numPages, 500); n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      pages.push({ page: n, text: content.items.map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '')).join('').trim() });
    }
    // pdf.js 6: the loading task frees the document and its worker.
    await task.destroy();
    return { pages, bytes };
  }
  const text = new TextDecoder().decode(bytes);
  const parts = text.includes('\f') ? text.split('\f') : text.split(/\n(?=\s*(?:page|bet|страница)\s+\d+\s*\n)/i);
  return { pages: parts.map((part, index) => ({ page: index + 1, text: part.trim() })).filter((part) => part.text), bytes };
}
const base64 = (bytes: Uint8Array) => { let out = ''; for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(out); };

export function KnowledgePage() {
  const t = useT(), { manager } = useCentre();
  return <CentreGate roles={['owner', 'admin', 'teacher']}>
    <PageHeader title={t('centre.knowledge.title')} lead={t('centre.knowledge.lead')}/>
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]"><Ask/>{manager ? <Docs/> : <DocList/>}</div>
  </CentreGate>;
}

function Ask() {
  const t = useT(), call = useCentreApi();
  const [question, setQuestion] = useState(''), [answer, setAnswer] = useState<Answer | null>(null);
  const submit = useSubmit();
  const ask = (event: FormEvent) => { event.preventDefault(); void submit.run(async () => setAnswer(await call<Answer>('knowledge-ask', { method: 'POST', idempotencyKey: newKey(), body: { question } }))); };
  return <Section title={t('centre.knowledge.ask')} lead={t('centre.knowledge.askLead')}>
    <form onSubmit={ask} className="grid gap-3">
      <Field label={t('centre.knowledge.question')}>{(id) => <TextArea id={id} rows={2} required minLength={3} maxLength={1000} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={t('centre.knowledge.placeholder')}/>}</Field>
      <div className="flex flex-wrap items-center gap-3"><Button type="submit" variant="spark" disabled={submit.busy} icon={<Search size={16} aria-hidden="true"/>}>{t('centre.knowledge.askButton')}</Button><CreditCost creditKey="knowledge.answer"/><span className="text-xs text-gray-600">{t('centre.knowledge.freeIfNone')}</span></div>
    </form>
    {submit.busy && <div className="mt-4"><Thinking label={t('centre.knowledge.searching')}/></div>}
    {submit.error !== null && <div className="mt-4"><ApiErrorState error={submit.error}/></div>}
    {answer && !submit.busy && <div className="mt-4 grid gap-3" aria-live="polite">
      {!answer.found ? <EmptyState title={t('centre.knowledge.notFound')} lead={answer.answer ?? t('centre.knowledge.notFoundLead')}/> : <>
        <p className="m-0 whitespace-pre-wrap text-sm leading-6">{answer.answer}</p>
        <ul className="m-0 grid list-none gap-2 p-0">{answer.sources.map((source) => <li key={source.ref} className="rounded-2xl border border-navy-line/30 bg-cream-soft p-3 text-sm">
          <p className="m-0 inline-flex items-center gap-2 font-semibold"><Badge>[{source.ref}]</Badge>{source.title} · {t('centre.knowledge.page', { page: source.page })}</p>
          <p className="m-0 mt-1 text-gray-700">{source.excerpt}…</p>
        </li>)}</ul>
      </>}
    </div>}
  </Section>;
}

function DocList() {
  const t = useT(), f = useFormat();
  const state = useLoad<{ docs: Doc[] }>('knowledge');
  return <Section title={t('centre.knowledge.docs')}><Loaded state={state}>{(data) => !data.docs.length ? <EmptyState title={t('centre.knowledge.noDocs')}/> : <ul className="m-0 grid list-none gap-2 p-0">{data.docs.map((doc) => <li key={doc.id} className="flex items-center gap-2 text-sm"><FileText size={16} aria-hidden="true"/><span className="font-semibold">{doc.title}</span><span className="text-gray-600">{t('centre.knowledge.pages', { count: doc.pages })} · {f.date(doc.created_at)}</span></li>)}</ul>}</Loaded></Section>;
}

function Docs() {
  const t = useT(), f = useFormat(), call = useCentreApi();
  const state = useLoad<{ docs: Doc[]; media_store: boolean }>('knowledge');
  const [file, setFile] = useState<File | null>(null), [title, setTitle] = useState(''), [pasted, setPasted] = useState(''), [progress, setProgress] = useState<string | null>(null);
  const submit = useSubmit(), remove = useSubmit();
  const upload = (event: FormEvent) => {
    event.preventDefault();
    void submit.run(async () => {
      let pages: { page: number; text: string }[], bytes: Uint8Array | null = null;
      if (file) {
        if (file.size > MAX_FILE) throw new Error(t('centre.knowledge.tooBig'));
        setProgress(t('centre.knowledge.reading'));
        ({ pages, bytes } = await extract(file));
      } else pages = [{ page: 1, text: pasted }];
      if (!pages.some((page) => page.text.trim())) { setProgress(null); throw new Error(t('centre.knowledge.noText')); }
      setProgress(t('centre.knowledge.uploading', { count: pages.length }));
      await call('knowledge', { method: 'POST', timeoutMs: 120_000, body: { title: title || file?.name.replace(/\.[^.]+$/, '') || t('centre.knowledge.untitled'), filename: file?.name ?? null, mime: file?.type || null, pages, ...(bytes && state.data?.media_store ? { file_base64: base64(bytes) } : {}) } });
      setFile(null); setTitle(''); setPasted(''); setProgress(null); await state.reload();
    }).finally(() => setProgress(null));
  };
  return <Section title={t('centre.knowledge.docs')} lead={t('centre.knowledge.docsLead')}>
    <form onSubmit={upload} className="grid gap-3 rounded-2xl border border-dashed border-navy-line/40 bg-white/60 p-4">
      <Field label={t('centre.knowledge.file')} hint={t('centre.knowledge.fileHint')}>{(id) => <input id={id} type="file" accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="text-sm"/>}</Field>
      {!file && <Field label={t('centre.knowledge.orPaste')}>{(id) => <TextArea id={id} rows={4} maxLength={20000} value={pasted} onChange={(event) => setPasted(event.target.value)}/>}</Field>}
      <Field label={t('centre.knowledge.docTitle')}>{(id) => <TextInput id={id} maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)}/>}</Field>
      {progress && <Thinking label={progress}/>}
      {submit.error !== null && (submit.error instanceof Error && !('code' in submit.error) ? <p role="alert" className="m-0 text-sm text-amber-900">{submit.error.message}</p> : <ApiErrorState error={submit.error}/>)}
      <div><Button type="submit" disabled={submit.busy || (!file && !pasted.trim())} icon={<Upload size={16} aria-hidden="true"/>}>{t('centre.knowledge.upload')}</Button></div>
    </form>
    <div className="mt-4"><Loaded state={state}>{(data) => <Table caption={t('centre.knowledge.docs')} rows={data.docs} rowKey={(doc) => doc.id} empty={t('centre.knowledge.noDocs')} columns={[
      { key: 'title', label: t('centre.placement.testTitle'), render: (doc) => <span className="font-semibold">{doc.title}</span> },
      { key: 'pages', label: t('centre.knowledge.pagesLabel'), render: (doc) => doc.pages },
      { key: 'date', label: t('centre.admin.when'), render: (doc) => f.date(doc.created_at) },
      { key: 'delete', label: <span className="sr-only">{t('centre.people.actions')}</span>, render: (doc) => <Button size="sm" variant="ghost" disabled={remove.busy} onClick={() => { if (confirm(t('centre.knowledge.confirmDelete', { title: doc.title }))) void remove.run(async () => { await call('knowledge', { method: 'DELETE', body: { id: doc.id } }); await state.reload(); }); }} aria-label={t('centre.common.remove')} icon={<Trash2 size={14} aria-hidden="true"/>}/> },
    ]}/>}</Loaded></div>
    {remove.error !== null && <div className="mt-3"><ApiErrorState error={remove.error}/></div>}
    <Card className="mt-4 bg-cream-soft"><p className="m-0 text-xs text-gray-700">{t('centre.knowledge.privacy')}</p></Card>
  </Section>;
}
