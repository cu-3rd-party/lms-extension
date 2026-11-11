// possible_score.js — «сколько можно было набрать к сегодняшнему дню».
//
// Общая формула для строки «Можно было набрать» в виджете курса
// (course-view/course_possible_score.js) и бейджа на карточках курсов
// (course-view/course_card_score.js, формат «накоплено/можно было набрать»).
// Считается по `courses/{id}/student-performance`: если бы за все уже
// проверенные работы стояли максимумы. Работы на проверке и несданные не
// считаются — ни как нули, ни как максимумы; формула та же, что у накопа в
// ведомости (вес × сумма баллов / плановое число работ, лучшие N, потолок 10).
// Возвращает число или null, если у курса нет весов.

(function () {
  'use strict';

  if (window.cuLmsPossibleScore) return;

  function possibleFrom(tasks) {
    const activities = new Map();
    for (const task of tasks) {
      const activity = task?.activity;
      if (!activity || activity.id == null) continue;
      if (!activities.has(activity.id)) {
        activities.set(activity.id, {
          weight: Number(activity.weight) || 0,
          best: Number(activity.bestScoresCount) || 0,
          planned: Number(activity.maxExercisesCount) || 0,
          total: 0,
          graded: [],
        });
      }
      const entry = activities.get(activity.id);
      entry.total++;
      if (task.score != null) {
        entry.graded.push({ score: Number(task.score), max: Number(task.maxScore) || 10 });
      }
    }
    let sum = 0;
    let weighted = false;
    for (const a of activities.values()) {
      if (a.weight > 0) weighted = true;
      const denominator = a.best || a.planned || a.total;
      if (!(denominator > 0)) continue;
      const counted = a.best
        ? [...a.graded].sort((x, y) => y.score - x.score).slice(0, a.best)
        : a.graded;
      sum += (a.weight * counted.reduce((s, t) => s + t.max, 0)) / denominator;
    }
    return weighted ? Math.min(sum, 10) : null;
  }

  window.cuLmsPossibleScore = { possibleFrom };
})();
