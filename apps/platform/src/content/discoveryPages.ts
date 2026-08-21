export type DiscoveryPageKey =
  | 'ielts'
  | 'ieltsMockTest'
  | 'ieltsWritingPractice'
  | 'toefl'
  | 'toeflPracticeTest'
  | 'sat'
  | 'digitalSatPracticeTest'
  | 'english';

export type DiscoveryPageFamily = 'ielts' | 'toefl' | 'sat' | 'english';
export type DiscoveryPageCategory = 'service' | 'intent';

export type DiscoveryLink = {
  label: string;
  href: string;
  description: string;
  external?: boolean;
};

export type DiscoveryHighlight = {
  value: string;
  label: string;
  detail: string;
};

export type DiscoveryFeature = {
  title: string;
  description: string;
};

export type DiscoveryFaq = {
  question: string;
  answer: string;
};

export type DiscoveryPageConfig = {
  key: DiscoveryPageKey;
  family: DiscoveryPageFamily;
  category: DiscoveryPageCategory;
  path: string;
  navLabel: string;
  cardLabel: string;
  cardTitle: string;
  cardDescription: string;
  seoTitle: string;
  seoDescription: string;
  keywords: string[];
  eyebrow: string;
  heroTitle: string;
  heroDescription: string;
  heroBullets: string[];
  primaryCta: DiscoveryLink;
  secondaryCta?: DiscoveryLink;
  highlights: DiscoveryHighlight[];
  features: DiscoveryFeature[];
  outcomes: string[];
  faq: DiscoveryFaq[];
  relatedLinks: DiscoveryLink[];
  appName: string;
  applicationCategory: string;
};

const pages: DiscoveryPageConfig[] = [
  {
    key: 'ielts',
    family: 'ielts',
    category: 'service',
    path: '/ielts',
    navLabel: 'IELTS',
    cardLabel: 'Core service',
    cardTitle: 'IELTS preparation platform',
    cardDescription: 'Timed mock exams, section practice, writing workflows, and connected IELTS guidance.',
    seoTitle: 'IELTS Preparation Platform | Mock Tests, Writing Practice, and Strategy | Schood',
    seoDescription:
      'Prepare for IELTS with realistic mock exams, skill-focused practice, writing workflows, and connected strategy inside Schood.',
    keywords: [
      'IELTS preparation platform',
      'IELTS mock test online',
      'IELTS writing practice',
      'IELTS simulator',
      'IELTS study platform',
    ],
    eyebrow: 'IELTS preparation',
    heroTitle: 'Train for IELTS with realistic pacing and connected support.',
    heroDescription:
      'Schood combines timed IELTS sessions, focused practice routes, and connected study resources so learners can prepare without jumping between disconnected tools.',
    heroBullets: [
      'Full-length and section-based IELTS practice in one workspace.',
      'Writing-friendly workflows that fit task-based preparation.',
      'A clean handoff into the IELTS Playbook for strategy and study planning.',
    ],
    primaryCta: {
      label: 'Open IELTS simulator',
      href: 'https://ielts.schood.online',
      description: 'Launch the IELTS simulator and start training inside the exam environment.',
      external: true,
    },
    secondaryCta: {
      label: 'Read the IELTS Playbook',
      href: 'https://playbook.ielts.schood.online',
      description: 'Use the strategy library for study plans, skill guides, and exam decision support.',
      external: true,
    },
    highlights: [
      { value: '4', label: 'core skills', detail: 'Listening, Reading, Writing, and Speaking preparation in one system.' },
      { value: 'Timed', label: 'exam pacing', detail: 'Practice under realistic time pressure instead of passive review.' },
      { value: 'Linked', label: 'study stack', detail: 'Use simulator work together with Playbook guidance and pricing paths.' },
    ],
    features: [
      {
        title: 'Real test rhythm',
        description: 'Sessions are designed to feel like exam work, so time management becomes part of your preparation.',
      },
      {
        title: 'Focused practice routes',
        description: 'Learners can isolate skills and sections instead of always committing to a full mock.',
      },
      {
        title: 'Strategy support',
        description: 'The IELTS Playbook gives you connected study plans, skill guides, and exam decision-making help.',
      },
    ],
    outcomes: [
      'Understand how your weakest skill affects your overall IELTS readiness.',
      'Practice full mocks when you need realism and sections when you need precision.',
      'Move from test exposure into actual study planning instead of guessing the next step.',
    ],
    faq: [
      {
        question: 'Who is this IELTS platform for?',
        answer: 'It is built for learners who want realistic IELTS practice, cleaner pacing habits, and a clearer bridge between practice and strategy.',
      },
      {
        question: 'Does Schood include full IELTS-style practice sessions?',
        answer: 'Yes. The simulator supports full exam flows and section-based work so you can train at the right level of intensity.',
      },
      {
        question: 'Can I use the platform with study guides?',
        answer: 'Yes. The IELTS Playbook is linked as a companion resource for structure, planning, and skill-specific strategy.',
      },
    ],
    relatedLinks: [
      {
        label: 'IELTS mock test page',
        href: '/ielts-mock-test',
        description: 'See the mock-test focused entry point for searchers looking for realistic IELTS exam practice.',
      },
      {
        label: 'IELTS writing practice page',
        href: '/ielts-writing-practice',
        description: 'Open the writing-focused landing page for task-based IELTS preparation.',
      },
      {
        label: 'IELTS Playbook',
        href: 'https://playbook.ielts.schood.online',
        description: 'Use the companion library for strategy, study plans, and skill guides.',
        external: true,
      },
    ],
    appName: 'Schood IELTS Simulator',
    applicationCategory: 'EducationalApplication',
  },
  {
    key: 'ieltsMockTest',
    family: 'ielts',
    category: 'intent',
    path: '/ielts-mock-test',
    navLabel: 'IELTS mock tests',
    cardLabel: 'Popular search',
    cardTitle: 'IELTS mock test online',
    cardDescription: 'A focused page for learners searching specifically for realistic IELTS mock exam practice.',
    seoTitle: 'IELTS Mock Test Online | Timed Practice Exams | Schood',
    seoDescription:
      'Take IELTS mock tests online with realistic pacing, section structure, and a direct path into study planning on Schood.',
    keywords: [
      'IELTS mock test online',
      'IELTS practice exam',
      'timed IELTS mock test',
      'IELTS exam simulation',
      'IELTS full test practice',
    ],
    eyebrow: 'IELTS mock tests',
    heroTitle: 'Use mock tests when you need exam pressure, not just extra questions.',
    heroDescription:
      'This route is for learners who want realistic IELTS practice exams online and need a cleaner way to rehearse timing, focus, and section transitions.',
    heroBullets: [
      'Practice under time limits that feel like real IELTS sessions.',
      'Move from full mocks into targeted follow-up practice when patterns appear.',
      'Pair mock-test exposure with strategy notes from the IELTS Playbook.',
    ],
    primaryCta: {
      label: 'Start IELTS mock practice',
      href: 'https://ielts.schood.online',
      description: 'Open the simulator and start a realistic IELTS practice session.',
      external: true,
    },
    secondaryCta: {
      label: 'See full IELTS platform',
      href: '/ielts',
      description: 'Open the broader IELTS service page for the full preparation workflow.',
    },
    highlights: [
      { value: 'Full', label: 'session flow', detail: 'Practice the pressure of a complete exam, not just isolated tasks.' },
      { value: 'Fast', label: 'follow-up', detail: 'Shift into section practice after a mock reveals the weak spot.' },
      { value: 'Clear', label: 'next step', detail: 'Use the result to guide what to study next instead of repeating blindly.' },
    ],
    features: [
      {
        title: 'Mock-first preparation',
        description: 'A good mock test shows where time, comprehension, or writing decisions break down under pressure.',
      },
      {
        title: 'Exam-like timing',
        description: 'Timed work helps learners separate true understanding from untimed confidence.',
      },
      {
        title: 'Connected review path',
        description: 'After the mock, learners can continue with targeted practice and Playbook guidance.',
      },
    ],
    outcomes: [
      'Stress-test pacing before the real exam.',
      'See whether your score problems are skill-based or timing-based.',
      'Use full-test practice without losing access to section-level follow-up work.',
    ],
    faq: [
      {
        question: 'Why use IELTS mock tests online?',
        answer: 'Online mock tests help learners rehearse time pressure, section transitions, and attention management in a more realistic way than static question banks.',
      },
      {
        question: 'Should I only do full mocks?',
        answer: 'No. Full mocks are best for realism. Targeted section practice is best for fixing specific weaknesses after a mock reveals them.',
      },
      {
        question: 'Can I combine mock tests with strategy guidance?',
        answer: 'Yes. Schood connects the simulator with the IELTS Playbook so practice can lead into concrete study actions.',
      },
    ],
    relatedLinks: [
      {
        label: 'IELTS preparation overview',
        href: '/ielts',
        description: 'Explore the full IELTS platform and service overview.',
      },
      {
        label: 'IELTS writing practice',
        href: '/ielts-writing-practice',
        description: 'Use the writing-focused page when Task 1 or Task 2 is the real bottleneck.',
      },
      {
        label: 'IELTS Playbook study plans',
        href: 'https://playbook.ielts.schood.online/study-plans',
        description: 'Open study plans after mock-test results show what needs attention.',
        external: true,
      },
    ],
    appName: 'Schood IELTS Mock Test Simulator',
    applicationCategory: 'EducationalApplication',
  },
  {
    key: 'ieltsWritingPractice',
    family: 'ielts',
    category: 'intent',
    path: '/ielts-writing-practice',
    navLabel: 'IELTS writing',
    cardLabel: 'Popular search',
    cardTitle: 'IELTS writing practice',
    cardDescription: 'A search-targeted page for learners who need more structure around IELTS writing preparation.',
    seoTitle: 'IELTS Writing Practice | Task-Based Writing Preparation | Schood',
    seoDescription:
      'Practice IELTS writing with task-based preparation, realistic workflows, and connected guidance for stronger exam execution on Schood.',
    keywords: [
      'IELTS writing practice',
      'IELTS task 1 practice',
      'IELTS task 2 practice',
      'IELTS writing preparation',
      'IELTS writing workflow',
    ],
    eyebrow: 'IELTS writing preparation',
    heroTitle: 'Build writing habits that survive the exam clock.',
    heroDescription:
      'IELTS writing improves when learners practice tasks with structure, timing, and response discipline. This page helps searchers find the writing path inside Schood quickly.',
    heroBullets: [
      'Prepare around task-based writing, not generic essay drills.',
      'Keep writing work connected to wider IELTS readiness.',
      'Use strategy content alongside the simulator when structure breaks down.',
    ],
    primaryCta: {
      label: 'Open IELTS practice',
      href: 'https://ielts.schood.online',
      description: 'Open the IELTS workspace and continue with writing-oriented preparation.',
      external: true,
    },
    secondaryCta: {
      label: 'Read the writing guide',
      href: 'https://playbook.ielts.schood.online/writing-master-guide',
      description: 'Use the writing guide for scoring logic, structure, and practical study direction.',
      external: true,
    },
    highlights: [
      { value: 'Task-based', label: 'practice flow', detail: 'Stay close to the exam demands instead of generic writing exercises.' },
      { value: 'Timed', label: 'writing rhythm', detail: 'Practice planning, drafting, and developing ideas under realistic pressure.' },
      { value: 'Connected', label: 'IELTS stack', detail: 'Writing work stays connected to your full IELTS preparation path.' },
    ],
    features: [
      {
        title: 'Closer to real writing demands',
        description: 'IELTS writing needs response control, structure, and timing. This path is designed around those constraints.',
      },
      {
        title: 'Useful companion guidance',
        description: 'The writing guide explains task response, development, and scoring patterns so practice is easier to interpret.',
      },
      {
        title: 'Fits into full IELTS prep',
        description: 'Writing can stay intense without isolating you from the rest of the exam workflow.',
      },
    ],
    outcomes: [
      'Spend less time guessing what "better writing" means in IELTS terms.',
      'Keep writing practice tied to exam structure and timing.',
      'Move between simulator work and skill guidance without losing momentum.',
    ],
    faq: [
      {
        question: 'Is this only for learners who struggle with writing?',
        answer: 'No. It is useful for any learner who wants a cleaner, more task-aware way to prepare for the writing section.',
      },
      {
        question: 'Can I use Schood for both Task 1 and Task 2 improvement?',
        answer: 'Yes. The landing path is broad enough for writing preparation and pairs well with the writing-specific guide inside the Playbook.',
      },
      {
        question: 'Why connect writing practice to the broader IELTS platform?',
        answer: 'Because writing performance often interacts with time pressure, study planning, and broader exam readiness. Schood keeps those connections visible.',
      },
    ],
    relatedLinks: [
      {
        label: 'IELTS preparation overview',
        href: '/ielts',
        description: 'Return to the broader IELTS landing page.',
      },
      {
        label: 'IELTS mock tests',
        href: '/ielts-mock-test',
        description: 'Pair writing work with full mock-test exposure when you need realistic pressure.',
      },
      {
        label: 'IELTS writing master guide',
        href: 'https://playbook.ielts.schood.online/writing-master-guide',
        description: 'Read the companion writing guide on the IELTS Playbook.',
        external: true,
      },
    ],
    appName: 'Schood IELTS Writing Preparation',
    applicationCategory: 'EducationalApplication',
  },
  {
    key: 'toefl',
    family: 'toefl',
    category: 'service',
    path: '/toefl',
    navLabel: 'TOEFL',
    cardLabel: 'Core service',
    cardTitle: 'TOEFL iBT preparation platform',
    cardDescription: 'A public entry point for TOEFL learners looking for realistic online preparation inside Schood.',
    seoTitle: 'TOEFL Preparation Platform | TOEFL iBT Practice and Pacing | Schood',
    seoDescription:
      'Prepare for TOEFL iBT with realistic online practice, clearer pacing, and a focused training environment on Schood.',
    keywords: [
      'TOEFL preparation platform',
      'TOEFL iBT practice online',
      'TOEFL simulator',
      'TOEFL practice test',
      'TOEFL study platform',
    ],
    eyebrow: 'TOEFL iBT preparation',
    heroTitle: 'Prepare for TOEFL iBT in a cleaner, more exam-aware workflow.',
    heroDescription:
      'Schood gives TOEFL learners a focused online environment for realistic practice and preparation without burying them under generic course pages.',
    heroBullets: [
      'A direct path into the TOEFL simulator.',
      'Practice that stays close to test conditions and pacing demands.',
      'A platform-level route that helps searchers understand what the service is for.',
    ],
    primaryCta: {
      label: 'Open TOEFL simulator',
      href: 'https://toefl.schood.online',
      description: 'Launch the TOEFL iBT simulator.',
      external: true,
    },
    secondaryCta: {
      label: 'Explore plans',
      href: '/plans',
      description: 'Compare available plans and platform access paths.',
    },
    highlights: [
      { value: 'Online', label: 'practice access', detail: 'Learners can move from search to simulator without extra friction.' },
      { value: 'Focused', label: 'training flow', detail: 'The route is built around exam preparation, not general platform copy.' },
      { value: 'Platform', label: 'shared access', detail: 'TOEFL sits inside the wider Schood ecosystem when learners need more services.' },
    ],
    features: [
      {
        title: 'Exam-centered workflow',
        description: 'The page is designed for search intent around TOEFL preparation, not for abstract platform branding.',
      },
      {
        title: 'Cleaner discovery path',
        description: 'Searchers can understand the service quickly and move into practice without guessing what the product does.',
      },
      {
        title: 'Ready for future content',
        description: 'This structure gives TOEFL a stable public page that can expand with guides, FAQs, and comparison pages later.',
      },
    ],
    outcomes: [
      'Create a clear entry point for TOEFL search traffic.',
      'Give the simulator a public page that can earn backlinks and organic impressions.',
      'Reduce confusion between the platform brand and the TOEFL-specific product.',
    ],
    faq: [
      {
        question: 'What does this TOEFL page help with?',
        answer: 'It helps learners find the TOEFL simulator quickly, understand the product fit, and move into practice without extra friction.',
      },
      {
        question: 'Is this page separate from the TOEFL app?',
        answer: 'It is the public discovery page on the main Schood platform, while the simulator itself lives on the TOEFL service domain.',
      },
      {
        question: 'Why not send everyone straight to the app?',
        answer: 'Public landing pages are easier for search engines to understand and give learners clearer context before they enter the practice environment.',
      },
    ],
    relatedLinks: [
      {
        label: 'TOEFL practice test page',
        href: '/toefl-practice-test',
        description: 'Open the practice-test focused landing page.',
      },
      {
        label: 'Platform plans',
        href: '/plans',
        description: 'See platform pricing and access structure.',
      },
      {
        label: 'Open TOEFL simulator',
        href: 'https://toefl.schood.online',
        description: 'Go directly to the TOEFL simulator.',
        external: true,
      },
    ],
    appName: 'Schood TOEFL iBT Simulator',
    applicationCategory: 'EducationalApplication',
  },
  {
    key: 'toeflPracticeTest',
    family: 'toefl',
    category: 'intent',
    path: '/toefl-practice-test',
    navLabel: 'TOEFL practice',
    cardLabel: 'Popular search',
    cardTitle: 'TOEFL practice test online',
    cardDescription: 'A search-led page for learners specifically looking for TOEFL practice tests.',
    seoTitle: 'TOEFL Practice Test Online | TOEFL iBT Preparation | Schood',
    seoDescription:
      'Practice for TOEFL iBT online with a focused simulator path built for realistic preparation on Schood.',
    keywords: [
      'TOEFL practice test online',
      'TOEFL iBT practice test',
      'TOEFL mock test',
      'TOEFL practice exam',
      'TOEFL online preparation',
    ],
    eyebrow: 'TOEFL practice tests',
    heroTitle: 'Practice TOEFL with a route built for search intent and real preparation.',
    heroDescription:
      'This page gives TOEFL learners a clean public route from search to simulator, with language that matches how people actually search for TOEFL practice tests.',
    heroBullets: [
      'Better match for "TOEFL practice test online" search intent.',
      'Direct path into the TOEFL simulator.',
      'A stronger SEO surface than a one-page product shell alone.',
    ],
    primaryCta: {
      label: 'Start TOEFL practice',
      href: 'https://toefl.schood.online',
      description: 'Launch the TOEFL simulator.',
      external: true,
    },
    secondaryCta: {
      label: 'Open TOEFL overview',
      href: '/toefl',
      description: 'Return to the broader TOEFL platform landing page.',
    },
    highlights: [
      { value: 'Search', label: 'aligned', detail: 'The page language matches common learner intent around TOEFL practice.' },
      { value: 'Direct', label: 'entry route', detail: 'Users can move quickly from page view to practice session.' },
      { value: 'Reusable', label: 'content base', detail: 'This route can later support more FAQs, guides, and comparisons.' },
    ],
    features: [
      {
        title: 'High-intent copy',
        description: 'The wording is shaped for learners already looking for a TOEFL practice test, not broad brand discovery.',
      },
      {
        title: 'App-first CTA',
        description: 'The main action takes the learner directly into the TOEFL simulator.',
      },
      {
        title: 'Supports future content',
        description: 'This route is a good base for future TOEFL guides and conversion experiments.',
      },
    ],
    outcomes: [
      'Capture more specific TOEFL search queries.',
      'Reduce mismatch between search wording and page wording.',
      'Give the TOEFL product a dedicated intent page instead of only a brand-level page.',
    ],
    faq: [
      {
        question: 'Is this a TOEFL practice test page or the main TOEFL product page?',
        answer: 'It is the practice-test focused discovery page. From here you can open the broader TOEFL overview or go directly to the simulator.',
      },
      {
        question: 'Why make a separate TOEFL practice test page?',
        answer: 'Because many learners search for practice tests specifically, and a focused landing page can match that intent better than a generic homepage.',
      },
      {
        question: 'Does it still connect back to the platform?',
        answer: 'Yes. The page sits on the main Schood platform and links back into plans and service overviews when needed.',
      },
    ],
    relatedLinks: [
      {
        label: 'TOEFL overview',
        href: '/toefl',
        description: 'See the wider TOEFL platform landing page.',
      },
      {
        label: 'Schood plans',
        href: '/plans',
        description: 'Open plans and shared platform access information.',
      },
      {
        label: 'TOEFL simulator',
        href: 'https://toefl.schood.online',
        description: 'Go directly into TOEFL practice.',
        external: true,
      },
    ],
    appName: 'Schood TOEFL Practice Test',
    applicationCategory: 'EducationalApplication',
  },
  {
    key: 'sat',
    family: 'sat',
    category: 'service',
    path: '/sat',
    navLabel: 'SAT',
    cardLabel: 'Core service',
    cardTitle: 'Digital SAT preparation platform',
    cardDescription: 'A public SAT entry point focused on discoverability and clear product positioning.',
    seoTitle: 'Digital SAT Preparation Platform | Online SAT Practice | Schood',
    seoDescription:
      'Prepare for the Digital SAT with online practice, a focused simulator workflow, and clearer search discovery on Schood.',
    keywords: [
      'Digital SAT preparation',
      'SAT practice online',
      'SAT simulator',
      'Digital SAT practice platform',
      'online SAT prep',
    ],
    eyebrow: 'Digital SAT preparation',
    heroTitle: 'Give SAT learners a clearer route from search to practice.',
    heroDescription:
      'Schood now has a dedicated SAT landing page on the main platform so learners can understand the product, find the right entry point, and move into practice quickly.',
    heroBullets: [
      'A dedicated SAT page for search engines and learners.',
      'Direct access into the SAT simulator.',
      'A stronger public surface than relying on the product app alone.',
    ],
    primaryCta: {
      label: 'Open SAT simulator',
      href: 'https://sat.schood.online',
      description: 'Launch the Digital SAT simulator.',
      external: true,
    },
    secondaryCta: {
      label: 'Explore plans',
      href: '/plans',
      description: 'Compare access paths on the platform.',
    },
    highlights: [
      { value: 'Digital', label: 'exam focus', detail: 'The route is aligned with the Digital SAT product and audience.' },
      { value: 'Public', label: 'discovery layer', detail: 'A crawlable platform page helps search visibility and linking.' },
      { value: 'Direct', label: 'simulator path', detail: 'The main CTA leads straight into SAT practice.' },
    ],
    features: [
      {
        title: 'Cleaner SAT positioning',
        description: 'The page explains what the SAT service is and who it is for without relying only on the simulator shell.',
      },
      {
        title: 'Search-friendly structure',
        description: 'The path and copy better match common SAT queries and support richer metadata and internal linking.',
      },
      {
        title: 'Platform-wide support',
        description: 'The SAT service stays connected to platform plans and broader Schood navigation.',
      },
    ],
    outcomes: [
      'Create a clear organic search target for Digital SAT learners.',
      'Make SAT easier to understand from the main platform domain.',
      'Set up future content expansion around SAT study guides and comparisons.',
    ],
    faq: [
      {
        question: 'Why add a SAT landing page on the platform?',
        answer: 'It gives the SAT product a stronger public SEO surface and helps learners understand what they are opening before they enter the simulator.',
      },
      {
        question: 'Does the simulator still live on its own domain?',
        answer: 'Yes. The platform page is the discovery layer and the simulator remains on the SAT service domain.',
      },
      {
        question: 'Can this support more SAT content later?',
        answer: 'Yes. The route is designed so guides, FAQs, and comparison content can be added over time.',
      },
    ],
    relatedLinks: [
      {
        label: 'Digital SAT practice test page',
        href: '/digital-sat-practice-test',
        description: 'Open the higher-intent SAT practice-test page.',
      },
      {
        label: 'Platform plans',
        href: '/plans',
        description: 'View plans and shared access options.',
      },
      {
        label: 'SAT simulator',
        href: 'https://sat.schood.online',
        description: 'Launch the SAT simulator directly.',
        external: true,
      },
    ],
    appName: 'Schood Digital SAT Simulator',
    applicationCategory: 'EducationalApplication',
  },
  {
    key: 'digitalSatPracticeTest',
    family: 'sat',
    category: 'intent',
    path: '/digital-sat-practice-test',
    navLabel: 'SAT practice',
    cardLabel: 'Popular search',
    cardTitle: 'Digital SAT practice test',
    cardDescription: 'A search-targeted page designed around Digital SAT practice test intent.',
    seoTitle: 'Digital SAT Practice Test | Online SAT Practice | Schood',
    seoDescription:
      'Find Digital SAT practice test access on Schood with a direct route into online SAT practice and clearer product discovery.',
    keywords: [
      'Digital SAT practice test',
      'SAT practice test online',
      'Digital SAT mock test',
      'SAT exam simulation',
      'online SAT practice',
    ],
    eyebrow: 'Digital SAT practice tests',
    heroTitle: 'Match the search intent first, then open the simulator.',
    heroDescription:
      'Many learners search for "Digital SAT practice test" specifically. This page exists to match that wording and send them into the right SAT experience quickly.',
    heroBullets: [
      'Language tuned to Digital SAT practice-test intent.',
      'Direct link into the SAT simulator.',
      'Better internal linking back to the broader SAT page and platform plans.',
    ],
    primaryCta: {
      label: 'Start SAT practice',
      href: 'https://sat.schood.online',
      description: 'Launch the SAT simulator for Digital SAT practice.',
      external: true,
    },
    secondaryCta: {
      label: 'View SAT overview',
      href: '/sat',
      description: 'Open the broader SAT landing page.',
    },
    highlights: [
      { value: 'Intent', label: 'matched', detail: 'This page is tuned for Digital SAT practice-test queries.' },
      { value: 'Clear', label: 'conversion path', detail: 'Users can go from search to simulator without extra detours.' },
      { value: 'Strong', label: 'internal links', detail: 'The page also strengthens how SAT pages support one another.' },
    ],
    features: [
      {
        title: 'Query-specific discovery',
        description: 'Focused intent pages make it easier to build useful search entry points for real learner queries.',
      },
      {
        title: 'Direct product access',
        description: 'The simulator is still one click away, which keeps this page practical instead of decorative.',
      },
      {
        title: 'Built for expansion',
        description: 'It can later support additional SAT FAQs, comparison content, and resource links.',
      },
    ],
    outcomes: [
      'Create a better match for Digital SAT practice-test searches.',
      'Support stronger SAT crawl depth on the main domain.',
      'Improve the path from organic search into actual SAT usage.',
    ],
    faq: [
      {
        question: 'Why make a separate Digital SAT practice test page?',
        answer: 'Because many SAT users search for practice tests directly. A dedicated page can match that intent more closely than a broad product page.',
      },
      {
        question: 'Does this replace the main SAT page?',
        answer: 'No. It complements the main SAT page by covering a narrower, higher-intent search phrase.',
      },
      {
        question: 'Can I still get back to plans and the wider platform?',
        answer: 'Yes. The page links back into the SAT overview and the shared plans page.',
      },
    ],
    relatedLinks: [
      {
        label: 'SAT overview',
        href: '/sat',
        description: 'Return to the broader SAT landing page.',
      },
      {
        label: 'Platform plans',
        href: '/plans',
        description: 'See shared access and pricing options.',
      },
      {
        label: 'SAT simulator',
        href: 'https://sat.schood.online',
        description: 'Go directly into Digital SAT practice.',
        external: true,
      },
    ],
    appName: 'Schood Digital SAT Practice Test',
    applicationCategory: 'EducationalApplication',
  },
  {
    key: 'english',
    family: 'english',
    category: 'service',
    path: '/english',
    navLabel: 'English',
    cardLabel: 'Core service',
    cardTitle: 'English skills platform',
    cardDescription: 'A public hub page for Schood English services across reading, writing, listening, speaking, grammar, vocabulary, and immersion.',
    seoTitle: 'English Skills Platform | Reading, Writing, Listening, Speaking, Grammar | Schood',
    seoDescription:
      'Explore Schood English services across reading, writing, listening, speaking, grammar, vocabulary, and immersion from one public platform page.',
    keywords: [
      'English skills platform',
      'English reading practice',
      'English writing practice',
      'English listening practice',
      'English grammar practice',
      'English learning platform',
    ],
    eyebrow: 'English skills ecosystem',
    heroTitle: 'Build every English skill without losing sight of what comes next.',
    heroDescription:
      'Practice reading, listening, writing, speaking, grammar, vocabulary, and real-world use as one connected learning path. Schood uses your work in each skill to guide the next one.',
    heroBullets: [
      'Choose the skill that matters today without losing your shared progress.',
      'Turn mistakes into focused review and a clear next activity.',
      'Move saved vocabulary and corrected patterns into real English use.',
    ],
    primaryCta: {
      label: 'Open English hub',
      href: 'https://english.schood.online',
      description: 'Open the English hub.',
      external: true,
    },
    secondaryCta: {
      label: 'Explore plans',
      href: '/plans',
      description: 'See platform plans and shared access.',
    },
    highlights: [
      { value: '7', label: 'connected skills', detail: 'Reading, Writing, Listening, Speaking, Grammar, Vocabulary, and Immersion.' },
      { value: '1', label: 'shared plan', detail: 'Your activity, review, and progress come together in the English hub.' },
      { value: 'Cross-skill', label: 'practice', detail: 'What you learn in one skill becomes useful work in another.' },
    ],
    features: [
      {
        title: 'Know what to practice today',
        description: 'Your hub brings together current weaknesses, due review, and the next useful activity instead of leaving you to choose blindly.',
      },
      {
        title: 'Turn mistakes into a recovery route',
        description: 'A listening miss can become vocabulary review, a repeated writing error can become grammar repair, and both can return to real use.',
      },
      {
        title: 'Remember progress across skills',
        description: 'One English profile keeps your completed work, saved vocabulary, review pressure, and recommendations connected.',
      },
    ],
    outcomes: [
      'Start with the skill that matches your goal today.',
      'Receive focused correction and a useful retry instead of a score alone.',
      'Carry stronger language into speaking, writing, and real-world missions.',
    ],
    faq: [
      {
        question: 'What is included in Schood English?',
        answer: 'The English ecosystem spans reading, writing, listening, speaking, grammar, vocabulary, and immersion, with the English hub acting as the main connector.',
      },
      {
        question: 'Why put English on the main platform too?',
        answer: 'It helps you see how the seven skills work together, choose a starting point, and understand how completed work shapes review and recommendations.',
      },
      {
        question: 'Does this replace the English hub?',
        answer: 'No. This page helps you choose a starting point; the English hub holds your daily plan, weaknesses, review, and weekly progress after sign-in.',
      },
    ],
    relatedLinks: [
      {
        label: 'English hub',
        href: 'https://english.schood.online',
        description: 'Open the main English hub.',
        external: true,
      },
      {
        label: 'English reading service',
        href: 'https://reading.english.schood.online',
        description: 'Go directly to English Reading.',
        external: true,
      },
      {
        label: 'English writing service',
        href: 'https://writing.english.schood.online',
        description: 'Go directly to English Writing.',
        external: true,
      },
    ],
    appName: 'Schood English Hub',
    applicationCategory: 'EducationalApplication',
  },
];

export const discoveryPages = pages;

export const discoveryPagesByKey = pages.reduce<Record<DiscoveryPageKey, DiscoveryPageConfig>>((acc, page) => {
  acc[page.key] = page;
  return acc;
}, {} as Record<DiscoveryPageKey, DiscoveryPageConfig>);

export const featuredDiscoveryPages = pages.filter((page) => page.category === 'service');

export const discoveryPageCards = pages.map((page) => ({
  key: page.key,
  category: page.category,
  label: page.cardLabel,
  title: page.cardTitle,
  description: page.cardDescription,
  path: page.path,
}));

export const getDiscoveryPageForProductSlug = (slug: string): string | null => {
  const normalized = slug.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.startsWith('ielts')) return '/ielts';
  if (normalized.startsWith('toefl')) return '/toefl';
  if (normalized.startsWith('sat')) return '/sat';
  if (normalized.startsWith('english-')) return '/english';
  return null;
};
