-- Grammar handbook: a Russian and an Uzbek explanation for every published grammar unit.
-- Each text explains the rule for a learner at the unit's level (not a word-for-word translation);
-- English example sentences stay in English. The handbook (GET /grammar-remediation/handbook)
-- reads grammar_units.metadata.explanation_ru / explanation_uz and falls back to English.
--
-- Idempotent: the keys are merged into metadata by slug on every run; slugs that don't exist
-- (for example a content unit that has not been seeded yet) are skipped. No schema change.

do $$
declare
  v_en_id uuid;
  v_grammar_product_id uuid;
  v_updated integer;
begin
  select id into v_en_id from public.languages where code = 'en' limit 1;

  select p.id into v_grammar_product_id
  from public.products p
  where lower(coalesce(p.metadata->>'slug', '')) = 'english-grammar'
  order by p.created_at asc
  limit 1;

  if v_en_id is null or v_grammar_product_id is null then
    raise notice 'grammar handbook: English language or english-grammar product missing; nothing to update';
    return;
  end if;

  with explanations(slug, ru, uz) as (
    values
    -- A1 ------------------------------------------------------------------
    (
      'to-be-am-is-are',
      $t$Глагол to be («быть») в настоящем времени имеет три формы: am — только с I, is — с he, she, it и с одним предметом или человеком, are — с you, we, they и со множественным числом. В русском языке «есть» обычно пропускают («Она учитель»), а в английском глагол нужен всегда: She is a teacher. В вопросе форма глагола встаёт перед подлежащим: Are you a student? Для отрицания добавьте not: I am not tired.$t$,
      $t$To be feʼli hozirgi zamonda uch shaklga ega: am — faqat I bilan, is — he, she, it va bitta narsa yoki odam bilan, are — you, we, they va koʻplikdagi otlar bilan. Oʻzbek tilida «Opam — oʻqituvchi» deymiz va feʼl kerak boʻlmaydi, ingliz tilida esa u albatta turadi: My sister is a teacher. Soʻroq gapda am, is yoki are egadan oldin keladi: Are you a student? Inkor uchun not qoʻshing: I am not tired.$t$
    ),
    (
      'present-simple-routines',
      $t$Present simple — время для привычек, распорядка дня и общеизвестных фактов: I drink tea every morning. После he, she, it (и после одного человека: my brother) к глаголу добавляется окончание -s: she drinks, he works. В отрицаниях и вопросах нужен вспомогательный глагол do или does, а основной глагол остаётся без -s: I don't eat meat. Does he work here? Помните: с he, she, it — doesn't, а не don't.$t$,
      $t$Present simple odatlar, kun tartibi va umumiy haqiqatlar uchun ishlatiladi: I drink tea every morning. He, she, it (yoki bitta odam: my brother) bilan feʼlga -s qoʻshiladi: she drinks, he works. Inkor va soʻroq gaplarda do yoki does yordamchi feʼli kerak, asosiy feʼl esa -s siz qoladi: I don't eat meat. Does he work here? Esda tuting: he, she, it bilan don't emas, doesn't ishlatiladi.$t$
    ),
    (
      'there-is-there-are',
      $t$There is и there are говорят о том, что что-то есть или находится в каком-то месте — как русское «есть» или «имеется». There is — для одного предмета, there are — для двух и больше: There is a park near my house. There are two banks on this street. Обычно предложение начинается с there, а место ставится в конец. Нельзя говорить «In my city have many parks» — правильно There are many parks in my city. Вопрос: Is there…? / Are there…?$t$,
      $t$There is va there are biror narsa borligini yoki qayerdadir turganini bildiradi — oʻzbekchadagi «bor» soʻziga oʻxshaydi. There is bitta narsa uchun, there are ikki va undan koʻp narsa uchun: There is a park near my house. There are two banks on this street. Gap odatda there bilan boshlanadi, joy esa oxirida keladi. «In my city have many parks» deyish xato, toʻgʻrisi: There are many parks in my city. Soʻroq shakli: Is there…? / Are there…?$t$
    ),
    (
      'can-and-cant',
      $t$Can + глагол означает «уметь, мочь»: I can swim. Ещё так просят разрешения: Can I sit here? Can одинаково для всех лиц, поэтому не добавляйте -s (не she cans), а после can глагол идёт без to (не can to swim). Отрицание — can't (cannot): She can't drive. В вопросе can ставится перед подлежащим: Can she drive?$t$,
      $t$Can + feʼl «qila olmoq, uddalamoq» degan maʼnoni beradi: I can swim. Ruxsat soʻrash uchun ham ishlatiladi: Can I sit here? Can barcha shaxslar uchun bir xil, shuning uchun -s qoʻshilmaydi (she cans emas), undan keyin keladigan feʼl esa to siz boʻladi (can to swim emas). Inkor shakli — can't (cannot): She can't drive. Soʻroq gapda can egadan oldin turadi: Can she drive?$t$
    ),
    (
      'plurals-this-that-these-those',
      $t$Множественное число обычно образуется окончанием -s: book → books. Некоторые слова меняются целиком: child → children, man → men, woman → women, person → people. После любого числа больше одного существительное стоит во множественном числе: two books, five children, 100 people. This (один) и these (несколько) — о том, что рядом; that (один) и those (несколько) — о том, что далеко: this book, these books, that car, those cars.$t$,
      $t$Koʻplik odatda -s qoʻshimchasi bilan yasaladi: book → books. Baʼzi soʻzlar butunlay oʻzgaradi: child → children, man → men, woman → women, person → people. Oʻzbek tilida son bilan koʻplik qoʻshimchasi ishlatilmaydi («uchta kitob»), ingliz tilida esa birdan katta sondan keyin -s albatta qoʻshiladi: three books. This (bitta) va these (bir nechta) yaqindagi narsalar uchun, that (bitta) va those (bir nechta) uzoqdagi narsalar uchun: this book, these books, that car, those cars.$t$
    ),
    (
      'possessives-my-your-s',
      $t$Притяжательные слова my, your, his, her, its, our, their ставятся перед существительным: This is my phone. В отличие от русского «его/её», выбор зависит от владельца: his — если владелец мужчина, her — если женщина (Ali and his sister, Madina and her brother). Чтобы показать, кому что принадлежит, добавьте 's к имени или слову-человеку: Ali's car, my mother's birthday. Конструкция «the car of my brother» звучит неестественно — говорите my brother's car.$t$,
      $t$Egalik soʻzlari my, your, his, her, its, our, their otdan oldin keladi: This is my phone. Oʻzbek tilida «uning» hammaga bir xil, ingliz tilida esa egasiga qarab tanlanadi: erkak boʻlsa his, ayol boʻlsa her (Ali and his sister, Madina and her brother). Narsa kimga tegishli ekanini koʻrsatish uchun ism yoki odamni bildiruvchi soʻzga 's qoʻshing: Ali's car, my mother's birthday. «The car of my brother» gʻalati eshitiladi — my brother's car deng.$t$
    ),
    (
      'a1-prepositions-of-place',
      $t$Предлоги места показывают, где находится предмет. in — внутри: in the bag, in the room, in Tashkent. on — на поверхности: on the table, on the wall, on the second floor. under — под: under the bed. next to — рядом (to обязательно): next to the window. between — между двумя предметами: between the bank and the café. at — в месте, где мы чем-то заняты: at home, at school, at work, at the bus stop. Обратите внимание: «дома» — at home, а не in home.$t$,
      $t$Joy predloglari narsa qayerda turganini koʻrsatadi. in — ichida: in the bag, in the room, in Tashkent. on — ustida, sirtida: on the table, on the wall, on the second floor. under — tagida: under the bed. next to — yonida (to albatta kerak): next to the window. between — ikki narsa orasida: between the bank and the café. at — biror ish qilinadigan joyda: at home, at school, at work, at the bus stop. Eʼtibor bering: «uyda» — in home emas, at home.$t$
    ),
    (
      'a1-present-continuous-now',
      $t$Present continuous описывает то, что происходит прямо сейчас, в момент речи. Форма: am / is / are + глагол с окончанием -ing: I am reading. She is cooking. They are playing football. Отрицание: I'm not working, he isn't sleeping. Вопрос: Are you listening? Is it raining? Не пропускайте am, is, are и не забывайте -ing. Правописание: обычно просто -ing (read → reading); немая -e отпадает (make → making); в коротких словах последняя согласная удваивается (sit → sitting, run → running, swim → swimming).$t$,
      $t$Present continuous hozir, gapirayotgan paytimizda boʻlayotgan ishni bildiradi. Tuzilishi: am / is / are + feʼl -ing bilan: I am reading. She is cooking. They are playing football. Inkor: I'm not working, he isn't sleeping. Soʻroq: Are you listening? Is it raining? am, is, are ni tushirib qoldirmang va -ing ni unutmang. Imlo: odatda shunchaki -ing qoʻshiladi (read → reading); oxiridagi -e tushib qoladi (make → making); qisqa feʼllarda oxirgi undosh ikkilanadi (sit → sitting, run → running, swim → swimming).$t$
    ),
    -- A2 ------------------------------------------------------------------
    (
      'articles-basic-control',
      $t$В русском языке артиклей нет, а в английском перед исчисляемым существительным в единственном числе почти всегда нужен артикль. A или an — когда предмет упоминается впервые или это «какой-то, один из многих»: I saw a cat. An ставится перед гласным звуком: an apple, an hour. The — когда слушатель уже знает, о каком именно предмете речь: The cat was black. С множественным числом и неисчисляемыми словами a/an не используют: cats, water.$t$,
      $t$Oʻzbek tilida artikl yoʻq, ingliz tilida esa birlikdagi sanaladigan otdan oldin deyarli doim artikl kerak. A yoki an — narsa birinchi marta tilga olinganda yoki «qandaydir bitta» maʼnosida: I saw a cat. An unli tovushdan oldin keladi: an apple, an hour. The — tinglovchi qaysi narsa haqida gap ketayotganini allaqachon bilsa: The cat was black. Koʻplikdagi va sanalmaydigan otlar bilan a/an ishlatilmaydi: cats, water.$t$
    ),
    (
      'past-simple-did-didnt',
      $t$В вопросах и отрицаниях в past simple прошедшее время показывает вспомогательный глагол did / didn't, поэтому основной глагол остаётся в начальной форме — без -ed и без второй формы: Did you call him? I didn't see her. Правильно didn't go, а не didn't went. Не забывайте did в вопросе: не «Where you went?», а Where did you go?$t$,
      $t$Past simple zamonidagi soʻroq va inkor gaplarda oʻtgan zamonni did / didn't yordamchi feʼli koʻrsatadi, shuning uchun asosiy feʼl boshlangʻich shaklda qoladi — -ed siz va ikkinchi shaklsiz: Did you call him? I didn't see her. Toʻgʻrisi didn't go, didn't went emas. Soʻroq gapda did ni unutmang: «Where you went?» emas, Where did you go?$t$
    ),
    (
      'present-continuous-vs-simple',
      $t$Present simple — для привычек и того, что верно всегда: I walk to work every day. Present continuous (am / is / are + -ing) — для того, что происходит сейчас или в этот период: I am walking to work now. Подсказки: every day, usually, often — обычно present simple; now, at the moment, today — обычно present continuous. Глаголы состояния (know, like, want, need) обычно не употребляются с -ing: I know, а не I am knowing.$t$,
      $t$Present simple odatlar va doim toʻgʻri boʻlgan narsalar uchun: I walk to work every day. Present continuous (am / is / are + -ing) hozir yoki shu davrda boʻlayotgan ish uchun: I am walking to work now. Yordamchi soʻzlar: every day, usually, often — odatda present simple; now, at the moment, today — odatda present continuous. Holat feʼllari (know, like, want, need) odatda -ing bilan ishlatilmaydi: I am knowing emas, I know.$t$
    ),
    (
      'comparatives-superlatives',
      $t$Чтобы сравнить два предмета, к коротким прилагательным добавляют -er (cheap → cheaper), а перед длинными ставят more (more expensive), затем — than: This phone is cheaper than that one. Чтобы сказать «самый» в группе, используйте the + -est (the cheapest) или the most (the most expensive). Нельзя совмещать обе формы: не more bigger, а bigger. Неправильные формы: good → better → the best, bad → worse → the worst.$t$,
      $t$Ikki narsani solishtirish uchun qisqa sifatlarga -er qoʻshiladi (cheap → cheaper), uzun sifatlardan oldin more qoʻyiladi (more expensive), keyin than keladi: This phone is cheaper than that one. Guruhdagi «eng» maʼnosi uchun the + -est (the cheapest) yoki the most (the most expensive) ishlatiladi. Ikkala shaklni birga ishlatmang: more bigger emas, bigger. Notoʻgʻri shakllar: good → better → the best, bad → worse → the worst.$t$
    ),
    (
      'future-going-to-will',
      $t$Be going to + глагол — для планов, о которых вы уже договорились или решили заранее: I'm going to visit my aunt on Saturday. Не забывайте am / is / are перед going to. Will + глагол — для решений, принятых прямо в момент речи, а также для предложений помощи и обещаний: It's cold. I'll close the window. После will глагол идёт без to: will go, а не will to go.$t$,
      $t$Be going to + feʼl oldindan rejalashtirilgan ishlar uchun: I'm going to visit my aunt on Saturday. going to dan oldin am / is / are ni unutmang. Will + feʼl esa gapirayotgan paytda qabul qilingan qaror, yordam taklifi va vaʼdalar uchun: It's cold. I'll close the window. will dan keyin feʼl to siz keladi: will to go emas, will go.$t$
    ),
    (
      'countable-uncountable-quantifiers',
      $t$Исчисляемые существительные можно посчитать: one apple, two apples. Неисчисляемые — нельзя: water, money, information, advice. Внимание: information, advice, homework, furniture в английском неисчисляемые, хотя в русском их можно считать — у них нет -s (не informations). Many — с исчисляемыми, much — с неисчисляемыми, чаще в вопросах и отрицаниях: How many apples? I don't have much money. Some — в утвердительных предложениях, any — в вопросах и отрицаниях.$t$,
      $t$Sanaladigan otlarni sanash mumkin: one apple, two apples. Sanalmaydigan otlarni sanab boʻlmaydi: water, money, information, advice. Diqqat: information, advice, homework, furniture ingliz tilida sanalmaydi, shuning uchun ularga -s qoʻshilmaydi (informations emas). Many sanaladigan otlar bilan, much sanalmaydigan otlar bilan, koʻproq soʻroq va inkor gaplarda: How many apples? I don't have much money. Some darak gapda, any soʻroq va inkor gaplarda ishlatiladi.$t$
    ),
    (
      'a2-prepositions-of-time',
      $t$Предлоги времени: at — для точного времени и нескольких устойчивых выражений: at 7 o'clock, at noon, at night, at the weekend (британский вариант). on — для дней и дат: on Monday, on 21 March, on my birthday, on Friday morning. in — для более длинных периодов: in the morning, in July, in winter, in 2010. Перед this, next, last, every, today, tomorrow, yesterday предлог не нужен: I saw her last Monday. We're leaving next week.$t$,
      $t$Vaqt predloglari: at — aniq soat va baʼzi turgʻun iboralar uchun: at 7 o'clock, at noon, at night, at the weekend (Britaniya varianti). on — kunlar va sanalar uchun: on Monday, on 21 March, on my birthday, on Friday morning. in — uzunroq davrlar uchun: in the morning, in July, in winter, in 2010. this, next, last, every, today, tomorrow, yesterday dan oldin predlog qoʻyilmaydi: I saw her last Monday. We're leaving next week.$t$
    ),
    (
      'a2-present-perfect-experience',
      $t$Present perfect (have / has + третья форма глагола) рассказывает о жизненном опыте до настоящего момента, когда точное время не важно: I have visited Bukhara. She has never eaten sushi. Вопрос с ever: Have you ever flown on a plane? Краткие ответы: Yes, I have. / No, I haven't. Правильные глаголы в третьей форме оканчиваются на -ed (visited), неправильные нужно выучить: be → been, see → seen, eat → eaten, do → done. Been (а не gone) — если вы были где-то и вернулись. Если называете время (yesterday, in 2022, last summer), нужен past simple: I visited Bukhara last summer.$t$,
      $t$Present perfect (have / has + feʼlning uchinchi shakli) hozirgacha boʻlgan hayotiy tajriba haqida gapiradi, aniq vaqt muhim boʻlmaganda: I have visited Bukhara. She has never eaten sushi. ever bilan soʻroq: Have you ever flown on a plane? Qisqa javoblar: Yes, I have. / No, I haven't. Toʻgʻri feʼllarning uchinchi shakli -ed bilan tugaydi (visited), notoʻgʻri feʼllarni yodlash kerak: be → been, see → seen, eat → eaten, do → done. Biror joyga borib qaytgan boʻlsangiz, gone emas, been ishlating. Vaqtni aytsangiz (yesterday, in 2022, last summer), past simple kerak: I visited Bukhara last summer.$t$
    ),
    -- B1 ------------------------------------------------------------------
    (
      'past-simple-time-control',
      $t$Past simple используется для действий, которые закончились в известный момент прошлого. Слова-подсказки: yesterday, last week, in 2019, two days ago. Если в предложении есть такое слово, глагол должен быть в прошедшем времени, а не в настоящем. Правильные глаголы получают -ed (work → worked, study → studied), а многие частые глаголы неправильные, их формы нужно выучить: go → went, buy → bought, meet → met.$t$,
      $t$Past simple oʻtmishdagi maʼlum vaqtda tugagan ishlar uchun ishlatiladi. Yordamchi soʻzlar: yesterday, last week, in 2019, two days ago. Gapda shunday soʻz boʻlsa, feʼl hozirgi emas, oʻtgan zamonda boʻlishi kerak. Toʻgʻri feʼllarga -ed qoʻshiladi (work → worked, study → studied), koʻp ishlatiladigan feʼllarning esa koʻpi notoʻgʻri, ularning shakllarini yodlash kerak: go → went, buy → bought, meet → met.$t$
    ),
    (
      'prepositions-common-use',
      $t$Три главных предлога времени и места: at — для точного времени и конкретной точки (at 6 p.m., at the bus stop); on — для дней, дат и поверхностей (on Monday, on 5 May, on the wall); in — для месяцев, лет, частей суток и больших пространств (in July, in the morning, in Tashkent). Многие сочетания устойчивые, их проще запомнить целиком, чем переводить с русского: at night, at home, at work.$t$,
      $t$Vaqt va joyning uchta asosiy predlogi: at — aniq vaqt va aniq nuqta uchun (at 6 p.m., at the bus stop); on — kunlar, sanalar va sirtlar uchun (on Monday, on 5 May, on the wall); in — oylar, yillar, kun qismlari va katta hududlar uchun (in July, in the morning, in Tashkent). Koʻp birikmalar turgʻun, ularni oʻzbekchadan tarjima qilgandan koʻra butunligicha yodlab olgan maʼqul: at night, at home, at work.$t$
    ),
    (
      'subject-verb-agreement',
      $t$Глагол должен согласоваться с подлежащим. В present simple после he, she, it и существительного в единственном числе нужен -s: She works. Ищите настоящее подлежащее, а не ближайшее слово: в The list of names is long подлежащее — list, поэтому is, хотя рядом стоит names. Everyone, nobody, each требуют глагола в единственном числе: Everyone knows him.$t$,
      $t$Feʼl ega bilan moslashishi kerak. Present simple da he, she, it va birlikdagi otdan keyin -s kerak: She works. Feʼlga eng yaqin soʻzni emas, haqiqiy egani toping: The list of names is long gapida ega — list, shuning uchun yonida names tursa ham is ishlatiladi. Everyone, nobody, each birlikdagi feʼl talab qiladi: Everyone knows him.$t$
    ),
    (
      'present-perfect-vs-past-simple',
      $t$Если вы говорите, когда что-то произошло, используйте past simple: I visited Khiva in 2022. Present perfect (have / has + третья форма) — для опыта без указания времени и для ситуаций, которые начались в прошлом и продолжаются сейчас: I have visited Khiva twice. She has lived here since May. Обратите внимание: «Я живу здесь пять лет» по-английски — I have lived here for five years, а не I live here for five years. С законченным временем (yesterday, last year, ago) present perfect не употребляется.$t$,
      $t$Ish qachon boʻlganini aytsangiz, past simple ishlating: I visited Khiva in 2022. Present perfect (have / has + uchinchi shakl) vaqt koʻrsatilmagan tajriba uchun va oʻtmishda boshlanib hozir ham davom etayotgan holatlar uchun: I have visited Khiva twice. She has lived here since May. Eʼtibor bering: «Men bu yerda besh yildan beri yashayman» inglizchada I live here for five years emas, I have lived here for five years. Tugagan vaqt bilan (yesterday, last year, ago) present perfect ishlatilmaydi.$t$
    ),
    (
      'conditionals-first-second',
      $t$Первый тип условных предложений — о реальных, возможных ситуациях в будущем: If it rains, we will stay at home (if + present simple, затем will + глагол). Второй тип — о нереальных или маловероятных ситуациях: If I had more time, I would learn Korean (if + past simple, затем would + глагол). Главное правило: в части с if не ставят will и would, даже если по-русски там будущее время («Если я увижу…» — If I see…).$t$,
      $t$Birinchi tur shart gaplar kelajakdagi real, boʻlishi mumkin boʻlgan vaziyatlar haqida: If it rains, we will stay at home (if + present simple, keyin will + feʼl). Ikkinchi tur esa noreal yoki ehtimoli kam vaziyatlar haqida: If I had more time, I would learn Korean (if + past simple, keyin would + feʼl). Asosiy qoida: if qismida will va would ishlatilmaydi, maʼno kelajak haqida boʻlsa ham: If I see him, I will tell him.$t$
    ),
    (
      'used-to-past-habits',
      $t$Used to + глагол — о привычках и состояниях в прошлом, которых больше нет («раньше я…»): I used to play football every day. В вопросах и отрицаниях используется did, а use пишется без -d: Did you use to live here? I didn't use to like tea. После used to глагол идёт в начальной форме, без -ing. Для привычек в настоящем used to не подходит — говорите usually + present simple: I usually walk to work.$t$,
      $t$Used to + feʼl oʻtmishda boʻlib, hozir yoʻq boʻlgan odat va holatlar haqida («ilgari men…»): I used to play football every day. Soʻroq va inkor gaplarda did ishlatiladi, use esa -d siz yoziladi: Did you use to live here? I didn't use to like tea. used to dan keyin feʼl -ing siz, boshlangʻich shaklda keladi. Hozirgi odatlar uchun used to toʻgʻri kelmaydi — usually + present simple deng: I usually walk to work.$t$
    ),
    (
      'modals-of-obligation',
      $t$Must и have to означают «нужно, обязательно»: You must wear a seat belt. I have to work on Saturday. Should — это совет («стоит, следует»): You should see a doctor. Будьте внимательны с отрицаниями: mustn't — «нельзя, запрещено», а don't have to — «не обязательно, можно не делать». После must и should глагол идёт без to: must go, а не must to go.$t$,
      $t$Must va have to «kerak, majbur» degan maʼnoni beradi: You must wear a seat belt. I have to work on Saturday. Should esa maslahat bildiradi («…ganingiz maʼqul»): You should see a doctor. Inkor shakllarida ehtiyot boʻling: mustn't — «mumkin emas, taqiqlangan», don't have to esa «shart emas». must va should dan keyin feʼl to siz keladi: must to go emas, must go.$t$
    ),
    (
      'relative-clauses',
      $t$Придаточные определительные добавляют информацию о существительном (как русские «который», «где», «чей»). Who — для людей, which — для предметов, that — и для людей, и для предметов, where — для мест, whose — для принадлежности: the woman who lives next door, the book that I bought. Не используйте what вместо that и не повторяйте местоимение в конце: правильно the book that I bought, а не the book that I bought it.$t$,
      $t$Aniqlovchi ergash gaplar otga qoʻshimcha maʼlumot beradi. Oʻzbek tilida bu odatda sifatdosh bilan aytiladi («qoʻshnimiz boʻlgan ayol»), ingliz tilida esa maxsus soʻz kerak: who — odamlar uchun, which — narsalar uchun, that — ham odam, ham narsa uchun, where — joylar uchun, whose — egalik uchun: the woman who lives next door, the book that I bought. that oʻrnida what ishlatmang va olmoshni takrorlamang: the book that I bought it emas, the book that I bought.$t$
    ),
    (
      'gerund-or-infinitive',
      $t$Одни глаголы требуют после себя форму -ing: enjoy, finish, mind, avoid, suggest (I enjoy cooking). Другие — to + глагол: want, decide, hope, plan, need (I want to cook). После предлога (interested in, good at, before, after, for) всегда используется -ing: She is good at drawing. Некоторые глаголы, например like, love, start, допускают оба варианта. Такие сочетания лучше запоминать вместе с глаголом.$t$,
      $t$Baʼzi feʼllardan keyin -ing shakli keladi: enjoy, finish, mind, avoid, suggest (I enjoy cooking). Boshqalaridan keyin to + feʼl keladi: want, decide, hope, plan, need (I want to cook). Predlogdan keyin (interested in, good at, before, after, for) doim -ing ishlatiladi: She is good at drawing. Baʼzi feʼllar, masalan like, love, start, ikkala shakl bilan ham kela oladi. Bunday birikmalarni feʼl bilan birga yodlagan maʼqul.$t$
    ),
    -- B2 ------------------------------------------------------------------
    (
      'past-perfect',
      $t$Past perfect (had + третья форма глагола) показывает, что одно действие в прошлом произошло раньше другого прошедшего действия: When we arrived, the film had already started — сначала начался фильм, потом мы пришли. Это время часто встречается со словами already, just, never, before и by the time. Если порядок событий и так понятен благодаря before или after, можно использовать обычный past simple.$t$,
      $t$Past perfect (had + feʼlning uchinchi shakli) oʻtmishdagi bir ish boshqa oʻtgan ishdan oldin boʻlganini koʻrsatadi: When we arrived, the film had already started — avval film boshlangan, keyin biz kelganmiz. Bu zamon koʻpincha already, just, never, before va by the time soʻzlari bilan keladi. Agar voqealar tartibi before yoki after tufayli allaqachon tushunarli boʻlsa, oddiy past simple ham boʻladi.$t$
    ),
    (
      'passive-voice',
      $t$Страдательный залог (be + третья форма глагола) нужен, когда важнее само действие, а не тот, кто его совершил, или когда исполнитель неизвестен: The bridge was built last year. Время показывает глагол be: is made, was made, has been made, will be made. Не пропускайте be: правильно The carpet is made by hand, а не The carpet made by hand. Исполнителя добавляют через by, только если это полезная информация.$t$,
      $t$Majhul nisbat (be + feʼlning uchinchi shakli) ishni kim qilgani emas, ishning oʻzi muhim boʻlganda yoki bajaruvchi nomaʼlum boʻlganda ishlatiladi: The bridge was built last year. Zamonni be feʼli koʻrsatadi: is made, was made, has been made, will be made. be ni tushirib qoldirmang: The carpet made by hand emas, The carpet is made by hand. Bajaruvchi by orqali faqat bu maʼlumot foydali boʻlsa qoʻshiladi.$t$
    ),
    (
      'reported-speech',
      $t$Когда мы передаём чужие слова, время обычно сдвигается на шаг в прошлое: 'I am tired.' → She said (that) she was tired. Меняются и местоимения, и слова времени: 'I'll call you tomorrow.' → He said he would call me the next day. В косвенном вопросе порядок слов прямой, как в утверждении: She asked where I lived (а не where did I live). Для вопросов «да/нет» используйте if или whether. И помните: said to me или told me, но не said me.$t$,
      $t$Birovning gapini koʻchirma qilmasdan yetkazganda, zamon odatda bir pogʻona oʻtmishga suriladi: 'I am tired.' → She said (that) she was tired. Olmoshlar va vaqt soʻzlari ham oʻzgaradi: 'I'll call you tomorrow.' → He said he would call me the next day. Oʻzlashtirma soʻroq gapda soʻz tartibi darak gapdagidek boʻladi: She asked where I lived (where did I live emas). «Ha/yoʻq» savollari uchun if yoki whether ishlating. Yana bir narsa: said me emas, told me yoki said to me.$t$
    ),
    (
      'third-and-mixed-conditionals',
      $t$Третий тип условных предложений позволяет представить другое прошлое — то, чего не было: If I had left earlier, I would have caught the bus (но я не вышел раньше). Схема: if + had + третья форма, затем would have + третья форма. В части с if would have не ставится. Смешанный тип соединяет нереальное прошлое с результатом в настоящем: If I had studied medicine, I would be a doctor now.$t$,
      $t$Uchinchi tur shart gaplar oʻtmishni boshqacha tasavvur qilish uchun — boʻlmagan voqea haqida: If I had left earlier, I would have caught the bus (lekin men erta chiqmaganman). Tuzilishi: if + had + uchinchi shakl, keyin would have + uchinchi shakl. if qismida would have ishlatilmaydi. Aralash tur esa noreal oʻtmishni hozirgi natija bilan bogʻlaydi: If I had studied medicine, I would be a doctor now.$t$
    ),
    (
      'modals-of-deduction',
      $t$Модальные глаголы помогают делать выводы и предположения. Must — «наверняка, должно быть» (вы почти уверены, что это так): He must be at work. Might или could — «возможно»: She might be at home. Can't — «не может быть» (вы почти уверены, что это не так): That can't be true. Для прошлого добавьте have + третья форма: She must have missed the bus. They can't have seen us. Mustn't в этом значении не используется — для отрицательного вывода нужно can't.$t$,
      $t$Modal feʼllar taxmin va xulosa qilishga yordam beradi. Must — «aniq shunday boʻlsa kerak» (deyarli ishonchingiz komil): He must be at work. Might yoki could — «balki, ehtimol»: She might be at home. Can't — «boʻlishi mumkin emas» (bunday emasligiga deyarli ishonasiz): That can't be true. Oʻtmish uchun have + uchinchi shakl qoʻshing: She must have missed the bus. They can't have seen us. Bu maʼnoda mustn't ishlatilmaydi — inkor taxmin uchun can't kerak.$t$
    ),
    (
      'linking-contrast',
      $t$Слова для противопоставления: although и even though («хотя») требуют после себя полного предложения с подлежащим и глаголом: Although it was cold, we went out. Despite и in spite of («несмотря на») — существительного или формы -ing: Despite the cold, we went out. However («однако») обычно начинает новое предложение и отделяется запятой: It was cold. However, we went out. Не используйте although и but вместе, хотя по-русски «хотя…, но…» звучит нормально.$t$,
      $t$Qarama-qarshilik soʻzlari: although va even though («garchi …sa ham») dan keyin ega va kesimli toʻliq gap keladi: Although it was cold, we went out. Despite va in spite of («…ga qaramay») dan keyin ot yoki -ing shakli keladi: Despite the cold, we went out. However («biroq») odatda yangi gapni boshlaydi va vergul bilan ajratiladi: It was cold. However, we went out. although va but ni bitta gapda birga ishlatmang.$t$
    ),
    (
      'b2-non-defining-relative-clauses',
      $t$Неопределительное придаточное добавляет дополнительную информацию о том, что и так понятно, и выделяется запятыми: My sister, who lives in Seoul, is a nurse. Используйте who для людей, which для предметов, whose для принадлежности, where для мест и when для времени. В таком придаточном нельзя использовать that и нельзя опускать местоимение. Which может относиться ко всей предыдущей мысли: He passed the exam, which surprised everyone. Определительное придаточное пишется без запятых, потому что уточняет, о ком речь: The man who called you is my uncle.$t$,
      $t$Aniqlamaydigan ergash gap allaqachon tushunarli boʻlgan narsaga qoʻshimcha maʼlumot beradi va vergullar bilan ajratiladi: My sister, who lives in Seoul, is a nurse. Odamlar uchun who, narsalar uchun which, egalik uchun whose, joylar uchun where, vaqt uchun when ishlating. Bunday ergash gapda that ishlatib boʻlmaydi va olmoshni tushirib qoldirib boʻlmaydi. which oldingi butun fikrga ham ishora qila oladi: He passed the exam, which surprised everyone. Aniqlovchi ergash gap esa vergulsiz yoziladi, chunki u kim haqida gap ketayotganini aniqlaydi: The man who called you is my uncle.$t$
    ),
    (
      'b2-verbs-ing-or-to-meaning',
      $t$После некоторых глаголов возможны и -ing, и to + глагол, но смысл меняется. remember / forget + -ing — воспоминание о том, что уже сделано: I remember locking the door. remember / forget + to — то, что нужно сделать: Remember to lock the door. stop + -ing — перестать: He stopped smoking; stop + to — остановиться, чтобы сделать что-то другое: He stopped to buy water. try + -ing — попробовать как способ решения: Try restarting the laptop; try + to — постараться сделать что-то трудное: I tried to open the window. regret + -ing — сожалеть о прошлом; regret + to — официально сообщать плохую новость: We regret to inform you… go on + -ing — продолжать то же; go on + to — перейти к новому. Выбирайте форму по смыслу, а не на слух.$t$,
      $t$Baʼzi feʼllardan keyin -ing ham, to + feʼl ham kelishi mumkin, lekin maʼno oʻzgaradi. remember / forget + -ing — allaqachon qilingan ishni eslash: I remember locking the door. remember / forget + to — qilinishi kerak boʻlgan ish: Remember to lock the door. stop + -ing — toʻxtatmoq, tashlamoq: He stopped smoking; stop + to — boshqa ish qilish uchun toʻxtamoq: He stopped to buy water. try + -ing — yordam berarmikan deb sinab koʻrmoq: Try restarting the laptop; try + to — qiyin ishni qilishga urinmoq: I tried to open the window. regret + -ing — oʻtmishdagi ishdan afsuslanmoq; regret + to — yomon xabarni rasmiy yetkazmoq: We regret to inform you… go on + -ing — shu ishni davom ettirmoq; go on + to — yangi ishga oʻtmoq. Shaklni eshitilishiga qarab emas, maʼnosiga qarab tanlang.$t$
    ),
    -- C1 ------------------------------------------------------------------
    (
      'inversion-negative-adverbials',
      $t$В формальной или эмоциональной речи, если предложение начинается с отрицательного или ограничительного выражения (never, rarely, seldom, not only, no sooner, only later, under no circumstances), вспомогательный глагол ставится перед подлежащим, как в вопросе: Never have I seen such a view. Если вспомогательного глагола нет, добавляется do, does или did: Not only did she win, she also broke the record. Обычный порядок слов здесь ошибка: не Never I have seen…$t$,
      $t$Rasmiy yoki taʼkidli nutqda gap inkor yoki cheklovchi ibora bilan boshlansa (never, rarely, seldom, not only, no sooner, only later, under no circumstances), yordamchi feʼl xuddi soʻroq gapdagidek egadan oldin keladi: Never have I seen such a view. Yordamchi feʼl boʻlmasa, do, does yoki did qoʻshiladi: Not only did she win, she also broke the record. Bu yerda odatiy soʻz tartibi xato hisoblanadi: Never I have seen… emas.$t$
    ),
    (
      'cleft-sentences',
      $t$Расщеплённое предложение делит одну мысль на две части, чтобы выделить главное — в русском это часто передаётся словами «именно» или «вот что». It is / was … that / who выделяет человека, предмет, время или место: It was my aunt who taught me to cook (именно тётя научила меня готовить). What … is / was выделяет действие или идею: What I need is a long holiday. Типичные ошибки: what после It was (It was my sister what…) и лишнее it после what-части (What I need it is…).$t$,
      $t$Ajratilgan gap bitta fikrni ikki qismga boʻlib, asosiysini taʼkidlaydi — oʻzbek tilida bu koʻpincha «aynan» yoki «…gan narsa — …» shaklida aytiladi. It is / was … that / who odamni, narsani, vaqtni yoki joyni ajratib koʻrsatadi: It was my aunt who taught me to cook (menga ovqat pishirishni aynan xolam oʻrgatgan). What … is / was esa harakat yoki fikrni taʼkidlaydi: What I need is a long holiday. Odatiy xatolar: It was dan keyin what (It was my sister what…) va what qismidan keyin ortiqcha it (What I need it is…).$t$
    ),
    (
      'participle-clauses',
      $t$Причастный оборот может заменить целое придаточное и сделать текст короче — похоже на русские деепричастные и причастные обороты. Форма -ing передаёт активное значение: Feeling tired, I went to bed early. Третья форма глагола — пассивное: Built in 1910, the house needs repairs. Having + третья форма показывает, что одно действие закончилось раньше другого: Having finished the report, she went home. Главное правило: у оборота и основной части должно быть одно и то же подлежащее. Walking home, the rain started — ошибка, ведь домой шёл не дождь.$t$,
      $t$Sifatdosh oʻrami butun bir ergash gap oʻrnini bosib, matnni qisqartiradi — oʻzbek tilidagi ravishdosh va sifatdosh oʻramlariga oʻxshaydi. -ing shakli faol maʼnoni beradi: Feeling tired, I went to bed early. Feʼlning uchinchi shakli majhul maʼnoni beradi: Built in 1910, the house needs repairs. Having + uchinchi shakl bir ish ikkinchisidan oldin tugaganini koʻrsatadi: Having finished the report, she went home. Asosiy qoida: oʻram va asosiy gapning egasi bir xil boʻlishi kerak. Walking home, the rain started xato, chunki uyga yomgʻir yurmagan.$t$
    ),
    (
      'modals-past-should-neednt',
      $t$Should have + третья форма — критика или сожаление о прошлом («надо было»): I should have left earlier. Needn't have + третья форма — кто-то сделал то, что было не нужно («зря, можно было не»): You needn't have brought food. We had plenty. Could have + третья форма — возможность в прошлом, которая не осуществилась («могли бы»): We could have won. После should и could не ставят прошедшее время (не should went) и не забывают have.$t$,
      $t$Should have + uchinchi shakl oʻtmishdagi ishni tanqid qilish yoki afsuslanish uchun («…sam boʻlar edi»): I should have left earlier. Needn't have + uchinchi shakl kimdir kerak boʻlmagan ishni qilganini bildiradi («…shingiz shart emas edi»): You needn't have brought food. We had plenty. Could have + uchinchi shakl oʻtmishda boʻlishi mumkin boʻlgan, lekin boʻlmagan imkoniyat haqida («…shimiz mumkin edi»): We could have won. should va could dan keyin oʻtgan zamon shakli kelmaydi (should went emas) va have ni unutmang.$t$
    ),
    (
      'wish-and-if-only',
      $t$Wish или if only + past simple — о настоящей ситуации, которую хотелось бы изменить: I wish I lived closer to work (жаль, что я живу далеко). Wish + past perfect — сожаление о прошлом: I wish I had studied harder. Wish + would — недовольство тем, что хотелось бы изменить в поведении другого человека: I wish you would stop interrupting. В формальном английском were используется для всех лиц: I wish I were taller. После wish не ставят настоящее время или will: не I wish I can…, а I wish I could…$t$,
      $t$Wish yoki if only + past simple hozirgi vaziyat boshqacha boʻlishini xohlaganda ishlatiladi: I wish I lived closer to work (afsuski, uzoqda yashayman). Wish + past perfect oʻtmishdan afsuslanish uchun: I wish I had studied harder. Wish + would boshqa odamning xatti-harakatidan norozilik uchun: I wish you would stop interrupting. Rasmiy ingliz tilida barcha shaxslar uchun were ishlatiladi: I wish I were taller. wish dan keyin hozirgi zamon yoki will kelmaydi: I wish I can… emas, I wish I could…$t$
    ),
    (
      'c1-passive-reporting-structures',
      $t$В официальных текстах и новостях часто сообщают, что говорят или думают люди, не называя их, — как русские «считается, что», «говорят, что». Для этого глагол сообщения (say, think, believe, report, expect, know, consider, claim) ставят в пассив по одной из двух схем. 1) It + пассив + that: It is believed that the fire started in the kitchen. 2) Подлежащее + пассив + инфинитив: The fire is believed to have started in the kitchen. Во второй схеме инфинитив выбирают по времени: to + глагол — то же время или будущее (He is said to live in Paris); to be + -ing — действие в процессе (She is thought to be working on a new novel); to have + третья форма — более раннее действие (The thieves are reported to have escaped by car). Не смешивайте схемы: не He is said that he…$t$,
      $t$Rasmiy matnlar va yangiliklarda odamlar nima deyayotgani yoki oʻylayotgani ularning nomini aytmasdan yetkaziladi — «aytilishicha», «taxmin qilinishicha» kabi. Buning uchun xabar feʼli (say, think, believe, report, expect, know, consider, claim) majhul nisbatda ikki usulda ishlatiladi. 1) It + majhul nisbat + that: It is believed that the fire started in the kitchen. 2) Ega + majhul nisbat + infinitiv: The fire is believed to have started in the kitchen. Ikkinchi usulda infinitiv vaqtga qarab tanlanadi: to + feʼl — bir vaqtda yoki kelajakda (He is said to live in Paris); to be + -ing — davom etayotgan ish (She is thought to be working on a new novel); to have + uchinchi shakl — oldinroq boʻlgan ish (The thieves are reported to have escaped by car). Ikki usulni aralashtirmang: He is said that he… emas.$t$
    ),
    -- C2 ------------------------------------------------------------------
    (
      'subjunctive-formal-structures',
      $t$После глаголов и выражений suggest, recommend, insist, demand, request, it is essential that в формальном английском используется начальная форма глагола для любого подлежащего — без -s и без will: The doctor recommended that he rest for a week. Отрицание — not + начальная форма: We ask that guests not smoke. В британском английском часто говорят с should: …that he should rest. Обратите внимание: после suggest и recommend нельзя использовать конструкцию «кто-то + to + глагол» (suggest someone to do) — нужна that-часть или -ing.$t$,
      $t$suggest, recommend, insist, demand, request va it is essential that kabi feʼl va iboralardan keyin rasmiy ingliz tilida har qanday ega bilan feʼlning boshlangʻich shakli ishlatiladi — -s siz va will siz: The doctor recommended that he rest for a week. Inkor — not + boshlangʻich shakl: We ask that guests not smoke. Britaniya ingliz tilida koʻpincha should bilan aytiladi: …that he should rest. Eʼtibor bering: suggest va recommend dan keyin «kimnidir + to + feʼl» (suggest someone to do) qurilmasi ishlatilmaydi — that qismi yoki -ing kerak.$t$
    ),
    (
      'hedging-and-ellipsis',
      $t$Hedging — смягчение утверждения, чтобы оно звучало осторожнее; это обычно для академических и деловых текстов: It would appear that…, This may suggest…, The results tend to show… Эллипсис — пропуск слов, которые читателю и так понятны, чтобы не повторяться. Вместо повторяемой части используют вспомогательный глагол, so, not или to: I haven't finished, but she has. I hope not. I'd like to. Говорите I think so и I hope not, а не I think yes и I hope no.$t$,
      $t$Hedging — fikrni ehtiyotkorroq ifodalash; bu akademik va ish yozishmalarida keng tarqalgan: It would appear that…, This may suggest…, The results tend to show… Ellipsis esa oʻquvchiga tushunarli boʻlgan soʻzlarni takrorlamaslik uchun tushirib qoldirishdir. Takrorlanadigan qism oʻrnida yordamchi feʼl, so, not yoki to ishlatiladi: I haven't finished, but she has. I hope not. I'd like to. I think yes va I hope no emas, I think so va I hope not deng.$t$
    ),
    (
      'c2-inverted-conditionals',
      $t$В формальном английском if в условном предложении можно опустить, поставив вспомогательный глагол перед подлежащим. Should + подлежащее + глагол — для возможных, но маловероятных событий, особенно в официальных письмах: Should you require further information, please contact us. Were + подлежащее + to + глагол — для гипотетических ситуаций: Were the university to raise its fees, many students would leave; с глаголом be — просто were: Were I in your position, I would decline the offer. Had + подлежащее + третья форма — в третьем и смешанном типе: Had we left earlier, we would have caught the train. Were it not for (настоящее) и Had it not been for (прошлое) значат «если бы не». В отрицании not идёт после подлежащего и не сокращается: Had I not seen it (не Hadn't I seen it). If вместе с инверсией не используется.$t$,
      $t$Rasmiy ingliz tilida shart gapdagi if tushirib qoldirilib, yordamchi feʼl egadan oldinga chiqarilishi mumkin. Should + ega + feʼl — boʻlishi mumkin, lekin ehtimoli kam voqealar uchun, ayniqsa rasmiy xatlarda: Should you require further information, please contact us. Were + ega + to + feʼl — faraziy vaziyatlar uchun: Were the university to raise its fees, many students would leave; be feʼli bilan shunchaki were: Were I in your position, I would decline the offer. Had + ega + uchinchi shakl — uchinchi va aralash tur shart gaplarda: Had we left earlier, we would have caught the train. Were it not for (hozirgi) va Had it not been for (oʻtgan) «…boʻlmaganda edi» degan maʼnoni beradi. Inkorda not egadan keyin keladi va qisqartirilmaydi: Had I not seen it (Hadn't I seen it emas). Inversiya bilan birga if ishlatilmaydi.$t$
    ),
    (
      'c2-tricky-subject-verb-agreement',
      $t$В тщательно написанном тексте глагол согласуется с главным словом подлежащего, а не с ближайшим существительным: The quality of the photos is poor. Выражения along with, as well as, together with подлежащее не меняют: The director, as well as her assistants, is attending. A number of + множественное число требует глагола во множественном числе (A number of problems have arisen), а the number of — в единственном (The number of applicants has doubled). Each, either, neither (of) в формальном стиле — с единственным числом: Neither of the reports mentions the cost. Majority, half, the rest и дроби согласуются со словом после of: Half of the money was stolen; half of the students were absent. Количество как единое целое — единственное число: Ten kilometres is a long way to walk. С either … or и neither … nor глагол согласуется с ближайшим подлежащим: Neither the manager nor the staff were informed.$t$,
      $t$Puxta yozilgan matnda feʼl eng yaqin otga emas, eganing asosiy soʻziga moslashadi: The quality of the photos is poor. along with, as well as, together with iboralari egani oʻzgartirmaydi: The director, as well as her assistants, is attending. A number of + koʻplikdagi ot koʻplikdagi feʼl talab qiladi (A number of problems have arisen), the number of esa birlikdagi feʼl bilan keladi (The number of applicants has doubled). Each, either, neither (of) rasmiy uslubda birlikdagi feʼl bilan ishlatiladi: Neither of the reports mentions the cost. Majority, half, the rest va kasrlar of dan keyingi otga moslashadi: Half of the money was stolen; half of the students were absent. Bir butun deb qaraladigan miqdor birlikdagi feʼl oladi: Ten kilometres is a long way to walk. either … or va neither … nor bilan feʼl yaqinroq turgan egaga moslashadi: Neither the manager nor the staff were informed.$t$
    )
  )
  update public.grammar_units gu
  set metadata = coalesce(gu.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'explanation_ru', e.ru,
      'explanation_uz', e.uz,
      'handbook_seeded_by', '20261024123000_english_grammar_handbook'
    )
  from explanations e
  where gu.slug = e.slug
    and gu.product_id = v_grammar_product_id
    and gu.language_id = v_en_id;

  get diagnostics v_updated = row_count;
  raise notice 'grammar handbook: explanations merged into % grammar units', v_updated;
end;
$$;
