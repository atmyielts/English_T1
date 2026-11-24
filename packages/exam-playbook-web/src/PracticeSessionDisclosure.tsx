import { useId, useState, type ReactNode } from 'react';
import { useI18n } from '../../service-i18n/src/i18n.tsx';
import type { PracticeSessionState } from './practiceCalendar';

const labels = {
  en: {
    next: 'Up next', started: 'In progress', openEarly: 'Open early', review: 'Review session', hide: 'Hide session',
    resume: 'Go to next session', hint: 'Follow the next session or open a later one early.',
    checkpoint: 'Week {week} checkpoint',
  },
  uz: {
    next: 'Navbatdagi mashg‘ulot', started: 'Jarayonda', openEarly: 'Oldindan ochish', review: 'Mashg‘ulotni takrorlash', hide: 'Mashg‘ulotni yashirish',
    resume: 'Navbatdagi mashg‘ulotga o‘tish', hint: 'Navbatdagi mashg‘ulotni bajaring yoki keyingisini oldindan oching.',
    checkpoint: '{week}-hafta nazorat mashqi',
  },
  ru: {
    next: 'Следующее занятие', started: 'В процессе', openEarly: 'Открыть раньше', review: 'Повторить занятие', hide: 'Скрыть занятие',
    resume: 'Перейти к следующему занятию', hint: 'Начните следующее занятие или откройте более позднее раньше.',
    checkpoint: 'Проверка за неделю {week}',
  },
} as const;

export function usePracticeSessionLabels() {
  const copy = labels[useI18n().locale];
  return { ...copy, checkpointFor: (week: number) => copy.checkpoint.replace('{week}', String(week)) };
}

export function PracticeSessionDisclosure({ state, title, buttonClassName, initiallyOpen = false, preview, children }: {
  state: PracticeSessionState;
  title: string;
  buttonClassName: string;
  initiallyOpen?: boolean;
  preview: ReactNode;
  children: ReactNode;
}) {
  const labels = usePracticeSessionLabels();
  const controlId = useId();
  const [opened, setOpened] = useState(initiallyOpen);

  if (state === 'next' || state === 'started') return <>{children}</>;
  const action = opened ? labels.hide : state === 'complete' ? labels.review : labels.openEarly;
  return <>
    {!opened ? preview : null}
    <button type="button" className={buttonClassName} aria-expanded={opened} aria-controls={controlId}
      aria-label={`${action} · ${title}`} onClick={() => setOpened(current => !current)}>{action}</button>
    <div id={controlId} hidden={!opened}>{opened ? children : null}</div>
  </>;
}
