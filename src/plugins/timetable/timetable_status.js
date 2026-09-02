if (typeof window.__culmsTimetableStatusInit === 'undefined') {
  window.__culmsTimetableStatusInit = true;

  var TIMETABLE_STATUS_STYLE_ID = 'culms-timetable-status-styles';
  var CHIP_CLASS = 'culms-slot-chip';

  var STATUS = {
    ONLY_ONE: {
      label: '1 вариант',
      color: '#6b7280',
      bg: 'rgba(107, 114, 128, 0.12)',
    },
    HAS_FREE: {
      label: 'Есть свободные',
      color: '#16a34a',
      bg: 'rgba(22, 163, 74, 0.12)',
    },
    HAS_SEATS_BUT_CONFLICTS: {
      label: 'Пересечения',
      color: '#d97706',
      bg: 'rgba(217, 119, 6, 0.12)',
    },
    NO_SEATS: {
      label: 'Нет мест',
      color: '#dc2626',
      bg: 'rgba(220, 38, 38, 0.12)',
    },
  };

  function injectStyles() {
    if (document.getElementById(TIMETABLE_STATUS_STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = TIMETABLE_STATUS_STYLE_ID;
    style.textContent =
      '.' +
      CHIP_CLASS +
      '{' +
      'display:inline-flex;align-items:center;gap:6px;' +
      'padding:2px 8px 2px 6px;border-radius:6px;' +
      'font-size:10px;line-height:14px;font-weight:500;' +
      'white-space:nowrap;margin-top:3px;' +
      'transition:opacity .2s;' +
      '}' +
      '.' +
      CHIP_CLASS +
      ' .culms-chip-dot{' +
      'width:6px;height:6px;border-radius:50%;flex-shrink:0;' +
      '}' +
      '.' +
      CHIP_CLASS +
      ' .culms-chip-count{' +
      'font-size:10px;opacity:0.7;margin-left:2px;' +
      '}';
    document.head.appendChild(style);
  }

  function createChip(status, extraText) {
    var chip = document.createElement('div');
    chip.className = CHIP_CLASS;
    chip.style.backgroundColor = status.bg;
    chip.style.color = status.color;

    var dot = document.createElement('span');
    dot.className = 'culms-chip-dot';
    dot.style.backgroundColor = status.color;
    chip.appendChild(dot);

    var label = document.createElement('span');
    label.textContent = status.label;
    chip.appendChild(label);

    if (extraText) {
      var count = document.createElement('span');
      count.className = 'culms-chip-count';
      count.textContent = extraText;
      chip.appendChild(count);
    }

    return chip;
  }

  function determineStatus(alternatives, currentCalendarEventId) {
    var others = alternatives.filter(function (s) {
      return s.calendarEventId !== currentCalendarEventId;
    });

    if (others.length === 0) {
      return { status: STATUS.ONLY_ONE, count: 0, free: 0 };
    }

    var free = 0;
    var seatsButConflict = 0;
    var noSeats = 0;

    others.forEach(function (slot) {
      if (!slot.conflicts || slot.conflicts.length === 0) {
        free++;
      } else {
        var hasCapacity = slot.conflicts.some(function (c) {
          return c.conflictType === 'capacity';
        });
        var hasTime = slot.conflicts.some(function (c) {
          return c.conflictType === 'time';
        });
        if (hasCapacity) {
          noSeats++;
        } else if (hasTime) {
          seatsButConflict++;
        }
      }
    });

    if (free > 0) {
      return { status: STATUS.HAS_FREE, count: others.length, free: free };
    }
    if (seatsButConflict > 0) {
      return {
        status: STATUS.HAS_SEATS_BUT_CONFLICTS,
        count: others.length,
        free: 0,
        withSeats: seatsButConflict,
      };
    }
    return { status: STATUS.NO_SEATS, count: others.length, free: 0 };
  }

  function findEventTypeCell(tableRow, isFirstRowOfCourse) {
    var cells = tableRow.querySelectorAll('td');
    if (isFirstRowOfCourse) {
      return cells.length >= 2 ? cells[1] : null;
    }
    return cells.length >= 1 ? cells[0] : null;
  }

  function parseEventType(text) {
    text = text.trim().toLowerCase();
    if (text.startsWith('лекция')) return 'lecture';
    if (text.startsWith('семинар')) return 'seminar';
    return text;
  }

  function parseEventRowNumber(text) {
    var match = text.trim().match(/\d+/);
    return match ? parseInt(match[0], 10) : 1;
  }

  async function loadAndInjectStatuses() {
    var table = document.querySelector('table.cu-table');
    if (!table) return;
    var tbody = table.querySelector('tbody');
    if (!tbody) return;

    var existingChips = tbody.querySelectorAll('.' + CHIP_CLASS);
    if (existingChips.length > 0) return;

    var timetableResp = await fetch('/api/micro-lms/students/me/timetables', {
      credentials: 'include',
    });
    if (!timetableResp.ok) return;
    var timetableData = await timetableResp.json();

    var courseMap = {};
    timetableData.forEach(function (course) {
      courseMap[course.courseId] = course;
    });

    var rows = tbody.querySelectorAll('tr');
    var currentCourseId = null;
    var courseEventIndex = 0;
    var currentCourse = null;

    var tasks = [];

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var cells = row.querySelectorAll('td');
      var courseCell = null;
      var eventTypeCell = null;
      var isFirstRow = false;

      for (var j = 0; j < cells.length; j++) {
        if (cells[j].classList.contains('course-column')) {
          courseCell = cells[j];
          break;
        }
      }

      if (courseCell) {
        isFirstRow = true;
        var courseName = courseCell.textContent.trim();
        currentCourse = timetableData.find(function (c) {
          return c.courseName === courseName;
        });
        currentCourseId = currentCourse ? currentCourse.courseId : null;
        courseEventIndex = 0;
      }

      for (var k = 0; k < cells.length; k++) {
        if (cells[k].classList.contains('event-type-column')) {
          eventTypeCell = cells[k];
          break;
        }
      }

      if (!eventTypeCell || !currentCourse) {
        if (currentCourse) courseEventIndex++;
        continue;
      }

      var eventRow = currentCourse.eventRows[courseEventIndex];
      if (!eventRow) {
        courseEventIndex++;
        continue;
      }

      tasks.push({
        cell: eventTypeCell,
        courseId: currentCourseId,
        eventType: eventRow.eventType,
        rowNumber: eventRow.eventRowNumber,
        currentCalendarEventId: eventRow.calendarEvent
          ? eventRow.calendarEvent.calendarEventId
          : null,
      });

      courseEventIndex++;
    }

    var fetches = tasks.map(function (task) {
      var url =
        '/api/micro-lms/students/me/timetables/' +
        task.courseId +
        '/' +
        task.eventType +
        '/' +
        task.rowNumber;
      return fetch(url, { credentials: 'include' })
        .then(function (r) {
          return r.ok ? r.json() : [];
        })
        .catch(function () {
          return [];
        });
    });

    var results = await Promise.all(fetches);

    results.forEach(function (alternatives, idx) {
      var task = tasks[idx];
      if (!Array.isArray(alternatives) || alternatives.length === 0) return;

      var result = determineStatus(alternatives, task.currentCalendarEventId);
      var extraText = '';

      var chip = createChip(result.status, '');
      task.cell.appendChild(chip);
    });
  }

  function waitForTableAndInject() {
    if (document.querySelector('table.cu-table tbody tr')) {
      injectStyles();
      loadAndInjectStatuses();
      return;
    }

    var observer = new MutationObserver(function (_mutations, obs) {
      if (document.querySelector('table.cu-table tbody tr')) {
        obs.disconnect();
        injectStyles();
        loadAndInjectStatuses();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  waitForTableAndInject();
}
