import { s } from '../../../../packages/ai-core/src/mod.ts';
import { integer, optionalText, record, text, uuid } from '../input.ts';
import { wrapUserMessage } from '../prompt.ts';
import { SchoodAIError, type RequestContext } from '../types.ts';
import { centrePrompt, requireCentre } from './shared.ts';
import type { KnowledgeHit } from './store.ts';

// C13 staff knowledge assistant. The office uploads the centre's policies and
// procedures; the app extracts the text page by page in the browser (PDF, TXT,
// Markdown) and the function keeps it as chunks per page in Postgres full-text
// search (the project has no pgvector, and no paid embedding service is used).
// The original file goes to the repo's media store (S3, _shared/media-storage.ts)
// when one is configured. Staff ask questions; the answer is written only from the
// retrieved pages and must cite them, and every citation is checked to be one of
// the pages that were retrieved. Without a matching page there is no AI call.

const CHUNK = 1100, MAX_PAGES = 500, MAX_PAGE_CHARS = 20_000;
const STOP = new Set(['the', 'and', 'for', 'are', 'what', 'how', 'when', 'who', 'can', 'does', 'our', 'with', 'from', 'that', 'this', 'have', 'need', 'qanday', 'qachon', 'nima', 'kim', 'uchun', 'bilan', 'kerak', 'как', 'что', 'когда', 'кто', 'для', 'это', 'или', 'можно', 'нужно']);

/** Splits a page into chunks on paragraph and sentence boundaries. */
export function chunkPage(content: string): string[] {
  const textValue = content.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (!textValue) return [];
  const out: string[] = [];
  let current = '';
  for (const block of textValue.split(/\n\n|(?<=[.!?])\s+(?=[\p{Lu}\d])/u)) {
    if ((current + ' ' + block).length > CHUNK && current) { out.push(current.trim()); current = ''; }
    if (block.length > CHUNK) { for (let i = 0; i < block.length; i += CHUNK) out.push(block.slice(i, i + CHUNK)); continue; }
    current = current ? `${current} ${block}` : block;
  }
  if (current.trim()) out.push(current.trim());
  return out.slice(0, 200);
}

/** A tsquery from the question: letters and digits only, prefixes for word endings, OR between words. */
export function searchQuery(question: string): string | null {
  const words = [...new Set(question.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word.length >= 3 && !STOP.has(word)))].slice(0, 12);
  if (!words.length) return null;
  return words.map((word) => `${word.length > 6 ? word.slice(0, Math.max(5, word.length - 2)) : word}:*`).join(' | ');
}

export const knowledge = {
  async GET(ctx: RequestContext) {
    const centre = await requireCentre(ctx, ['owner', 'admin', 'teacher']);
    const docs = await centre.deps.store.table('knowledge_docs').list({ workspace_id: centre.access.workspace.id }, { order: 'created_at', desc: true, limit: 200 });
    return { docs: docs.map((doc) => ({ id: doc.id, title: doc.title, filename: doc.filename, pages: doc.pages, chars: doc.chars, stored_file: !!doc.storage, created_at: doc.created_at })), media_store: !!centre.deps.media };
  },
  /** { title, filename?, mime?, pages: [{ page, text }], file_base64? } (owners and admins). */
  async POST(ctx: RequestContext) {
    const centre = await requireCentre(ctx, ['owner', 'admin']);
    await ctx.requireFeature('C13');
    const body = record(await ctx.body());
    if (!Array.isArray(body.pages) || !body.pages.length || body.pages.length > MAX_PAGES) throw new SchoodAIError('invalid_request', `A document needs 1 to ${MAX_PAGES} pages of text.`, 400, { field: 'pages' });
    const pages = body.pages.map((entry, index) => {
      const row = record(entry, `pages[${index}]`);
      return { page: integer(row.page ?? index + 1, `pages[${index}].page`, 1, 2000), text: typeof row.text === 'string' ? row.text.slice(0, MAX_PAGE_CHARS) : '' };
    });
    const chunks = pages.flatMap((page) => chunkPage(page.text).map((content, index) => ({ page: page.page, chunk: index + 1, content })));
    if (!chunks.length) throw new SchoodAIError('no_text', 'No text was found in this document. Scanned pages need text (OCR) first.', 422);
    const ws = centre.access.workspace;
    const filename = optionalText(body.filename, 'filename', { max: 200 }), mime = optionalText(body.mime, 'mime', { max: 100 });
    let storage: Record<string, string> | null = null;
    if (typeof body.file_base64 === 'string' && centre.deps.media) {
      const bytes = Uint8Array.from(atob(body.file_base64), (char) => char.charCodeAt(0));
      if (bytes.length > 6_000_000) throw new SchoodAIError('payload_too_large', 'The file is too large (6 MB at most).', 413);
      storage = await centre.deps.media.put(`schood-ai/centres/${ws.id}/knowledge/${crypto.randomUUID()}-${(filename ?? 'document').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80)}`, bytes, mime && /^[\w.+-]+\/[\w.+-]+$/.test(mime) ? mime : 'application/octet-stream');
    }
    const doc = await centre.deps.store.table('knowledge_docs').insert({
      workspace_id: ws.id, title: text(body.title, 'title', { max: 160 }), filename, mime, pages: Math.max(...pages.map((page) => page.page)), chars: chunks.reduce((sum, row) => sum + row.content.length, 0), storage, created_by: ctx.user.id,
    });
    for (const chunk of chunks) await centre.deps.store.table('knowledge_chunks').insert({ doc_id: doc.id, workspace_id: ws.id, ...chunk });
    await ctx.audit('centre.knowledge_uploaded', { pages: doc.pages, chunks: chunks.length }, { type: 'knowledge_doc', id: doc.id });
    return { doc: { id: doc.id, title: doc.title, pages: doc.pages, chunks: chunks.length, stored_file: !!storage } };
  },
  async DELETE(ctx: RequestContext) {
    const centre = await requireCentre(ctx, ['owner', 'admin']);
    const id = uuid(record(await ctx.body()).id, 'id');
    if (!await centre.deps.store.table('knowledge_docs').remove({ id, workspace_id: centre.access.workspace.id })) throw new SchoodAIError('not_found', 'Document not found.', 404);
    await ctx.audit('centre.knowledge_deleted', {}, { type: 'knowledge_doc', id });
    return { ok: true };
  },
};

const answerSchema = s.object({ answer: s.string({ min: 5, max: 2500 }), citations: s.array(s.number({ min: 1, max: 20, integer: true }), { max: 8 }), found: s.boolean() });

/** POST centre/knowledge-ask { question }: an answer from the centre's own documents with the pages it comes from. */
export async function ask(ctx: RequestContext) {
  const centre = await requireCentre(ctx, ['owner', 'admin', 'teacher']);
  await ctx.requireFeature('C13');
  const question = text(record(await ctx.body()).question, 'question', { min: 3, max: 1000 });
  const query = searchQuery(question);
  const hits: KnowledgeHit[] = query ? await centre.deps.store.searchKnowledge(centre.access.workspace.id, query, 6) : [];
  if (!hits.length) return { answer: null, found: false, sources: [], credits: 0 };
  const blocks = hits.map((hit, index) => ({ kind: 'page', title: `[${index + 1}] ${hit.title}, page ${hit.page}`, data: { source: index + 1, document: hit.title, page: hit.page, text: hit.content } }));
  const { result, credits } = await ctx.ai.charged({ key: 'knowledge.answer', mode: 'json', reference: ctx.idempotencyKey ? `knowledge:${ctx.idempotencyKey}` : undefined }, async (session) => {
    const messages = [
      { role: 'system' as const, content: centrePrompt({
        workspace: centre.access.workspace, locale: ctx.locale,
        task: 'Answer a staff member’s question using only the centre’s own documents in the reference data. Cite every statement with the source numbers in square brackets, like [2], and list the numbers you used in `citations`. If the documents do not answer the question, set found to false and say so in one sentence. Answer in the language of the question.',
        blocks,
      }) },
      { role: 'user' as const, content: wrapUserMessage(question) },
    ];
    let reply = await session.json({ messages, schema: answerSchema, maxTokens: 900, temperature: 0.1 });
    const valid = (r: typeof reply) => !r.found || (r.citations.length > 0 && r.citations.every((n) => n >= 1 && n <= hits.length));
    if (!valid(reply)) {
      messages.push({ role: 'user' as const, content: `Cite the sources you used (numbers 1 to ${hits.length}) in citations and in the text, or set found to false.` });
      reply = await session.json({ messages, schema: answerSchema, maxTokens: 900, temperature: 0 });
      if (!valid(reply)) reply = { answer: reply.answer, citations: [], found: false };
    }
    return reply;
  });
  const cited = [...new Set(result.citations)].filter((n) => n >= 1 && n <= hits.length);
  return {
    answer: result.answer, found: result.found && cited.length > 0, credits,
    sources: cited.map((n) => ({ ref: n, doc_id: hits[n - 1].docId, title: hits[n - 1].title, page: hits[n - 1].page, excerpt: hits[n - 1].content.slice(0, 280) })),
  };
}
