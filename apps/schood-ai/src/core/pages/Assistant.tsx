import { useEffect, useState } from 'react';
import { MessageSquarePlus, Pin } from 'lucide-react';
import { api } from '../api.ts';
import { Chat } from '../Chat.tsx';
import { useT } from '../i18n/index.ts';
import { navigate, useLocation } from '../router.tsx';
import type { ThreadView } from '../types.ts';
import { Button, Eyebrow, SparkMark } from '../ui.tsx';
import { useWorkspace } from '../workspace.tsx';
import { takePendingPrompt } from './Home.tsx';

// The general assistant with your recent conversations. `?thread=<id>` opens one
// (an id, never message text). Deep links /tutor, /explain, /write and /speak land
// here until the learner area registers its own pages for them.

export function AssistantPage() {
  const t = useT(), workspace = useWorkspace(), { query } = useLocation();
  const threadId = query.get('thread');
  const [threads, setThreads] = useState<ThreadView[]>([]);
  const [prompt] = useState(takePendingPrompt);
  useEffect(() => {
    let live = true;
    api<{ threads: ThreadView[] }>('core/threads', { workspaceId: workspace.workspaceId })
      .then((result) => { if (live) setThreads(result.threads.slice(0, 12)); })
      .catch(() => { if (live) setThreads([]); });
    return () => { live = false; };
  }, [workspace.workspaceId, threadId]);
  const open = (id: string | null) => navigate(id ? `/assistant?thread=${encodeURIComponent(id)}` : '/assistant');
  return <div className="grid gap-6 xl:grid-cols-[16rem_minmax(0,1fr)]">
    <aside className="order-2 xl:order-1" aria-label={t('nav.history')}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <Eyebrow>{t('nav.history')}</Eyebrow>
        <Button variant="secondary" size="sm" onClick={() => open(null)} icon={<MessageSquarePlus size={14} aria-hidden="true"/>}>{t('chat.newChat')}</Button>
      </div>
      {threads.length ? <ul className="m-0 grid list-none gap-1 p-0">
        {threads.map((thread) => <li key={thread.id}><button type="button" onClick={() => open(thread.id)} aria-current={thread.id === threadId ? 'true' : undefined}
          className={`flex min-h-11 w-full items-center gap-2 rounded-2xl px-3 py-2 text-left text-sm ${thread.id === threadId ? 'bg-navy text-white' : 'bg-white/70 text-gray-900 hover:bg-white'} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy`}>
          {thread.pinned && <Pin size={14} aria-label={t('history.pinned')}/>}<span className="truncate">{thread.title || t('chat.newChat')}</span>
        </button></li>)}
      </ul> : <p className="m-0 text-sm text-gray-600">{t('history.empty')}</p>}
    </aside>
    <section className="order-1 min-w-0 xl:order-2" aria-labelledby="assistant-title">
      <header className="mb-4 flex items-center gap-3">
        <SparkMark size={36}/>
        <div>
          <h1 id="assistant-title" className="m-0 font-display text-2xl font-bold md:text-3xl">{workspace.me?.workspace.branding.assistant_name ?? t('chat.title')}</h1>
          <p className="m-0 text-sm text-gray-700">{workspace.me?.specialists.find((entry) => entry.key === 'assistant')?.description}</p>
        </div>
      </header>
      <Chat key={threadId ?? 'new'} threadId={threadId} initialMessage={prompt} autoFocus={!!prompt}
        onThread={(id) => { if (id !== threadId) history.replaceState(null, '', `/assistant?thread=${encodeURIComponent(id)}`); }}/>
    </section>
  </div>;
}
