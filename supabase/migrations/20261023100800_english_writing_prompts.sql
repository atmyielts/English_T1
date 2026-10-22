-- English writing: a full prompt library (23 tasks, A1–C2).
-- ============================================================================
-- Rewrites the three original prompts and adds twenty more:
--   A1 3 · A2 4 · B1 5 · B2 5 · C1 4 · C2 2
-- Each prompt has a real situation and task, a 3–4 point checklist
-- (guidance_text, one "- " bullet per line), useful words, a structure tip and
-- a CEFR-appropriate length range. metadata.audience says who the learner is
-- writing to; metadata.checklist_keywords holds one keyword list per checklist
-- point for the rule-based fallback check (an empty list = not checked
-- automatically). Every prompt is registered in learning_content_registry_items
-- (content_type 'writing.prompt', source_ref = slug) so it appears in the
-- catalog and Today. Additive and idempotent.
-- ============================================================================

do $$
declare
  v_en_id uuid;
  v_writing_product_id uuid;
begin
  select id into v_en_id from public.languages where code = 'en' limit 1;

  select p.id into v_writing_product_id
  from public.products p
  where lower(coalesce(p.metadata->>'slug', '')) = 'english-writing'
  order by p.created_at asc
  limit 1;

  if v_en_id is null or v_writing_product_id is null then
    raise notice 'english-writing product or en language missing; skipping writing prompts seed';
    return;
  end if;

  insert into public.writing_prompts (
    product_id, language_id, slug, title, prompt_text, guidance_text, level, genre,
    target_grammar, target_vocabulary, target_structure, expected_length_min, expected_length_max,
    status, sort_order, metadata
  )
  values
    -- ---------------------------------------------------------------- A1
    (
      v_writing_product_id, v_en_id, 'a1-hello-to-your-new-class',
      'Hello to Your New Class',
      'You have just joined a new English class. Your teacher asks everyone to write a short message to the class group chat. Introduce yourself to your new classmates.',
      E'- Say your name and where you live\n- Say what you do: study or work\n- Write one thing you like doing\n- Say why you are learning English',
      'A1', 'message', 'present simple: be, live, like',
      array['name', 'live', 'study', 'work', 'like', 'learn', 'because']::text[],
      'Hello + about me + what I like + why I learn English + see you',
      25, 50, 'published', 10,
      jsonb_build_object(
        'audience', 'Your new classmates in the class group chat',
        'checklist_keywords', jsonb_build_array(
          jsonb_build_array('name', 'i am', 'i''m', 'live', 'from'),
          jsonb_build_array('study', 'student', 'work', 'job', 'school', 'university', 'college'),
          jsonb_build_array('like', 'love', 'enjoy', 'hobby', 'free time'),
          jsonb_build_array('because', 'want', 'need', 'learn', 'english')
        )
      )
    ),
    (
      v_writing_product_id, v_en_id, 'a1-note-for-your-flatmate',
      'A Note for Your Flatmate',
      'You are going out and your flatmate is still asleep. Write a short note and leave it on the kitchen table.',
      E'- Say where you are going\n- Say when you will be back\n- Ask your flatmate to do one small thing\n- Sign the note with your name',
      'A1', 'note', 'going to; can you…? for requests',
      array['going', 'back', 'o''clock', 'please', 'buy', 'thanks']::text[],
      'where I am + when I am back + request + thanks + name',
      25, 50, 'published', 20,
      jsonb_build_object(
        'audience', 'Your flatmate',
        'checklist_keywords', jsonb_build_array(
          jsonb_build_array('going', 'go to', 'at the', 'market', 'shop', 'bazaar', 'gym', 'university', 'work', 'class', 'doctor'),
          jsonb_build_array('back', 'home at', 'o''clock', 'return', '#number'),
          jsonb_build_array('can you', 'could you', 'please'),
          jsonb_build_array()
        )
      )
    ),
    (
      v_writing_product_id, v_en_id, 'a1-my-usual-day',
      'My Usual Day',
      'Your new pen friend in another country wants to know about your life. Write an email and tell them about a usual day for you.',
      E'- Say what time you get up\n- Say what you do during the day\n- Say what you do in the evening\n- Ask your friend one question about their day',
      'A1', 'email', 'present simple with times (at 7 o''clock)',
      array['get up', 'breakfast', 'usually', 'then', 'after', 'evening', 'o''clock']::text[],
      'Hi + morning + day + evening + question + Bye',
      25, 50, 'published', 30,
      jsonb_build_object(
        'audience', 'Your pen friend',
        'checklist_keywords', jsonb_build_array(
          jsonb_build_array('get up', 'wake', 'o''clock', 'morning', '#number'),
          jsonb_build_array('study', 'work', 'school', 'university', 'lesson', 'class', 'office', 'afternoon', 'day'),
          jsonb_build_array('evening', 'night', 'dinner', 'after work', 'after class'),
          jsonb_build_array('?')
        )
      )
    ),

    -- ---------------------------------------------------------------- A2
    (
      v_writing_product_id, v_en_id, 'reschedule-study-meeting',
      'Change the Study Group Time',
      'Your study group meets on Thursday at 6 pm in the library to prepare for a test. You cannot come at that time this week. Write a message to the group chat.',
      E'- Say sorry and explain why you cannot come\n- Suggest a new day and time\n- Ask if the new time is OK for everyone\n- Say what you will bring or prepare',
      'A2', 'message', 'can / can''t, will, polite questions (Could we…?)',
      array['sorry', 'instead', 'suggest', 'free', 'prepare', 'notes', 'could']::text[],
      'sorry + reason + new time + question + what I will bring',
      50, 80, 'published', 40,
      jsonb_build_object(
        'audience', 'Your study group',
        'checklist_keywords', jsonb_build_array(
          jsonb_build_array('sorry', 'can''t', 'cannot', 'because', 'busy'),
          jsonb_build_array('monday', 'tuesday', 'wednesday', 'friday', 'saturday', 'sunday', 'tomorrow', 'instead', 'pm', 'o''clock', '#number'),
          jsonb_build_array('ok', 'okay', 'fine for', 'everyone', 'is that', 'does that', 'can you all'),
          jsonb_build_array('bring', 'prepare', 'notes', 'print', 'share', 'make')
        )
      )
    ),
    (
      v_writing_product_id, v_en_id, 'a2-thank-you-after-a-visit',
      'Thank You After a Visit',
      'Last weekend you stayed with your friend''s family in Samarkand. They were very kind to you. Write an email to your friend''s parents to thank them.',
      E'- Thank them for having you\n- Say what you enjoyed most and why\n- Mention something you ate or saw\n- Invite them to visit you',
      'A2', 'email', 'past simple (regular and irregular verbs)',
      array['thank', 'enjoyed', 'delicious', 'kind', 'wonderful', 'visit', 'invite']::text[],
      'thanks + what I enjoyed + food or places + invitation + goodbye',
      50, 80, 'published', 50,
      jsonb_build_object(
        'audience', 'Your friend''s parents',
        'checklist_keywords', jsonb_build_array(
          jsonb_build_array('thank'),
          jsonb_build_array('enjoy', 'liked', 'loved', 'favourite', 'favorite', 'best'),
          jsonb_build_array('ate', 'food', 'plov', 'dinner', 'lunch', 'breakfast', 'saw', 'visited', 'delicious', 'registan', 'market', 'walk'),
          jsonb_build_array('visit', 'come to', 'invite', 'welcome')
        )
      )
    ),
    (
      v_writing_product_id, v_en_id, 'a2-ask-about-an-english-course',
      'Ask About an Evening Course',
      'You saw an advertisement for an evening English course at a language centre in your city. Write an email to the centre to ask for more information.',
      E'- Say where you saw the advertisement\n- Ask about the days and times of the lessons\n- Ask about the price\n- Ask one more question, for example about the level or the teacher',
      'A2', 'email', 'questions: Can I…? How much…? What time…?',
      array['advertisement', 'course', 'level', 'price', 'timetable', 'start', 'information']::text[],
      'Dear… + why I am writing + questions + thanks + name',
      50, 80, 'published', 60,
      jsonb_build_object(
        'audience', 'The language centre',
        'checklist_keywords', jsonb_build_array(
          jsonb_build_array('saw', 'advert', 'website', 'instagram', 'telegram', 'poster', 'read', 'found'),
          jsonb_build_array('day', 'time', 'when', 'evening', 'week', 'timetable', 'schedule'),
          jsonb_build_array('price', 'cost', 'how much', 'pay', 'fee'),
          jsonb_build_array('level', 'teacher', 'book', 'online', 'certificate', 'test', 'group', 'how many', 'start')
        )
      )
    ),
    (
      v_writing_product_id, v_en_id, 'a2-my-neighbourhood',
      'Life in My Neighbourhood',
      'A friend from another city is moving to your city soon and wants to live near you. Write an email to tell them about your neighbourhood.',
      E'- Say where your neighbourhood is in the city\n- Describe two places near your home\n- Say one good thing about living there\n- Say one thing that is not so good',
      'A2', 'email', 'there is / there are; prepositions of place',
      array['neighbourhood', 'near', 'opposite', 'quiet', 'noisy', 'convenient', 'park']::text[],
      'Hi + where + places + good thing + not so good thing + Bye',
      50, 80, 'published', 70,
      jsonb_build_object(
        'audience', 'A friend who is moving to your city',
        'checklist_keywords', jsonb_build_array(
          jsonb_build_array('live', 'centre', 'center', 'city', 'district', 'area', 'neighbourhood', 'neighborhood', 'mahalla', 'near'),
          jsonb_build_array('there is', 'there are', 'shop', 'park', 'market', 'school', 'metro', 'bus', 'cafe', 'café', 'hospital', 'supermarket'),
          jsonb_build_array('good', 'like', 'great', 'nice', 'love', 'best', 'quiet', 'convenient', 'friendly'),
          jsonb_build_array('but', 'not so', 'problem', 'noisy', 'bad', 'don''t like', 'traffic', 'however', 'far')
        )
      )
    ),

    -- ---------------------------------------------------------------- B1
    (
      v_writing_product_id, v_en_id, 'study-alone-or-with-friends',
      'Study Alone or With Friends?',
      'Your English teacher asks the class to write for the class blog. The question is: "Is it better to study alone or with friends?" Write an opinion paragraph.',
      E'- Give your opinion in the first sentence\n- Give two reasons, with an example for at least one\n- Mention one advantage of the other way\n- Finish by repeating your opinion in different words',
      'B1', 'opinion paragraph', 'because, although; first / second; comparatives',
      array['concentrate', 'motivation', 'distract', 'explain', 'advantage', 'prefer', 'effective']::text[],
      'opinion + reason 1 + reason 2 + the other side + conclusion',
      100, 150, 'published', 80,
      jsonb_build_object(
        'audience', 'Your classmates (class blog)',
        'checklist_keywords', jsonb_build_array(
          jsonb_build_array('think', 'opinion', 'believe', 'prefer', 'better', 'in my view'),
          jsonb_build_array('because', 'first', 'second', 'reason', 'for example', 'for instance'),
          jsonb_build_array('although', 'however', 'on the other hand', 'advantage', 'but'),
          jsonb_build_array('conclusion', 'to sum up', 'overall', 'that is why', 'that''s why', 'in the end', 'all in all')
        )
      )
    ),
    (
      v_writing_product_id, v_en_id, 'b1-the-day-everything-went-wrong',
      'The Day Everything Went Wrong',
      'A student magazine is collecting short stories. Your story must begin with this sentence: "When I woke up, I knew something was wrong." Write your story.',
      E'- Begin with the sentence from the task\n- Describe what happened, in order\n- Say how you felt\n- Give the story a clear ending',
      'B1', 'story', 'past simple and past continuous',
      array['suddenly', 'realised', 'while', 'immediately', 'luckily', 'eventually', 'nervous', 'relieved']::text[],
      'opening sentence + problem + what happened next + feelings + ending',
      100, 150, 'published', 90,
      jsonb_build_object(
        'audience', 'Readers of a student magazine',
        'checklist_keywords', jsonb_build_array(
          jsonb_build_array('when i woke up', 'something was wrong'),
          jsonb_build_array('then', 'after', 'suddenly', 'while', 'later', 'next', 'first'),
          jsonb_build_array('felt', 'feel', 'nervous', 'worried', 'scared', 'relieved', 'angry', 'surprised', 'embarrassed', 'happy', 'upset'),
          jsonb_build_array('finally', 'in the end', 'eventually', 'luckily', 'at last', 'since then', 'that day')
        )
      )
    ),
    (
      v_writing_product_id, v_en_id, 'b1-review-a-place-to-eat',
      'Review a Place to Eat',
      'A website for students in your city is asking for reviews of cafés and restaurants. Write a review of a place you know well.',
      E'- Say where it is and what kind of place it is\n- Describe the food or drinks and the prices\n- Describe the service and the atmosphere\n- Say who you would recommend it to',
      'B1', 'review', 'adjectives and adverbs; recommend + -ing, should',
      array['atmosphere', 'menu', 'reasonable', 'service', 'portion', 'friendly', 'cosy', 'recommend']::text[],
      'name and place + food and prices + service and atmosphere + recommendation',
      100, 150, 'published', 100,
      jsonb_build_object(
        'audience', 'Students who read a city guide website',
        'checklist_keywords', jsonb_build_array(
          jsonb_build_array('located', 'near', 'centre', 'center', 'street', 'district', 'cafe', 'café', 'restaurant', 'teahouse', 'choyxona'),
          jsonb_build_array('food', 'dish', 'menu', 'plov', 'drink', 'tea', 'coffee', 'price', 'cheap', 'expensive', 'reasonable', 'sum', 'soum'),
          jsonb_build_array('service', 'staff', 'waiter', 'waitress', 'atmosphere', 'music', 'cosy', 'cozy', 'quiet', 'busy'),
          jsonb_build_array('recommend', 'should', 'perfect for', 'great for', 'ideal', 'good for')
        )
      )
    ),
    (
      v_writing_product_id, v_en_id, 'b1-invite-a-friend-on-a-trip',
      'Invite a Friend on a Day Trip',
      'You are planning a day trip to the mountains outside your city next Saturday. Write an email to a friend from your course and invite them to come with you.',
      E'- Invite your friend and say when the trip is\n- Explain the plan for the day\n- Tell them what to bring or wear\n- Ask them to reply by a certain day',
      'B1', 'email', 'future forms: going to, will, present continuous for plans',
      array['trip', 'plan', 'leave', 'bring', 'comfortable', 'weather', 'forecast', 'let me know']::text[],
      'invitation + plan + what to bring + ask for a reply',
      100, 150, 'published', 110,
      jsonb_build_object(
        'audience', 'A friend from your course',
        'checklist_keywords', jsonb_build_array(
          jsonb_build_array('invite', 'would you like', 'do you want', 'join', 'come with', 'saturday'),
          jsonb_build_array('plan', 'leave', 'bus', 'taxi', 'train', 'walk', 'lunch', 'morning', 'arrive', 'then'),
          jsonb_build_array('bring', 'take', 'wear', 'jacket', 'water', 'shoes', 'food', 'snack', 'hat'),
          jsonb_build_array('let me know', 'reply', 'tell me', 'answer', 'by thursday', 'by friday', 'by wednesday', 'by tomorrow', 'as soon as')
        )
      )
    ),
    (
      v_writing_product_id, v_en_id, 'b1-a-problem-with-an-online-order',
      'A Problem With an Online Order',
      'You ordered a pair of headphones from an online shop. They arrived a week late, and the left side does not work. Write an email to the shop''s customer service.',
      E'- Say what you ordered and when\n- Explain the two problems\n- Say what you want the shop to do\n- Give your order number and ask for a quick reply',
      'B1', 'email', 'past simple and present perfect (they have not…, I have tried…)',
      array['order', 'delivery', 'faulty', 'refund', 'replacement', 'unfortunately', 'disappointed']::text[],
      'Dear… + what I ordered + problems + what I want + order number + closing',
      100, 150, 'published', 120,
      jsonb_build_object(
        'audience', 'Customer service at an online shop',
        'checklist_keywords', jsonb_build_array(
          jsonb_build_array('ordered', 'bought', 'order', 'purchase'),
          jsonb_build_array('late', 'work', 'broken', 'faulty', 'problem', 'doesn''t', 'does not', 'didn''t', 'only one', 'left side'),
          jsonb_build_array('refund', 'replace', 'exchange', 'money back', 'send', 'new pair', 'repair'),
          jsonb_build_array('order number', 'number', 'reply', 'hear from you', 'soon', 'as possible', '#number')
        )
      )
    ),

    -- ---------------------------------------------------------------- B2
    (
      v_writing_product_id, v_en_id, 'improve-team-update-clarity',
      'A Weekly Project Update',
      'You work in a small team that is building a new website for a local travel company. Your manager is away this week and has asked for a written update. Write an email to your manager.',
      E'- Say what has been finished this week\n- Explain what is delayed and why\n- Say what you need from your manager or the team\n- Give the next deadline and close politely',
      'B2', 'workplace email', 'present perfect vs past simple; passive (has been tested)',
      array['completed', 'delayed', 'on track', 'deadline', 'approval', 'issue', 'priority', 'update']::text[],
      'greeting + done + delayed and why + what I need + next deadline + closing',
      150, 220, 'published', 130,
      jsonb_build_object(
        'audience', 'Your manager',
        'checklist_keywords', jsonb_build_array(
          jsonb_build_array('finished', 'completed', 'done', 'has been', 'have been', 'ready'),
          jsonb_build_array('delay', 'behind', 'late', 'because', 'due to', 'issue', 'problem'),
          jsonb_build_array('need', 'could you', 'would you', 'approval', 'approve', 'help', 'support', 'please'),
          jsonb_build_array('deadline', 'by friday', 'by monday', 'next week', 'date', 'regards', 'thanks', 'thank you')
        )
      )
    ),
    (
      v_writing_product_id, v_en_id, 'b2-online-or-classroom-learning',
      'Online or Classroom Learning?',
      'An education website is asking readers to respond to this statement: "Online courses are better than classroom courses." Write an opinion piece of two or three paragraphs.',
      E'- State your view clearly at the start\n- Support it with two developed arguments and examples\n- Respond to one argument from the other side\n- End with a clear conclusion',
      'B2', 'opinion article', 'concession: although, while, despite; modals of possibility',
      array['flexible', 'interaction', 'self-discipline', 'distraction', 'access', 'whereas', 'outweigh']::text[],
      'introduction with your view + argument 1 + argument 2 + other side + conclusion',
      150, 220, 'published', 140,
      jsonb_build_object(
        'audience', 'Readers of an education website',
        'checklist_keywords', jsonb_build_array(
          jsonb_build_array('i believe', 'in my view', 'in my opinion', 'i think', 'i would argue', 'i agree', 'i disagree', 'i strongly'),
          jsonb_build_array('firstly', 'first', 'secondly', 'for example', 'for instance', 'another'),
          jsonb_build_array('some people', 'others', 'critics', 'although', 'while', 'however', 'on the other hand', 'admittedly', 'it is true'),
          jsonb_build_array('in conclusion', 'to sum up', 'overall', 'to conclude', 'all in all', 'on balance')
        )
      )
    ),
    (
      v_writing_product_id, v_en_id, 'b2-review-a-film-or-book',
      'Review a Film or Book',
      'Your university English club publishes a monthly newsletter. Write a review of a film or book that you think other students should know about.',
      E'- Introduce the film or book and its genre without giving away the ending\n- Describe the main characters or main ideas\n- Explain what works well and what does not\n- Say who would enjoy it and give a clear recommendation',
      'B2', 'review', 'present tenses for describing the plot; relative clauses',
      array['plot', 'character', 'gripping', 'predictable', 'setting', 'pace', 'performance', 'recommend']::text[],
      'title and genre + characters or ideas + strengths and weaknesses + recommendation',
      150, 220, 'published', 150,
      jsonb_build_object(
        'audience', 'Students who read the English club newsletter',
        'checklist_keywords', jsonb_build_array(
          jsonb_build_array('film', 'book', 'novel', 'movie', 'genre', 'directed', 'written by', 'series'),
          jsonb_build_array('character', 'main', 'hero', 'plays', 'is about', 'follows', 'idea'),
          jsonb_build_array('however', 'although', 'weak', 'strong', 'boring', 'gripping', 'slow', 'predictable', 'works well'),
          jsonb_build_array('recommend', 'should', 'would enjoy', 'worth', 'fans of', 'must-see')
        )
      )
    ),
    (
      v_writing_product_id, v_en_id, 'b2-help-from-a-stranger',
      'Help From a Stranger',
      'A short story competition is open to all students. Your story must end with these words: "…and I never found out their name." Write your story.',
      E'- Set the scene: where you were and what the problem was\n- Describe how the stranger helped\n- Show your feelings with descriptive language\n- End with the words from the task',
      'B2', 'story', 'narrative tenses: past simple, past continuous, past perfect',
      array['stranded', 'approached', 'desperate', 'grateful', 'generous', 'hesitated', 'glanced', 'vanished']::text[],
      'setting and problem + the stranger arrives + what they did + feelings + final words',
      150, 220, 'published', 160,
      jsonb_build_object(
        'audience', 'Judges and readers of a student story competition',
        'checklist_keywords', jsonb_build_array(
          jsonb_build_array('station', 'airport', 'street', 'bus', 'road', 'rain', 'lost', 'phone', 'night', 'was waiting', 'had missed'),
          jsonb_build_array('helped', 'offered', 'gave', 'showed', 'lent', 'drove', 'took', 'paid'),
          jsonb_build_array('felt', 'grateful', 'relieved', 'nervous', 'embarrassed', 'desperate', 'heart', 'panic'),
          jsonb_build_array('never found out their name')
        )
      )
    ),
    (
      v_writing_product_id, v_en_id, 'b2-ask-about-an-internship',
      'Ask About an Internship',
      'You are a university student and you would like a summer internship at a company that works in your field. Write a formal email to the company''s HR manager.',
      E'- Say who you are and why you are writing\n- Describe your studies and relevant skills\n- Explain what you hope to learn\n- Ask about the next steps and mention your CV',
      'B2', 'formal email', 'formal requests (I would be grateful if…); present perfect for experience',
      array['internship', 'relevant', 'experience', 'opportunity', 'grateful', 'attached', 'available', 'further']::text[],
      'Dear… + purpose + studies and skills + what I hope to learn + next steps + Yours sincerely',
      150, 220, 'published', 170,
      jsonb_build_object(
        'audience', 'The HR manager of a company',
        'checklist_keywords', jsonb_build_array(
          jsonb_build_array('i am writing', 'my name is', 'i am a', 'student', 'to ask', 'to enquire', 'to inquire'),
          jsonb_build_array('study', 'studying', 'course', 'degree', 'skill', 'experience', 'project', 'faculty'),
          jsonb_build_array('learn', 'develop', 'gain', 'improve', 'hope'),
          jsonb_build_array('cv', 'résumé', 'resume', 'attached', 'next step', 'interview', 'hear from you', 'contact')
        )
      )
    ),

    -- ---------------------------------------------------------------- C1
    (
      v_writing_product_id, v_en_id, 'c1-essay-who-should-pay-for-university',
      'Essay: Who Should Pay for University?',
      'Your class is discussing the statement: "University education should be free for all students." Write an essay that discusses both sides of the issue and gives your own opinion.',
      E'- Introduce the issue and state your position\n- Discuss arguments for free university education\n- Discuss arguments against it\n- Reach a balanced, well-supported conclusion',
      'C1', 'essay', 'complex sentences; hedging (it could be argued that…); nominalisation',
      array['tuition', 'burden', 'access', 'funding', 'taxpayer', 'merit', 'inequality', 'sustainable']::text[],
      'introduction + arguments for + arguments against + conclusion (four paragraphs)',
      220, 300, 'published', 180,
      jsonb_build_object(
        'audience', 'Your teacher and classmates',
        'checklist_keywords', jsonb_build_array(
          jsonb_build_array('this essay', 'in my view', 'i would argue', 'i believe', 'it is often', 'debate', 'issue'),
          jsonb_build_array('access', 'equal', 'opportunit', 'talent', 'fair', 'afford', 'poor'),
          jsonb_build_array('cost', 'tax', 'budget', 'funding', 'quality', 'expensive', 'on the other hand', 'however'),
          jsonb_build_array('in conclusion', 'to conclude', 'overall', 'on balance', 'to sum up')
        )
      )
    ),
    (
      v_writing_product_id, v_en_id, 'c1-report-making-the-library-better',
      'Report: Making the Library Better',
      'The head of your university has asked students to write reports on how the library is used and how it could be improved. Write a report based on your own experience and what other students tell you.',
      E'- State the aim of the report\n- Describe how students use the library now\n- Identify the two main problems\n- Make clear recommendations',
      'C1', 'report', 'passive voice; reporting language (most students said…, it was found that…)',
      array['facilities', 'aim', 'findings', 'opening hours', 'overcrowded', 'resources', 'recommend', 'implement']::text[],
      'headings: Introduction / Current use / Main problems / Recommendations',
      220, 300, 'published', 190,
      jsonb_build_object(
        'audience', 'The head of your university',
        'checklist_keywords', jsonb_build_array(
          jsonb_build_array('aim', 'purpose', 'this report', 'introduction'),
          jsonb_build_array('use', 'borrow', 'computer', 'study', 'quiet', 'group work'),
          jsonb_build_array('problem', 'issue', 'lack', 'overcrowded', 'noisy', 'not enough', 'limited', 'outdated'),
          jsonb_build_array('recommend', 'suggest', 'should', 'it would be', 'proposal')
        )
      )
    ),
    (
      v_writing_product_id, v_en_id, 'c1-proposal-a-neighbourhood-project',
      'Proposal: A Project for Your Neighbourhood',
      'Your city council is offering small grants for community projects run by young people. Write a proposal for a project that would improve life in your neighbourhood.',
      E'- Describe the project and the need it meets\n- Explain how it would work and who would take part\n- Say what the money would be spent on\n- Explain the benefits and how success would be measured',
      'C1', 'proposal', 'conditionals with would; purpose clauses (so that, in order to)',
      array['initiative', 'residents', 'volunteers', 'budget', 'benefit', 'sustainable', 'outcome', 'maintain']::text[],
      'headings: Introduction / The project / Budget / Benefits and measuring success',
      220, 300, 'published', 200,
      jsonb_build_object(
        'audience', 'The city council''s youth committee',
        'checklist_keywords', jsonb_build_array(
          jsonb_build_array('project', 'propose', 'proposal', 'idea', 'need', 'lack of'),
          jsonb_build_array('volunteer', 'resident', 'young people', 'take part', 'participat', 'organise', 'organize', 'weekly'),
          jsonb_build_array('budget', 'money', 'spent', 'cost', 'buy', 'equipment', 'grant'),
          jsonb_build_array('benefit', 'success', 'measure', 'result', 'outcome', 'improve')
        )
      )
    ),
    (
      v_writing_product_id, v_en_id, 'c1-letter-improving-bus-services',
      'Letter: Improving Bus Services',
      'The buses on the route you take every day are often late and overcrowded. Write a formal letter to the city transport department about the problem and suggest how it could be solved.',
      E'- Explain who you are and why you are writing\n- Describe the problem with clear examples\n- Explain how it affects people\n- Suggest realistic solutions and ask for a response',
      'C1', 'formal letter', 'formal register; modal verbs for suggestions; cleft sentences (What concerns me most is…)',
      array['commuters', 'frequency', 'reliable', 'overcrowded', 'timetable', 'inconvenience', 'address', 'prompt']::text[],
      'Dear Sir or Madam + reason for writing + problem + effects + solutions + Yours faithfully',
      220, 300, 'published', 210,
      jsonb_build_object(
        'audience', 'The city transport department',
        'checklist_keywords', jsonb_build_array(
          jsonb_build_array('i am writing', 'i am a', 'resident', 'to draw', 'to express', 'as a', 'passenger'),
          jsonb_build_array('route', 'late', 'wait', 'crowded', 'delay', 'timetable', 'for example', 'for instance'),
          jsonb_build_array('affect', 'students', 'workers', 'elderly', 'commuters', 'late for', 'impact'),
          jsonb_build_array('suggest', 'recommend', 'could', 'should', 'response', 'reply', 'hear from you')
        )
      )
    ),

    -- ---------------------------------------------------------------- C2
    (
      v_writing_product_id, v_en_id, 'c2-essay-technology-and-attention',
      'Essay: Technology and Our Attention',
      'Write an essay for a university writing course on this statement: "Digital technology has made us more knowledgeable but less able to concentrate." To what extent do you agree?',
      E'- Interpret the statement and set out your position\n- Analyse both parts of the claim with precise examples\n- Consider a counter-argument and evaluate it\n- Conclude with a judgement that follows from your argument',
      'C2', 'discursive essay', 'inversion (Not only… but also…); concessive clauses; stance and hedging',
      array['attention span', 'superficial', 'unprecedented', 'cognitive', 'paradox', 'nuance', 'mitigate', 'contend']::text[],
      'introduction with position + knowledge + concentration + counter-argument + conclusion',
      280, 350, 'published', 220,
      jsonb_build_object(
        'audience', 'Your university writing tutor',
        'checklist_keywords', jsonb_build_array(
          jsonb_build_array('to what extent', 'i would contend', 'i would argue', 'this essay', 'the claim', 'the statement', 'i agree', 'i disagree', 'partly'),
          jsonb_build_array('knowledge', 'information', 'concentrat', 'attention', 'focus', 'distract'),
          jsonb_build_array('however', 'nevertheless', 'admittedly', 'critics', 'it could be argued', 'on the other hand', 'yet'),
          jsonb_build_array('in conclusion', 'ultimately', 'on balance', 'to conclude', 'overall')
        )
      )
    ),
    (
      v_writing_product_id, v_en_id, 'c2-report-working-from-home',
      'Report: Should Staff Work From Home?',
      'You work for a medium-sized company in Tashkent. Management is considering letting staff work from home two days a week and has asked you for a report. Assess the likely advantages and risks and make a recommendation.',
      E'- Set out the purpose and scope of the report\n- Assess the likely advantages for staff and for the company\n- Assess the risks and how they could be managed\n- Make a justified recommendation',
      'C2', 'report', 'complex passives; nominalisation; conditionals',
      array['productivity', 'oversight', 'scope', 'mitigate', 'implement', 'trial period', 'collaboration', 'justified']::text[],
      'headings: Purpose and scope / Advantages / Risks / Recommendation',
      280, 350, 'published', 230,
      jsonb_build_object(
        'audience', 'Company management',
        'checklist_keywords', jsonb_build_array(
          jsonb_build_array('purpose', 'scope', 'this report', 'aim'),
          jsonb_build_array('advantage', 'benefit', 'productiv', 'commut', 'flexib', 'save'),
          jsonb_build_array('risk', 'challenge', 'communication', 'oversight', 'security', 'isolation', 'mitigat', 'however'),
          jsonb_build_array('recommend', 'trial', 'propose', 'therefore', 'conclude')
        )
      )
    )
  on conflict (product_id, language_id, slug) do update
  set
    title = excluded.title,
    prompt_text = excluded.prompt_text,
    guidance_text = excluded.guidance_text,
    level = excluded.level,
    genre = excluded.genre,
    target_grammar = excluded.target_grammar,
    target_vocabulary = excluded.target_vocabulary,
    target_structure = excluded.target_structure,
    expected_length_min = excluded.expected_length_min,
    expected_length_max = excluded.expected_length_max,
    status = excluded.status,
    sort_order = excluded.sort_order,
    metadata = coalesce(public.writing_prompts.metadata, '{}'::jsonb) || excluded.metadata,
    updated_at = now();
end
$$;

-- Register every English writing prompt so it appears in the catalog and Today.
insert into public.learning_content_registry_items (
  product_id, language_id, service_key, content_type, source_table, source_record_id, source_ref,
  title, description, skill_key, subskill_keys, cefr_level, difficulty, estimated_minutes,
  learning_objective, tags, status, payload_json, metadata, created_by, updated_by
)
select
  wp.product_id,
  wp.language_id,
  'writing',
  'writing.prompt',
  'writing_prompts',
  wp.id,
  wp.slug,
  wp.title,
  left(wp.prompt_text, 900),
  'writing',
  array['writing.task_completion', 'writing.organisation', 'writing.vocabulary', 'writing.grammar']::text[],
  wp.level,
  case wp.level
    when 'A1' then 0.20
    when 'A2' then 0.30
    when 'B1' then 0.45
    when 'B2' then 0.60
    when 'C1' then 0.75
    when 'C2' then 0.90
    else 0.50
  end,
  case left(wp.level, 1) when 'A' then 8 when 'B' then 15 else 25 end,
  coalesce(wp.guidance_text, wp.prompt_text),
  array_remove(array[wp.genre, wp.target_grammar], null),
  wp.status,
  jsonb_build_object(
    'genre', wp.genre,
    'target_grammar', wp.target_grammar,
    'target_structure', wp.target_structure,
    'expected_length_min', wp.expected_length_min,
    'expected_length_max', wp.expected_length_max,
    'target_vocabulary', wp.target_vocabulary
  ),
  jsonb_build_object('seeded_by', '20261022141000_english_writing_prompts'),
  wp.created_by,
  wp.updated_by
from public.writing_prompts wp
join public.languages l on l.id = wp.language_id and l.code = 'en'
join public.products p on p.id = wp.product_id and lower(coalesce(p.metadata->>'slug', '')) = 'english-writing'
on conflict (language_id, service_key, content_type, source_ref) do update
set
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
