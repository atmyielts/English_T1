-- ============================================================================
-- English Listening library: 30 scripted listening activities (A1-C2).
-- ----------------------------------------------------------------------------
-- Each item is one ~5 minute activity: listen to the script (read aloud by
-- the browser's text-to-speech; audio_url stays null), answer 3-4
-- comprehension questions, then write down two key sentences (dictation).
--
-- - Rewrites the 3 original one-sentence items (same slugs, so earlier
--   attempts stay linked) and adds 27 more:
--   A1 5, A2 6, B1 6, B2 6, C1 5, C2 2.
-- - Dialogue scripts use one "Name: line" per line (2 speakers).
-- - questions: [{id, type:'mcq', prompt, options, answer_index, explanation}].
--   Answer keys stay server-side (listening-content strips them).
-- - listening_segments: exactly the 2 dictation sentences per item, each an
--   exact sentence from the script, with a focus phrase.
-- - Registers every item in learning_content_registry_items as
--   'listening.item' (source_ref = slug).
-- Idempotent: upserts on natural keys; segments for these items are replaced.
-- Generated from reviewed content; word counts / durations are computed
-- (duration = words / 2.3 (A), 2.45 (B), 2.6 (C) words per second).
-- ============================================================================

-- Normally added by the activity-questions migration; repeated here so this
-- file does not depend on migration order.
alter table public.listening_items
  add column if not exists questions jsonb not null default '[]'::jsonb;

do $$
declare
  v_en_id uuid;
  v_product_id uuid;
begin
  select id into v_en_id from public.languages where code = 'en' limit 1;

  select p.id into v_product_id
  from public.products p
  where lower(coalesce(p.metadata->>'slug', '')) = 'english-listening'
  order by p.created_at asc
  limit 1;

  if v_en_id is null or v_product_id is null then
    raise exception 'english-listening product or en language not found; seed them first';
  end if;

  insert into public.listening_items (
    product_id, language_id, slug, title, summary, transcript_text,
    level, category, accent, speed_label, speed_wpm, duration_seconds, audio_url, focus_skill,
    tags, status, sort_order, metadata, questions
  )
  values
    (
      v_product_id, v_en_id, $t$a1-metro-next-station$t$,
      $t$Next Station on the Metro$t$,
      $t$A short metro announcement: the next station, the doors and the next train.$t$,
      $t$Good morning, passengers. This train goes to Chilonzor. The next station is Novza. Please stand back from the doors. The doors are closing now. Please hold the handrail and give your seat to older people. The next train comes in five minutes. Thank you, and have a nice day.$t$,
      $t$A1$t$, $t$Travel$t$, 'general', 'slow', 140, 21, null, $t$detail$t$,
      array[$t$metro$t$, $t$transport$t$, $t$numbers$t$]::text[],
      'published', 110,
      $t${"seeded_by":"20261022130000_english_listening_library","format":"monologue","script_type":"announcement","speakers":[],"word_count":49,"tts":true}$t$::jsonb,
      $t$[{"id":"q1","type":"mcq","prompt":"What is the next station?","options":["Chilonzor","Novza","Yunusobod","Amir Temur"],"answer_index":1,"explanation":"The speaker says: \"The next station is Novza.\" Chilonzor is where the train goes at the end."},{"id":"q2","type":"mcq","prompt":"What should passengers hold?","options":["Their tickets","The doors","The handrail","Their bags"],"answer_index":2,"explanation":"The speaker says: \"Please hold the handrail.\""},{"id":"q3","type":"mcq","prompt":"Who should get a seat?","options":["Older people","Students","Tourists","Children"],"answer_index":0,"explanation":"Passengers should \"give your seat to older people\"."},{"id":"q4","type":"mcq","prompt":"When does the next train come?","options":["In two minutes","In five minutes","In ten minutes","In fifteen minutes"],"answer_index":1,"explanation":"The speaker says: \"The next train comes in five minutes.\""}]$t$::jsonb
    ),
    (
      v_product_id, v_en_id, $t$a1-voicemail-plov-tonight$t$,
      $t$A Message About Dinner$t$,
      $t$A friend leaves a voicemail: where she is, what she is cooking and what to bring.$t$,
      $t$Hi Kamola, it's Malika. I'm at the market now. I want to cook plov tonight. Can you come to my flat at seven o'clock? Please bring some bread and a bottle of water. My sister is coming too. Call me back when you get this message. See you tonight. Bye!$t$,
      $t$A1$t$, $t$Daily life$t$, 'general', 'slow', 136, 22, null, $t$detail$t$,
      array[$t$voicemail$t$, $t$food$t$, $t$time$t$]::text[],
      'published', 120,
      $t${"seeded_by":"20261022130000_english_listening_library","format":"monologue","script_type":"voicemail","speakers":[],"word_count":50,"tts":true}$t$::jsonb,
      $t$[{"id":"q1","type":"mcq","prompt":"Where is Malika now?","options":["At home","At the market","At work","At the metro station"],"answer_index":1,"explanation":"Malika says: \"I'm at the market now.\""},{"id":"q2","type":"mcq","prompt":"What does Malika want to cook?","options":["Soup","A cake","Plov","Salad"],"answer_index":2,"explanation":"She says: \"I want to cook plov tonight.\""},{"id":"q3","type":"mcq","prompt":"What time should Kamola come?","options":["At six o'clock","At seven o'clock","At eight o'clock","At nine o'clock"],"answer_index":1,"explanation":"Malika asks: \"Can you come to my flat at seven o'clock?\""},{"id":"q4","type":"mcq","prompt":"What should Kamola bring?","options":["Bread and water","Rice and carrots","Tea and sugar","Fruit and juice"],"answer_index":0,"explanation":"Malika says: \"Please bring some bread and a bottle of water.\""}]$t$::jsonb
    ),
    (
      v_product_id, v_en_id, $t$a1-new-classmate$t$,
      $t$A New Classmate$t$,
      $t$Two students meet on the first day: where they are from and how they travel.$t$,
      $t$Aziz: Hi! Are you new in this class?
Sara: Yes, I am. My name is Sara. I'm from Samarkand.
Aziz: Nice to meet you, Sara. I'm Aziz. Do you live near the university?
Sara: No, I live with my aunt in Yunusobod. I come here by bus.
Aziz: I come by metro. It's fast. Our English lesson starts at nine.
Sara: Thank you! See you in class.$t$,
      $t$A1$t$, $t$Work and Study$t$, 'general', 'slow', 136, 27, null, $t$conversation$t$,
      array[$t$dialogue$t$, $t$introductions$t$, $t$university$t$]::text[],
      'published', 130,
      $t${"seeded_by":"20261022130000_english_listening_library","format":"dialogue","script_type":"dialogue","speakers":["Aziz","Sara"],"word_count":61,"tts":true}$t$::jsonb,
      $t$[{"id":"q1","type":"mcq","prompt":"Where is Sara from?","options":["Bukhara","Tashkent","Samarkand","Khiva"],"answer_index":2,"explanation":"Sara says: \"I'm from Samarkand.\""},{"id":"q2","type":"mcq","prompt":"Who does Sara live with?","options":["Her parents","Her aunt","A friend","Her sister"],"answer_index":1,"explanation":"Sara says: \"I live with my aunt in Yunusobod.\""},{"id":"q3","type":"mcq","prompt":"How does Aziz come to the university?","options":["By bus","By taxi","On foot","By metro"],"answer_index":3,"explanation":"Aziz says: \"I come by metro. It's fast.\""},{"id":"q4","type":"mcq","prompt":"When does the English lesson start?","options":["At eight","At nine","At ten","At eleven"],"answer_index":1,"explanation":"Aziz says: \"Our English lesson starts at nine.\""}]$t$::jsonb
    ),
    (
      v_product_id, v_en_id, $t$a1-shop-closing-soon$t$,
      $t$The Shop Closes Soon$t$,
      $t$A shop announcement: where the fruit and the café are, and when the shop closes.$t$,
      $t$Hello, shoppers! Today we have fresh fruit from local farms. Apples and pears are on the first floor, next to the bread. Our café is on the second floor. It opens at ten and closes at eight. The shop closes in thirty minutes, at nine o'clock. Please take your shopping to the checkout soon. Thank you!$t$,
      $t$A1$t$, $t$Shopping$t$, 'general', 'slow', 140, 24, null, $t$detail$t$,
      array[$t$shopping$t$, $t$announcement$t$, $t$time$t$]::text[],
      'published', 140,
      $t${"seeded_by":"20261022130000_english_listening_library","format":"monologue","script_type":"announcement","speakers":[],"word_count":56,"tts":true}$t$::jsonb,
      $t$[{"id":"q1","type":"mcq","prompt":"Where are the apples and pears?","options":["On the second floor","Next to the café","On the first floor, next to the bread","Near the checkout"],"answer_index":2,"explanation":"The announcement says: \"Apples and pears are on the first floor, next to the bread.\""},{"id":"q2","type":"mcq","prompt":"When does the café close?","options":["At eight","At nine","At ten","At seven"],"answer_index":0,"explanation":"The café \"opens at ten and closes at eight\"."},{"id":"q3","type":"mcq","prompt":"When does the shop close?","options":["At eight o'clock","At nine o'clock","At ten o'clock","In ten minutes"],"answer_index":1,"explanation":"The shop \"closes in thirty minutes, at nine o'clock\"."}]$t$::jsonb
    ),
    (
      v_product_id, v_en_id, $t$a1-weather-tashkent$t$,
      $t$The Weather in Tashkent$t$,
      $t$A radio weather report: today, tonight, tomorrow and the weekend.$t$,
      $t$And now the weather for Tashkent. Today is sunny and hot. It is thirty-two degrees in the afternoon. Tonight it is cooler, about twenty degrees. Tomorrow there is some rain in the morning, so take an umbrella. In the afternoon the sun comes back. The weekend is warm and dry. That's the weather. Now, back to the music.$t$,
      $t$A1$t$, $t$Daily life$t$, 'general', 'slow', 139, 25, null, $t$detail$t$,
      array[$t$radio$t$, $t$weather$t$, $t$numbers$t$]::text[],
      'published', 150,
      $t${"seeded_by":"20261022130000_english_listening_library","format":"monologue","script_type":"radio","speakers":[],"word_count":58,"tts":true}$t$::jsonb,
      $t$[{"id":"q1","type":"mcq","prompt":"What is the weather like today?","options":["Rainy","Sunny and hot","Cold and windy","Cloudy"],"answer_index":1,"explanation":"The speaker says: \"Today is sunny and hot.\""},{"id":"q2","type":"mcq","prompt":"How warm is it tonight?","options":["About twenty degrees","Thirty-two degrees","About twelve degrees","Twenty-five degrees"],"answer_index":0,"explanation":"The speaker says: \"Tonight it is cooler, about twenty degrees.\""},{"id":"q3","type":"mcq","prompt":"When does it rain tomorrow?","options":["In the afternoon","In the evening","In the morning","All day"],"answer_index":2,"explanation":"There is \"some rain in the morning\", and \"in the afternoon the sun comes back\"."},{"id":"q4","type":"mcq","prompt":"What is the weekend like?","options":["Cold and wet","Warm and dry","Windy","Very hot"],"answer_index":1,"explanation":"The speaker says: \"The weekend is warm and dry.\""}]$t$::jsonb
    ),
    (
      v_product_id, v_en_id, $t$train-platform-change$t$,
      $t$Platform Change at the Station$t$,
      $t$A station announcement: a new platform for the Samarkand train and what to keep ready.$t$,
      $t$Attention, please. This is an announcement for passengers travelling to Samarkand. The fast train at ten fifteen will now leave from platform four, not platform two. We are sorry for the change. The train is on time. Passengers in carriages one to five, please wait at the front of the platform. The café car is in carriage six. Please keep your ticket and passport with you. The staff will check them before you get on the train. Thank you.$t$,
      $t$A2$t$, $t$Travel$t$, 'general', 'slow', 139, 34, null, $t$detail$t$,
      array[$t$train$t$, $t$announcement$t$, $t$travel$t$]::text[],
      'published', 210,
      $t${"seeded_by":"20261022130000_english_listening_library","format":"monologue","script_type":"announcement","speakers":[],"word_count":79,"tts":true}$t$::jsonb,
      $t$[{"id":"q1","type":"mcq","prompt":"Which platform does the train leave from now?","options":["Platform two","Platform four","Platform five","Platform six"],"answer_index":1,"explanation":"The train \"will now leave from platform four, not platform two\"."},{"id":"q2","type":"mcq","prompt":"Is the train late?","options":["Yes, it is fifteen minutes late.","No, it is on time.","It is cancelled.","It leaves earlier."],"answer_index":1,"explanation":"The announcement says: \"The train is on time.\" Only the platform has changed."},{"id":"q3","type":"mcq","prompt":"Where should passengers in carriages one to five wait?","options":["At the back of the platform","In the café car","At the front of the platform","At the ticket office"],"answer_index":2,"explanation":"They should \"wait at the front of the platform\"."},{"id":"q4","type":"mcq","prompt":"What will the staff check?","options":["Bags","Tickets and passports","Seat numbers","Phones"],"answer_index":1,"explanation":"Passengers should keep their ticket and passport because \"the staff will check them\"."}]$t$::jsonb
    ),
    (
      v_product_id, v_en_id, $t$a2-dentist-appointment-change$t$,
      $t$A Call From the Dentist$t$,
      $t$A clinic leaves a voicemail to move an appointment and offers two new times.$t$,
      $t$Hello, this is a message for Rustam Karimov from the City Dental Clinic. Your appointment is on Thursday at half past three. Unfortunately, the doctor is ill that day, so we need to change it. We can offer you Friday at eleven in the morning or Monday at four in the afternoon. Please call us back before Wednesday evening to choose a time. If you don't call, we will book Monday for you. Thank you, and have a good day.$t$,
      $t$A2$t$, $t$Health$t$, 'general', 'slow', 137, 35, null, $t$detail$t$,
      array[$t$voicemail$t$, $t$health$t$, $t$appointments$t$]::text[],
      'published', 220,
      $t${"seeded_by":"20261022130000_english_listening_library","format":"monologue","script_type":"voicemail","speakers":[],"word_count":80,"tts":true}$t$::jsonb,
      $t$[{"id":"q1","type":"mcq","prompt":"Why does the clinic need to change the appointment?","options":["The clinic is closed on Thursday.","The doctor is ill that day.","Rustam asked to change it.","It is a public holiday."],"answer_index":1,"explanation":"The caller says: \"the doctor is ill that day, so we need to change it.\""},{"id":"q2","type":"mcq","prompt":"Which new times does the clinic offer?","options":["Friday at eleven or Monday at four","Thursday at three or Friday at four","Monday at eleven or Wednesday at four","Friday at four or Monday at eleven"],"answer_index":0,"explanation":"The clinic offers \"Friday at eleven in the morning or Monday at four in the afternoon\"."},{"id":"q3","type":"mcq","prompt":"When should Rustam call back?","options":["Before Thursday morning","Before Wednesday evening","On Friday","Today"],"answer_index":1,"explanation":"The caller says: \"Please call us back before Wednesday evening.\""},{"id":"q4","type":"mcq","prompt":"What happens if Rustam does not call?","options":["The appointment is cancelled.","They book Friday for him.","They book Monday for him.","They call him again."],"answer_index":2,"explanation":"The caller says: \"If you don't call, we will book Monday for you.\""}]$t$::jsonb
    ),
    (
      v_product_id, v_en_id, $t$a2-market-tomatoes$t$,
      $t$Buying Vegetables at the Bazaar$t$,
      $t$A short conversation at a market stall: fresh tomatoes, a price and a small gift.$t$,
      $t$Nodira: Good morning! Are these tomatoes from your garden?
Bobur: Yes, they are. I picked them yesterday. They're sweet and very fresh.
Nodira: Great. I need two kilos for a salad. How much is that?
Bobur: Two kilos is thirty thousand som. Do you need anything else?
Nodira: Yes, some cucumbers and a bunch of dill, please.
Bobur: Here you are. Because you're buying a lot, the dill is free.
Nodira: That's very kind of you. Thank you!
Bobur: You're welcome. Come again next week. I'll have fresh apricots then.$t$,
      $t$A2$t$, $t$Shopping$t$, 'general', 'slow', 137, 36, null, $t$conversation$t$,
      array[$t$dialogue$t$, $t$market$t$, $t$shopping$t$]::text[],
      'published', 230,
      $t${"seeded_by":"20261022130000_english_listening_library","format":"dialogue","script_type":"dialogue","speakers":["Nodira","Bobur"],"word_count":82,"tts":true}$t$::jsonb,
      $t$[{"id":"q1","type":"mcq","prompt":"When did Bobur pick the tomatoes?","options":["This morning","Yesterday","Last week","Two days ago"],"answer_index":1,"explanation":"Bobur says: \"I picked them yesterday.\""},{"id":"q2","type":"mcq","prompt":"Why does Nodira need two kilos of tomatoes?","options":["For soup","For a salad","For plov","For her neighbour"],"answer_index":1,"explanation":"Nodira says: \"I need two kilos for a salad.\""},{"id":"q3","type":"mcq","prompt":"What does Bobur give Nodira for free?","options":["The cucumbers","Some apricots","The dill","One tomato"],"answer_index":2,"explanation":"Bobur says: \"Because you're buying a lot, the dill is free.\""},{"id":"q4","type":"mcq","prompt":"What will Bobur have next week?","options":["Fresh apricots","Cheaper tomatoes","Melons","More dill"],"answer_index":0,"explanation":"Bobur says: \"I'll have fresh apricots then.\""}]$t$::jsonb
    ),
    (
      v_product_id, v_en_id, $t$a2-library-welcome$t$,
      $t$Welcome to the Library$t$,
      $t$A librarian explains the library rules: borrowing books, quiet areas and food.$t$,
      $t$Welcome to the university library. We are open from eight in the morning until eight in the evening, Monday to Saturday. You can borrow five books for two weeks. If you need a book for longer, you can renew it online. The third floor is a quiet area, so please don't talk or use your phone there. You can work in groups on the second floor. Food isn't allowed in the library, but you can bring water in a bottle. If you have any questions, ask us at the front desk.$t$,
      $t$A2$t$, $t$Work and Study$t$, 'general', 'slow', 137, 40, null, $t$detail$t$,
      array[$t$university$t$, $t$rules$t$, $t$library$t$]::text[],
      'published', 240,
      $t${"seeded_by":"20261022130000_english_listening_library","format":"monologue","script_type":"announcement","speakers":[],"word_count":91,"tts":true}$t$::jsonb,
      $t$[{"id":"q1","type":"mcq","prompt":"How many books can students borrow?","options":["Two","Three","Five","Eight"],"answer_index":2,"explanation":"The librarian says: \"You can borrow five books for two weeks.\""},{"id":"q2","type":"mcq","prompt":"Where can students work in groups?","options":["On the first floor","On the second floor","On the third floor","At the front desk"],"answer_index":1,"explanation":"The librarian says: \"You can work in groups on the second floor.\" The third floor is quiet."},{"id":"q3","type":"mcq","prompt":"What can students bring into the library?","options":["Water in a bottle","Sandwiches","Hot tea","Any food and drink"],"answer_index":0,"explanation":"\"Food isn't allowed in the library, but you can bring water in a bottle.\""},{"id":"q4","type":"mcq","prompt":"How can students keep a book for longer?","options":["Ask a teacher","Renew it online","Pay at the desk","Take it to the third floor"],"answer_index":1,"explanation":"The librarian says: \"you can renew it online\"."}]$t$::jsonb
    ),
    (
      v_product_id, v_en_id, $t$a2-taxi-to-airport$t$,
      $t$Booking a Taxi to the Airport$t$,
      $t$A phone call to book an early taxi: flight time, address and luggage.$t$,
      $t$Operator: Good evening, City Taxi. How can I help you?
Jasur: Hi. I need a taxi to the airport tomorrow morning.
Operator: Of course. What time is your flight?
Jasur: It leaves at nine, so I'd like to go at half past six.
Operator: No problem. What's your address?
Jasur: Navoi Street, building twelve. It is next to a big pharmacy.
Operator: Okay. How many people, and how many bags?
Jasur: Just me, with one large suitcase.
Operator: Great. The driver will call you ten minutes before he arrives.
Jasur: Perfect. Thank you very much.$t$,
      $t$A2$t$, $t$Travel$t$, 'general', 'slow', 138, 37, null, $t$conversation$t$,
      array[$t$dialogue$t$, $t$phone call$t$, $t$travel$t$]::text[],
      'published', 250,
      $t${"seeded_by":"20261022130000_english_listening_library","format":"dialogue","script_type":"dialogue","speakers":["Operator","Jasur"],"word_count":85,"tts":true}$t$::jsonb,
      $t$[{"id":"q1","type":"mcq","prompt":"What time is Jasur's flight?","options":["At half past six","At nine","At ten","At twelve"],"answer_index":1,"explanation":"Jasur says: \"It leaves at nine.\""},{"id":"q2","type":"mcq","prompt":"When does Jasur want the taxi?","options":["At six o'clock","At half past six","At seven","At half past seven"],"answer_index":1,"explanation":"Jasur says: \"I'd like to go at half past six.\""},{"id":"q3","type":"mcq","prompt":"What is next to Jasur's building?","options":["A bank","A school","A big pharmacy","A metro station"],"answer_index":2,"explanation":"Jasur says: \"It is next to a big pharmacy.\""},{"id":"q4","type":"mcq","prompt":"What will the driver do?","options":["Wait at the airport","Send a text message","Call ten minutes before he arrives","Carry the suitcase"],"answer_index":2,"explanation":"The operator says: \"The driver will call you ten minutes before he arrives.\""}]$t$::jsonb
    ),
    (
      v_product_id, v_en_id, $t$a2-football-training-moved$t$,
      $t$Football Training Is Moving$t$,
      $t$A coach leaves a voicemail: a new training day, what to bring and why it matters.$t$,
      $t$Hi Dilshod, it's Anvar, your football coach. This week our training is on Wednesday, not Tuesday, because workers are fixing the field on Tuesday. Training starts at five, but please come fifteen minutes early. Bring your boots and a bottle of water, and wear a warm jacket, because it gets cold in the evening. On Saturday we have a match against a team from Chirchiq, so this training is very important. If you can't come, please send me a message. See you on Wednesday!$t$,
      $t$A2$t$, $t$Daily life$t$, 'general', 'slow', 136, 37, null, $t$detail$t$,
      array[$t$voicemail$t$, $t$sport$t$, $t$schedule$t$]::text[],
      'published', 260,
      $t${"seeded_by":"20261022130000_english_listening_library","format":"monologue","script_type":"voicemail","speakers":[],"word_count":84,"tts":true}$t$::jsonb,
      $t$[{"id":"q1","type":"mcq","prompt":"Why is training not on Tuesday this week?","options":["The coach is busy.","Workers are fixing the field.","There is a match on Tuesday.","It is a holiday."],"answer_index":1,"explanation":"The coach says training moves \"because workers are fixing the field on Tuesday\"."},{"id":"q2","type":"mcq","prompt":"What time should Dilshod arrive?","options":["At five","At a quarter to five","At a quarter past five","At half past four"],"answer_index":1,"explanation":"Training starts at five, and players should \"come fifteen minutes early\", so at a quarter to five."},{"id":"q3","type":"mcq","prompt":"Why should Dilshod wear a warm jacket?","options":["It is raining.","The match is in the morning.","It gets cold in the evening.","The coach wants a team photo."],"answer_index":2,"explanation":"The coach says: \"it gets cold in the evening.\""},{"id":"q4","type":"mcq","prompt":"Why is this training very important?","options":["There is a match on Saturday.","A new coach is coming.","The team is choosing a captain.","It is the last training of the year."],"answer_index":0,"explanation":"\"On Saturday we have a match against a team from Chirchiq, so this training is very important.\""}]$t$::jsonb
    ),
    (
      v_product_id, v_en_id, $t$study-group-time-change$t$,
      $t$The Study Group Moves to Seven$t$,
      $t$Two classmates talk about a later study group time, what they will cover and what to bring.$t$,
      $t$Lola: Hi Timur, did you see the message about our study group?
Timur: No, I didn't. Is something wrong?
Lola: Not really. We usually meet at six on Thursdays, but this week we're starting at seven because the library room is booked for an exam.
Timur: Seven is a bit late for me. I have to catch the last bus home at nine.
Lola: Don't worry. We'll finish by half past eight. And we'll only cover two chapters, not three.
Timur: Which ones?
Lola: Chapters four and five. The teacher said chapter six won't be on the test.
Timur: That's good news. Should I bring anything?
Lola: Bring your notes from last week. Mine are incomplete because I missed half the lecture.
Timur: Okay, I'll print them out tonight. See you on Thursday.$t$,
      $t$B1$t$, $t$Work and Study$t$, 'general', 'natural', 148, 50, null, $t$conversation$t$,
      array[$t$dialogue$t$, $t$schedule$t$, $t$university$t$]::text[],
      'published', 310,
      $t${"seeded_by":"20261022130000_english_listening_library","format":"dialogue","script_type":"dialogue","speakers":["Lola","Timur"],"word_count":123,"tts":true}$t$::jsonb,
      $t$[{"id":"q1","type":"mcq","prompt":"Why is the study group starting later this week?","options":["Lola has a lecture until seven.","The library room is booked for an exam.","Timur asked for a later time.","The library closes early."],"answer_index":1,"explanation":"Lola says they start at seven \"because the library room is booked for an exam\"."},{"id":"q2","type":"mcq","prompt":"What is Timur worried about?","options":["Missing the last bus home","Failing the test","Not having his notes","Getting to the library on time"],"answer_index":0,"explanation":"Timur says: \"I have to catch the last bus home at nine.\""},{"id":"q3","type":"mcq","prompt":"Which chapters will they study?","options":["Four, five and six","Five and six","Four and five","Only chapter six"],"answer_index":2,"explanation":"Lola says: \"Chapters four and five.\" Chapter six won't be on the test."},{"id":"q4","type":"mcq","prompt":"Why does Lola need Timur's notes?","options":["She lost her notebook.","She missed half the lecture.","Her notes are in another language.","The teacher asked for them."],"answer_index":1,"explanation":"Lola says her notes \"are incomplete because I missed half the lecture\"."}]$t$::jsonb
    ),
    (
      v_product_id, v_en_id, $t$b1-podcast-learning-on-the-move$t$,
      $t$Learning English on the Way to Work$t$,
      $t$A podcast host answers a listener who spends an hour a day on the metro and bus.$t$,
      $t$Welcome back to Study Smart. Today's question comes from Shahlo, who lives in Tashkent. She spends about an hour every day on the metro and the bus, and she wants to use that time to improve her English. Shahlo, that's a great idea, but my advice is simple: listen, don't read. Small text on a phone in a busy carriage is tiring. Instead, choose one short recording, three or four minutes long, and listen to it three times. The first time, just try to get the general idea. The second time, listen for details like names, numbers and places. The third time, read the transcript while you listen. After that, write down five useful phrases and try to use them that same day. Don't try to learn everything at once. A little every day is better than a lot once a week.$t$,
      $t$B1$t$, $t$Work and Study$t$, 'general', 'natural', 147, 58, null, $t$gist$t$,
      array[$t$podcast$t$, $t$study skills$t$, $t$commuting$t$]::text[],
      'published', 320,
      $t${"seeded_by":"20261022130000_english_listening_library","format":"monologue","script_type":"podcast","speakers":[],"word_count":142,"tts":true}$t$::jsonb,
      $t$[{"id":"q1","type":"mcq","prompt":"How much time does Shahlo spend travelling each day?","options":["About thirty minutes","About an hour","About two hours","Three or four hours"],"answer_index":1,"explanation":"The host says she \"spends about an hour every day on the metro and the bus\"."},{"id":"q2","type":"mcq","prompt":"Why does the host say she should not read on her phone?","options":["It is bad for her eyes at night.","Small text in a busy carriage is tiring.","There is no internet on the metro.","Reading is less useful than speaking."],"answer_index":1,"explanation":"The host says: \"Small text on a phone in a busy carriage is tiring.\""},{"id":"q3","type":"mcq","prompt":"What should she do the second time she listens?","options":["Get the general idea","Read the transcript","Listen for names, numbers and places","Write down five phrases"],"answer_index":2,"explanation":"\"The second time, listen for details like names, numbers and places.\""},{"id":"q4","type":"mcq","prompt":"What is the host's main message?","options":["Study for a long time once a week.","Learn everything in one recording.","Study a little every day.","Only study at home."],"answer_index":2,"explanation":"The host ends: \"A little every day is better than a lot once a week.\""}]$t$::jsonb
    ),
    (
      v_product_id, v_en_id, $t$b1-job-interview-invitation$t$,
      $t$An Invitation to an Interview$t$,
      $t$An HR manager calls a candidate about an interview: time, place and what to bring.$t$,
      $t$Ms Rahimova: Good afternoon. Is that Akmal Yusupov? I'm calling from the HR department about your application.
Akmal: Yes, speaking. Thank you for calling.
Ms Rahimova: We'd like to invite you to an interview next Tuesday at ten. Is that convenient?
Akmal: Tuesday at ten is fine. Where will it be?
Ms Rahimova: At our main office on Amir Temur Avenue, on the fourth floor. Please bring a printed copy of your CV and a copy of your diploma.
Akmal: Of course. How long will the interview take?
Ms Rahimova: About forty-five minutes. It includes a short English test, so please come ten minutes early.
Akmal: Is there parking near the building?
Ms Rahimova: There is, but it's usually full in the morning. I'd recommend taking the metro.
Akmal: Thank you. I'll be there.$t$,
      $t$B1$t$, $t$Work and Study$t$, 'general', 'natural', 146, 49, null, $t$conversation$t$,
      array[$t$dialogue$t$, $t$phone call$t$, $t$jobs$t$]::text[],
      'published', 330,
      $t${"seeded_by":"20261022130000_english_listening_library","format":"dialogue","script_type":"dialogue","speakers":["Ms Rahimova","Akmal"],"word_count":119,"tts":true}$t$::jsonb,
      $t$[{"id":"q1","type":"mcq","prompt":"When is the interview?","options":["Next Monday at ten","Next Tuesday at ten","Next Tuesday at four","Next Thursday at ten"],"answer_index":1,"explanation":"Ms Rahimova says: \"next Tuesday at ten\"."},{"id":"q2","type":"mcq","prompt":"What must Akmal bring?","options":["His passport and a photo","His CV and a copy of his diploma","A reference letter","His laptop"],"answer_index":1,"explanation":"He should bring \"a printed copy of your CV and a copy of your diploma\"."},{"id":"q3","type":"mcq","prompt":"Why should Akmal come ten minutes early?","options":["The office is hard to find.","There is a short English test.","He has to fill in a form at reception.","The manager is busy later."],"answer_index":1,"explanation":"The interview \"includes a short English test, so please come ten minutes early.\""},{"id":"q4","type":"mcq","prompt":"What does Ms Rahimova recommend?","options":["Driving and parking nearby","Taking a taxi","Taking the metro","Arriving at nine"],"answer_index":2,"explanation":"She says parking is usually full in the morning: \"I'd recommend taking the metro.\""}]$t$::jsonb
    ),
    (
      v_product_id, v_en_id, $t$b1-flight-delay-announcement$t$,
      $t$A Delayed Flight$t$,
      $t$An airport announcement about a delay, a gate change and help for passengers.$t$,
      $t$Good morning, ladies and gentlemen. This is an announcement for passengers on flight two seven four to Istanbul. Because of heavy fog this morning, the flight is delayed. The new departure time is eleven forty, instead of nine fifteen. Please note that the flight will now board from gate nine, not gate five. Boarding will start at eleven o'clock. While you wait, you can collect a free meal voucher from the information desk. Please show your boarding pass to receive it. If you have a connecting flight in Istanbul, please speak to a member of our staff at gate nine, and they will help you with your next booking. We apologise for the delay, and thank you for your patience.$t$,
      $t$B1$t$, $t$Travel$t$, 'general', 'natural', 147, 49, null, $t$detail$t$,
      array[$t$airport$t$, $t$announcement$t$, $t$travel$t$]::text[],
      'published', 340,
      $t${"seeded_by":"20261022130000_english_listening_library","format":"monologue","script_type":"announcement","speakers":[],"word_count":120,"tts":true}$t$::jsonb,
      $t$[{"id":"q1","type":"mcq","prompt":"Why is the flight delayed?","options":["A technical problem","Heavy fog","A late crew","Strong winds"],"answer_index":1,"explanation":"The announcement says: \"Because of heavy fog this morning, the flight is delayed.\""},{"id":"q2","type":"mcq","prompt":"What is the new departure time?","options":["Nine fifteen","Eleven o'clock","Eleven forty","Twelve fifteen"],"answer_index":2,"explanation":"\"The new departure time is eleven forty, instead of nine fifteen.\" Boarding starts at eleven."},{"id":"q3","type":"mcq","prompt":"What do passengers need to get a meal voucher?","options":["Their passport","Their boarding pass","Their luggage tag","A receipt"],"answer_index":1,"explanation":"\"Please show your boarding pass to receive it.\""},{"id":"q4","type":"mcq","prompt":"Who should speak to the staff at gate nine?","options":["Passengers with children","Passengers with heavy bags","Passengers with a connecting flight","All passengers"],"answer_index":2,"explanation":"\"If you have a connecting flight in Istanbul, please speak to a member of our staff at gate nine.\""}]$t$::jsonb
    ),
    (
      v_product_id, v_en_id, $t$b1-weekend-in-the-mountains$t$,
      $t$A Weekend in the Mountains$t$,
      $t$Two friends plan a trip out of the city: transport, weather and what to pack.$t$,
      $t$Madina: So, are we still going to the mountains this weekend?
Sherzod: I hope so. I checked the forecast. Saturday looks sunny, but it might rain on Sunday afternoon.
Madina: Then let's leave early on Saturday and come back on Sunday morning.
Sherzod: Good idea. How should we get there? The bus is cheaper, but it's slow and it only leaves twice a day.
Madina: A shared taxi is faster. If we find two more people, it will cost almost the same as the bus.
Sherzod: My cousin wants to come, and she can bring a friend. I'll ask her tonight.
Madina: Great. Don't forget it's much colder up there, especially at night. Pack a warm sweater.
Sherzod: And good shoes. Last time I wore trainers and my feet were wet all day.
Madina: I'll bring some snacks and a flask of tea. You bring the map, okay?$t$,
      $t$B1$t$, $t$Travel$t$, 'general', 'natural', 146, 57, null, $t$conversation$t$,
      array[$t$dialogue$t$, $t$travel$t$, $t$plans$t$]::text[],
      'published', 350,
      $t${"seeded_by":"20261022130000_english_listening_library","format":"dialogue","script_type":"dialogue","speakers":["Madina","Sherzod"],"word_count":139,"tts":true}$t$::jsonb,
      $t$[{"id":"q1","type":"mcq","prompt":"Why do they decide to come back on Sunday morning?","options":["The bus only leaves in the morning.","It might rain on Sunday afternoon.","Madina works on Sunday.","The hotel is full."],"answer_index":1,"explanation":"Sherzod says \"it might rain on Sunday afternoon\", so Madina suggests coming back on Sunday morning."},{"id":"q2","type":"mcq","prompt":"What is the problem with the bus?","options":["It is expensive.","It is slow and only leaves twice a day.","It does not go to the mountains.","It is always full."],"answer_index":1,"explanation":"Sherzod says the bus is cheaper, \"but it's slow and it only leaves twice a day\"."},{"id":"q3","type":"mcq","prompt":"Why will Sherzod call his cousin?","options":["To borrow her car","To find more people for a shared taxi","To ask about the weather","To get a map"],"answer_index":1,"explanation":"A shared taxi costs almost the same as the bus \"if we find two more people\". His cousin and her friend can come."},{"id":"q4","type":"mcq","prompt":"What happened on Sherzod's last trip?","options":["He got lost.","He was too cold at night.","His feet were wet all day.","He missed the bus."],"answer_index":2,"explanation":"Sherzod says: \"Last time I wore trainers and my feet were wet all day.\""}]$t$::jsonb
    ),
    (
      v_product_id, v_en_id, $t$b1-flat-viewing$t$,
      $t$Looking at a Flat$t$,
      $t$A student views a flat to rent and asks about bills, the deposit and the washing machine.$t$,
      $t$Owner: So, this is the living room, and the kitchen is through here. It gets a lot of sun in the morning.
Dilnoza: It's lovely. How far is the metro station?
Owner: About ten minutes on foot. There's also a bus stop just outside the building.
Dilnoza: That's convenient. Does the rent include bills?
Owner: It includes the internet and water, but you pay for electricity and gas yourself.
Dilnoza: I see. And do you need a deposit?
Owner: Yes, one month's rent. You get it back when you leave, if everything is in good condition.
Dilnoza: What about the washing machine? It doesn't seem to be working.
Owner: You're right, it's broken. A new one will be delivered next week.
Dilnoza: Okay. One last question: can I move in at the start of next month?
Owner: Yes, that works for me.$t$,
      $t$B1$t$, $t$Daily life$t$, 'general', 'natural', 148, 53, null, $t$conversation$t$,
      array[$t$dialogue$t$, $t$housing$t$, $t$money$t$]::text[],
      'published', 360,
      $t${"seeded_by":"20261022130000_english_listening_library","format":"dialogue","script_type":"dialogue","speakers":["Owner","Dilnoza"],"word_count":131,"tts":true}$t$::jsonb,
      $t$[{"id":"q1","type":"mcq","prompt":"How long does it take to walk to the metro?","options":["About five minutes","About ten minutes","About twenty minutes","There is no metro nearby"],"answer_index":1,"explanation":"The owner says: \"About ten minutes on foot.\""},{"id":"q2","type":"mcq","prompt":"Which bills does Dilnoza pay herself?","options":["Internet and water","Electricity and gas","Water and gas","All the bills"],"answer_index":1,"explanation":"The rent includes internet and water, \"but you pay for electricity and gas yourself\"."},{"id":"q3","type":"mcq","prompt":"When does Dilnoza get the deposit back?","options":["After one month","When she leaves, if everything is in good condition","Never","When the new washing machine arrives"],"answer_index":1,"explanation":"\"You get it back when you leave, if everything is in good condition.\""},{"id":"q4","type":"mcq","prompt":"What will happen to the washing machine?","options":["Dilnoza must repair it.","The owner will repair it today.","A new one will arrive next week.","It will be taken away."],"answer_index":2,"explanation":"The owner says: \"A new one will be delivered next week.\""}]$t$::jsonb
    ),
    (
      v_product_id, v_en_id, $t$report-check-before-send$t$,
      $t$Before You Send the Report$t$,
      $t$A manager leaves a voicemail with clear instructions for finishing a report.$t$,
      $t$Hi Feruza, it's Gulnora. I'm sorry I missed you this morning. I'm at the client's office all day, so I'll keep this short. I've read your draft of the quarterly report, and overall it's in good shape. Before you send it, though, there are three things I'd like you to do. First, please check the final figures with someone in the finance team. They updated the spreadsheet on Monday, and I'm not sure your draft includes those changes. Second, the chart on page three is hard to read. Could you replace it with a simple table? Clients usually print these reports in black and white, and the colours in the chart are almost impossible to tell apart on paper. Third, the report ends quite suddenly, so add a short conclusion with two clear recommendations. And one more thing: please don't send it directly to the client. Send it to me by Thursday at noon, and I'll forward it after I've had a final look. Thanks, and call me if anything is unclear.$t$,
      $t$B2$t$, $t$Work and Study$t$, 'general', 'natural', 147, 70, null, $t$detail$t$,
      array[$t$voicemail$t$, $t$workplace$t$, $t$instructions$t$]::text[],
      'published', 410,
      $t${"seeded_by":"20261022130000_english_listening_library","format":"monologue","script_type":"voicemail","speakers":[],"word_count":172,"tts":true}$t$::jsonb,
      $t$[{"id":"q1","type":"mcq","prompt":"What does Gulnora think of the draft in general?","options":["It needs to be rewritten.","It is in good shape.","It is too long.","It is missing the main figures."],"answer_index":1,"explanation":"She says: \"overall it's in good shape.\""},{"id":"q2","type":"mcq","prompt":"Why should Feruza check the figures with the finance team?","options":["The client asked for it.","The spreadsheet was updated on Monday.","The figures are secret.","Gulnora found a mistake in the table."],"answer_index":1,"explanation":"The finance team \"updated the spreadsheet on Monday\", and the draft may not include those changes."},{"id":"q3","type":"mcq","prompt":"What should replace the chart on page three?","options":["A longer explanation","A new chart with colours","A simple table","Nothing; it should be removed"],"answer_index":2,"explanation":"Gulnora asks: \"Could you replace it with a simple table?\""},{"id":"q4","type":"mcq","prompt":"Who should Feruza send the report to?","options":["Directly to the client","To the finance team","To Gulnora","To the whole department"],"answer_index":2,"explanation":"\"Please don't send it directly to the client. Send it to me by Thursday at noon.\""}]$t$::jsonb
    ),
    (
      v_product_id, v_en_id, $t$b2-radio-neighbourhood-garden$t$,
      $t$A Garden in the Neighbourhood$t$,
      $t$A radio report about neighbours who turned an empty yard into a shared vegetable garden.$t$,
      $t$Now, a story about how a few neighbours changed their street. Two years ago, the yard behind a group of apartment blocks in Tashkent was just an empty space full of dust and broken furniture. Then a retired teacher named Nilufar suggested turning it into a shared garden. At first, not everyone was convinced. Some people worried about who would do the work, and others thought the plants would be damaged. But the residents agreed on a simple system: each family looks after one bed, and everyone takes turns watering in the evening. Today the yard grows tomatoes, herbs and even a few grape vines. Nilufar says the vegetables are a bonus, but the real change is social. Neighbours who had lived side by side for years without speaking now meet there every evening, and children learn where their food comes from. The biggest challenge has been water in the summer heat, so last year the residents installed a drip system, which delivers water directly to the roots and wastes far less.$t$,
      $t$B2$t$, $t$Society$t$, 'general', 'natural', 147, 70, null, $t$gist$t$,
      array[$t$radio$t$, $t$community$t$, $t$environment$t$]::text[],
      'published', 420,
      $t${"seeded_by":"20261022130000_english_listening_library","format":"monologue","script_type":"radio","speakers":[],"word_count":172,"tts":true}$t$::jsonb,
      $t$[{"id":"q1","type":"mcq","prompt":"What was the yard like before?","options":["A car park","An empty space full of dust and broken furniture","A small football pitch","A private garden"],"answer_index":1,"explanation":"The reporter says it \"was just an empty space full of dust and broken furniture\"."},{"id":"q2","type":"mcq","prompt":"How do the residents share the work?","options":["They pay a gardener.","Nilufar does most of it.","Each family looks after one bed and they take turns watering.","Children do the watering."],"answer_index":2,"explanation":"\"Each family looks after one bed, and everyone takes turns watering in the evening.\""},{"id":"q3","type":"mcq","prompt":"According to Nilufar, what is the most important change?","options":["Cheaper vegetables","Neighbours now meet and talk","The yard is cleaner","Children play outside more"],"answer_index":1,"explanation":"She says \"the real change is social\": neighbours who never spoke now meet every evening."},{"id":"q4","type":"mcq","prompt":"Why did they install a drip system?","options":["To save water in the summer heat","To protect plants from children","Because it was cheap","To grow more grapes"],"answer_index":0,"explanation":"The biggest challenge was \"water in the summer heat\"; the drip system \"wastes far less\"."}]$t$::jsonb
    ),
    (
      v_product_id, v_en_id, $t$b2-app-launch-decision$t$,
      $t$Launch on Time or Wait?$t$,
      $t$Two colleagues discuss a problem before a product launch and agree on a plan.$t$,
      $t$Kamila: Have you got a minute? The testers found a problem with the booking feature yesterday.
Otabek: How serious is it?
Kamila: Quite serious. If two people book the same time slot at exactly the same moment, both bookings go through. The developers think they need at least two weeks to fix it properly.
Otabek: But the launch is on the first of the month. We've already told our clients.
Kamila: I know. So we have two options. We either delay the whole launch, or we launch on time without the booking feature and add it later.
Otabek: What do the clients actually use most?
Kamila: According to the survey we did in the spring, most of them mainly want the messaging and the payment tools. Booking was lower on their list.
Otabek: Then I'd rather launch on time with what works. A delay would look worse than a missing feature.
Kamila: I agree. But we should be honest about it. Let's email every client this week and explain when booking will be ready.
Otabek: Fine. Can you draft the email? I'll check it before it goes out.$t$,
      $t$B2$t$, $t$Work and Study$t$, 'general', 'natural', 146, 73, null, $t$conversation$t$,
      array[$t$dialogue$t$, $t$workplace$t$, $t$decisions$t$]::text[],
      'published', 430,
      $t${"seeded_by":"20261022130000_english_listening_library","format":"dialogue","script_type":"dialogue","speakers":["Kamila","Otabek"],"word_count":178,"tts":true}$t$::jsonb,
      $t$[{"id":"q1","type":"mcq","prompt":"What is wrong with the booking feature?","options":["It is too slow.","Two people can book the same time slot.","It does not accept payments.","Clients cannot find it."],"answer_index":1,"explanation":"Kamila explains that if two people book the same slot at the same moment, \"both bookings go through\"."},{"id":"q2","type":"mcq","prompt":"Why does Otabek prefer to launch on time?","options":["The fix will be quick.","A delay would look worse than a missing feature.","The clients do not need the app.","The testers were wrong."],"answer_index":1,"explanation":"Otabek says: \"A delay would look worse than a missing feature.\""},{"id":"q3","type":"mcq","prompt":"What do most clients mainly want, according to the survey?","options":["Booking","Messaging and payment tools","A new design","Lower prices"],"answer_index":1,"explanation":"Kamila says most clients \"mainly want the messaging and the payment tools\"."},{"id":"q4","type":"mcq","prompt":"What will Kamila do next?","options":["Fix the problem herself","Cancel the launch","Draft an email to the clients","Run a new survey"],"answer_index":2,"explanation":"Otabek asks: \"Can you draft the email?\" Kamila suggested emailing every client this week."}]$t$::jsonb
    ),
    (
      v_product_id, v_en_id, $t$b2-internship-or-summer-course$t$,
      $t$Internship or Summer Course?$t$,
      $t$A student asks an advisor whether to do a summer internship or a summer course.$t$,
      $t$Bekzod: Thanks for seeing me. I can't decide between the summer internship at the engineering company and the summer course in data analysis.
Advisor: Both are good choices. What worries you most?
Bekzod: Credits, mainly. I need six more credits to graduate on time, and the course gives exactly six.
Advisor: Actually, the internship can count for credits too. If you write a report about your work and your supervisor signs it, the faculty usually gives six credits.
Bekzod: Really? Nobody told me that.
Advisor: It isn't very well advertised. But there's a deadline. You have to register the internship with the faculty office before the end of May, not after you've finished it.
Bekzod: Okay. So if I register now, can I still change my mind later?
Advisor: Yes, you can cancel the registration until the middle of June without any problem.
Bekzod: Good. Is there anything else I need?
Advisor: A reference letter from one of your lecturers for the company. Ask early, because lecturers are very busy before exams.
Bekzod: Then I think I'll choose the internship. Real experience will look better on my CV.
Advisor: That's a sensible decision. Just don't miss that deadline.$t$,
      $t$B2$t$, $t$Work and Study$t$, 'general', 'natural', 147, 76, null, $t$conversation$t$,
      array[$t$dialogue$t$, $t$university$t$, $t$careers$t$]::text[],
      'published', 440,
      $t${"seeded_by":"20261022130000_english_listening_library","format":"dialogue","script_type":"dialogue","speakers":["Bekzod","Advisor"],"word_count":186,"tts":true}$t$::jsonb,
      $t$[{"id":"q1","type":"mcq","prompt":"What is Bekzod's main worry?","options":["Money","Getting enough credits to graduate on time","Finding a job after university","His exam results"],"answer_index":1,"explanation":"Bekzod says: \"Credits, mainly. I need six more credits to graduate on time.\""},{"id":"q2","type":"mcq","prompt":"How can the internship give credits?","options":["It cannot give credits.","He takes an exam at the end.","He writes a report signed by his supervisor.","He works for more than three months."],"answer_index":2,"explanation":"The advisor says: \"If you write a report about your work and your supervisor signs it, the faculty usually gives six credits.\""},{"id":"q3","type":"mcq","prompt":"When must Bekzod register the internship?","options":["Before the end of May","After he finishes it","Before his exams start","In September"],"answer_index":0,"explanation":"\"You have to register the internship with the faculty office before the end of May, not after you've finished it.\""},{"id":"q4","type":"mcq","prompt":"Why should he ask for a reference letter early?","options":["The company needs it tomorrow.","Lecturers are very busy before exams.","The faculty office closes in May.","He needs three letters."],"answer_index":1,"explanation":"The advisor says: \"Ask early, because lecturers are very busy before exams.\""}]$t$::jsonb
    ),
    (
      v_product_id, v_en_id, $t$b2-wrong-order-call$t$,
      $t$The Wrong Laptop Arrived$t$,
      $t$A customer calls an online shop about a wrong delivery and chooses how to fix it.$t$,
      $t$Agent: Good morning, customer service. My name is Aziza. How can I help?
Customer: Hello. I ordered a laptop from your website last week, and it arrived yesterday, but it's the wrong model. I ordered the one with sixteen gigabytes of memory, and this one only has eight.
Agent: I'm very sorry about that. Could you give me your order number, please?
Customer: Yes, it's on the receipt. It's four, seven, two, nine, one, eight.
Agent: Thank you. I can see the mistake. I can offer you two options: we can exchange it for the correct model, or we can give you a full refund.
Customer: How long would each option take?
Agent: For an exchange, a courier would collect the laptop in two days and bring the new one at the same time. A refund usually takes up to five working days after we receive the laptop.
Customer: I need it for work, so I'll take the exchange.
Agent: Certainly. Please keep the laptop in its original box with all the cables. The courier will call you an hour before arriving.
Customer: Perfect. Thank you for your help.$t$,
      $t$B2$t$, $t$Shopping$t$, 'general', 'natural', 147, 73, null, $t$conversation$t$,
      array[$t$dialogue$t$, $t$phone call$t$, $t$complaints$t$]::text[],
      'published', 450,
      $t${"seeded_by":"20261022130000_english_listening_library","format":"dialogue","script_type":"dialogue","speakers":["Agent","Customer"],"word_count":179,"tts":true}$t$::jsonb,
      $t$[{"id":"q1","type":"mcq","prompt":"What is wrong with the laptop?","options":["It is broken.","It has less memory than the one he ordered.","It is the wrong colour.","It arrived without a charger."],"answer_index":1,"explanation":"He ordered sixteen gigabytes of memory, \"and this one only has eight\"."},{"id":"q2","type":"mcq","prompt":"How long does a refund usually take?","options":["Two days","Up to five working days after they receive the laptop","One week from today","One hour"],"answer_index":1,"explanation":"The agent says a refund \"usually takes up to five working days after we receive the laptop\"."},{"id":"q3","type":"mcq","prompt":"Why does the customer choose the exchange?","options":["It is cheaper.","He needs the laptop for work.","The refund is not possible.","He likes the courier service."],"answer_index":1,"explanation":"The customer says: \"I need it for work, so I'll take the exchange.\""},{"id":"q4","type":"mcq","prompt":"What must the customer do before the courier comes?","options":["Print a form","Keep the laptop in its original box with all the cables","Pay a delivery fee","Go to the shop"],"answer_index":1,"explanation":"The agent says: \"Please keep the laptop in its original box with all the cables.\""}]$t$::jsonb
    ),
    (
      v_product_id, v_en_id, $t$b2-podcast-hybrid-office$t$,
      $t$Two Days in the Office$t$,
      $t$A podcast guest explains how her small design studio switched to hybrid work.$t$,
      $t$Host: My guest today runs a small design studio in Tashkent. Shoira, your team has worked in a hybrid way for a year now. Why did you change?
Shoira: Honestly, it started because our lease was ending and we couldn't find an affordable office big enough for everyone. So we tried working from home three days a week.
Host: And how did it go at first?
Shoira: Badly, to be honest. People felt isolated, and small questions that used to take ten seconds across the desk turned into long chains of messages. Designers were waiting hours for an answer.
Host: So what did you change?
Shoira: Two things. First, everyone comes in on Tuesdays and Thursdays, so all meetings and reviews happen on those days. Second, we write a short update at the end of each home day: what I did, what I'm stuck on, and what I need from someone else.
Host: Has it made a difference?
Shoira: A big one. The office days feel busy and creative, and the home days are for quiet, focused work. I wouldn't go back now.$t$,
      $t$B2$t$, $t$Work and Study$t$, 'general', 'natural', 148, 71, null, $t$gist$t$,
      array[$t$podcast$t$, $t$workplace$t$, $t$remote work$t$]::text[],
      'published', 460,
      $t${"seeded_by":"20261022130000_english_listening_library","format":"dialogue","script_type":"podcast","speakers":["Host","Shoira"],"word_count":175,"tts":true}$t$::jsonb,
      $t$[{"id":"q1","type":"mcq","prompt":"Why did the studio first try hybrid work?","options":["The staff asked for it.","They could not find an affordable office big enough for everyone.","The internet at the office was slow.","A client required it."],"answer_index":1,"explanation":"Shoira says it started because \"we couldn't find an affordable office big enough for everyone\"."},{"id":"q2","type":"mcq","prompt":"What was a problem in the beginning?","options":["People worked too many hours.","Small questions turned into long chains of messages.","Clients complained about the designs.","The new office was too far away."],"answer_index":1,"explanation":"She says small questions \"turned into long chains of messages\" and designers waited hours."},{"id":"q3","type":"mcq","prompt":"What happens on Tuesdays and Thursdays?","options":["Everyone works from home.","Everyone comes in, and meetings happen then.","Designers present to clients.","The team writes updates."],"answer_index":1,"explanation":"\"Everyone comes in on Tuesdays and Thursdays, so all meetings and reviews happen on those days.\""},{"id":"q4","type":"mcq","prompt":"What is Shoira's opinion of hybrid work now?","options":["She wants to return to the office full-time.","She is still unsure.","She would not go back to the old way.","She thinks it is only good for managers."],"answer_index":2,"explanation":"She ends: \"I wouldn't go back now.\""}]$t$::jsonb
    ),
    (
      v_product_id, v_en_id, $t$c1-lecture-cooler-cities$t$,
      $t$Lecture: Keeping Cities Cool$t$,
      $t$A lecture extract on why cities get hotter than the countryside and what old desert towns can teach us.$t$,
      $t$Good afternoon. Today I want to look at a problem that anyone who has spent July in a Central Asian city will recognise: the city itself makes the heat worse. This is what we call the urban heat island effect. During the day, dark surfaces such as asphalt and roofs absorb a great deal of solar energy. At night, they release that heat slowly, which is why the centre of a city often stays warm long after the surrounding countryside has cooled down. Traffic, air conditioners and dense buildings that block the wind all add to the problem. Ironically, the more people rely on air conditioning to escape the heat, the more waste heat is pumped into the streets outside. So what can be done? The most effective tool is surprisingly old-fashioned: trees. A mature tree does two things. It provides shade, so the ground beneath it never heats up in the first place, and it releases water vapour through its leaves, which cools the air around it. Interestingly, the historic centres of cities like Bukhara and Khiva were designed with heat in mind long before anyone had a name for it. Narrow streets keep each other in shade, thick walls slow down the movement of heat into homes, and inner courtyards with water and vines create small pockets of cooler air. I'm not suggesting that modern cities should simply copy these designs. However, the underlying principles of shade, airflow and green space are just as relevant today, and they're often far cheaper than technological solutions.$t$,
      $t$C1$t$, $t$Science$t$, 'general', 'natural', 157, 98, null, $t$gist$t$,
      array[$t$lecture$t$, $t$cities$t$, $t$climate$t$]::text[],
      'published', 510,
      $t${"seeded_by":"20261022130000_english_listening_library","format":"monologue","script_type":"lecture","speakers":[],"word_count":256,"tts":true}$t$::jsonb,
      $t$[{"id":"q1","type":"mcq","prompt":"Why does a city centre often stay warm at night?","options":["Because the wind is stronger in cities","Because dark surfaces release stored heat slowly","Because there are more people outside at night","Because the countryside is higher up"],"answer_index":1,"explanation":"The lecturer says dark surfaces absorb solar energy by day and \"release that heat slowly\" at night."},{"id":"q2","type":"mcq","prompt":"According to the lecturer, how do trees cool the air?","options":["By blocking the wind","By providing shade and releasing water vapour","By absorbing heat from buildings at night","By reflecting sunlight back into the sky"],"answer_index":1,"explanation":"A mature tree \"provides shade\" and \"releases water vapour through its leaves, which cools the air\"."},{"id":"q3","type":"mcq","prompt":"What does the lecturer say about the old centres of Bukhara and Khiva?","options":["They were built without any thought for heat.","They were designed with heat in mind.","They are hotter than modern districts.","They should be copied exactly today."],"answer_index":1,"explanation":"The lecturer says they \"were designed with heat in mind long before anyone had a name for it\"."},{"id":"q4","type":"mcq","prompt":"What is the lecturer's main point at the end?","options":["Modern cities should copy historic designs exactly.","Technology is the best answer to urban heat.","Old principles like shade and airflow are still relevant and often cheaper.","Trees are too expensive to plant in large numbers."],"answer_index":2,"explanation":"The lecturer is \"not suggesting\" copying the designs, but says the principles \"are just as relevant today\" and \"far cheaper than technological solutions\"."}]$t$::jsonb
    ),
    (
      v_product_id, v_en_id, $t$c1-lecture-silk-road-network$t$,
      $t$Lecture: The Silk Road Was Not a Road$t$,
      $t$A history lecture extract on the Silk Road as a network of routes, and on a famous story about paper.$t$,
      $t$Let's start by questioning the name itself. When people hear 'the Silk Road', they tend to imagine a single road running from China to the Mediterranean, with caravans travelling the whole way. In reality, it was nothing of the kind. It was a shifting network of routes, and very few merchants ever travelled from one end to the other. Goods usually moved in stages, passing from trader to trader and from city to city, with oasis towns like Samarkand and Bukhara acting as markets where goods changed hands. Silk was only one product among many. Horses, spices, glass, metalwork and paper all moved along these routes, and, perhaps more importantly, so did ideas, techniques and languages. Take paper, for example. You may have heard the story that paper-making reached Samarkand in the eighth century because Chinese prisoners of war taught the craft to local workers. It's a memorable story, and it appears in a number of later sources. However, many historians now treat it with some caution. They point out that paper was probably already known in the region before then, and that the spread of a technology like this was almost certainly gradual rather than the result of a single event. What isn't in doubt is that Samarkand became famous for its paper, and that cheaper writing material eventually changed how knowledge was recorded and shared across a huge area. So, as we go through today's material, I'd like you to keep one question in mind: what travels further, goods or ideas?$t$,
      $t$C1$t$, $t$History$t$, 'general', 'natural', 156, 97, null, $t$gist$t$,
      array[$t$lecture$t$, $t$history$t$, $t$trade$t$]::text[],
      'published', 520,
      $t${"seeded_by":"20261022130000_english_listening_library","format":"monologue","script_type":"lecture","speakers":[],"word_count":253,"tts":true}$t$::jsonb,
      $t$[{"id":"q1","type":"mcq","prompt":"What is wrong with the popular image of the Silk Road?","options":["It was much shorter than people think.","It was a network of routes, not a single road, and few merchants travelled the whole way.","It carried mainly silk and nothing else.","It did not pass through Central Asia."],"answer_index":1,"explanation":"The lecturer says it \"was a shifting network of routes, and very few merchants ever travelled from one end to the other\"."},{"id":"q2","type":"mcq","prompt":"What role did Samarkand and Bukhara play?","options":["They were the start and end of the road.","They were markets where goods changed hands.","They produced most of the silk.","They controlled all the caravans."],"answer_index":1,"explanation":"Oasis towns like Samarkand and Bukhara acted \"as markets where goods changed hands\"."},{"id":"q3","type":"mcq","prompt":"What is the lecturer's attitude to the story about prisoners of war and paper?","options":["It is definitely true.","Historians treat it with caution; the spread was probably gradual.","It was invented recently.","Paper never reached Samarkand."],"answer_index":1,"explanation":"The lecturer says many historians \"treat it with some caution\" and that the spread was \"almost certainly gradual\"."},{"id":"q4","type":"mcq","prompt":"What does the lecturer say is not in doubt?","options":["The exact date paper arrived","That Samarkand became famous for its paper","That silk was the most valuable product","That merchants spoke the same language"],"answer_index":1,"explanation":"\"What isn't in doubt is that Samarkand became famous for its paper.\""}]$t$::jsonb
    ),
    (
      v_product_id, v_en_id, $t$c1-podcast-career-change$t$,
      $t$From Banking to Teaching Code$t$,
      $t$A podcast interview with someone who left a stable bank job to teach programming.$t$,
      $t$Host: My guest today spent eight years in banking before leaving to teach programming. Jahongir, a lot of people dream about changing careers, but very few actually do it. What made you take the step?
Jahongir: It wasn't a sudden decision. I'd been teaching a free coding club for teenagers at weekends, just as a hobby, and I gradually realised that Saturday was the only day of the week I was looking forward to. That was quite an uncomfortable thing to admit.
Host: Were you afraid of losing a stable salary?
Jahongir: Terrified. So I didn't resign straight away. I spent about a year preparing. I saved enough to live on for several months, I took an online course in teaching methods, and I started teaching two evening classes to see whether I could handle it while I still had the safety of my job.
Host: Did anything from banking turn out to be useful?
Jahongir: Far more than I expected. Explaining a complicated loan to a nervous client is not so different from explaining a difficult concept to a confused student. In both cases, you have to work out what the other person already understands and build from there.
Host: What advice would you give to someone in the position you were in?
Jahongir: Test the new career before you jump into it. Don't just imagine what the job is like; actually do a small version of it. And be honest with yourself about money. Enthusiasm doesn't pay the rent.$t$,
      $t$C1$t$, $t$Work and Study$t$, 'general', 'natural', 157, 93, null, $t$gist$t$,
      array[$t$podcast$t$, $t$careers$t$, $t$interview$t$]::text[],
      'published', 530,
      $t${"seeded_by":"20261022130000_english_listening_library","format":"dialogue","script_type":"podcast","speakers":["Host","Jahongir"],"word_count":243,"tts":true}$t$::jsonb,
      $t$[{"id":"q1","type":"mcq","prompt":"What made Jahongir realise he wanted to change careers?","options":["He lost his job at the bank.","Saturday, when he taught the coding club, was the only day he looked forward to.","A friend offered him a teaching job.","His salary at the bank was too low."],"answer_index":1,"explanation":"He \"gradually realised that Saturday was the only day of the week I was looking forward to\"."},{"id":"q2","type":"mcq","prompt":"How did he prepare before resigning?","options":["He resigned first and then looked for work.","He saved money, took a course and taught evening classes while still employed.","He started his own bank.","He asked his employer for a year off."],"answer_index":1,"explanation":"He saved for several months, \"took an online course in teaching methods\", and taught \"two evening classes\" while he still had his job."},{"id":"q3","type":"mcq","prompt":"Which skill from banking helps him as a teacher?","options":["Working with numbers quickly","Explaining complicated things to people who are worried or confused","Selling products","Managing large teams"],"answer_index":1,"explanation":"He compares explaining a loan to a nervous client with explaining a concept to a confused student."},{"id":"q4","type":"mcq","prompt":"What does he mean by \"Enthusiasm doesn't pay the rent\"?","options":["Teachers should be less enthusiastic.","You must plan realistically for money, not rely on passion alone.","Rent in the city is too high.","Banking pays better than teaching."],"answer_index":1,"explanation":"He says to \"be honest with yourself about money\"; passion alone will not cover living costs."}]$t$::jsonb
    ),
    (
      v_product_id, v_en_id, $t$c1-radio-smart-irrigation$t$,
      $t$Watering Fields More Wisely$t$,
      $t$A radio feature on a farmer who switched to drip irrigation, with the benefits and the costs.$t$,
      $t$For generations, farmers in the Fergana Valley have watered their fields in much the same way: by opening a channel and letting water flow across the land. It's simple and it requires very little equipment, but a large share of that water never reaches the plants. It evaporates in the heat or soaks into the ground beyond the roots. In a region where summers are long and dry, that loss matters a great deal. Three years ago, a fruit grower called Ulugbek decided to try something different. He replaced the open channels in part of his orchard with drip irrigation, a system of thin pipes that delivers small amounts of water directly to the base of each tree. The first season, he admits, was frustrating. The pipes became blocked with sediment, and he had to learn how to filter the water properly. But by the second year, the difference was obvious. The trees in the drip section needed noticeably less water, the weeds between the rows had largely disappeared because the ground stayed dry, and his apricots were more even in size. So why isn't everyone doing it? The answer, unsurprisingly, is cost. Installing the system requires a significant investment up front, and for a small farmer that can be a serious risk. Ulugbek believes the most useful thing would be for neighbouring farmers to share the cost of equipment and, just as importantly, to share what they learn. 'My first mistakes cost me a season,' he says. 'Nobody else needs to repeat them.'$t$,
      $t$C1$t$, $t$Society$t$, 'general', 'natural', 156, 98, null, $t$gist$t$,
      array[$t$radio$t$, $t$farming$t$, $t$environment$t$]::text[],
      'published', 540,
      $t${"seeded_by":"20261022130000_english_listening_library","format":"monologue","script_type":"radio","speakers":[],"word_count":254,"tts":true}$t$::jsonb,
      $t$[{"id":"q1","type":"mcq","prompt":"What is the main disadvantage of the traditional method?","options":["It needs expensive equipment.","Much of the water never reaches the plants.","It only works for cotton.","It takes too long to learn."],"answer_index":1,"explanation":"The reporter says \"a large share of that water never reaches the plants\" because it evaporates or soaks away."},{"id":"q2","type":"mcq","prompt":"What went wrong in Ulugbek's first season?","options":["The trees died.","The pipes became blocked with sediment.","There was no water that year.","His neighbours complained."],"answer_index":1,"explanation":"\"The pipes became blocked with sediment, and he had to learn how to filter the water properly.\""},{"id":"q3","type":"mcq","prompt":"Why did the weeds largely disappear?","options":["He used chemicals.","The ground between the rows stayed dry.","He removed them by hand.","The trees grew taller."],"answer_index":1,"explanation":"The weeds disappeared \"because the ground stayed dry\"."},{"id":"q4","type":"mcq","prompt":"What does Ulugbek suggest?","options":["The government should pay for everything.","Farmers should share equipment costs and what they learn.","Farmers should go back to open channels.","Only large farms should use drip irrigation."],"answer_index":1,"explanation":"He thinks neighbouring farmers should \"share the cost of equipment and, just as importantly, to share what they learn\"."}]$t$::jsonb
    ),
    (
      v_product_id, v_en_id, $t$c1-tutorial-essay-feedback$t$,
      $t$Feedback on an Essay$t$,
      $t$A tutor and a student discuss how to make an essay argument stronger and more careful.$t$,
      $t$Tutor: Come in, Mohira. I've read your essay on public transport, and there's a lot to like. Your research is thorough, and your paragraphs are well organised.
Mohira: Thank you. But I'm guessing there's a 'but'.
Tutor: There is. My main concern is that your conclusions are much stronger than your evidence. For example, you write that the new bus lanes 'solved the traffic problem'. But your only source is one newspaper article written a month after they opened.
Mohira: So I should find more sources?
Tutor: That would help, but it's also about how you phrase things. Academic writing needs to be careful. Instead of saying the lanes solved the problem, you could say they 'appear to have reduced journey times on some routes'. That's a claim you can actually defend.
Mohira: Doesn't that make the essay sound weaker, though?
Tutor: It's a common worry, but no. Readers trust a writer who knows the limits of the evidence. Overstating your case is what makes an argument easy to attack.
Mohira: That makes sense. So it's not about having fewer opinions, it's about showing how sure I can reasonably be.
Tutor: Exactly. You're still allowed to take a position. You just need to signal how strong your evidence is, and words like 'suggests', 'appears' and 'is likely to' do that job.
Mohira: Is there anything else?
Tutor: Just one thing. You mention the opposing view in a single sentence and then move on. Give it a full paragraph and respond to it properly. Your argument will be far more convincing if you show you've taken the other side seriously.$t$,
      $t$C1$t$, $t$Work and Study$t$, 'general', 'natural', 156, 99, null, $t$conversation$t$,
      array[$t$dialogue$t$, $t$academic writing$t$, $t$university$t$]::text[],
      'published', 550,
      $t${"seeded_by":"20261022130000_english_listening_library","format":"dialogue","script_type":"dialogue","speakers":["Tutor","Mohira"],"word_count":258,"tts":true}$t$::jsonb,
      $t$[{"id":"q1","type":"mcq","prompt":"What is the tutor's main concern?","options":["The essay is too short.","The conclusions are much stronger than the evidence.","The paragraphs are badly organised.","The topic is not academic enough."],"answer_index":1,"explanation":"The tutor says: \"your conclusions are much stronger than your evidence.\""},{"id":"q2","type":"mcq","prompt":"Why is the claim about bus lanes a problem?","options":["It is based on only one newspaper article.","It is based on too many sources.","It is about the wrong city.","The bus lanes were never built."],"answer_index":0,"explanation":"Her \"only source is one newspaper article written a month after they opened\"."},{"id":"q3","type":"mcq","prompt":"What does the tutor say about careful language?","options":["It makes essays sound weaker.","Readers trust writers who know the limits of the evidence.","It should only be used in conclusions.","It is less important than grammar."],"answer_index":1,"explanation":"The tutor says: \"Readers trust a writer who knows the limits of the evidence.\""},{"id":"q4","type":"mcq","prompt":"What should Mohira do with the opposing view?","options":["Remove it","Mention it in one sentence","Give it a full paragraph and respond to it","Put it in the introduction"],"answer_index":2,"explanation":"\"Give it a full paragraph and respond to it properly.\""}]$t$::jsonb
    ),
    (
      v_product_id, v_en_id, $t$c2-lecture-learning-that-lasts$t$,
      $t$Lecture: Why Rereading Fools Us$t$,
      $t$A psychology lecture extract on the illusion of fluency, retrieval practice and spacing.$t$,
      $t$I'd like to begin with a confession that most of you will share. When I was a student, my main revision strategy was to reread my notes, highlighting the important parts, until they felt familiar. And that feeling of familiarity was precisely the problem. Psychologists sometimes call it an illusion of fluency. When material is in front of us, it feels easy to process, and we mistake that ease for knowledge. We assume that because we recognise something, we'll be able to recall it in an exam, where, of course, the page is no longer in front of us. A large body of research points in a rather different direction. One of the most robust findings is what's known as the testing effect, or retrieval practice: the act of trying to pull information out of memory, even when we struggle or get it wrong, tends to strengthen that memory far more than simply looking at it again. This holds across a surprising range of material, from vocabulary and historical dates to more complex conceptual understanding. A second, closely related finding concerns timing. Learning that is spread out over several sessions, with gaps in between, generally lasts considerably longer than the same amount of study crammed into one evening. Now, what makes these strategies awkward is that they feel worse while you're doing them. Testing yourself exposes what you don't know, and returning to a topic after a gap means you've partly forgotten it. It's tempting to interpret that discomfort as a sign of failure. In fact, some researchers have described it as a desirable difficulty: the effort is not an obstacle to learning but, to a large extent, the mechanism of it. The practical implication is uncomfortable but simple. Close the notes, write down everything you can remember, and only then check what you missed.$t$,
      $t$C2$t$, $t$Science$t$, 'general', 'natural', 156, 117, null, $t$gist$t$,
      array[$t$lecture$t$, $t$psychology$t$, $t$study skills$t$]::text[],
      'published', 610,
      $t${"seeded_by":"20261022130000_english_listening_library","format":"monologue","script_type":"lecture","speakers":[],"word_count":305,"tts":true}$t$::jsonb,
      $t$[{"id":"q1","type":"mcq","prompt":"What is the \"illusion of fluency\"?","options":["Speaking a language without mistakes","Mistaking the ease of processing familiar material for real knowledge","Forgetting material because of stress in an exam","Reading faster than other students"],"answer_index":1,"explanation":"The lecturer says that when material is in front of us, \"we mistake that ease for knowledge\"."},{"id":"q2","type":"mcq","prompt":"According to the testing effect, what strengthens memory most?","options":["Highlighting key points","Rereading notes several times","Trying to recall information, even if we get it wrong","Studying everything in one long session"],"answer_index":2,"explanation":"\"The act of trying to pull information out of memory, even when we struggle or get it wrong, tends to strengthen that memory far more.\""},{"id":"q3","type":"mcq","prompt":"Why do these strategies feel awkward?","options":["They take more time than rereading.","They expose what you don't know and what you have partly forgotten.","They require special software.","They only work for science subjects."],"answer_index":1,"explanation":"\"Testing yourself exposes what you don't know, and returning to a topic after a gap means you've partly forgotten it.\""},{"id":"q4","type":"mcq","prompt":"What does the lecturer mean by a \"desirable difficulty\"?","options":["A difficulty that should be avoided","Effort that is itself a key part of how learning happens","A test that is designed to be impossible","A topic that students enjoy despite its difficulty"],"answer_index":1,"explanation":"The lecturer says the effort \"is not an obstacle to learning but, to a large extent, the mechanism of it\"."}]$t$::jsonb
    ),
    (
      v_product_id, v_en_id, $t$c2-radio-machine-translation$t$,
      $t$Will Machines Make Language Learning Pointless?$t$,
      $t$A radio discussion between a presenter and a linguist about translation tools and why people still learn languages.$t$,
      $t$Presenter: Translation apps have become remarkably good, and many listeners have written in asking the same question: is there still any point in spending years learning a foreign language? Dr Karimova, you teach linguistics. Should we all just give up?
Dr Karimova: I'd say the question rests on a rather narrow idea of what a language is for. If all you need is to read a menu or ask for directions, then yes, the tools are now perfectly adequate, and I wouldn't discourage anyone from using them.
Presenter: But you'd argue that's not the whole story.
Dr Karimova: Far from it. Think about what actually happens in a conversation that matters, a job interview, say, or a first meeting with your partner's family. So much of the meaning lies in timing, tone, humour and what's left unsaid. A translation that arrives two seconds late, however accurate, changes the whole dynamic. You become an observer of the conversation rather than a participant in it.
Presenter: Some would say that's a temporary problem. The technology will get faster.
Dr Karimova: It may well do. But there's a second point, which I think is more fundamental. Learning a language changes the learner. It forces you to notice that the categories you took for granted, how you address an older person, for instance, or how you express politeness, aren't universal. That kind of insight can't be outsourced.
Presenter: Isn't that a rather romantic view? Most people learn languages for practical reasons, like work or study, not for personal transformation.
Dr Karimova: That's true, and I don't want to overstate it. But even purely practical goals tend to involve relationships, with colleagues, clients or classmates, and relationships are built in a shared language, not through a screen held between two people. Employers seem to understand this, too. They rarely ask whether you own a translation app.
Presenter: So your advice to our listeners?
Dr Karimova: Use the tools without guilt, but don't confuse them with knowing a language. They're a bridge, not a destination.$t$,
      $t$C2$t$, $t$Society$t$, 'general', 'natural', 156, 125, null, $t$gist$t$,
      array[$t$radio$t$, $t$discussion$t$, $t$languages$t$]::text[],
      'published', 620,
      $t${"seeded_by":"20261022130000_english_listening_library","format":"dialogue","script_type":"radio","speakers":["Presenter","Dr Karimova"],"word_count":324,"tts":true}$t$::jsonb,
      $t$[{"id":"q1","type":"mcq","prompt":"What does Dr Karimova say about translation tools for simple tasks?","options":["They are still unreliable.","They are perfectly adequate, and she does not discourage them.","They should be banned in schools.","They are too slow to be useful."],"answer_index":1,"explanation":"She says that for reading a menu or asking directions \"the tools are now perfectly adequate, and I wouldn't discourage anyone from using them\"."},{"id":"q2","type":"mcq","prompt":"Why does a delayed translation matter in an important conversation?","options":["It costs more money.","It makes you an observer rather than a participant.","It is usually inaccurate.","It makes the other person angry."],"answer_index":1,"explanation":"She says a late translation \"changes the whole dynamic. You become an observer of the conversation rather than a participant in it.\""},{"id":"q3","type":"mcq","prompt":"What is her \"more fundamental\" point?","options":["Technology will never become faster.","Learning a language changes the learner and their assumptions.","Only linguists need foreign languages.","Politeness is the same in every culture."],"answer_index":1,"explanation":"\"Learning a language changes the learner.\" It shows that categories we take for granted \"aren't universal\"."},{"id":"q4","type":"mcq","prompt":"What does she mean by \"a bridge, not a destination\"?","options":["Tools help you communicate but are not the same as knowing the language.","Translation is useful only when travelling.","Learners should stop using tools completely.","Languages are more useful for travel than for work."],"answer_index":0,"explanation":"She advises: \"Use the tools without guilt, but don't confuse them with knowing a language.\""}]$t$::jsonb
    )
  on conflict (product_id, language_id, slug) do update
  set
    title = excluded.title,
    summary = excluded.summary,
    transcript_text = excluded.transcript_text,
    level = excluded.level,
    category = excluded.category,
    accent = excluded.accent,
    speed_label = excluded.speed_label,
    speed_wpm = excluded.speed_wpm,
    duration_seconds = excluded.duration_seconds,
    audio_url = excluded.audio_url,
    focus_skill = excluded.focus_skill,
    tags = excluded.tags,
    status = excluded.status,
    sort_order = excluded.sort_order,
    metadata = coalesce(public.listening_items.metadata, '{}'::jsonb) || excluded.metadata,
    questions = excluded.questions,
    updated_at = now();

  -- Replace the dictation sentences for these items.
  delete from public.listening_segments s
  using public.listening_items li
  where s.listening_item_id = li.id
    and li.product_id = v_product_id
    and li.language_id = v_en_id
    and li.slug in ($t$a1-metro-next-station$t$, $t$a1-voicemail-plov-tonight$t$, $t$a1-new-classmate$t$, $t$a1-shop-closing-soon$t$, $t$a1-weather-tashkent$t$, $t$train-platform-change$t$, $t$a2-dentist-appointment-change$t$, $t$a2-market-tomatoes$t$, $t$a2-library-welcome$t$, $t$a2-taxi-to-airport$t$, $t$a2-football-training-moved$t$, $t$study-group-time-change$t$, $t$b1-podcast-learning-on-the-move$t$, $t$b1-job-interview-invitation$t$, $t$b1-flight-delay-announcement$t$, $t$b1-weekend-in-the-mountains$t$, $t$b1-flat-viewing$t$, $t$report-check-before-send$t$, $t$b2-radio-neighbourhood-garden$t$, $t$b2-app-launch-decision$t$, $t$b2-internship-or-summer-course$t$, $t$b2-wrong-order-call$t$, $t$b2-podcast-hybrid-office$t$, $t$c1-lecture-cooler-cities$t$, $t$c1-lecture-silk-road-network$t$, $t$c1-podcast-career-change$t$, $t$c1-radio-smart-irrigation$t$, $t$c1-tutorial-essay-feedback$t$, $t$c2-lecture-learning-that-lasts$t$, $t$c2-radio-machine-translation$t$);

  insert into public.listening_segments (listening_item_id, segment_index, segment_text, focus_phrase, metadata)
  select li.id, x.segment_index, x.segment_text, x.focus_phrase,
         jsonb_build_object('seeded_by', '20261022130000_english_listening_library', 'role', 'dictation')
  from (
    values
    ($t$a1-metro-next-station$t$, 0, $t$The next station is Novza.$t$, $t$next station$t$),
    ($t$a1-metro-next-station$t$, 1, $t$The doors are closing now.$t$, $t$closing now$t$),
    ($t$a1-voicemail-plov-tonight$t$, 0, $t$I want to cook plov tonight.$t$, $t$cook plov$t$),
    ($t$a1-voicemail-plov-tonight$t$, 1, $t$Can you come to my flat at seven o'clock?$t$, $t$seven o'clock$t$),
    ($t$a1-new-classmate$t$, 0, $t$I come here by bus.$t$, $t$by bus$t$),
    ($t$a1-new-classmate$t$, 1, $t$Our English lesson starts at nine.$t$, $t$starts at nine$t$),
    ($t$a1-shop-closing-soon$t$, 0, $t$Our café is on the second floor.$t$, $t$second floor$t$),
    ($t$a1-shop-closing-soon$t$, 1, $t$It opens at ten and closes at eight.$t$, $t$closes at eight$t$),
    ($t$a1-weather-tashkent$t$, 0, $t$It is thirty-two degrees in the afternoon.$t$, $t$thirty-two degrees$t$),
    ($t$a1-weather-tashkent$t$, 1, $t$Tonight it is cooler, about twenty degrees.$t$, $t$cooler$t$),
    ($t$train-platform-change$t$, 0, $t$Please keep your ticket and passport with you.$t$, $t$ticket and passport$t$),
    ($t$train-platform-change$t$, 1, $t$The café car is in carriage six.$t$, $t$carriage six$t$),
    ($t$a2-dentist-appointment-change$t$, 0, $t$Unfortunately, the doctor is ill that day, so we need to change it.$t$, $t$the doctor is ill$t$),
    ($t$a2-dentist-appointment-change$t$, 1, $t$If you don't call, we will book Monday for you.$t$, $t$if you don't call$t$),
    ($t$a2-market-tomatoes$t$, 0, $t$I need two kilos for a salad.$t$, $t$two kilos$t$),
    ($t$a2-market-tomatoes$t$, 1, $t$Because you're buying a lot, the dill is free.$t$, $t$the dill is free$t$),
    ($t$a2-library-welcome$t$, 0, $t$You can borrow five books for two weeks.$t$, $t$borrow five books$t$),
    ($t$a2-library-welcome$t$, 1, $t$You can work in groups on the second floor.$t$, $t$work in groups$t$),
    ($t$a2-taxi-to-airport$t$, 0, $t$I need a taxi to the airport tomorrow morning.$t$, $t$to the airport$t$),
    ($t$a2-taxi-to-airport$t$, 1, $t$The driver will call you ten minutes before he arrives.$t$, $t$ten minutes before$t$),
    ($t$a2-football-training-moved$t$, 0, $t$Training starts at five, but please come fifteen minutes early.$t$, $t$fifteen minutes early$t$),
    ($t$a2-football-training-moved$t$, 1, $t$If you can't come, please send me a message.$t$, $t$send me a message$t$),
    ($t$study-group-time-change$t$, 0, $t$Seven is a bit late for me.$t$, $t$a bit late$t$),
    ($t$study-group-time-change$t$, 1, $t$Bring your notes from last week.$t$, $t$notes from last week$t$),
    ($t$b1-podcast-learning-on-the-move$t$, 0, $t$The first time, just try to get the general idea.$t$, $t$the general idea$t$),
    ($t$b1-podcast-learning-on-the-move$t$, 1, $t$Don't try to learn everything at once.$t$, $t$everything at once$t$),
    ($t$b1-job-interview-invitation$t$, 0, $t$Please bring a printed copy of your CV and a copy of your diploma.$t$, $t$printed copy$t$),
    ($t$b1-job-interview-invitation$t$, 1, $t$I'd recommend taking the metro.$t$, $t$recommend taking$t$),
    ($t$b1-flight-delay-announcement$t$, 0, $t$Please note that the flight will now board from gate nine, not gate five.$t$, $t$gate nine$t$),
    ($t$b1-flight-delay-announcement$t$, 1, $t$While you wait, you can collect a free meal voucher from the information desk.$t$, $t$meal voucher$t$),
    ($t$b1-weekend-in-the-mountains$t$, 0, $t$Don't forget it's much colder up there, especially at night.$t$, $t$much colder$t$),
    ($t$b1-weekend-in-the-mountains$t$, 1, $t$A shared taxi is faster.$t$, $t$shared taxi$t$),
    ($t$b1-flat-viewing$t$, 0, $t$It includes the internet and water, but you pay for electricity and gas yourself.$t$, $t$electricity and gas$t$),
    ($t$b1-flat-viewing$t$, 1, $t$A new one will be delivered next week.$t$, $t$will be delivered$t$),
    ($t$report-check-before-send$t$, 0, $t$First, please check the final figures with someone in the finance team.$t$, $t$final figures$t$),
    ($t$report-check-before-send$t$, 1, $t$Send it to me by Thursday at noon, and I'll forward it after I've had a final look.$t$, $t$final look$t$),
    ($t$b2-radio-neighbourhood-garden$t$, 0, $t$At first, not everyone was convinced.$t$, $t$not everyone was convinced$t$),
    ($t$b2-radio-neighbourhood-garden$t$, 1, $t$Nilufar says the vegetables are a bonus, but the real change is social.$t$, $t$the real change is social$t$),
    ($t$b2-app-launch-decision$t$, 0, $t$The developers think they need at least two weeks to fix it properly.$t$, $t$at least two weeks$t$),
    ($t$b2-app-launch-decision$t$, 1, $t$Then I'd rather launch on time with what works.$t$, $t$I'd rather$t$),
    ($t$b2-internship-or-summer-course$t$, 0, $t$It isn't very well advertised.$t$, $t$well advertised$t$),
    ($t$b2-internship-or-summer-course$t$, 1, $t$Real experience will look better on my CV.$t$, $t$real experience$t$),
    ($t$b2-wrong-order-call$t$, 0, $t$I'm very sorry about that.$t$, $t$very sorry$t$),
    ($t$b2-wrong-order-call$t$, 1, $t$Please keep the laptop in its original box with all the cables.$t$, $t$original box$t$),
    ($t$b2-podcast-hybrid-office$t$, 0, $t$Designers were waiting hours for an answer.$t$, $t$waiting hours$t$),
    ($t$b2-podcast-hybrid-office$t$, 1, $t$I wouldn't go back now.$t$, $t$wouldn't go back$t$),
    ($t$c1-lecture-cooler-cities$t$, 0, $t$The most effective tool is surprisingly old-fashioned: trees.$t$, $t$surprisingly old-fashioned$t$),
    ($t$c1-lecture-cooler-cities$t$, 1, $t$I'm not suggesting that modern cities should simply copy these designs.$t$, $t$I'm not suggesting$t$),
    ($t$c1-lecture-silk-road-network$t$, 0, $t$Silk was only one product among many.$t$, $t$one product among many$t$),
    ($t$c1-lecture-silk-road-network$t$, 1, $t$It's a memorable story, and it appears in a number of later sources.$t$, $t$a memorable story$t$),
    ($t$c1-podcast-career-change$t$, 0, $t$It wasn't a sudden decision.$t$, $t$sudden decision$t$),
    ($t$c1-podcast-career-change$t$, 1, $t$Test the new career before you jump into it.$t$, $t$jump into it$t$),
    ($t$c1-radio-smart-irrigation$t$, 0, $t$The first season, he admits, was frustrating.$t$, $t$he admits$t$),
    ($t$c1-radio-smart-irrigation$t$, 1, $t$The answer, unsurprisingly, is cost.$t$, $t$unsurprisingly$t$),
    ($t$c1-tutorial-essay-feedback$t$, 0, $t$My main concern is that your conclusions are much stronger than your evidence.$t$, $t$main concern$t$),
    ($t$c1-tutorial-essay-feedback$t$, 1, $t$Overstating your case is what makes an argument easy to attack.$t$, $t$overstating your case$t$),
    ($t$c2-lecture-learning-that-lasts$t$, 0, $t$And that feeling of familiarity was precisely the problem.$t$, $t$precisely the problem$t$),
    ($t$c2-lecture-learning-that-lasts$t$, 1, $t$Close the notes, write down everything you can remember, and only then check what you missed.$t$, $t$only then$t$),
    ($t$c2-radio-machine-translation$t$, 0, $t$I'd say the question rests on a rather narrow idea of what a language is for.$t$, $t$rather narrow idea$t$),
    ($t$c2-radio-machine-translation$t$, 1, $t$That kind of insight can't be outsourced.$t$, $t$can't be outsourced$t$)
  ) as x(slug, segment_index, segment_text, focus_phrase)
  join public.listening_items li
    on li.slug = x.slug and li.product_id = v_product_id and li.language_id = v_en_id;

  -- Old single-sentence task sets kept the previous script; keep them in step.
  update public.listening_task_sets ts
  set expected_answer_json = coalesce(ts.expected_answer_json, '{}'::jsonb)
        || jsonb_build_object('transcript', li.transcript_text),
      updated_at = now()
  from public.listening_items li
  where ts.listening_item_id = li.id
    and li.product_id = v_product_id
    and li.language_id = v_en_id
    and li.slug in ($t$a1-metro-next-station$t$, $t$a1-voicemail-plov-tonight$t$, $t$a1-new-classmate$t$, $t$a1-shop-closing-soon$t$, $t$a1-weather-tashkent$t$, $t$train-platform-change$t$, $t$a2-dentist-appointment-change$t$, $t$a2-market-tomatoes$t$, $t$a2-library-welcome$t$, $t$a2-taxi-to-airport$t$, $t$a2-football-training-moved$t$, $t$study-group-time-change$t$, $t$b1-podcast-learning-on-the-move$t$, $t$b1-job-interview-invitation$t$, $t$b1-flight-delay-announcement$t$, $t$b1-weekend-in-the-mountains$t$, $t$b1-flat-viewing$t$, $t$report-check-before-send$t$, $t$b2-radio-neighbourhood-garden$t$, $t$b2-app-launch-decision$t$, $t$b2-internship-or-summer-course$t$, $t$b2-wrong-order-call$t$, $t$b2-podcast-hybrid-office$t$, $t$c1-lecture-cooler-cities$t$, $t$c1-lecture-silk-road-network$t$, $t$c1-podcast-career-change$t$, $t$c1-radio-smart-irrigation$t$, $t$c1-tutorial-essay-feedback$t$, $t$c2-lecture-learning-that-lasts$t$, $t$c2-radio-machine-translation$t$);
end
$$;

insert into public.learning_content_registry_items (
  product_id, language_id, service_key, content_type, source_table, source_record_id, source_ref,
  title, description, skill_key, subskill_keys, cefr_level, difficulty, estimated_minutes,
  learning_objective, tags, status, payload_json, metadata
)
select
  li.product_id,
  li.language_id,
  'listening',
  'listening.item',
  'listening_items',
  li.id,
  li.slug,
  li.title,
  li.summary,
  'listening',
  array['listening.word_recognition', 'listening.detail_recall', 'vocabulary.recall']::text[],
  li.level,
  case li.level
    when 'A1' then 0.20
    when 'A2' then 0.30
    when 'B1' then 0.45
    when 'B2' then 0.60
    when 'C1' then 0.75
    when 'C2' then 0.90
    else 0.50
  end,
  greatest(1, least(30, ceil(li.duration_seconds / 60.0)::int + 4)),
  li.summary,
  coalesce(li.tags, '{}'::text[]),
  'published',
  jsonb_build_object(
    'accent', li.accent,
    'speed_label', li.speed_label,
    'speed_wpm', li.speed_wpm,
    'duration_seconds', li.duration_seconds,
    'focus_skill', li.focus_skill,
    'question_count', jsonb_array_length(li.questions)
  ),
  li.metadata
from public.listening_items li
join public.languages l on l.id = li.language_id and l.code = 'en'
join public.products p on p.id = li.product_id and lower(coalesce(p.metadata->>'slug', '')) = 'english-listening'
where li.slug in ($t$a1-metro-next-station$t$, $t$a1-voicemail-plov-tonight$t$, $t$a1-new-classmate$t$, $t$a1-shop-closing-soon$t$, $t$a1-weather-tashkent$t$, $t$train-platform-change$t$, $t$a2-dentist-appointment-change$t$, $t$a2-market-tomatoes$t$, $t$a2-library-welcome$t$, $t$a2-taxi-to-airport$t$, $t$a2-football-training-moved$t$, $t$study-group-time-change$t$, $t$b1-podcast-learning-on-the-move$t$, $t$b1-job-interview-invitation$t$, $t$b1-flight-delay-announcement$t$, $t$b1-weekend-in-the-mountains$t$, $t$b1-flat-viewing$t$, $t$report-check-before-send$t$, $t$b2-radio-neighbourhood-garden$t$, $t$b2-app-launch-decision$t$, $t$b2-internship-or-summer-course$t$, $t$b2-wrong-order-call$t$, $t$b2-podcast-hybrid-office$t$, $t$c1-lecture-cooler-cities$t$, $t$c1-lecture-silk-road-network$t$, $t$c1-podcast-career-change$t$, $t$c1-radio-smart-irrigation$t$, $t$c1-tutorial-essay-feedback$t$, $t$c2-lecture-learning-that-lasts$t$, $t$c2-radio-machine-translation$t$)
on conflict (language_id, service_key, content_type, source_ref) do update
set
  source_table = excluded.source_table,
  source_record_id = excluded.source_record_id,
  title = excluded.title,
  description = excluded.description,
  skill_key = excluded.skill_key,
  subskill_keys = excluded.subskill_keys,
  cefr_level = excluded.cefr_level,
  difficulty = excluded.difficulty,
  estimated_minutes = excluded.estimated_minutes,
  learning_objective = excluded.learning_objective,
  tags = excluded.tags,
  status = excluded.status,
  payload_json = excluded.payload_json,
  metadata = coalesce(public.learning_content_registry_items.metadata, '{}'::jsonb) || excluded.metadata,
  updated_at = now();
