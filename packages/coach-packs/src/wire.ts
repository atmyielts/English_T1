import type { Locale } from './types.ts';

// What the Telegram worker (workers/schood-coach-bots) and the coach area of the
// schood-ai function send each other. The worker is transport only: it turns
// Telegram updates into events and messages back into Telegram calls. All copy,
// state and scoring live in the function.

/** A button: a callback (≤ 64 bytes), a link, or a Mini App page (`/coach/...` on the app). */
export interface OutButton { text: string; data?: string; url?: string; app?: string }

export type OutMessage =
  | { kind: 'text'; html: string; buttons?: OutButton[][] }
  /** A voice message: new audio (base64 OGG/Opus) or a cached Telegram file id. `cacheKey` asks the worker to report the file id. */
  | { kind: 'voice'; audio?: string; mime?: string; fileId?: string; caption?: string; cacheKey?: string; buttons?: OutButton[][] }
  /** A quiz poll; the worker reports the poll id with `ref` (coach/poll-sent). */
  | { kind: 'poll'; question: string; options: string[]; correct: number; explanation?: string; ref: string }
  | { kind: 'action'; action: 'typing' | 'record_voice' | 'upload_voice' };

export type InEvent =
  | { type: 'text'; text: string; messageId: number; date: number }
  | { type: 'command'; command: string; args: string; messageId: number; date: number }
  | { type: 'callback'; data: string; messageId: number; date: number }
  /** A voice message (OGG/Opus from Telegram), base64. `fileId` is kept as the clip reference. */
  | { type: 'voice'; audio: string; mime: string; duration: number; fileId: string; fileUniqueId: string; messageId: number; date: number }
  | { type: 'photo'; image: string; mime: string; caption: string; messageId: number; date: number }
  | { type: 'poll_answer'; pollId: string; options: number[] }
  /** A placement test finished in the worker (answers encoded as in diagnostic.ts). */
  | { type: 'diagnostic'; answers: string; locale: Locale };

export interface UpdateRequest {
  pack: string;
  updateId: number;
  /** The person's Telegram language, for first contact. */
  locale: Locale;
  firstName: string | null;
  event: InEvent;
}
export interface UpdateResponse {
  messages: OutMessage[];
  /** Shown on the tapped button (answerCallbackQuery). */
  toast?: string;
  /** Remove the buttons of the message the person tapped, so it cannot be answered twice. */
  clearButtons?: boolean;
  /** The update was already handled (Telegram retried it). */
  duplicate?: boolean;
}

/** A scheduled message the cron sends (reminders, weekly reports, level-ups). */
export interface Delivery {
  id: string;
  pack: string;
  chatId: string;
  messages: OutMessage[];
}

/** Telegram's language code → one of ours. */
export function localeFrom(code: string | null | undefined): Locale {
  const value = (code ?? '').toLowerCase();
  if (value.startsWith('uz')) return 'uz';
  if (['ru', 'uk', 'be', 'kk', 'ky', 'tg'].some((prefix) => value.startsWith(prefix))) return 'ru';
  return 'en';
}
