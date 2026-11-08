// Bank items for tourism staff and guides. Original Schood content; companies are fictional.
import { grammar, listening, reading, speaking, vocabulary, writing, type RoleBank } from './_compact.ts';

const role = 'tourism';
export const bank: RoleBank = {
  grammar: grammar(role, 'tou', [
    ['a2', 'The tourists ___ to Khiva by train last Monday.', ['go', 'went', 'gone', 'going'], 1],
    ['a2', 'This mosque is one of the ___ buildings in the city.', ['old', 'older', 'oldest', 'most old'], 2],
    ['b1', 'The madrasah ___ in the fifteenth century.', ['was built', 'built', 'is building', 'has built'], 0],
    ['b1', 'If it rains tomorrow, we ___ the museum instead.', ['visit', 'visited', 'will visit', 'would visit'], 2],
    ['b2', 'By the time we reached the hotel, the guests ___ for two hours.', ['waited', 'have waited', 'were waiting', 'had been waiting'], 3],
    ['c1', 'Rarely ___ a guide met such a well-informed group.', ['has', 'does', 'is', 'was'], 0],
  ]),
  vocabulary: vocabulary(role, 'tou', [
    ['a2', 'Please put your ___ on the bus. We leave in ten minutes.', ['luggage', 'ticket office', 'lunch break', 'guide'], 0],
    ['a2', 'Tourists like to buy small ___ to remember their trip.', ['receipts', 'souvenirs', 'passports', 'schedules'], 1],
    ['b1', 'The ___ of the tour shows what you will do on each day.', ['itinerary', 'invoice', 'inventory', 'interview'], 0],
    ['b1', 'The blue ___ on top of the building can be seen from far away.', ['carpet', 'wall', 'dome', 'gate'], 2],
    ['b1', 'A hotel room and meals are ___ in the price of the tour.', ['contained', 'included', 'involved', 'invited'], 1],
    ['b2', 'We are fully booked in April because it is ___ season.', ['heavy', 'top-level', 'high', 'big'], 2],
    ['b2', 'Could you ___ a car to the airport for early tomorrow?', ['arrange', 'attend', 'adjust', 'advise'], 0],
    ['c1', 'Many of the old merchant houses have been carefully ___ to their original state.', ['refunded', 'restored', 'resumed', 'reserved'], 1],
  ]),
  reading: [
    reading('r-tou-01', role, 'b1', 'email', 'Your Trip to Samarkand and Bukhara', `Dear Mr and Mrs Baker,

Thank you for booking with Oq Karvon Travel. Here is some information for your trip next month.

Your driver will meet you at Tashkent airport with a sign showing your name. On Tuesday you will take the fast train to Samarkand. Please keep your passports with you, because they are checked at the station. Your guide in Samarkand, Dilnoza, will wait for you on the platform.

The weather in May is warm during the day but can be cool at night, so please bring a light jacket. Mosques ask visitors to cover their shoulders and knees. Most small shops only take cash, so we recommend changing some money at the airport.

If your flight is delayed, please call our 24-hour number. We will tell the driver.

Best regards,
Madina`, [
      ['Who will meet them at the airport?', ['A driver', 'Their guide', 'Madina', 'A hotel manager'], 0],
      ['Why should they keep their passports with them on Tuesday?', ['To change money', 'To enter a mosque', 'Because they are checked at the station', 'To check in at the hotel'], 2],
      ['What should they bring for the evenings?', ['A warm coat', 'A light jacket', 'An umbrella', 'A hat'], 1],
      ['What should they do if their flight is late?', ['Take a taxi', 'Wait at the airport', 'Email Dilnoza', 'Call the 24-hour number'], 3],
    ]),
  ],
  listening: [
    listening('l-tou-01', role, 'b1', 'announcement', 'A Guide’s Briefing on the Bus', [
      ['Guide', 'Good morning, everyone. We are now leaving Samarkand, and we should reach Bukhara at about two o’clock.'],
      ['Guide', 'We will stop for twenty minutes near Navoi. There are clean toilets and a small cafe there.'],
      ['Guide', 'Lunch today is not on the bus, as the programme said. We have changed it. We will eat in Bukhara at a family house, so it will be a little late.'],
      ['Guide', 'If you are hungry, there are apples and bread at the front of the bus. Please help yourselves.'],
      ['Guide', 'After lunch you can rest at the hotel for an hour. Our walking tour of the old city starts at five, when it is cooler.'],
    ], [
      ['How long is the stop near Navoi?', ['Ten minutes', 'Twenty minutes', 'One hour', 'Two hours'], 1],
      ['What has changed in the programme?', ['The hotel', 'The date', 'Where they eat lunch', 'The guide'], 2],
      ['When does the walking tour start?', ['At two o’clock', 'At three o’clock', 'At five o’clock', 'At seven o’clock'], 2],
    ]),
  ],
  writing: writing(role, 'tou', [
    ['b1', 'A tourist has asked by email what to pack and wear for a trip to Uzbekistan in July. Write a helpful reply.', ['Describe the weather', 'Suggest clothes and practical items', 'Mention how to dress for religious places', 'Offer more help'], 90],
    ['b2', 'A tour group complained that the programme was too rushed. Write a short report to your manager with their comments and your proposals for a better itinerary.', ['Summarise the complaints', 'Explain what caused the problem', 'Propose specific changes', 'Say how to check improvement'], 160],
  ]),
  speaking: speaking(role, 'tou', [
    ['a2', 'Tell a visitor about a place you like in your city or region. Where is it and what can people do there?', ['Where it is', 'What people can see or do', 'Why you like it'], 45],
    ['b1', 'The bus has broken down and your group must wait an hour. Speak to the group as you would on the day.', ['Say what has happened', 'Apologise and explain the plan', 'Keep people comfortable and positive'], 60],
    ['b2', 'Persuade a foreign travel agent to include your region in their next tour programme.', ['Say what makes the region special', 'Explain practical advantages', 'Suggest a clear next step'], 90],
  ]),
};
