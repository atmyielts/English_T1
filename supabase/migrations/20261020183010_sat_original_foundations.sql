begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

-- Original foundation exercises; editorial tiers, no official/calibrated mock claim.

-- Insert fresh identities, never overwrite content already used by a learner.

do $$ begin if not exists(select 1 from public.products where id='2cf7b1a7-4df9-4de8-99e8-5b9d5bb85010') then raise exception 'SAT Practice product missing'; end if; end $$;

insert into public.experiences(id,product_id,name,display_order,metadata) values('d2f60197-eaa3-5772-88ac-b05d60f11bb5','2cf7b1a7-4df9-4de8-99e8-5b9d5bb85010','Original SAT practice foundations',0,'{"format":"sat_practice_bank","bank_priority":"curated","content_revision":"original-2026-10-v1","difficulty_basis":"editorial","coverage":"Foundation practice across nine internal domains; not a calibrated full mock","source_sha256":"dbc08f9d32b8d7d30756498f9b2cae2a98cab6190c1d5b31b3c803b1b53bc7cc"}'::jsonb);

insert into public.sections(id,experience_id,name,display_order,metadata) values('2dd5a6ad-d4e5-5141-982e-22469816765f','d2f60197-eaa3-5772-88ac-b05d60f11bb5','Reading and Writing',1,'{"section_type":"reading_writing"}'::jsonb);

insert into public.parts(id,section_id,name,display_order) values('29e893d7-160e-582d-9ba6-9339ab9adea5','2dd5a6ad-d4e5-5141-982e-22469816765f','Original foundation questions',1);

insert into public.content_units(id,part_id,type,data,display_order,metadata) values('d98f7548-f5b9-5f49-bf28-36c33198c2b0','29e893d7-160e-582d-9ba6-9339ab9adea5','question_single_choice','{"prompt":"Which choice completes the sentence according to Standard English conventions? The boxes of donated books ____ beside the library entrance.","options":[{"id":"A","label":"is stacked"},{"id":"B","label":"are stacked"},{"id":"C","label":"has stacked"},{"id":"D","label":"was stacked"}]}'::jsonb,1,'{"section_type":"reading_writing","sat_domain":"grammar","difficulty":"easy","difficulty_basis":"editorial","content_status":"published","content_revision":"original-2026-10-v1","original_slug":"grammar-easy-subject-agreement"}'::jsonb);

insert into public.answer_keys(content_unit_id,correct,metadata) values('d98f7548-f5b9-5f49-bf28-36c33198c2b0','{"option_id":"B"}'::jsonb,'{"feedback":{"explanation":"The subject is the plural noun boxes, so the plural verb are agrees with it. The phrase of donated books does not change the subject."},"source":"original-schood-practice-v1"}'::jsonb);

insert into public.content_units(id,part_id,type,data,display_order,metadata) values('e95508ea-db94-5ec4-ae25-cd837696e7a5','29e893d7-160e-582d-9ba6-9339ab9adea5','question_single_choice','{"prompt":"Which choice completes the text according to Standard English conventions? The first rehearsal ran late____ the director shortened the next one.","options":[{"id":"A","label":","},{"id":"B","label":";"},{"id":"C","label":" and; "},{"id":"D","label":" and, "}]}'::jsonb,2,'{"section_type":"reading_writing","sat_domain":"grammar","difficulty":"medium","difficulty_basis":"editorial","content_status":"published","content_revision":"original-2026-10-v1","original_slug":"grammar-medium-independent-clauses"}'::jsonb);

insert into public.answer_keys(content_unit_id,correct,metadata) values('e95508ea-db94-5ec4-ae25-cd837696e7a5','{"option_id":"B"}'::jsonb,'{"feedback":{"explanation":"Both The first rehearsal ran late and the director shortened the next one are independent clauses. A semicolon joins them correctly. A comma alone creates a comma splice; the other choices introduce faulty punctuation or syntax."},"source":"original-schood-practice-v1"}'::jsonb);

insert into public.content_units(id,part_id,type,data,display_order,metadata) values('caffcdb3-6671-595f-969e-5c2f6a181f14','29e893d7-160e-582d-9ba6-9339ab9adea5','question_single_choice','{"prompt":"Which choice completes the sentence according to Standard English conventions? After carefully comparing the two maps, ____","options":[{"id":"A","label":"the shorter route became obvious."},{"id":"B","label":"the distance between the towns was calculated."},{"id":"C","label":"a decision about the route was made."},{"id":"D","label":"the hikers chose the eastern trail."}]}'::jsonb,3,'{"section_type":"reading_writing","sat_domain":"grammar","difficulty":"hard","difficulty_basis":"editorial","content_status":"published","content_revision":"original-2026-10-v1","original_slug":"grammar-hard-modifier"}'::jsonb);

insert into public.answer_keys(content_unit_id,correct,metadata) values('caffcdb3-6671-595f-969e-5c2f6a181f14','{"option_id":"D"}'::jsonb,'{"feedback":{"explanation":"The introductory modifier describes people who compared maps. The hikers is the only subject that can perform that action. The other subjects leave the modifier dangling."},"source":"original-schood-practice-v1"}'::jsonb);

insert into public.content_units(id,part_id,type,data,display_order,metadata) values('7ebdb93f-c3a5-5107-9fa5-ff73abf41e43','29e893d7-160e-582d-9ba6-9339ab9adea5','question_single_choice','{"prompt":"Which transition most logically completes the text? The morning train was nearly empty. ____, the evening train had standing passengers in every carriage.","options":[{"id":"A","label":"Similarly"},{"id":"B","label":"For example"},{"id":"C","label":"By contrast"},{"id":"D","label":"Therefore"}]}'::jsonb,4,'{"section_type":"reading_writing","sat_domain":"transitions","difficulty":"easy","difficulty_basis":"editorial","content_status":"published","content_revision":"original-2026-10-v1","original_slug":"transitions-easy-contrast"}'::jsonb);

insert into public.answer_keys(content_unit_id,correct,metadata) values('7ebdb93f-c3a5-5107-9fa5-ff73abf41e43','{"option_id":"C"}'::jsonb,'{"feedback":{"explanation":"The second sentence contrasts a crowded train with an almost empty one. By contrast expresses that difference. It is neither a similar example nor a consequence of the morning train''s occupancy."},"source":"original-schood-practice-v1"}'::jsonb);

insert into public.content_units(id,part_id,type,data,display_order,metadata) values('90b06a2d-6ca5-58c3-9009-075942ba947a','29e893d7-160e-582d-9ba6-9339ab9adea5','question_single_choice','{"prompt":"Which transition most logically completes the text? The archive received twice as many donated photographs as its shelves could hold. ____, its staff rented an additional storage room.","options":[{"id":"A","label":"Consequently"},{"id":"B","label":"Nevertheless"},{"id":"C","label":"Likewise"},{"id":"D","label":"In other words"}]}'::jsonb,5,'{"section_type":"reading_writing","sat_domain":"transitions","difficulty":"medium","difficulty_basis":"editorial","content_status":"published","content_revision":"original-2026-10-v1","original_slug":"transitions-medium-consequence"}'::jsonb);

insert into public.answer_keys(content_unit_id,correct,metadata) values('90b06a2d-6ca5-58c3-9009-075942ba947a','{"option_id":"A"}'::jsonb,'{"feedback":{"explanation":"Renting storage is a response to insufficient shelf space. Consequently signals this result. The second sentence does not oppose, parallel, or simply restate the first."},"source":"original-schood-practice-v1"}'::jsonb);

insert into public.content_units(id,part_id,type,data,display_order,metadata) values('e2ae4385-94c3-5d0a-8fd4-ec3d5f2e0f72','29e893d7-160e-582d-9ba6-9339ab9adea5','question_single_choice','{"prompt":"Which transition most logically completes the text? A new catalog let visitors locate most of the museum''s objects within seconds. ____, the catalog omitted several recent acquisitions, so it could not yet replace the complete paper register.","options":[{"id":"A","label":"Accordingly"},{"id":"B","label":"For instance"},{"id":"C","label":"Indeed"},{"id":"D","label":"Even so"}]}'::jsonb,6,'{"section_type":"reading_writing","sat_domain":"transitions","difficulty":"hard","difficulty_basis":"editorial","content_status":"published","content_revision":"original-2026-10-v1","original_slug":"transitions-hard-concession"}'::jsonb);

insert into public.answer_keys(content_unit_id,correct,metadata) values('e2ae4385-94c3-5d0a-8fd4-ec3d5f2e0f72','{"option_id":"D"}'::jsonb,'{"feedback":{"explanation":"Even so introduces a limitation despite the catalog''s benefit. The omission qualifies the positive first statement; it is not a result of fast searching or an example of that advantage."},"source":"original-schood-practice-v1"}'::jsonb);

insert into public.content_units(id,part_id,type,data,display_order,metadata) values('2d196a0a-4aa1-53a8-b0c6-2ab81479af93','29e893d7-160e-582d-9ba6-9339ab9adea5','question_single_choice','{"prompt":"A student has these notes about a fictional community garden: It opened in 2022. Volunteers grow vegetables there. Its produce is donated to a neighborhood food pantry. The student wants to explain whom the garden serves. Which choice best uses the notes to meet that goal?","options":[{"id":"A","label":"The garden opened in 2022 and grows vegetables."},{"id":"B","label":"By donating vegetables to the neighborhood food pantry, the garden helps people who use the pantry."},{"id":"C","label":"Volunteers have grown vegetables since the garden opened."},{"id":"D","label":"The garden is one community project that began in 2022."}]}'::jsonb,7,'{"section_type":"reading_writing","sat_domain":"rhetoric","difficulty":"easy","difficulty_basis":"editorial","content_status":"published","content_revision":"original-2026-10-v1","original_slug":"rhetoric-easy-explicit-goal"}'::jsonb);

insert into public.answer_keys(content_unit_id,correct,metadata) values('2d196a0a-4aa1-53a8-b0c6-2ab81479af93','{"option_id":"B"}'::jsonb,'{"feedback":{"explanation":"Only B identifies the people served and connects them to the donated produce. The other choices describe the opening or volunteer activity without explaining the beneficiaries."},"source":"original-schood-practice-v1"}'::jsonb);

insert into public.content_units(id,part_id,type,data,display_order,metadata) values('5cd57976-cf4e-50dd-bcf3-cc06918d6545','29e893d7-160e-582d-9ba6-9339ab9adea5','question_single_choice','{"prompt":"A student has these notes about two fictional bridge designs: Design P uses 18 support columns and costs 2.4 million dollars. Design Q uses 12 support columns and costs 2.4 million dollars. Both span the same river. The student wants to emphasize a difference while acknowledging the equal cost. Which choice best meets the goal?","options":[{"id":"A","label":"The two designs would span the same river."},{"id":"B","label":"Both designs cost 2.4 million dollars, and Design P uses support columns."},{"id":"C","label":"Although the designs have the same cost, Design Q uses six fewer support columns than Design P."},{"id":"D","label":"Design P costs more because it uses more support columns."}]}'::jsonb,8,'{"section_type":"reading_writing","sat_domain":"rhetoric","difficulty":"medium","difficulty_basis":"editorial","content_status":"published","content_revision":"original-2026-10-v1","original_slug":"rhetoric-medium-comparison"}'::jsonb);

insert into public.answer_keys(content_unit_id,correct,metadata) values('5cd57976-cf4e-50dd-bcf3-cc06918d6545','{"option_id":"C"}'::jsonb,'{"feedback":{"explanation":"C states the equal cost and quantifies the column difference: 18 minus 12 is six. A omits both relevant facts; B omits the difference; D contradicts the notes."},"source":"original-schood-practice-v1"}'::jsonb);

insert into public.content_units(id,part_id,type,data,display_order,metadata) values('1169256c-c472-523a-917a-bfb39befdc20','29e893d7-160e-582d-9ba6-9339ab9adea5','question_single_choice','{"prompt":"A student has these notes about a fictional library trial: For one month, 40 volunteers used the old search tool and 40 other volunteers used a new tool. Median search time was 90 seconds with the old tool and 60 seconds with the new tool. The volunteers were not randomly assigned. The student wants to summarize the observed benefit without claiming that the new tool caused it. Which choice best meets the goal?","options":[{"id":"A","label":"In this trial, volunteers using the new tool had a median search time 30 seconds shorter, although the nonrandom groups limit causal conclusions."},{"id":"B","label":"The new tool caused every volunteer to save exactly 30 seconds."},{"id":"C","label":"Random assignment proved that the old tool is slower for all readers."},{"id":"D","label":"The two tools produced identical median search times during the trial."}]}'::jsonb,9,'{"section_type":"reading_writing","sat_domain":"rhetoric","difficulty":"hard","difficulty_basis":"editorial","content_status":"published","content_revision":"original-2026-10-v1","original_slug":"rhetoric-hard-evidence-boundary"}'::jsonb);

insert into public.answer_keys(content_unit_id,correct,metadata) values('1169256c-c472-523a-917a-bfb39befdc20','{"option_id":"A"}'::jsonb,'{"feedback":{"explanation":"A reports the observed median difference and the study''s limitation. A median does not describe every person, and nonrandom assignment cannot establish the causal claims in B or C. D contradicts the data."},"source":"original-schood-practice-v1"}'::jsonb);

insert into public.content_units(id,part_id,type,data,display_order,metadata) values('88fe3ddb-fdc7-5b89-988e-3cc2b196d2d8','29e893d7-160e-582d-9ba6-9339ab9adea5','question_single_choice','{"prompt":"As used in the text, what does retained most nearly mean? During the move, the theater discarded broken scenery but retained the painted backdrop for future productions.","options":[{"id":"A","label":"repaired"},{"id":"B","label":"described"},{"id":"C","label":"borrowed"},{"id":"D","label":"kept"}]}'::jsonb,10,'{"section_type":"reading_writing","sat_domain":"vocabulary_in_context","difficulty":"easy","difficulty_basis":"editorial","content_status":"published","content_revision":"original-2026-10-v1","original_slug":"vocabulary-easy-retained"}'::jsonb);

insert into public.answer_keys(content_unit_id,correct,metadata) values('88fe3ddb-fdc7-5b89-988e-3cc2b196d2d8','{"option_id":"D"}'::jsonb,'{"feedback":{"explanation":"The theater kept the backdrop instead of discarding it. The context does not say that it repaired, described, or borrowed the backdrop."},"source":"original-schood-practice-v1"}'::jsonb);

insert into public.content_units(id,part_id,type,data,display_order,metadata) values('b10a0444-9050-5e21-a4ef-e8a4fb351942','29e893d7-160e-582d-9ba6-9339ab9adea5','question_single_choice','{"prompt":"As used in the text, what does qualified most nearly mean? The reviewer praised the novel''s vivid settings but qualified her enthusiasm by noting that its ending was difficult to follow.","options":[{"id":"A","label":"certified"},{"id":"B","label":"limited"},{"id":"C","label":"concealed"},{"id":"D","label":"repeated"}]}'::jsonb,11,'{"section_type":"reading_writing","sat_domain":"vocabulary_in_context","difficulty":"medium","difficulty_basis":"editorial","content_status":"published","content_revision":"original-2026-10-v1","original_slug":"vocabulary-medium-qualified"}'::jsonb);

insert into public.answer_keys(content_unit_id,correct,metadata) values('b10a0444-9050-5e21-a4ef-e8a4fb351942','{"option_id":"B"}'::jsonb,'{"feedback":{"explanation":"The criticism limits the reviewer''s otherwise positive reaction. Qualified here means made less absolute, rather than professionally certified, hidden, or repeated."},"source":"original-schood-practice-v1"}'::jsonb);

insert into public.content_units(id,part_id,type,data,display_order,metadata) values('476efb90-b0d1-54ee-a9a7-ebff03171dd6','29e893d7-160e-582d-9ba6-9339ab9adea5','question_single_choice','{"prompt":"As used in the text, what does provisional most nearly mean? With only half the letters cataloged, the historian called her account provisional and expected to revise it after examining the remaining documents.","options":[{"id":"A","label":"unrelated to evidence"},{"id":"B","label":"accepted without question"},{"id":"C","label":"subject to later revision"},{"id":"D","label":"written for a general audience"}]}'::jsonb,12,'{"section_type":"reading_writing","sat_domain":"vocabulary_in_context","difficulty":"hard","difficulty_basis":"editorial","content_status":"published","content_revision":"original-2026-10-v1","original_slug":"vocabulary-hard-provisional"}'::jsonb);

insert into public.answer_keys(content_unit_id,correct,metadata) values('476efb90-b0d1-54ee-a9a7-ebff03171dd6','{"option_id":"C"}'::jsonb,'{"feedback":{"explanation":"The historian explicitly expects to revise her account when more documents are available. Provisional describes this tentative status, not an absence of evidence or a particular audience."},"source":"original-schood-practice-v1"}'::jsonb);

insert into public.content_units(id,part_id,type,data,display_order,metadata) values('a8f01bf6-100f-5a28-b6cf-9fcc1aa450ca','29e893d7-160e-582d-9ba6-9339ab9adea5','question_single_choice','{"prompt":"A fictional report claims that a town''s bicycle racks are used more heavily on weekdays than on weekends. Which finding most directly supports the claim?","options":[{"id":"A","label":"Counts at the same racks averaged 64 parked bicycles on weekdays and 29 on weekends during the study month."},{"id":"B","label":"The town installed its first bicycle rack ten years ago."},{"id":"C","label":"The racks were painted blue before the study began."},{"id":"D","label":"Several residents said that they enjoy cycling on weekends."}]}'::jsonb,13,'{"section_type":"reading_writing","sat_domain":"command_of_evidence","difficulty":"easy","difficulty_basis":"editorial","content_status":"published","content_revision":"original-2026-10-v1","original_slug":"evidence-easy-direct-support"}'::jsonb);

insert into public.answer_keys(content_unit_id,correct,metadata) values('a8f01bf6-100f-5a28-b6cf-9fcc1aa450ca','{"option_id":"A"}'::jsonb,'{"feedback":{"explanation":"A directly compares rack use across the two periods and shows higher weekday use. Installation dates, paint color, and general preferences do not measure that comparison."},"source":"original-schood-practice-v1"}'::jsonb);

insert into public.content_units(id,part_id,type,data,display_order,metadata) values('3ce0f992-009c-5c35-9204-fb2a9f590e62','29e893d7-160e-582d-9ba6-9339ab9adea5','question_single_choice','{"prompt":"In a fictional experiment, a researcher predicts that adding compost will increase the average height of bean plants. Plants are randomly assigned to otherwise identical compost and no-compost groups. Which result would most directly weaken the prediction?","options":[{"id":"A","label":"Both groups are measured on the same day."},{"id":"B","label":"Several plants in each group develop flowers."},{"id":"C","label":"The compost is dark brown."},{"id":"D","label":"The compost group''s mean height is 17 cm, compared with 23 cm for the no-compost group."}]}'::jsonb,14,'{"section_type":"reading_writing","sat_domain":"command_of_evidence","difficulty":"medium","difficulty_basis":"editorial","content_status":"published","content_revision":"original-2026-10-v1","original_slug":"evidence-medium-counterevidence"}'::jsonb);

insert into public.answer_keys(content_unit_id,correct,metadata) values('3ce0f992-009c-5c35-9204-fb2a9f590e62','{"option_id":"D"}'::jsonb,'{"feedback":{"explanation":"The predicted increase is weakened by a lower average height in the compost group. The other findings do not compare the groups'' heights. This question asks about the direction of evidence, not statistical significance."},"source":"original-schood-practice-v1"}'::jsonb);

insert into public.content_units(id,part_id,type,data,display_order,metadata) values('ad5b364c-daa0-5e96-9837-6dba16765ec0','29e893d7-160e-582d-9ba6-9339ab9adea5','question_single_choice','{"prompt":"A fictional survey recorded 24 bus users among 40 respondents in District A and 45 bus users among 90 respondents in District B. An analyst claims that the share of surveyed residents using buses was greater in District A. Which statement best supports the claim?","options":[{"id":"A","label":"District B had 21 more bus users in the survey than District A."},{"id":"B","label":"Bus users represented 60% of District A''s respondents and 50% of District B''s respondents."},{"id":"C","label":"District A and District B had equal numbers of respondents."},{"id":"D","label":"All residents of District A used buses more frequently than all residents of District B."}]}'::jsonb,15,'{"section_type":"reading_writing","sat_domain":"command_of_evidence","difficulty":"hard","difficulty_basis":"editorial","content_status":"published","content_revision":"original-2026-10-v1","original_slug":"evidence-hard-proportional-inference"}'::jsonb);

insert into public.answer_keys(content_unit_id,correct,metadata) values('ad5b364c-daa0-5e96-9837-6dba16765ec0','{"option_id":"B"}'::jsonb,'{"feedback":{"explanation":"The relevant comparison is the proportion: 24/40 equals 60%, and 45/90 equals 50%. Raw counts do not establish the share, and the survey does not support a statement about every resident or frequency of use."},"source":"original-schood-practice-v1"}'::jsonb);

insert into public.sections(id,experience_id,name,display_order,metadata) values('bee41358-7368-5bbb-bb76-e42afe3c1c44','d2f60197-eaa3-5772-88ac-b05d60f11bb5','Math',2,'{"section_type":"math"}'::jsonb);

insert into public.parts(id,section_id,name,display_order) values('46551918-1cc1-598d-a456-d21b43b4647f','bee41358-7368-5bbb-bb76-e42afe3c1c44','Original foundation questions',1);

insert into public.content_units(id,part_id,type,data,display_order,metadata) values('ba5158d3-3893-5f77-9237-0f14a9b58b23','46551918-1cc1-598d-a456-d21b43b4647f','question_single_choice','{"prompt":"If 4x - 7 = 17, what is x?","options":[{"id":"A","label":"2.5"},{"id":"B","label":"6"},{"id":"C","label":"10"},{"id":"D","label":"24"}]}'::jsonb,1,'{"section_type":"math","sat_domain":"algebra","difficulty":"easy","difficulty_basis":"editorial","content_status":"published","content_revision":"original-2026-10-v1","original_slug":"algebra-easy-linear-equation"}'::jsonb);

insert into public.answer_keys(content_unit_id,correct,metadata) values('ba5158d3-3893-5f77-9237-0f14a9b58b23','{"option_id":"B"}'::jsonb,'{"feedback":{"explanation":"Add 7 to each side to get 4x = 24, then divide by 4: x = 6. Substitution gives 4(6) - 7 = 17."},"source":"original-schood-practice-v1"}'::jsonb);

insert into public.content_units(id,part_id,type,data,display_order,metadata) values('62c7dba6-c03f-5891-b0de-897af36f554d','46551918-1cc1-598d-a456-d21b43b4647f','question_single_choice','{"prompt":"The equations 3x + 2y = 21 and x - y = 2 are true. What is x + y?","options":[{"id":"A","label":"2"},{"id":"B","label":"5"},{"id":"C","label":"7"},{"id":"D","label":"8"}]}'::jsonb,2,'{"section_type":"math","sat_domain":"algebra","difficulty":"medium","difficulty_basis":"editorial","content_status":"published","content_revision":"original-2026-10-v1","original_slug":"algebra-medium-system"}'::jsonb);

insert into public.answer_keys(content_unit_id,correct,metadata) values('62c7dba6-c03f-5891-b0de-897af36f554d','{"option_id":"D"}'::jsonb,'{"feedback":{"explanation":"From x - y = 2, x = y + 2. Substitute to get 5y + 6 = 21, so y = 3 and x = 5. Their sum is 8."},"source":"original-schood-practice-v1"}'::jsonb);

insert into public.content_units(id,part_id,type,data,display_order,metadata) values('3fcf4ed1-36e2-52da-b62a-609d84dbd525','46551918-1cc1-598d-a456-d21b43b4647f','question_single_choice','{"prompt":"The system 2x + 3y = 7 and kx + 6y = 14 has infinitely many solutions. What is k?","options":[{"id":"A","label":"4"},{"id":"B","label":"6"},{"id":"C","label":"7"},{"id":"D","label":"12"}]}'::jsonb,3,'{"section_type":"math","sat_domain":"algebra","difficulty":"hard","difficulty_basis":"editorial","content_status":"published","content_revision":"original-2026-10-v1","original_slug":"algebra-hard-dependent-system"}'::jsonb);

insert into public.answer_keys(content_unit_id,correct,metadata) values('3fcf4ed1-36e2-52da-b62a-609d84dbd525','{"option_id":"A"}'::jsonb,'{"feedback":{"explanation":"For infinitely many solutions, the second equation must be a multiple of the first. Its y coefficient and constant are twice those in the first, so its x coefficient must be twice 2: k = 4."},"source":"original-schood-practice-v1"}'::jsonb);

insert into public.content_units(id,part_id,type,data,display_order,metadata) values('546b25b3-e1df-571c-9dbe-141534ce2f82','46551918-1cc1-598d-a456-d21b43b4647f','question_single_choice','{"prompt":"What is the greater solution of x² - 5x + 6 = 0?","options":[{"id":"A","label":"-3"},{"id":"B","label":"-2"},{"id":"C","label":"3"},{"id":"D","label":"6"}]}'::jsonb,4,'{"section_type":"math","sat_domain":"advanced_math","difficulty":"easy","difficulty_basis":"editorial","content_status":"published","content_revision":"original-2026-10-v1","original_slug":"advanced-easy-quadratic-roots"}'::jsonb);

insert into public.answer_keys(content_unit_id,correct,metadata) values('546b25b3-e1df-571c-9dbe-141534ce2f82','{"option_id":"C"}'::jsonb,'{"feedback":{"explanation":"Factor the expression as (x - 2)(x - 3). The roots are 2 and 3, and the greater root is 3."},"source":"original-schood-practice-v1"}'::jsonb);

insert into public.content_units(id,part_id,type,data,display_order,metadata) values('50db7ae0-66e3-5f85-9180-f7f0f629b855','46551918-1cc1-598d-a456-d21b43b4647f','question_single_choice','{"prompt":"A model starts at 120 units and multiplies by 1.25 each hour. What value does the model predict after two hours?","options":[{"id":"A","label":"150"},{"id":"B","label":"180"},{"id":"C","label":"300"},{"id":"D","label":"187.5"}]}'::jsonb,5,'{"section_type":"math","sat_domain":"advanced_math","difficulty":"medium","difficulty_basis":"editorial","content_status":"published","content_revision":"original-2026-10-v1","original_slug":"advanced-medium-exponential-growth"}'::jsonb);

insert into public.answer_keys(content_unit_id,correct,metadata) values('50db7ae0-66e3-5f85-9180-f7f0f629b855','{"option_id":"D"}'::jsonb,'{"feedback":{"explanation":"Two hours apply the factor twice: 120 × 1.25² = 120 × 1.5625 = 187.5. Adding the same amount each hour would model linear growth instead."},"source":"original-schood-practice-v1"}'::jsonb);

insert into public.content_units(id,part_id,type,data,display_order,metadata) values('b0280729-dbf9-5526-b9dd-86e5833a07b4','46551918-1cc1-598d-a456-d21b43b4647f','question_single_choice','{"prompt":"The numbers r and s are the roots of x² - 6x + 4 = 0. What is r² + s²?","options":[{"id":"A","label":"20"},{"id":"B","label":"28"},{"id":"C","label":"32"},{"id":"D","label":"36"}]}'::jsonb,6,'{"section_type":"math","sat_domain":"advanced_math","difficulty":"hard","difficulty_basis":"editorial","content_status":"published","content_revision":"original-2026-10-v1","original_slug":"advanced-hard-root-expression"}'::jsonb);

insert into public.answer_keys(content_unit_id,correct,metadata) values('b0280729-dbf9-5526-b9dd-86e5833a07b4','{"option_id":"B"}'::jsonb,'{"feedback":{"explanation":"The sum of the roots is 6 and their product is 4. Therefore r² + s² = (r + s)² - 2rs = 36 - 8 = 28."},"source":"original-schood-practice-v1"}'::jsonb);

insert into public.content_units(id,part_id,type,data,display_order,metadata) values('d78cff0f-8b99-5137-8d30-5817499f60dd','46551918-1cc1-598d-a456-d21b43b4647f','question_single_choice','{"prompt":"A club has 80 members, and 35% of them volunteer at an event. How many members volunteer?","options":[{"id":"A","label":"28"},{"id":"B","label":"35"},{"id":"C","label":"45"},{"id":"D","label":"52"}]}'::jsonb,7,'{"section_type":"math","sat_domain":"problem_solving_data_analysis","difficulty":"easy","difficulty_basis":"editorial","content_status":"published","content_revision":"original-2026-10-v1","original_slug":"data-easy-proportion"}'::jsonb);

insert into public.answer_keys(content_unit_id,correct,metadata) values('d78cff0f-8b99-5137-8d30-5817499f60dd','{"option_id":"A"}'::jsonb,'{"feedback":{"explanation":"35% of 80 is 0.35 × 80 = 28. A percentage must be applied to the total; it is not itself the number of members."},"source":"original-schood-practice-v1"}'::jsonb);

insert into public.content_units(id,part_id,type,data,display_order,metadata) values('959231bd-c4f1-5bee-8d7a-c0af1c197922','46551918-1cc1-598d-a456-d21b43b4647f','question_single_choice','{"prompt":"Four readings have a mean of 12. Six other readings have a mean of 17. What is the mean of all ten readings?","options":[{"id":"A","label":"14.5"},{"id":"B","label":"15"},{"id":"C","label":"15.5"},{"id":"D","label":"29"}]}'::jsonb,8,'{"section_type":"math","sat_domain":"problem_solving_data_analysis","difficulty":"medium","difficulty_basis":"editorial","content_status":"published","content_revision":"original-2026-10-v1","original_slug":"data-medium-combined-mean"}'::jsonb);

insert into public.answer_keys(content_unit_id,correct,metadata) values('959231bd-c4f1-5bee-8d7a-c0af1c197922','{"option_id":"B"}'::jsonb,'{"feedback":{"explanation":"The first group totals 4 × 12 = 48, and the second totals 6 × 17 = 102. Divide their combined total 150 by ten to get a weighted mean of 15."},"source":"original-schood-practice-v1"}'::jsonb);

insert into public.content_units(id,part_id,type,data,display_order,metadata) values('eb6594c0-d1f4-51dc-ae19-2e30ea1fa01d','46551918-1cc1-598d-a456-d21b43b4647f','question_single_choice','{"prompt":"A survey recorded 18 morning-shift workers who cycle and 12 who do not, plus 8 evening-shift workers who cycle and 22 who do not. A surveyed cyclist is selected at random. What is the probability that the selected person works the morning shift?","options":[{"id":"A","label":"3/10"},{"id":"B","label":"3/5"},{"id":"C","label":"13/30"},{"id":"D","label":"9/13"}]}'::jsonb,9,'{"section_type":"math","sat_domain":"problem_solving_data_analysis","difficulty":"hard","difficulty_basis":"editorial","content_status":"published","content_revision":"original-2026-10-v1","original_slug":"data-hard-conditional-probability"}'::jsonb);

insert into public.answer_keys(content_unit_id,correct,metadata) values('eb6594c0-d1f4-51dc-ae19-2e30ea1fa01d','{"option_id":"D"}'::jsonb,'{"feedback":{"explanation":"The selection is from the 26 cyclists, not all 60 respondents. Eighteen cyclists work mornings, so the conditional probability is 18/26 = 9/13."},"source":"original-schood-practice-v1"}'::jsonb);

insert into public.content_units(id,part_id,type,data,display_order,metadata) values('72f7af7f-acb7-5f04-9473-b397ea477b7f','46551918-1cc1-598d-a456-d21b43b4647f','question_single_choice','{"prompt":"A triangle has a base of 12 cm and a perpendicular height of 7 cm. What is its area in square centimeters?","options":[{"id":"A","label":"19"},{"id":"B","label":"38"},{"id":"C","label":"42"},{"id":"D","label":"84"}]}'::jsonb,10,'{"section_type":"math","sat_domain":"geometry_trig","difficulty":"easy","difficulty_basis":"editorial","content_status":"published","content_revision":"original-2026-10-v1","original_slug":"geometry-easy-triangle-area"}'::jsonb);

insert into public.answer_keys(content_unit_id,correct,metadata) values('72f7af7f-acb7-5f04-9473-b397ea477b7f','{"option_id":"C"}'::jsonb,'{"feedback":{"explanation":"Triangle area is half the product of base and perpendicular height: (1/2) × 12 × 7 = 42 square centimeters."},"source":"original-schood-practice-v1"}'::jsonb);

insert into public.content_units(id,part_id,type,data,display_order,metadata) values('14433a93-e297-5210-a2e1-24fa34f447e6','46551918-1cc1-598d-a456-d21b43b4647f','question_single_choice','{"prompt":"In a right triangle, an acute angle θ has an opposite side of length 5, an adjacent side of length 12, and a hypotenuse of length 13. What is sin θ?","options":[{"id":"A","label":"5/13"},{"id":"B","label":"5/12"},{"id":"C","label":"12/13"},{"id":"D","label":"13/5"}]}'::jsonb,11,'{"section_type":"math","sat_domain":"geometry_trig","difficulty":"medium","difficulty_basis":"editorial","content_status":"published","content_revision":"original-2026-10-v1","original_slug":"geometry-medium-trigonometric-ratio"}'::jsonb);

insert into public.answer_keys(content_unit_id,correct,metadata) values('14433a93-e297-5210-a2e1-24fa34f447e6','{"option_id":"A"}'::jsonb,'{"feedback":{"explanation":"Sine is opposite divided by hypotenuse: sin θ = 5/13. The ratio 5/12 is tangent, and 12/13 is cosine."},"source":"original-schood-practice-v1"}'::jsonb);

insert into public.content_units(id,part_id,type,data,display_order,metadata) values('dfd59b08-ffb8-5eea-9da0-7a6a8979f37f','46551918-1cc1-598d-a456-d21b43b4647f','question_single_choice','{"prompt":"A circle has center O and radius 6. A point P lies outside the circle with OP = 10. The segment PT is tangent to the circle at T. What is the length of PT?","options":[{"id":"A","label":"4"},{"id":"B","label":"8"},{"id":"C","label":"10"},{"id":"D","label":"16"}]}'::jsonb,12,'{"section_type":"math","sat_domain":"geometry_trig","difficulty":"hard","difficulty_basis":"editorial","content_status":"published","content_revision":"original-2026-10-v1","original_slug":"geometry-hard-circle-tangent"}'::jsonb);

insert into public.answer_keys(content_unit_id,correct,metadata) values('dfd59b08-ffb8-5eea-9da0-7a6a8979f37f','{"option_id":"B"}'::jsonb,'{"feedback":{"explanation":"The radius OT is perpendicular to tangent PT, making OPT a right triangle. Thus PT² = OP² - OT² = 100 - 36 = 64, so PT = 8."},"source":"original-schood-practice-v1"}'::jsonb);

-- Retire only the exact reviewed legacy RW bank template. Preserve rows,
-- answer keys, existing attempts, progress and completed receipts.
update public.content_units u set metadata=coalesce(u.metadata,'{}'::jsonb)||
  '{"content_status":"legacy_placeholder","retirement_reason":"Unanswerable seeded revision choices","retired_in":"original-2026-10-v1"}'::jsonb
from public.parts p join public.sections s on s.id=p.section_id
where u.part_id=p.id and s.experience_id='4d9d460b-b514-4ace-91ef-80977fe4d404'
  and p.id='7a440001-8d3f-4bf4-8c1c-444000001001'
  and u.type='question_single_choice'
  and case when coalesce(u.metadata->>'practice_item','') ~ '^[1-9][0-9]{0,2}$'
    then (u.metadata->>'practice_item')::integer between 1 and 300 else false end
  and u.data->>'prompt'=format('RW Practice Q%s: Choose the most concise and precise revision.',u.metadata->>'practice_item')
  and u.data->'options'=jsonb_build_array(
    jsonb_build_object('id','A','label',format('Choice A (%s)',u.metadata->>'practice_item')),
    jsonb_build_object('id','B','label',format('Choice B (%s)',u.metadata->>'practice_item')),
    jsonb_build_object('id','C','label',format('Choice C (%s)',u.metadata->>'practice_item')),
    jsonb_build_object('id','D','label',format('Choice D (%s)',u.metadata->>'practice_item')));

-- Private feedback stays inside correct, which existing Edge clients strip entirely.

-- Scope the format-tagged bank to the two authorized SAT products.

-- Filter the entire published bank before limiting. Answer keys and actor-scoped
-- learning history are available only to the Edge service, never directly to browsers.
create or replace function public.select_sat_practice_questions(
  p_user_id uuid,
  p_section text default null,
  p_domain text default null,
  p_difficulty text default null,
  p_history text default null,
  p_question_ids uuid[] default null,
  p_limit integer default 30,
  p_include_retired boolean default false
) returns setof jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_user_id is null or p_limit is null or p_limit not between 1 and 100
    or (p_section is not null and p_section not in ('math','reading_writing'))
    or (p_domain is not null and p_domain not in ('grammar','transitions','rhetoric','vocabulary_in_context','command_of_evidence','algebra','advanced_math','problem_solving_data_analysis','geometry_trig'))
    or (p_difficulty is not null and p_difficulty not in ('easy','medium','hard'))
    or (p_history is not null and p_history not in ('previously_missed','mastered','unseen'))
    or cardinality(p_question_ids) > 100
    or (p_include_retired and p_question_ids is null)
  then raise exception 'Invalid bank filters' using errcode = '22023'; end if;

  return query
  with source as (
    select u.*, case when jsonb_typeof(k.correct)='object' and jsonb_typeof(k.metadata->'feedback')='object' then k.correct||jsonb_build_object('feedback',k.metadata->'feedback') else k.correct end as correct,
      e.display_order as experience_order, s.display_order as section_order,
      p.display_order as part_order,
      case when e.metadata->>'bank_priority' = 'curated' then 0 else 1 end as priority,
      lower(trim(coalesce(u.metadata->>'section_type',u.metadata->>'section',u.metadata->>'domain',''))) as raw_section,
      replace(regexp_replace(lower(trim(coalesce(u.metadata->>'sat_domain',u.metadata->>'domain',''))),'[[:space:]-]+','_','g'),'&','and') as raw_domain,
      lower(trim(coalesce(u.metadata->>'difficulty',u.metadata->>'difficulty_tier','medium'))) as raw_difficulty
    from public.experiences e
    join public.sections s on s.experience_id = e.id
    join public.parts p on p.section_id = s.id
    join public.content_units u on u.part_id = p.id
    left join public.answer_keys k on k.content_unit_id = u.id
    where e.metadata->>'format' = 'sat_practice_bank'
      and e.product_id in ('2cf7b1a7-4df9-4de8-99e8-5b9d5bb85010'::uuid,'5cf6e8e2-e6b1-4f8f-9d35-1c932866d6ef'::uuid)
      and (e.is_active or p_include_retired)
      and u.type like 'question_%' and jsonb_typeof(u.data) = 'object'
      and (p_include_retired or (k.correct is not null and k.correct <> 'null'::jsonb))
      and (p_question_ids is null or u.id = any(p_question_ids))
      and (p_include_retired or coalesce(u.metadata->>'content_status','published') not in ('retired','legacy_placeholder'))
  ), domains as (
    select source.*, case
      when raw_domain in ('grammar','transitions','rhetoric','vocabulary_in_context','command_of_evidence','algebra','advanced_math','problem_solving_data_analysis','geometry_trig') then raw_domain
      when raw_domain in ('math') then 'algebra'
      when raw_domain in ('vocabulary','vocab') then 'vocabulary_in_context'
      when raw_domain = 'evidence' then 'command_of_evidence'
      when raw_domain in ('geometry','trig') then 'geometry_trig'
      when raw_domain = 'data_analysis' then 'problem_solving_data_analysis'
      when raw_domain in ('reading_writing','rw') then 'grammar'
      when raw_section = 'math' then 'algebra' else 'grammar' end as domain
    from source
  ), normalized as (
    select domains.*,
      case when raw_section = 'math' or domain in ('algebra','advanced_math','problem_solving_data_analysis','geometry_trig') then 'math' else 'reading_writing' end as section_type,
      case when raw_difficulty in ('easy','medium','hard') then raw_difficulty else 'medium' end as difficulty
    from domains
  )
  select jsonb_build_object('id',n.id,'type',n.type,'data',n.data,'metadata',coalesce(n.metadata,'{}'::jsonb),
    'section_type',n.section_type,'domain',n.domain,'difficulty',n.difficulty,'correct',n.correct)
  from normalized n
  left join public.sat_practice_srs_queue q on q.question_id = n.id and q.user_id = p_user_id
  where (p_section is null or n.section_type = p_section)
    and (p_domain is null or n.domain = p_domain)
    and (p_difficulty is null or n.difficulty = p_difficulty)
    and (p_history is null
      or (p_history = 'mastered' and q.leitner_box = 5 and q.correct_count > 0)
      or (p_history = 'previously_missed' and (q.incorrect_count > 0 or exists (
        select 1 from public.sat_practice_lab_attempts a,
        lateral jsonb_array_elements(case when jsonb_typeof(a.scored_items) = 'array' then a.scored_items else '[]'::jsonb end) item
        where a.user_id = p_user_id and a.status = 'scored' and n.id = any(a.question_ids)
          and item->>'question_id' = n.id::text and item->>'correct' = 'false'
      )))
      or (p_history = 'unseen' and coalesce(q.correct_count + q.incorrect_count,0) = 0 and not exists (
        select 1 from public.sat_practice_lab_attempts a
        where a.user_id = p_user_id and a.status = 'scored' and n.id = any(a.question_ids)
      )))
  order by n.priority,n.experience_order,n.section_order,n.part_order,n.display_order,n.id
  limit p_limit;
end;
$$;

revoke all on function public.select_sat_practice_questions(uuid,text,text,text,text,uuid[],integer,boolean) from public,anon,authenticated;
grant execute on function public.select_sat_practice_questions(uuid,text,text,text,text,uuid[],integer,boolean) to service_role;

notify pgrst,'reload schema';

commit;
