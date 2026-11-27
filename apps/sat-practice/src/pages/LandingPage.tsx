import { ArrowRight, Brain, NotebookTabs, Sparkles, Timer } from 'lucide-react';
import { Link } from 'react-router-dom';
import { LocaleSwitcher, useI18n } from '../../../../packages/service-i18n/src/i18n.tsx';
import { ExamQuestionPreview } from '../../../../packages/service-design/src/ExamQuestionPreview';
import { PublicExamHeader } from '../../../../packages/service-design/src/PublicExamHeader';
import { PLATFORM_URL, SAT_PLAYBOOK_URL, SAT_SIMULATOR_URL } from '../lib/constants';
import { useAccess } from '../lib/useAccess';
import { useAppT } from '../i18n';
import '../landing.css';

const COPY = {
  en: {
    title: 'Make every SAT question count.',
    lead: 'Drill one skill, practise a timed module, or retry missed questions before your next mock.',
    sample: 'Try a math question',
    choose: 'Choose a way to practise',
    correct: 'Correct. The hire rises by 6 dollars per hour. At 5 hours it costs 12 dollars more than at 3 hours.',
    retry: 'Compare the two rows to find the cost of one extra hour. Then add two hours to the second row.',
  },
  ru: {
    title: 'Используйте каждое задание SAT.',
    lead: 'Отработайте один навык, пройдите модуль на время или вернитесь к ошибкам перед пробным тестом.',
    sample: 'Попробуйте задачу по математике',
    choose: 'Выберите формат практики',
    correct: 'Верно. Каждый час добавляет 6 долларов. Пять часов стоят на 12 долларов больше, чем три.',
    retry: 'Сравните две строки и найдите цену дополнительного часа. Затем добавьте к второй строке ещё два часа.',
  },
  uz: {
    title: 'SAT savollaridan unumli foydalaning.',
    lead: 'Bitta ko‘nikmani mashq qiling, vaqt bilan ishlang yoki sinovdan oldin xato savollarga qayting.',
    sample: 'Matematika savolini sinab ko‘ring',
    choose: 'Mashq turini tanlang',
    correct: 'To‘g‘ri. Narx soatiga 6 dollarga oshadi. Besh soat uch soatdan 12 dollar qimmat.',
    retry: 'Ikki qatorni taqqoslab, bir soatlik narxni toping. So‘ng ikkinchi qatordagi vaqtga ikki soat qo‘shing.',
  },
} as const;

const DESTINATIONS = [
  { to: '/short-sets', title: 'shortSets.title', description: 'shortSets.lead', Icon: Sparkles },
  { to: '/modules', title: 'landing.f2.title', description: 'landing.f2.copy', Icon: Timer },
  { to: '/bank', title: 'nav.bank', description: 'landing.f1.copy', Icon: Brain },
  { to: '/notebook', title: 'nav.notebook', description: 'landing.f4.copy', Icon: NotebookTabs },
] as const;

export const LandingPage = () => {
  const t = useAppT();
  const { locale } = useI18n();
  const copy = COPY[locale];
  const { status } = useAccess();

  return <div className="landing-page sat-practice-landing">
    <PublicExamHeader tone="sat"
      labels={{ sections: t('nav.label'), menu: t('nav.openMenu'), more: t('nav.more') }}
      brand={<Link to="/"><img src="/schood-logo.png" alt="" />{t('app.name')}</Link>}
      primary={<>
        <Link to="/short-sets">{t('shortSets.title')}</Link>
        <Link to="/modules">{t('landing.f2.title')}</Link>
        <Link to="/bank">{t('nav.bank')}</Link>
      </>}
      secondary={<>
        <a href={SAT_SIMULATOR_URL}>{t('landing.mock')}</a>
        <a href={SAT_PLAYBOOK_URL}>{t('nav.playbook')}</a>
        <a href={PLATFORM_URL}>{t('nav.home')}</a>
        {status === 'authenticated' ? <a href={PLATFORM_URL + '/account'}>{t('nav.account')}</a> : null}
      </>}
      locale={<LocaleSwitcher label={t('nav.language')} />}
      account={<Link to="/dashboard">{t(status === 'unauthenticated' ? 'nav.signIn' : 'landing.open')}</Link>}
    />

    <main>
      <section className="sat-public-stage">
        <div className="sat-landing-frame sat-public-intro">
          <div>
            <h1>{copy.title}</h1>
            <p className="sat-landing-lead">{copy.lead}</p>
            <div className="hero-actions">
              <Link to="/dashboard" className="btn solid">{t('landing.start')}<ArrowRight size={17} aria-hidden="true" /></Link>
              <Link to="/bank" className="btn ghost">{t('nav.bank')}</Link>
            </div>
          </div>
          <ExamQuestionPreview label={copy.sample} title="Algebra"
            detail={<table className="sat-preview-table"><thead><tr><th scope="col">Hours hired</th><th scope="col">Total cost</th></tr></thead>
              <tbody><tr><td>1</td><td>$16</td></tr><tr><td>3</td><td>$28</td></tr></tbody></table>}
            prompt="A studio charges a fixed hire fee plus an hourly rate. What is the cost of a 5-hour hire?"
            choices={['$34', '$38', '$40', '$44']} answer={2} feedback={copy} />
        </div>
      </section>
      <section className="sat-landing-frame sat-practice-destinations" aria-labelledby="sat-practice-destination-title">
        <h2 id="sat-practice-destination-title">{copy.choose}</h2>
        <div>
          {DESTINATIONS.map(({ to, title, description, Icon }) => (
            <Link to={to} key={to}>
              <Icon size={23} aria-hidden="true" />
              <span><strong>{t(title)}</strong><small>{t(description)}</small></span>
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>
    </main>
  </div>;
};
