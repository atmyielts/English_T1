// Response shapes of the telegram-app English actions (supabase/functions/telegram-app/english.ts).

export type TelegramAppCall = (action: string, body?: Record<string, unknown>) => Promise<Record<string, unknown>>;

export type EnglishTask = {
  id: string;
  kind: 'review' | 'activity';
  skill: string;
  title: string;
  minutes: number;
  href: string;
  done: boolean;
};

export type EnglishToday = {
  ok: true;
  placement_done: boolean;
  level: string | null;
  target_level: string | null;
  streak: number;
  xp_today: number;
  due: { items: number; words: number; total: number };
  plan: { ready: boolean; date: string | null; total: number; done: number; next: EnglishTask[] };
  app_url: string;
  quiz: { enabled: boolean; can_toggle: boolean };
};

export type ItemCard = {
  kind: 'item';
  id: string;
  step: number;
  type: 'grammar' | 'choice' | 'dictation';
  prompt?: string;
  instructions?: string;
  options?: string[];
  speak?: string;
  source_title?: string;
};

export type WordCard = { kind: 'word'; id: string; word: string; definition: string | null; example: string | null };

export type ReviewCard = ItemCard | WordCard;

export type ReviewBatch = { ok: true; due: { items: number; words: number; total: number }; cards: ReviewCard[] };

export type ItemVerdict = { ok: true; correct: boolean; expected: string; explanation: string | null; accuracy?: number; retired: boolean; xp_earned?: number };
