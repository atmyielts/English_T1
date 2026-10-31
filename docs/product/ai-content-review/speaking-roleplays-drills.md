## Speaking (packages/coach-packs/speaking/roleplays.ts)
Counts: language 33 · fact 1 · answer 0 · consistency 4 · honesty 0 · placeholder 0

All 16 role-plays read in full (titles, settings, learner roles, goals, personas, hidden state, rules, goal checks, level notes).

### Changes
- `roleplays.ts:~250-270` (fact) rp.airport-checkin: the excess fee had no currency ("the fee is 15 per extra kilo", "fifteen per kilo"), so the persona could not name a price → "15 dollars per extra kilo", "fifteen dollars a kilo". The airport is not named, so I used dollars.
- `roleplays.ts:~302` (consistency) rp.hotel-room-problem `free_rooms`: the description said only the upgrade was free, but the rules offer "a smaller room on another floor" at goodwill 4–6 → "The best room free tonight: a quiet upgraded room on the 6th floor (a smaller room on another floor is free too)…".
- `roleplays.ts:~322` (consistency) hotel goal `outcome` check: "the learner knows what will happen" cannot be quoted from the learner → "the learner states or checks what will happen and when…".
- `roleplays.ts:~870-907` (consistency) rp.day-off-request: "next Friday" on a Monday is ambiguous (the pack's own phrase card `ph.meetings.just-to-clarify` makes this point), and the rules need this week's Friday (report done before Friday, deadline next Monday) → "this Friday" in en, "shu juma kuni" in uz, "в эту пятницу" in ru. The goal check now reads "asks for Friday off", so a learner who says "next Friday" still gets the tick.
- `roleplays.ts:~1000` (consistency) rp.late-delivery-call: the `realistic` check expects "a specific realistic date (next Wednesday)", but the learner was never told the date → setting now adds "next Wednesday instead of this Friday" (en/uz/ru). This fits the rules ("all the chairs by Friday" is impossible, 40 chairs by Thursday, opening on Saturday).
- `roleplays.ts:~149` (language / suitability) ru party: "гостья с бокалом" (a wine glass) → "с напитком в руке", matching the neutral en "a drink" for school-age learners.
- `roleplays.ts:17` (language) en "a quiet apartment building" → "a quiet block of flats" (British; the same text says "flat opposite").
- Uzbek fixes:
  - "to‘xtash joyi qoidalarini yaxshi bilmaysiz" → "mashina qo‘yish qoidalarini aniq bilmaysiz".
  - "O‘zingizni ismingiz va bitta tafsilot bilan tanishtiring" → "O‘zingizni tanishtiring: ismingiz va o‘zingiz haqingizda bitta ma’lumot".
  - "hech qachon chinakamiga gaplashmagansiz" → "hali hech qachon rosmana suhbatlashmagansiz".
  - "Suhbatdan … chiqing" → "Suhbatni xushmuomalalik bilan yakunlang".
  - gate "chiqish yo‘lagi" (yo‘lak = aisle/corridor) → "chiqish eshigi".
  - Hotel: "har bir necha daqiqada yoningizdagi lift" → "har necha daqiqada devor ortidagi liftning shovqini", and "endi qaytdingiz" → "hozirgina qaytdingiz".
  - Directions: "quyoshli kunduzi" → "quyoshli kun, tushdan keyin"; the learner role was rewritten; "qaytarishni … yoki yo‘lni qaytarib tekshiring" (qaytarish = return) → "takrorlashni so‘rang yoxud yo‘lni o‘zingiz takrorlab tekshiring".
  - Train: "Ulanadigan poyezdingiz" (a calque) → "Sizni bu yerga olib kelgan poyezd"; "soat sakkizdagi oilaviy kechki ovqatga" → "kechqurun soat sakkizda … oilaviy kechki ovqatda"; "bugungi keyingi poyezdga" → "bugun keyinroq jo‘naydigan poyezdga"; "Vaqtida yetkazadigan" → "Sizni vaqtida yetkazadigan".
  - Café: "shu yerda yoki olib ketish haqidagi" → "shu yerdami yoki olib ketasizmi degan".
  - Shoes: the title "cheksiz qaytarish" read as "endless/unlimited return" → "chek bo‘lmasa ham qaytarish"; the sole "tagi" → "tagcharmi".
  - Bank: "mijozlarga xizmat ko‘rsatish liniyasiga" → "mijozlarni qo‘llab-quvvatlash xizmatiga".
  - GP: the title "Alomatlar bilan shifokor qabulida" → "Shifokor qabulida: alomatlar haqida"; "nima kuchaytiradi" → "qanday og‘riq, nimadan kuchayadi".
  - Pharmacy: "katta ko‘chadagi" (high-street) → "markaziy ko‘chadagi"; "uxlash va ishga borishga yordam beradigan biror narsa" was rewritten.
  - Job interview: "Tajribangizni aniq tartibda tanishtiring" → "Tajribangiz haqida aniq va izchil gapirib bering".
  - Day off: cover goal "Ishingiz qanday bajarilishini" → "Yo‘qligingizda ishingiz qanday bajarilishini".
  - Meeting: "ikki hafta oldin chiqarishni" (reads as "two weeks ago") → "ikki hafta ertaroq"; "Qarshi tomonni" → "Boshqa tomonni".
  - Late delivery: the title "Kechikkan yetkazib berish haqida" → "Buyurtma kechikishi haqida".
- Russian fixes:
  - "Расскажите о себе с причиной или примером" → "Расскажите о себе и приведите причину или пример".
  - "Вежливо выйдите из разговора" → "Вежливо завершите разговор".
  - Directions: "Старый город, в котором вы гостите" → "Старая часть города, куда вы приехали"; the learner role was rewritten; "либо повторите маршрут" → "…, чтобы проверить себя".
  - Train: "Ваш пересадочный поезд … пропустили поезд" → "Поезд, на котором вы ехали до пересадки, … опоздали на поезд".
  - Bank: "чтобы снова платить" → "чтобы вы снова могли платить"; "как платить пока" → "как вам пока расплачиваться".
  - Pharmacy: "что-то, чтобы спать" → "средство, чтобы нормально спать"; "можно ли садиться за руль" → "можно ли после него садиться за руль".
  - Job interview: "Его проводит руководитель поддержки, на английском." → "…руководитель отдела поддержки на английском языке."
  - Day off: "как будет прикрыта ваша работа" → "как будет сделана ваша работа, пока вас нет".
  - Late delivery: "из-за отсутствующего сертификата" → "из-за отсутствия сертификата".
- (language) en pharmacy goal "whether it is safe with driving" → "whether it is safe to drive".

### [VERIFY]
- rp.friends-party: Olivia is "Kamila’s cousin". The name pairing is plausible if Kamila is Polish/Czech or from a mixed family, and the city is not named. I left it. Change the persona's name only if the owner reads Kamila as Uzbek.
- rp.train-ticket-change: the "10-pound change fee for advance tickets" and "a railway delay allows a free change" are stated as rules. They are fictional practice figures. Real UK missed-connection rules may differ. This is fine as fiction, but the owner may want it confirmed.
- rp.airport-checkin: I chose USD for the fee because the airport is not named. The owner may prefer another currency.
- `calibration.ts:125` (another reviewer's file): the task text says "day off next Friday". It could now say "this Friday". The learner sample text must stay as it is.

## Speaking (packages/coach-packs/speaking/drills.ts)
Counts: language 8 · fact 5 · answer 5 · consistency 2 · honesty 0 · placeholder 0

All 10 drills (80 items) read. Every key was checked for being the only right answer.

### Changes
- (answer) Open gap items where another correct word was marked wrong. The prompt is tightened; keys unchanged:
  - `mb3` "Complete with one word: My brother ___ a doctor" ("was" and "became" are also correct) → "Complete with am, is or are: …".
  - `mb6` "We ___ from Uzbekistan" ("come" is also correct and very common) → "Complete with am, is or are: …".
  - `qf4` "What time ___ the museum open?" ("did" and "will" also fit) → "Complete with do or does: …".
  - `ar3` "I bought ___ umbrella yesterday" ("the" fits if the umbrella is known) → "It started raining, so I bought ___ umbrella."
  - `wo3` "This city I like very much." is possible as a fronted, contrastive sentence → the prompt now says "Choose the most natural sentence".
- (language) `vt5` "I’m meeting the doctor" (unnatural for an appointment) → "I’m seeing the doctor"; the options and en/uz/ru explanations follow ("Will seeing"). The option order and key are unchanged.
- (fact) `mb4`, `qf3`: "rising intonation alone sounds unsure" is not the reason. A declarative question sounds surprised or like checking → "sounds surprised (or too casual), not like a normal question" in en/uz/ru.
- (fact) `ar6`: "Superlatives always take the" overgeneralises ("my best friend") → "take the" (dropped "always / doim / всегда").
- (fact) False-friends explain and `ff1`: en "Magazine is a journal" is wrong in English ("journal" means an academic publication or a diary) → "A magazine is something you read (with articles and photos)". The uz "jurnal" and ru "журнал" stay; they are correct.
- (fact) Word-order explain: "English sentences follow S–V–O (not This city I really like)" → "normally follow". uz "odatiy tartibi", ru "обычный порядок".
- (consistency) Verb-tense explain: uz/ru had "«I live here since two years» is wrong" but en did not → added "not I live here since two years" to en. In `vt8`, en/uz said "Uzbek and Russian use the present here", but ru mentioned only Russian → "В русском и узбекском".
- (language) Other fixes:
  - `po4` "No, thanks — I’m fine." The explanation promised a "friendly reason", and "I'm fine" is none → "No, thanks — I’m full. It was delicious." Option order and key are unchanged.
  - `po4` ru "Голое «No»" → "Одно лишь «No»".
  - `po5` "Could someone have a look?" (odd for an uncleaned room) → "Could someone come and clean it, please?"
  - `po8` uz "uzr so‘rang, keyin so‘rang" → "keyin savolingizni bering".
  - `vt6` uz "fon harakat … uni bo‘lgan" → "fon harakati … uni bo‘lib qo‘ygan … ifodalanadi".
  - `pl7` uz "piyolalar" (tea bowls) → "chashkalar".
  - missing_be ru "Если действия нет" → "Если глагола действия нет".
  - articles ru "общие множественные и неисчисляемые" → "множественное число и неисчисляемые в общем смысле".

### [VERIFY]
- `po6` "Would you ___ opening the window?" accepts only "mind". "Consider" and "try" are also grammatical. I left it, because the drill's target is "Would you mind".

### Glossary proposals
- Airport gate: en "gate", uz "chiqish eshigi", ru "выход (на посадку)". The pack had "chiqish yo‘lagi", which is wrong. This helps any future travel content.

### Checks run
- `check.ts speaking`: ✓ (38 activities, exit 0).
- `calibration.ts speaking`: ✓ (exact 0.785, adjacent 1, MAE 0.108, evidence 0.965; exit 0).
- `deno test --no-lock packages/coach-packs/test/`: 22 passed, 0 failed.
- `deno test --no-lock supabase/functions/schood-ai/coach/`: 32 passed, 0 failed.
