-- Backfill richer body content for seeded Reading library articles.
-- Safe to rerun: only sets content when currently null or blank.

do $mig$
declare
  v_product_id uuid;
  v_language_id uuid;
begin
  select id
  into v_product_id
  from public.products
  where lower(coalesce(metadata->>'slug', '')) = 'english-reading'
  order by created_at asc
  limit 1;

  select id
  into v_language_id
  from public.languages
  where code = 'en'
  limit 1;

  if v_product_id is null or v_language_id is null then
    raise exception 'Required english-reading product or en language is missing';
  end if;

  update public.reading_articles
  set
    content_markdown = case slug
      when 'city-signs-quick-read' then
        $$## Why city signs matter
Street signs are short, but they carry important decisions. If you can read them fast, you move safely and confidently in a new place.

## Three-step scan
First, find the action word such as stop, turn, or enter.  
Second, check time or distance details.  
Third, confirm whether the sign is an instruction, warning, or information.

## Daily practice
Take a photo of three signs each day and rewrite their meaning in one sentence. This builds speed and vocabulary together.$$
      when 'grocery-label-choices' then
        $$## Label reading without stress
Many learners know food words, but they miss hidden details on labels. A clear sequence helps you compare products quickly.

## Compare in order
Start with serving size, then sugar and salt, then ingredients. If two items look similar, choose the one with simpler ingredient lists.

## Useful language
Words like low-fat, unsalted, and fortified appear often. Keep a short notebook of these terms with one example sentence for each.$$
      when 'study-plan-that-lasts' then
        $$## Consistency beats intensity
A strong study plan is not about long sessions. It is about repeatable routines you can keep for weeks.

## Weekly structure
Set one main objective for the week, then divide it into small daily blocks. Each block should have one clear output.

## Reflection loop
At the end of each week, record what worked and what failed. Adjust the next week using real evidence, not motivation alone.$$
      when 'meeting-notes-reading-between-lines' then
        $$## Hidden meaning in notes
Meeting notes often contain actions that are implied, not directly stated. Readers need to identify ownership, urgency, and risk.

## Signal words
Watch for phrases like follow up, pending, blocker, and decision required. These words usually indicate unfinished work.

## Practical method
After reading, write three lines: what happened, what is next, and who is responsible. This turns passive reading into operational clarity.$$
      when 'ai-bias-everyday-tools' then
        $$## Where bias appears
Bias in AI systems can appear in ranking, recommendation, or language tone. It is not always obvious.

## Questions to ask
Who is represented in the examples?  
Which voices are missing?  
Would the result change for a different user group?

## Better reading habits
When reading AI outputs, separate facts from assumptions. Mark uncertain claims and verify them with a second source before acting.$$
      when 'urban-design-human-behavior' then
        $$## Cities shape reading behavior
People read differently depending on where information appears. Station signs, wall posters, and phone alerts each demand different attention.

## Design and comprehension
Clear spacing, predictable icons, and short clauses improve understanding in busy environments.

## Long-term perspective
Urban communication works best when planners test with real users and iterate over time instead of launching one static system.$$
      when 'airport-guides-without-stress' then
        $$## Fast reading in airports
Airport language mixes numbers, abbreviations, and short commands. Reading speed matters because context changes quickly.

## Priority order
Read gate number first, then boarding time, then status words like delayed or final call.

## Common mistake
Learners often read every detail equally. Train yourself to scan for decision-critical information before secondary details.$$
      when 'museum-captions-like-curator' then
        $$## Reading visual context
Museum captions combine dates, names, and interpretations. The goal is to connect the text with what you see.

## Structure clues
Most captions move from fact to interpretation. Identify this shift and ask what evidence supports the interpretation.

## Discussion prompt
After each caption, explain one detail to another learner in your own words. This improves retention and synthesis.$$
      when 'weather-words-you-need' then
        $$## Weather language in real life
Weather terms appear in transport updates, daily planning, and safety alerts.

## Useful bundles
Learn chunks such as heavy rain warning, strong wind advisory, and sudden temperature drop.

## Practice task
Read a 3-day forecast and write two decisions you would make based on the information.$$
      when 'green-transport-city-priority' then
        $$## Reading policy arguments
Transport policy texts combine economics, sustainability, and social impact. Readers should track claims and supporting evidence.

## Compare both sides
Supporters emphasize emissions and public health. Critics emphasize cost, disruption, and implementation risk.

## Critical reading
Distinguish between evidence, prediction, and opinion. This helps you evaluate argument quality rather than writing style alone.$$
      when 'remote-collaboration-signals' then
        $$## Team updates as signals
Short remote updates can hide serious blockers. Good readers identify what is missing, not only what is stated.

## Attention points
Look for unresolved dependencies, unclear ownership, and vague deadlines.

## Action habit
After reading a thread, write one concrete next action and one clarification question. This keeps momentum in distributed teams.$$
      when 'cultural-context-global-news' then
        $$## Same event, different framing
Global news sources may report the same event with different emphasis and vocabulary choices.

## Reading across sources
Compare headline tone, selected quotes, and historical context to understand framing differences.

## Advanced practice
Summarize two articles with opposing tones and explain how language choices influence reader perception.$$
      else content_markdown
    end,
    updated_at = now()
  where product_id = v_product_id
    and language_id = v_language_id
    and status = 'published'
    and (
      content_markdown is null
      or length(trim(content_markdown)) = 0
    );
end
$mig$;
