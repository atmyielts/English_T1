// What each industry page shows that is the same in every language: the job tracks and
// the English itself. All examples are original and written for these pages; they are
// not questions from the real test bank.
import type { Industry, JobRole, Skill } from '../../../../../packages/company-core/src/mod.ts';
import type { IndustrySlug } from './catalog.ts';

export interface SampleQuestion { skill: Skill; context?: string; prompt: string; options: string[]; answer: number }
export interface IndustrySample {
  /** The lead form's industry for this page. */
  industry: Industry;
  roles: JobRole[];
  questions: SampleQuestion[];
  /** `you` is the employee practising; the other side is played by the AI in the real role-play. */
  roleplay: { who: 'partner' | 'you'; text: string }[];
}

export const INDUSTRY_SAMPLES: Record<IndustrySlug, IndustrySample> = {
  hotels: {
    industry: 'hospitality', roles: ['hospitality', 'tourism', 'customer_service', 'management'],
    questions: [
      { skill: 'vocabulary', prompt: 'The guest asked for a late ___ because her flight leaves at nine in the evening.', options: ['check-out', 'room key', 'wake-up', 'lobby'], answer: 0 },
      { skill: 'grammar', prompt: 'I’m sorry, your room ___ yet. It will be ready in twenty minutes.', options: ['isn’t cleaning', 'hasn’t been cleaned', 'didn’t clean', 'doesn’t clean'], answer: 1 },
      { skill: 'reading', context: 'Booking note: “Guest arrives after midnight. Keep the room and do not charge a no-show fee.”', prompt: 'What should the night staff do?', options: ['Cancel the booking at midnight', 'Hold the room for the late arrival', 'Charge the no-show fee', 'Send the guest to another hotel'], answer: 1 },
    ],
    roleplay: [
      { who: 'partner', text: 'I asked for a quiet room, and there has been drilling outside my window since seven.' },
      { who: 'you', text: 'I’m very sorry, Mr Hall. That is not the stay we promised you. May I check what is free right now?' },
      { who: 'partner', text: 'I have an important call at ten. I can’t take it in that room.' },
      { who: 'you', text: 'I can move you to the eighth floor, on the garden side. A colleague will bring your bags, so you’ll be settled by half past nine.' },
      { who: 'partner', text: 'And what about the noise I’ve already had?' },
      { who: 'you', text: 'I’ll speak to my manager about an adjustment and call your new room before noon with an answer.' },
    ],
  },
  banks: {
    industry: 'banking', roles: ['banking_finance', 'legal_compliance', 'customer_service', 'sales', 'office_admin'],
    questions: [
      { skill: 'vocabulary', prompt: 'To open a business account, we need a copy of your company’s ___.', options: ['registration certificate', 'delivery note', 'boarding pass', 'price tag'], answer: 0 },
      { skill: 'grammar', prompt: 'Your transfer ___ once the compliance team has checked the documents.', options: ['was processed', 'is process', 'will be processed', 'processed'], answer: 2 },
      { skill: 'reading', context: 'Notice: “Transfers above the daily limit need a second signature and can take up to two working days.”', prompt: 'A client wants to send more than the limit today. What do you tell them?', options: ['It is not possible at all', 'It needs a second signature and may take longer', 'It will arrive within an hour', 'The limit does not apply to companies'], answer: 1 },
    ],
    roleplay: [
      { who: 'partner', text: 'My supplier in Germany still hasn’t received the payment I sent on Monday. What’s going on?' },
      { who: 'you', text: 'I understand this is urgent, Ms Novak. Let me check the status of the transfer. Do you have the reference number?' },
      { who: 'partner', text: 'Yes, it’s on the receipt. But why would it take this long?' },
      { who: 'you', text: 'I can see that the correspondent bank has asked for one more document: the contract with your supplier.' },
      { who: 'partner', text: 'Nobody told me that. Can I send it today?' },
      { who: 'you', text: 'Yes. Please email it to me now, and I’ll forward it and call you as soon as the bank confirms it.' },
    ],
  },
  'it-outsourcing': {
    industry: 'it', roles: ['it_software', 'management', 'sales'],
    questions: [
      { skill: 'vocabulary', prompt: 'We can’t release today because a critical ___ was found in the payment module.', options: ['bug', 'branch', 'backlog', 'badge'], answer: 0 },
      { skill: 'grammar', prompt: 'By the time the client joins the call, we ___ the fix to staging.', options: ['will have pushed', 'have pushed', 'pushed', 'are push'], answer: 0 },
      { skill: 'reading', context: 'Ticket: “Login fails only for SSO users on mobile. Desktop is fine. Reproduced on v2.3, not on v2.2.”', prompt: 'What does the ticket suggest?', options: ['All users are affected', 'The problem appeared in v2.3', 'Desktop users should update', 'SSO has been removed'], answer: 1 },
    ],
    roleplay: [
      { who: 'partner', text: 'We expected the reporting feature this sprint. Where are we with it?' },
      { who: 'you', text: 'It’s about two days behind. The export works, but filtering by date is failing on large accounts.' },
      { who: 'partner', text: 'Our sales team has a demo on Friday. Will it be ready?' },
      { who: 'you', text: 'The export will be ready for the demo. The date filter may not be. I’d suggest we demo with a smaller account.' },
      { who: 'partner', text: 'Okay. Can you confirm that by the end of today?' },
      { who: 'you', text: 'Yes. I’ll post an update in the channel by six your time, including the risks.' },
    ],
  },
  'call-centres': {
    industry: 'other', roles: ['call_centre', 'customer_service', 'sales'],
    questions: [
      { skill: 'vocabulary', prompt: 'Could you ___ for a moment while I check your order?', options: ['hold on', 'hang up', 'call off', 'give up'], answer: 0 },
      { skill: 'grammar', prompt: 'I understand you ___ three times already, and I’m sorry about that.', options: ['have called', 'are calling', 'call', 'will call'], answer: 0 },
      { skill: 'reading', context: 'Script note: “If a customer asks for a refund after 30 days, offer store credit first. Transfer to a supervisor only if they refuse.”', prompt: 'A customer asks for a refund on day 45. What is your first step?', options: ['Transfer to a supervisor', 'Offer store credit', 'Refund at once', 'End the call'], answer: 1 },
    ],
    roleplay: [
      { who: 'partner', text: 'I was charged twice this month, and this is my third call about it!' },
      { who: 'you', text: 'I’m sorry you’ve had to call again, Mr Lee. I’ll stay with this until we have an answer. May I have your account number?' },
      { who: 'partner', text: 'It’s 44871. Last time someone promised to call me back and nobody did.' },
      { who: 'you', text: 'Thank you. I can see both charges, on the 3rd and the 4th. The second one is a duplicate, so I’m requesting a refund now.' },
      { who: 'partner', text: 'How long will that take?' },
      { who: 'you', text: 'The system shows up to five working days. You’ll get a confirmation by email, and here is your case number.' },
    ],
  },
  retail: {
    industry: 'retail', roles: ['retail', 'sales', 'customer_service', 'management'],
    questions: [
      { skill: 'vocabulary', prompt: 'This jacket is on ___ this week: everything on this rail is 20% off.', options: ['sale', 'stock', 'shift', 'receipt'], answer: 0 },
      { skill: 'grammar', prompt: 'We don’t have your size in store, but I ___ check the other branch for you.', options: ['can', 'must to', 'am', 'have'], answer: 0 },
      { skill: 'reading', context: 'Sign: “Exchanges within 14 days with a receipt. Sale items cannot be returned for cash.”', prompt: 'A customer bought a sale item five days ago and has the receipt. They want cash back. What do you say?', options: ['Yes, here is your cash', 'No cash, but they can exchange it', 'No exchange is possible', 'They must come back in 14 days'], answer: 1 },
    ],
    roleplay: [
      { who: 'partner', text: 'Hi, I’m looking for a gift for my mother. Something from Uzbekistan, not too expensive.' },
      { who: 'you', text: 'Of course. These silk scarves are hand-printed locally, and they fold flat for your suitcase. Does she like bright colours?' },
      { who: 'partner', text: 'More like soft colours. Do you have it in blue?' },
      { who: 'you', text: 'Yes, this one is a soft blue. Would you like to feel the fabric?' },
      { who: 'partner', text: 'It’s lovely. Can I return it if she doesn’t like it? I leave on Sunday.' },
      { who: 'you', text: 'You can exchange it here within fourteen days with your receipt. Shall I wrap it as a gift?' },
    ],
  },
  logistics: {
    industry: 'logistics', roles: ['logistics', 'office_admin', 'customer_service'],
    questions: [
      { skill: 'vocabulary', prompt: 'The goods are being held at the border until ___ clearance is complete.', options: ['customs', 'catering', 'parking', 'payroll'], answer: 0 },
      { skill: 'grammar', prompt: 'According to the schedule, the truck ___ Tashkent at six tomorrow morning.', options: ['leaves', 'left', 'has left', 'leaving'], answer: 0 },
      { skill: 'reading', context: 'Email: “Please note that the ETA has moved from 12 May to 15 May because of congestion at the port. All other terms stay the same.”', prompt: 'What has changed?', options: ['The port', 'The price', 'The arrival date', 'The delivery terms'], answer: 2 },
    ],
    roleplay: [
      { who: 'partner', text: 'Our container was due on Monday. My production line needs those parts. Where is it?' },
      { who: 'you', text: 'I’ve just checked with the carrier, Mr Rossi. It’s at the port, waiting for a free slot. The new ETA is Thursday.' },
      { who: 'partner', text: 'Thursday is too late. Is there any way to bring it forward?' },
      { who: 'you', text: 'I can ask about moving part of the load by truck from the port. It costs more, but the urgent parts could arrive by Tuesday.' },
      { who: 'partner', text: 'Send me the price, please.' },
      { who: 'you', text: 'I’ll send you a quote within the hour, with both options, so that you can decide today.' },
    ],
  },
  manufacturing: {
    industry: 'manufacturing', roles: ['engineering', 'construction', 'logistics', 'management'],
    questions: [
      { skill: 'vocabulary', prompt: 'Stop the line at once if the safety ___ is not in place.', options: ['guard', 'budget', 'shift', 'report'], answer: 0 },
      { skill: 'grammar', prompt: 'The machine must ___ before anyone opens the panel.', options: ['be switched off', 'switch off to', 'switched off', 'be switching'], answer: 0 },
      { skill: 'reading', context: 'Maintenance note: “Bearing on line 3 overheats above 80 °C. Reduce speed by 20% until the new part arrives on Thursday.”', prompt: 'What should the operator do today?', options: ['Stop line 3 until Thursday', 'Run line 3 more slowly', 'Replace the bearing', 'Raise the temperature limit'], answer: 1 },
    ],
    roleplay: [
      { who: 'partner', text: 'This is Klaus from the equipment supplier. Your message says the press stopped. What happened exactly?' },
      { who: 'you', text: 'It stopped at about ten this morning, with error code 214 on the screen. The operator restarted it once, and it stopped again.' },
      { who: 'partner', text: 'Did you check the oil pressure?' },
      { who: 'you', text: 'Yes. It’s lower than normal, around three bar, and we can see a small leak near the pump.' },
      { who: 'partner', text: 'Please don’t run it any more. Can you send me a photo of the leak?' },
      { who: 'you', text: 'I’ll send it in five minutes. We’ve locked out the machine, and I’ll wait for your instructions.' },
    ],
  },
  healthcare: {
    industry: 'healthcare', roles: ['healthcare', 'pharma_sales', 'customer_service', 'office_admin'],
    questions: [
      { skill: 'vocabulary', prompt: 'Please tell the doctor if you are ___ to any medicine.', options: ['allergic', 'afraid', 'tired', 'sorry'], answer: 0 },
      { skill: 'grammar', prompt: 'You ___ eat anything for eight hours before the blood test.', options: ['must not', 'don’t must', 'not must', 'mustn’t to'], answer: 0 },
      { skill: 'reading', context: 'Clinic notice: “Please arrive 15 minutes before your appointment. Bring your passport and any earlier test results.”', prompt: 'A patient’s appointment is at 10:00. When should they arrive?', options: ['At 9:45', 'At 10:00', 'At 10:15', 'At any time before noon'], answer: 0 },
    ],
    roleplay: [
      { who: 'partner', text: 'Hello, I booked an appointment with the cardiologist at eleven. It’s my first time here.' },
      { who: 'you', text: 'Welcome, Mrs Brown. May I see your passport, please? I’ll also need you to fill in this short form.' },
      { who: 'partner', text: 'Some of this is about my medical history. Is it private?' },
      { who: 'you', text: 'Yes, only your care team can see it. If you take any regular medicine, please write it here.' },
      { who: 'partner', text: 'And will the doctor speak English?' },
      { who: 'you', text: 'I’ll check for you now. If needed, I can arrange for an interpreter to join you.' },
    ],
  },
  'education-centres': {
    industry: 'education', roles: ['education', 'office_admin', 'management', 'general'],
    questions: [
      { skill: 'vocabulary', prompt: 'Our new ___ starts on 1 September, and places are limited.', options: ['term', 'fee', 'staff', 'desk'], answer: 0 },
      { skill: 'grammar', prompt: 'Parents ___ receive a progress report at the end of each month.', options: ['will', 'are', 'have', 'been'], answer: 0 },
      { skill: 'reading', context: 'Policy: “Students who leave in the first week get a full refund. After that there is no refund, but the place can be moved to the next term.”', prompt: 'A student wants to leave in the third week. What can the centre offer?', options: ['A full refund', 'A half refund', 'A place in the next term', 'Nothing at all'], answer: 2 },
    ],
    roleplay: [
      { who: 'partner', text: 'Good morning. We’re a partner school from Malaysia, and we’d like to send students to your summer programme.' },
      { who: 'you', text: 'Thank you for calling, Ms Tan. How many students are you thinking of, and how old are they?' },
      { who: 'partner', text: 'About twelve students, aged fifteen to seventeen. Could they stay with host families?' },
      { who: 'you', text: 'Let me check that with our programme coordinator. May I ask which dates you have in mind?' },
      { who: 'partner', text: 'The second half of July. And we need the fees in writing for the parents.' },
      { who: 'you', text: 'Of course. I’ll email you the programme and a written offer, and call you back on Thursday to go through it.' },
    ],
  },
  government: {
    industry: 'government', roles: ['office_admin', 'management', 'general'],
    questions: [
      { skill: 'vocabulary', prompt: 'The delegation will ___ at the ministry on Tuesday at ten.', options: ['arrive', 'reach', 'get', 'visit'], answer: 0 },
      { skill: 'grammar', prompt: 'The memorandum ___ by both sides at yesterday’s meeting.', options: ['was signed', 'signed', 'has signing', 'is sign'], answer: 0 },
      { skill: 'reading', context: 'Memo: “Foreign guests need a visitor badge. Send their names and passport numbers to Protocol two working days before the visit.”', prompt: 'The visit is on Thursday. What is the last day to send the names?', options: ['Monday', 'Tuesday', 'Wednesday', 'Thursday morning'], answer: 1 },
    ],
    roleplay: [
      { who: 'partner', text: 'Good morning. We’re the delegation from the development agency. We have a meeting at eleven.' },
      { who: 'you', text: 'Good morning, and welcome. I’m from the international relations department. May I have your names for the visitor badges?' },
      { who: 'partner', text: 'Of course, here’s our list. Will there be an interpreter at the meeting?' },
      { who: 'you', text: 'Yes, an interpreter will be there throughout. The deputy head will open the meeting with a short welcome.' },
      { who: 'partner', text: 'We’ve brought a draft of the agreement. Should we share it now?' },
      { who: 'you', text: 'Thank you. I’ll pass it to the legal team now, so they can look through it before the meeting.' },
    ],
  },
};
