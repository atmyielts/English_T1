import type { CalibrationRun, CalibrationSample } from '../../src/types.ts';

// Writing Task 1 calibration set: eight Academic reports and two General Training
// letters, bands 4 to 8, each with three recorded assessor runs. Tasks, data and
// responses are original Schood practice material; every figure is invented.
// A few evidence quotes in the runs are deliberate paraphrases (not in the text)
// so the evidence check is exercised.

export const writingTask1Calibration: { samples: CalibrationSample[]; runs: Record<string, CalibrationRun[]> } = {
  samples: [
    {
      id: 'w1.b4.bar-cinema',
      task:
        'Writing Task 1 (Academic). The bar chart below shows the number of cinema tickets sold in five countries in 2000 and 2020. ' +
        'Data (millions of tickets, 2000 → 2020): Country A 42 → 26; Country B 31 → 35; Country C 18 → 29; Country D 25 → 14; Country E 9 → 17. Figures are invented for practice. ' +
        'Summarise the information by selecting and reporting the main features, and make comparisons where relevant. Write at least 150 words.',
      response:
        'The bar chart show the cinema tickets which was sold in five country in 2000 year and 2020 year.\n\n' +
        'In Country A people buy 42 millions tickets in 2000 but in 2020 it is decrease to 26 millions. Country B is increase from 31 to 35, it is not big change. Country C also increased on 11 millions and in 2020 it was 29. In Country D the tickets was 25 millions and after it become 41. Country E is the lowest, only 9 millions and then 17.\n\n' +
        'Firstly, Country A is the most popular for cinema. Secondly, Country E is not popular because people like watch films in home. In conclusion, the cinema is very popular in all country and people go more and more every year.',
      reference: { task_achievement: 4, coherence_cohesion: 4, lexical_resource: 4, grammatical_range_accuracy: 4 },
      rationale:
        'At 128 words the report is under the 150-word minimum, has no overview, misreports Country D (14, not 41) and wrongly concludes that ticket sales rose everywhere, so TA is 4. ' +
        'Mechanical Firstly/Secondly, very limited vocabulary (42 millions tickets, in 2000 year) and frequent basic errors (the chart show, it is decrease, in all country) keep CC, LR and GRA at 4.',
    },
    {
      id: 'w1.b4.gt-complaint',
      task:
        "Writing Task 1 (General Training). You recently ordered a desk and a chair from an online furniture shop. When the delivery arrived, there were several problems. Write a letter to the shop's customer service department. " +
        'In your letter: explain what you ordered and when it arrived; describe the problems with the delivery; say what you would like the shop to do and by when. ' +
        'Write at least 150 words. You do NOT need to write any addresses at the top of your letter. Begin your letter as follows: Dear Sir or Madam,',
      response:
        'Dear Sir or Madam,\n\n' +
        'I am writing for complain about my order. Two weeks ago I am order one desk and one chair from your internet shop, it was cost 240 dollars. The delivery come on 3 March but you promise 1 March.\n\n' +
        'When I open the boxes I see many problem. The desk have big scratch on the top and one leg is broken. Also for chair there is not screws, so I can not build it. I am very angry because I need this desk for my study and my exam is soon.\n\n' +
        'So I want that you give my money back or you send new desk. If you will not do this I will write bad comment in internet for everybody. Please answer me fast.\n\n' +
        'Yours faithfully,\nAziz Karimov',
      reference: { task_achievement: 4, coherence_cohesion: 5, lexical_resource: 4, grammatical_range_accuracy: 4 },
      rationale:
        'The letter is under 150 words, ends with a threat and a demand (Please answer me fast) that do not suit a formal complaint, and never says by when the shop should act, so TA is 4. ' +
        'Paragraphs follow the three bullet points, which lifts CC to 5, but frequent verb-form errors (I am order, it was cost, The desk have) and very basic vocabulary keep LR and GRA at 4.',
    },
    {
      id: 'w1.b5.line-energy',
      task:
        'Writing Task 1 (Academic). The line graph below shows the percentage of electricity produced from coal, natural gas and renewable sources in one country between 1995 and 2020. ' +
        'Data (% of all electricity; other sources make up the rest): 1995 — coal 62, gas 25, renewables 5; 2000 — coal 58, gas 28, renewables 6; 2005 — coal 51, gas 33, renewables 8; 2010 — coal 44, gas 37, renewables 12; 2015 — coal 33, gas 38, renewables 21; 2020 — coal 22, gas 36, renewables 34. Figures are invented for practice. ' +
        'Summarise the information by selecting and reporting the main features, and make comparisons where relevant. Write at least 150 words.',
      response:
        'The line graph illustrates how much electricity was produced from coal, gas and renewable energy in one country from 1995 to 2020.\n\n' +
        'Overall, coal was decreased and renewable energy increased a lot.\n\n' +
        'In 1995 coal was the main source with 62%. After that it decreased steadily and in 2010 it was 44%. In 2020 it fell to 22% which is the lowest point. Gas was 25% in 1995 and it increased to 38% in 2015, but then it is little bit decreased to 36% in 2020.\n\n' +
        'Renewable energy was very low at the start, only 5%, and in 2000 it was 6%. From 2005 it began to grow fast and in 2015 it reached 21%. In 2020 it was 34%, so it was more than gas.\n\n' +
        'To sum up, coal is going down and the other two is going up, and in the future renewable will be the most popular.',
      reference: { task_achievement: 5, coherence_cohesion: 5, lexical_resource: 5, grammatical_range_accuracy: 5 },
      rationale:
        'There is an overview, but it ignores gas, the claim that renewables overtook gas in 2020 (34% against 36%) is wrong and the ending speculates about the future, so TA is 5. ' +
        'Paragraphs follow each fuel with basic linking, vocabulary is adequate but repetitive (decreased, increased a lot), and errors such as coal was decreased and the other two is going up recur, so CC, LR and GRA are 5.',
    },
    {
      id: 'w1.b5.pie-household',
      task:
        'Writing Task 1 (Academic). The two pie charts below show how the average monthly budget of households in one city was divided between six categories in 2005 and 2025. ' +
        'Data (% of monthly spending): 2005 — food 34, housing 28, transport 12, utilities 10, leisure 6, other 10; 2025 — housing 38, food 22, transport 15, leisure 11, utilities 9, other 5. Figures are invented for practice. ' +
        'Summarise the information by selecting and reporting the main features, and make comparisons where relevant. Write at least 150 words.',
      response:
        'The two pie charts show how much money a household in one city spent on different things in 2005 and 2025. Each chart has six parts.\n\n' +
        'In 2005, families spent 34% on food. Housing was 28% and transport was 12%. Utilities were 10% and other things were also 10%. Leisure was only 6%, which was the smallest part.\n\n' +
        'In 2025, housing was 38%, which was the biggest part of the chart. Food was 22% and transport was 15%. Leisure was 11% and utilities were 9%. Other things were 5%.\n\n' +
        'Firstly, the percentage of food decreased from 34% to 22%. Secondly, the percentage of housing increased from 28% to 38%. Thirdly, leisure increased from 6% to 11%. Transport also increased by 3%, while utilities decreased by 1%. Other things decreased by 5%, from 10% to 5%, and leisure was almost doubled.\n\n' +
        'In conclusion, there were many changes in the spending of households between 2005 and 2025.',
      reference: { task_achievement: 5, coherence_cohesion: 5, lexical_resource: 5, grammatical_range_accuracy: 6 },
      rationale:
        'Every figure is listed but there is no overview of the main change (housing replacing food as the largest share), and the conclusion only says there were many changes, so TA is 5; the Firstly/Secondly/Thirdly list is mechanical and vocabulary keeps repeating was and other things, so CC and LR are 5. ' +
        'Sentences are mostly accurate, with a relative clause and a while-contrast, so GRA is 6.',
    },
    {
      id: 'w1.b6.table-transport',
      task:
        'Writing Task 1 (Academic). The table below shows how commuters in one city travelled to work in 2004, 2014 and 2024. ' +
        'Data (% of commuters in 2004 / 2014 / 2024): car 48 / 42 / 31; bus 27 / 24 / 18; metro 9 / 16 / 27; bicycle 4 / 6 / 13; walking 12 / 12 / 11. Figures are invented for practice. ' +
        'Summarise the information by selecting and reporting the main features, and make comparisons where relevant. Write at least 150 words.',
      response:
        'The table gives information about the ways which people in one city used to travel to work in 2004, 2014 and 2024.\n\n' +
        'Overall, the car was the most common way of commuting during the whole period, although its share fell considerably, while the metro and cycling became much more popular.\n\n' +
        'In 2004, almost half of commuters (48%) went to work by car, and this figure dropped to 42% in 2014 and to 31% in 2024. Buses showed similar trend, falling from 27% to 18%. In contrast, the metro was used by only 9% of workers at the beginning, but this number has tripled to 27% in 2024, so it almost reached the car.\n\n' +
        'The percentage of people who cycled was the lowest in 2004 with 4%, however it rose gradually to 13% in the last year. Walking stayed nearly the same, at around 11-12% in all three years.\n\n' +
        'In general, the city commuters are changing from cars and buses to metro and bicycle.',
      reference: { task_achievement: 6, coherence_cohesion: 6, lexical_resource: 6, grammatical_range_accuracy: 6 },
      rationale:
        'A clear overview and accurate figures for every mode lift TA to 6, though the final paragraph only repeats the overview. ' +
        'Linking is generally effective with some mechanical use, vocabulary is adequate with awkward choices (so it almost reached the car), and errors such as the ways which people, similar trend and has tripled ... in 2024 do not block meaning, so CC, LR and GRA are 6.',
    },
    {
      id: 'w1.b6.gt-request',
      task:
        'Writing Task 1 (General Training). You are a member of a local sports centre and would like to book its main hall for a family celebration. Write a letter to the centre manager, Mrs Lewis. ' +
        'In your letter: explain what the celebration is and when it will take place; say what you will need for the event; ask about the cost and any rules you need to follow. ' +
        'Write at least 150 words. You do NOT need to write any addresses at the top of your letter. Begin your letter as follows: Dear Mrs Lewis,',
      response:
        'Dear Mrs Lewis,\n\n' +
        'I am a member of your sports centre since three years and I am writing to ask if it is possible to book the main hall for a family celebration.\n\n' +
        'My parents will celebrate their 30th wedding anniversary on Saturday 14 June, and we would like to organise a party for about 60 guests from 6 pm to 11 pm. Our flat is too small for so many people, that is why I thought about your hall, which is big and comfortable.\n\n' +
        'For the event we will need around eight tables and chairs for all guests. Also, it would be great if we can use the sound system, because my brother wants to play music and make a speech. We will bring the food by ourself from a restaurant.\n\n' +
        'Could you please tell me how much does it cost to rent the hall for five hours? I would also like to know if there are any rules, for example about decorations or the finishing time.\n\n' +
        'I look forward to hear from you.\n\n' +
        'Best regards,\nDilnoza Rahimova',
      reference: { task_achievement: 6, coherence_cohesion: 6, lexical_resource: 6, grammatical_range_accuracy: 5 },
      rationale:
        'All three bullet points are covered with relevant detail in a suitable semi-formal tone, so TA is 6, and the paragraphing and vocabulary fit the purpose (CC and LR 6). ' +
        'Repeated errors in common structures (a member since three years, how much does it cost inside an indirect question, by ourself, look forward to hear) hold GRA at 5.',
    },
    {
      id: 'w1.b7.process-recycling',
      task:
        'Writing Task 1 (Academic). The diagram below shows how used glass bottles are recycled. ' +
        'Stages (a cycle): 1 empty bottles left at bottle banks; 2 collected and taken by lorry to a recycling plant; 3 sorted by colour (clear, green, brown); 4 washed to remove labels and lids; 5 crushed into small pieces (cullet); 6 cullet mixed with sand, soda ash and limestone; 7 melted in a furnace at about 1,500°C; 8 liquid glass poured into moulds to form new bottles; 9 bottles cooled and inspected; 10 delivered to drinks companies, filled and sold in shops, then back to consumers. Figures are invented for practice. ' +
        'Summarise the information by selecting and reporting the main features, and make comparisons where relevant. Write at least 150 words.',
      response:
        'The diagram illustrates the stages by which used glass bottles are collected and turned into new ones that return to shops.\n\n' +
        'Overall, the process is cyclical and consists of ten steps, beginning with the collection of empty bottles and ending with the delivery of new bottles to drinks companies. The main part of the cycle take place at a recycling plant, where the glass is cleaned, crushed and melted.\n\n' +
        'To begin with, consumers leave their empty bottles at bottle banks, from which they are collected and taken by lorry to a recycling plant. There, the bottles are sorted according to colour into clear, green and brown glass, and then washed so that labels and lids are removed. Next, the clean glass is crushed into small pieces known as cullet.\n\n' +
        'At the following stage, the cullet is mixed with sand, soda ash and limestone and melted in a furnace at about 1,500°C. The liquid glass is then poured into moulds to form new bottles, which are cooled and inspected for faults. Finally, the finished bottles are delivered to drinks companies, filled and sold again in shops.',
      reference: { task_achievement: 7, coherence_cohesion: 7, lexical_resource: 7, grammatical_range_accuracy: 7 },
      rationale:
        'A clear overview names the cycle, its start and its end, and every stage is reported in order, so TA is 7; it stops short of 8 because the stages are reported rather than grouped into phases. ' +
        'Sequencing is well managed with varied markers, process vocabulary is precise (cullet, poured into moulds, inspected for faults) and passives are used flexibly with one slip (the cycle take place), so CC, LR and GRA are 7.',
    },
    {
      id: 'w1.b7.bar-internet',
      task:
        'Writing Task 1 (Academic). The bar chart below shows the percentage of adults in four age groups who used the internet every day in one country in 2010 and 2022. ' +
        'Data (% of each age group, 2010 → 2022): 16–24 78 → 97; 25–44 64 → 93; 45–64 38 → 81; 65 and over 12 → 54. Figures are invented for practice. ' +
        'Summarise the information by selecting and reporting the main features, and make comparisons where relevant. Write at least 150 words.',
      response:
        'The bar chart compares the proportion of adults in four age groups who went online every day in one country in 2010 and 2022.\n\n' +
        'Overall, daily internet use increased in every age group over the period, and it was always the younger people who were most likely to be online. However, the gap between the youngest and oldest group narrowed significantly.\n\n' +
        'In 2010, more than three quarters of 16–24 year olds (78%) used the internet daily, compared with 64% of those aged 25 to 44. The figure for the 45–64 group were only 38%, while just 12% of people over 65 was daily users.\n\n' +
        'By 2022, internet use among the two youngest groups had become almost universal, reaching 97% and 93% respectively. The most dramatic growth was seen among the older generations: the percentage of 45–64 year olds more than doubled to 81%, and the share of over-65s rose more than four times, to 54%. As a result, the difference between youngest and oldest groups fell from 66 to 43 percentage points.',
      reference: { task_achievement: 7, coherence_cohesion: 7, lexical_resource: 7, grammatical_range_accuracy: 6 },
      rationale:
        'The overview captures both the rise in every group and the narrowing gap, and the figures are accurate and well chosen, so TA is 7; progression is clear and vocabulary is strong (almost universal, the most dramatic growth), so CC and LR are 7. ' +
        'Two agreement errors (The figure ... were, 12% of people ... was) and missing articles (between youngest and oldest groups) hold GRA at 6.',
    },
    {
      id: 'w1.b8.line-tourism',
      task:
        'Writing Task 1 (Academic). The line graph below shows the number of international visitors to three coastal regions of one country between 2000 and 2020. ' +
        'Data (millions of visitors; East Coast / South Coast / Islands): 2000 — 2.4 / 5.1 / 0.8; 2005 — 2.9 / 5.6 / 1.1; 2010 — 3.1 / 5.3 / 2.0; 2015 — 3.0 / 4.6 / 3.7; 2020 — 3.3 / 4.2 / 5.5. Figures are invented for practice. ' +
        'Summarise the information by selecting and reporting the main features, and make comparisons where relevant. Write at least 150 words.',
      response:
        'The line graph tracks the number of international tourists visiting three coastal regions of one country at five-year intervals between 2000 and 2020.\n\n' +
        'Overall, the most striking development was the rapid rise of the Islands, which went from being the least visited destination to the most popular one. The South Coast, by contrast, lost its leading position after peaking in 2005, while visitor numbers on the East Coast remained relatively stable.\n\n' +
        'At the start of the period, the South Coast attracted 5.1 million visitors, more than double the figure of the East Coast (2.4 million) and over six times that for the Islands (0.8 million). The South Coast grew slightly to 5.6 million in 2005 but then went into steady decline, ending at 4.2 million.\n\n' +
        'The Islands, meanwhile, saw consistent and accelerating growth, with numbers more than doubling between 2010 and 2020 to reach 5.5 million, overtaking the South Coast at some point after 2015. The East Coast followed a much flatter path, edging up from 2.4 million to 3.3 million over the two decades, with only a minor dip in 2015.',
      reference: { task_achievement: 8, coherence_cohesion: 8, lexical_resource: 8, grammatical_range_accuracy: 8 },
      rationale:
        'A sharp overview names the key reversal, and every trend is supported by accurate, well-selected figures, so TA is 8. ' +
        'Information is grouped by region with skilful linking (by contrast, meanwhile), vocabulary is precise and natural (went into steady decline, edging up), and the only slip is the figure of the East Coast, so CC, LR and GRA are 8.',
    },
    {
      id: 'w1.b8.table-water',
      task:
        'Writing Task 1 (Academic). The table below shows the average amount of water used per person per day, in litres, for five purposes in three cities in 2023. ' +
        'Data (litres per person per day; City A / City B / City C): bathing and showering 58 / 41 / 22; toilet flushing 44 / 30 / 18; laundry 25 / 19 / 14; drinking and cooking 9 / 8 / 7; garden and outdoor use 49 / 12 / 4; total 185 / 110 / 65. Figures are invented for practice. ' +
        'Summarise the information by selecting and reporting the main features, and make comparisons where relevant. Write at least 150 words.',
      response:
        'The table compares how much water an average resident of three cities, A, B and C, used each day in 2023, broken down by five purposes.\n\n' +
        'Overall, residents of City A consumed by far the most water, almost three times as much as people in City C, and the largest differences between the cities were in outdoor use. In all three cities, bathing and showering accounted for the biggest share of daily use, whereas drinking and cooking needed relatively little water everywhere.\n\n' +
        'Daily consumption per person totalled 185 litres in City A, compared with 110 litres in City B and only 65 litres in City C. Bathing and showering used 58 litres a day in City A, 41 in City B and 22 in City C, and toilet flushing followed the same pattern, at 44, 30 and 18 litres respectively. Laundry used between 14 and 25 litres in each city.\n\n' +
        'The most dramatic contrast was in garden and outdoor use. In City A this used 49 litres per person, which was more than a quarter of the total, while in City B the figure was just 12 litres and in City C it was only 4 litres. By comparison, the amount of water used for drinking and cooking was very similar everywhere, ranging from 7 to 9 litres.',
      reference: { task_achievement: 8, coherence_cohesion: 8, lexical_resource: 7, grammatical_range_accuracy: 8 },
      rationale:
        'The overview identifies the totals and the outdoor-use contrast, all figures are accurate and grouped meaningfully, and grammar is wide-ranging and almost error-free, so TA, CC and GRA are 8. ' +
        'The verb used is repeated again and again (Laundry used, this used, water used) and In City A this used is awkward, which shows less lexical flexibility, so LR is 7.',
    },
  ],
  runs: {
    'w1.b4.bar-cinema': [
      {
        criteria: {
          task_achievement: { score: 4, evidence: ['In Country D the tickets was 25 millions and after it become 41', 'people go more and more every year'] },
          coherence_cohesion: { score: 4, evidence: ['Firstly, Country A is the most popular for cinema', 'Secondly, Country E is not popular'] },
          lexical_resource: { score: 4, evidence: ['it is not big change', 'people like watch films in home'] },
          grammatical_range_accuracy: { score: 4, evidence: ['The bar chart show the cinema tickets which was sold', 'it is decrease to 26 millions'] },
        },
      },
      {
        criteria: {
          task_achievement: { score: 4, evidence: ['the cinema is very popular in all country and people go more and more every year', 'after it become 41'] },
          coherence_cohesion: { score: 5, evidence: ['In conclusion, the cinema is very popular', 'Country B is increase from 31 to 35'] },
          lexical_resource: { score: 4, evidence: ['42 millions tickets', 'in 2000 year and 2020 year'] },
          grammatical_range_accuracy: { score: 4, evidence: ['Country B is increase from 31 to 35, it is not big change', 'the tickets was 25 millions'] },
        },
      },
      {
        criteria: {
          task_achievement: { score: 5, evidence: ['Country C also increased on 11 millions and in 2020 it was 29', 'Country D rose to 41 millions'] },
          coherence_cohesion: { score: 4, evidence: ['Firstly, Country A', 'Secondly, Country E is not popular because people like watch films in home'] },
          lexical_resource: { score: 4, evidence: ['increased on 11 millions', 'the most popular for cinema'] },
          grammatical_range_accuracy: { score: 4, evidence: ['it become 41', 'in all country'] },
        },
      },
    ],
    'w1.b4.gt-complaint': [
      {
        criteria: {
          task_achievement: { score: 4, evidence: ['If you will not do this I will write bad comment in internet for everybody', 'Please answer me fast'] },
          coherence_cohesion: { score: 5, evidence: ['When I open the boxes I see many problem', 'So I want that you give my money back'] },
          lexical_resource: { score: 4, evidence: ['I am writing for complain', 'bad comment in internet'] },
          grammatical_range_accuracy: { score: 4, evidence: ['Two weeks ago I am order one desk', 'The desk have big scratch on the top'] },
        },
      },
      {
        criteria: {
          task_achievement: { score: 5, evidence: ['So I want that you give my money back or you send new desk', 'The delivery come on 3 March but you promise 1 March'] },
          coherence_cohesion: { score: 5, evidence: ['Also for chair there is not screws, so I can not build it', 'So I want that you give my money back'] },
          lexical_resource: { score: 4, evidence: ['your internet shop', 'I am very angry'] },
          grammatical_range_accuracy: { score: 5, evidence: ['I need this desk for my study and my exam is soon', 'it was cost 240 dollars'] },
        },
      },
      {
        criteria: {
          task_achievement: { score: 4, evidence: ['I will write bad comment in internet for everybody', 'Please answer me fast'] },
          coherence_cohesion: { score: 4, evidence: ['Also for chair', 'So I want that you give'] },
          lexical_resource: { score: 4, evidence: ['many problem', 'big scratch on the top'] },
          grammatical_range_accuracy: { score: 4, evidence: ['If you will not do this', 'there is not screws'] },
        },
      },
    ],
    'w1.b5.line-energy': [
      {
        criteria: {
          task_achievement: { score: 5, evidence: ['Overall, coal was decreased and renewable energy increased a lot', 'so it was more than gas'] },
          coherence_cohesion: { score: 5, evidence: ['After that it decreased steadily', 'To sum up, coal is going down'] },
          lexical_resource: { score: 5, evidence: ['decreased steadily', 'it is little bit decreased'] },
          grammatical_range_accuracy: { score: 5, evidence: ['coal was decreased', 'the other two is going up'] },
        },
      },
      {
        criteria: {
          task_achievement: { score: 5, evidence: ['In 2020 it was 34%, so it was more than gas', 'in the future renewable will be the most popular'] },
          coherence_cohesion: { score: 5, evidence: ['From 2005 it began to grow fast', 'To sum up'] },
          lexical_resource: { score: 6, evidence: ['the main source', 'renewables grew rapidly after 2005'] },
          grammatical_range_accuracy: { score: 5, evidence: ['which is the lowest point', 'then it is little bit decreased to 36% in 2020'] },
        },
      },
      {
        criteria: {
          task_achievement: { score: 4, evidence: ['so it was more than gas', 'renewable will be the most popular'] },
          coherence_cohesion: { score: 5, evidence: ['Overall, coal was decreased', 'After that it decreased steadily and in 2010 it was 44%'] },
          lexical_resource: { score: 5, evidence: ['began to grow fast', 'increased a lot'] },
          grammatical_range_accuracy: { score: 5, evidence: ['Gas was 25% in 1995 and it increased to 38% in 2015', 'coal was decreased'] },
        },
      },
    ],
    'w1.b5.pie-household': [
      {
        criteria: {
          task_achievement: { score: 5, evidence: ['In conclusion, there were many changes in the spending of households', 'Housing was 28% and transport was 12%'] },
          coherence_cohesion: { score: 5, evidence: ['Firstly, the percentage of food decreased', 'Thirdly, leisure increased'] },
          lexical_resource: { score: 5, evidence: ['other things were also 10%', 'Other things decreased by 5%'] },
          grammatical_range_accuracy: { score: 6, evidence: ['housing was 38%, which was the biggest part of the chart', 'while utilities decreased by 1%'] },
        },
      },
      {
        criteria: {
          task_achievement: { score: 5, evidence: ['there were many changes', 'Food was 22% and transport was 15%'] },
          coherence_cohesion: { score: 4, evidence: ['Secondly, the percentage of housing increased', 'Thirdly, leisure increased from 6% to 11%'] },
          lexical_resource: { score: 5, evidence: ['spent on different things', 'the biggest part of the chart'] },
          grammatical_range_accuracy: { score: 5, evidence: ['Utilities were 10% and other things were also 10%', 'Leisure was only 6%'] },
        },
      },
      {
        criteria: {
          task_achievement: { score: 5, evidence: ['In 2005, families spent 34% on food', 'there were many changes in the spending of households between 2005 and 2025'] },
          coherence_cohesion: { score: 5, evidence: ['Firstly, Secondly and Thirdly list the changes', 'Secondly, the percentage of housing'] },
          lexical_resource: { score: 5, evidence: ['Transport also increased by 3%', 'other things'] },
          grammatical_range_accuracy: { score: 5, evidence: ['Transport also increased by 3%, while utilities decreased by 1%'] },
        },
      },
    ],
    'w1.b6.table-transport': [
      {
        criteria: {
          task_achievement: { score: 6, evidence: ['the car was the most common way of commuting during the whole period', 'Walking stayed nearly the same'] },
          coherence_cohesion: { score: 6, evidence: ['In contrast, the metro was used by only 9% of workers', 'this figure dropped to 42% in 2014'] },
          lexical_resource: { score: 6, evidence: ['its share fell considerably', 'so it almost reached the car'] },
          grammatical_range_accuracy: { score: 6, evidence: ['Buses showed similar trend', 'this number has tripled to 27% in 2024'] },
        },
      },
      {
        criteria: {
          task_achievement: { score: 6, evidence: ['the metro and cycling became much more popular', 'the metro grew to almost the level of cars'] },
          coherence_cohesion: { score: 6, evidence: ['In contrast', 'In general, the city commuters are changing from cars and buses to metro and bicycle'] },
          lexical_resource: { score: 6, evidence: ['almost half of commuters', 'rose gradually'] },
          grammatical_range_accuracy: { score: 5, evidence: ['the ways which people in one city used to travel', 'with 4%, however it rose gradually'] },
        },
      },
      {
        criteria: {
          task_achievement: { score: 7, evidence: ['Overall, the car was the most common way of commuting during the whole period, although its share fell considerably', 'this number has tripled to 27% in 2024'] },
          coherence_cohesion: { score: 6, evidence: ['The percentage of people who cycled was the lowest in 2004', 'Buses showed similar trend'] },
          lexical_resource: { score: 6, evidence: ['way of commuting', 'the city commuters are changing'] },
          grammatical_range_accuracy: { score: 6, evidence: ['has tripled to 27% in 2024', 'Buses showed similar trend, falling from 27% to 18%'] },
        },
      },
    ],
    'w1.b6.gt-request': [
      {
        criteria: {
          task_achievement: { score: 6, evidence: ['My parents will celebrate their 30th wedding anniversary on Saturday 14 June', 'how much does it cost to rent the hall for five hours'] },
          coherence_cohesion: { score: 6, evidence: ['that is why I thought about your hall', 'I would also like to know if there are any rules'] },
          lexical_resource: { score: 6, evidence: ['organise a party for about 60 guests', 'the finishing time'] },
          grammatical_range_accuracy: { score: 5, evidence: ['I am a member of your sports centre since three years', 'how much does it cost to rent the hall', 'I look forward to hear from you'] },
        },
      },
      {
        criteria: {
          task_achievement: { score: 6, evidence: ['I am writing to ask if it is possible to book the main hall', 'we will need around eight tables and chairs'] },
          coherence_cohesion: { score: 6, evidence: ['For the event we will need', 'Also, it would be great'] },
          lexical_resource: { score: 6, evidence: ['family celebration', 'make a speech'] },
          grammatical_range_accuracy: { score: 6, evidence: ['it would be great if we can use the sound system', 'We will bring the food by ourself'] },
        },
      },
      {
        criteria: {
          task_achievement: { score: 6, evidence: ['for example about decorations or the finishing time', 'from 6 pm to 11 pm'] },
          coherence_cohesion: { score: 7, evidence: ['Our flat is too small for so many people, that is why I thought about your hall', 'I would also like to know'] },
          lexical_resource: { score: 6, evidence: ['too small for so many people', 'wedding anniversary'] },
          grammatical_range_accuracy: { score: 6, evidence: ['which is big and comfortable', 'by ourself'] },
        },
      },
    ],
    'w1.b7.process-recycling': [
      {
        criteria: {
          task_achievement: { score: 7, evidence: ['Overall, the process is cyclical and consists of ten steps', 'ending with the delivery of new bottles to drinks companies'] },
          coherence_cohesion: { score: 7, evidence: ['To begin with', 'At the following stage'] },
          lexical_resource: { score: 7, evidence: ['small pieces known as cullet', 'inspected for faults'] },
          grammatical_range_accuracy: { score: 7, evidence: ['from which they are collected and taken by lorry to a recycling plant', 'The main part of the cycle take place'] },
        },
      },
      {
        criteria: {
          task_achievement: { score: 7, evidence: ['the bottles are sorted according to colour into clear, green and brown glass', 'melted in a furnace at about 1,500°C'] },
          coherence_cohesion: { score: 7, evidence: ['Next, the clean glass is crushed', 'Finally, the finished bottles are delivered'] },
          lexical_resource: { score: 8, evidence: ['poured into moulds', 'sorted according to colour', 'filled and sold again in shops'] },
          grammatical_range_accuracy: { score: 6, evidence: ['The main part of the cycle take place at a recycling plant', 'washed so that labels and lids are removed'] },
        },
      },
      {
        criteria: {
          task_achievement: { score: 6, evidence: ['The diagram illustrates the stages', 'filled and sold again in shops'] },
          coherence_cohesion: { score: 7, evidence: ['There, the bottles are sorted', 'The liquid glass is then poured into moulds'] },
          lexical_resource: { score: 7, evidence: ['turned into new ones that return to shops', 'cyclical'] },
          grammatical_range_accuracy: { score: 7, evidence: ['which are cooled and inspected for faults', 'the main part of the cycle takes place'] },
        },
      },
    ],
    'w1.b7.bar-internet': [
      {
        criteria: {
          task_achievement: { score: 7, evidence: ['daily internet use increased in every age group over the period', 'fell from 66 to 43 percentage points'] },
          coherence_cohesion: { score: 7, evidence: ['However, the gap between the youngest and oldest group narrowed significantly', 'As a result'] },
          lexical_resource: { score: 7, evidence: ['had become almost universal', 'The most dramatic growth was seen among the older generations'] },
          grammatical_range_accuracy: { score: 6, evidence: ['The figure for the 45–64 group were only 38%', 'just 12% of people over 65 was daily users'] },
        },
      },
      {
        criteria: {
          task_achievement: { score: 7, evidence: ['reaching 97% and 93% respectively', 'internet use among older adults rose fastest'] },
          coherence_cohesion: { score: 7, evidence: ['compared with 64% of those aged 25 to 44', 'By 2022'] },
          lexical_resource: { score: 7, evidence: ['went online every day', 'more than doubled to 81%'] },
          grammatical_range_accuracy: { score: 7, evidence: ['By 2022, internet use among the two youngest groups had become almost universal', 'it was always the younger people who were most likely to be online'] },
        },
      },
      {
        criteria: {
          task_achievement: { score: 7, evidence: ['Overall, daily internet use increased in every age group', 'the share of over-65s rose more than four times, to 54%'] },
          coherence_cohesion: { score: 6, evidence: ['As a result, the difference between youngest and oldest groups fell', 'However'] },
          lexical_resource: { score: 6, evidence: ['rose more than four times', 'more than three quarters of 16–24 year olds'] },
          grammatical_range_accuracy: { score: 6, evidence: ['12% of people over 65 was daily users', 'between youngest and oldest groups'] },
        },
      },
    ],
    'w1.b8.line-tourism': [
      {
        criteria: {
          task_achievement: { score: 8, evidence: ['the most striking development was the rapid rise of the Islands', 'overtaking the South Coast at some point after 2015'] },
          coherence_cohesion: { score: 8, evidence: ['The South Coast, by contrast, lost its leading position', 'The Islands, meanwhile'] },
          lexical_resource: { score: 8, evidence: ['went into steady decline', 'edging up from 2.4 million to 3.3 million'] },
          grammatical_range_accuracy: { score: 8, evidence: ['which went from being the least visited destination to the most popular one', 'with numbers more than doubling between 2010 and 2020'] },
        },
      },
      {
        criteria: {
          task_achievement: { score: 8, evidence: ['more than double the figure of the East Coast (2.4 million)', 'lost its leading position after peaking in 2005'] },
          coherence_cohesion: { score: 7, evidence: ['At the start of the period', 'The East Coast followed a much flatter path'] },
          lexical_resource: { score: 8, evidence: ['consistent and accelerating growth', 'a minor dip in 2015'] },
          grammatical_range_accuracy: { score: 8, evidence: ['The South Coast grew slightly to 5.6 million in 2005 but then went into steady decline, ending at 4.2 million'] },
        },
      },
      {
        criteria: {
          task_achievement: { score: 7, evidence: ['while visitor numbers on the East Coast remained relatively stable', 'at five-year intervals between 2000 and 2020'] },
          coherence_cohesion: { score: 8, evidence: ['by contrast', 'meanwhile, saw consistent and accelerating growth'] },
          lexical_resource: { score: 8, evidence: ['the least visited destination', 'over six times that for the Islands'] },
          grammatical_range_accuracy: { score: 7, evidence: ['more than double the figure of the East Coast', 'went into steady decline'] },
        },
      },
    ],
    'w1.b8.table-water': [
      {
        criteria: {
          task_achievement: { score: 8, evidence: ['residents of City A consumed by far the most water, almost three times as much as people in City C', 'which was more than a quarter of the total'] },
          coherence_cohesion: { score: 8, evidence: ['toilet flushing followed the same pattern, at 44, 30 and 18 litres respectively', 'By comparison'] },
          lexical_resource: { score: 7, evidence: ['Laundry used between 14 and 25 litres', 'In City A this used 49 litres per person'] },
          grammatical_range_accuracy: { score: 8, evidence: ['which was more than a quarter of the total, while in City B the figure was just 12 litres', 'whereas drinking and cooking needed relatively little water everywhere'] },
        },
      },
      {
        criteria: {
          task_achievement: { score: 8, evidence: ['the largest differences between the cities were in outdoor use', 'ranging from 7 to 9 litres'] },
          coherence_cohesion: { score: 8, evidence: ['The most dramatic contrast was in garden and outdoor use', 'compared with 110 litres in City B'] },
          lexical_resource: { score: 8, evidence: ['broken down by five purposes', 'accounted for the biggest share of daily use'] },
          grammatical_range_accuracy: { score: 8, evidence: ['Daily consumption per person totalled 185 litres in City A, compared with 110 litres in City B and only 65 litres in City C'] },
        },
      },
      {
        criteria: {
          task_achievement: { score: 7, evidence: ['bathing and showering accounted for the biggest share of daily use', 'Laundry used between 14 and 25 litres in each city'] },
          coherence_cohesion: { score: 8, evidence: ['In all three cities', 'followed the same pattern'] },
          lexical_resource: { score: 7, evidence: ['Bathing and showering used 58 litres a day', 'outdoor activities took up the most water in City A'] },
          grammatical_range_accuracy: { score: 7, evidence: ['In City A this used 49 litres per person', 'almost three times as much as people in City C'] },
        },
      },
    ],
  },
};
