const STORAGE_KEY = 'habit-tracker';
const WEEKS_TO_SHOW = 26;

function load() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : { habits: [], log: {} };
}

function save(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function dateStr(d) {
  return d.toISOString().slice(0, 10);
}

function today() {
  return dateStr(new Date());
}

function addDays(dateString, n) {
  const d = new Date(dateString + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return dateStr(d);
}

function formatDate(dateString) {
  const d = new Date(dateString + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function dayHasAnyActivity(log, dateString) {
  const entry = log[dateString];
  if (!entry) return false;
  return Object.values(entry).some(Boolean);
}

function computeStreak(data, habit) {
  let streak = 0;
  let d = today();

  for (let i = 0; i < 365; i++) {
    const entry = data.log[d];
    const done = entry && entry[habit];

    if (done) {
      streak++;
    } else {
      const nextDay = addDays(d, 1);
      const nextDayActive = dayHasAnyActivity(data.log, nextDay);
      if (i === 0) {
        // today: if not done yet, don't break streak, just don't count it
        // check if yesterday continues
        if (!dayHasAnyActivity(data.log, d)) {
          d = addDays(d, -1);
          continue;
        } else {
          break;
        }
      }
      if (nextDayActive) {
        // forgiven: missed this habit but at least one habit tracked the next day
        streak++;
      } else {
        break;
      }
    }
    d = addDays(d, -1);
  }
  return streak;
}

function completionRatio(data, dateString) {
  const entry = data.log[dateString];
  if (!entry || data.habits.length === 0) return 0;
  const done = data.habits.filter(h => entry[h]).length;
  return done / data.habits.length;
}

function getLevel(ratio) {
  if (ratio === 0) return 0;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

function renderTodayLabel() {
  document.getElementById('today-label').textContent = formatDate(today());
}

function renderHabitList(data) {
  const ul = document.getElementById('habit-list');
  ul.innerHTML = '';
  const todayEntry = data.log[today()] || {};

  data.habits.forEach(habit => {
    const li = document.createElement('li');
    li.className = 'habit-item' + (todayEntry[habit] ? ' done' : '');

    const check = document.createElement('div');
    check.className = 'habit-check';
    const nameSpan = document.createElement('span');
    nameSpan.className = 'habit-name';
    nameSpan.textContent = habit;
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.title = 'Remove habit';
    removeBtn.textContent = '✕';
    li.append(check, nameSpan, removeBtn);

    li.addEventListener('click', (e) => {
      if (e.target.classList.contains('remove-btn')) return;
      toggleHabit(data, habit);
    });

    removeBtn.addEventListener('click', () => {
      removeHabit(data, habit);
    });

    ul.appendChild(li);
  });
}

function renderStreaks(data) {
  const container = document.getElementById('streaks');
  container.innerHTML = '';
  data.habits.forEach(habit => {
    const streak = computeStreak(data, habit);
    const card = document.createElement('div');
    card.className = 'streak-card';
    const countDiv = document.createElement('div');
    countDiv.className = 'streak-count';
    countDiv.textContent = streak;
    const labelDiv = document.createElement('div');
    labelDiv.className = 'streak-label';
    labelDiv.textContent = habit;
    card.append(countDiv, labelDiv);
    container.appendChild(card);
  });
}

function renderHeatmap(data) {
  const grid = document.getElementById('heatmap');
  const monthLabels = document.getElementById('month-labels');
  grid.innerHTML = '';
  monthLabels.innerHTML = '';

  const todayDate = new Date();
  const todayDay = todayDate.getDay();
  // adjust so Monday = 0
  const todayDayMon = (todayDay + 6) % 7;
  const totalDays = WEEKS_TO_SHOW * 7 + todayDayMon + 1;

  const startDate = new Date(todayDate);
  startDate.setDate(startDate.getDate() - totalDays + 1);

  let currentWeek = null;
  let weekIndex = 0;
  let lastMonth = -1;

  for (let i = 0; i < totalDays; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    const ds = dateStr(d);
    const dayOfWeek = (d.getDay() + 6) % 7; // Monday = 0

    if (dayOfWeek === 0 || i === 0) {
      currentWeek = document.createElement('div');
      currentWeek.className = 'heatmap-week';
      grid.appendChild(currentWeek);

      if (i === 0) {
        for (let pad = 0; pad < dayOfWeek; pad++) {
          const empty = document.createElement('div');
          empty.className = 'heatmap-cell level-0';
          empty.style.visibility = 'hidden';
          currentWeek.appendChild(empty);
        }
      }

      const month = d.getMonth();
      if (month !== lastMonth) {
        lastMonth = month;
        const label = document.createElement('span');
        label.textContent = d.toLocaleDateString('en-US', { month: 'short' });
        label.style.left = (weekIndex * 16) + 'px';
        monthLabels.appendChild(label);
      }
      weekIndex++;
    }

    const ratio = completionRatio(data, ds);
    const level = getLevel(ratio);
    const cell = document.createElement('div');
    cell.className = `heatmap-cell level-${level}`;
    cell.dataset.date = ds;

    cell.addEventListener('mouseenter', (e) => showTooltip(e, data, ds));
    cell.addEventListener('mouseleave', hideTooltip);

    currentWeek.appendChild(cell);
  }
}

function showTooltip(e, data, dateString) {
  const tooltip = document.getElementById('tooltip');
  const entry = data.log[dateString] || {};
  const completed = data.habits.filter(h => entry[h]);
  const missed = data.habits.filter(h => !entry[h]);

  let text = formatDate(dateString) + '\n';
  if (data.habits.length === 0) {
    text += 'No habits tracked';
  } else if (completed.length === 0) {
    text += 'No habits completed';
  } else {
    text += completed.map(h => '✓ ' + h).join('\n');
    if (missed.length > 0) {
      text += '\n' + missed.map(h => '✗ ' + h).join('\n');
    }
  }

  tooltip.textContent = text;
  tooltip.classList.add('visible');

  const rect = e.target.getBoundingClientRect();
  tooltip.style.left = rect.left + 'px';
  tooltip.style.top = (rect.bottom + 6) + 'px';
}

function hideTooltip() {
  document.getElementById('tooltip').classList.remove('visible');
}

function toggleHabit(data, habit) {
  if (!data.log[today()]) data.log[today()] = {};
  data.log[today()][habit] = !data.log[today()][habit];
  save(data);
  render(data);
}

function removeHabit(data, habit) {
  data.habits = data.habits.filter(h => h !== habit);
  Object.keys(data.log).forEach(d => {
    delete data.log[d][habit];
  });
  save(data);
  render(data);
}

function addHabit(data, name) {
  const trimmed = name.trim();
  if (!trimmed || data.habits.includes(trimmed)) return;
  data.habits.push(trimmed);
  save(data);
  render(data);
}

function render(data) {
  renderTodayLabel();
  renderHabitList(data);
  renderStreaks(data);
  renderHeatmap(data);
}

// Init
const data = load();
render(data);

document.getElementById('add-btn').addEventListener('click', () => {
  const input = document.getElementById('new-habit');
  addHabit(data, input.value);
  input.value = '';
});

document.getElementById('new-habit').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    addHabit(data, e.target.value);
    e.target.value = '';
  }
});
