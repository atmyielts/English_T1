// Bank items for aviation and airport ground staff. Original Schood content; the airline is fictional.
import { grammar, listening, reading, speaking, vocabulary, writing, type RoleBank } from './_compact.ts';

const role = 'aviation';
export const bank: RoleBank = {
  grammar: grammar(role, 'avi', [
    ['a2', 'The plane ___ at gate seven now. Please go there.', ['boards', 'is boarding', 'boarded', 'board'], 1],
    ['b1', 'Passengers ___ show their passports before they go through the gate.', ['must', 'can to', 'should to', 'have'], 0],
    ['b1', 'Your bag ___ because it is five kilos over the limit.', ['hasn’t accept', 'can’t be accepted', 'can’t accept', 'isn’t accepting'], 1],
    ['b2', 'The flight was delayed ___ fog at the airport.', ['because', 'although', 'owing to', 'so that'], 2],
    ['b2', 'If you had arrived twenty minutes earlier, you ___ the flight.', ['will catch', 'would catch', 'had caught', 'would have caught'], 3],
    ['c1', 'Only after the check ___ completed may the aircraft be released.', ['has been', 'had', 'will be', 'has'], 0],
  ]),
  vocabulary: vocabulary(role, 'avi', [
    ['a2', 'Please go to ___ number five. Your plane is there.', ['door', 'gate', 'stop', 'desk'], 1],
    ['a2', 'You need a ___ pass to get on the plane.', ['boarding', 'parking', 'walking', 'welcome'], 0],
    ['b1', 'Your baggage ___ is twenty kilos on this ticket.', ['allowance', 'amount', 'addition', 'advance'], 0],
    ['b1', 'A power bank must go in your ___ baggage.', ['cargo', 'hand', 'heavy', 'hold'], 1],
    ['b1', 'She missed her ___ in Istanbul because the first flight was late.', ['connection', 'collection', 'correction', 'contact'], 0],
    ['b2', 'The bag could not be found, so the agent started a ___ on the system.', ['track record', 'trace', 'tour', 'transfer'], 1],
    ['b2', 'During ___, the aircraft is moved backwards away from the terminal.', ['takeoff', 'landing', 'taxiing', 'pushback'], 3],
    ['c1', 'The captain has the authority to ___ boarding to anyone who is unfit to fly.', ['deny', 'reject', 'forbid', 'disallow'], 0],
  ]),
  reading: [
    reading('r-avi-01', role, 'b2', 'policy', 'Unattended Bags and Staff Duties', `All airport staff have a duty to report unattended baggage at once. A bag is treated as unattended if no owner can be seen near it and no one claims it after a short, clear question to people nearby.

Staff must not touch, move or open the bag. Keep people away from it and call airport security on the internal number. Give the exact location, the time you saw it and a short description. Stay in the area if it is safe, because the security team may need your help.

Do not make an announcement to passengers unless security asks you to. A calm tone matters: most unattended bags are simply forgotten, and panic can cause more harm than the bag itself.

After the event, your supervisor will ask you to complete a report. Include only what you saw and did, not what you think might have happened.`, [
      ['What is the first thing staff should do if no one claims a bag?', ['Open it to find a name', 'Carry it to the lost property office', 'Call airport security', 'Announce it to passengers'], 2],
      ['What must staff give security?', ['The owner’s name', 'The location, time and a description', 'A photo of the contents', 'A written report at once'], 1],
      ['Why does the text say a calm tone matters?', ['Panic can cause more harm', 'Passengers dislike announcements', 'Most bags contain nothing valuable', 'Security staff are very busy'], 0],
      ['What should be in the report?', ['Opinions about the owner', 'Possible causes', 'Other staff members’ views', 'Only what you saw and did'], 3],
    ]),
  ],
  listening: [
    listening('l-avi-01', role, 'b1', 'announcement', 'A Delay at the Gate', [
      ['Agent', 'Ladies and gentlemen, this is an announcement for passengers on SkyOasis flight four one two to Dubai.'],
      ['Agent', 'We are sorry to tell you that this flight is delayed. The aircraft needs a technical check before it can leave.'],
      ['Agent', 'The new departure time is seventeen thirty. Boarding will begin at seventeen hundred at this gate.'],
      ['Agent', 'Please come to the desk to collect a meal voucher. You can use it in any cafe on this floor.'],
      ['Agent', 'If you have a connecting flight in Dubai, please speak to my colleague at the desk on the left. Thank you for your patience.'],
    ], [
      ['Why is the flight delayed?', ['Bad weather', 'A technical check', 'A late crew', 'A strike'], 1],
      ['When does boarding begin?', ['At sixteen thirty', 'At seventeen thirty', 'At seventeen hundred', 'At eighteen hundred'], 2],
      ['Who should talk to the agent’s colleague?', ['Passengers with connecting flights', 'Passengers who want vouchers', 'Passengers with small children', 'Passengers going home'], 0],
    ]),
  ],
  writing: writing(role, 'avi', [
    ['b1', 'A passenger’s suitcase arrived damaged. Write to the passenger explaining what they can do and what you need from them.', ['Apologise for the damage', 'Ask for the reference and photos', 'Explain repair or claim steps', 'Say how long it will take'], 90],
    ['b2', 'Passengers often arrive at the gate confused about hand baggage rules. Write a short proposal to your supervisor for improving information before and at the airport.', ['Describe the problem and effect on boarding', 'Suggest two or three actions', 'Explain benefits for passengers and staff', 'Say how to measure success'], 160],
  ]),
  speaking: speaking(role, 'avi', [
    ['a2', 'Explain to a passenger how to get from check-in to the gate.', ['Use simple directions', 'Mention passport control and security', 'Say when to be at the gate'], 45],
    ['b1', 'Make a clear announcement about a one-hour delay, then answer a passenger who is worried about a connection.', ['Give the flight, reason and time', 'Explain what passengers should do', 'Answer calmly without over-promising'], 60],
    ['b2', 'Your team often gets short notice of gate changes, and passengers are upset. Explain the problem to your manager and persuade them to change the process.', ['Describe the effect on passengers', 'Propose a clear solution', 'Answer one likely objection'], 90],
  ]),
};
