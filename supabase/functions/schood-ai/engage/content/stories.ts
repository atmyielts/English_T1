import type { L } from './text.ts';

// E8 Story mode: authored serial arcs with a daily episode, a choice and a
// cliffhanger. Every episode is reading and listening practice with checks; a
// passed check is a verified learning event. The arcs, characters and every
// episode's plot point (`beat`) are authored. Episodes with a `scene` are fully
// written here; the rest are written by AI on request, inside the arc's bible and
// that episode's beat, and pass the same checks before anyone sees them.
//
// Both arcs are original. Product names, places and prices inside the stories are
// fiction (KassaPro, Navro Tech, Kassa24, BookCity) and are not Schood offers.

export type Cefr = 'A1' | 'A2' | 'B1' | 'B2' | 'C1';
export interface StoryOption { id: string; text: string }
export interface StoryQuestion { id: string; mode: 'reading' | 'listening'; prompt: string; options: StoryOption[]; answer: string }
export interface StoryChoice { flag: string; prompt: string; options: { id: string; label: string }[] }
export interface Gloss { en: string; uz: string; ru: string }
export interface StoryEpisode {
  key: string;
  index: number;
  level: Cefr;
  title: string;
  /** The authored plot point; AI-written episodes must tell exactly this. */
  beat: string;
  minutes: number;
  scene?: string;
  /** Short dialogue for the listening check, read aloud by the device's voice. */
  listen?: { speaker: string; line: string }[];
  questions?: StoryQuestion[];
  choice?: StoryChoice;
  /** Opening line chosen by an earlier choice: `${flag}=${option}`. */
  openings?: Record<string, string>;
  cliffhanger?: string;
  words?: Gloss[];
}
export interface StoryArc {
  key: string;
  title: L;
  lead: L;
  levels: string;
  /** What any AI-written episode must respect. */
  bible: string;
  characters: { name: string; role: string }[];
  episodes: StoryEpisode[];
}

const q = (id: string, mode: StoryQuestion['mode'], prompt: string, options: [string, string][], answer: string): StoryQuestion =>
  ({ id, mode, prompt, options: options.map(([optionId, text]) => ({ id: optionId, text })), answer });
const beatOnly = (key: string, index: number, level: Cefr, title: string, beat: string, minutes: number): StoryEpisode => ({ key, index, level, title, beat, minutes });

// --- Tashkent Lights: an English drama from A1 to C1 ------------------------------------------
const TASHKENT: StoryArc = {
  key: 'tashkent_lights',
  title: { en: 'Tashkent Lights', uz: 'Tashkent Lights', ru: 'Tashkent Lights' },
  lead: {
    en: 'Madina moves from Samarkand to work in a small café-bookshop and finds a letter that has waited since 1998. Thirty episodes, from A1 to C1.',
    uz: 'Madina Samarqanddan kichik kafe-kitob do‘koniga ishlash uchun keladi va 1998-yildan beri kutib turgan xatni topadi. A1 dan C1 gacha o‘ttiz qism.',
    ru: 'Мадина переезжает из Самарканда работать в маленькое кафе-книжный и находит письмо, ждавшее с 1998 года. Тридцать эпизодов, от A1 до C1.',
  },
  levels: 'A1–C1',
  bible: [
    'Setting: present-day Tashkent; The Silk Page, a small café and second-hand English bookshop at 12 Navoi Street.',
    'Tone: warm, realistic, gently suspenseful; no violence, romance kept off-page, nothing unsuitable for teenagers.',
    'Through-line: a 1998 letter from Elizabeth Hart to Rustam, a chain called BookCity that wants the shop, and Madina growing from new employee to manager.',
    'Language: each episode stays at its CEFR level (A1: present simple, short sentences; A2: past simple, everyday words; B1: varied tenses, opinions; B2: complex sentences, idiom; C1: nuance, argument).',
  ].join(' '),
  characters: [
    { name: 'Madina Yusupova', role: '19, from Samarkand, new at The Silk Page' },
    { name: 'Rustam aka', role: 'about 70, the owner; studied in London when young' },
    { name: 'Timur', role: '21, a student who works there in the afternoons; runs the Telegram channel' },
    { name: 'Sophie', role: 'about 30, an English teacher from London, a regular' },
    { name: 'Mr A. Karimov', role: 'a BookCity manager' },
    { name: 'Elizabeth Hart', role: '73, Rustam’s friend from London; the "E." of the letter' },
    { name: 'Nigora Saidova', role: 'a Tashkent journalist' },
  ],
  episodes: [
    {
      key: 'e01', index: 1, level: 'A1', title: 'A New City', minutes: 5,
      beat: 'Madina arrives in Tashkent with one bag and the address of her new job.',
      scene: `Madina is nineteen. She is from Samarkand. Today she is in Tashkent for the first time.

The station is big and busy. People walk fast. Madina has one small bag and one piece of paper. On the paper is an address: "The Silk Page, 12 Navoi Street." It is a café and a bookshop. Madina has a new job there.

She is happy, but she is nervous too. She does not know the city. She asks a taxi driver, "How much to Navoi Street?"

"Forty thousand," he says.

Madina smiles. "Thirty?"

He laughs. "OK. Thirty-five."`,
      listen: [
        { speaker: 'Driver', line: 'Where are you from?' },
        { speaker: 'Madina', line: 'I am from Samarkand. I start a new job today.' },
        { speaker: 'Driver', line: 'A new job! Where?' },
        { speaker: 'Madina', line: 'At a café. It is called The Silk Page.' },
        { speaker: 'Driver', line: 'I know it. The owner is an old man. He is very kind.' },
      ],
      questions: [
        q('q1', 'reading', 'Where is Madina from?', [['a', 'Tashkent'], ['b', 'Samarkand'], ['c', 'Bukhara']], 'b'),
        q('q2', 'reading', 'What is The Silk Page?', [['a', 'A hotel'], ['b', 'A café and a bookshop'], ['c', 'A school']], 'b'),
        q('q3', 'listening', 'What does the driver say about the owner?', [['a', 'He is young.'], ['b', 'He is very kind.'], ['c', 'He is from London.']], 'b'),
      ],
      choice: { flag: 'taxi', prompt: 'The driver says thirty-five. What does Madina say?', options: [{ id: 'accept', label: '"OK, thirty-five."' }, { id: 'walk', label: '"No, thank you. I can walk."' }] },
      cliffhanger: 'At 12 Navoi Street the door is open. But the café is dark, and nobody is there.',
      words: [
        { en: 'station', uz: 'vokzal', ru: 'вокзал' }, { en: 'busy', uz: 'gavjum', ru: 'оживлённый' },
        { en: 'address', uz: 'manzil', ru: 'адрес' }, { en: 'nervous', uz: 'hayajonlangan', ru: 'взволнованный' },
      ],
    },
    {
      key: 'e02', index: 2, level: 'A1', title: 'The Silk Page', minutes: 5,
      beat: 'Madina meets Rustam aka and Timur on her first day, and finds an old envelope in a box of books.',
      openings: { 'taxi=walk': 'Madina’s feet hurt. The walk is long.', 'taxi=accept': 'The taxi is fast. Madina is early.' },
      scene: `Madina says, "Hello? Is anybody here?"

A light comes on. An old man comes out of a small room. He has white hair and kind eyes. "You are Madina! Welcome. I am Rustam. Please call me Rustam aka."

Then a young man comes in with two boxes of books. "This is Timur," says Rustam aka. "He is a student. He works here in the afternoon."

Timur puts the boxes on a table. "Hi! Do you like books?"

"Yes, I love books," Madina says.

"Good," says Timur. "Because we have three thousand books and only one shelf for new ones."

Rustam aka laughs. "Tea first. Then work."`,
      listen: [
        { speaker: 'Rustam aka', line: 'Our café opens at nine in the morning.' },
        { speaker: 'Madina', line: 'And when does it close?' },
        { speaker: 'Rustam aka', line: 'At eight in the evening. On Sunday we close at six.' },
        { speaker: 'Timur', line: 'I come at two. Madina, you start at nine, OK?' },
        { speaker: 'Madina', line: 'OK. Nine o’clock every day.' },
      ],
      questions: [
        q('q1', 'reading', 'Who is Rustam aka?', [['a', 'A taxi driver'], ['b', 'The old man at the café'], ['c', 'A student']], 'b'),
        q('q2', 'reading', 'What does Timur bring?', [['a', 'Two boxes of books'], ['b', 'Two cups of tea'], ['c', 'A new shelf']], 'a'),
        q('q3', 'listening', 'When does the café close on Sunday?', [['a', 'At six'], ['b', 'At eight'], ['c', 'At nine']], 'a'),
      ],
      choice: { flag: 'first_task', prompt: 'Rustam aka asks: "Café or books first?"', options: [{ id: 'cafe', label: '"I want to learn the café."' }, { id: 'books', label: '"I want to help with the books."' }] },
      cliffhanger: 'In the first box, under the books, Madina sees an old envelope. There is no stamp. There is only one letter on it: E.',
      words: [
        { en: 'owner', uz: 'ega', ru: 'владелец' }, { en: 'shelf', uz: 'javon', ru: 'полка' },
        { en: 'box', uz: 'quti', ru: 'коробка' }, { en: 'envelope', uz: 'konvert', ru: 'конверт' },
      ],
    },
    beatOnly('e03', 3, 'A1', 'Coffee and Sophie', 'Madina learns to make coffee. Sophie, an English teacher from London, comes every morning and orders the same tea. Madina keeps the envelope in a drawer and does not open it.', 5),
    beatOnly('e04', 4, 'A1', 'A Day Off', 'On Sunday Timur shows Madina the city: the metro, Chorsu Bazaar and plov for lunch. Madina feels at home for the first time.', 5),
    beatOnly('e05', 5, 'A1', 'The Broken Window', 'Someone breaks the café window at night. Nothing is taken, but the drawer with the envelope is open.', 5),
    beatOnly('e06', 6, 'A1', 'Rustam’s Photo', 'Madina finds a photo of a young Rustam in London with a woman. On the back it says: "E. and R., 1998".', 5),
    {
      key: 'e07', index: 7, level: 'A2', title: 'The Letter', minutes: 6,
      beat: 'Madina finally reads the letter: E. asked Rustam in 1998 to keep "the blue book" for her. A BookCity card appears on the step.',
      scene: `The envelope stayed in the drawer for two weeks. Madina didn't want to open it. It wasn't hers. But after the broken window, she was worried.

One evening, after the café closed, she sat at the corner table and opened it. Inside there was one page. The paper was thin and yellow, and the English handwriting was beautiful.

"My dear Rustam," it began. "You were right about the shop. Tashkent needs a place for books and for people. I can't come this year, but I promise I will come one day. Keep the blue book for me. E. London, 1998."

Madina read it three times. A blue book? She looked at the shelves. There were hundreds of blue books.

Then she heard the door. Somebody was standing outside in the dark.`,
      listen: [
        { speaker: 'Timur', line: 'You opened it? Madina, that was private.' },
        { speaker: 'Madina', line: 'I know. I’m sorry. But I was worried after the window.' },
        { speaker: 'Timur', line: 'OK. So what did it say?' },
        { speaker: 'Madina', line: 'It was from someone called E., in 1998, from London.' },
        { speaker: 'Timur', line: 'Rustam aka studied in London when he was young. He told me once. But he never talks about it.' },
      ],
      questions: [
        q('q1', 'reading', 'Why did Madina open the envelope?', [['a', 'She wanted to sell it.'], ['b', 'She was worried after the broken window.'], ['c', 'Rustam aka asked her to.']], 'b'),
        q('q2', 'reading', 'What did E. ask Rustam to keep?', [['a', 'A photo'], ['b', 'The blue book'], ['c', 'The shop key']], 'b'),
        q('q3', 'listening', 'What does Timur know about Rustam aka?', [['a', 'He studied in London.'], ['b', 'He was born in London.'], ['c', 'He writes books.']], 'a'),
      ],
      choice: { flag: 'tell_rustam', prompt: 'Should Madina tell Rustam aka about the letter?', options: [{ id: 'tell', label: 'Yes, tell him today.' }, { id: 'wait', label: 'No, find the blue book first.' }] },
      cliffhanger: 'The person outside was gone. But on the step there was a business card: "BookCity. A. Karimov, Manager."',
      words: [
        { en: 'handwriting', uz: 'qo‘lyozma', ru: 'почерк' }, { en: 'private', uz: 'shaxsiy', ru: 'личный' },
        { en: 'promise', uz: 'va’da bermoq', ru: 'обещать' }, { en: 'worried', uz: 'xavotirda', ru: 'обеспокоенный' },
      ],
    },
    {
      key: 'e08', index: 8, level: 'A2', title: 'Who Is E.?', minutes: 6,
      beat: 'Rustam aka tells Madina about Elizabeth Hart and the blue book he gave to the library. BookCity arrives with a folder.',
      openings: {
        'tell_rustam=tell': 'In the morning, Madina put the letter on the counter in front of Rustam aka.',
        'tell_rustam=wait': 'Madina looked for the blue book for three days. She didn’t find it. On the fourth day, she gave the letter to Rustam aka.',
      },
      scene: `Rustam aka put on his glasses and read the letter slowly. For a long time he didn't say anything. Then he smiled, but his eyes were sad.

"Elizabeth," he said. "Elizabeth Hart. We studied together in London. She loved books more than anything. This shop was her idea, not mine."

"Did she ever come to Tashkent?" Madina asked.

"No. She got married, then she had a family, and life was busy. We wrote letters for a few years. Then we stopped." He looked at the shelves. "I kept the blue book for twenty-five years. Last year I gave it to the library. I thought she was never coming."

Madina felt terrible. "I'm sorry I opened it."

"Don't be sorry," he said. "Maybe it's time somebody did."`,
      listen: [
        { speaker: 'Sophie', line: 'You look tired today. Is everything OK?' },
        { speaker: 'Madina', line: 'I’m fine. Sophie, you’re from London, right?' },
        { speaker: 'Sophie', line: 'Yes, I grew up there. Why?' },
        { speaker: 'Madina', line: 'Is it easy to find a person in London, just with a name?' },
        { speaker: 'Sophie', line: 'With a name? Not easy. But not impossible. What’s the name?' },
      ],
      questions: [
        q('q1', 'reading', 'Whose idea was the shop?', [['a', 'Rustam’s'], ['b', 'Elizabeth’s'], ['c', 'Timur’s']], 'b'),
        q('q2', 'reading', 'Where is the blue book now?', [['a', 'In the drawer'], ['b', 'In the library'], ['c', 'In London']], 'b'),
        q('q3', 'listening', 'What does Sophie say about finding a person in London with only a name?', [['a', 'It’s easy.'], ['b', 'It’s not easy, but not impossible.'], ['c', 'It’s impossible.']], 'b'),
      ],
      choice: { flag: 'search', prompt: 'Who should help Madina find Elizabeth?', options: [{ id: 'sophie', label: 'Sophie: she knows London.' }, { id: 'timur', label: 'Timur: he is good with the internet.' }] },
      cliffhanger: 'That afternoon, Mr Karimov from BookCity walked into the café with a folder and a big smile.',
      words: [
        { en: 'glasses', uz: 'ko‘zoynak', ru: 'очки' }, { en: 'married', uz: 'turmush qurgan', ru: 'в браке' },
        { en: 'library', uz: 'kutubxona', ru: 'библиотека' },
      ],
    },
    beatOnly('e09', 9, 'A2', 'The Folder', 'Mr Karimov offers to buy The Silk Page for BookCity. Rustam aka says he will think about it. Madina is afraid for her job.', 6),
    beatOnly('e10', 10, 'A2', 'The Library', 'Madina and Timur go to the city library to look for the blue book. A kind librarian helps them search the donated books.', 6),
    beatOnly('e11', 11, 'A2', 'The Blue Book', 'They find it: an old blue copy of "Jane Eyre" with notes in the margins in two different handwritings.', 6),
    beatOnly('e12', 12, 'A2', 'Two Handwritings', 'One note in the book has an old London address. Sophie promises to ask a friend in London to help.', 6),
    {
      key: 'e13', index: 13, level: 'B1', title: 'An Offer You Can’t Refuse', minutes: 8,
      beat: 'BookCity makes a final offer to buy the shop; the old books would go to a warehouse. Rustam aka feels unwell and must rest for two weeks.',
      scene: `Mr Karimov came back on Monday, and this time he wasn't smiling as much. He put a contract on the table and turned it so Rustam aka could read it.

"Our final offer," he said. "It's very generous. BookCity will keep the name, The Silk Page, and we'll keep the café. You can retire, Rustam aka. You've worked hard enough."

Madina was cleaning cups behind the counter, but she was listening to every word. The price on the contract was more money than she could imagine. But she knew what "keep the café" meant at BookCity: the same coffee machine, the same muffins and the same bestsellers as in every other BookCity in the country.

Rustam aka didn't pick up the pen. "And the old books?" he asked.

"We'll find a good home for them," Mr Karimov said. "A warehouse, at first."

When he left, Rustam aka sat down heavily. His face was grey. "Madina," he said quietly, "could you call Timur? I don't feel very well."`,
      listen: [
        { speaker: 'Timur', line: 'The doctor says it’s his heart, but it isn’t serious if he rests.' },
        { speaker: 'Madina', line: 'How long does he need to rest?' },
        { speaker: 'Timur', line: 'At least two weeks. No work at all. The doctor was very clear.' },
        { speaker: 'Madina', line: 'Two weeks? Then who is going to run the shop?' },
        { speaker: 'Timur', line: 'Well, I think you already know the answer.' },
      ],
      questions: [
        q('q1', 'reading', 'What did BookCity promise to keep?', [['a', 'The old books and the shelves'], ['b', 'The name and the café'], ['c', 'Rustam aka as the manager']], 'b'),
        q('q2', 'reading', 'What would happen to the old books at first?', [['a', 'They would go to a warehouse.'], ['b', 'They would be sold online.'], ['c', 'They would stay on the shelves.']], 'a'),
        q('q3', 'listening', 'How long must Rustam aka rest?', [['a', 'Two days'], ['b', 'At least two weeks'], ['c', 'A month']], 'b'),
      ],
      choice: { flag: 'contract', prompt: 'Rustam aka asks Madina to keep the contract safe. What does she do?', options: [{ id: 'read', label: 'Read it carefully tonight.' }, { id: 'lock', label: 'Lock it in the drawer and don’t read it.' }] },
      cliffhanger: 'That night Madina got an email from an address she didn’t know. The subject line was just two words: "Dear Madina".',
    },
    {
      key: 'e14', index: 14, level: 'B1', title: 'Madina in Charge', minutes: 8,
      beat: 'Madina runs the shop alone; Timur’s Telegram post brings new people; Sophie’s friend Grace finds an Elizabeth Hart in England.',
      openings: {
        'contract=read': 'Madina had read the contract twice. On page six, in very small letters, she had found something: BookCity could close the café after one year.',
        'contract=lock': 'The contract stayed locked in the drawer. Madina didn’t want to think about it, at least not this week.',
      },
      scene: `Running the shop alone was harder than Madina had expected. On her first day in charge, the coffee machine broke, a delivery of books arrived at the wrong time, and a school group of thirty children came in without warning. By six o'clock she was exhausted.

But some things were going well. Timur had started a Telegram channel for the shop, and he posted a photo of the children reading on the floor. By the evening it had two hundred new followers. People started coming in to say they had seen the photo.

The email from the night before was from a woman called Grace. She was Sophie's friend and worked at a library in London. "Sophie told me about your search," she wrote. "I've found an Elizabeth Hart who taught English literature at a school in Camden until 2015. I can't promise it's the same person, but I've written to the school. I'll let you know."`,
      listen: [
        { speaker: 'Customer', line: 'Excuse me, are you the manager?' },
        { speaker: 'Madina', line: 'Er, yes, for now. How can I help?' },
        { speaker: 'Customer', line: 'I saw your Telegram post. My grandmother had a bookshop like this in Bukhara. It closed years ago.' },
        { speaker: 'Madina', line: 'I’m sorry to hear that.' },
        { speaker: 'Customer', line: 'Don’t let them close this one. Places like this are disappearing.' },
      ],
      questions: [
        q('q1', 'reading', 'What went wrong on Madina’s first day in charge?', [['a', 'The coffee machine broke and a school group arrived without warning.'], ['b', 'Timur didn’t come to work.'], ['c', 'BookCity closed the shop.']], 'a'),
        q('q2', 'reading', 'Who is Grace?', [['a', 'Elizabeth’s daughter'], ['b', 'A friend of Sophie’s who works at a London library'], ['c', 'A BookCity manager']], 'b'),
        q('q3', 'listening', 'Why did the customer come to the shop?', [['a', 'She wanted a job.'], ['b', 'She saw the Telegram post.'], ['c', 'She wanted to sell books.']], 'b'),
      ],
      choice: { flag: 'channel', prompt: 'Timur wants to tell the shop’s story on the channel, including the BookCity offer. Do you agree?', options: [{ id: 'share', label: 'Yes. People should know.' }, { id: 'private', label: 'No. It’s Rustam aka’s private business.' }] },
      cliffhanger: 'Late that night Grace wrote again: "The school replied. Elizabeth Hart lives in Oxford, and she has just asked for your phone number."',
    },
    beatOnly('e15', 15, 'B1', 'Rustam’s Decision', 'At home, Rustam aka tells Madina he may sign: he is old, and the shop loses money every month.', 8),
    beatOnly('e16', 16, 'B1', 'The Numbers', 'Madina and Timur study the accounts and discover that the café makes money; only the books lose it.', 8),
    beatOnly('e17', 17, 'B1', 'A Plan', 'They plan reading evenings and an English club with Sophie to bring more people in.', 8),
    beatOnly('e18', 18, 'B1', 'The First Club Night', 'Forty people come to the first English club night. Mr Karimov is among them, quietly watching.', 8),
    {
      key: 'e19', index: 19, level: 'B2', title: 'The Journalist', minutes: 9,
      beat: 'A journalist writes about The Silk Page; the article spreads and BookCity answers with a statement that hints at a leak.',
      scene: `Nigora Saidova had been writing about the city for twenty years, and she had a reputation for asking the question you least wanted to answer. She arrived at the English club's third evening, ordered black coffee and watched for an hour before she introduced herself.

"I'd like to write about The Silk Page," she told Madina afterwards. "Not a sweet story about books. A story about what happens to a city when every independent place is replaced by a chain."

Madina hesitated. A story like that could bring in hundreds of customers. It could also make BookCity angry, and Rustam aka still hadn't decided about the contract.

"Can I ask you something first?" Madina said. "Why do you care?"

Nigora smiled for the first time. "Because I learned English from a box of second-hand books in a shop that doesn't exist any more. Somebody should have written about it while it was still open."

The interview took two hours. Nigora recorded everything, but she also wrote in a small notebook, underlining things twice. When she left, she said, "I'll send you the quotes before publication. That's my rule. But I won't change the facts."

The article came out on Thursday. By Friday it had been shared eleven thousand times, and BookCity had published a statement of its own.`,
      listen: [
        { speaker: 'Timur', line: 'Listen to this: "BookCity respects independent businesses and has made a fair and voluntary offer."' },
        { speaker: 'Madina', line: 'Voluntary? They came here four times.' },
        { speaker: 'Timur', line: 'It gets better: "We regret that private negotiations have been shared with the press."' },
        { speaker: 'Madina', line: 'But we never mentioned the price. Nigora didn’t either.' },
        { speaker: 'Timur', line: 'Exactly. So who told the press about the negotiations? Because it wasn’t us.' },
      ],
      questions: [
        q('q1', 'reading', 'What kind of story did Nigora want to write?', [['a', 'A sweet story about books'], ['b', 'A story about chains replacing independent places'], ['c', 'A story about Rustam aka’s life in London']], 'b'),
        q('q2', 'reading', 'What was Nigora’s rule?', [['a', 'She never recorded interviews.'], ['b', 'She sent the quotes before publication but didn’t change the facts.'], ['c', 'She let people change the facts.']], 'b'),
        q('q3', 'listening', 'What does Madina point out about the article?', [['a', 'It mentioned the price.'], ['b', 'Neither she nor Nigora mentioned the price.'], ['c', 'BookCity wrote it.']], 'b'),
      ],
      choice: { flag: 'reply', prompt: 'Should The Silk Page respond to BookCity’s statement?', options: [{ id: 'respond', label: 'Yes, with a calm, factual post.' }, { id: 'silent', label: 'No. Let the article speak.' }] },
      cliffhanger: 'On Saturday morning Madina’s phone rang. The number began with +44.',
    },
    {
      key: 'e20', index: 20, level: 'B2', title: 'A Voice from Oxford', minutes: 9,
      beat: 'Elizabeth Hart calls Madina, hears the whole story and decides to come to Tashkent in May.',
      openings: {
        'reply=respond': 'The calm, factual post had worked: even people who loved BookCity’s coffee agreed it was fair.',
        'reply=silent': 'They had said nothing, and somehow the silence had made the article stronger.',
      },
      scene: `The voice on the phone was older than Madina had imagined, but it was clear and quick, with the kind of precise English she had only heard in films.

"Is this Madina? This is Elizabeth Hart. I believe you have a letter of mine."

Madina had practised what to say all night, and now every word had disappeared. "Yes. I'm so sorry. I opened it. I shouldn't have."

"My dear girl, I wrote it twenty-six years ago. If anyone was going to read it, I'm glad it was someone who works in that shop." There was a pause. "Is Rustam well? Grace said something about his heart."

Madina told her everything: the broken window, the contract, the doctor, the article. Elizabeth listened without interrupting, which made it easier to say.

"He was always too proud to ask for help," Elizabeth said finally. "Tell me honestly: if the shop had the right support, could it survive?"

"I think so," Madina said. "The café makes money. The books don't, but people come because of the books. The club is full every week."

"Then here is what I can do. I'm seventy-three, I have a pension, a lot of opinions and far too many books. And I've been promising to visit Tashkent since 1998."`,
      listen: [
        { speaker: 'Madina', line: 'She asked about you first. Before anything else.' },
        { speaker: 'Rustam aka', line: 'She always did that. Asked about other people first.' },
        { speaker: 'Madina', line: 'She wants to come in May, for the book festival.' },
        { speaker: 'Rustam aka', line: 'In May? Madina, I’m not sure I’m ready to see her.' },
        { speaker: 'Madina', line: 'She said you’d say that. She said to tell you she’s coming anyway.' },
      ],
      questions: [
        q('q1', 'reading', 'How did Elizabeth react to Madina opening the letter?', [['a', 'She was angry.'], ['b', 'She was glad it was someone who works in the shop.'], ['c', 'She asked Madina to send it back.']], 'b'),
        q('q2', 'reading', 'According to Madina, which part of the business makes money?', [['a', 'The books'], ['b', 'The café'], ['c', 'Tickets for the club']], 'b'),
        q('q3', 'listening', 'When does Elizabeth want to come?', [['a', 'In May, for the book festival'], ['b', 'Next week'], ['c', 'Never']], 'a'),
      ],
      choice: { flag: 'invite', prompt: 'How should Madina welcome Elizabeth?', options: [{ id: 'club', label: 'Invite her to speak at the English club.' }, { id: 'quiet', label: 'Keep it quiet: a private visit for Rustam aka.' }] },
      cliffhanger: 'Two days later, a letter arrived from BookCity’s lawyers. It was addressed not to Rustam aka, but to Madina.',
    },
    beatOnly('e21', 21, 'B2', 'The Lawyers’ Letter', 'BookCity’s lawyers claim the article damaged their reputation and ask Madina to withdraw her quotes.', 9),
    beatOnly('e22', 22, 'B2', 'Advice', 'Nigora and a lawyer friend explain that true statements are not defamation. Madina keeps her quotes but learns to choose her words carefully.', 9),
    beatOnly('e23', 23, 'B2', 'The Community', 'Customers raise money to repair the window and buy new shelves; Elizabeth sends two hundred of her own books.', 9),
    beatOnly('e24', 24, 'B2', 'Rustam Returns', 'Rustam aka returns to work and asks Madina to become the shop’s official manager.', 9),
    {
      key: 'e25', index: 25, level: 'C1', title: 'The Book Fair', minutes: 10,
      beat: 'Madina is invited to a panel at the Tashkent International Book Fair with BookCity; Elizabeth coaches her; Karimov replaces the BookCity director.',
      scene: `The invitation arrived on heavy cream paper: the Tashkent International Book Fair wanted Madina to speak on a panel called "The Future of Reading in Central Asia". The other speakers were a publisher from Almaty, a professor from Istanbul and the regional director of BookCity.

Madina read the list three times. "They've put me on stage with BookCity," she said. "That's not a coincidence."

"Of course it isn't," said Elizabeth, who had arrived in Tashkent a week earlier and had already reorganised the poetry section twice. "It's theatre. The question is whether you're the villain, the victim or the person with the most interesting thing to say."

Over the following days, Madina drafted and redrafted her opening remarks. Her first version was angry; it listed everything BookCity had done. Her second was so diplomatic that Timur fell asleep halfway through reading it. The third started somewhere else entirely: with the customer whose grandmother had run a bookshop in Bukhara.

"Don't argue with them," Elizabeth advised. "Make them argue with that story. Data persuades people who already agree with you; stories reach the ones who don't."

On the morning of the fair, Madina's hands were shaking as she pinned on her badge. Then she noticed that the programme had changed overnight. BookCity's director had been replaced by someone listed simply as "A. Karimov".`,
      listen: [
        { speaker: 'Elizabeth', line: 'Breathe. Four seconds in, four seconds out. The first sentence matters most.' },
        { speaker: 'Madina', line: 'What if he attacks the article? What if he says we were unfair?' },
        { speaker: 'Elizabeth', line: 'Then you thank him for raising it, and you return to your point. Never defend; redirect.' },
        { speaker: 'Madina', line: 'Redirect. And if I forget everything?' },
        { speaker: 'Elizabeth', line: 'Then you tell them about the grandmother in Bukhara. You will never forget that.' },
      ],
      questions: [
        q('q1', 'reading', 'What does Elizabeth mean when she calls the panel "theatre"?', [['a', 'The panel will take place in a real theatre.'], ['b', 'The organisers have arranged a dramatic contrast between the speakers.'], ['c', 'Madina should act a part instead of telling the truth.']], 'b'),
        q('q2', 'reading', 'How does Madina’s third draft begin?', [['a', 'With a list of BookCity’s actions'], ['b', 'With a diplomatic summary of the book market'], ['c', 'With the story of the customer’s grandmother']], 'c'),
        q('q3', 'listening', 'What is Elizabeth’s advice if Karimov attacks the article?', [['a', 'Defend every point in detail.'], ['b', 'Thank him and return to her point.'], ['c', 'Leave the stage.']], 'b'),
      ],
      choice: { flag: 'opening', prompt: 'How will Madina open her talk?', options: [{ id: 'story', label: 'With the grandmother’s bookshop in Bukhara.' }, { id: 'question', label: 'With a question: "When did you last buy a book from a person, not a chain?"' }] },
      cliffhanger: 'Karimov took the microphone first, looked straight at Madina and said, "Before we start, I owe Ms Yusupova an apology."',
    },
    {
      key: 'e26', index: 26, level: 'C1', title: 'Terms and Conditions', minutes: 10,
      beat: 'Karimov admits BookCity’s part in the window and the leak, then proposes a partnership; Madina negotiates its terms.',
      openings: {
        'opening=story': 'After the panel, three people found Madina just to tell her about bookshops their own grandparents had loved.',
        'opening=question': 'Her question had silenced the hall for a full five seconds, and the publisher from Almaty had quoted it in his own answer.',
      },
      scene: `Karimov's apology had been short and surprisingly specific: the broken window, he admitted, had been the work of a contractor BookCity had hired to "assess the premises" at night, and the leak to the press had come from his own office. He had left the regional team and was now, he said, "responsible for partnerships".

A week later he sat at the corner table of The Silk Page with a very different folder. BookCity no longer wanted to buy the shop. Instead it proposed a partnership: The Silk Page would remain independent, BookCity would stock a "Silk Page Selection" shelf in its forty stores, and the two would co-host a national reading club for teenagers.

"It's a good offer," Rustam aka said quietly, in Uzbek. "Perhaps too good."

Madina read every clause. The selection shelf was generous, but clause nine gave BookCity the right to use the shop's name and logo "in any marketing materials, without limitation". Clause twelve allowed either side to end the agreement with a month's notice, which meant BookCity could build a brand on The Silk Page's reputation and simply walk away.

"We're interested," Madina said, choosing her words carefully, "but not on these terms. We'd want approval of any use of our name, and a minimum term of two years. In exchange, we can offer the club's programme, which we've already tested, and Ms Hart as a guest author for the launch."

Karimov raised his eyebrows. "You've become a negotiator."

"I've become a manager," she said. "It turns out the two are surprisingly similar."`,
      listen: [
        { speaker: 'Timur', line: 'Two years minimum. Did you plan that, or did you just say it?' },
        { speaker: 'Madina', line: 'Elizabeth told me: never accept the first version of anything, especially if it’s flattering.' },
        { speaker: 'Rustam aka', line: 'In 1998 she said the same to me about the lease for this shop.' },
        { speaker: 'Timur', line: 'So what happens now?' },
        { speaker: 'Madina', line: 'Now we wait. The side that needs the deal more usually calls first.' },
      ],
      questions: [
        q('q1', 'reading', 'Who was responsible for the broken window?', [['a', 'A customer from the club'], ['b', 'A contractor BookCity had hired'], ['c', 'Timur, by accident']], 'b'),
        q('q2', 'reading', 'What was Madina’s main concern about clause nine?', [['a', 'It limited the number of shelves.'], ['b', 'It let BookCity use the shop’s name without approval.'], ['c', 'It required a two-year term.']], 'b'),
        q('q3', 'listening', 'What does Madina expect to happen next?', [['a', 'Rustam aka will sign tomorrow.'], ['b', 'The side that needs the deal more will call first.'], ['c', 'BookCity will withdraw the offer.']], 'b'),
      ],
      choice: { flag: 'deal', prompt: 'Karimov calls back: he accepts the approval clause but offers one year, not two. What does Madina do?', options: [{ id: 'counter', label: 'Counter-offer: eighteen months, with a review.' }, { id: 'hold', label: 'Hold firm at two years.' }] },
      cliffhanger: 'Before Madina could answer, Elizabeth came in holding the blue book. "Rustam," she said, "I think it’s time you read the last page."',
    },
    beatOnly('e27', 27, 'C1', 'The Last Page', 'The last page of the blue book holds a note from 1998 that changes how Rustam aka understands the past.', 10),
    beatOnly('e28', 28, 'C1', 'Signing Day', 'The partnership is signed on terms Madina negotiated, and the national reading club for teenagers is launched.', 10),
    beatOnly('e29', 29, 'C1', 'Another City', 'A café owner from Namangan asks Madina to help her open a shop like The Silk Page.', 10),
    beatOnly('e30', 30, 'C1', 'Tashkent Lights', 'A year after she arrived, Madina writes her own letter and hides it in a book for the person who will come after her.', 10),
  ],
};

// --- First Month on the Floor: your first month as a sales rep (Sales Coach, B1) ----------------
const SALES: StoryArc = {
  key: 'first_month_sales',
  title: { en: 'First Month on the Floor', uz: 'First Month on the Floor', ru: 'First Month on the Floor' },
  lead: {
    en: 'Your first month as a sales rep in Tashkent: a target, a mentor, a rival, a café with a long queue and a competitor at half the price. Twenty working days at B1.',
    uz: 'Toshkentda savdo vakili sifatidagi birinchi oyingiz: reja, ustoz, raqib, uzun navbatli kafe va yarim narxdagi raqobatchi. B1 darajasida yigirma ish kuni.',
    ru: 'Ваш первый месяц в продажах в Ташкенте: план, наставник, соперница, кафе с длинной очередью и конкурент вдвое дешевле. Двадцать рабочих дней уровня B1.',
  },
  levels: 'B1',
  bible: [
    'Setting: present-day Tashkent. "You" are a new sales representative at Navro Tech, selling KassaPro, a cash-register and stock app for small shops and cafés. All names are fiction.',
    'Second person, present tense. Tone: practical, encouraging, realistic about rejection; never manipulative sales tricks.',
    'Each day teaches one real sales skill (prospecting, cold-call opening, discovery, value, objections, closing, follow-up, negotiation, DM selling) through what happens, never through a lecture.',
    'Language: B1, clear sentences, workplace vocabulary explained by context.',
  ].join(' '),
  characters: [
    { name: 'You', role: 'a new sales representative at Navro Tech' },
    { name: 'Dilfuza', role: 'your sales manager' },
    { name: 'Bekzod', role: 'your mentor, the top rep for two years' },
    { name: 'Kamila', role: 'another new rep, a rival who started a week earlier' },
    { name: 'Mrs Nodira', role: 'owner of Café Nodira in Chilanzar' },
    { name: 'Javlon', role: 'Mrs Nodira’s assistant at the till' },
    { name: 'Mr Sardor', role: 'owner of a hardware store' },
    { name: 'Ulugbek', role: 'Navro Tech’s technical lead' },
  ],
  episodes: [
    {
      key: 'd01', index: 1, level: 'B1', title: 'Day 1: The Badge', minutes: 8,
      beat: 'You start at Navro Tech, get a target of ten demos and three customers, meet Bekzod and Kamila, and receive Chilanzar as your territory.',
      scene: `Your badge says "Sales Representative" and your photo looks terrible, but you don't care. It's your first day at Navro Tech, and you're going to sell KassaPro: a cash-register and stock app for small shops and cafés in Tashkent.

At nine o'clock your manager, Dilfuza, gives you a coffee and a number. "Ten demos and three new customers this month," she says. "A demo is when the owner actually sees KassaPro working in their shop. Calls don't count. Messages don't count. Demos count."

She introduces you to Bekzod, who has been the top rep for two years. He's wearing old trainers and has a phone in each hand. "Rule one," he says, without looking up. "Customers don't buy apps. They buy fewer problems. Find the problem first."

Across the room another new rep, Kamila, is already making calls. She started last week and she already has two demos booked.

"Don't worry about her," Bekzod says. "Worry about your list. Have you got your list yet?"

You haven't.`,
      listen: [
        { speaker: 'Dilfuza', line: 'KassaPro costs two hundred thousand a month for one shop.' },
        { speaker: 'You', line: 'Is there a free trial?' },
        { speaker: 'Dilfuza', line: 'Fourteen days. But don’t offer it in the first call. Offer it at the demo.' },
        { speaker: 'You', line: 'Why not in the first call?' },
        { speaker: 'Dilfuza', line: 'Because a free trial on the phone sounds desperate. At the demo it sounds like confidence.' },
      ],
      questions: [
        q('q1', 'reading', 'What counts towards your target?', [['a', 'Calls and messages'], ['b', 'Demos where the owner sees KassaPro working'], ['c', 'Emails to managers']], 'b'),
        q('q2', 'reading', 'What is Bekzod’s rule one?', [['a', 'Customers buy fewer problems, not apps.'], ['b', 'Always offer a discount.'], ['c', 'Call the biggest shops first.']], 'a'),
        q('q3', 'listening', 'When should you offer the free trial?', [['a', 'In the first call'], ['b', 'At the demo'], ['c', 'Never']], 'b'),
      ],
      choice: { flag: 'mentor', prompt: 'Bekzod offers to let you listen to his calls this afternoon. Kamila invites you to lunch to share her list. Which do you choose?', options: [{ id: 'bekzod', label: 'Listen to Bekzod’s calls.' }, { id: 'kamila', label: 'Have lunch with Kamila.' }] },
      cliffhanger: 'At five o’clock Dilfuza puts a folder on your desk. "Your territory," she says. "Chilanzar. Nobody has sold anything there in six months."',
    },
    {
      key: 'd02', index: 2, level: 'B1', title: 'Day 2: The List', minutes: 8,
      beat: 'Instead of calling two hundred numbers, you walk Chilanzar and choose twenty businesses with a problem you can see. Café Nodira is first.',
      openings: {
        'mentor=bekzod': 'Yesterday you heard Bekzod make eleven calls. He spoke for less than half of each one.',
        'mentor=kamila': 'At lunch Kamila showed you her list. It was long, neat, and full of shops that had already said no to Navro Tech.',
      },
      scene: `Chilanzar is huge: markets, pharmacies, cafés, phone shops, small supermarkets. The folder from Dilfuza has a list of two hundred businesses. Most of the phone numbers are old.

Bekzod looks at the folder and shakes his head. "Don't call two hundred places. Choose twenty. Choose the ones with a problem you can see."

"How can I see a problem from a list?"

"You can't. Go and look."

So you spend the day walking. You notice a café with a long queue at the till and only one person taking money. A hardware store where the owner writes every sale in a notebook. A pharmacy with an expensive new cash register that nobody seems to use.

By the evening you have twenty names, and next to each one you've written a single sentence: the problem you saw.

Number one on your list: Café Nodira. Queue too long. Owner always at the till.`,
      listen: [
        { speaker: 'Bekzod', line: 'So, what’s on your list?' },
        { speaker: 'You', line: 'Twenty shops. The first one is a café with a long queue.' },
        { speaker: 'Bekzod', line: 'Good. Who do you talk to there?' },
        { speaker: 'You', line: 'The owner, I think. Mrs Nodira.' },
        { speaker: 'Bekzod', line: 'Don’t think. Find out. Owners decide. Assistants protect owners.' },
      ],
      questions: [
        q('q1', 'reading', 'Why does Bekzod tell you to choose twenty places, not two hundred?', [['a', 'Because Chilanzar is small'], ['b', 'Because you should focus on places with a problem you can see'], ['c', 'Because Dilfuza only wants twenty demos']], 'b'),
        q('q2', 'reading', 'What did you notice at the hardware store?', [['a', 'The owner writes every sale in a notebook.'], ['b', 'There was a long queue.'], ['c', 'The cash register was broken.']], 'a'),
        q('q3', 'listening', 'According to Bekzod, who decides?', [['a', 'Assistants'], ['b', 'Owners'], ['c', 'Customers']], 'b'),
      ],
      choice: { flag: 'approach', prompt: 'Tomorrow, how will you first contact Café Nodira?', options: [{ id: 'call', label: 'Call the café.' }, { id: 'visit', label: 'Walk in at a quiet time.' }] },
      cliffhanger: 'Your phone buzzes. A message from Kamila: "I heard you got Chilanzar. I used to have Chilanzar. Good luck with Café Nodira. You’ll need it."',
    },
    {
      key: 'd03', index: 3, level: 'B1', title: 'Day 3: The First Call', minutes: 8,
      beat: 'Your first cold call reaches Javlon, the assistant; with one good question you learn that the owner hates working at the till.',
      openings: {
        'approach=call': 'You decided to call. Your hands were cold when you dialled.',
        'approach=visit': 'You went at three o’clock, the quietest hour, but the owner wasn’t there. A young man at the till gave you the café’s number and said, "Call. She never talks to people who just walk in."',
      },
      scene: `A young man answers. "Café Nodira, Javlon speaking."

You remember Bekzod's advice: say who you are, why you're calling and ask a question, all in fifteen seconds.

"Hello, Javlon. I'm calling from Navro Tech. I walked past yesterday and saw a long queue at lunchtime. Is that a normal day for you?"

There's a pause. "Every day," Javlon says. "Why?"

"We help cafés take payments faster. Is Mrs Nodira the right person to talk to about the till?"

"She's busy. Send something by Telegram and she'll look at it."

This is the moment Bekzod warned you about. If you send a brochure, it will disappear.

"Of course," you say. "Before I do, can I ask one quick thing, so I send the right information? How many people work at the till at lunchtime?"

"Just one. Usually her," Javlon says. "She hates it, actually. She wants to be in the kitchen."`,
      listen: [
        { speaker: 'Bekzod', line: 'So? Did you get the owner?' },
        { speaker: 'You', line: 'No. I got Javlon, her assistant.' },
        { speaker: 'Bekzod', line: 'And what did Javlon give you?' },
        { speaker: 'You', line: 'The owner hates working at the till. She wants to be in the kitchen.' },
        { speaker: 'Bekzod', line: 'That’s not nothing. That’s the whole sale. Now you need ten minutes with her.' },
      ],
      questions: [
        q('q1', 'reading', 'What should you do in the first fifteen seconds, according to Bekzod?', [['a', 'Say who you are, why you’re calling, and ask a question.'], ['b', 'Explain every feature of KassaPro.'], ['c', 'Ask for the owner immediately.']], 'a'),
        q('q2', 'reading', 'Why didn’t you simply send a brochure by Telegram?', [['a', 'You didn’t have one.'], ['b', 'It would probably disappear.'], ['c', 'Javlon doesn’t use Telegram.']], 'b'),
        q('q3', 'listening', 'Why does Bekzod say the call was valuable?', [['a', 'You booked a demo.'], ['b', 'You learned the owner’s real problem.'], ['c', 'Javlon agreed to buy.']], 'b'),
      ],
      choice: { flag: 'next_step', prompt: 'How will you ask for ten minutes with Mrs Nodira?', options: [{ id: 'javlon', label: 'Ask Javlon to book a time for you.' }, { id: 'message', label: 'Send Mrs Nodira a short message about the kitchen.' }] },
      cliffhanger: 'An hour later a voice message arrives from an unknown number. A woman says: "You’re the one who asked about my queue? Come tomorrow at four. You have ten minutes."',
    },
    {
      key: 'd04', index: 4, level: 'B1', title: 'Day 4: Questions First', minutes: 8,
      beat: 'In ten minutes with Mrs Nodira you ask questions instead of pitching, and together you find what the queue really costs her.',
      openings: { 'next_step=javlon': 'Javlon had kept his word.', 'next_step=message': 'Your message had been three lines long. She had answered in three minutes.' },
      scene: `Mrs Nodira is small, fast and has flour on her sleeves. She gives you exactly ten minutes and a cup of tea you don't have time to drink.

You want to show her the app. You want to talk about reports, stock alerts and the beautiful dashboard. Instead, you ask questions.

"How long does a customer wait at lunchtime?" About twelve minutes, she says. "What happens when they wait that long?" Some leave; office workers only have an hour. "How do you count stock at the end of the day?" With a notebook and a calculator, after closing, until eleven at night.

"If you didn't have to stand at the till," you ask, "where would you be?"

"In the kitchen," she says immediately. "That's why people come here. My samsa, not my cash register."

You write everything down. You have spoken for maybe two of the ten minutes. Bekzod would be proud.

Then she looks at her watch. "Your ten minutes are finished. So what are you actually selling?"`,
      listen: [
        { speaker: 'Mrs Nodira', line: 'On a good day we have about a hundred and fifty customers at lunch.' },
        { speaker: 'You', line: 'And how many leave because of the queue?' },
        { speaker: 'Mrs Nodira', line: 'Maybe twenty. Maybe more. I don’t count the ones who leave.' },
        { speaker: 'You', line: 'If each one spends around thirty thousand...' },
        { speaker: 'Mrs Nodira', line: 'Then that’s six hundred thousand a day walking out of the door. I never thought about it like that.' },
      ],
      questions: [
        q('q1', 'reading', 'What does Mrs Nodira do at the end of each day?', [['a', 'She counts stock with a notebook and a calculator.'], ['b', 'She checks the app’s reports.'], ['c', 'She goes home at six.']], 'a'),
        q('q2', 'reading', 'What did you do instead of showing the app?', [['a', 'You asked questions about her problems.'], ['b', 'You gave her a brochure.'], ['c', 'You offered a discount.']], 'a'),
        q('q3', 'listening', 'How much money might be leaving each day because of the queue?', [['a', 'Thirty thousand'], ['b', 'Six hundred thousand'], ['c', 'A hundred and fifty thousand']], 'b'),
      ],
      choice: { flag: 'answer', prompt: 'She asks what you are selling. How do you answer?', options: [{ id: 'short', label: '"More time in your kitchen. Can I show you in a demo on Friday?"' }, { id: 'full', label: 'Explain the app’s main features, then ask for a demo.' }] },
      cliffhanger: 'She agrees to a demo on Friday. Then she adds: "Bring the price. If it’s like the last company, you won’t get past the door."',
    },
    {
      key: 'd05', index: 5, level: 'B1', title: 'Day 5: The Price Question', minutes: 8,
      beat: 'Bekzod and Dilfuza prepare you for the price objection: use her numbers, never defend the price, never discount first.',
      openings: {
        'answer=short': 'Your short answer had made her laugh. "Finally, a salesperson who doesn’t talk for an hour."',
        'answer=full': 'She had listened to your list of features with polite boredom and agreed to the demo, you suspected, mostly to end the conversation.',
      },
      scene: `You spend Thursday preparing for the price question. Two hundred thousand a month sounds like a lot to a café owner who counts every thousand.

Bekzod draws a line down a piece of paper. On the left he writes "200,000". On the right he writes "?". "Your job," he says, "is to fill in the right side with her numbers, not yours."

You think about your meeting. Twenty customers leaving every lunchtime. Mrs Nodira at the till instead of in the kitchen. Three hours every night with a notebook.

"Never defend the price," Bekzod says. "If she says it's expensive, agree that it's a real cost. Then ask what the problem is costing her now."

Dilfuza walks past and hears you practising. "One more thing," she says. "Don't drop the price in the first minute. If you offer a discount before she asks for one, you're telling her the price was never real."

That evening you write a one-page summary of Café Nodira's problems, in her own words, and you print it twice.`,
      listen: [
        { speaker: 'Bekzod', line: 'Two hundred thousand? That’s too expensive for a small café.' },
        { speaker: 'You', line: 'I understand. It’s a real cost. Can I ask how many customers leave the queue on a busy day?' },
        { speaker: 'Bekzod', line: 'Maybe twenty.' },
        { speaker: 'You', line: 'And each one spends about thirty thousand. So the queue costs around six hundred thousand a day.' },
        { speaker: 'Bekzod', line: 'Good. Now stop talking. Let her do the maths.' },
      ],
      questions: [
        q('q1', 'reading', 'What does Bekzod want on the right side of the paper?', [['a', 'The discount'], ['b', 'The café’s own numbers'], ['c', 'KassaPro’s features']], 'b'),
        q('q2', 'reading', 'Why shouldn’t you offer a discount early, according to Dilfuza?', [['a', 'Discounts are not allowed.'], ['b', 'It suggests the price was never real.'], ['c', 'Mrs Nodira doesn’t like discounts.']], 'b'),
        q('q3', 'listening', 'What does Bekzod tell you to do after giving the numbers?', [['a', 'Offer the free trial.'], ['b', 'Stop talking and let her do the maths.'], ['c', 'Show the dashboard.']], 'b'),
      ],
      choice: { flag: 'summary', prompt: 'Who is the second copy of the summary for?', options: [{ id: 'nodira', label: 'For Mrs Nodira to keep.' }, { id: 'javlon', label: 'For Javlon, who will use the app every day.' }] },
      cliffhanger: 'On Friday morning, an hour before the demo, Mrs Nodira texts: "Something came up. Let’s talk next week. I’ll think about it."',
    },
    {
      key: 'd06', index: 6, level: 'B1', title: 'Day 6: “I’ll Think About It”', minutes: 8,
      beat: 'You ask what she wants to think about and discover the real worry: her nephew says such apps sell sales data. You offer facts, not pressure.',
      openings: {
        'summary=javlon': 'Javlon had liked the one-page summary so much that he had stuck it on the kitchen wall.',
        'summary=nodira': 'Mrs Nodira’s copy of the summary was still in your bag.',
      },
      scene: `"I'll think about it" is the sentence every salesperson hates. Kamila says it means no. Bekzod says it means you haven't found the real problem yet.

You don't argue and you don't beg. You reply: "Of course. So I can prepare the right thing for next week, may I ask what you'd like to think about? Is it the price, the timing, or something else?"

Ten minutes later she calls. It isn't the price. Her nephew, who "knows computers", has told her that apps like KassaPro steal your sales data and sell it.

Now you understand. She isn't saying no to the app. She's afraid of something you can actually answer.

You don't laugh, and you don't tell her that her nephew is wrong. You say: "That's a very fair worry. Your data belongs to you. I'll bring our data agreement on paper, and your nephew is welcome to come to the demo and ask anything he wants."

"He'll ask a lot," she warns.

"Good," you say. "Tuesday at four?"`,
      listen: [
        { speaker: 'Kamila', line: 'Did Nodira cancel? She cancelled on me too, in March.' },
        { speaker: 'You', line: 'She didn’t cancel. She moved it to Tuesday.' },
        { speaker: 'Kamila', line: 'Really? What did you say to her?' },
        { speaker: 'You', line: 'I asked what she wanted to think about.' },
        { speaker: 'Kamila', line: 'That’s it? I just sent her a discount.' },
      ],
      questions: [
        q('q1', 'reading', 'According to Bekzod, what does "I’ll think about it" usually mean?', [['a', 'The customer will buy next week.'], ['b', 'You haven’t found the real problem yet.'], ['c', 'The price is too low.']], 'b'),
        q('q2', 'reading', 'What was Mrs Nodira really worried about?', [['a', 'The monthly price'], ['b', 'Her sales data being taken and sold'], ['c', 'The time needed for training']], 'b'),
        q('q3', 'listening', 'What did Kamila do when Mrs Nodira cancelled in March?', [['a', 'She asked a question.'], ['b', 'She sent a discount.'], ['c', 'She visited the café.']], 'b'),
      ],
      choice: { flag: 'nephew', prompt: 'How will you prepare for the nephew?', options: [{ id: 'expert', label: 'Bring Navro Tech’s technical lead to the demo.' }, { id: 'paper', label: 'Bring the data agreement and answer the questions yourself.' }] },
      cliffhanger: 'On Monday Dilfuza calls you into her office. "A competitor called Kassa24 is offering cafés in Chilanzar the same thing for half the price," she says. "Starting today."',
    },
    {
      key: 'd07', index: 7, level: 'B1', title: 'Day 7: The Competitor', minutes: 8,
      beat: 'A competitor at half the price; instead of discounting you learn what it does not do and prepare questions that show the difference.',
      openings: {
        'nephew=expert': 'The technical lead, Ulugbek, had agreed to come on Tuesday on one condition: nobody would ask him to wear a tie.',
        'nephew=paper': 'You had read the data agreement three times. You could now explain every clause in simple words.',
      },
      scene: `Kassa24 costs a hundred thousand a month. Its website is bright and its ads are everywhere in Chilanzar. By lunchtime two of the twenty shops on your list have told you they're "looking at other options".

Your first instinct is to ask Dilfuza for a discount. Her answer is short: "No. Find out what they don't do."

So you do your homework. You download Kassa24 and try it as a customer would. It's cheap because it does less: no stock alerts, no support in Uzbek, and the free version prints the Kassa24 logo on every receipt. Support is a chat that answers in two days.

Bekzod nods. "Never say anything bad about a competitor. People defend things they've chosen. Ask questions instead. What's important to you in support? How fast do you need an answer if the till stops at lunchtime? Let them see the difference themselves."

You write three questions. Then you remember Mrs Nodira's nephew, and you add a fourth: "Where is your data stored, and who can see it?"`,
      listen: [
        { speaker: 'Mr Sardor', line: 'Kassa24 is half your price. Why should I pay double?' },
        { speaker: 'You', line: 'Good question. If the till stops on a busy Saturday, how quickly do you need help?' },
        { speaker: 'Mr Sardor', line: 'Immediately. Saturday is my biggest day.' },
        { speaker: 'You', line: 'Our support answers by phone in Uzbek in under fifteen minutes, seven days a week. Is that something you’d want to check with Kassa24 too?' },
        { speaker: 'Mr Sardor', line: 'Hm. I will check. Call me on Thursday.' },
      ],
      questions: [
        q('q1', 'reading', 'Why is Kassa24 cheaper, according to your research?', [['a', 'It is newer.'], ['b', 'It does less.'], ['c', 'The government pays for it.']], 'b'),
        q('q2', 'reading', 'What is Bekzod’s advice about competitors?', [['a', 'Show the customer the competitor’s weaknesses directly.'], ['b', 'Never criticise them; ask questions that show the difference.'], ['c', 'Always match their price.']], 'b'),
        q('q3', 'listening', 'Why is fast support important to Mr Sardor?', [['a', 'Saturday is his biggest day.'], ['b', 'He doesn’t speak Russian.'], ['c', 'His shop is open at night.']], 'a'),
      ],
      choice: { flag: 'kassa24', prompt: 'Before Tuesday’s demo, Mrs Nodira mentions Kassa24. What do you do?', options: [{ id: 'ask', label: 'Ask her what matters most to her in support.' }, { id: 'compare', label: 'Send her a comparison table.' }] },
      cliffhanger: 'Tuesday, 3:55 p.m. You walk into Café Nodira with your laptop and a tablet. The nephew is already at the corner table with a notebook full of questions, and the café’s Wi-Fi is down.',
    },
    {
      key: 'd08', index: 8, level: 'B1', title: 'Day 8: The Demo', minutes: 8,
      beat: 'With no Wi-Fi, you run the demo offline with real customers; honest answers win over the nephew and the free trial starts.',
      openings: {
        'kassa24=ask': 'She had told you that support mattered more than anything: "When something breaks, I want a person, not a robot."',
        'kassa24=compare': 'She hadn’t opened your comparison table. Javlon told you she never reads tables.',
      },
      scene: `No Wi-Fi. Your demo was planned online: the dashboard, the live reports, the stock alerts. For a moment your mind goes completely empty.

Then you remember something Ulugbek said: KassaPro works offline and syncs later. You switch the tablet to offline mode, put it on the counter and ask Javlon to serve the next three real customers with it while Mrs Nodira watches.

The first payment takes Javlon a minute because he's nervous. The second takes twenty seconds. The third, fifteen. The queue, which had five people in it, disappears.

The nephew, Aziz, asks twelve questions about data. You answer ten of them with the agreement on the table, and for the other two you say honestly: "I don't know. I'll find out and send you the answer in writing today."

That honesty, you'll learn later, is what made Aziz tell his aunt, "It's fine. They're not hiding anything."

Mrs Nodira looks at the empty queue, then at you. "Fourteen days free?" she asks.

"Fourteen days," you say. "And if Javlon doesn't love it by day ten, I'll come and take it away myself."`,
      listen: [
        { speaker: 'Dilfuza', line: 'I heard the Wi-Fi was down. How did the demo go?' },
        { speaker: 'You', line: 'We did it offline, with real customers.' },
        { speaker: 'Dilfuza', line: 'Real customers? That’s either very brave or very lucky.' },
        { speaker: 'You', line: 'A bit of both. She started the free trial.' },
        { speaker: 'Dilfuza', line: 'Good. Now the hard part starts: day ten. Most trials die quietly on day ten.' },
      ],
      questions: [
        q('q1', 'reading', 'How did you solve the Wi-Fi problem?', [['a', 'You used your phone’s internet.'], ['b', 'You switched to offline mode and served real customers.'], ['c', 'You postponed the demo.']], 'b'),
        q('q2', 'reading', 'What did you do with the two questions you couldn’t answer?', [['a', 'You guessed.'], ['b', 'You promised a written answer the same day.'], ['c', 'You changed the subject.']], 'b'),
        q('q3', 'listening', 'What does Dilfuza warn you about?', [['a', 'Most trials fail quietly on day ten.'], ['b', 'The customer will ask for a discount.'], ['c', 'Kassa24 will call the café.']], 'a'),
      ],
      choice: { flag: 'trial', prompt: 'How will you make sure the trial doesn’t "die quietly on day ten"?', options: [{ id: 'checkin', label: 'Book a ten-minute check-in with Javlon on day five.' }, { id: 'training', label: 'Offer a short training for all café staff on day two.' }] },
      cliffhanger: 'On day nine Javlon calls. He sounds worried. "Something is wrong with the stock numbers," he says. "KassaPro says we have minus forty samsas."',
    },
    beatOnly('d09', 9, 'B1', 'Day 9: Minus Forty Samsas', 'The stock problem turns out to be a set-up mistake. You fix it in person and learn to train the people who use the app every day.', 8),
    beatOnly('d10', 10, 'B1', 'Day 10: The Decision', 'At the end of the trial you ask Mrs Nodira clearly for her decision instead of waiting for her to offer it.', 8),
    beatOnly('d11', 11, 'B1', 'Day 11: First Signature', 'Your first customer signs. Bekzod shows you how to ask a happy customer for an introduction.', 8),
    beatOnly('d12', 12, 'B1', 'Day 12: The Referral', 'Mrs Nodira introduces you to her cousin, who owns three bakeries.', 8),
    beatOnly('d13', 13, 'B1', 'Day 13: Three Bakeries', 'A bigger deal means a negotiation: the cousin asks for a discount for three shops.', 8),
    beatOnly('d14', 14, 'B1', 'Day 14: Trade, Don’t Give', 'You agree a discount only in exchange for a one-year contract and a case study.', 8),
    beatOnly('d15', 15, 'B1', 'Day 15: Selling in Messages', 'An Instagram clothes shop messages you. You learn to sell in short, clear messages with one question each.', 8),
    beatOnly('d16', 16, 'B1', 'Day 16: The Lost Deal', 'Mr Sardor chooses Kassa24. You ask him honestly why, and learn something you will use for years.', 8),
    beatOnly('d17', 17, 'B1', 'Day 17: Kamila', 'Kamila asks for your help. You discover that her two early demos never became customers, and you share what you learned.', 8),
    beatOnly('d18', 18, 'B1', 'Day 18: The Chain', 'The manager of a small supermarket chain agrees to a meeting: the biggest opportunity of your month.', 8),
    beatOnly('d19', 19, 'B1', 'Day 19: The Big Meeting', 'You run a meeting with four decision-makers, handle a hard objection about training, and secure a one-store pilot.', 8),
    beatOnly('d20', 20, 'B1', 'Day 20: The Review', 'Dilfuza reviews your month with you: demos, customers, lost deals and the plan for month two.', 8),
  ],
};

export const STORY_ARCS: StoryArc[] = [TASHKENT, SALES];
export const arcByKey = (key: string) => STORY_ARCS.find((arc) => arc.key === key) ?? null;
export const PASS_RATIO = 2 / 3;

/** Every authored episode must have checks that can be passed and a key inside its options. */
export function storyProblems(): string[] {
  const problems: string[] = [];
  for (const arc of STORY_ARCS) {
    arc.episodes.forEach((episode, index) => {
      const where = `${arc.key}/${episode.key}`;
      if (episode.index !== index + 1) problems.push(`${where}: index ${episode.index}`);
      if (!episode.beat) problems.push(`${where}: no beat`);
      if (!episode.scene) return;
      if (!episode.questions || episode.questions.length < 3) problems.push(`${where}: needs 3 questions`);
      if (!episode.listen?.length) problems.push(`${where}: no listening part`);
      if (!episode.questions?.some((question) => question.mode === 'listening')) problems.push(`${where}: no listening check`);
      const ids = new Set<string>();
      for (const question of episode.questions ?? []) {
        if (ids.has(question.id)) problems.push(`${where}: question ${question.id} twice`);
        ids.add(question.id);
        if (!question.options.some((option) => option.id === question.answer)) problems.push(`${where}/${question.id}: key not in options`);
        if (new Set(question.options.map((option) => option.id)).size !== question.options.length) problems.push(`${where}/${question.id}: option ids`);
      }
      for (const key of Object.keys(episode.openings ?? {})) {
        const [flag, value] = key.split('=');
        const source = arc.episodes.slice(0, index).find((earlier) => earlier.choice?.flag === flag);
        if (!source || !source.choice!.options.some((option) => option.id === value)) problems.push(`${where}: opening ${key} has no earlier choice`);
      }
    });
  }
  return problems;
}
