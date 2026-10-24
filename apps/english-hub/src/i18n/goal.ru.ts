/** Russian strings for the goal date plan. Same keys as goal.en.ts. */
export const goalRu: Partial<Record<string, string>> = {
  // Status
  'goalPlan.status.no_level': 'Уровень не определён',
  'goalPlan.status.reached': 'Цель достигнута',
  'goalPlan.status.no_date': 'Дата не выбрана',
  'goalPlan.status.date_passed': 'Дата прошла',
  'goalPlan.status.not_enough_data': 'Пока мало данных',
  'goalPlan.status.on_track': 'Всё по плану',
  'goalPlan.status.slightly_behind': 'Небольшое отставание',
  'goalPlan.status.behind': 'Отставание',

  // Goal line
  'goalPlan.targetBy': '{level} к {date}',
  'goalPlan.targetNoDate': '{level} · дата не выбрана',
  'goalPlan.noTarget': 'Целевой уровень не выбран',

  // One-line advice
  'goalPlan.advice.no_level': 'Пройдите тест на уровень, чтобы мы составили план.',
  'goalPlan.advice.noTarget': 'Выберите целевой уровень и дату, чтобы увидеть план.',
  'goalPlan.advice.no_date': 'Выберите дату для {level}, и мы покажем, сколько заниматься в неделю.',
  'goalPlan.advice.reached': 'Вы достигли уровня {level} в проверенных навыках. Пора выбрать новую цель.',
  'goalPlan.advice.date_passed': 'Дата цели уже прошла. Выберите новую, чтобы сохранить план.',
  'goalPlan.advice.not_enough_data': 'Позанимайтесь неделю, и мы покажем ваш темп. Ориентир — около {minutes} мин в неделю.',
  'goalPlan.advice.not_enough_data_noDate': 'Позанимайтесь неделю, и мы покажем ваш темп.',
  'goalPlan.advice.on_track': 'Так держать: в этом темпе вы достигнете {level} примерно к {date}.',
  'goalPlan.advice.on_track_soon': 'Так держать: в этом темпе вы достигнете {level} раньше срока.',
  'goalPlan.advice.slightly_behind': 'Занимайтесь около {minutes} мин в неделю, чтобы достичь {level} к {date}.',
  'goalPlan.advice.behind': 'Нужно около {minutes} мин в неделю. Попробуйте по {daily} мин в день.',
  'goalPlan.advice.behind_noDaily': 'Нужно около {minutes} мин в неделю, чтобы достичь {level} к {date}.',
  'goalPlan.advice.check': 'Вы уже позанимались примерно столько часов, сколько мы рассчитали. Пройдите проверку уровня — возможно, вы уже выросли.',

  // Actions
  'goalPlan.cta.setDate': 'Выбрать дату',
  'goalPlan.cta.newDate': 'Выбрать новую дату',
  'goalPlan.cta.newTarget': 'Выбрать новую цель',
  'goalPlan.cta.raiseDaily': 'Увеличить время в день',
  'goalPlan.cta.change': 'Изменить цель',
  'goalPlan.cta.check': 'Пройти проверку уровня',
  'goalPlan.cta.plan': 'Посмотреть план',

  // Today card
  'goalPlan.card.title': 'Ваша цель',
  'goalPlan.card.week': 'На этой неделе: {minutes} из {target} мин',
  'goalPlan.card.weekLabel': 'Время занятий на этой неделе',

  // Progress panel
  'goalPlan.panel.title': 'План к цели',
  'goalPlan.panel.target': 'Цель',
  'goalPlan.panel.hours': 'Нужно часов учёбы',
  'goalPlan.panel.hoursValue': '{low}–{high} ч',
  'goalPlan.panel.hoursHint': 'осталось около {hours} ч',
  'goalPlan.panel.pace': 'Ваш темп',
  'goalPlan.panel.paceValue': '{minutes} мин/нед.',
  'goalPlan.panel.paceHint': 'в среднем за 4 недели',
  'goalPlan.panel.paceNew': 'с первой недели занятий',
  'goalPlan.panel.projected': 'Достигнете примерно',
  'goalPlan.panel.projectedNone': 'пока неизвестно',
  'goalPlan.panel.needed': 'Чтобы достичь {level} к {date}: около {minutes} мин в неделю ({daily} мин в день).',
  'goalPlan.panel.doneSince': 'С последней проверки уровня вы занимались {hours} ч.',
  'goalPlan.panel.weeksTitle': 'Минуты по неделям',
  'goalPlan.panel.weeksLabel': 'Минуты занятий за каждую из последних 8 недель',
  'goalPlan.panel.weekBar': 'Неделя с {date}: {minutes} мин',
  'goalPlan.panel.targetLine': 'Цель на неделю: {minutes} мин',
  'goalPlan.panel.noPractice': 'За последние 8 недель занятий пока нет.',
  'goalPlan.estimateNote': 'Часы — это оценка по руководству Cambridge English о часах обучения для каждого уровня CEFR, усреднённая по вашим навыкам. Каждый учится в своём темпе; ежемесячная проверка уровня помогает держать план честным.',

  // Settings
  'goalPlan.settings.title': 'Дата цели',
  'goalPlan.settings.lead': 'Выберите нужный уровень и срок. Мы превратим это во время занятий на каждую неделю.',
  'goalPlan.settings.level': 'Целевой уровень',
  'goalPlan.settings.date': 'Достичь к',
  'goalPlan.settings.clear': 'Без даты',
  'goalPlan.settings.in3': 'Через 3 месяца',
  'goalPlan.settings.in6': 'Через 6 месяцев',
  'goalPlan.settings.in12': 'Через год',
  'goalPlan.settings.daily': 'Время занятий в день',
  'goalPlan.settings.suggest': 'Для вашего плана нужно около {minutes} мин в день.',
  'goalPlan.settings.useSuggest': 'Поставить {minutes} мин в день',
  'goalPlan.settings.save': 'Сохранить цель',
  'goalPlan.settings.saved': 'Цель сохранена.',
  'goalPlan.settings.error': 'Не удалось сохранить цель. Попробуйте ещё раз.',
  'goalPlan.settings.badDate': 'Выберите дату после сегодняшней и не дальше чем через пять лет.',

  // Onboarding step
  'goalPlan.onboarding.title': 'Когда вы хотите достичь {level}?',
  'goalPlan.onboarding.body': 'Необязательно. С датой мы покажем, сколько заниматься в неделю и успеваете ли вы.',
  'goalPlan.onboarding.save': 'Начать учиться',
  'goalPlan.onboarding.skip': 'Пропустить',
};
