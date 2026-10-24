import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { gradeFromQuality } from "../_shared/english-srs.ts";
import {
  addDrillWords,
  dueDrillCards,
  englishLanguageId,
  ensureStarterWords,
  gradeWord,
  importDrillCards,
  wordStats,
} from "../_shared/english-word-store.ts";

// The platform vocabulary drill (/vocab-drill) and the @schoodonlinebot funnel.
// Words and reviews live in the learner's English notebook (one word store,
// see _shared/english-word-store.ts); the response shapes are unchanged.

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const json = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...cors } });
const getEnv = (k: string) => { const v = Deno.env.get(k); if (!v) throw new Error(`Missing ${k}`); return v; };
const bearer = (req: Request) => { const h = req.headers.get("Authorization") ?? ""; return h.startsWith("Bearer ") ? h.slice(7) : h || null; };

// Top 120 IELTS Academic Word List entries
const AWL_SEED: ReadonlyArray<readonly [string, string, string]> = [
  ["abandon","to leave behind or give up completely","The team had to abandon the project due to lack of funds."],
  ["abstract","existing as an idea, not concrete","The researcher presented an abstract theory."],
  ["access","the right or opportunity to use something","Students have access to the library 24/7."],
  ["accurate","correct and precise","The data must be accurate for valid results."],
  ["achieve","to successfully reach a goal","She worked hard to achieve her target band score."],
  ["acquire","to gain or obtain something","It takes time to acquire academic vocabulary."],
  ["adequate","sufficient, enough","The evidence was adequate to support the claim."],
  ["analyse","to examine in detail","The researcher analysed the survey results."],
  ["approach","a way of dealing with something","A different approach may yield better results."],
  ["appropriate","suitable for the situation","Choose appropriate vocabulary for academic writing."],
  ["aspect","a particular part or feature","Consider every aspect of the argument."],
  ["assess","to evaluate or judge","Teachers assess students' progress regularly."],
  ["assume","to accept something as true without proof","We cannot assume correlation implies causation."],
  ["authority","power or right to give orders","The government has authority over public policy."],
  ["available","ready to be used","Resources are available online."],
  ["benefit","an advantage or profit","Regular exercise has many health benefits."],
  ["category","a group of things with shared features","Data was divided into three categories."],
  ["chapter","a main division of a book","Each chapter covers a different topic."],
  ["communicate","to share information","Scientists communicate findings through journals."],
  ["community","a group of people sharing a common interest","The local community supported the initiative."],
  ["complex","made of many parts; not simple","Climate change is a complex issue."],
  ["concept","an abstract idea","The concept of sustainability is widely discussed."],
  ["conclude","to decide based on evidence","We can conclude that the hypothesis is correct."],
  ["consequent","following as a result","The consequent rise in prices affected consumers."],
  ["consider","to think carefully about","You should consider all the evidence."],
  ["consistent","always behaving in the same way","The results were consistent across all trials."],
  ["constitute","to make up or form","Education constitutes a fundamental right."],
  ["context","the circumstances surrounding something","Consider the historical context of the event."],
  ["contract","a formal written agreement","Both parties signed the contract."],
  ["contribute","to give or add to something","Volunteers contribute their time freely."],
  ["controversy","a disagreement between opposing views","The policy caused significant controversy."],
  ["create","to make something new","Innovation creates economic opportunities."],
  ["criteria","standards used for judging something","The selection criteria were strictly applied."],
  ["culture","the customs and values of a group","Different cultures have different traditions."],
  ["data","facts and information used for analysis","The data suggests a positive trend."],
  ["define","to state the exact meaning","First, define the key terms."],
  ["demonstrate","to show clearly","The experiment demonstrates cause and effect."],
  ["distinguish","to recognise as different","Learners must distinguish fact from opinion."],
  ["distribute","to spread or deliver to several","The organization distributes aid to refugees."],
  ["economic","relating to the economy","Economic growth benefits the population."],
  ["effect","a change produced by a cause","The effect of pollution on health is severe."],
  ["element","a basic part of something","Water is an essential element for life."],
  ["emerge","to come into existence","New technologies continue to emerge."],
  ["emphasise","to give special importance to","The report emphasises the need for action."],
  ["environment","surroundings that affect development","A positive learning environment is crucial."],
  ["establish","to set up or prove firmly","The study established a clear link."],
  ["estimate","an approximate calculation","Scientists estimate the population at 8 billion."],
  ["evaluate","to assess the value of","Critical thinkers evaluate sources carefully."],
  ["evidence","facts supporting a conclusion","There is strong evidence for climate change."],
  ["expand","to become larger or wider","The company plans to expand overseas."],
  ["explicit","clearly stated, leaving nothing implied","The instructions should be explicit."],
  ["factor","something that influences an outcome","Motivation is a key factor in success."],
  ["feature","a distinctive aspect or characteristic","Hedging is a key feature of academic writing."],
  ["final","coming at the end; conclusive","The final conclusion was unexpected."],
  ["focus","to concentrate on something","Students should focus on key arguments."],
  ["framework","a basic structure underlying a system","A theoretical framework guides the research."],
  ["function","the purpose something serves","Language has a communicative function."],
  ["fundamental","forming an essential base","Critical thinking is a fundamental skill."],
  ["generate","to produce or create","The turbine generates electricity."],
  ["global","relating to the whole world","Global warming is a pressing concern."],
  ["hypothesis","a proposed explanation to be tested","The hypothesis was confirmed by the results."],
  ["identify","to recognise and name","Identify the main argument in each paragraph."],
  ["impact","a strong effect on someone or something","Technology has a great impact on education."],
  ["imply","to suggest without stating directly","The results imply a need for further study."],
  ["indicate","to show or point to","Data indicates a rising trend."],
  ["individual","a single person or thing","Each individual has unique learning needs."],
  ["influence","to affect or change","Peers influence teenage behaviour significantly."],
  ["initial","first or earliest","The initial findings were promising."],
  ["integrate","to combine parts into a whole","The curriculum integrates skills effectively."],
  ["interpret","to explain the meaning of","Students must interpret statistical data."],
  ["investigate","to carry out research into","Scientists investigate the effects of diet."],
  ["involve","to include as a necessary part","The experiment involves strict controls."],
  ["issue","an important topic for debate","Poverty is a global issue."],
  ["justify","to show a decision is reasonable","Justify your argument with evidence."],
  ["major","most important or significant","Climate change is a major global challenge."],
  ["method","a way of doing something","The research method must be clearly explained."],
  ["migrate","to move from one place to another","Many birds migrate in winter."],
  ["modify","to make partial changes to","Researchers may modify their hypothesis."],
  ["monitor","to observe and check progress","Scientists monitor changes in temperature."],
  ["motivation","the reason for doing something","Intrinsic motivation leads to deeper learning."],
  ["negative","harmful or unwanted","Pollution has negative effects on health."],
  ["obtain","to get or acquire something","Data was obtained through surveys."],
  ["occur","to happen or take place","Climate events occur more frequently now."],
  ["perceive","to notice or understand","People perceive risk differently."],
  ["period","a length of time","The study covered a ten-year period."],
  ["policy","a plan or course of action adopted","Education policy shapes future generations."],
  ["positive","good or favourable","Exercise has positive effects on mental health."],
  ["potential","having the capacity to develop","Renewable energy has great potential."],
  ["previous","existing or happening before","Previous research supports this claim."],
  ["primary","first in order of importance","The primary objective of the study is..."],
  ["principle","a fundamental rule or belief","The principle of fairness applies here."],
  ["process","a series of steps leading to a result","The scientific process ensures reliability."],
  ["promote","to encourage or advance","Exercise promotes physical well-being."],
  ["proportion","a part of the whole","A large proportion of the sample agreed."],
  ["prove","to show beyond doubt","It is difficult to prove causation."],
  ["publish","to make available to the public","Researchers publish findings in journals."],
  ["range","a variety of different things","A range of factors contributes to poverty."],
  ["region","an area with common characteristics","The northern region has a colder climate."],
  ["regulate","to control by rules","Governments regulate industrial emissions."],
  ["relevant","closely connected to the matter","Choose relevant examples for your argument."],
  ["require","to need something","Academic writing requires precision."],
  ["research","a careful study to discover facts","Further research is needed to confirm this."],
  ["respond","to say or react in return","Participants were asked to respond to questions."],
  ["restrict","to limit or control","Access to resources may be restricted."],
  ["reveal","to make known","The study reveals interesting patterns."],
  ["role","a function or position","Education plays a crucial role in development."],
  ["significant","important or noteworthy","The results are statistically significant."],
  ["similar","nearly the same","The two studies produced similar results."],
  ["source","the origin of something","Cite your sources correctly in academic writing."],
  ["specific","clearly defined or identified","Provide specific examples to support your claim."],
  ["structure","the way something is built or organised","A clear structure improves essay coherence."],
  ["sufficient","enough for a purpose","The evidence is not sufficient to conclude."],
  ["summary","a brief statement of the main points","Write a brief summary of the article."],
  ["support","to provide evidence for","Statistics support this argument strongly."],
  ["survey","a method of collecting data via questions","A survey of 500 participants was conducted."],
  ["sustain","to maintain over a period","Economic growth must be sustained long-term."],
  ["theory","a set of ideas explaining something","Darwin's theory changed our understanding."],
  ["transfer","to move from one place to another","Knowledge transfers through education."],
  ["unique","being the only one of its kind","Every individual has a unique perspective."],
  ["variable","something that can change","Control variables affect experimental validity."],
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const token = bearer(req);
    if (!token) return json(401, { error: "Unauthorized" });
    const sb = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
    const authSb = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_ANON_KEY"), { auth: { persistSession: false } });
    const { data: auth } = await authSb.auth.getUser(token);
    if (!auth?.user) return json(401, { error: "Unauthorized" });
    const userId = auth.user.id;
    const languageId = await englishLanguageId(sb);
    if (!languageId) return json(500, { error: "English is not configured" });

    const url = new URL(req.url);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = String(url.searchParams.get("action") || body?.action || "due").toLowerCase();

    // Cards written by an older version of this function move into the notebook first.
    await importDrillCards(sb, userId, languageId);

    if (action === "stats") {
      return json(200, await wordStats(sb, userId, languageId));
    }

    if (action === "due") {
      // A learner with no saved words at all starts with the AWL deck, twenty words a day.
      await ensureStarterWords(sb, userId, languageId, AWL_SEED);
      const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit") ?? 20) || 20, 50));
      return json(200, { cards: await dueDrillCards(sb, userId, languageId, limit), deck_id: null });
    }

    if (action === "review") {
      const cardId = String(body?.card_id ?? "").trim();
      if (!cardId) return json(400, { error: "card_id is required" });
      const result = await gradeWord(sb, userId, languageId, cardId, gradeFromQuality(body?.quality));
      if (!result.ok) return json(result.status, { error: result.error });
      return json(200, { ok: true, next_review: result.next_review, interval: result.interval, ease_factor: result.ease_factor });
    }

    if (action === "add_words") {
      const words = Array.isArray(body?.words) ? body.words as Array<{ word?: unknown; definition?: unknown; example?: unknown }> : [];
      if (words.length === 0) return json(400, { error: "words array is required" });
      return json(200, { added: await addDrillWords(sb, userId, languageId, words) });
    }

    return json(404, { error: "Not found" });
  } catch (err) { return json(500, { error: err instanceof Error ? err.message : "Unknown" }); }
});
