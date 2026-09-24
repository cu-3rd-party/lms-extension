// Сбор оценок для выгрузки в Excel (меню плагина → «Экспорт оценок»).
// Данные собирает эта функция, книгу строит попап.
//
// Функция выполняется не в background, а во вкладке LMS: background передаёт
// её в `scripting.executeScript({ func, args })`, и браузер переносит туда
// только текст функции, без замыкания. Поэтому внутри нельзя ссылаться ни на
// что снаружи — ни на импорты, ни на константы модуля: во вкладке такая ссылка
// падает с ReferenceError. Так экспорт однажды и сломался — сюда попал
// `lmsApi` из background.ts, и после сборки каждая выгрузка кончалась ошибкой
// «S is not defined». Параметры приходят через `args`, остальное объявлено
// внутри. Сторожит это tests/source/grades-export.test.ts: он запускает
// функцию в пустом контексте, где нет ничего, кроме fetch.
//
// Адреса API относительные: запрос уходит из самой вкладки LMS, значит, на её
// домен и с её куками — будь то my.centraluniversity.ru или my.cu.ru.

/**
 * Собирает курсы студента с заданиями, упражнениями и активностями.
 *
 * @param archived false — текущие курсы, true — архивные.
 */
export async function fetchAllGradesForExport(archived: boolean) {
  const normalizeFetchedNumber = (value: any, fallback: number) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  };

  const enrichPerformanceTask = (task: any, exercisesById: Map<any, any>) => {
    const exercise = exercisesById.get(task.exerciseId) || task.exercise || null;
    const activity = task.activity || exercise?.activity || null;

    return {
      id: task.id,
      exerciseId: task.exerciseId,
      state: task.state,
      score: task.score,
      extraScore: task.extraScore,
      maxScore: normalizeFetchedNumber(task.maxScore ?? exercise?.maxScore, 10),
      activity: activity
        ? {
            id: activity.id,
            name: activity.name,
            weight: activity.weight,
            maxExercisesCount: activity.maxExercisesCount,
          }
        : null,
      exercise: exercise
        ? {
            id: exercise.id,
            name: exercise.name,
          }
        : null,
    };
  };

  const makeExerciseOnlyTask = (exercise: any) => ({
    id: null,
    exerciseId: exercise.id,
    state: 'planned',
    score: null,
    extraScore: null,
    maxScore: normalizeFetchedNumber(exercise.maxScore, 10),
    activity: exercise.activity
      ? {
          id: exercise.activity.id,
          name: exercise.activity.name,
          weight: exercise.activity.weight,
          maxExercisesCount: exercise.activity.maxExercisesCount,
        }
      : null,
    exercise: {
      id: exercise.id,
      name: exercise.name,
    },
  });

  const fetchJson = async (url: string) => {
    const response = await fetch(url, {
      headers: { accept: 'application/json, text/plain, */*' },
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`LMS API вернул ${response.status} для ${url}`);
    }

    return response.json();
  };

  const exportCourse = async (course: any) => {
    const [performance, exercisesData, activitiesData] = await Promise.all([
      fetchJson(`/api/micro-lms/courses/${course.id}/student-performance`),
      fetchJson(`/api/micro-lms/courses/${course.id}/exercises`),
      // Активности нужны только для заглушек ниже: без них выгрузка
      // всё равно полезна, поэтому их ошибку глотаем.
      fetchJson(`/api/micro-lms/courses/${course.id}/activities`).catch(() => []),
    ]);
    const exercises = Array.isArray(exercisesData?.exercises) ? exercisesData.exercises : [];
    const courseActivities = Array.isArray(activitiesData) ? activitiesData : [];
    const exercisesById = new Map(exercises.map((exercise: any) => [exercise.id, exercise]));
    const tasks = Array.isArray(performance?.tasks) ? performance.tasks : [];
    const taskExerciseIds = new Set(tasks.map((task: any) => task.exerciseId));
    const exerciseOnlyTasks = exercises
      .filter((exercise: any) => exercise.id && !taskExerciseIds.has(exercise.id))
      .map(makeExerciseOnlyTask);

    // Заглушки для активностей, по которым заданий ещё нет: так экзамен,
    // зачёт и прочее попадают в выгрузку, как бы они ни назывались.
    const placeholders = [];
    const existingActIds = new Set(tasks.map((t: any) => t.activity?.id).filter(Boolean));
    for (const act of courseActivities) {
      if (!act?.id) continue;
      if (
        !existingActIds.has(act.id) &&
        typeof act.maxExercisesCount === 'number' &&
        act.maxExercisesCount > 0
      ) {
        placeholders.push({
          id: null,
          exerciseId: null,
          state: 'planned',
          score: null,
          extraScore: null,
          maxScore: 10,
          activity: {
            id: act.id,
            name: act.name,
            weight: act.weight,
            maxExercisesCount: act.maxExercisesCount,
          },
          exercise: {
            id: null,
            name: act.name,
          },
        });
      }
    }

    return {
      id: course.id,
      name: course.name || `Курс ${course.id}`,
      tasks: [
        ...tasks.map((task: any) => enrichPerformanceTask(task, exercisesById)),
        ...placeholders,
        ...exerciseOnlyTasks,
      ],
    };
  };

  try {
    const coursesData = await fetchJson(
      `/api/micro-lms/performance/student?isArchived=${archived ? 'true' : 'false'}`
    );

    const courses = Array.isArray(coursesData?.courses)
      ? coursesData.courses
      : Array.isArray(coursesData?.items)
        ? coursesData.items
        : [];

    // Среди текущих курсов слушательские — тестовые и ознакомительные, оценок
    // в них нет. В архиве на статус не смотрим: курсам первого семестра LMS
    // проставила listener всем подряд, и фильтр выкинул бы весь семестр.
    const selectedCourses = courses.filter((course: any) => {
      if (!course.id) return false;
      if (archived) return true;
      const status = course.courseStudentsStatus || course.courseStudentStatus || course.status;
      return status !== 'listener' && status !== 'слушатель';
    });

    // Курсы качаем по три сразу: LMS отвечает на курс почти за полсекунды, и
    // архив из трёх десятков курсов по одному собирался бы секунд пятнадцать.
    // Порядок курсов в выгрузке при этом прежний.
    const exportedCourses: any[] = [];
    let nextCourse = 0;
    const worker = async () => {
      while (nextCourse < selectedCourses.length) {
        const index = nextCourse++;
        exportedCourses[index] = await exportCourse(selectedCourses[index]);
      }
    };
    await Promise.all(Array.from({ length: 3 }, worker));

    return { success: true, courses: exportedCourses };
  } catch (error: any) {
    console.error('[CU LMS] Grades export fetch failed:', error);
    return { success: false, error: error.message || 'Ошибка запроса к LMS API.' };
  }
}
