// 1. Инициализация VK Bridge и автоопределение темы ВК
if (window.vkBridge) {
  vkBridge.send('VKWebAppInit');
  vkBridge.subscribe((e) => {
    if (e.detail.type === 'VKWebAppUpdateConfig') {
      const scheme = e.detail.data.scheme;
      if (scheme === 'space_gray' || scheme === 'vkcom_dark') {
        document.body.classList.add('dark-theme');
      } else {
        document.body.classList.remove('dark-theme');
      }
    }
  });
} else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
  document.body.classList.add('dark-theme');
}

// 2. Словарь перевода названий Гран-при на русский
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

// Состояние приложения
let currentRaceData = null;
let useMoscowTime = false;
let timerInterval = null;

// Элементы DOM
const btnLocal = document.getElementById('btn-local');
const btnMsk = document.getElementById('btn-msk');
const tzLabel = document.getElementById('tz-label');

// Переключение часового пояса
btnLocal.addEventListener('click', () => {
  useMoscowTime = false;
  btnLocal.classList.add('active');
  btnMsk.classList.remove('active');
  tzLabel.textContent = 'Ваше местное время';
  if (currentRaceData) renderSchedule(currentRaceData);
});

btnMsk.addEventListener('click', () => {
  useMoscowTime = true;
  btnMsk.classList.add('active');
  btnLocal.classList.remove('active');
  tzLabel.textContent = 'Московское время (UTC+3)';
  if (currentRaceData) renderSchedule(currentRaceData);
});

// 3. Загрузка данных с Jolpica F1 API (с таймаутом 4 секунды)
async function loadNextRace() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    const response = await fetch('https://api.jolpi.ca/ergast/f1/current/next.json', {
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) throw new Error('Ошибка ответа API');
    const json = await response.json();
    const race = json?.MRData?.RaceTable?.Races?.[0];

    if (!race) throw new Error('Нет данных о ближайшей гонке');

    currentRaceData = race;
    renderHeader(race);
    renderSchedule(race);
    startCountdown(race);
  } catch (err) {
    console.warn('Ошибка загрузки API:', err);
    document.getElementById('sessions-list').innerHTML =
      '<div class="loader">Не удалось загрузить расписание. Попробуйте обновить страницу чуть позже.</div>';
  }
}

// 4. Отрисовка заголовка этапа
function renderHeader(race) {
  const ruName = GP_TRANSLATIONS[race.raceName] || race.raceName;
  document.getElementById('gp-round').textContent = `Этап ${race.round} • Сезон ${race.season}`;
  document.getElementById('gp-name').textContent = ruName;
  document.getElementById('gp-circuit').textContent = `${race.Circuit.circuitName} (${race.Circuit.Location.locality})`;
}

// 5. Сборка и отрисовка всех сессий уик-энда
function renderSchedule(race) {
  const sessions = [];

  if (race.FirstPractice) {
    sessions.push({ title: 'Первая практика (FP1)', ...race.FirstPractice, isRace: false });
  }
  if (race.SecondPractice) {
    sessions.push({ title: 'Вторая практика (FP2)', ...race.SecondPractice, isRace: false });
  }
  if (race.ThirdPractice) {
    sessions.push({ title: 'Третья практика (FP3)', ...race.ThirdPractice, isRace: false });
  }
  if (race.SprintQualifying) {
    sessions.push({ title: 'Спринт-квалификация', ...race.SprintQualifying, isRace: false });
  }
  if (race.Sprint) {
    sessions.push({ title: 'Спринт', ...race.Sprint, isRace: false });
  }
  if (race.Qualifying) {
    sessions.push({ title: 'Квалификация', ...race.Qualifying, isRace: false });
  }
  // Главная гонка
  sessions.push({
    title: 'Гонка',
    date: race.date,
    time: race.time,
    isRace: true
  });

  // Преобразуем даты в объекты Date и сортируем хронологически
  const parsedSessions = sessions
    .filter((s) => s.date && s.time)
    .map((s) => ({
      ...s,
      timestamp: new Date(`${s.date}T${s.time}`).getTime()
    }))
    .sort((a, b) => a.timestamp - b.timestamp);

  const now = Date.now();
  let nextFound = false;

  const container = document.getElementById('sessions-list');
  container.innerHTML = '';

  parsedSessions.forEach((session) => {
    // Считаем сессию прошедшей через 2 часа после её начала
    const isPast = now > session.timestamp + 2 * 60 * 60 * 1000;
    let isNext = false;

    if (!isPast && !nextFound) {
      isNext = true;
      nextFound = true;
    }

    const row = document.createElement('div');
    row.className = 'session-row';
    if (isPast) row.classList.add('past');
    if (isNext) row.classList.add('next');
    if (session.isRace) row.classList.add('race-main');

    const { dateStr, timeStr } = formatDateTime(session.timestamp, useMoscowTime);

    row.innerHTML = `
      <div class="session-left">
        <span class="session-name">${session.title}</span>
        ${isNext ? '<span class="session-badge-next">Ближайшая сессия</span>' : ''}
      </div>
      <div class="session-right">
        <div class="session-time">${timeStr}</div>
        <div class="session-date">${dateStr}</div>
      </div>
    `;

    container.appendChild(row);
  });
}

// Форматирование даты и времени под выбранный часовой пояс
function formatDateTime(timestamp, forceMsk) {
  const dateObj = new Date(timestamp);
  const optionsDate = {
    day: 'numeric',
    month: 'short',
    weekday: 'short',
    timeZone: forceMsk ? 'Europe/Moscow' : undefined
  };
  const optionsTime = {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: forceMsk ? 'Europe/Moscow' : undefined
  };

  const dateStr = new Intl.DateTimeFormat('ru-RU', optionsDate).format(dateObj);
  const timeStr = new Intl.DateTimeFormat('ru-RU', optionsTime).format(dateObj);

  return { dateStr, timeStr };
}

// 6. Живой таймер обратного отсчёта до гонки
function startCountdown(race) {
  if (timerInterval) clearInterval(timerInterval);

  const raceStart = new Date(`${race.date}T${race.time}`).getTime();
  const raceEndApprox = raceStart + 2.5 * 60 * 60 * 1000; // ~2.5 часа на гонку

  const gridEl = document.getElementById('countdown-grid');
  const labelEl = document.getElementById('countdown-label');
  const bannerEl = document.getElementById('race-status-banner');

  function update() {
    const now = Date.now();
    const diff = raceStart - now;

    if (diff > 0) {
      gridEl.classList.remove('hidden');
      labelEl.classList.remove('hidden');
      bannerEl.classList.add('hidden');

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const mins = Math.floor((diff / 1000 / 60) % 60);
      const secs = Math.floor((diff / 1000) % 60);

      document.getElementById('cd-days').textContent = String(days).padStart(2, '0');
      document.getElementById('cd-hours').textContent = String(hours).padStart(2, '0');
      document.getElementById('cd-mins').textContent = String(mins).padStart(2, '0');
      document.getElementById('cd-secs').textContent = String(secs).padStart(2, '0');
    } else if (now <= raceEndApprox) {
      gridEl.classList.add('hidden');
      labelEl.classList.add('hidden');
      bannerEl.classList.remove('hidden');
      bannerEl.textContent = '🔴 Гонка идёт прямо сейчас!';
    } else {
      gridEl.classList.add('hidden');
      labelEl.classList.add('hidden');
      bannerEl.classList.remove('hidden');
      bannerEl.textContent = '🏁 Гонка завершена. Ожидаем обновления календаря';
    }
  }

  update();
  timerInterval = setInterval(update, 1000);
}

// Запуск при открытии
loadNextRace();

// Временный блок для получения ключа без привязки к IP
setTimeout(() => {
  const params = new URLSearchParams(window.location.search);
  const appId = Number(params.get('vk_app_id'));
  const groupId = Number(params.get('vk_group_id'));
  
  if (appId && groupId) {
    const btn = document.createElement('button');
    btn.innerText = '🔑 Получить ключ для стены (нажми один раз)';
    btn.style.cssText = 'position:fixed;top:10px;left:10px;right:10px;z-index:9999;padding:15px;background:#e10600;color:#fff;font-weight:bold;border:none;border-radius:8px;font-size:16px;cursor:pointer;';
    btn.onclick = () => {
      vkBridge.send('VKWebAppGetCommunityToken', {
        app_id: appId,
        group_id: groupId,
        scope: 'app_widget'
      }).then((data) => {
        btn.remove();
        document.body.innerHTML = `<div style="padding:20px;background:#111;color:#0f0;word-break:break-all;font-family:monospace;font-size:14px;">✅ Готово! Скопируй весь зелёный текст ниже:<br><br><textarea style="width:100%;height:150px;background:#000;color:#0f0;border:1px solid #0f0;padding:10px;">${data.access_token}</textarea></div>`;
      }).catch((err) => {
        alert('Ошибка: ' + JSON.stringify(err));
      });
    };
    document.body.appendChild(btn);
  }
}, 1000);
