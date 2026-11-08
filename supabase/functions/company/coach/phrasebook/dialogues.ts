// A short model conversation for each situation, so phrases are heard in use. Original
// Schood content; names and companies are invented for practice.
import type { Localized } from './types.ts';

export interface DialogueLine { who: 'a' | 'b'; en: string; ru: string; uz: string }
export interface Dialogue { situation: string; title: Localized; a: Localized; b: Localized; lines: DialogueLine[] }

const line = (who: 'a' | 'b', en: string, ru: string, uz: string): DialogueLine => ({ who, en, ru, uz });

const who = (en: string, ru: string, uz: string): Localized => ({ en, ru, uz });
const WHO = {
  Reception: who('Reception', 'Ресепшн', 'Qabulxona'), Caller: who('Caller', 'Звонящий', 'Qo‘ng‘iroq qiluvchi'),
  Team_lead: who('Team lead', 'Руководитель группы', 'Jamoa rahbari'), Colleague: who('Colleague', 'Коллега', 'Hamkasb'),
  Staff: who('Staff', 'Сотрудник', 'Xodim'), Customer: who('Customer', 'Клиент', 'Mijoz'),
  Accountant: who('Accountant', 'Бухгалтер', 'Buxgalter'), Client: who('Client', 'Клиент', 'Mijoz'),
  Host: who('Host', 'Принимающая сторона', 'Mezbon'), Visitor: who('Visitor', 'Гость', 'Mehmon'),
  Supplier: who('Supplier', 'Поставщик', 'Yetkazib beruvchi'), Employee: who('Employee', 'Сотрудник', 'Xodim'), Manager: who('Manager', 'Руководитель', 'Rahbar'),
  Buyer: who('Buyer', 'Покупатель', 'Xaridor'), Seller: who('Seller', 'Продавец', 'Sotuvchi'),
  Day_shift: who('Day shift', 'Дневная смена', 'Kunduzgi smena'), Night_shift: who('Night shift', 'Ночная смена', 'Tungi smena'),
  You: who('You', 'Вы', 'Siz'), Speaker: who('Speaker', 'Докладчик', 'Ma’ruzachi'), Listener: who('Listener', 'Слушатель', 'Tinglovchi'),
};

export const DIALOGUES: Dialogue[] = [
  {
    situation: 'phone', a: WHO.Reception, b: WHO.Caller,
    title: { en: 'Taking a message', ru: 'Принимаем сообщение', uz: 'Xabar qabul qilish' },
    lines: [
      line('a', 'Good morning, Registan Trading. How can I help you?', 'Доброе утро, Registan Trading. Чем могу помочь?', 'Xayrli tong, Registan Trading. Sizga qanday yordam bera olaman?'),
      line('b', 'Good morning. Could I speak to Mr. Yusupov, please?', 'Доброе утро. Можно поговорить с господином Юсуповым?', 'Xayrli tong. Janob Yusupov bilan gaplashsam bo‘ladimi?'),
      line('a', 'I\'m sorry, he is in a meeting at the moment. Can I take a message?', 'Извините, он сейчас на совещании. Что-нибудь передать?', 'Kechirasiz, u hozir yig‘ilishda. Xabar qoldirasizmi?'),
      line('b', 'Yes, please. Could you ask him to call Anna Weber about the contract?', 'Да, пожалуйста. Попросите его перезвонить Анне Вебер по поводу договора.', 'Ha, iltimos. Undan shartnoma bo‘yicha Anna Veberga qo‘ng‘iroq qilishini so‘rang.'),
      line('a', 'Of course. Could you spell your last name for me?', 'Конечно. Не могли бы вы продиктовать фамилию по буквам?', 'Albatta. Familiyangizni harflab ayta olasizmi?'),
      line('b', 'W, E, B, E, R. My number is on the last email.', 'W, E, B, E, R. Мой номер есть в последнем письме.', 'W, E, B, E, R. Raqamim oxirgi xatda bor.'),
      line('a', 'Thank you. I\'ll ask him to call you back this afternoon.', 'Спасибо. Я попрошу его перезвонить вам сегодня днём.', 'Rahmat. Undan bugun tushdan keyin qo‘ng‘iroq qilishini so‘rayman.'),
    ],
  },
  {
    situation: 'meeting', a: WHO.Team_lead, b: WHO.Colleague,
    title: { en: 'Agreeing the next step', ru: 'Договариваемся о следующем шаге', uz: 'Keyingi qadamni kelishish' },
    lines: [
      line('a', 'Shall we get started? We need to decide on the new supplier today.', 'Начнём? Сегодня нужно решить вопрос с новым поставщиком.', 'Boshlaymizmi? Bugun yangi yetkazib beruvchi masalasini hal qilishimiz kerak.'),
      line('b', 'Could I add something first? Their price is good, but delivery takes three weeks.', 'Можно сначала кое-что добавить? Цена у них хорошая, но доставка занимает три недели.', 'Avval bir narsa qo‘shsam bo‘ladimi? Narxi yaxshi, lekin yetkazib berish uch hafta davom etadi.'),
      line('a', 'That\'s a good point. What do the others think?', 'Хорошее замечание. Что думают остальные?', 'Yaxshi fikr. Boshqalar nima deb o‘ylaydi?'),
      line('b', 'I think we should ask them for a shorter delivery time.', 'Думаю, нам стоит попросить у них более короткий срок.', 'Menimcha, ulardan muddatni qisqartirishni so‘rashimiz kerak.'),
      line('a', 'I agree. Who will take care of this?', 'Согласен. Кто этим займётся?', 'Roziman. Bu bilan kim shug‘ullanadi?'),
      line('b', 'I can take that on. I\'ll have an answer by Thursday.', 'Я могу взять это на себя. Ответ будет к четвергу.', 'Buni o‘z zimmamga olaman. Payshanbagacha javob bo‘ladi.'),
    ],
  },
  {
    situation: 'complaint', a: WHO.Staff, b: WHO.Customer,
    title: { en: 'A wrong order', ru: 'Неправильный заказ', uz: 'Noto‘g‘ri buyurtma' },
    lines: [
      line('b', 'I\'d like to make a complaint. We received the wrong goods again.', 'Я хотел бы подать жалобу. Мы снова получили не тот товар.', 'Shikoyat qilmoqchiman. Bizga yana noto‘g‘ri mahsulot keldi.'),
      line('a', 'I\'m very sorry about this. Do you have the order number?', 'Мне очень жаль, что так вышло. У вас есть номер заказа?', 'Bu uchun juda afsusdaman. Buyurtma raqamingiz bormi?'),
      line('b', 'Yes, it\'s 4127. This is the second time this has happened.', 'Да, 4127. Это происходит уже второй раз.', 'Ha, 4127. Bu ikkinchi marta sodir bo‘lyapti.'),
      line('a', 'I understand how you feel. I can see the problem in our system.', 'Я понимаю ваши чувства. Я вижу проблему в нашей системе.', 'Sizni tushunaman. Muammoni tizimimizda ko‘ryapman.'),
      line('a', 'I can offer you a replacement or a refund. Which would you prefer?', 'Я могу предложить замену или возврат денег. Что вы предпочитаете?', 'Almashtirish yoki pulni qaytarishni taklif qila olaman. Qaysi biri sizga ma’qul?'),
      line('b', 'A replacement, please. We need it this week.', 'Замену, пожалуйста. Нам нужно на этой неделе.', 'Almashtirish, iltimos. Bu hafta kerak.'),
      line('a', 'I\'ll fix this today and call you when it\'s done. Thank you for your patience.', 'Я решу это сегодня и позвоню вам, когда всё будет готово. Спасибо за терпение.', 'Buni bugun hal qilaman va tayyor bo‘lgach qo‘ng‘iroq qilaman. Sabr-toqatingiz uchun rahmat.'),
    ],
  },
  {
    situation: 'invoice', a: WHO.Accountant, b: WHO.Client,
    title: { en: 'A payment reminder', ru: 'Напоминание об оплате', uz: 'To‘lov haqida eslatma' },
    lines: [
      line('a', 'Good afternoon. I\'m calling about invoice 2093. It is now two weeks overdue.', 'Добрый день. Я звоню по поводу счёта 2093. Он просрочен уже на две недели.', 'Xayrli kun. 2093-hisob-faktura yuzasidan qo‘ng‘iroq qilyapman. Muddati ikki haftaga o‘tib ketdi.'),
      line('b', 'I\'m sorry about that. Let me check. There seems to be a mistake on the invoice.', 'Извините. Сейчас проверю. Похоже, в счёте ошибка.', 'Kechirasiz. Tekshirib ko‘ray. Hisob-fakturada xato borga o‘xshaydi.'),
      line('a', 'I see. Could you tell me what is wrong?', 'Понятно. Не могли бы вы сказать, что не так?', 'Tushunarli. Nima xato ekanini ayta olasizmi?'),
      line('b', 'The amount does not match our order. We were charged twice for one item.', 'Сумма не совпадает с нашим заказом. С нас дважды взяли плату за одну позицию.', 'Summa buyurtmamizga mos kelmayapti. Bitta mahsulot uchun ikki marta hisob yozilgan.'),
      line('a', 'You\'re right, I can see it now. I\'ll send a corrected invoice today.', 'Вы правы, теперь вижу. Сегодня пришлю исправленный счёт.', 'To‘g‘ri aytasiz, endi ko‘ryapman. Bugun tuzatilgan hisob-fakturani yuboraman.'),
      line('b', 'Thank you. We pay suppliers on the fifteenth, so it will be paid then.', 'Спасибо. Мы платим поставщикам пятнадцатого числа, тогда и оплатим.', 'Rahmat. Yetkazib beruvchilarga o‘n beshinchi sanada to‘laymiz, o‘shanda to‘lanadi.'),
    ],
  },
  {
    situation: 'small_talk', a: WHO.Host, b: WHO.Visitor,
    title: { en: 'Welcoming a visitor', ru: 'Встречаем гостя', uz: 'Mehmonni kutib olish' },
    lines: [
      line('a', 'Nice to meet you. Did you find us easily?', 'Приятно познакомиться. Вы легко нас нашли?', 'Tanishganimdan xursandman. Bizni oson topdingizmi?'),
      line('b', 'Yes, thank you. The taxi knew the way.', 'Да, спасибо. Таксист знал дорогу.', 'Ha, rahmat. Taksi haydovchisi yo‘lni bilardi.'),
      line('a', 'Please, have a seat. Would you like some tea or coffee?', 'Присаживайтесь, пожалуйста. Хотите чаю или кофе?', 'Marhamat, o‘tiring. Choy yoki qahva ichasizmi?'),
      line('b', 'Tea would be lovely. Is it always this warm in October?', 'С удовольствием выпью чаю. В октябре всегда так тепло?', 'Choy yaxshi bo‘lardi. Oktabrda doim shunday issiq bo‘ladimi?'),
      line('a', 'Not always, but we\'ve been lucky this week. Is this your first time in Uzbekistan?', 'Не всегда, но на этой неделе нам повезло. Вы впервые в Узбекистане?', 'Har doim emas, bu hafta omadimiz keldi. O‘zbekistonga birinchi marta keldingizmi?'),
      line('b', 'It is, and I\'d like to see Samarkand before I leave.', 'Да, и я хотел бы увидеть Самарканд перед отъездом.', 'Ha, ketishimdan oldin Samarqandni ko‘rmoqchiman.'),
      line('a', 'You should. Well, shall we talk about why you\'re here?', 'Обязательно съездите. Что ж, поговорим о цели вашего визита?', 'Albatta boring. Xo‘sh, tashrifingiz maqsadi haqida gaplashamizmi?'),
    ],
  },
  {
    situation: 'delay', a: WHO.Supplier, b: WHO.Customer,
    title: { en: 'Warning about a late delivery', ru: 'Предупреждаем о задержке поставки', uz: 'Yetkazib berish kechikishi haqida ogohlantirish' },
    lines: [
      line('a', 'I wanted to let you know as early as possible. The delivery will be late.', 'Я хотел сообщить вам как можно раньше. Поставка задержится.', 'Sizga imkon qadar erta xabar bermoqchi edim. Yetkazib berish kechikadi.'),
      line('b', 'I see. What happened?', 'Понятно. Что случилось?', 'Tushunarli. Nima bo‘ldi?'),
      line('a', 'The shipment is held up at customs. We need two more days.', 'Груз задержан на таможне. Нам нужно ещё два дня.', 'Yuk bojxonada ushlanib qoldi. Yana ikki kun kerak.'),
      line('b', 'This delay is causing problems for our customers. Could you give me a realistic date?', 'Эта задержка создаёт проблемы для наших клиентов. Не могли бы вы назвать реальный срок?', 'Bu kechikish mijozlarimizga muammo tug‘diryapti. Aniq muddatni ayta olasizmi?'),
      line('a', 'I can\'t promise that date yet, but part of the order can arrive on time. Would a partial delivery help you?', 'Пока не могу обещать точную дату, но часть заказа может прибыть вовремя. Вам поможет частичная поставка?', 'Hozircha sanani va’da qila olmayman, lekin buyurtmaning bir qismi o‘z vaqtida yetib kelishi mumkin. Qisman yetkazib berish yordam beradimi?'),
      line('b', 'Yes, that would help. Please keep me updated.', 'Да, это поможет. Пожалуйста, держите меня в курсе.', 'Ha, bu yordam beradi. Iltimos, xabardor qilib turing.'),
      line('a', 'I\'ll send you an update every morning until it arrives.', 'Я буду присылать вам новости каждое утро, пока груз не прибудет.', 'Yuk yetib kelguncha har kuni ertalab xabar yuborib turaman.'),
    ],
  },
  {
    situation: 'apology', a: WHO.Employee, b: WHO.Manager,
    title: { en: 'Owning a mistake', ru: 'Признаём ошибку', uz: 'Xatoni tan olish' },
    lines: [
      line('a', 'Sorry to bother you, do you have a minute?', 'Извините за беспокойство, у вас есть минута?', 'Bezovta qilganim uchun uzr, bir daqiqangiz bormi?'),
      line('b', 'Of course. What is it?', 'Конечно. Что случилось?', 'Albatta. Nima gap?'),
      line('a', 'I sent the price list to the wrong client this morning. That was my fault.', 'Сегодня утром я отправил прайс-лист не тому клиенту. Это моя вина.', 'Bugun ertalab narxlar ro‘yxatini noto‘g‘ri mijozga yuboribman. Bu mening aybim.'),
      line('b', 'I see. Have you told them?', 'Понятно. Вы им сообщили?', 'Tushunarli. Ularga aytdingizmi?'),
      line('a', 'Yes, I called them and apologised, and they have deleted it.', 'Да, я позвонил им и извинился, и они его удалили.', 'Ha, qo‘ng‘iroq qilib uzr so‘radim, ular uni o‘chirib tashlashdi.'),
      line('a', 'I should have checked the address first. It won\'t happen again.', 'Мне следовало сначала проверить адрес. Это больше не повторится.', 'Avval manzilni tekshirishim kerak edi. Bu boshqa takrorlanmaydi.'),
      line('b', 'Thank you for telling me quickly. These things happen.', 'Спасибо, что быстро сообщили. Такое бывает.', 'Tez aytganingiz uchun rahmat. Bunday bo‘lib turadi.'),
    ],
  },
  {
    situation: 'negotiation', a: WHO.Buyer, b: WHO.Seller,
    title: { en: 'Meeting in the middle', ru: 'Сходимся посередине', uz: 'O‘rtada kelishish' },
    lines: [
      line('a', 'Your offer is interesting, but that is too expensive for us. Is there any flexibility on the price?', 'Ваше предложение интересное, но для нас это слишком дорого. Есть ли возможность обсудить цену?', 'Taklifingiz qiziq, lekin bu biz uchun juda qimmat. Narx bo‘yicha biroz yon berish mumkinmi?'),
      line('b', 'If you order more, we can lower the price. What is your budget for this?', 'Если вы закажете больше, мы можем снизить цену. Какой у вас бюджет?', 'Ko‘proq buyurtma bersangiz, narxni tushirishimiz mumkin. Bunga byudjetingiz qancha?'),
      line('a', 'We could double the order for a one-year contract, with a ten percent discount.', 'Мы могли бы удвоить заказ при договоре на год и скидке десять процентов.', 'Bir yillik shartnoma va o‘n foiz chegirma bilan buyurtmani ikki baravar oshirishimiz mumkin.'),
      line('b', 'I see your point, but we have costs to cover too. We can\'t go lower than seven percent.', 'Я вас понимаю, но нам тоже нужно покрывать расходы. Ниже семи процентов мы не можем.', 'Fikringizni tushunaman, lekin bizning ham xarajatlarimiz bor. Yetti foizdan pastga tusha olmaymiz.'),
      line('a', 'We can accept that price if delivery is free.', 'Мы можем принять эту цену, если доставка будет бесплатной.', 'Yetkazib berish bepul bo‘lsa, bu narxni qabul qila olamiz.'),
      line('b', 'I think we have a deal. I\'ll send you the contract tomorrow.', 'Думаю, мы договорились. Завтра я отправлю вам договор.', 'Menimcha, kelishdik. Ertaga sizga shartnomani yuboraman.'),
    ],
  },
  {
    situation: 'handover', a: WHO.Day_shift, b: WHO.Night_shift,
    title: { en: 'Handing over a shift', ru: 'Передаём смену', uz: 'Smenani topshirish' },
    lines: [
      line('a', 'Here is where we are. There are two open issues.', 'Вот на каком мы этапе. Есть два открытых вопроса.', 'Mana, ishlar shu darajada. Ikkita ochiq masala bor.'),
      line('b', 'Okay. Is anything urgent?', 'Хорошо. Есть что-то срочное?', 'Xo‘p. Shoshilinch narsa bormi?'),
      line('a', 'Machine two stopped twice this morning. The technician will come at nine.', 'Вторая машина сегодня утром останавливалась дважды. Техник придёт в девять.', 'Bugun ertalab ikkinchi mashina ikki marta to‘xtadi. Texnik soat to‘qqizda keladi.'),
      line('b', 'Should I keep it running until then?', 'Мне оставить её работать до этого времени?', 'Shu vaqtgacha ishlatib tursammi?'),
      line('a', 'Yes, but please keep an eye on it. I\'ve updated the log with today\'s changes.', 'Да, но, пожалуйста, следите за ней. Я внёс сегодняшние изменения в журнал.', 'Ha, lekin iltimos, kuzatib turing. Bugungi o‘zgarishlarni jurnalga kiritdim.'),
      line('b', 'Got it. And the second issue?', 'Понял. А второй вопрос?', 'Tushundim. Ikkinchi masala-chi?'),
      line('a', 'The Samarkand order can wait until next week. Call me if something urgent comes up.', 'Самаркандский заказ может подождать до следующей недели. Позвоните мне, если возникнет что-то срочное.', 'Samarqand buyurtmasi keyingi haftagacha kutishi mumkin. Shoshilinch narsa chiqsa, menga qo‘ng‘iroq qiling.'),
    ],
  },
  {
    situation: 'email', a: WHO.Colleague, b: WHO.You,
    title: { en: 'Talking through a reply', ru: 'Обсуждаем ответ на письмо', uz: 'Xatga javobni muhokama qilish' },
    lines: [
      line('a', 'Have you replied to the client about the contract?', 'Вы ответили клиенту по поводу договора?', 'Mijozga shartnoma bo‘yicha javob berdingizmi?'),
      line('b', 'Not yet. I\'m still waiting for the figures from accounting.', 'Ещё нет. Я всё ещё жду цифры от бухгалтерии.', 'Hali yo‘q. Hali ham buxgalteriyadan raqamlarni kutyapman.'),
      line('a', 'They asked for an answer by Friday. Could you send a short update today?', 'Они просили ответить к пятнице. Не могли бы вы сегодня отправить короткое сообщение?', 'Ular jumagacha javob so‘rashgan. Bugun qisqa xabar yubora olasizmi?'),
      line('b', 'Good idea. I\'ll write that I\'ll get back to them by tomorrow morning.', 'Хорошая мысль. Напишу, что отвечу до завтрашнего утра.', 'Yaxshi fikr. Ertaga ertalabgacha javob berishimni yozaman.'),
      line('a', 'And please copy me, so that I can follow it.', 'И, пожалуйста, поставьте меня в копию, чтобы я был в курсе.', 'Iltimos, meni ham nusxaga qo‘shing, kuzatib boray.'),
      line('b', 'Of course. I\'ll send it in ten minutes.', 'Конечно. Отправлю через десять минут.', 'Albatta. O‘n daqiqada yuboraman.'),
    ],
  },
  {
    situation: 'presentation', a: WHO.Speaker, b: WHO.Listener,
    title: { en: 'Questions after a talk', ru: 'Вопросы после выступления', uz: 'Chiqishdan keyingi savollar' },
    lines: [
      line('a', 'To sum up, we need to act before the summer. Thank you for listening. Are there any questions?', 'Подводя итог, нам нужно действовать до лета. Спасибо за внимание. Есть ли вопросы?', 'Xulosa qilib aytganda, yozgacha harakat qilishimiz kerak. Tinglaganingiz uchun rahmat. Savollar bormi?'),
      line('b', 'Thank you. How much will the first stage cost?', 'Спасибо. Сколько будет стоить первый этап?', 'Rahmat. Birinchi bosqich qancha turadi?'),
      line('a', 'That\'s a good question. I\'m not sure of the final number, but I can find out and let you know.', 'Хороший вопрос. Точной суммы я не знаю, но могу уточнить и сообщить вам.', 'Yaxshi savol. Yakuniy raqamni aniq bilmayman, lekin bilib, sizga xabar beraman.'),
      line('b', 'Could you explain the second chart again?', 'Не могли бы вы ещё раз объяснить второй график?', 'Ikkinchi grafikni yana bir bor tushuntira olasizmi?'),
      line('a', 'Of course. The blue line shows last year\'s figures, and costs fell in the second quarter.', 'Конечно. Синяя линия показывает цифры прошлого года, и во втором квартале расходы снизились.', 'Albatta. Ko‘k chiziq o‘tgan yilgi raqamlarni ko‘rsatadi, ikkinchi chorakda xarajatlar kamaydi.'),
      line('a', 'The slides will be sent to you after the meeting.', 'Слайды вам пришлют после встречи.', 'Slaydlar uchrashuvdan keyin sizga yuboriladi.'),
    ],
  },
];
