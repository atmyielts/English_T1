// After reading: "which of these words were new for you?"
//
// Picks words from a text that a learner at this level may not know: not one
// of the most common English words (in any simple form), not a name, not a
// number, not already saved. The learner ticks the unknown ones and they go
// to My words with the sentence they came from.
//
// Pure module with no imports, so the English app bundles it.

/** The most frequent English words (lemmas). A word in this list, or a simple inflection of one, is never offered. */
const COMMON_WORDS = `
a about above across act add after again against age ago agree air all allow almost alone along already also always am
among an and animal another answer any anyone anything appear apple area arm around arrive art as ask at aunt away baby
back bad bag ball bank be beautiful because become bed been before begin behind believe below best better between big
bike bird birthday black blue boat body book born both bottle box boy bread break breakfast bring brother brown build
bus business busy but buy by cake call camera can car card care carry case cat catch centre chair change cheap child
children choose city class clean clear close clothes coat coffee cold colour come common company computer cook cool
corner cost could country course cousin cover cry cup cut dad dance dark daughter day dead dear decide deep describe
desk different difficult dinner do doctor dog door down draw dream dress drink drive drop dry during each ear early earth
easy eat egg eight either else email end enjoy enough even evening ever every everyone everything example except
expensive eye face fact fall family famous far farm fast father favourite feel few field fight film find fine finish
fire first fish five floor fly follow food foot football for forget form four free friend from front fruit full fun
funny future game garden get girl give glad glass go good great green ground group grow guess hair half hand happen
happy hard hat have he head hear heart help her here high him his history hold holiday home hope horse hospital hot
hotel hour house how however hundred hungry husband i ice idea if important in inside interest interesting into is
island it its job join just keep key kid kind kitchen know lake language large last late later laugh learn leave left
leg less lesson let letter life light like line list listen little live long look lose lot love low lunch machine make
man many map market matter may maybe me meal mean meet member message middle might milk mind minute miss mister money
month more morning most mother mountain mouth move movie much mum music must my name near need never new news next nice
night nine no nobody noise none north nose not note nothing now number of off offer office often oh old on once one
only open or orange order other our out outside over own page paper parent park part party pass past pay pen people
perhaps person phone photo picture piece place plan play please pocket point police poor possible post present pretty
price problem put question quick quiet quite rain read ready real really reason red remember rest restaurant return
rich ride right river road room round rule run sad safe same say school sea season seat second see sell send sentence
seven several shall she ship shirt shoe shop short should show shut sick side simple since sing sister sit six size
skill sky sleep slow small smile snow so some someone something sometimes son song soon sorry sort sound south space
speak special spend sport spring stand star start station stay still stop story street strong student study such sugar
summer sun supper sure surprise swim table take talk tall taxi tea teach teacher team tell ten test than thank that the
theatre their them then there these they thing think third this those though thousand three through ticket time tired
to today together tomorrow tonight too top town toy train travel tree trip true try turn twelve twenty two type uncle
under understand until up us use usually very village visit voice wait wake walk wall want warm wash watch water way we
wear weather week weekend welcome well west what when where which while white who whole why wife will win window winter
wish with without woman wonderful word work world worry would write wrong yeah year yellow yes yesterday yet you young
your zero
able across actually address afraid afternoon airport alright although angry anybody anyway apartment arrange
attention autumn bathroom beach bedroom belong bill board boring borrow bottom bridge brush building cafe careful
centre certain chance cheese chicken church cinema climb clock cloud coast college competition cream culture customer
dangerous date dentist dictionary diet dirty dish doctor double downstairs earn east education electric else empty
engineer evening exam excellent exciting exercise explain fail fair fashion feeling finger flat flower foreign forest
fridge furniture glasses grandfather grandmother guest guitar gym habit healthy heavy hill hobby hole honest ill
information instead invite jacket journey kilometre knife lazy library lift lorry luggage magazine meat medicine
middle mirror mistake mobile modern moment museum nearly neighbour nervous newspaper normal nurse ocean online pair
passport patient pencil pet pilot plane plant plate player pool popular prefer prepare probably programme project
quarter queue radio rather receive recipe relax rent repeat report rice ring roof salad salt sandwich scared screen
shower sign silver singer sleep soft soup spoon square stairs stamp steal storm strange subject suddenly suitcase
sunny supermarket sweet towel tooth tour tourist traffic umbrella uniform university upstairs useful vegetable view
waiter wallet war weekend wet wild wind wing wood worse worst
ability accept according account across activity actor addition advantage advice affect agency allow amount analysis
announce apply approach argue argument article attack attempt audience available avoid aware basic basis behaviour
benefit beyond billion blood bomb brain budget campaign capital career cause cell central century challenge character
charge choice civil claim collection comment community compare concern condition conference consider contain continue
control cost couple create crime cultural current deal death debate decade decision defence degree demand department
design despite detail determine develop development difference direction director discover discuss disease economic
economy edge effect effort election energy environment especially establish event evidence exactly exist expect
experience expert face factor feature figure final financial firm focus force foreign former forward function fund
general goal government growth guy hang health heat herself himself huge human image impact improve include including
increase indeed individual industry institution international involve issue itself kill knowledge land law lead
leader legal level likely local main maintain major manage management manager material measure media medical mention
method military million minister mission model movement natural nature necessary network nor north notice
occur official operation opportunity option organization particular partner peace performance period physical
pick policy political population position positive power practice pressure prevent private process produce product
production professional program property protect provide public purpose quality range rate reach reality recent
recently recognize record reduce reflect region relate relationship religious remain remove represent require
research resource respond response responsibility result reveal risk role scene science scientist security seek
senior sense series serious serve service set share shoot significant similar situation social society source
specific staff stage standard state statement stock strategy structure style success successful suffer suggest
support system task technology term theory thus total tough toward trade traditional treat treatment trial truth
unit value various victim view violence vote whatever whether within worker
`.split(/\s+/).filter(Boolean);

const COMMON = new Set(COMMON_WORDS);

/** Simple inflections back to a base form that may be in the common list. */
const baseForms = (word: string): string[] => {
  const forms = [word];
  const add = (form: string) => form.length > 1 && forms.push(form);
  if (word.endsWith("ies")) add(`${word.slice(0, -3)}y`);
  if (word.endsWith("ied")) add(`${word.slice(0, -3)}y`);
  if (word.endsWith("es")) add(word.slice(0, -2));
  if (word.endsWith("s")) add(word.slice(0, -1));
  if (word.endsWith("ed")) { add(word.slice(0, -2)); add(word.slice(0, -1)); }
  if (word.endsWith("ing")) { add(word.slice(0, -3)); add(`${word.slice(0, -3)}e`); }
  if (/([bdgmnprt])\1(ed|ing)$/.test(word)) add(word.replace(/([bdgmnprt])\1(ed|ing)$/, "$1"));
  if (word.endsWith("ly")) add(word.slice(0, -2));
  if (word.endsWith("ily")) add(`${word.slice(0, -3)}y`);
  if (word.endsWith("er")) { add(word.slice(0, -2)); add(word.slice(0, -1)); }
  if (word.endsWith("est")) { add(word.slice(0, -3)); add(word.slice(0, -2)); }
  if (word.endsWith("n't")) add(word.slice(0, -3));
  return forms;
};

export const isCommonWord = (word: string): boolean => baseForms(word.toLowerCase()).some((form) => COMMON.has(form));

export type HarvestCandidate = { word: string; sentence: string; count: number };

const TOKEN = /[A-Za-z]+(?:['’-][A-Za-z]+)*/g;

/**
 * Up to `limit` words from the text worth asking about, rarest-looking first
 * (longer words, then those used once), in the form they appear. Names are
 * skipped: a capitalised word that never appears in lower case and is not at
 * the start of a sentence. `exclude` holds lower-case words already saved.
 */
export const harvestCandidates = (
  sentences: string[],
  options: { exclude?: Iterable<string>; limit?: number; minLength?: number } = {},
): HarvestCandidate[] => {
  const exclude = new Set([...(options.exclude ?? [])].map((word) => word.toLowerCase()));
  const minLength = options.minLength ?? 4;
  const byKey = new Map<string, { word: string; sentence: string; count: number; lower: boolean; capitalisedInside: boolean }>();
  for (const sentence of sentences) {
    let first = true;
    for (const match of sentence.matchAll(TOKEN)) {
      const raw = match[0].replace(/’/g, "'").replace(/'s$/i, "");
      const key = raw.toLowerCase();
      const startsSentence = first;
      first = false;
      if (key.length < minLength || key.includes("'")) continue;
      const entry = byKey.get(key) ?? { word: key, sentence, count: 0, lower: false, capitalisedInside: false };
      entry.count += 1;
      if (raw === key) entry.lower = true;
      else if (!startsSentence) entry.capitalisedInside = true;
      byKey.set(key, entry);
    }
  }
  return [...byKey.entries()]
    .filter(([key, entry]) => !exclude.has(key) && !isCommonWord(key) && !(entry.capitalisedInside && !entry.lower))
    .map(([, entry]) => entry)
    .sort((a, b) => b.word.length - a.word.length || a.count - b.count || a.word.localeCompare(b.word))
    .slice(0, options.limit ?? 12)
    .map(({ word, sentence, count }) => ({ word, sentence, count }));
};
