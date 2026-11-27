import { ArrowRight, BookOpen, Headphones, Mic, PenLine } from 'lucide-react';
import { Link } from 'react-router-dom';
import { LocaleSwitcher, useI18n } from '../../../../packages/service-i18n/src/i18n.tsx';
import { ExamQuestionPreview } from '../../../../packages/service-design/src/ExamQuestionPreview';
import { PublicExamHeader } from '../../../../packages/service-design/src/PublicExamHeader';
import { IELTS_PRACTICE_PRODUCT_SLUG } from '../lib/constants';
import { buildPlatformUrl, platformBase } from '../lib/platformUrls';
import { supabase } from '../lib/supabase';
import { useAccess } from '../lib/useAccess';
import { sectionLabel, useAppT, type AppKey } from '../i18n';
import '../landing.css';

const SCHOOD_HOME_URL = platformBase || 'https://schood.online';
const SIMULATOR_URL = 'https://ielts.schood.online/dashboard';
const PLAYBOOK_URL = 'https://playbook.ielts.schood.online/dashboard?source=practice';
const SECTIONS = [1, 2, 3, 4] as const;

const COPY = {
  en: {
    title: 'Turn your IELTS mistakes into progress.',
    lead: 'Practise the question types that cost you marks. Start with a focused set, see the evidence behind each answer, and revisit what you missed.',
    sample: 'Try a reading question',
    correct: 'Correct. The passage gives a duration, but it never says when the trial began.',
    retry: 'The passage tells you how long the trial lasted. Does it name the season?',
    explore: 'Choose a skill to practise', listening: 'New recordings coming soon',
  },
  ru: {
    title: 'Учитесь на своих ошибках в IELTS.',
    lead: 'Тренируйте типы заданий, за которые теряете баллы. Начните с короткого набора, разберите ответы и вернитесь к ошибкам.',
    sample: 'Попробуйте задание по чтению',
    correct: 'Верно. Известна длительность эксперимента, но время года не указано.',
    retry: 'Текст сообщает длительность эксперимента. Указано ли время года?',
    explore: 'Выберите навык для практики', listening: 'Новые записи скоро появятся',
  },
  uz: {
    title: 'IELTS xatolaridan o‘rganing.',
    lead: 'Ball yo‘qotayotgan savol turlarini mashq qiling. Qisqa to‘plamdan boshlang, javoblar dalilini ko‘ring va xatolarga qayting.',
    sample: 'O‘qish savolini sinab ko‘ring',
    correct: 'To‘g‘ri. Matnda sinov qancha davom etgani aytilgan, ammo fasli ko‘rsatilmagan.',
    retry: 'Matnda sinov davomiyligi bor. Fasl haqida nima deyilgan?',
    explore: 'Mashq qiladigan ko‘nikmani tanlang', listening: 'Yangi audiolar tez orada',
  },
} as const;

const SKILLS = [
  { skill: 'reading', to: '/library', Icon: BookOpen },
  { skill: 'writing', to: '/writing-prep', Icon: PenLine },
  { skill: 'speaking', to: '/speaking', Icon: Mic },
] as const;

export const LandingPage = () => {
  const t = useAppT();
  const { locale } = useI18n();
  const copy = COPY[locale];
  const { status } = useAccess();
  const returnTo = typeof window === 'undefined' ? '/today' : window.location.origin + '/today';
  const authHref = buildPlatformUrl('/auth', returnTo, { mode: 'signin', product: IELTS_PRACTICE_PRODUCT_SLUG });
  const pricingHref = buildPlatformUrl('/pricing', returnTo, { product: IELTS_PRACTICE_PRODUCT_SLUG });
  const authed = status === 'authenticated';

  const signOut = async () => {
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } finally {
      window.location.reload();
    }
  };

  return <div className="practice-root ielts-practice-landing">
    <PublicExamHeader tone="ielts"
      labels={{ sections: t('shell.nav.label'), menu: t('shell.menu'), more: t('shell.nav.more') }}
      brand={<Link to="/"><img src="/schood-logo.png" alt="" />{t('shell.brand')}</Link>}
      primary={<>
        <Link to="/today">{t('shell.nav.today')}</Link>
        <Link to="/library">{t('library.title')}</Link>
        <a href={SIMULATOR_URL}>{t('shell.nav.simulator')}</a>
      </>}
      secondary={<>
        <a href={PLAYBOOK_URL}>{t('shell.nav.playbook')}</a>
        <a href={pricingHref}>{t('land.nav.access')}</a>
        <a href={SCHOOD_HOME_URL}>{t('land.nav.home')}</a>
        <a href={SCHOOD_HOME_URL + '/account'}>{t('land.nav.account')}</a>
        {authed ? <button type="button" onClick={() => void signOut()}>{t('land.nav.signout')}</button> : null}
      </>}
      locale={<LocaleSwitcher label={t('shell.language')} />}
      account={authed ? <Link to="/today">{t('land.nav.continue')}</Link> : <a href={authHref}>{t('land.nav.signin')}</a>}
    />

    <main className="ielts-landing-main">
      <section className="ielts-landing-stage">
        <div className="ielts-landing-frame ielts-landing-intro">
          <div>
            <h1>{copy.title}</h1>
            <p className="ielts-landing-lead">{copy.lead}</p>
            <div className="hero-actions">
              <Link to="/today" className="btn solid">{t('land.hero.start')}<ArrowRight size={17} aria-hidden="true" /></Link>
              <Link to="/library" className="btn ghost">{t('library.title')}</Link>
            </div>
          </div>
          <ExamQuestionPreview
            label={copy.sample}
            title="True / False / Not Given"
            detail="For six weeks, library staff tested a quieter study room. They recorded how many visitors used the room each afternoon."
            prompt="The trial began in winter."
            choices={['True', 'False', 'Not Given']}
            answer={2}
            feedback={copy}
          />
        </div>
      </section>

      <section className="ielts-landing-skills" aria-labelledby="ielts-landing-skills-title">
        <div className="ielts-landing-frame">
          <h2 id="ielts-landing-skills-title">{copy.explore}</h2>
          <div className="ielts-landing-skill-grid">
            {SKILLS.map(({ skill, to, Icon }) => (
              <Link key={skill} to={to}><Icon size={21} aria-hidden="true" /><strong>{sectionLabel(t, skill)}</strong><ArrowRight size={17} aria-hidden="true" /></Link>
            ))}
            <span className="ielts-landing-audio"><Headphones size={21} aria-hidden="true" /><span><strong>{sectionLabel(t, 'listening')}</strong><small>{copy.listening}</small></span></span>
          </div>
        </div>
      </section>

      <section className="ielts-landing-frame ielts-landing-steps" aria-labelledby="ielts-landing-steps-title">
        <h2 id="ielts-landing-steps-title">{t('land.how.title')}</h2>
        <ol>
          {SECTIONS.map(n => <li key={n}><h3>{t(('land.step' + n + '.title') as AppKey)}</h3><p>{t(('land.step' + n + '.copy') as AppKey)}</p></li>)}
        </ol>
      </section>

      <section className="ielts-landing-frame ielts-landing-faq" aria-labelledby="ielts-landing-faq-title">
        <h2 id="ielts-landing-faq-title">{t('land.faq.title')}</h2>
        <div>
          {SECTIONS.map(n => <details key={n}><summary>{t(('land.faq' + n + '.q') as AppKey)}</summary><p>{t(('land.faq' + n + '.a') as AppKey)}</p></details>)}
          <a className="btn ghost" href={pricingHref}>{t('land.hero.plans')}</a>
        </div>
      </section>
    </main>
  </div>;
};
