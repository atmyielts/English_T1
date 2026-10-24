import { edge } from './api';

// The AI tutor's API (hub /tutor/* and /ai/tutor-chat). Conversations live on
// the account, so they continue on every device.

export type TutorAction = { kind: string; route: string; label: string | null; why: string | null; topic?: string | null };

export type TutorLessonItem = {
  id: string;
  type: 'fill' | 'fix' | 'choose';
  prompt: string;
  options: string[];
  result: { correct: boolean; expected: string; why: string; given: string } | null;
};

export type TutorLesson = {
  topic: string;
  level: string;
  title: string;
  explain: string;
  example: { wrong: string; right: string } | null;
  items: TutorLessonItem[];
  check: TutorLessonItem;
  progress: { answered: number; correct: number; total: number; done: boolean };
};

export type TutorMessage = {
  id: number;
  role: 'user' | 'assistant';
  kind: 'chat' | 'lesson';
  content: string;
  created_at: string;
  actions?: TutorAction[];
  lesson_topic?: string | null;
  lesson?: TutorLesson | null;
  mistake?: string | null;
};

export type TutorThread = { id: string; title: string; message_count: number; last_message_at: string };

export type TutorContext = {
  level: string | null;
  levels: Record<string, string>;
  target: string | null;
  goal_date: string | null;
  goals: string[];
  daily_minutes: number | null;
  mistakes: Array<{ topic: string; times: number; example: string | null; lesson: string | null }>;
  words_due: number;
  practise_words: string[];
  assignments: Array<{ title: string; skill: string | null; due: string | null; route: string | null }>;
  recent: string[];
  memories: string[];
  project: string | null;
};

export type TutorMemory = { id: string; kind: string; text: string; added_at: string };

export type TutorChatResponse = {
  ok: boolean;
  ai_status: 'ok' | 'unconfigured' | 'failed';
  thread: TutorThread | null;
  messages?: TutorMessage[];
  suggested_actions?: TutorAction[];
  suggested_memories?: Array<{ kind: string; text: string }>;
  lesson_topic?: string | null;
};

export const getTutorContext = (signal?: AbortSignal) =>
  edge<{ context: TutorContext; actions: TutorAction[] }>('hub', '/tutor/context', { signal });

export const getThreads = (signal?: AbortSignal) => edge<{ threads: TutorThread[] }>('hub', '/tutor/threads', { signal });

export const getThread = (id: string, signal?: AbortSignal) =>
  edge<{ thread: TutorThread; messages: TutorMessage[] }>('hub', `/tutor/threads/${encodeURIComponent(id)}`, { signal });

export const deleteThread = (id: string) => edge<{ ok: boolean }>('hub', '/tutor/threads', { body: { action: 'delete', id } });

export const importLocalHistory = (messages: Array<{ role: string; content: string }>) =>
  edge<{ imported: boolean; thread?: TutorThread }>('hub', '/tutor/threads', { body: { action: 'import', messages } });

export const sendTutorMessage = (threadId: string | null, message: string) =>
  edge<TutorChatResponse>('hub', '/ai/tutor-chat', { body: { thread_id: threadId, message } });

export const startLesson = (threadId: string | null, topic: string | null) =>
  edge<{ ok: boolean; ai_status?: string; thread?: TutorThread; message?: TutorMessage | null }>('hub', '/tutor/lesson', { body: { thread_id: threadId, topic } });

export const answerLesson = (messageId: number, itemId: string, answer: string) =>
  edge<{ ok: boolean; message: TutorMessage }>('hub', '/tutor/lesson/answer', { body: { message_id: messageId, item_id: itemId, answer } });

export const getMemories = () => edge<{ memories: TutorMemory[] }>('hub', '/tutor/memory');

export const addMemories = (memories: Array<{ kind: string; text: string }>) =>
  edge<{ memories: TutorMemory[] }>('hub', '/tutor/memory', { body: { action: 'add', memories } });

export const removeMemory = (id: string) => edge<{ memories: TutorMemory[] }>('hub', '/tutor/memory', { body: { action: 'remove', id } });
