const VK_TOKEN = process.env.VK_COMMUNITY_TOKEN;
const APP_ID = process.env.VK_APP_ID;

if (!VK_TOKEN || !APP_ID) {
  console.error('Ошибка: не заданы секреты VK_COMMUNITY_TOKEN или VK_APP_ID');
  process.exit(1);
}

const GP_TRANSLATIONS = {
  'Bahrain Grand Prix': 'Гран-при Бахрейна',
  'Saudi Arabian Grand Prix': 'Гран-при Саудовской Аравии',
  'Australian Grand Prix': 'Гран-при Австралии',
  'Japanese Grand Prix': 'Гран-при Японии',
  'Chinese Grand Prix': 'Гран-при Китая',
  'Miami Grand Prix': 'Гран-при Майами',
  'Emilia Romagna Grand Prix': 'Гран-при Эмилии-Романьи',
  'Monaco Grand Prix': 'Гран-при Монако',
  'Canadian Grand Prix': 'Гран-при Канады',
  'Spanish Grand Prix': 'Гран-при Испании',
  'Austrian Grand Prix': 'Гран-при Австрии',
  'British Grand Prix': 'Гран-при Великобритании',
  'Hungarian Grand Prix': 'Гран-при Венгрии',
  'Belgian Grand Prix': 'Гран-при Бельгии',
  'Dutch Grand Prix': 'Гран-при Нидерландов',
  'Italian Grand Prix': 'Гран-при Италии',
  'Azerbaijan Grand Prix': 'Гран-при Азербайджана',
  'Singapore Grand Prix': 'Гран-при Сингапура',
  'United States Grand Prix': 'Гран-при США',
  'Mexico City Grand Prix': 'Гран-при Мехико',
  'São Paulo Grand Prix': 'Гран-при Сан-Паулу',
  'Las Vegas Grand Prix': 'Гран-при Лас-Вегаса',
  'Qatar Grand Prix': 'Гран-при Катара',
  'Abu Dhabi Grand Prix': 'Гран-при Абу-Даби'
};

function formatMsk(isoString) {
  const date = new Date(isoString);
  const d = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    weekday: 'short',
    timeZone: 'Europe/Moscow'
  }).format(date);
  const t = new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Moscow'
  }).format(date);
  return `${d}, ${t} МСК`;
}

function getCountdownText(raceIso) {
  const diff = new Date(raceIso).getTime() - Date.now();
  if (diff <= 0 && diff > -2.5 * 3600 * 1000) {
    return '🔴 Гонка идёт прямо сейчас!';
  }
  if (diff <= -2.5 * 3600 * 1000) {
    return '🏁 Гонка завершена';
  }
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  return `⏳ До старта гонки: ${days} дн. ${hours} ч.`;
}

async function run() {
  // 1. Загружаем данные ближайшего этапа
  const f1Res = await fetch('https://api.jolpi.ca/ergast/f1/current/next.json');
  const f1Json = await f1Res.json();
  const race = f1Json?.MRData?.RaceTable?.Races?.[0];

  if (!race) {
    throw new Error('Не удалось получить данные о ближайшем этапе от Jolpica API');
  }

  const ruName = GP_TRANSLATIONS[race.raceName] || race.raceName;
  const raceIso = `${race.date}T${race.time}`;
  const countdownText = getCountdownText(raceIso);
  const appUrl = `https://vk.com/app${APP_ID}`;

  // 2. Собираем список сессий
  const rawSessions = [];
  if (race.FirstPractice) rawSessions.push({ name: 'Первая практика (FP1)', ...race.FirstPractice });
  if (race.SecondPractice) rawSessions.push({ name: 'Вторая практика (FP2)', ...race.SecondPractice });
  if (race.ThirdPractice) rawSessions.push({ name: 'Третья практика (FP3)', ...race.ThirdPractice });
  if (race.SprintQualifying) rawSessions.push({ name: 'Спринт-квалификация', ...race.SprintQualifying });
  if (race.Sprint) rawSessions.push({ name: 'Спринт', ...race.Sprint });
  if (race.Qualifying) rawSessions.push({ name: 'Квалификация', ...race.Qualifying });
  rawSessions.push({ name: '🏁 ГОНКА', date: race.date, time: race.time });

  const sorted = rawSessions
    .filter((s) => s.date && s.time)
    .map((s) => ({ ...s, iso: `${s.date}T${s.time}`, ts: new Date(`${s.date}T${s.time}`).getTime() }))
    .sort((a, b) => a.ts - b.ts);

  // 3. Формируем JSON для виджета ВКонтакте типа "table"
  const bodyRows = sorted.map((s) => [
    { text: s.name, url: appUrl },
    { text: formatMsk(s.iso) }
  ]);

  const widgetPayload = {
    title: `${ruName} • ${countdownText}`,
    title_url: appUrl,
    head: [
      { text: 'Сессия' },
      { text: 'Начало (МСК)', align: 'right' }
    ],
    body: bodyRows,
    more: 'Открыть живой таймер и выбрать свой часовой пояс →',
    more_url: appUrl
  };

  // 4. Отправляем в VK API (appWidgets.update)
  const params = new URLSearchParams({
    type: 'table',
    code: `return ${JSON.stringify(widgetPayload)};`,
    access_token: VK_TOKEN,
    v: '5.199'
  });

  const vkRes = await fetch('https://api.vk.com/method/appWidgets.update', {
    method: 'POST',
    body: params
  });
  const vkData = await vkRes.json();

  if (vkData.error) {
    console.error('Ошибка VK API:', vkData.error);
    process.exit(1);
  }

  console.log('Виджет успешно обновлён:', vkData);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
