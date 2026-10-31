## Centre UI catalogs (apps/schood-ai/src/centre/i18n/en.ts, uz.ts, ru.ts)
Counts: language 58 · fact 1 · answer 0 · consistency 62 · honesty 3 · placeholder 3
(959 keys per language; key sets identical; placeholder names identical across en/uz/ru; every ru plural has one/few/many/other; no ASCII apostrophes in uz. CRLF line endings kept.)

### Changes
**Glossary consistency**
- ru, 13 × «тест(ы) на уровень» → «тест(ы) уровня» (glossary: placement test = тест уровня): nav, kind, widgets, snippet, area, admissions lead/placement, page titles, take title, my.placement, error.test_not_found, draftTitle.
- ru, 9 × "AI" → «ИИ» (placement.draft, draftTitle, draftChecks, reviewTitle, reviewSummary, reviewDisagree, reviewUnanswered, byok.lead «ИИ-провайдеров», byok.lapsedLead). "Schood AI" left as is.
- uz, 9 × hint "ishora" → "maslahat" (glossary: never "ishora"): groups.lead, policyLabel, policy.*, policyHint.during_homework, ruleFollow, rule.hints_only, my.policy.*. Policy hints now say "maslahat va yo‘naltiruvchi savollar".
- Owner brief: ru nav/area «Понедельничная сводка» → «Сводка для владельца»; brief.title → «Сводка для владельца по понедельникам»; overview.step.brief → «Получайте сводку по понедельникам». (uz already "rahbar xulosasi" in the title.)
- uz lead: "lid(lar)" → "ariza(lar)" / "potensial mijoz": overview.newLeads «Yangi arizalar», office.leads/leadsLead/noLeads/lead/manual, setup.academy.lead, admissions.waitingLead, brief.lead. ru keeps «лид» (allowed).
- ru coach: observe.title «Помощник по наблюдению за уроками» → «Коуч по наблюдению уроков» (en "Lesson observation coach"; uz already "murabbiyi").
- uz "xabarnoma" → "bildirishnoma" (core uz uses «Bildirishnomalar»): brief.enabledHint, admissions.linkMe, staffLinked.
- "a person approves" → staff: uz "odam" → "xodim" (office.lead, admissions.rulesLead, modeApprove); ru «человек» → «сотрудник» (office.lead, noPrices, rulesLead, modeApprove, modeHint.approve, handoverText, status.handed_over); ru office.lead «одобрит» → «подтвердит» (approve = подтвердить everywhere).
- ru «Учитель» → «Преподаватель» (groups.homeworkRuleHint).
- Feature names aligned with the teacher catalog: uz area.writing → "Yozuv signallari"; ru area.writing → «Сигналы по тексту», area.feedback «Автор отзывов» → «Отзывы и характеристики».
- ru byok: «плата за платформу» / «оплачиваются платой» → «платформенный сбор» everywhere (matches «Платформенные сборы» column).
- Internal codes removed from owner-facing label: admin.parents "Parent brief and questions (P1, P2)" → without "(P1, P2)" in en/uz/ru.

**Approve buttons / headings**
- office.toApprove is a heading over Approve & run cards, not a button, but read like one ("Approve and send" / «Подтвердить и отправить» / "Tasdiqlash va yuborish"). Now: en "Drafts to approve and send", uz "Tasdiqlab yuboriladigan qoralamalar", ru «Черновики на подтверждение и отправку». The cards' own button stays the core "Approve & run". No «Одобрить и сохранить» exists in these files.

**Honesty**
- ru style.placementWidgetHint «получают оценку уровня» → «примерную оценку уровня» (it is an estimate; en/uz already say estimate/taxminiy).
- en marketing.rule "Drafts … are refused and refunded" → "are rejected, and the credits are returned" (drafts are not refunded; credits are).
- ru byok.notYet said Schood «пока включает» calls with own keys (sounds like it is on); now «Schood ещё не включил; до этого …». en reworded the same way.

**Placeholders / plurals**
- en groups.synced "{created} new groups, {linked} students added" → plural forms (1 new group, 1 student).
- en admin.purged → plural forms for chats/conversations.
- uz byok.removeAll "Kalitlarni olib tashlash ({count} ta)" (wrong for 1, 31 chars) → "{count|one:Kalitni o‘chirish|other:# ta kalitni o‘chirish}".
- ru placement.reviewSummary «ответил на {asked} заданий … совпал в {agreed}» (case/number could not agree) → «Второй ИИ без ключа ответил на задания: {asked}; совпало с ключом: {agreed}.»

**English**
- "a homework" / "homeworks" (uncountable): classes.due → "# homework task(s) due so far"; groups.policyHint.during_homework, my.policy.during_homework, groups.homeworkRuleHint ("a single homework task"), groups.perHomework ("Rules for each homework task").
- curriculum.unitStatus.changes_requested "Changes asked" → "Changes requested"; marketing.unverify "Unverify" → "Mark as not verified"; admin.noUsage "No use…" → "No usage…"; admissions.lead "in your Telegram bot and website" → "and on your website"; admissions.replyHint "until you hand back" → "until you hand the conversation back"; insights.privacy "Groups under {group} students" → "Groups with fewer than {group} students … asked about it"; observe.standardsDefault "Change them" (set) → "Change it to fit your centre"; groups.lead clarified the three rules; groups.policyHint.off reworded.

**Uzbek language**
- nav.people / people.title "Odamlar va o‘rinlar" → "A’zolar va o‘rinlar"; home.setup.lead "Markaz boshqarasizmi?" → "O‘quv markazini boshqarasizmi?"; overview.lead calque "bir qarashda" → "haqida qisqacha"; overview.beta "Beta kirish" → "Beta rejimi"; join.as → "Markazdagi rolingiz: {role}." ({role} is a capitalised label); people.labelHint "5B guruh" → "5B guruhi"; style.language "O‘qitish tili" (= teaching language, wrong) → "Ko‘rsatmalar tili" (field is instruction_language); admin.uses → "Foydalanish soni"; admin.auditLead fragment fixed; byok.openai → "OpenAI bilan mos keladigan"; office.stopped "Erta to‘xtadi" → "Yarim yo‘lda to‘xtadi"; signals "davomat 30 kun %" → "30 kunlik davomat, %"; admissions.notice "Oldindan ogohlantirish (soat)" → "Kamida necha soat oldin"; modeHint.auto, waitingLead, replyHint ("Suhbatni agentga qaytarmaguningizcha"), bookingsLead ("yozib qo‘ygan"), websiteVisitor "tashrifchisi" → "tashrif buyuruvchisi"; marketing.consent / error.results_unverified "ismi aytilishiga" → "ismi ko‘rsatilishiga"; placement.minWords → "Minimal so‘z soni"; placement.bandsLead ungrammatical "Minimal balliga yetilgan" → "Eng kam foiziga erishilgan …"; perLevel → "Har bir darajaga savollar soni"; brief.live "Academy’dan jonli" → "Academy’dan hozirgi ma’lumotlar"; resell.gateHint "Qayta sotish faol bo‘lmagan" → "Faol to‘lovi bo‘lmagan"; "vasiy" alone for guardian → "ota-ona(si) yoki vasiysi" (classes.officeChooses, error.no_guardian); observe share "ulashish" → "O‘qituvchiga yuborish" with status/error/noProgress aligned ("yuborilgan").

**Russian language**
- nav.people / people.title «Люди и места» → «Участники и места»; join.as «Ваша роль будет:» → «Ваша роль в центре:»; people.emptyNoLimit «Пусто — без лимита» → «Если оставить пустым — без лимита»; groups.noteHint «отвечай коротко» (ты) → «отвечать коротко»; office.reason.lapsed gendered «Перестал ходить» → «Не ходит на занятия»; admissions.notice → «Минимум за (часов)»; brief.hour «Начиная с (по Ташкенту)» → «С какого часа (по Ташкенту)»; curriculum.lead used past participles as if done → «сначала план, затем разделы один за другим, проверка … и публикация …»; my.toolsHint tautology «один кредит из кредитов» → «списывает один кредит с баланса вашего центра».

**Button length (375 px, ≤ 24 aimed)**
- admissions.linkMe: en "Telegram handover alerts" (24), uz "Bildirishnomalarni olish" (24, was 58), ru «Уведомления в Telegram» (22, was 52).
- brief.preview / sendNow: uz "Xulosani tayyorlash" / "Tayyorlab yuborish", ru «Собрать сводку недели» / «Собрать и отправить».
- office.newWinback/newRenewal: uz "Qaytarish kampaniyasi" / "Uzaytirish kampaniyasi", ru «Кампания по возврату» / «Кампания по продлению».
- uz setup.academy.link "Ish maydonini yaratish"; setup.other.contact "Schood yordam xizmatiga yozish"; marketing.verify/unverify "Tasdiqlash" / "Tasdiqni bekor qilish"; observe.share "O‘qituvchiga yuborish"; placement.addWriting "Yozma topshiriq qo‘shish"; placement.drafting "Tayyorlanmoqda… 1 daqiqagacha".
- ru groups.sync «Синхронизировать с Academy» → «Загрузить из Academy»; placement.markAi → «Проверить с помощью ИИ»; placement.addSection → «Добавить раздел вопросов»; admissions.modeAuto (select) → «Сразу, по этим правилам»; uz modeAuto → "Qoida bo‘yicha avtomatik".
- Still over 24 (left, would lose meaning): en/uz placement.markAi ("Mark writing and speaking with AI", 33/38), en placement.drafting (busy state, 37), ru setup.academy.link «Создать пространство центра» (27), ru placement.addWriting (27), uz placement.addSection (25).

### [VERIFY]
- `uz.ts`/`ru.ts`/`en.ts` `centre.my.toolsHint` "Each answer uses one credit": true for `student_assistant.reply` (C2, 1 credit) in `packages/ai-core/src/credits.ts`, but the listed tools have their own prices there (explain.mistake 2, words.from_text 2, reading.graded 3). If the Student Assistant charges those prices when it runs a tool, the hint is wrong in all three languages.
- `setup.tsx:33` passes the raw Academy role (`academy.role`) into `centre.setup.academy.role` with no translation, so "Your Academy role: owner" appears in English in uz/ru. That is code, outside my files.
- `centre.placement.reviewDisagree` `{item}`: if it is always a number, uz could read "{item}-savol" instead of "Savol {item}". I left "Savol {item}".
- `error.*` short forms (insufficient_credits, capped, …) are lowercase fragments made for "Stopped early: {reason}". core/states.tsx handles these codes itself, so they are not shown alone today. Keep them lowercase.

### Glossary proposals
- Lead (centre CRM): en lead · uz ariza (person: potensial mijoz; not "lid") · ru лид / заявка.
- Notification: uz bildirishnoma (not xabarnoma), matching core «Bildirishnomalar» · ru уведомление.
- Owner brief: uz rahbar xulosasi (nav short form: Dushanba xulosasi) · ru сводка для владельца (not «понедельничная сводка»).
- Approval by a person: uz xodim tasdiqlaydi · ru подтверждает сотрудник (not «человек», not «одобрить»).
- Platform fee (own keys): ru платформенный сбор · uz platforma to‘lovi.
- Skills as general English topics (Insights, placement sections): the glossary says exam skills are never translated (Speaking, Writing…), but the centre catalogs translate them (Gapirish/Yozish, Устная речь/Письмо). Please say whether that rule covers non-IELTS placement and topic labels. I left them as they are.
