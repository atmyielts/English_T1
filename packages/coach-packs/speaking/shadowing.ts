import type { Activity } from '../src/types.ts';

// Shadowing: the learner listens to a sentence and says it at the same time or just
// after, copying rhythm, linking and stress. Each `focus` names the one feature to
// listen for. Sentences are natural spoken English, graded A2 to C1.

export const shadowing: Activity[] = [
  {
    id: 'sh.a2', kind: 'shadowing', node: 'conversation.pronunciation', levels: [2, 3], minutes: 5,
    title: { en: 'Shadowing A2: everyday phrases', uz: 'Shadowing A2: kundalik iboralar', ru: 'Шэдоуинг A2: повседневные фразы' },
    sentences: [
      {
        id: 'a2-01', text: 'Hi, I’m Aziz. Nice to meet you.',
        focus: { en: 'Say “nice to meet you” as one phrase: “to” is weak, like /tə/, and the stress falls on “meet”.', uz: '«Nice to meet you»ni bitta ibora qilib ayting: «to» kuchsiz, /tə/ kabi, urg‘u «meet»ga tushadi.', ru: 'Произносите «nice to meet you» одной фразой: «to» слабое, как /tə/, ударение на «meet».' },
        translations: { uz: 'Salom, men Azizman. Tanishganimdan xursandman.', ru: 'Привет, я Азиз. Приятно познакомиться.' },
      },
      {
        id: 'a2-02', text: 'Could I have a cup of tea, please?',
        focus: { en: 'Link “cup of” together, /kʌpəv/, with a weak “of”. Keep your voice soft and polite on “please”.', uz: '«Cup of»ni bir-biriga ulang — /kʌpəv/, «of» kuchsiz. «Please»ni yumshoq va muloyim ayting.', ru: 'Свяжите «cup of» в /kʌpəv/ со слабым «of». «Please» произносите мягко и вежливо.' },
        translations: { uz: 'Bir piyola choy bera olasizmi, iltimos?', ru: 'Можно мне чашку чая, пожалуйста?' },
      },
      {
        id: 'a2-03', text: 'Where are you from?',
        focus: { en: '“Are” is weak (/ə/) and “where are” links: /weərə/. Questions with where, what or how usually go down at the end.', uz: '«Are» kuchsiz (/ə/), «where are» qo‘shilib ketadi: /weərə/. Where, what, how bilan savollarda ohang oxirida pasayadi.', ru: '«Are» слабое (/ə/), «where are» сливается: /weərə/. В вопросах с where, what, how тон в конце понижается.' },
        translations: { uz: 'Qayerliksiz?', ru: 'Откуда вы?' },
      },
      {
        id: 'a2-04', text: 'I’d like a table for two, please.',
        focus: { en: 'Use the short form “I’d” (/aɪd/), not “I would”. “For” is weak, /fə/, and the stress is on “two”.', uz: '«I would» emas, qisqa «I’d» (/aɪd/) deng. «For» kuchsiz — /fə/, urg‘u «two»da.', ru: 'Говорите краткое «I’d» (/aɪd/), а не «I would». «For» слабое — /fə/, ударение на «two».' },
        translations: { uz: 'Ikki kishilik stol olmoqchi edim, iltimos.', ru: 'Мне столик на двоих, пожалуйста.' },
      },
      {
        id: 'a2-05', text: 'How much is it?',
        focus: { en: 'Join the words: “much is it” sounds like /mʌtʃɪzɪt/. Stress “much”.', uz: 'So‘zlarni ulang: «much is it» /mʌtʃɪzɪt/ kabi eshitiladi. Urg‘u «much»da.', ru: 'Связывайте слова: «much is it» звучит как /mʌtʃɪzɪt/. Ударение на «much».' },
        translations: { uz: 'Bu qancha turadi?', ru: 'Сколько это стоит?' },
      },
      {
        id: 'a2-06', text: 'It’s on the left, next to the bank.',
        focus: { en: 'Stress the new information: “left” and “bank”. “The” is weak, /ðə/, with the tongue touching the teeth.', uz: 'Yangi ma’lumotga urg‘u bering: «left» va «bank». «The» kuchsiz — /ðə/, til tishlarga tegib turadi.', ru: 'Выделяйте новую информацию: «left» и «bank». «The» слабое — /ðə/, язык касается зубов.' },
        translations: { uz: 'U chap tomonda, bankning yonida.', ru: 'Это слева, рядом с банком.' },
      },
      {
        id: 'a2-07', text: 'Sorry, I don’t understand. Can you say it again?',
        focus: { en: '“Can” is weak here, /kən/. Say “say it again” as one smooth phrase: /seɪɪtəɡen/.', uz: 'Bu yerda «can» kuchsiz — /kən/. «Say it again»ni bir nafasda, silliq ayting: /seɪɪtəɡen/.', ru: '«Can» здесь слабое — /kən/. «Say it again» произносите слитно: /seɪɪtəɡen/.' },
        translations: { uz: 'Kechirasiz, tushunmadim. Yana bir bor ayta olasizmi?', ru: 'Извините, я не понимаю. Можете повторить?' },
      },
      {
        id: 'a2-08', text: 'I live in a flat with my parents.',
        focus: { en: 'Join a consonant to the next vowel: “live in a” sounds like /lɪvɪnə/. Make /v/ with your top teeth on your bottom lip, not /w/.', uz: 'Undoshni keyingi unliga ulang: «live in a» /lɪvɪnə/ kabi. /v/ ni yuqori tishlarni pastki labga tekkizib ayting, /w/ emas.', ru: 'Связывайте согласный со следующим гласным: «live in a» — /lɪvɪnə/. /v/ — верхние зубы касаются нижней губы, не /w/.' },
        translations: { uz: 'Men ota-onam bilan kvartirada yashayman.', ru: 'Я живу в квартире с родителями.' },
      },
      {
        id: 'a2-09', text: 'Thank you very much for your help.',
        focus: { en: 'For /θ/ in “thank”, put the tongue lightly between the teeth and blow — not /t/ or /s/.', uz: '«Thank»dagi /θ/ uchun tilni tishlar orasiga yengil qo‘yib, havo chiqaring — /t/ yoki /s/ emas.', ru: 'Для /θ/ в «thank» кончик языка слегка между зубами, выдыхайте — не /t/ и не /s/.' },
        translations: { uz: 'Yordamingiz uchun katta rahmat.', ru: 'Большое спасибо за помощь.' },
      },
      {
        id: 'a2-10', text: 'I want to buy a ticket to Bukhara.',
        focus: { en: 'In fast speech “want to” becomes /wɒnə/. The second “to” is weak, /tə/. Stress “ticket” and “Bukhara”.', uz: 'Tez nutqda «want to» /wɒnə/ ga aylanadi. Ikkinchi «to» kuchsiz — /tə/. «Ticket» va «Bukhara»ga urg‘u bering.', ru: 'В быстрой речи «want to» звучит как /wɒnə/. Второе «to» слабое — /tə/. Ударение на «ticket» и «Bukhara».' },
        translations: { uz: 'Buxoroga chipta olmoqchiman.', ru: 'Я хочу купить билет до Бухары.' },
      },
      {
        id: 'a2-11', text: 'There’s a problem with my room.',
        focus: { en: '/ð/ in “there’s” and “with”: the tongue touches the teeth and the sound buzzes. “There’s a” links: /ðeəzə/.', uz: '«There’s» va «with»dagi /ð/: til tishlarga tegadi, tovush jarangli. «There’s a» qo‘shiladi: /ðeəzə/.', ru: '/ð/ в «there’s» и «with»: язык касается зубов, звук звонкий. «There’s a» сливается: /ðeəzə/.' },
        translations: { uz: 'Xonamda bir muammo bor.', ru: 'У меня проблема с номером.' },
      },
      {
        id: 'a2-12', text: 'See you later, have a nice day!',
        focus: { en: 'Link “have a” into /hævə/. Let your voice rise and fall warmly on “nice day”.', uz: '«Have a»ni /hævə/ qilib ulang. «Nice day»da ovozni iliq ko‘tarib-tushiring.', ru: 'Свяжите «have a» в /hævə/. На «nice day» голос тепло поднимается и опускается.' },
        translations: { uz: 'Keyin ko‘rishamiz, kuningiz xayrli o‘tsin!', ru: 'До встречи, хорошего дня!' },
      },
    ],
  },
  {
    id: 'sh.b1', kind: 'shadowing', node: 'conversation.pronunciation', levels: [3, 4], minutes: 5,
    title: { en: 'Shadowing B1: natural conversation', uz: 'Shadowing B1: tabiiy suhbat', ru: 'Шэдоуинг B1: живой разговор' },
    sentences: [
      {
        id: 'b1-01', text: 'I’ve been living here for about three years now.',
        focus: { en: 'Contract “I have” to “I’ve” and keep “been” short, /bɪn/. “For” is weak. Stress “three years”.', uz: '«I have»ni «I’ve» ga qisqartiring, «been»ni qisqa ayting — /bɪn/. «For» kuchsiz. Urg‘u «three years»da.', ru: 'Сокращайте «I have» до «I’ve», «been» — коротко, /bɪn/. «For» слабое. Ударение на «three years».' },
        translations: { uz: 'Men bu yerda taxminan uch yildan beri yashayman.', ru: 'Я живу здесь уже около трёх лет.' },
      },
      {
        id: 'b1-02', text: 'Sorry, I didn’t catch that. Could you say it again?',
        focus: { en: 'In “didn’t catch that” the t sounds are very short or silent. “Could you” sounds like /kʊdʒu/.', uz: '«Didn’t catch that»da t tovushlari juda qisqa yoki eshitilmaydi. «Could you» /kʊdʒu/ kabi eshitiladi.', ru: 'В «didn’t catch that» звуки t очень короткие или не слышны. «Could you» звучит как /kʊdʒu/.' },
        translations: { uz: 'Kechirasiz, eshitmay qoldim. Yana bir bor ayta olasizmi?', ru: 'Простите, я не расслышал. Можете повторить?' },
      },
      {
        id: 'b1-03', text: 'We were going to go to the beach, but it started raining.',
        focus: { en: '“Were” is weak (/wə/), and “going to” can sound like “gonna”. Stress “beach” and “raining”.', uz: '«Were» kuchsiz (/wə/), «going to» esa «gonna» kabi eshitilishi mumkin. Urg‘u «beach» va «raining»da.', ru: '«Were» слабое (/wə/), «going to» может звучать как «gonna». Ударение на «beach» и «raining».' },
        translations: { uz: 'Biz plyajga bormoqchi edik, lekin yomg‘ir yog‘a boshladi.', ru: 'Мы собирались на пляж, но начался дождь.' },
      },
      {
        id: 'b1-04', text: 'I’m calling about the room I booked for Friday.',
        focus: { en: 'Stress the key information, “room” and “Friday”. Say “about the” quickly and lightly.', uz: 'Asosiy ma’lumotga — «room» va «Friday»ga urg‘u bering. «About the»ni tez va yengil ayting.', ru: 'Выделяйте главное — «room» и «Friday». «About the» — быстро и легко.' },
        translations: { uz: 'Juma kuniga bron qilgan xonam yuzasidan qo‘ng‘iroq qilyapman.', ru: 'Я звоню по поводу номера, который забронировал на пятницу.' },
      },
      {
        id: 'b1-05', text: 'What do you do for a living?',
        focus: { en: '“What do you” runs together: /wɒdəjə/. Stress the second “do” (the verb) and “living”.', uz: '«What do you» qo‘shilib ketadi: /wɒdəjə/. Urg‘u ikkinchi «do» (fe’l) va «living»da.', ru: '«What do you» сливается: /wɒdəjə/. Ударение на втором «do» (глагол) и на «living».' },
        translations: { uz: 'Nima ish bilan shug‘ullanasiz?', ru: 'Чем вы зарабатываете на жизнь?' },
      },
      {
        id: 'b1-06', text: 'It hurts when I bend my knee, especially in the morning.',
        focus: { en: 'The k in “knee” is silent: /niː/. Keep the long /iː/ in “knee” different from the short /ɪ/ in “in”.', uz: '«Knee»dagi k o‘qilmaydi: /niː/. «Knee»dagi uzun /iː/ ni «in»dagi qisqa /ɪ/ dan farqlang.', ru: 'В «knee» k не читается: /niː/. Различайте долгий /iː/ в «knee» и краткий /ɪ/ в «in».' },
        translations: { uz: 'Tizzamni bukkanimda og‘riydi, ayniqsa ertalab.', ru: 'Болит, когда я сгибаю колено, особенно по утрам.' },
      },
      {
        id: 'b1-07', text: 'Do you know if there’s a pharmacy near here?',
        focus: { en: '“Do you” is quick, /dʒə/. It is a yes/no question, so the voice rises at the end on “here”.', uz: '«Do you» tez aytiladi — /dʒə/. Bu ha/yo‘q savoli, shuning uchun oxirida «here»da ovoz ko‘tariladi.', ru: '«Do you» произносится быстро — /dʒə/. Это общий вопрос, поэтому на «here» голос поднимается.' },
        translations: { uz: 'Bu yaqin atrofda dorixona bor-yo‘qligini bilasizmi?', ru: 'Вы не знаете, есть ли здесь рядом аптека?' },
      },
      {
        id: 'b1-08', text: 'I’d rather sit by the window, if that’s OK.',
        focus: { en: 'Say “I’d rather” as one unit. A polite fall-rise on “OK” makes the request soft.', uz: '«I’d rather»ni bir butun qilib ayting. «OK»dagi pasayib-ko‘tariluvchi ohang iltimosni yumshatadi.', ru: '«I’d rather» — одним блоком. Нисходяще-восходящий тон на «OK» смягчает просьбу.' },
        translations: { uz: 'Agar mumkin bo‘lsa, deraza yonida o‘tirganim ma’qul.', ru: 'Я бы лучше сел у окна, если можно.' },
      },
      {
        id: 'b1-09', text: 'The weather’s been terrible this week, hasn’t it?',
        focus: { en: 'A question tag that expects agreement falls at the end: “hasn’t it” goes down.', uz: 'Rozilik kutilgan qisqa so‘roq (question tag) oxirida pasayadi: «hasn’t it» pastga tushadi.', ru: 'Разделительный вопрос, который ждёт согласия, в конце понижается: «hasn’t it» идёт вниз.' },
        translations: { uz: 'Bu hafta havo juda yomon bo‘ldi, to‘g‘rimi?', ru: 'Погода на этой неделе ужасная, правда?' },
      },
      {
        id: 'b1-10', text: 'I thought the film was a bit too long.',
        focus: { en: '/θ/ in “thought”: tongue between the teeth. “Was” is weak, /wəz/. Stress “film” and “too long”.', uz: '«Thought»dagi /θ/: til tishlar orasida. «Was» kuchsiz — /wəz/. Urg‘u «film» va «too long»da.', ru: '/θ/ в «thought»: язык между зубами. «Was» слабое — /wəz/. Ударение на «film» и «too long».' },
        translations: { uz: 'Menimcha, film biroz cho‘zilib ketdi.', ru: 'Мне показалось, фильм был немного затянут.' },
      },
      {
        id: 'b1-11', text: 'Could I get a large one to take away?',
        focus: { en: '“Get a” links: /ɡetə/. “Take away” joins smoothly: /teɪkəweɪ/. Stress “large”.', uz: '«Get a» qo‘shiladi: /ɡetə/. «Take away» silliq ulanadi: /teɪkəweɪ/. Urg‘u «large»da.', ru: '«Get a» сливается: /ɡetə/. «Take away» — плавно: /teɪkəweɪ/. Ударение на «large».' },
        translations: { uz: 'Kattasini olib ketishga bera olasizmi?', ru: 'Можно мне большой, с собой?' },
      },
      {
        id: 'b1-12', text: 'Let me check, and I’ll get back to you.',
        focus: { en: '“Let me” sounds like /lemi/. In “get back” the t is held, not released. Stress “check” and “back”.', uz: '«Let me» /lemi/ kabi eshitiladi. «Get back»da t ushlab turiladi, portlatilmaydi. Urg‘u «check» va «back»da.', ru: '«Let me» звучит как /lemi/. В «get back» t задерживается, без взрыва. Ударение на «check» и «back».' },
        translations: { uz: 'Tekshirib ko‘ray, keyin sizga javob beraman.', ru: 'Я проверю и вернусь к вам с ответом.' },
      },
    ],
  },
  {
    id: 'sh.b2', kind: 'shadowing', node: 'conversation.pronunciation', levels: [4, 5], minutes: 5,
    title: { en: 'Shadowing B2: opinions and work', uz: 'Shadowing B2: fikrlar va ish', ru: 'Шэдоуинг B2: мнения и работа' },
    sentences: [
      {
        id: 'b2-01', text: 'To be honest, I’m not sure that’s the best way to do it.',
        focus: { en: '“To be” is weak, /təbi/. Stress “honest”, “not sure” and “best”, with a short pause after “honest”.', uz: '«To be» kuchsiz — /təbi/. «Honest», «not sure» va «best»ga urg‘u bering, «honest»dan keyin qisqa to‘xtang.', ru: '«To be» слабое — /təbi/. Ударение на «honest», «not sure» и «best», короткая пауза после «honest».' },
        translations: { uz: 'Rostini aytsam, bu eng yaxshi usul ekaniga ishonchim yo‘q.', ru: 'Честно говоря, я не уверен, что это лучший способ.' },
      },
      {
        id: 'b2-02', text: 'I see your point, but have you thought about the cost?',
        focus: { en: 'Contrast stress on “see”, then “cost”. The voice rises on “point” before “but”, then falls.', uz: 'Qarama-qarshi urg‘u: avval «see», keyin «cost». «But» oldidan «point»da ovoz ko‘tariladi, so‘ng pasayadi.', ru: 'Контрастное ударение: «see», затем «cost». На «point» перед «but» голос поднимается, потом падает.' },
        translations: { uz: 'Fikringizni tushunaman, lekin narxi haqida o‘ylab ko‘rdingizmi?', ru: 'Я понимаю вашу мысль, но вы подумали о стоимости?' },
      },
      {
        id: 'b2-03', text: 'If I’d known it was so far, I’d have taken a taxi.',
        focus: { en: '“I’d have” is reduced to /aɪdəv/. Stress “known”, “far” and “taxi”.', uz: '«I’d have» /aɪdəv/ ga qisqaradi. Urg‘u «known», «far» va «taxi»da.', ru: '«I’d have» редуцируется до /aɪdəv/. Ударение на «known», «far» и «taxi».' },
        translations: { uz: 'Shunchalik uzoqligini bilganimda, taksi olgan bo‘lardim.', ru: 'Если бы я знал, что это так далеко, я бы взял такси.' },
      },
      {
        id: 'b2-04', text: 'We should’ve left earlier — the traffic’s awful at this time.',
        focus: { en: '“Should’ve” is /ʃʊdəv/ (never write “should of”). Stress “earlier” and “awful”.', uz: '«Should’ve» — /ʃʊdəv/ (yozuvda hech qachon «should of» emas). Urg‘u «earlier» va «awful»da.', ru: '«Should’ve» — /ʃʊdəv/ (на письме никогда не «should of»). Ударение на «earlier» и «awful».' },
        translations: { uz: 'Ertaroq chiqishimiz kerak edi — bu vaqtda tirbandlik dahshatli bo‘ladi.', ru: 'Надо было выехать раньше — в это время ужасные пробки.' },
      },
      {
        id: 'b2-05', text: 'It wasn’t the price that bothered me, it was the service.',
        focus: { en: 'Contrastive stress carries the meaning: hit “price” and “service” clearly and keep the rest light.', uz: 'Ma’noni qarama-qarshi urg‘u beradi: «price» va «service»ni aniq ta’kidlang, qolganini yengil ayting.', ru: 'Смысл несёт контрастное ударение: чётко выделите «price» и «service», остальное — легко.' },
        translations: { uz: 'Meni narx emas, xizmat ko‘rsatish bezovta qildi.', ru: 'Меня беспокоила не цена, а обслуживание.' },
      },
      {
        id: 'b2-06', text: 'Would you mind if we pushed the meeting back to Thursday?',
        focus: { en: '“Would you” sounds like /wʊdʒu/. In “pushed the” the -ed /t/ almost disappears. Stress “Thursday”.', uz: '«Would you» /wʊdʒu/ kabi. «Pushed the»da -ed /t/ deyarli eshitilmaydi. Urg‘u «Thursday»da.', ru: '«Would you» звучит как /wʊdʒu/. В «pushed the» окончание -ed /t/ почти пропадает. Ударение на «Thursday».' },
        translations: { uz: 'Uchrashuvni payshanbaga surishimizga qarshi emasmisiz?', ru: 'Вы не против, если мы перенесём встречу на четверг?' },
      },
      {
        id: 'b2-07', text: 'I’ve been meaning to ask you about that.',
        focus: { en: 'In “meaning to” the “to” is weak, /tə/. “Ask you” links: /ɑːskju/. Stress “meaning” and “ask”.', uz: '«Meaning to»da «to» kuchsiz — /tə/. «Ask you» qo‘shiladi: /ɑːskju/. Urg‘u «meaning» va «ask»da.', ru: 'В «meaning to» «to» слабое — /tə/. «Ask you» сливается: /ɑːskju/. Ударение на «meaning» и «ask».' },
        translations: { uz: 'Sizdan shuni so‘ramoqchi bo‘lib yurgandim.', ru: 'Я давно хотел вас об этом спросить.' },
      },
      {
        id: 'b2-08', text: 'Sorry, I didn’t mean to interrupt — go ahead.',
        focus: { en: 'The t in “didn’t mean” drops. “Go ahead” links with a small /w/: /ɡəʊwəhed/.', uz: '«Didn’t mean»da t tushib qoladi. «Go ahead» kichik /w/ bilan ulanadi: /ɡəʊwəhed/.', ru: 'В «didn’t mean» t выпадает. «Go ahead» связывается лёгким /w/: /ɡəʊwəhed/.' },
        translations: { uz: 'Kechirasiz, gapingizni bo‘lmoqchi emasdim — davom eting.', ru: 'Простите, я не хотел перебивать — продолжайте.' },
      },
      {
        id: 'b2-09', text: 'What I really need is a bit more time to think it over.',
        focus: { en: 'Stress “really need” and “time”. Link “think it over”: /θɪŋkɪtəʊvə/.', uz: '«Really need» va «time»ga urg‘u bering. «Think it over»ni ulang: /θɪŋkɪtəʊvə/.', ru: 'Ударение на «really need» и «time». Свяжите «think it over»: /θɪŋkɪtəʊvə/.' },
        translations: { uz: 'Menga aslida o‘ylab ko‘rish uchun biroz ko‘proq vaqt kerak.', ru: 'Что мне действительно нужно — это ещё немного времени, чтобы всё обдумать.' },
      },
      {
        id: 'b2-10', text: 'The delivery’s been delayed, so it won’t arrive until Monday.',
        focus: { en: '“Won’t” (/wəʊnt/) must sound different from “want” (/wɒnt/). Stress “delayed” and “Monday”.', uz: '«Won’t» (/wəʊnt/) «want» (/wɒnt/)dan farqli eshitilishi kerak. Urg‘u «delayed» va «Monday»da.', ru: '«Won’t» (/wəʊnt/) должно отличаться от «want» (/wɒnt/). Ударение на «delayed» и «Monday».' },
        translations: { uz: 'Yetkazib berish kechiktirildi, shuning uchun dushanbagacha kelmaydi.', ru: 'Доставку задержали, поэтому она придёт только в понедельник.' },
      },
      {
        id: 'b2-11', text: 'As far as I know, the offer ends at the end of the month.',
        focus: { en: 'Link “as far as I”: /əzfɑːrəzaɪ/, with a linking r. Stress “know”, “ends” and “month”.', uz: '«As far as I»ni ulang: /əzfɑːrəzaɪ/, bog‘lovchi r bilan. Urg‘u «know», «ends» va «month»da.', ru: 'Свяжите «as far as I»: /əzfɑːrəzaɪ/, со связующим r. Ударение на «know», «ends» и «month».' },
        translations: { uz: 'Bilishimcha, taklif oy oxirida tugaydi.', ru: 'Насколько я знаю, предложение действует до конца месяца.' },
      },
      {
        id: 'b2-12', text: 'Let’s not rush into anything until we’ve seen the figures.',
        focus: { en: '“Rush into” links: /rʌʃɪntə/. “Until” is light; the strongest stress is on “figures”.', uz: '«Rush into» qo‘shiladi: /rʌʃɪntə/. «Until» yengil; eng kuchli urg‘u «figures»da.', ru: '«Rush into» сливается: /rʌʃɪntə/. «Until» — легко; самое сильное ударение на «figures».' },
        translations: { uz: 'Raqamlarni ko‘rmagunimizcha shoshilib qaror qilmaylik.', ru: 'Давайте не будем спешить, пока не увидим цифры.' },
      },
    ],
  },
  {
    id: 'sh.c1', kind: 'shadowing', node: 'conversation.pronunciation', levels: [5, 6], minutes: 5,
    title: { en: 'Shadowing C1: nuance and tact', uz: 'Shadowing C1: nozik ma’nolar va nazokat', ru: 'Шэдоуинг C1: нюансы и такт' },
    sentences: [
      {
        id: 'c1-01', text: 'I’m not saying it’s a bad idea; I’m just not convinced it’ll work in practice.',
        focus: { en: 'Two contrast stresses: “saying” and “convinced”. “It’ll” is /ɪtl/. Keep “just” short.', uz: 'Ikki qarama-qarshi urg‘u: «saying» va «convinced». «It’ll» — /ɪtl/. «Just»ni qisqa ayting.', ru: 'Два контрастных ударения: «saying» и «convinced». «It’ll» — /ɪtl/. «Just» — коротко.' },
        translations: { uz: 'Men buni yomon fikr demayapman; shunchaki amalda ish berishiga ishonchim yo‘q.', ru: 'Я не говорю, что это плохая идея; просто не уверен, что она сработает на практике.' },
      },
      {
        id: 'c1-02', text: 'Had we known about the strike, we’d have booked a different route altogether.',
        focus: { en: 'Inversion: start firmly on “Had we known”. “We’d have” is /wiːdəv/. Stress “strike” and “altogether”.', uz: 'Inversiya: «Had we known»ni qat’iy boshlang. «We’d have» — /wiːdəv/. Urg‘u «strike» va «altogether»da.', ru: 'Инверсия: уверенно начните с «Had we known». «We’d have» — /wiːdəv/. Ударение на «strike» и «altogether».' },
        translations: { uz: 'Ish tashlash haqida bilganimizda, butunlay boshqa yo‘nalishni bron qilgan bo‘lardik.', ru: 'Знай мы о забастовке, мы бы забронировали совсем другой маршрут.' },
      },
      {
        id: 'c1-03', text: 'It’s not so much the money as the principle of the thing.',
        focus: { en: 'Feel the rhythm of “not so much … as”: stress “money” and “principle”, and let “of the” almost disappear.', uz: '«Not so much … as» ritmini his qiling: «money» va «principle»ga urg‘u bering, «of the» deyarli eshitilmasin.', ru: 'Почувствуйте ритм «not so much … as»: ударение на «money» и «principle», «of the» почти исчезает.' },
        translations: { uz: 'Gap puldan ko‘ra ko‘proq prinsipda.', ru: 'Дело не столько в деньгах, сколько в принципе.' },
      },
      {
        id: 'c1-04', text: 'Funnily enough, I was just about to call you.',
        focus: { en: 'A light, surprised tone on “Funnily enough”. “About to” is quick: /əbaʊtə/. Stress “call”.', uz: '«Funnily enough»ni yengil, hayratli ohangda ayting. «About to» tez — /əbaʊtə/. Urg‘u «call»da.', ru: '«Funnily enough» — лёгким, удивлённым тоном. «About to» быстро — /əbaʊtə/. Ударение на «call».' },
        translations: { uz: 'Qiziq, men hozir sizga qo‘ng‘iroq qilmoqchi bo‘lib turgandim.', ru: 'Забавно, я как раз собирался вам позвонить.' },
      },
      {
        id: 'c1-05', text: 'With all due respect, I think we’re missing the bigger picture here.',
        focus: { en: 'Slow, even and respectful on “With all due respect”, then a clear stress on “bigger picture”.', uz: '«With all due respect»ni sekin, bir tekis va hurmat bilan ayting, so‘ng «bigger picture»ga aniq urg‘u bering.', ru: '«With all due respect» — медленно, ровно и уважительно, затем чёткое ударение на «bigger picture».' },
        translations: { uz: 'Hurmatim bilan aytsam, menimcha, biz bu yerda umumiy manzarani ko‘zdan qochiryapmiz.', ru: 'При всём уважении, мне кажется, мы упускаем общую картину.' },
      },
      {
        id: 'c1-06', text: 'The thing is, nobody actually told us the deadline had changed.',
        focus: { en: 'Pause after “The thing is”. Stress “nobody” and “told”; “had” is weak, /həd/.', uz: '«The thing is»dan keyin to‘xtang. «Nobody» va «told»ga urg‘u bering; «had» kuchsiz — /həd/.', ru: 'Пауза после «The thing is». Ударение на «nobody» и «told»; «had» слабое — /həd/.' },
        translations: { uz: 'Gap shundaki, muddat o‘zgarganini bizga hech kim aytmagan.', ru: 'Дело в том, что нам никто не сказал, что срок изменился.' },
      },
      {
        id: 'c1-07', text: 'Whichever option we go for, we’ll need the client on board first.',
        focus: { en: 'Link “go for” (/ɡəʊfə/) and “on board” (/ɒnbɔːd/). Stress “whichever”, “client” and “first”.', uz: '«Go for» (/ɡəʊfə/) va «on board» (/ɒnbɔːd/)ni ulang. Urg‘u «whichever», «client» va «first»da.', ru: 'Свяжите «go for» (/ɡəʊfə/) и «on board» (/ɒnbɔːd/). Ударение на «whichever», «client» и «first».' },
        translations: { uz: 'Qaysi variantni tanlasak ham, avval mijozning roziligini olishimiz kerak.', ru: 'Какой бы вариант мы ни выбрали, сначала нужно заручиться поддержкой клиента.' },
      },
      {
        id: 'c1-08', text: 'I’d have thought they’d at least apologise, but apparently not.',
        focus: { en: '“I’d have thought” is /aɪdəvθɔːt/. A fall-rise on “apparently not” shows mild disappointment.', uz: '«I’d have thought» — /aɪdəvθɔːt/. «Apparently not»dagi pasayib-ko‘tariluvchi ohang biroz hafsala pir bo‘lganini bildiradi.', ru: '«I’d have thought» — /aɪdəvθɔːt/. Нисходяще-восходящий тон на «apparently not» передаёт лёгкое разочарование.' },
        translations: { uz: 'Hech bo‘lmasa uzr so‘rashadi deb o‘ylagandim, lekin, shekilli, yo‘q.', ru: 'Я думал, они хотя бы извинятся, но, видимо, нет.' },
      },
      {
        id: 'c1-09', text: 'It’s worth bearing in mind that prices tend to rise in the summer.',
        focus: { en: 'Move cleanly from /θ/ in “worth” to /b/ in “bearing”. “Tend to” is /tendə/. Stress “mind” and “rise”.', uz: '«Worth»dagi /θ/ dan «bearing»dagi /b/ ga toza o‘ting. «Tend to» — /tendə/. Urg‘u «mind» va «rise»da.', ru: 'Чисто переходите от /θ/ в «worth» к /b/ в «bearing». «Tend to» — /tendə/. Ударение на «mind» и «rise».' },
        translations: { uz: 'Shuni yodda tutish kerakki, yozda narxlar odatda oshadi.', ru: 'Стоит иметь в виду, что летом цены обычно растут.' },
      },
      {
        id: 'c1-10', text: 'There’s no point worrying about it until we hear back from them.',
        focus: { en: '“Them” is weak, /ðəm/. Hold the t in “point” before “worrying”. Stress “no point” and “hear back”.', uz: '«Them» kuchsiz — /ðəm/. «Worrying» oldidan «point»dagi t ni ushlab turing. Urg‘u «no point» va «hear back»da.', ru: '«Them» слабое — /ðəm/. Задержите t в «point» перед «worrying». Ударение на «no point» и «hear back».' },
        translations: { uz: 'Ulardan javob kelmagunicha bu haqda xavotirlanishning ma’nosi yo‘q.', ru: 'Нет смысла волноваться, пока они нам не ответят.' },
      },
      {
        id: 'c1-11', text: 'What struck me most was how calm everyone stayed under pressure.',
        focus: { en: 'A cleft sentence: build up to the main stress on “calm”. “Struck me” links: /strʌkmi/.', uz: 'Ajratib ko‘rsatuvchi gap: ohangni asosiy urg‘u — «calm»gacha oshirib boring. «Struck me» qo‘shiladi: /strʌkmi/.', ru: 'Выделительная конструкция: ведите голос к главному ударению на «calm». «Struck me» сливается: /strʌkmi/.' },
        translations: { uz: 'Meni eng ko‘p hayratga solgani — bosim ostida hamma qanchalik xotirjam qolgani bo‘ldi.', ru: 'Больше всего меня поразило, как спокойно все держались под давлением.' },
      },
      {
        id: 'c1-12', text: 'If anything, the delay has given us a chance to get it right.',
        focus: { en: 'Link “If anything”: /ɪfeniθɪŋ/. “Get it right” flows: /ɡetɪtraɪt/. Stress “chance” and “right”.', uz: '«If anything»ni ulang: /ɪfeniθɪŋ/. «Get it right» oqib o‘tadi: /ɡetɪtraɪt/. Urg‘u «chance» va «right»da.', ru: 'Свяжите «If anything»: /ɪfeniθɪŋ/. «Get it right» — слитно: /ɡetɪtraɪt/. Ударение на «chance» и «right».' },
        translations: { uz: 'Aksincha, kechikish bizga buni to‘g‘ri qilish imkonini berdi.', ru: 'Если уж на то пошло, задержка дала нам шанс сделать всё как надо.' },
      },
    ],
  },
];
