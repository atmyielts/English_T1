import type { Activity, CueCard, SpeakingPart } from '../src/types.ts';

// The IELTS Speaking mock: Part 1 interview on familiar topics, Part 2 long turn from a
// cue card (1 minute to prepare, up to 2 minutes to talk), Part 3 discussion linked to
// the card. Questions and cards are original Schood material in the public IELTS format.

const card = (id: string, topic: string, points: string[], roundOff: string[], discussion: string[]): CueCard => ({
  id,
  topic,
  points,
  prepSeconds: 60,
  talkSeconds: 120,
  minTalkSeconds: 60,
  roundOff,
  discussion,
});

const p1: SpeakingPart = {
  id: 'p1',
  title: { en: 'Part 1 · Introduction and interview', uz: '1-qism · Tanishuv va suhbat', ru: 'Часть 1 · Знакомство и интервью' },
  kind: 'questions',
  intro: 'Hello, and welcome to the speaking test. I will be your examiner today, and the test will take between eleven and fourteen minutes. In this first part I would like to ask you some short questions about yourself and a few everyday topics. Just answer naturally, as you would in a conversation. Let’s begin.',
  topics: [
    {
      id: 'home',
      title: 'Home and accommodation',
      questions: [
        'Do you live in a house or a flat?',
        'What do you like most about the place where you live?',
        'Which room in your home do you spend the most time in, and why?',
        'Is there anything you would like to change about your home?',
        'Do you think you will still live in the same place in five years’ time?',
      ],
    },
    {
      id: 'work_study',
      title: 'Work or studies',
      questions: [
        'Do you work, or are you a student?',
        'Why did you choose that job or that subject?',
        'What does a typical day at work or at university look like for you?',
        'Which part of your work or studies do you find most difficult?',
        'Would you like to change your job or your subject in the future?',
      ],
    },
    {
      id: 'hometown',
      title: 'Hometown',
      questions: [
        'Where is your hometown?',
        'What is your hometown best known for?',
        'How has your hometown changed since you were a child?',
        'Is your hometown a good place for young people to live? Why or why not?',
        'Would you recommend your hometown to a tourist?',
      ],
    },
    {
      id: 'routine',
      title: 'Daily routine',
      questions: [
        'What time do you usually get up on weekdays?',
        'Which part of the day do you enjoy most?',
        'Is your routine at the weekend very different from your weekday routine?',
        'Have you changed anything in your daily routine recently?',
        'Do you prefer to plan your day carefully or keep it flexible?',
      ],
    },
    {
      id: 'food',
      title: 'Food and cooking',
      questions: [
        'What kind of food do you enjoy eating most?',
        'Do you prefer eating at home or eating out?',
        'Is there any food you disliked as a child but enjoy now?',
        'How often do you cook for yourself?',
        'Is there a dish from your country that you would like a foreign visitor to try?',
      ],
    },
    {
      id: 'weather',
      title: 'Weather and seasons',
      questions: [
        'What is the weather usually like where you live?',
        'Which season do you like best, and why?',
        'Does the weather ever affect your mood?',
        'What do you like to do on a rainy day?',
        'Would you like to live somewhere with a very different climate?',
      ],
    },
    {
      id: 'shopping',
      title: 'Shopping',
      questions: [
        'Do you enjoy shopping?',
        'Do you prefer to shop online or in real shops?',
        'What was the last thing you bought for yourself?',
        'Do you usually plan what to buy, or do you buy things on impulse?',
        'Are there any shops in your area that you visit regularly?',
      ],
    },
    {
      id: 'free_time',
      title: 'Free time',
      questions: [
        'What do you usually do in your free time?',
        'Do you prefer to spend your free time alone or with other people?',
        'Do you have more free time now than when you were younger?',
        'Is there a new hobby you would like to take up?',
        'How do you usually spend your evenings?',
      ],
    },
    {
      id: 'music',
      title: 'Music',
      questions: [
        'What kind of music do you listen to?',
        'When do you usually listen to music?',
        'Did you learn to play a musical instrument when you were a child?',
        'Has your taste in music changed over the years?',
        'Do you prefer listening to live music or recorded music?',
      ],
    },
    {
      id: 'transport',
      title: 'Transport',
      questions: [
        'How do you usually get to work or to your place of study?',
        'How long does your daily journey take?',
        'Is public transport good in your city?',
        'What is the most popular way to travel around your city?',
        'Do you think more people in your city will cycle in the future?',
      ],
    },
    {
      id: 'friends',
      title: 'Friends',
      questions: [
        'Do you have a lot of friends, or a few close ones?',
        'How did you meet your best friend?',
        'What do you usually do when you meet your friends?',
        'Is it easy to make new friends as an adult?',
        'Do you still keep in touch with friends from school?',
      ],
    },
    {
      id: 'phones',
      title: 'Phones and technology',
      questions: [
        'How much time do you spend on your phone each day?',
        'Which app do you use the most, and what for?',
        'Have you ever tried to spend a whole day without your phone?',
        'Do you prefer calling people or sending messages?',
        'What did you use your first phone for?',
      ],
    },
    {
      id: 'sport',
      title: 'Sport and exercise',
      questions: [
        'Do you play any sports?',
        'Which sports are most popular in your country?',
        'Did you do much sport at school?',
        'Do you prefer watching sport or taking part in it?',
        'Is there a sport you would like to try in the future?',
      ],
    },
    {
      id: 'holidays',
      title: 'Holidays',
      questions: [
        'Where did you go on your last holiday?',
        'Do you prefer holidays by the sea or in the mountains?',
        'Do you like to plan your holidays in detail?',
        'Who do you usually go on holiday with?',
        'Is there a place you would love to visit one day?',
      ],
    },
  ],
  pickTopics: 2,
  askPerTopic: 3,
  answerSeconds: { min: 10, target: 25, max: 45 },
};

const p2: SpeakingPart = {
  id: 'p2',
  title: { en: 'Part 2 · Long turn', uz: '2-qism · Uzun nutq', ru: 'Часть 2 · Монолог' },
  kind: 'long_turn',
  intro: 'Now I am going to give you a topic, and I would like you to talk about it for one to two minutes. You have one minute to think about what you are going to say, and you can make some notes if you wish. When the minute is over, please start speaking. I will stop you after two minutes. Here is your topic.',
  cards: [
    card(
      'card.teacher',
      'Describe a teacher who had an important influence on you.',
      ['who this teacher was and what subject they taught', 'when they taught you', 'what they did that was different from other teachers', 'and explain how they influenced you.'],
      ['Are you still in touch with this teacher?', 'Would you like to be a teacher yourself?'],
      [
        'What qualities make someone a good teacher?',
        'Is a teacher’s personality more important than their knowledge of the subject?',
        'How has the role of the teacher changed now that students can find information online?',
        'Why do you think fewer young people want to become teachers in some countries?',
        'Do you think computer programs will ever replace teachers? Why or why not?',
      ],
    ),
    card(
      'card.skilled-person',
      'Describe a person you know who is very good at something.',
      ['who this person is', 'what they are good at', 'how they developed this skill', 'and explain how you feel about their ability.'],
      ['Would you like to learn this skill yourself?', 'Does this person teach their skill to anyone?'],
      [
        'Which skills are most valued in your country today?',
        'Are people born with talents, or do they develop them through practice?',
        'Why do some people give up learning a skill when it becomes difficult?',
        'Should schools spend more time on practical skills than on academic subjects?',
        'How has the internet changed the way people learn new skills compared with the past?',
      ],
    ),
    card(
      'card.older-relative',
      'Describe an older member of your family whom you admire.',
      ['who this person is', 'what they do or used to do', 'what you usually do together', 'and explain why you admire them.'],
      ['How often do you see this person?', 'In what ways are you similar to them?'],
      [
        'What can young people learn from older generations?',
        'How has the role of grandparents in families changed in your country?',
        'Is it better for elderly people to live with their families or in their own homes?',
        'Why do some young people find it hard to understand the views of older people?',
        'Do employers value the experience of older workers enough?',
      ],
    ),
    card(
      'card.place-recommend',
      'Describe a place in your country that you would recommend to visitors.',
      ['where it is', 'how you know about it', 'what visitors can see or do there', 'and explain why you would recommend it.'],
      ['When is the best time of year to go there?', 'Would you like to go back there yourself?'],
      [
        'What do tourists usually want to see when they visit your country?',
        'What are the benefits of tourism for local people, and what problems can it cause?',
        'Should famous historical sites limit the number of visitors? Why or why not?',
        'How has the way people choose holiday destinations changed in recent years?',
        'Is it better to travel independently or with an organised tour?',
      ],
    ),
    card(
      'card.quiet-place',
      'Describe a quiet place where you like to spend time.',
      ['where it is', 'how often you go there', 'what you do there', 'and explain why you like spending time in this place.'],
      ['Do you usually go there alone?', 'Has this place changed since you first went there?'],
      [
        'Why is it difficult for many people to find quiet places in cities?',
        'Should local governments create more parks and green spaces? Why?',
        'Do people today need more time alone than people did in the past?',
        'How does constant noise affect people’s health and work?',
        'Compare the lifestyle of people in villages with that of people in big cities.',
      ],
    ),
    card(
      'card.building',
      'Describe a building in your town or city that you find interesting.',
      ['where it is', 'what it looks like', 'what it is used for', 'and explain why you find it interesting.'],
      ['Would you like to live or work in this building?', 'Do many visitors go to see it?'],
      [
        'Is it more important for a new building to be beautiful or practical?',
        'Should old buildings be protected even when the land is needed for new homes?',
        'How has architecture in your country changed over the last fifty years?',
        'Who should decide what new buildings look like: architects, the government or local people?',
        'Do you think cities around the world are starting to look the same? Why?',
      ],
    ),
    card(
      'card.gift',
      'Describe a useful gift you received.',
      ['what the gift was', 'who gave it to you and when', 'how you use it', 'and explain why it has been so useful to you.'],
      ['Do you still have this gift?', 'Do you prefer giving or receiving gifts?'],
      [
        'On what occasions do people in your country give gifts, and why?',
        'Is it better to give money or a carefully chosen present?',
        'Do people spend too much money on gifts nowadays?',
        'How has advertising changed the way people think about gifts?',
        'Are handmade gifts more valuable than bought ones? Why?',
      ],
    ),
    card(
      'card.old-object',
      'Describe an old object that your family has kept for a long time.',
      ['what the object is', 'where it came from', 'where it is kept now', 'and explain why your family values it.'],
      ['Would your family ever sell this object?', 'Do you keep any old things of your own?'],
      [
        'Why do people like to keep objects from the past?',
        'Should museums be free so that everyone can learn about history?',
        'Do young people care about their family history as much as older people do?',
        'How can a country protect its traditional crafts?',
        'Will people in the future keep digital photos and messages the way people once kept letters?',
      ],
    ),
    card(
      'card.celebration',
      'Describe a celebration that you enjoyed.',
      ['what was celebrated', 'where and when it took place', 'who was there and what happened', 'and explain why you enjoyed it.'],
      ['Do you enjoy organising celebrations yourself?', 'Do you have any photos from that day?'],
      [
        'What are the most important celebrations in your country?',
        'Why do some people think weddings and other celebrations have become too expensive?',
        'How are celebrations today different from those in your grandparents’ time?',
        'Do you think traditional celebrations will survive in the future?',
        'Is it important for a country to have public holidays? Why?',
      ],
    ),
    card(
      'card.public-event',
      'Describe a public event you attended, such as a concert, a festival or a match.',
      ['what the event was', 'where it took place and who you went with', 'what happened during the event', 'and explain how you felt about it.'],
      ['Would you go to a similar event again?', 'Was it easy to get there?'],
      [
        'Why do people enjoy live events instead of watching them at home?',
        'What are the benefits for a city of hosting large international events?',
        'Should governments spend public money on festivals and sports events?',
        'How has technology changed the experience of going to a concert or a match?',
        'What problems can large crowds cause, and how can they be managed?',
      ],
    ),
    card(
      'card.decision',
      'Describe a difficult decision that you made.',
      ['what the decision was', 'when you made it', 'how you made it', 'and explain why it was difficult.'],
      ['Did anyone help you make the decision?', 'Are you happy with the decision now?'],
      [
        'What important decisions do young people in your country have to make?',
        'Should parents make important decisions for their children, and until what age?',
        'Why do some people find it hard to make decisions?',
        'Are decisions made by a group usually better than decisions made by one person?',
        'Do people today have more choices than in the past? Is that a good thing?',
      ],
    ),
    card(
      'card.helped-someone',
      'Describe a time when you helped someone.',
      ['who you helped', 'what the situation was', 'how you helped them', 'and explain how you felt afterwards.'],
      ['Do you often help people you do not know?', 'Has anyone helped you in a similar way?'],
      [
        'Why do some people volunteer to help others without being paid?',
        'Should schools require students to do community work?',
        'Do neighbours help each other less than they did in the past? Why?',
        'Who should be responsible for helping people in need: families, charities or the government?',
        'How can technology make it easier for people to help each other?',
      ],
    ),
    card(
      'card.online-video',
      'Describe a video or online programme from which you learned something useful.',
      ['what it was about', 'where and when you watched it', 'what you learned from it', 'and explain why it was useful to you.'],
      ['Have you recommended it to anyone?', 'How often do you watch videos to learn things?'],
      [
        'Why are online videos so popular as a way of learning?',
        'Can people learn as well from videos as from a teacher in a classroom?',
        'How can people tell whether the information in a video is reliable?',
        'Should there be stricter rules about what people can post online?',
        'How do you think television will change in the next twenty years?',
      ],
    ),
    card(
      'card.future-goal',
      'Describe a goal that you hope to achieve in the next few years.',
      ['what the goal is', 'when you set it', 'what you are doing to achieve it', 'and explain why it is important to you.'],
      ['Have you told other people about this goal?', 'What will you do after you achieve it?'],
      [
        'Is it better to have long-term goals or to live for the moment?',
        'How are the goals of young people today different from those of their parents’ generation?',
        'Why do some people never achieve the goals they set?',
        'Should success be measured by how much money a person earns?',
        'How can schools help students to plan their future?',
      ],
    ),
  ],
  answerSeconds: { min: 60, target: 110, max: 125 },
};

const p3: SpeakingPart = {
  id: 'p3',
  title: { en: 'Part 3 · Discussion', uz: '3-qism · Muhokama', ru: 'Часть 3 · Дискуссия' },
  kind: 'questions',
  intro: 'Thank you. You have been talking about the topic on your card, and now I would like to discuss some more general questions connected with it. These questions are about people and society in general, so please give your opinions and explain your reasons as fully as you can.',
  fromCard: 'p2',
  askPerTopic: 4,
  answerSeconds: { min: 20, target: 45, max: 75 },
};

export const speaking: Activity[] = [
  {
    id: 'ielts.speaking.mock',
    kind: 'speaking_exam',
    title: { en: 'Full IELTS Speaking mock (Parts 1–3)', uz: 'To‘liq IELTS Speaking sinovi (1–3-qismlar)', ru: 'Полный пробный IELTS Speaking (части 1–3)' },
    node: 'speaking',
    levels: [4, 9],
    minutes: 14,
    tags: ['speaking', 'mock', 'parts_1_3'],
    rubric: 'ielts.speaking',
    mock: true,
    parts: [p1, p2, p3],
  },
];
