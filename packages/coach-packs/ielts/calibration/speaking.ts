import type { CalibrationRun, CalibrationSample } from '../../src/types.ts';

// Speaking calibration set: twelve transcripts of Part 1, 2 and 3 answers, bands 4 to 8,
// each with measured fluency numbers and three assessor runs. Pronunciation is
// not rated here: it needs the audio, and a transcript cannot show it. Answers are
// original Schood practice material written to sound like real learners (fillers,
// self-corrections and the typical errors of Uzbek- and Russian-speaking speakers).
// A few evidence quotes in the runs are deliberate paraphrases (not in the text) so the
// evidence check is exercised.
// The runs are authored in the assessor's output shape, not captured from a model:
// they test the scoring pipeline and the thresholds in CI. Replace them with real runs
// from scripts/coach-calibration-live.ts --out once a model route is configured.

export const speakingCalibration: { samples: CalibrationSample[]; runs: Record<string, CalibrationRun[]> } = {
  samples: [
    {
      id: 'sp.p1.b4-hometown',
      task: 'Speaking Part 1 (Hometown): Where is your hometown?',
      response:
        "Um... my hometown is Karshi. It is in south of Uzbekistan. Uh, it is not very big city but, um, it is... it is good. There is many market and, uh, old building. People is very kind. Um, in summer is very hot, very very hot. I like my city because my family live there. Uh... that's all.",
      metrics: { wpm: 71, longPauses: 4, fillers: 6, seconds: 48 },
      reference: { fluency_coherence: 4, lexical_resource: 4, grammatical_range_accuracy: 4 },
      rationale:
        "A short answer with frequent fillers, a repetition ('it is... it is good') and an abrupt close ('that's all') at 71 words per minute keeps FC at 4. " +
        "Only basic words (good, kind, very very hot) and frequent errors in agreement and articles ('There is many market', 'People is', 'not very big city') keep LR and GRA at 4.",
    },
    {
      id: 'sp.p2.b4-teacher',
      task:
        'Speaking Part 2. Describe a teacher who had an important influence on you. You should say: who this teacher was and what subject they taught; when they taught you; what they did that was different from other teachers; and explain how they influenced you.',
      response:
        "Um, I want to talk about my teacher of English in school. Her name is Dilnoza opa, we call teachers like this. Uh, she was teaching us in seventh and eighth class. Um, she was very kind woman and, uh, very strict also. When I was in school I don't like English, it was very difficult for me, uh, grammar and words. But he... sorry, she, she always say us, um, you can do it, don't afraid. And she give us many homework, uh, every day. Um... I remember one time I make a mistake in exam and I was crying, and she come to me and, uh, she explain me again after lesson. Um, she was very patient. Uh, because of her I start to like English and now I am preparing for IELTS. Um... what else... She was also teaching us English songs, it was very interesting, uh, funny. I think, um, she influence me very much because she believe in me. Uh, now she is not working in our school, she is go to other city. Um, but I am remember her always. Yes, that's it.",
      metrics: { wpm: 94, longPauses: 7, fillers: 16, seconds: 120 },
      reference: { fluency_coherence: 4, lexical_resource: 5, grammatical_range_accuracy: 4 },
      rationale:
        "The speaker keeps going for two minutes, but with 16 fillers, 7 long pauses, a 'what else' search and a he/she self-correction, and ideas are linked only by and/but/because: FC 4. " +
        "Topic words are adequate for basic meaning (strict, patient, believe in me), so LR reaches 5, but many verb forms are wrong ('she always say us', 'she is go', 'I am remember'): GRA 4.",
    },
    {
      id: 'sp.p1.b5-food',
      task: 'Speaking Part 1 (Food and cooking): What kind of food do you enjoy eating most?',
      response:
        "I like, um, mostly national food, for example plov and manti. My mother is cooking very delicious plov every Friday, so, uh, it is like tradition in our family. Also I like fast food, uh, like burgers, but I know it is not healthy, so I try to eat it not so often. Maybe one time in a week. Um, I think home food is more better because it's fresh.",
      metrics: { wpm: 101, longPauses: 1, fillers: 4, seconds: 42 },
      reference: { fluency_coherence: 5, lexical_resource: 5, grammatical_range_accuracy: 5 },
      rationale:
        "A direct answer extended with an example and a contrast, but linked mostly with so/also/but: FC 5. " +
        "Adequate topic words (national food, healthy, fresh) with a calque ('one time in a week') give LR 5; simple sentences are mostly right while the few longer ones carry errors ('is cooking' for a habit, 'more better', 'like tradition'): GRA 5.",
    },
    {
      id: 'sp.p3.b5-videos',
      task:
        "Speaking Part 3 (after the card 'Describe a video or online programme from which you learned something useful'): Why are online videos so popular as a way of learning?",
      response:
        "Um, I think there are many reasons. First reason is it is free, mostly free, you don't need to pay for courses or tutor. Second, you can watch it anytime, for example in the bus or before sleeping, and if you don't understand you can stop and watch again, it is very comfortable. Uh, also, in video you can see how to do something, not only read. Like, for example, my sister learned to cook many dishes from videos, she didn't go to any courses. Um, and young people, they don't like to read long books now, they prefer short and, uh, interesting things. But I think there is one problem, uh, sometimes informations in videos is not correct, because everybody can upload video. So, um, people must be careful.",
      metrics: { wpm: 103, longPauses: 2, fillers: 6, seconds: 76 },
      reference: { fluency_coherence: 6, lexical_resource: 5, grammatical_range_accuracy: 5 },
      rationale:
        "The answer is long and organised (first, second, also, but, so) with a personal example and a counterpoint, though the markers are mechanical: FC 6. " +
        "Vocabulary is limited and sometimes wrong ('very comfortable' for convenient, 'informations'): LR 5; complex sentences are attempted ('if you don't understand you can stop') but basic errors recur ('First reason is it is free', 'informations ... is', 'upload video'): GRA 5.",
    },
    {
      id: 'sp.p2.b5-samarkand',
      task:
        'Speaking Part 2. Describe a place in your country that you would recommend to visitors. You should say: where it is; how you know about it; what visitors can see or do there; and explain why you would recommend it.',
      response:
        "OK, I want to describe Samarkand. Um, it is very famous city in Uzbekistan and I think every tourist must visit it. I was there two times, first time with my school, uh, when I was fourteen, and second time last year with my friends. Um, the most famous place there is Registan. It is a big square with three old madrasas, uh, they are very beautiful, with blue... blue tiles and, um, very high gates. In the evening there is a light show and it is amazing, really. Also there is Shah-i-Zinda, uh, it is like a street of... of mausoleums, sorry, I don't know how to say exactly. Um, I recommend this place because you can see our history, how people lived many centuries ago, and also the food is very tasty there, especially Samarkand bread, it is very big and heavy. Uh, the people there are friendly and they help tourists. Um... what else. But one problem is, um, in summer it is too hot, so better to go in spring or autumn. Uh, I think if somebody come to Uzbekistan and not see Samarkand, it is like, um, they didn't see nothing. So yes, I really recommend it.",
      metrics: { wpm: 101, longPauses: 4, fillers: 12, seconds: 121 },
      reference: { fluency_coherence: 5, lexical_resource: 6, grammatical_range_accuracy: 5 },
      rationale:
        "The talk covers every point in a sensible order, but frequent fillers, repetitions ('blue... blue tiles', 'of... of mausoleums') and a 'what else' pause keep FC at 5. " +
        "Topic vocabulary is wide enough to describe the place in detail (madrasas, tiles, gates, light show, mausoleums) with a paraphrase when stuck: LR 6; articles, agreement and negatives keep failing ('very famous city', 'if somebody come', 'didn't see nothing'): GRA 5.",
    },
    {
      id: 'sp.p1.b6-study',
      task: 'Speaking Part 1 (Work or studies): Do you work, or are you a student?',
      response:
        "I'm a student at the moment. I'm in my third course at... at university in Tashkent, I study economics. Um, to be honest, it wasn't my own choice at first, my parents wanted that I study it, but now I actually quite enjoy it, especially the subjects connected with, uh, banking and finance. The only thing I don't like is that we have a lot of theory and not so much practice.",
      metrics: { wpm: 117, longPauses: 1, fillers: 2, seconds: 37 },
      reference: { fluency_coherence: 6, lexical_resource: 6, grammatical_range_accuracy: 6 },
      rationale:
        "A well-developed Part 1 answer with natural markers (to be honest, actually) and one restart ('at... at university'): FC 6. " +
        "Natural phrases (quite enjoy it, banking and finance) sit next to a Russian calque ('third course'): LR 6; a cleft-type sentence ('The only thing I don't like is that') shows range, while 'my parents wanted that I study it' shows the typical complex-sentence error: GRA 6.",
    },
    {
      id: 'sp.p2.b6-ereader',
      task:
        'Speaking Part 2. Describe a useful gift you received. You should say: what the gift was; who gave it to you and when; how you use it; and explain why it has been so useful to you.',
      response:
        "Well, I'd like to talk about a gift which I got from my older brother about two years ago, it was an e-book reader. Um, it was for my birthday, I was turning nineteen, and to be honest at first I was a bit disappointed, because I was expecting something like headphones or, uh, something more trendy. But actually it turned out to be one of the most useful things I have. So, it's a small device, about the size of a notebook but much more light, and the screen doesn't hurt your eyes like a phone screen. I can keep hundreds of books there. I mostly use it when I'm travelling, for example in the metro or when I go to my village to visit my grandparents, it takes about four hours by bus, so it's really helpful. Um, the reason why it's so useful is, first, it helped me to read much more than before. Before I was reading maybe one or two book in a year, and now it's like one book in every month. And also I started reading in English, which it improved my vocabulary a lot, because if I don't know some word, I just touch on it and it is giving the meaning immediately. Uh, what else... the battery also is very good, I charge it one time in two weeks. So I think my brother made a really clever choose, even I didn't realise it in that moment. I'm very thankful for him.",
      metrics: { wpm: 123, longPauses: 2, fillers: 4, seconds: 122 },
      reference: { fluency_coherence: 6, lexical_resource: 6, grammatical_range_accuracy: 5 },
      rationale:
        "The talk is well paced and clearly sequenced (well, so, the reason why, and also) with one 'what else' search: FC 6; vocabulary is flexible enough for the topic (a bit disappointed, trendy, turned out to be) with word-form slips ('clever choose'): LR 6. " +
        "Errors are frequent and several sit inside the complex structures ('which it improved', 'it is giving the meaning', 'even I didn't realise', 'much more light'), which holds GRA at 5.",
    },
    {
      id: 'sp.p3.b6-teachers-online',
      task:
        "Speaking Part 3 (after the card 'Describe a teacher who had an important influence on you'): How has the role of the teacher changed now that students can find information online?",
      response:
        "I think it has changed quite a lot. In the past the teacher was basically the main source of knowledge, students just listened and were writing everything. But now, if you want to know some fact, you can find it in two seconds on your phone. So I would say the teacher is becoming more like a guide, someone who shows you how to check the information and how to use it. For example, in our university some teachers give us a topic and we have to research it by ourselves and then discuss it in the class. Um, on the other hand, I don't think teachers will lose their importance, because the internet can't motivate you or notice that you are struggle. A good teacher can do that, and that's something technology can't replace, at least not yet.",
      metrics: { wpm: 132, longPauses: 0, fillers: 1, seconds: 64 },
      reference: { fluency_coherence: 7, lexical_resource: 6, grammatical_range_accuracy: 6 },
      rationale:
        "Fluent and logically developed (past vs now, an example, a counter-argument, a qualified close) with flexible markers: FC 7. " +
        "Vocabulary is clear but mostly everyday (source of knowledge, guide, motivate): LR 6; complex sentences are frequent, but slips recur ('were writing everything', 'some fact', 'you are struggle', 'in the class'): GRA 6.",
    },
    {
      id: 'sp.p2.b7-wedding',
      task:
        'Speaking Part 2. Describe a celebration that you enjoyed. You should say: what was celebrated; where and when it took place; who was there and what happened; and explain why you enjoyed it.',
      response:
        "I'd like to talk about my cousin's wedding, which took place last September in Bukhara. It was actually the first big family event after a few quiet years, so everyone was really looking forward to it. The celebration started early in the morning with the traditional plov, which is served for the guests, mostly men, at around six or seven o'clock. I remember standing in the yard, half asleep, helping my uncles to carry huge plates of rice to the tables. Then in the evening there was the main party in a restaurant, with around four hundred guests, which, by our standards, is not even that many. Um, what made it special for me was the atmosphere. There was live music, everybody was dancing, even my grandmother, who normally is complaining about her knees. And there was a moment when the bride said goodbye to her parents, which is a very emotional tradition in our culture, and I noticed that a lot of people, including me, had tears in their eyes. I enjoyed it mainly because I saw relatives I didn't see for years. Some of my cousins moved abroad, to Korea and Russia, so it was a rare chance to have all of us in one place. Uh, we stayed up until two in the morning, just talking and laughing. If I'm honest, the only downside was the noise, the music was so loud that you couldn't really have a conversation inside the hall. But overall, um, it's one of the warmest memories I have from last year.",
      metrics: { wpm: 132, longPauses: 1, fillers: 3, seconds: 118 },
      reference: { fluency_coherence: 7, lexical_resource: 7, grammatical_range_accuracy: 7 },
      rationale:
        "A coherent narrative that moves from morning to evening to reasons, with almost no hesitation: FC 7. " +
        "Natural, vivid phrases (looking forward to it, half asleep, by our standards, had tears in their eyes, the only downside) give LR 7; many error-free complex sentences with a few persistent slips ('served for the guests', 'who normally is complaining', 'relatives I didn't see for years'): GRA 7.",
    },
    {
      id: 'sp.p3.b7-village-city',
      task:
        "Speaking Part 3 (after the card 'Describe a quiet place where you like to spend time'): Compare the lifestyle of people in villages with that of people in big cities.",
      response:
        "Well, I'd say the biggest difference is the pace of life. In the city everything is in a hurry, people are rushing to work, stuck in traffic, and they barely know their neighbours. In villages life is much slower and, um, more connected to the community, if someone is having a wedding or someone is ill, the whole street gets involved. Another difference is opportunities. Cities obviously offer better jobs, universities and hospitals, that's why so many young people are leaving from villages, and in some places you only can see old people and children. But on the other hand, village people usually eat more natural food and they are less stressed, so in some ways they live more healthier life. Personally, I grew up in a city, but every summer I was going to my grandparents' village, and honestly I always felt calmer there.",
      metrics: { wpm: 138, longPauses: 0, fillers: 1, seconds: 63 },
      reference: { fluency_coherence: 7, lexical_resource: 7, grammatical_range_accuracy: 6 },
      rationale:
        "A genuine comparison organised by difference (pace, community, opportunities, health) and closed with a personal note, spoken without effort: FC 7; precise collocations (pace of life, stuck in traffic, barely know their neighbours, gets involved) give LR 7. " +
        "Errors in comparatives, word order, prepositions and past habits ('more healthier life', 'you only can see', 'leaving from villages', 'every summer I was going') keep GRA at 6.",
    },
    {
      id: 'sp.p1.b8-hobby',
      task: 'Speaking Part 1 (Free time): Is there a new hobby you would like to take up?',
      response:
        "Yes, actually, I've been meaning to take up pottery for ages. A friend of mine started going to a small studio near my office, and every time she shows me what she's made, I get a bit jealous. I think it would be the perfect antidote to staring at a screen all day; there's something appealing about working with your hands and ending up with something you can use. The only thing holding me back is finding the time.",
      metrics: { wpm: 145, longPauses: 0, fillers: 0, seconds: 33 },
      reference: { fluency_coherence: 8, lexical_resource: 8, grammatical_range_accuracy: 8 },
      rationale:
        "Effortless and fully developed for Part 1 (answer, story, reason, limitation) with no hesitation: FC 8. " +
        "Idiomatic, precise language ('been meaning to', 'for ages', 'the perfect antidote to', 'holding me back') and a flexible, error-free range of structures give LR 8 and GRA 8.",
    },
    {
      id: 'sp.p3.b8-public-money',
      task:
        "Speaking Part 3 (after the card 'Describe a public event you attended, such as a concert, a festival or a match'): Should governments spend public money on festivals and sports events?",
      response:
        "I think it depends on what kind of event we're talking about and, more importantly, who actually benefits from it. If a city spends a fortune on hosting a major tournament and then the stadiums stand empty for years, that's clearly waste of taxpayers' money, and people have every right to be frustrated. But smaller, local festivals are a different story. They tend to be relatively cheap, they bring communities together and they give local businesses, like cafés, craftsmen and small hotels, a real boost. So, um, rather than a simple yes or no, I'd say governments should fund events that leave something behind, whether that's better infrastructure or just a stronger sense of identity. The problem is that politicians often prefer the big, prestigious events, because they look impressive on the news, even if the long-term benefits is quite doubtful.",
      metrics: { wpm: 146, longPauses: 0, fillers: 1, seconds: 58 },
      reference: { fluency_coherence: 8, lexical_resource: 8, grammatical_range_accuracy: 7 },
      rationale:
        "A nuanced, fully developed argument (conditions, contrast, a qualified position, a critical point) delivered fluently: FC 8; skilful, idiomatic vocabulary (spends a fortune, a different story, a real boost, leave something behind) gives LR 8. " +
        "The range is wide, but two basic slips ('waste of taxpayers' money' without an article, 'the long-term benefits is') keep GRA at 7.",
    },
  ],
  runs: {
    'sp.p1.b4-hometown': [
      {
        criteria: {
          fluency_coherence: { score: 4, evidence: ['it is... it is good', "Uh... that's all"] },
          lexical_resource: { score: 4, evidence: ['very very hot', 'it is good'] },
          grammatical_range_accuracy: { score: 4, evidence: ['There is many market', 'People is very kind'] },
        },
      },
      {
        criteria: {
          fluency_coherence: { score: 4, evidence: ['Um... my hometown is Karshi', 'it is... it is good'] },
          lexical_resource: { score: 5, evidence: ['There is many market and, uh, old building', 'very very hot'] },
          grammatical_range_accuracy: { score: 4, evidence: ['It is in south of Uzbekistan', 'in summer is very hot'] },
        },
      },
      {
        criteria: {
          fluency_coherence: { score: 4, evidence: ["Uh... that's all"] },
          lexical_resource: { score: 4, evidence: ['People is very kind', 'very very hot'] },
          grammatical_range_accuracy: { score: 5, evidence: ['I like my city because my family live there', 'not very big city'] },
        },
      },
    ],
    'sp.p2.b4-teacher': [
      {
        criteria: {
          fluency_coherence: { score: 5, evidence: ['Um... what else', 'because of her I start to like English'] },
          lexical_resource: { score: 5, evidence: ['very strict also', 'she was very patient'] },
          grammatical_range_accuracy: { score: 4, evidence: ['she always say us', 'she is go to other city'] },
        },
      },
      {
        criteria: {
          fluency_coherence: { score: 4, evidence: ['But he... sorry, she, she always say us', 'Um... what else'] },
          lexical_resource: { score: 5, evidence: ['she believe in me', 'it was very interesting, uh, funny'] },
          grammatical_range_accuracy: { score: 4, evidence: ['she always says to us', 'I am remember her always', 'she give us many homework'] },
        },
      },
      {
        criteria: {
          fluency_coherence: { score: 4, evidence: ['Um... what else', "Yes, that's it"] },
          lexical_resource: { score: 4, evidence: ['it was very interesting, uh, funny', 'my teacher of English in school'] },
          grammatical_range_accuracy: { score: 4, evidence: ["When I was in school I don't like English", 'she explain me again after lesson'] },
        },
      },
    ],
    'sp.p1.b5-food': [
      {
        criteria: {
          fluency_coherence: { score: 5, evidence: ['for example plov and manti', 'so I try to eat it not so often'] },
          lexical_resource: { score: 5, evidence: ['mostly national food', 'one time in a week'] },
          grammatical_range_accuracy: { score: 4, evidence: ['more better', 'My mother is cooking very delicious plov every Friday'] },
        },
      },
      {
        criteria: {
          fluency_coherence: { score: 5, evidence: ['Also I like fast food', 'but I know it is not healthy'] },
          lexical_resource: { score: 5, evidence: ['very delicious plov', "home food is more better because it's fresh"] },
          grammatical_range_accuracy: { score: 5, evidence: ['it is like tradition in our family', "I think home food is more better because it's fresh"] },
        },
      },
      {
        criteria: {
          fluency_coherence: { score: 5, evidence: ['I like, um, mostly national food', 'Maybe one time in a week'] },
          lexical_resource: { score: 5, evidence: ['it is not healthy', 'one time in a week'] },
          grammatical_range_accuracy: { score: 4, evidence: ['more better', 'it is like tradition'] },
        },
      },
    ],
    'sp.p3.b5-videos': [
      {
        criteria: {
          fluency_coherence: { score: 6, evidence: ['First reason is it is free', 'Second, you can watch it anytime', 'But I think there is one problem'] },
          lexical_resource: { score: 5, evidence: ['it is very comfortable', 'informations in videos'] },
          grammatical_range_accuracy: { score: 5, evidence: ['sometimes informations in videos is not correct', "if you don't understand you can stop and watch again"] },
        },
      },
      {
        criteria: {
          fluency_coherence: { score: 5, evidence: ['Um, I think there are many reasons', 'So, um, people must be careful'] },
          lexical_resource: { score: 5, evidence: ["you don't need to pay for courses or tutor", 'everybody can upload video'] },
          grammatical_range_accuracy: { score: 5, evidence: ['First reason is it is free', 'in the bus'] },
        },
      },
      {
        criteria: {
          fluency_coherence: { score: 6, evidence: ['Like, for example, my sister learned to cook many dishes from videos', 'But I think there is one problem'] },
          lexical_resource: { score: 6, evidence: ['everybody can upload video', 'they prefer short and, uh, interesting things'] },
          grammatical_range_accuracy: { score: 5, evidence: ['informations in videos is not correct', "young people, they don't like to read long books now"] },
        },
      },
    ],
    'sp.p2.b5-samarkand': [
      {
        criteria: {
          fluency_coherence: { score: 5, evidence: ['blue... blue tiles', 'Um... what else'] },
          lexical_resource: { score: 6, evidence: ['very high gates', 'a light show', 'it is like a street of... of mausoleums'] },
          grammatical_range_accuracy: { score: 5, evidence: ['it is very famous city in Uzbekistan', 'if somebody come to Uzbekistan and not see Samarkand'] },
        },
      },
      {
        criteria: {
          fluency_coherence: { score: 5, evidence: ["sorry, I don't know how to say exactly", 'So yes, I really recommend it'] },
          lexical_resource: { score: 5, evidence: ["sorry, I don't know how to say exactly", 'the food is very tasty there'] },
          grammatical_range_accuracy: { score: 5, evidence: ["they didn't see nothing", 'how people lived many centuries ago'] },
        },
      },
      {
        criteria: {
          fluency_coherence: { score: 6, evidence: ['first time with my school', 'But one problem is, um, in summer it is too hot'] },
          lexical_resource: { score: 6, evidence: ['three old madrasas', 'a street full of mausoleums'] },
          grammatical_range_accuracy: { score: 5, evidence: ['I was there two times', 'so better to go in spring or autumn'] },
        },
      },
    ],
    'sp.p1.b6-study': [
      {
        criteria: {
          fluency_coherence: { score: 7, evidence: ["to be honest, it wasn't my own choice at first", "The only thing I don't like is that"] },
          lexical_resource: { score: 6, evidence: ['banking and finance', 'my third course'] },
          grammatical_range_accuracy: { score: 6, evidence: ['my parents wanted that I study it', "The only thing I don't like is that we have a lot of theory"] },
        },
      },
      {
        criteria: {
          fluency_coherence: { score: 6, evidence: ["I'm in my third course at... at university", 'but now I actually quite enjoy it'] },
          lexical_resource: { score: 6, evidence: ['I actually quite enjoy it', 'not so much practice'] },
          grammatical_range_accuracy: { score: 5, evidence: ['my parents wanted that I study it', 'at university in Tashkent, I study economics'] },
        },
      },
      {
        criteria: {
          fluency_coherence: { score: 6, evidence: ['at... at university in Tashkent', 'to be honest'] },
          lexical_resource: { score: 6, evidence: ["it wasn't my own choice", 'my third course'] },
          grammatical_range_accuracy: { score: 6, evidence: ['my parents wanted that I study it', "it wasn't my own choice at first"] },
        },
      },
    ],
    'sp.p2.b6-ereader': [
      {
        criteria: {
          fluency_coherence: { score: 6, evidence: ['But actually it turned out to be one of the most useful things I have', 'Uh, what else'] },
          lexical_resource: { score: 6, evidence: ['a bit disappointed', 'something more trendy'] },
          grammatical_range_accuracy: { score: 6, evidence: ['because I was expecting something like headphones', 'which it improved my vocabulary a lot'] },
        },
      },
      {
        criteria: {
          fluency_coherence: { score: 6, evidence: ['it turned out to be the most useful thing I own', "the reason why it's so useful is, first"] },
          lexical_resource: { score: 6, evidence: ["the screen doesn't hurt your eyes", 'a really clever choose'] },
          grammatical_range_accuracy: { score: 5, evidence: ['much more light', 'one or two book in a year', "even I didn't realise it in that moment"] },
        },
      },
      {
        criteria: {
          fluency_coherence: { score: 6, evidence: ["So, it's a small device", 'And also I started reading in English'] },
          lexical_resource: { score: 5, evidence: ['a really clever choose', 'touch on it'] },
          grammatical_range_accuracy: { score: 5, evidence: ['the battery also is very good', 'it is giving the meaning immediately'] },
        },
      },
    ],
    'sp.p3.b6-teachers-online': [
      {
        criteria: {
          fluency_coherence: { score: 7, evidence: ['So I would say the teacher is becoming more like a guide', "on the other hand, I don't think teachers will lose their importance"] },
          lexical_resource: { score: 7, evidence: ['the main source of knowledge', 'at least not yet'] },
          grammatical_range_accuracy: { score: 6, evidence: ['students just listened and were writing everything', 'notice that you are struggle'] },
        },
      },
      {
        criteria: {
          fluency_coherence: { score: 7, evidence: ['I think it has changed quite a lot', 'For example, in our university some teachers give us a topic'] },
          lexical_resource: { score: 6, evidence: ['more like a guide', 'lose their importance'] },
          grammatical_range_accuracy: { score: 6, evidence: ['if you want to know some fact', 'discuss it in the class'] },
        },
      },
      {
        criteria: {
          fluency_coherence: { score: 6, evidence: ['Um, on the other hand', 'So I would say'] },
          lexical_resource: { score: 6, evidence: ['research it by ourselves', 'the main source of knowledge'] },
          grammatical_range_accuracy: { score: 6, evidence: ['you are struggle', 'someone who shows you how to check the information and how to use it'] },
        },
      },
    ],
    'sp.p2.b7-wedding': [
      {
        criteria: {
          fluency_coherence: { score: 7, evidence: ['what made it special for me was the atmosphere', "But overall, um, it's one of the warmest memories"] },
          lexical_resource: { score: 7, evidence: ['everyone was eagerly waiting for it', 'half asleep', 'the only downside was the noise'] },
          grammatical_range_accuracy: { score: 7, evidence: ['which, by our standards, is not even that many', 'who normally is complaining about her knees'] },
        },
      },
      {
        criteria: {
          fluency_coherence: { score: 7, evidence: ['Then in the evening there was the main party', "If I'm honest, the only downside was the noise"] },
          lexical_resource: { score: 8, evidence: ['by our standards', 'had tears in their eyes', 'a rare chance to have all of us in one place'] },
          grammatical_range_accuracy: { score: 7, evidence: ["I saw relatives I didn't see for years", "the music was so loud that you couldn't really have a conversation"] },
        },
      },
      {
        criteria: {
          fluency_coherence: { score: 7, evidence: ['I remember standing in the yard, half asleep', 'Uh, we stayed up until two in the morning'] },
          lexical_resource: { score: 7, evidence: ['looking forward to it', 'the warmest memories'] },
          grammatical_range_accuracy: { score: 6, evidence: ['which is served for the guests', "I saw relatives I didn't see for years"] },
        },
      },
    ],
    'sp.p3.b7-village-city': [
      {
        criteria: {
          fluency_coherence: { score: 7, evidence: ['the biggest difference is the pace of life', 'Another difference is opportunities'] },
          lexical_resource: { score: 7, evidence: ['people are rushing to work, stuck in traffic', 'they barely know their neighbours'] },
          grammatical_range_accuracy: { score: 7, evidence: ['if someone is having a wedding or someone is ill, the whole street gets involved', 'they live more healthier life'] },
        },
      },
      {
        criteria: {
          fluency_coherence: { score: 7, evidence: ['But on the other hand', 'Personally, I grew up in a city'] },
          lexical_resource: { score: 7, evidence: ['the whole street gets involved', 'they are less stressed'] },
          grammatical_range_accuracy: { score: 6, evidence: ['you only can see old people and children', "every summer I was going to my grandparents' village"] },
        },
      },
      {
        criteria: {
          fluency_coherence: { score: 7, evidence: ["Well, I'd say the biggest difference is the pace of life", 'and honestly I always felt calmer there'] },
          lexical_resource: { score: 6, evidence: ['everything is in a hurry', 'more natural food'] },
          grammatical_range_accuracy: { score: 6, evidence: ['they live a more healthy life', 'leaving from villages'] },
        },
      },
    ],
    'sp.p1.b8-hobby': [
      {
        criteria: {
          fluency_coherence: { score: 8, evidence: ["I've been meaning to take up pottery for ages", 'The only thing holding me back is finding the time'] },
          lexical_resource: { score: 8, evidence: ['the perfect antidote to staring at a screen all day', 'I get a bit jealous'] },
          grammatical_range_accuracy: { score: 8, evidence: ["every time she shows me what she's made, I get a bit jealous", "there's something appealing about working with your hands"] },
        },
      },
      {
        criteria: {
          fluency_coherence: { score: 7, evidence: ['Yes, actually', 'A friend of mine started going to a small studio near my office'] },
          lexical_resource: { score: 8, evidence: ['take up pottery', 'ending up with something you can use'] },
          grammatical_range_accuracy: { score: 7, evidence: ['I think it would be the perfect antidote', 'The only thing holding me back is finding the time'] },
        },
      },
      {
        criteria: {
          fluency_coherence: { score: 8, evidence: ['A friend of mine started going to a small studio', 'I think it would be the perfect antidote'] },
          lexical_resource: { score: 8, evidence: ['holding me back', 'the perfect antidote'] },
          grammatical_range_accuracy: { score: 8, evidence: ["I've been meaning to take up pottery for ages", 'ending up with something you can use'] },
        },
      },
    ],
    'sp.p3.b8-public-money': [
      {
        criteria: {
          fluency_coherence: { score: 8, evidence: ["I think it depends on what kind of event we're talking about and, more importantly, who actually benefits from it", 'But smaller, local festivals are a different story'] },
          lexical_resource: { score: 7, evidence: ['spends a fortune on hosting a major tournament', 'a real boost'] },
          grammatical_range_accuracy: { score: 7, evidence: ["that's clearly waste of taxpayers' money", 'the long-term benefits is quite doubtful'] },
        },
      },
      {
        criteria: {
          fluency_coherence: { score: 8, evidence: ['it really depends on the type of event', 'rather than a simple yes or no'] },
          lexical_resource: { score: 8, evidence: ['people have every right to be frustrated', 'events that leave something behind', 'a stronger sense of identity'] },
          grammatical_range_accuracy: { score: 7, evidence: ["whether that's better infrastructure or just a stronger sense of identity", 'the long-term benefits is quite doubtful'] },
        },
      },
      {
        criteria: {
          fluency_coherence: { score: 7, evidence: ['So, um, rather than a simple yes or no', 'The problem is that politicians often prefer the big, prestigious events'] },
          lexical_resource: { score: 8, evidence: ['the stadiums stand empty for years', 'they look impressive on the news'] },
          grammatical_range_accuracy: { score: 7, evidence: ['If a city spends a fortune on hosting a major tournament and then the stadiums stand empty for years', "waste of taxpayers' money"] },
        },
      },
    ],
  },
};
