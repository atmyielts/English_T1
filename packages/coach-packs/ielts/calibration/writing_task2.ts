import type { CalibrationRun, CalibrationSample } from '../../src/types.ts';

// Writing Task 2 calibration set: ten original essays from band 4 to band 8 with
// author-rated reference bands and three recorded assessor runs each. Prompts and
// essays are written for Schood practice; none is taken from a published test.

const END = ' Give reasons for your answer and include any relevant examples from your own knowledge or experience. Write at least 250 words.';
const essay = (...paragraphs: string[]) => paragraphs.join('\n\n');

const samples: CalibrationSample[] = [
  {
    id: 'w2.b4.education-online',
    task: 'Some people think that in the future students will study only online, and schools with classrooms and teachers will no longer be needed. To what extent do you agree or disagree?' + END,
    response: essay(
      'Nowadays it is a hot topic that online education. Some people think that in future students will study only in internet and schools will not be needed. I am agree with this opinion partly but also I am not agree.',
      'Firstly, online study is very comfortable. Student can study in home and he not need to go to school by bus every day. Also online lessons is cheap and many informations is in internet. For example my brother study English in online and he is happy. So online is good for students.',
      'Secondly, school is important for children. In school children have friends and they play together. Teacher can explain more better than computer because teacher see the student face. If student not understand, teacher help him. Also some families have not computer or internet is very slow in village. So this is big problem for them.',
      'In conclusion, I think online education is good and bad. In the future schools will be but also online lessons will be more. Every people must choose what is better for him. Government must to give internet for all people.',
    ),
    reference: { task_response: 4, coherence_cohesion: 4, lexical_resource: 4, grammatical_range_accuracy: 4 },
    rationale: 'About 190 words, well under 250, so Task Response cannot go above 4: the position ("agree partly but also not agree") is unclear and both ideas are a sentence or two of general statements. Basic vocabulary repeated ("online", "school"), and frequent agreement and verb-form errors ("online lessons is cheap", "he not need") that sometimes strain the reader.',
  },
  {
    id: 'w2.b4.city-traffic',
    task: 'Traffic congestion is becoming a serious problem in many cities around the world. What are the main causes of this problem, and what measures could be taken to reduce it?' + END,
    response: essay(
      'Nowadays traffic jam is very big problem in many cities of the world. In this essay I will discuss about the causes of this problem and give some solutions.',
      'To begin with, there are two main causes of traffic. The first cause is that people buy too many cars. In my city ten years ago was not so many cars but now every family have two or three car. The second cause is roads are very narrow and old, they was built many years ago when there was less cars. Also public transport is not comfortable so people prefer drive own car.',
      'On the other hand, there are some solutions for this problem. First of all, government should build more wide roads and new metro lines. If metro will be more, people will use it and leave car in home. Secondly, the price of petrol can be more expensive, then people drive less. Moreover, people can go to work by bicycle, it is good for health also.',
      'In conclusion, traffic is serious problem which have many causes, for example too many cars and old roads. I think government and people together must solve this problem, because if not, in future traffic will be more worse and people will be late every day.',
    ),
    reference: { task_response: 4, coherence_cohesion: 5, lexical_resource: 4, grammatical_range_accuracy: 4 },
    rationale: 'Both parts are attempted but under 250 words, and the solutions are listed without explanation (the petrol idea is unclear), so Task Response is 4. Paragraphing and sequencing are clear enough for Coherence 5 despite the misused "On the other hand"; vocabulary is basic with errors ("more wide", "more worse") and most sentences contain grammar mistakes.',
  },
  {
    id: 'w2.b5.work-remote',
    task: 'In many countries, more and more companies now allow their employees to work from home rather than travel to an office every day. Do the advantages of this development outweigh the disadvantages?' + END,
    response: essay(
      'In recent years, many companies let their workers to work from home. This trend has both advantages and disadvantages, and in this essay I will discuss them and give my opinion.',
      'On the one hand, working from home has a lot of benefits. The main advantage is that employees save time and money, because they do not need to travel to office every morning. For example, my uncle spent almost two hours in the bus every day, but now he works at home and he has more time for his family and hobbies. In addition, people can organise their day how they want, so they feel less stress and work more productive.',
      'On the other hand, there are also some disadvantages. Firstly, when people work at home they can not communicate with their colleagues face to face. This can make them feel lonely and the team work become weak. Secondly, at home there are many distractions, such as children, television and housework, so some workers can not concentrate on their tasks. Also not everyone has a quiet room or good internet connection, it is a big problem for young people who live with parents.',
      'In conclusion, working from home has advantages like saving time and less stress, but it has disadvantages like loneliness and distractions. In my opinion the advantages is more than disadvantages, but companies should give workers a choice, because every person is different.',
    ),
    reference: { task_response: 5, coherence_cohesion: 5, lexical_resource: 5, grammatical_range_accuracy: 5 },
    rationale: 'The question asks whether advantages outweigh disadvantages, but the essay lists both sides and gives its answer only in the last paragraph, without weighing them; it is also just under 250 words. Mechanical linking (On the one hand / On the other hand / Firstly / Secondly), adequate but plain vocabulary with word-form slips ("work more productive"), and regular errors in otherwise simple sentences.',
  },
  {
    id: 'w2.b5.health-fastfood',
    task: 'Some people think governments should put a special tax on fast food and sugary drinks to improve public health. Others believe that what people eat is a personal choice and governments should not interfere. Discuss both views and give your own opinion.' + END,
    response: essay(
      'Nowadays, the health of people is becoming worse in many countries and fast food is one of the main reason of this. Some people think that government must increase the price of fast food by taxes, while others believe that food is a personal choice. This essay will discuss both of these views.',
      'To begin with, there are several reasons why a special tax on fast food could be useful. Firstly, fast food contains a lot of fat, sugar and salt, which cause obesity and heart disease. If burgers and fizzy drinks become more expensive, people will buy them less often, especially young people who do not have much money. Secondly, the money from this tax can be spent for hospitals and for sport centres, so the whole society will receive benefit. For example, in some countries there is already a tax on sugary drinks and people started to drink them less. Moreover, children copy their parents, so if parents eat healthy, children will also eat healthy.',
      'On the other hand, some people say that eating is a personal choice. Everyone is adult and can decide what to eat. Also, fast food is cheap and quick, and many workers have no time to cook at home.',
      'In conclusion, both views have their own advantages and disadvantages. Fast food is very harmful for health, but people also have right to choose. I think that government should think about this problem carefully and find the best solution for everybody, because health of the nation is the most important thing.',
    ),
    reference: { task_response: 5, coherence_cohesion: 6, lexical_resource: 5, grammatical_range_accuracy: 5 },
    rationale: 'The tax view is developed with reasons and an example, but the opposing view gets three short, unexplained sentences and the opinion never says whether the tax is right, so Task Response stays at 5. Organisation is clear with a logical paragraph plan (Coherence 6), while vocabulary is limited to familiar words with slips ("receive benefit", "eat healthy") and errors recur in agreement, articles and prepositions.',
  },
  {
    id: 'w2.b6.technology-children',
    task: 'Many children today spend several hours a day using smartphones, tablets and computers. Why is this happening? Is it a positive or negative development?' + END,
    response: essay(
      'These days it is common to see young children using smartphones and tablets for many hours every day. This essay will explain why this is happening and argue that, overall, it is a negative development.',
      'There are two main reasons for this trend. The first one is that parents are busier than in the past. Many mothers and fathers work long hours, so they give a device to their child to keep him quiet while they work. The second reason is that schools now use technology for learning. Teachers often give homework that must be done online, so children become used to screens from an early age.',
      'Although technology has some benefits, I believe that spending so much time on devices is harmful for children. Firstly, it affects their physical health. Children who sit in front of a screen for hours do not move enough, and this can lead to weight problems and poor eyesight. Secondly, it can damage their social skills. Instead of playing outside with friends, many children prefer to chat online or play games alone, so they have less practise in real communication. For instance, my younger cousin finds it difficult to talk to new people because he spends most of his free time on his tablet.',
      'However, it should be mentioned that some educational programs can help children to learn languages in an interesting way. But this is only true when parents control what their children watch and how long.',
      'In conclusion, children use devices a lot because parents are busy and schools depend on technology. In my view, this is mostly a negative development, and parents should set clear limits on screen time.',
    ),
    reference: { task_response: 6, coherence_cohesion: 6, lexical_resource: 6, grammatical_range_accuracy: 6 },
    rationale: 'Both questions are answered with a clear position, but the reasons are explained only briefly and the benefits paragraph is thin, which keeps Task Response at 6 rather than 7. Linking is clear but formulaic (Firstly / Secondly / However), vocabulary is adequate with a few less common items ("set clear limits", "from an early age") and a spelling slip ("practise" as a noun), and complex sentences are mostly accurate.',
  },
  {
    id: 'w2.b6.environment-individual',
    task: 'Some people believe that protecting the environment is mainly the job of governments and large companies, and that individuals can do very little to help. To what extent do you agree or disagree?' + END,
    response: essay(
      'Today environmental problems such as air pollution and climate change are becoming more serious every year. Some people argue that only governments and big companies can solve these problems and ordinary people can do very little. I partly agree with this statement, because although governments have more power, individuals also can make a difference.',
      'On the one hand, it is true that governments and companies has the biggest influence on the environment. Factories produce the most of pollution, and only the government can make strict laws to control them. For example, if a government introduce heavy fines for companies which throw waste into rivers, the companies will be forced to change their behaviour. Also, governments can invest money in renewable energy like solar and wind power, which single person cannot do. Without this kind of big decisions, the situation will not improve.',
      'On the other hand, I believe that individuals also play important role. When millions of people change their daily habits, the result is huge. For instance, if every family sort their rubbish and recycle plastic, the amount of waste in landfills would decrease significantly. Moreover, people can use public transport or bicycles instead of cars, which reduce air pollution in cities. In addition, consumers have power to choose products, so if they stop buying from companies that damages nature, these companies will have to become more green.',
      'In conclusion, I agree that governments and large companies have the main responsibility for protecting environment, but I do not agree that individuals can do very little. In my opinion, both sides should work together, because the problem is too big for one of them to solve alone.',
    ),
    reference: { task_response: 6, coherence_cohesion: 6, lexical_resource: 6, grammatical_range_accuracy: 5 },
    rationale: 'A clear partly-agree position with relevant, supported ideas on both sides, though the examples stay general (Task Response 6); organisation is logical with some mechanical linkers. Vocabulary is adequate with some precise items ("heavy fines", "renewable energy", "landfills"), but agreement and article errors are frequent ("companies has", "every family sort", "play important role"), which holds grammar at 5 despite the range attempted.',
  },
  {
    id: 'w2.b7.crime-prison',
    task: 'Some people believe that young people who commit minor crimes, such as shoplifting or damaging property, should be sent to prison. Others think they should be made to do unpaid work in their local community instead. Discuss both views and give your own opinion.' + END,
    response: essay(
      'How a society treats teenagers who break the law for the first time says a great deal about what it expects justice to achieve. While some argue that even minor offences committed by young people deserve a prison sentence, I believe that supervised community work is usually the more effective response.',
      'Those who favour prison make two main points. First, they claim that a custodial sentence sends a clear message: if young people see that shoplifting or vandalism leads to time behind bars, they may think twice before offending. Second, prison protects the public, at least temporarily, because an offender who is locked up cannot cause further harm in the neighbourhood. For victims, too, a firm punishment can feel like a fair recognition of what they have suffered.',
      'However, I find the case for community service more convincing. Putting a sixteen-year-old in prison for a minor theft often places him alongside far more experienced criminals, and it is there that he may learn the wrong kind of skills. By contrast, an offender who spends weekends repairing a damaged park or helping in a care home has to face the consequences of his actions directly. This kind of sentence also allows young people to continue their education, which is essential if they are to find legal work later. In addition, community schemes cost the state considerably less than to keep someone in custody.',
      'In conclusion, although prison may seem a stronger deterrent, I am convinced that for young people convicted of minor crimes, unpaid work in the community is the better choice, since it punishes, repairs damage and reduces the chance of reoffending at the same time. Prison should be kept for serious and repeated offences.',
    ),
    reference: { task_response: 7, coherence_cohesion: 7, lexical_resource: 7, grammatical_range_accuracy: 7 },
    rationale: 'Both views are presented fairly and the opinion is clear from the introduction to the conclusion; the community-service side is well extended, though the prison side is less developed and the cost point is only asserted, which separates it from an 8. Precise topic vocabulary ("custodial sentence", "deterrent", "reoffending") and a range of complex structures with only occasional slips ("cost the state considerably less than to keep").',
  },
  {
    id: 'w2.b7.globalisation-culture',
    task: 'Because of globalisation, the same shops, restaurants and films can now be found in almost every country. Some people believe this is a serious threat to local cultures. To what extent do you agree or disagree?' + END,
    response: essay(
      'Walking through the centre of almost any large city today, a visitor will see the same coffee chains, the same clothing brands and the same blockbuster films advertised on billboards. Many people fear that this uniformity is gradually wiping out local traditions. I agree with this view to some extent, although the picture is more complicated than it first appears.',
      'There is little doubt that global brands put pressure on local culture. When international fast-food restaurants open on every corner, traditional family-run cafés often struggle to compete, and with them disappear recipes and ways of eating that have been passed down for generations. Similarly, young people who grow up watching mainly foreign films and series may come to see their own language and customs as old-fashioned. In my country, for instance, fewer teenagers can perform traditional songs than their grandparents could. Such a loss is hard to reverse once a whole generation has stopped practising these traditions.',
      'On the other hand, globalisation has brought considerable economic benefits. International companies create thousands of jobs, pay taxes and introduce modern management methods, which help developing countries to grow faster. Many young graduates prefer to work for a multinational firm because the salaries are higher and the career opportunities are wider, and they often gain skills they could not learn at a local company. Without foreign investment, many cities would suffer from much higher unemployment.',
      'Furthermore, culture is not something fixed. Local communities often adapt global products to their own tastes, and the internet allows small artists to share traditional music with audiences worldwide.',
      'In conclusion, globalisation clearly changes local cultures, and in some cases it threatens them, but it also brings advantages. Whether it is mainly positive or negative depends on how each country responds to it.',
    ),
    reference: { task_response: 6, coherence_cohesion: 7, lexical_resource: 7, grammatical_range_accuracy: 7 },
    rationale: 'Well written, but the third paragraph argues about jobs and investment rather than culture, the cultural counter-argument gets only two sentences, and the conclusion slides into "it depends", so the position on the actual question is not consistently developed: Task Response 6. Cohesion, vocabulary ("uniformity", "wiping out local traditions", "passed down for generations") and grammar are at a solid 7.',
  },
  {
    id: 'w2.b8.media-news',
    task: 'A growing number of people now get most of their news from social media rather than from newspapers, radio or television. Why is this happening? What effects could this change have on how well informed people are?' + END,
    response: essay(
      'Over the past decade, the morning newspaper and the evening news bulletin have been steadily replaced, for many people, by a stream of headlines on their phones. This shift has been driven largely by convenience and cost, and while it has made news more accessible than ever, I would argue that it has left the public less reliably informed.',
      'The reasons for the change are not hard to identify. Social media platforms deliver news instantly and free of charge, wherever the reader happens to be, whereas a printed paper is out of date within hours and increasingly requires a subscription. Just as importantly, these platforms are built around the individual: algorithms learn what each user clicks on and supply more of the same, so the news feels personally relevant in a way a general broadcast rarely does. For younger audiences in particular, who already spend much of their day on these apps, checking the news there requires no extra effort at all.',
      'The consequences, however, are mixed at best. On the positive side, ordinary citizens can now report events as they unfold, and stories that traditional outlets might ignore can reach to millions within minutes. Yet the same speed that makes social media attractive also makes it a poor filter. Rumours and deliberately misleading posts often spread faster than corrections, and because many users read only the headline before sharing, a false claim can shape opinion long before it is challenged. Moreover, personalised feeds tend to confirm what people already believe, which narrows their exposure to opposing arguments.',
      'In conclusion, people have turned to social media for news because it is immediate, free and tailored to them. Although this has opened up the reporting of events, it has also weakened the shared factual ground on which public debate depends, and readers would be wise to check important stories against established sources.',
    ),
    reference: { task_response: 8, coherence_cohesion: 8, lexical_resource: 8, grammatical_range_accuracy: 8 },
    rationale: 'Both questions are answered fully with a clear, nuanced position, and each cause and effect is explained rather than listed; the effects could carry one more concrete example, which keeps it from a 9. Paragraphs progress logically with natural referencing, vocabulary is precise and idiomatic ("as they unfold", "a poor filter", "shared factual ground"), and grammar is flexible with a single slip ("reach to millions").',
  },
  {
    id: 'w2.b8.education-university',
    task: 'Some people think universities should require every student to spend a year working in a company or organisation before they graduate. Others believe students should use all their time at university for academic study. Discuss both views and give your own opinion.' + END,
    response: essay(
      'Whether undergraduates should spend part of their degree in the workplace is a question that divides educators. Some argue that a compulsory year of work placement should be part of every course, while others insist that university time is too valuable to be spent outside the lecture hall. Although both positions have merit, I believe a placement year benefits most students, provided it is well organised and properly supervised.',
      'Supporters of a purely academic degree point out that deep theoretical knowledge takes time to build. A medical or law student, for instance, already has a heavy programme to complete, and adding twelve months in an office could delay graduation and increase the cost of study. There is also a risk that placements become cheap labour: students may spend their year making photocopies rather than learning anything meaningful, which would be a waste of time for both the student and the university.',
      'On the other hand, the case for work experience is strong. Employers frequently complain that graduates have excellent marks but little idea of how a real organisation functions, how to meet deadlines or how to work in a team with people of different ages. A year in a company gives students exactly this kind of experience, and it often helps them to do a more informed choice about their career. I have seen this first-hand: a friend who studied chemistry discovered during her placement in a food-testing laboratory that she enjoyed quality control far more than research, and she was offered a job there before she had even finished her final exams.',
      'In conclusion, while an academic focus has clear advantages in some disciplines, I am convinced that a placement year makes most graduates more employable and more confident. Universities should therefore offer it widely, but they must work closely with employers so that students gain real responsibility rather than routine office tasks.',
    ),
    reference: { task_response: 8, coherence_cohesion: 8, lexical_resource: 7, grammatical_range_accuracy: 8 },
    rationale: 'Both views are developed with relevant, specific support and the conditional opinion is consistent throughout, with a vivid first-hand example (Task Response 8). Vocabulary is wide but noticeably repetitive around "experience" and "work", with a collocation slip ("do a more informed choice"), so Lexical Resource is 7 while grammar is flexible and almost error-free.',
  },
];

// Three recorded assessor runs per sample. Most scores match the reference; the rest
// are one band off, never in both directions for the same criterion. A few quotes are
// paraphrases on purpose, so the evidence check is exercised.
const runs: Record<string, CalibrationRun[]> = {
  'w2.b4.education-online': [
    { criteria: {
      task_response: { score: 4, evidence: ['I am agree with this opinion partly but also I am not agree', 'For example my brother study English in online and he is happy'] },
      coherence_cohesion: { score: 4, evidence: ['Nowadays it is a hot topic that online education', 'Firstly, online study is very comfortable'] },
      lexical_resource: { score: 4, evidence: ['many informations is in internet', 'Teacher can explain more better than computer'] },
      grammatical_range_accuracy: { score: 4, evidence: ['he not need to go to school by bus every day', 'If student not understand, teacher help him'] },
    } },
    { criteria: {
      task_response: { score: 5, evidence: ['I partly agree and partly disagree with this opinion', 'I think online education is good and bad'] },
      coherence_cohesion: { score: 4, evidence: ['Secondly, school is important for children', 'In conclusion, I think online education is good and bad'] },
      lexical_resource: { score: 4, evidence: ['online study is very comfortable', 'Every people must choose what is better for him'] },
      grammatical_range_accuracy: { score: 4, evidence: ['online lessons is cheap', 'some families have not computer'] },
    } },
    { criteria: {
      task_response: { score: 4, evidence: ['I think online education is good and bad', 'Government must to give internet for all people'] },
      coherence_cohesion: { score: 4, evidence: ['So online is good for students', 'Secondly, school is important for children'] },
      lexical_resource: { score: 5, evidence: ['Teacher can explain more better than computer'] },
      grammatical_range_accuracy: { score: 4, evidence: ['In the future schools will be but also online lessons will be more', 'he not need to go to school by bus every day'] },
    } },
  ],
  'w2.b4.city-traffic': [
    { criteria: {
      task_response: { score: 4, evidence: ['the price of petrol can be more expensive, then people drive less', 'The first cause is that people buy too many cars'] },
      coherence_cohesion: { score: 5, evidence: ['To begin with, there are two main causes of traffic', 'On the other hand, there are some solutions for this problem'] },
      lexical_resource: { score: 4, evidence: ['traffic jam is very big problem', 'build more wide roads'] },
      grammatical_range_accuracy: { score: 5, evidence: ['every family have two or three car', 'If metro will be more'] },
    } },
    { criteria: {
      task_response: { score: 4, evidence: ['government should build more wide roads and new metro lines', 'people can go to work by bicycle, it is good for health also'] },
      coherence_cohesion: { score: 4, evidence: ['On the other hand, there are some solutions for this problem', 'In this essay I will discuss about the causes of this problem'] },
      lexical_resource: { score: 4, evidence: ['traffic will be more worse', 'people prefer drive own car'] },
      grammatical_range_accuracy: { score: 4, evidence: ['they was built many years ago when there was less cars', 'traffic is serious problem which have many causes'] },
    } },
    { criteria: {
      task_response: { score: 5, evidence: ['The first cause is that people buy too many cars', 'the price of petrol can be more expensive, then people drive less'] },
      coherence_cohesion: { score: 5, evidence: ['First of all, government should build', 'To begin with, there are two main causes of traffic'] },
      lexical_resource: { score: 4, evidence: ['build more wide roads', 'traffic will be more worse'] },
      grammatical_range_accuracy: { score: 4, evidence: ['every family have two or three car', 'they was built many years ago when there was less cars'] },
    } },
  ],
  'w2.b5.work-remote': [
    { criteria: {
      task_response: { score: 5, evidence: ['In my opinion the advantages is more than disadvantages', 'my uncle spent almost two hours in the bus every day'] },
      coherence_cohesion: { score: 4, evidence: ['On the one hand, working from home has a lot of benefits', 'On the other hand, there are also some disadvantages'] },
      lexical_resource: { score: 5, evidence: ['employees work more productively at home', 'communicate with their colleagues face to face'] },
      grammatical_range_accuracy: { score: 5, evidence: ['many companies let their workers to work from home', 'the advantages is more than disadvantages'] },
    } },
    { criteria: {
      task_response: { score: 6, evidence: ['in this essay I will discuss them and give my opinion', 'companies should give workers a choice'] },
      coherence_cohesion: { score: 5, evidence: ['Firstly, when people work at home', 'Secondly, at home there are many distractions'] },
      lexical_resource: { score: 5, evidence: ['work more productive', 'the team work become weak'] },
      grammatical_range_accuracy: { score: 5, evidence: ['the team work become weak', 'it is a big problem for young people who live with parents'] },
    } },
    { criteria: {
      task_response: { score: 5, evidence: ['In my opinion the advantages is more than disadvantages', 'in this essay I will discuss them and give my opinion'] },
      coherence_cohesion: { score: 5, evidence: ['On the other hand, there are also some disadvantages', 'Secondly, at home there are many distractions'] },
      lexical_resource: { score: 6, evidence: ['many distractions, such as children, television and housework', 'communicate with their colleagues face to face'] },
      grammatical_range_accuracy: { score: 5, evidence: ['many companies let their workers to work from home', 'the team work become weak'] },
    } },
  ],
  'w2.b5.health-fastfood': [
    { criteria: {
      task_response: { score: 4, evidence: ['Everyone is adult and can decide what to eat', 'both views have their own advantages and disadvantages'] },
      coherence_cohesion: { score: 6, evidence: ['To begin with, there are several reasons why a special tax on fast food could be useful', 'This essay will discuss both of these views'] },
      lexical_resource: { score: 5, evidence: ['the whole society will receive benefit', 'if parents eat healthy'] },
      grammatical_range_accuracy: { score: 5, evidence: ['one of the main reason of this', 'can be spent for hospitals and for sport centres'] },
    } },
    { criteria: {
      task_response: { score: 5, evidence: ['in some countries there is already a tax on sugary drinks and people started to drink them less', 'government should think about this problem carefully and find the best solution for everybody'] },
      coherence_cohesion: { score: 5, evidence: ['On the other hand, some people say that eating is a personal choice', 'Moreover, children copy their parents'] },
      lexical_resource: { score: 5, evidence: ['which cause obesity and heart disease', 'Fast food is very harmful for health'] },
      grammatical_range_accuracy: { score: 5, evidence: ['Everyone is adult', 'people also have right to choose'] },
    } },
    { criteria: {
      task_response: { score: 5, evidence: ['both views have their own advantages and disadvantages', 'Everyone is adult and can decide what to eat'] },
      coherence_cohesion: { score: 6, evidence: ['Firstly, I will discuss the first view', 'This essay will discuss both of these views'] },
      lexical_resource: { score: 5, evidence: ['the whole society will receive benefit', 'Fast food is very harmful for health'] },
      grammatical_range_accuracy: { score: 6, evidence: ['one of the main reason of this', 'If burgers and fizzy drinks become more expensive, people will buy them less often'] },
    } },
  ],
  'w2.b6.technology-children': [
    { criteria: {
      task_response: { score: 7, evidence: ['argue that, overall, it is a negative development', 'my younger cousin finds it difficult to talk to new people'] },
      coherence_cohesion: { score: 6, evidence: ['There are two main reasons for this trend', 'Firstly, it affects their physical health'] },
      lexical_resource: { score: 6, evidence: ['set clear limits on screen time', 'less practise in real communication'] },
      grammatical_range_accuracy: { score: 6, evidence: ['Children who sit in front of a screen for hours do not move enough', 'when parents control what their children watch and how long'] },
    } },
    { criteria: {
      task_response: { score: 6, evidence: ['The first one is that parents are busier than in the past', 'Teachers often give homework that must be done online'] },
      coherence_cohesion: { score: 6, evidence: ['Secondly, it can damage their social skills', 'However, it should be mentioned that'] },
      lexical_resource: { score: 7, evidence: ['from an early age', 'weight problems and poor eyesight', 'set clear limits on screen time'] },
      grammatical_range_accuracy: { score: 6, evidence: ['parents control what and how long their children watch', 'Although technology has some benefits, I believe that spending so much time on devices is harmful for children'] },
    } },
    { criteria: {
      task_response: { score: 6, evidence: ['argue that, overall, it is a negative development', 'The first one is that parents are busier than in the past'] },
      coherence_cohesion: { score: 6, evidence: ['There are two main reasons for this trend', 'However, it should be mentioned that'] },
      lexical_resource: { score: 6, evidence: ['less practise in real communication', 'from an early age'] },
      grammatical_range_accuracy: { score: 5, evidence: ['when parents control what their children watch and how long', 'Teachers often give homework that must be done online'] },
    } },
  ],
  'w2.b6.environment-individual': [
    { criteria: {
      task_response: { score: 6, evidence: ['I partly agree with this statement', 'individuals also can make a difference'] },
      coherence_cohesion: { score: 6, evidence: ['On the one hand, it is true that', 'On the other hand, I believe that individuals also play important role'] },
      lexical_resource: { score: 6, evidence: ['heavy fines', 'the amount of waste in landfills would decrease significantly'] },
      grammatical_range_accuracy: { score: 6, evidence: ['governments and companies has the biggest influence', 'if every family sort their rubbish'] },
    } },
    { criteria: {
      task_response: { score: 6, evidence: ['When millions of people change their daily habits, the result is huge', 'I do not agree that individuals can do very little'] },
      coherence_cohesion: { score: 6, evidence: ['Moreover, people can use public transport', 'In addition, consumers have power to choose products'] },
      lexical_resource: { score: 6, evidence: ['invest money in renewable energy', 'become more green'] },
      grammatical_range_accuracy: { score: 5, evidence: ['if a government introduce heavy fines', 'companies that damages nature', 'Factories produce the most of pollution'] },
    } },
    { criteria: {
      task_response: { score: 6, evidence: ['I partly agree with this statement', 'I do not agree that individuals can do very little'] },
      coherence_cohesion: { score: 5, evidence: ['On the one hand, it is true that', 'In addition, consumers have power to choose products'] },
      lexical_resource: { score: 6, evidence: ['heavy fines', 'invest money in renewable energy'] },
      grammatical_range_accuracy: { score: 6, evidence: ['governments and companies has the biggest influence', 'companies that damages nature'] },
    } },
  ],
  'w2.b7.crime-prison': [
    { criteria: {
      task_response: { score: 7, evidence: ['I believe that supervised community work is usually the more effective response', 'unpaid work in the community is the better choice'] },
      coherence_cohesion: { score: 7, evidence: ['On the other hand, community service is a more convincing option', 'By contrast, an offender who spends weekends repairing a damaged park'] },
      lexical_resource: { score: 7, evidence: ['a custodial sentence sends a clear message', 'reduces the chance of reoffending'] },
      grammatical_range_accuracy: { score: 7, evidence: ['it is there that he may learn the wrong kind of skills', 'cost the state considerably less than to keep someone in custody'] },
    } },
    { criteria: {
      task_response: { score: 7, evidence: ['Those who favour prison make two main points', 'I believe that supervised community work is usually the more effective response'] },
      coherence_cohesion: { score: 7, evidence: ['However, I find the case for community service more convincing', 'This kind of sentence also allows young people to continue their education'] },
      lexical_resource: { score: 6, evidence: ['they may think twice before offending', 'time behind bars'] },
      grammatical_range_accuracy: { score: 7, evidence: ['which is essential if they are to find legal work later', 'an offender who is locked up cannot cause further harm'] },
    } },
    { criteria: {
      task_response: { score: 6, evidence: ['community schemes cost the state considerably less', 'Those who favour prison make two main points'] },
      coherence_cohesion: { score: 7, evidence: ['Those who favour prison make two main points', 'However, I find the case for community service more convincing'] },
      lexical_resource: { score: 7, evidence: ['a stronger deterrent', 'a custodial sentence sends a clear message'] },
      grammatical_range_accuracy: { score: 7, evidence: ['cost the state considerably less than to keep someone in custody', 'it is there that he may learn the wrong kind of skills'] },
    } },
  ],
  'w2.b7.globalisation-culture': [
    { criteria: {
      task_response: { score: 7, evidence: ['I agree with this view to some extent', 'Whether it is mainly positive or negative depends on how each country responds to it'] },
      coherence_cohesion: { score: 7, evidence: ['There is little doubt that global brands put pressure on local culture', 'Such a loss is hard to reverse'] },
      lexical_resource: { score: 7, evidence: ['this uniformity is gradually wiping out local traditions', 'passed down for generations'] },
      grammatical_range_accuracy: { score: 7, evidence: ['with them disappear recipes and ways of eating that have been passed down for generations', 'fewer teenagers can perform traditional songs than their grandparents could'] },
    } },
    { criteria: {
      task_response: { score: 6, evidence: ['globalisation has brought considerable economic benefits', 'International companies create thousands of jobs'] },
      coherence_cohesion: { score: 7, evidence: ['Similarly, young people who grow up watching mainly foreign films', 'Furthermore, culture is not something fixed'] },
      lexical_resource: { score: 7, evidence: ['struggle to compete', 'see their own language and customs as old-fashioned'] },
      grammatical_range_accuracy: { score: 6, evidence: ['Walking through the centre of almost any large city today, a visitor will see', 'Without foreign investment, many cities would suffer from much higher unemployment'] },
    } },
    { criteria: {
      task_response: { score: 6, evidence: ['Whether it is mainly positive or negative depends on how each country responds to it', 'globalisation has brought considerable economic benefits'] },
      coherence_cohesion: { score: 6, evidence: ['There is little doubt that global brands put pressure on local culture', 'Furthermore, culture is not something fixed'] },
      lexical_resource: { score: 7, evidence: ['slowly destroying local traditions', 'struggle to compete'] },
      grammatical_range_accuracy: { score: 7, evidence: ['with them disappear recipes and ways of eating that have been passed down for generations', 'Without foreign investment, many cities would suffer from much higher unemployment'] },
    } },
  ],
  'w2.b8.media-news': [
    { criteria: {
      task_response: { score: 8, evidence: ['I would argue that it has left the public less reliably informed', 'algorithms learn what each user clicks on and supply more of the same'] },
      coherence_cohesion: { score: 8, evidence: ['The reasons for the change are not hard to identify', 'The consequences, however, are mixed at best'] },
      lexical_resource: { score: 8, evidence: ['report events as they unfold', 'the shared factual ground on which public debate depends'] },
      grammatical_range_accuracy: { score: 8, evidence: ['because many users read only the headline before sharing, a false claim can shape opinion long before it is challenged', 'can reach to millions within minutes'] },
    } },
    { criteria: {
      task_response: { score: 8, evidence: ['a false claim can shape opinion long before it is challenged', 'personalised feeds tend to confirm what people already believe'] },
      coherence_cohesion: { score: 8, evidence: ['Just as importantly, these platforms are built around the individual', 'Yet the same speed that makes social media attractive also makes it a poor filter'] },
      lexical_resource: { score: 8, evidence: ['a poor filter', 'narrows their exposure to opposing arguments', 'free of charge'] },
      grammatical_range_accuracy: { score: 7, evidence: ['can reach to millions within minutes', 'have been steadily replaced, for many people, by a stream of headlines'] },
    } },
    { criteria: {
      task_response: { score: 8, evidence: ['I would argue that it has left the public less reliably informed', 'personalised feeds tend to confirm what people already believe'] },
      coherence_cohesion: { score: 8, evidence: ['The consequences, however, are mixed at best', 'Yet the same speed that makes social media attractive also makes it a poor filter'] },
      lexical_resource: { score: 7, evidence: ['report events as they unfold', 'narrows their exposure to opposing arguments'] },
      grammatical_range_accuracy: { score: 8, evidence: ['who already spend much of their day on these apps', 'have been steadily replaced, for many people, by a stream of headlines'] },
    } },
  ],
  'w2.b8.education-university': [
    { criteria: {
      task_response: { score: 8, evidence: ['I believe a placement year benefits most students, provided it is well organised and properly supervised', 'a friend who studied chemistry discovered during her placement in a food-testing laboratory'] },
      coherence_cohesion: { score: 7, evidence: ['Supporters of a purely academic degree point out', 'On the other hand, the case for work experience is strong'] },
      lexical_resource: { score: 7, evidence: ['do a more informed choice about their career', 'exactly this kind of experience'] },
      grammatical_range_accuracy: { score: 8, evidence: ['Whether undergraduates should spend part of their degree in the workplace is a question that divides educators', 'she was offered a job there before she had even finished her final exams'] },
    } },
    { criteria: {
      task_response: { score: 8, evidence: ['a work placement should be compulsory only when it is well organised', 'adding twelve months in an office could delay graduation and increase the cost of study'] },
      coherence_cohesion: { score: 8, evidence: ['A year in a company gives students exactly this kind of experience', 'Universities should therefore offer it widely'] },
      lexical_resource: { score: 8, evidence: ['placements become cheap labour', 'how a real organisation functions'] },
      grammatical_range_accuracy: { score: 8, evidence: ['university time is too valuable to be spent outside the lecture hall', 'so that students gain real responsibility rather than routine office tasks'] },
    } },
    { criteria: {
      task_response: { score: 7, evidence: ['a placement year makes most graduates more employable and more confident', 'adding twelve months in an office could delay graduation and increase the cost of study'] },
      coherence_cohesion: { score: 8, evidence: ['Supporters of a purely academic degree point out', 'Universities should therefore offer it widely'] },
      lexical_resource: { score: 7, evidence: ['do a more informed choice about their career', 'the case for work experience is strong'] },
      grammatical_range_accuracy: { score: 8, evidence: ['she was offered a job there before she had even finished her final exams', 'Whether undergraduates should spend part of their degree in the workplace is a question that divides educators'] },
    } },
  ],
};

export const writingTask2Calibration: { samples: CalibrationSample[]; runs: Record<string, CalibrationRun[]> } = { samples, runs };
