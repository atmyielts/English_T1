-- Reading library: A1 articles (8) with comprehension questions.
-- ============================================================================
-- Upserts full-length A1 reading texts (80-130 words) into
-- public.reading_articles with 5 multiple-choice questions each, then registers
-- every article in learning_content_registry_items (content_type
-- 'reading.article', source_ref = slug) so it shows in the hub catalog.
-- Answer keys live in reading_articles.questions and must be stripped by the
-- edge function before items reach the browser.
-- Idempotent: safe to re-run.
-- ============================================================================

-- Guard: the questions column is added by the English activity questions
-- migration; repeat it here (no-op if present) so this file applies in any order.
alter table public.reading_articles
  add column if not exists questions jsonb not null default '[]'::jsonb;

do $mig$
declare
  v_product_id uuid;
  v_language_id uuid;
begin
  select p.id
  into v_product_id
  from public.products p
  where lower(coalesce(p.metadata->>'slug', '')) = 'english-reading'
  order by p.created_at asc
  limit 1;

  select l.id
  into v_language_id
  from public.languages l
  where l.code = 'en'
  limit 1;

  if v_product_id is null or v_language_id is null then
    raise exception 'Required english-reading product or en language is missing';
  end if;

  insert into public.reading_articles (
    product_id,
    language_id,
    slug,
    title,
    summary,
    content_markdown,
    level,
    category,
    theme,
    tone,
    read_time_minutes,
    is_hot,
    status,
    sort_order,
    metadata,
    questions
  )
  values
    (
      v_product_id, v_language_id, 'city-signs-quick-read',
      'Reading City Signs',
      'Aziz has moved to Tashkent and explains the signs he reads every day.',
      $md$My name is Aziz. I am from Nukus, and now I live in Tashkent. The city is very big, and there are signs everywhere.

Every morning, I walk to the metro. At the station, a green sign says "Entrance". A red sign says "No entry". I always look for the green sign.

Near my flat, there is a small pharmacy. The sign on the door says "Open from 8:00 to 22:00". On Sunday, it opens at 10:00.

In the park, there are two signs. One says "Please do not walk on the grass". The other says "No dogs".

Signs are short, but they are very useful. I read them every day, and now I know my new city better.$md$,
      'A1', 'Everyday', 'city life', 'lime', 1, true, 'published', 110,
      '{"seeded_by":"20261022120100_reading_library_a1","genre":"personal text","writing_tone":"friendly","word_count":119}'::jsonb,
      $q$[{"id":"q1","type":"mcq","skill":"reading.main_idea","prompt":"What is the text mainly about?","options":["Aziz's job at a pharmacy","The history of the Tashkent metro","Signs that Aziz sees in his new city","Aziz's family in Nukus"],"answer_index":2,"explanation":"Aziz lives in a new city and says \"there are signs everywhere\". The text describes the signs he reads every day."},{"id":"q2","type":"mcq","skill":"reading.detail","prompt":"What colour is the \"No entry\" sign at the metro station?","options":["Red","Green","Blue","White"],"answer_index":0,"explanation":"The text says: \"A red sign says 'No entry'.\""},{"id":"q3","type":"mcq","skill":"reading.detail","prompt":"When does the pharmacy open on Sunday?","options":["At 8:00","At 22:00","At 10:00","It does not open on Sunday"],"answer_index":2,"explanation":"The text says: \"On Sunday, it opens at 10:00.\""},{"id":"q4","type":"mcq","skill":"reading.detail","prompt":"What does one of the park signs ask people not to do?","options":["Sit on the benches","Take photos","Ride bikes","Walk on the grass"],"answer_index":3,"explanation":"The text says: \"One says 'Please do not walk on the grass'.\""},{"id":"q5","type":"mcq","skill":"reading.vocabulary","prompt":"In the last paragraph, \"useful\" means...","options":["expensive","helpful","difficult","boring"],"answer_index":1,"explanation":"Aziz says signs are \"very useful\" and that they help him know his city better, so they are helpful."}]$q$::jsonb
    ),
    (
      v_product_id, v_language_id, 'a1-message-about-english-class',
      'A Message About English Class',
      'Dilnoza writes to a classmate with news about their English class.',
      $md$Hi Kamola,

It's Dilnoza from your English class. The teacher is ill today, so there is no class this evening.

Our next class is on Thursday at 6 p.m. It is in a new room: Room 204, on the second floor. Please bring your green workbook and a pen.

We have a short test on Thursday. It is about the past simple, so please read pages 30 to 35 in the workbook.

After the class, some of us want to go to the café near the bus stop. Do you want to come with us?

See you on Thursday!

Dilnoza$md$,
      'A1', 'Study', 'classes', 'mint', 1, false, 'published', 120,
      '{"seeded_by":"20261022120100_reading_library_a1","genre":"message","writing_tone":"friendly","word_count":100}'::jsonb,
      $q$[{"id":"q1","type":"mcq","skill":"reading.main_idea","prompt":"Why does Dilnoza write to Kamola?","options":["To give her news about their English class","To ask her to bring a pen to the café","To invite her to a birthday party on Thursday","To tell her about their new English teacher"],"answer_index":0,"explanation":"Dilnoza explains that there is no class today and gives information about the next class and the test."},{"id":"q2","type":"mcq","skill":"reading.detail","prompt":"Why is there no class this evening?","options":["The room is closed.","It is a holiday.","The teacher is ill.","The students have a test."],"answer_index":2,"explanation":"The message says: \"The teacher is ill today, so there is no class this evening.\""},{"id":"q3","type":"mcq","skill":"reading.detail","prompt":"Where is the next class?","options":["In Room 240","In Room 204","In the café","In the old room on the first floor"],"answer_index":1,"explanation":"The message says: \"It is in a new room: Room 204, on the second floor.\""},{"id":"q4","type":"mcq","skill":"reading.detail","prompt":"What is the test about?","options":["New words for food","Reading a story","Writing an email","The past simple"],"answer_index":3,"explanation":"The message says: \"It is about the past simple.\""},{"id":"q5","type":"mcq","skill":"reading.vocabulary","prompt":"In \"Please bring your green workbook\", \"bring\" means...","options":["buy it","write in it","take it with you","leave it at home"],"answer_index":2,"explanation":"Kamola must have the workbook with her in class, so \"bring\" means take it with you."}]$q$::jsonb
    ),
    (
      v_product_id, v_language_id, 'a1-sunday-at-grandmas-house',
      'Sunday at Grandma''s House',
      'A young person describes a family Sunday at their grandmother''s house in a village.',
      $md$Every Sunday, my family visits my grandmother. She lives in a village near Andijan, about one hour from our town by car.

Her house is old, but it is big, and it has a beautiful garden. There are apple trees and a lot of flowers. In summer, we sit under the trees and drink green tea.

My grandmother is a great cook. On Sundays, she makes plov in a big pot. My father helps her, and my little sister and I put the plates on the table. My uncle and his children come too, so there are twelve people at lunch.

After lunch, the children play in the garden, and the adults talk. We go home in the evening. I love Sundays!$md$,
      'A1', 'Culture', 'family', 'sky', 1, false, 'published', 130,
      '{"seeded_by":"20261022120100_reading_library_a1","genre":"personal text","writing_tone":"friendly","word_count":122}'::jsonb,
      $q$[{"id":"q1","type":"mcq","skill":"reading.main_idea","prompt":"What is the text mainly about?","options":["A family day at the writer's grandmother's house","How the writer's grandmother cooks plov","A family trip from the village to Andijan","The writer's favourite games in the garden"],"answer_index":0,"explanation":"The text describes what the family does every Sunday at the grandmother's house."},{"id":"q2","type":"mcq","skill":"reading.detail","prompt":"How far is the grandmother's village from the writer's town?","options":["About ten minutes on foot","About two hours by bus","About one hour by car","In the same street"],"answer_index":2,"explanation":"The text says the village is \"about one hour from our town by car\"."},{"id":"q3","type":"mcq","skill":"reading.detail","prompt":"Who helps the grandmother cook?","options":["The writer's uncle","The writer's little sister","The writer's father","The writer's mother"],"answer_index":2,"explanation":"The text says: \"My father helps her.\""},{"id":"q4","type":"mcq","skill":"reading.detail","prompt":"How many people are at lunch?","options":["Twelve","Ten","Two","Twenty"],"answer_index":0,"explanation":"The text says: \"there are twelve people at lunch.\""},{"id":"q5","type":"mcq","skill":"reading.vocabulary","prompt":"In \"the children play in the garden, and the adults talk\", \"adults\" are...","options":["young children","grown-up people","neighbours","teachers"],"answer_index":1,"explanation":"The text compares \"the children\" with \"the adults\", so adults are grown-up people."}]$q$::jsonb
    ),
    (
      v_product_id, v_language_id, 'a1-new-sports-centre',
      'A New Sports Centre',
      'A notice gives the times, prices and activities at a new sports centre.',
      $md$Good news! Our new sports centre opens on Monday, 1 September.

What can you do here? You can swim in our big pool, play football, basketball or volleyball, go to yoga and dance classes, or use the gym.

Opening times: Monday to Friday, from 7:00 to 22:00. Saturday and Sunday, from 9:00 to 20:00.

Prices: One visit costs 40,000 soum. A card for one month costs 300,000 soum. Students pay half price with a student card.

Is this your first visit? Your first yoga class is free!

Please bring a towel. You can buy water and snacks in our café.$md$,
      'A1', 'Health', 'sport', 'peach', 1, false, 'published', 140,
      '{"seeded_by":"20261022120100_reading_library_a1","genre":"notice","writing_tone":"informative","word_count":100}'::jsonb,
      $q$[{"id":"q1","type":"mcq","skill":"reading.main_idea","prompt":"What is this notice about?","options":["A football match at the sports centre","A new café with water and snacks","A job at a big swimming pool","A new sports centre and what it offers"],"answer_index":3,"explanation":"The notice gives information about the new sports centre: activities, times and prices."},{"id":"q2","type":"mcq","skill":"reading.detail","prompt":"When is the centre open on Saturday?","options":["From 7:00 to 22:00","From 9:00 to 22:00","From 9:00 to 20:00","It is closed on Saturday."],"answer_index":2,"explanation":"The notice says: \"Saturday and Sunday, from 9:00 to 20:00.\""},{"id":"q3","type":"mcq","skill":"reading.detail","prompt":"How much does a one-month card cost for a student with a student card?","options":["300,000 soum","40,000 soum","20,000 soum","150,000 soum"],"answer_index":3,"explanation":"A one-month card costs 300,000 soum, and \"Students pay half price\", so a student pays 150,000 soum."},{"id":"q4","type":"mcq","skill":"reading.detail","prompt":"What is free?","options":["Your first yoga class","Water in the café","Towels","Your first month"],"answer_index":0,"explanation":"The notice says: \"Your first yoga class is free!\""},{"id":"q5","type":"mcq","skill":"reading.vocabulary","prompt":"In \"You can buy water and snacks\", \"snacks\" are...","options":["small things to eat","clothes for sport","big hot meals","tickets for the gym"],"answer_index":0,"explanation":"Snacks are sold in the café with water. They are small things to eat."}]$q$::jsonb
    ),
    (
      v_product_id, v_language_id, 'a1-welcome-to-the-guest-house',
      'Welcome to the Guest House',
      'A welcome note tells guests about breakfast, check-out and a free city tour.',
      $md$Dear guest,

Welcome to the Old Town Guest House in Bukhara! We hope you enjoy your stay.

Breakfast is in the garden from 7:30 to 10:00. We have bread, eggs, fruit, cheese, and tea or coffee.

Please leave your room by 12:00 on your last day. After that, you can leave your bags at reception.

Do you want to see the city? Our free walking tour starts at the front door every day at 16:00. It takes two hours.

Do you need help? Please come to reception and ask for Farrukh. He speaks English, Russian and Uzbek.

Have a nice day!$md$,
      'A1', 'Travel', 'hotels', 'lavender', 1, false, 'published', 150,
      '{"seeded_by":"20261022120100_reading_library_a1","genre":"notice","writing_tone":"friendly","word_count":101}'::jsonb,
      $q$[{"id":"q1","type":"mcq","skill":"reading.main_idea","prompt":"What is the note mainly about?","options":["Useful information for guests at the guest house","A job for a tour guide at the guest house","The history of the old town of Bukhara","The breakfast menu at a café in the city"],"answer_index":0,"explanation":"The note welcomes guests and tells them about breakfast, leaving the room, a tour and help."},{"id":"q2","type":"mcq","skill":"reading.detail","prompt":"Where is breakfast?","options":["In your room","In the garden","At reception","In a café in the city"],"answer_index":1,"explanation":"The note says: \"Breakfast is in the garden from 7:30 to 10:00.\""},{"id":"q3","type":"mcq","skill":"reading.detail","prompt":"When must guests leave their room on the last day?","options":["By 10:00","By 16:00","By 12:00","By 7:30"],"answer_index":2,"explanation":"The note says: \"Please leave your room by 12:00 on your last day.\""},{"id":"q4","type":"mcq","skill":"reading.detail","prompt":"What languages does Farrukh speak?","options":["English and Uzbek only","English, Russian and Uzbek","Russian and Tajik","English, French and Uzbek"],"answer_index":1,"explanation":"The note says: \"He speaks English, Russian and Uzbek.\""},{"id":"q5","type":"mcq","skill":"reading.vocabulary","prompt":"In the note, \"reception\" is...","options":["the place at the entrance where staff help guests","the garden where the guests have their breakfast","the room where the hotel staff sleep at night","the street in front of the main hotel door"],"answer_index":0,"explanation":"Guests can leave bags at reception and ask for Farrukh there when they need help."}]$q$::jsonb
    ),
    (
      v_product_id, v_language_id, 'a1-a-day-at-the-cafe',
      'A Day at the Café',
      'Bekzod describes his working day at a café in Samarkand and his plan for the future.',
      $md$Hello! My name is Bekzod, and I am twenty-two. I work in a small café in Samarkand.

I get up at six o'clock every morning. I have breakfast at home, and then I take the bus to work. The café opens at eight.

At work, I make coffee and tea, and I talk to the customers. Many tourists come to our café. They often ask me about the city, so I speak English every day.

I have lunch at one o'clock. In the afternoon, I clean the tables and wash the cups. I finish work at five.

In the evening, I study English online for one hour. I want to be a tour guide next year.$md$,
      'A1', 'Work', 'jobs', 'sand', 1, false, 'published', 160,
      '{"seeded_by":"20261022120100_reading_library_a1","genre":"personal text","writing_tone":"friendly","word_count":116}'::jsonb,
      $q$[{"id":"q1","type":"mcq","skill":"reading.main_idea","prompt":"What is the text mainly about?","options":["The history of the city of Samarkand","How Bekzod makes coffee and tea","Bekzod's family and his home","Bekzod's working day and his plans"],"answer_index":3,"explanation":"Bekzod describes what he does from morning to evening and says what job he wants next year."},{"id":"q2","type":"mcq","skill":"reading.detail","prompt":"How does Bekzod go to work?","options":["By car","On foot","By bus","By taxi"],"answer_index":2,"explanation":"The text says: \"I take the bus to work.\""},{"id":"q3","type":"mcq","skill":"reading.detail","prompt":"Why does Bekzod speak English every day?","options":["His boss is from England.","He teaches English in the evening.","His friends speak only English.","Many tourists come to the café."],"answer_index":3,"explanation":"The text says: \"Many tourists come to our café. They often ask me about the city, so I speak English every day.\""},{"id":"q4","type":"mcq","skill":"reading.detail","prompt":"What job does Bekzod want next year?","options":["Teacher","Cook","Tour guide","Bus driver"],"answer_index":2,"explanation":"The text says: \"I want to be a tour guide next year.\""},{"id":"q5","type":"mcq","skill":"reading.vocabulary","prompt":"In the text, \"customers\" are...","options":["people who make coffee in a café","people who buy things in a shop or café","people who drive buses in the city","people who clean tables after lunch"],"answer_index":1,"explanation":"Bekzod makes drinks and talks to the customers, the people who come to the café and buy things."}]$q$::jsonb
    ),
    (
      v_product_id, v_language_id, 'a1-shopping-at-the-bazaar',
      'Shopping at the Bazaar',
      'Mum sends Jasur a message with a shopping list for the bazaar.',
      $md$Hi Jasur,

Can you go to the bazaar after school today? We have guests for dinner tonight, and I am at work until seven.

Please buy two kilos of potatoes, one kilo of tomatoes, some onions and three loaves of bread. We also need a big bag of rice. Don't buy apples. We have a lot at home.

The money is on the kitchen table. Please take the big blue bag. It is next to the door.

Go to Uncle Rustam's stall for the vegetables. His tomatoes are very good, and he knows me.

Thank you! Call me if you have a problem.

Love,

Mum$md$,
      'A1', 'Everyday', 'shopping', 'lime', 1, false, 'published', 170,
      '{"seeded_by":"20261022120100_reading_library_a1","genre":"message","writing_tone":"friendly","word_count":105}'::jsonb,
      $q$[{"id":"q1","type":"mcq","skill":"reading.main_idea","prompt":"Why does Mum write this message?","options":["She wants Jasur to do the shopping.","She wants Jasur to cook dinner.","She wants Jasur to come to her work.","She wants Jasur to visit Uncle Rustam's house."],"answer_index":0,"explanation":"Mum asks: \"Can you go to the bazaar after school today?\" and gives a shopping list."},{"id":"q2","type":"mcq","skill":"reading.detail","prompt":"Why can't Mum go to the bazaar?","options":["She is at work until seven.","She is ill.","She is with the guests.","She has no money."],"answer_index":0,"explanation":"Mum writes: \"I am at work until seven.\""},{"id":"q3","type":"mcq","skill":"reading.detail","prompt":"What does Mum NOT want Jasur to buy?","options":["Apples","Bread","Onions","Rice"],"answer_index":0,"explanation":"Mum writes: \"Don't buy apples. We have a lot at home.\""},{"id":"q4","type":"mcq","skill":"reading.detail","prompt":"Where is the money?","options":["In the blue bag","Next to the door","On the kitchen table","At Uncle Rustam's stall"],"answer_index":2,"explanation":"Mum writes: \"The money is on the kitchen table.\""},{"id":"q5","type":"mcq","skill":"reading.vocabulary","prompt":"In the message, a \"stall\" is...","options":["a big shop in the city centre with many floors","a small place where someone sells things at a market","a kind of vegetable that grows in the garden","a big table in the kitchen at home"],"answer_index":1,"explanation":"Jasur can buy vegetables at Uncle Rustam's stall at the bazaar, so it is a small place where someone sells things."}]$q$::jsonb
    ),
    (
      v_product_id, v_language_id, 'a1-park-clean-up-day',
      'Park Clean-Up Day',
      'A notice invites people to help clean a city park and plant new trees.',
      $md$Let's clean our park together!

When: Saturday, 12 April, from 9:00 to 12:00

Where: Meet at the big fountain in Friendship Park

Our park is beautiful, but there is a lot of rubbish near the lake and under the trees. We need your help!

We give you gloves, bags and water. Please wear old clothes and good shoes. Bring a hat, because it can be sunny.

Children are welcome, but they must come with an adult.

After the work, we plant twenty new trees together. Then there is free soup and tea for everyone.

Do you want to help? Write your name on the list at the park café, or talk to the park guard at the main gate.$md$,
      'A1', 'Environment', 'parks', 'mint', 1, false, 'published', 180,
      '{"seeded_by":"20261022120100_reading_library_a1","genre":"notice","writing_tone":"friendly","word_count":119}'::jsonb,
      $q$[{"id":"q1","type":"mcq","skill":"reading.main_idea","prompt":"What is the notice about?","options":["A day to open a new café in the park","A sports day for children in the park","A day to clean the park and plant trees","A boat trip for families on the lake"],"answer_index":2,"explanation":"The notice says \"Let's clean our park together!\" and explains the plan for the day, including planting trees."},{"id":"q2","type":"mcq","skill":"reading.detail","prompt":"Where do people meet?","options":["At the big fountain","At the lake","At the park café","At the main gate"],"answer_index":0,"explanation":"The notice says: \"Meet at the big fountain in Friendship Park.\""},{"id":"q3","type":"mcq","skill":"reading.detail","prompt":"What do the organisers give the helpers?","options":["Gloves, bags and water","Hats and shoes","Old clothes","Trees to take home"],"answer_index":0,"explanation":"The notice says: \"We give you gloves, bags and water.\""},{"id":"q4","type":"mcq","skill":"reading.detail","prompt":"Who must children come with?","options":["Their friends","An adult","A park guard","Nobody"],"answer_index":1,"explanation":"The notice says children \"must come with an adult\"."},{"id":"q5","type":"mcq","skill":"reading.vocabulary","prompt":"In the notice, \"rubbish\" means...","options":["things people throw away","small trees and flowers","clean water from the lake","old clothes and shoes"],"answer_index":0,"explanation":"The park needs cleaning because there is \"a lot of rubbish\", things people throw away."}]$q$::jsonb
    )
  on conflict (product_id, language_id, slug) do update
  set
    title = excluded.title,
    summary = excluded.summary,
    content_markdown = excluded.content_markdown,
    level = excluded.level,
    category = excluded.category,
    theme = excluded.theme,
    tone = excluded.tone,
    read_time_minutes = excluded.read_time_minutes,
    is_hot = excluded.is_hot,
    status = excluded.status,
    sort_order = excluded.sort_order,
    metadata = coalesce(public.reading_articles.metadata, '{}'::jsonb) || excluded.metadata,
    questions = excluded.questions,
    updated_at = now();
end
$mig$;

insert into public.learning_content_registry_items (
  product_id,
  language_id,
  service_key,
  content_type,
  source_table,
  source_record_id,
  source_ref,
  title,
  description,
  skill_key,
  subskill_keys,
  cefr_level,
  difficulty,
  estimated_minutes,
  learning_objective,
  tags,
  status,
  payload_json,
  metadata,
  created_by,
  updated_by
)
select
  ra.product_id,
  ra.language_id,
  'reading',
  'reading.article',
  'reading_articles',
  ra.id,
  ra.slug,
  ra.title,
  ra.summary,
  'reading',
  array['reading.gist', 'reading.detail', 'reading.inference', 'vocabulary.context']::text[],
  ra.level,
  0.20,
  greatest(1, least(240, ra.read_time_minutes + 3)),
  ra.summary,
  array_remove(array[ra.category, ra.theme], null)::text[],
  ra.status,
  jsonb_build_object(
    'reading_article_id', ra.id,
    'tone', ra.tone,
    'is_hot', ra.is_hot,
    'question_count', jsonb_array_length(ra.questions)
  ),
  jsonb_build_object('seeded_by', '20261022120100_reading_library_a1'),
  ra.created_by,
  ra.updated_by
from public.reading_articles ra
join public.products p on p.id = ra.product_id
join public.languages l on l.id = ra.language_id
where lower(coalesce(p.metadata->>'slug', '')) = 'english-reading'
  and l.code = 'en'
  and ra.slug in ('city-signs-quick-read', 'a1-message-about-english-class', 'a1-sunday-at-grandmas-house', 'a1-new-sports-centre', 'a1-welcome-to-the-guest-house', 'a1-a-day-at-the-cafe', 'a1-shopping-at-the-bazaar', 'a1-park-clean-up-day')
on conflict (language_id, service_key, content_type, source_ref) do update
set
  product_id = excluded.product_id,
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
  updated_by = excluded.updated_by,
  updated_at = now();
