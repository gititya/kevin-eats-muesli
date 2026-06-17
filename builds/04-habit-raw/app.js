(function () {
  var HABITS_KEY = 'ht-habits';
  var COMPLETIONS_KEY = 'ht-completions';

  var habits = JSON.parse(localStorage.getItem(HABITS_KEY) || '[]');
  var completions = JSON.parse(localStorage.getItem(COMPLETIONS_KEY) || '{}');
  var selectedDate = formatDate(new Date());
  var tooltip = null;

  function save() {
    localStorage.setItem(HABITS_KEY, JSON.stringify(habits));
    localStorage.setItem(COMPLETIONS_KEY, JSON.stringify(completions));
  }

  function formatDate(date) {
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, '0');
    var d = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }

  function parseDate(str) {
    var parts = str.split('-');
    return new Date(+parts[0], +parts[1] - 1, +parts[2]);
  }

  function addDays(date, n) {
    var d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
  }

  function formatDisplayDate(dateStr) {
    var date = parseDate(dateStr);
    var today = formatDate(new Date());
    var yesterday = formatDate(addDays(new Date(), -1));

    var dayStr = date.toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric'
    });

    if (dateStr === today) return 'Today — ' + dayStr;
    if (dateStr === yesterday) return 'Yesterday — ' + dayStr;
    return dayStr;
  }

  function todayStr() { return formatDate(new Date()); }
  function isFuture(dateStr) { return dateStr > todayStr(); }

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  }

  function isCompleted(habitId, dateStr) {
    return !!(completions[habitId] && completions[habitId][dateStr]);
  }

  function allHabitsCompleted(dateStr) {
    var existing = habits.filter(function (h) { return h.createdAt <= dateStr; });
    if (existing.length === 0) return false;
    return existing.every(function (h) { return isCompleted(h.id, dateStr); });
  }

  function addHabit(name) {
    var habit = { id: generateId(), name: name.trim(), createdAt: todayStr() };
    habits.push(habit);
    completions[habit.id] = {};
    save();
    render();
  }

  function deleteHabit(id) {
    habits = habits.filter(function (h) { return h.id !== id; });
    delete completions[id];
    save();
    render();
  }

  function toggleCompletion(habitId, dateStr) {
    if (isFuture(dateStr)) return;
    if (!completions[habitId]) completions[habitId] = {};
    if (completions[habitId][dateStr]) {
      delete completions[habitId][dateStr];
    } else {
      completions[habitId][dateStr] = true;
    }
    save();
    render();
  }

  // Grace rule: if you miss a habit on day D, the streak continues
  // only if day D+1 has ALL habits completed. Can't chain two grace days.
  function calculateStreak(habitId) {
    var habit = habits.find(function (h) { return h.id === habitId; });
    if (!habit) return 0;

    var today = todayStr();
    var streak = 0;
    var date = new Date();
    date.setHours(0, 0, 0, 0);

    if (isCompleted(habitId, today)) {
      streak = 1;
    }

    date.setDate(date.getDate() - 1);
    var consecutiveGrace = 0;

    while (true) {
      var ds = formatDate(date);
      if (ds < habit.createdAt) break;

      if (isCompleted(habitId, ds)) {
        streak++;
        consecutiveGrace = 0;
      } else {
        if (consecutiveGrace >= 1) break;
        var nextDayStr = formatDate(addDays(date, 1));
        if (allHabitsCompleted(nextDayStr)) {
          streak++;
          consecutiveGrace++;
        } else {
          break;
        }
      }

      date.setDate(date.getDate() - 1);
    }

    return streak;
  }

  function showTooltip(e, text) {
    hideTooltip();
    tooltip = document.createElement('div');
    tooltip.className = 'tooltip';
    tooltip.textContent = text;
    document.body.appendChild(tooltip);
    var rect = e.target.getBoundingClientRect();
    tooltip.style.left = (rect.left + rect.width / 2) + 'px';
    tooltip.style.top = rect.top + 'px';
  }

  function hideTooltip() {
    if (tooltip && tooltip.parentNode) {
      tooltip.parentNode.removeChild(tooltip);
      tooltip = null;
    }
  }

  function renderHeatmap(habit) {
    var card = document.createElement('div');
    card.className = 'heatmap-card';

    var header = document.createElement('div');
    header.className = 'heatmap-header';

    var name = document.createElement('span');
    name.className = 'heatmap-name';
    name.textContent = habit.name;

    var streakSpan = document.createElement('span');
    streakSpan.className = 'heatmap-streak';
    var sc = calculateStreak(habit.id);
    streakSpan.textContent = sc + ' day' + (sc !== 1 ? 's' : '') + ' streak';

    header.appendChild(name);
    header.appendChild(streakSpan);
    card.appendChild(header);

    var wrapper = document.createElement('div');
    wrapper.className = 'heatmap-wrapper';

    // Day labels
    var dayLabels = document.createElement('div');
    dayLabels.className = 'heatmap-day-labels';
    var dayNames = ['', 'Mon', '', 'Wed', '', 'Fri', ''];
    dayNames.forEach(function (n) {
      var s = document.createElement('span');
      s.textContent = n;
      dayLabels.appendChild(s);
    });
    wrapper.appendChild(dayLabels);

    // Grid container
    var gridContainer = document.createElement('div');
    gridContainer.className = 'heatmap-grid-container';

    // Compute date range
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var todayS = formatDate(today);

    var startDate = new Date(today);
    startDate.setDate(today.getDate() - 52 * 7);
    startDate.setDate(startDate.getDate() - startDate.getDay());

    var endDate = new Date(today);
    endDate.setDate(endDate.getDate() + (6 - endDate.getDay()));

    var totalDays = Math.round((endDate - startDate) / 86400000) + 1;
    var numWeeks = Math.ceil(totalDays / 7);

    var cellTotal = 13 + 3; // cell size + gap

    // Month labels
    var monthLabelsDiv = document.createElement('div');
    monthLabelsDiv.className = 'heatmap-month-labels';

    var lastMonth = -1;
    for (var w = 0; w < numWeeks; w++) {
      for (var dd = 0; dd < 7; dd++) {
        var md = new Date(startDate);
        md.setDate(md.getDate() + w * 7 + dd);
        var month = md.getMonth();
        if ((md.getDate() === 1 || (w === 0 && dd === 0)) && month !== lastMonth) {
          var ml = document.createElement('span');
          ml.className = 'month-label';
          ml.textContent = md.toLocaleString('default', { month: 'short' });
          ml.style.left = (w * cellTotal) + 'px';
          monthLabelsDiv.appendChild(ml);
          lastMonth = month;
          break;
        }
      }
    }
    gridContainer.appendChild(monthLabelsDiv);

    // Grid
    var grid = document.createElement('div');
    grid.className = 'heatmap-grid';

    for (var wi = 0; wi < numWeeks; wi++) {
      for (var di = 0; di < 7; di++) {
        var cellDate = new Date(startDate);
        cellDate.setDate(cellDate.getDate() + wi * 7 + di);
        var ds = formatDate(cellDate);

        var cell = document.createElement('div');
        cell.className = 'heatmap-cell';

        if (ds > todayS) {
          cell.classList.add('future');
        } else if (ds < habit.createdAt) {
          cell.classList.add('inactive');
        } else if (isCompleted(habit.id, ds)) {
          cell.classList.add('done');
        } else {
          var nd = formatDate(addDays(cellDate, 1));
          if (nd <= todayS && allHabitsCompleted(nd)) {
            cell.classList.add('grace');
          } else {
            cell.classList.add('empty');
          }
        }

        if (ds === todayS) cell.classList.add('today');

        // Tooltip + click
        if (ds <= todayS && ds >= habit.createdAt) {
          cell.classList.add('clickable');

          (function (dateStr, cellDate) {
            var displayDate = cellDate.toLocaleDateString('en-US', {
              month: 'short', day: 'numeric', year: 'numeric'
            });
            var status = isCompleted(habit.id, dateStr) ? 'Done' :
              (cell.classList.contains('grace') ? 'Grace day' : 'Missed');

            cell.addEventListener('mouseenter', function (e) {
              showTooltip(e, displayDate + ' · ' + status);
            });
            cell.addEventListener('mouseleave', hideTooltip);
            cell.addEventListener('click', function () {
              toggleCompletion(habit.id, dateStr);
            });
          })(ds, new Date(cellDate));
        }

        grid.appendChild(cell);
      }
    }

    gridContainer.appendChild(grid);
    wrapper.appendChild(gridContainer);
    card.appendChild(wrapper);

    // Legend
    var legend = document.createElement('div');
    legend.className = 'heatmap-legend';

    var items = [
      { color: '#21262d', label: 'Missed' },
      { color: '#39d353', label: 'Done' },
      { color: '#e3b341', label: 'Grace day' }
    ];
    items.forEach(function (item) {
      var el = document.createElement('span');
      el.className = 'legend-item';
      var swatch = document.createElement('span');
      swatch.className = 'legend-swatch';
      swatch.style.background = item.color;
      var label = document.createTextNode(item.label);
      el.appendChild(swatch);
      el.appendChild(label);
      legend.appendChild(el);
    });
    card.appendChild(legend);

    return card;
  }

  function render() {
    // Date nav
    var dateNav = document.getElementById('date-nav');
    dateNav.querySelector('.date-display').textContent = formatDisplayDate(selectedDate);
    dateNav.querySelector('.next-day').disabled = selectedDate >= todayStr();

    // Habits list
    var list = document.getElementById('habits-list');
    list.innerHTML = '';

    if (habits.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'No habits yet. Add one to get started.';
      list.appendChild(empty);
    } else {
      habits.forEach(function (habit) {
        var item = document.createElement('div');
        item.className = 'habit-item';

        var left = document.createElement('div');
        left.className = 'habit-left';

        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = isCompleted(habit.id, selectedDate);
        cb.disabled = isFuture(selectedDate) || selectedDate < habit.createdAt;
        cb.addEventListener('change', function () {
          toggleCompletion(habit.id, selectedDate);
        });

        var label = document.createElement('span');
        label.className = 'habit-name';
        label.textContent = habit.name;
        if (cb.checked) label.classList.add('completed');

        left.appendChild(cb);
        left.appendChild(label);

        var right = document.createElement('div');
        right.className = 'habit-right';

        var pill = document.createElement('span');
        pill.className = 'streak-pill';
        var count = calculateStreak(habit.id);
        pill.textContent = count + 'd';
        if (count > 0) pill.classList.add('active');

        var del = document.createElement('button');
        del.className = 'delete-btn';
        del.textContent = '×';
        del.title = 'Delete habit';
        del.addEventListener('click', function () {
          if (confirm('Delete "' + habit.name + '"? This removes all history.')) {
            deleteHabit(habit.id);
          }
        });

        right.appendChild(pill);
        right.appendChild(del);
        item.appendChild(left);
        item.appendChild(right);
        list.appendChild(item);
      });
    }

    // Heatmaps
    var heatmaps = document.getElementById('heatmaps');
    heatmaps.innerHTML = '';

    var heatmapSection = document.getElementById('heatmap-section');
    if (habits.length === 0) {
      heatmapSection.classList.add('hidden');
    } else {
      heatmapSection.classList.remove('hidden');
      habits.forEach(function (habit) {
        heatmaps.appendChild(renderHeatmap(habit));
      });
    }
  }

  function init() {
    document.getElementById('add-habit-btn').addEventListener('click', function () {
      document.getElementById('add-habit-form').classList.remove('hidden');
      document.getElementById('habit-name-input').focus();
    });

    document.getElementById('save-habit-btn').addEventListener('click', function () {
      var input = document.getElementById('habit-name-input');
      var name = input.value.trim();
      if (name) {
        addHabit(name);
        input.value = '';
        document.getElementById('add-habit-form').classList.add('hidden');
      }
    });

    document.getElementById('cancel-habit-btn').addEventListener('click', function () {
      document.getElementById('habit-name-input').value = '';
      document.getElementById('add-habit-form').classList.add('hidden');
    });

    document.getElementById('habit-name-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') document.getElementById('save-habit-btn').click();
      if (e.key === 'Escape') document.getElementById('cancel-habit-btn').click();
    });

    document.querySelector('.prev-day').addEventListener('click', function () {
      selectedDate = formatDate(addDays(parseDate(selectedDate), -1));
      render();
    });

    document.querySelector('.next-day').addEventListener('click', function () {
      if (selectedDate < todayStr()) {
        selectedDate = formatDate(addDays(parseDate(selectedDate), 1));
        render();
      }
    });

    render();
  }

  init();
})();
