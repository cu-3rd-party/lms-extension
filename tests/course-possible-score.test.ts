/**
 * Строка «Можно было набрать» в виджете «Прогресс по курсу» — на поддельной
 * странице с заглушкой `student-performance`.
 *
 * Активность «ДЗ»: вес 0.5, плановых работ 4. Проверены две (10/10 и 5/10),
 * одна на проверке (score: null), одна не сдана. Максимум на данный момент —
 * только за проверенные: 0.5 × (10 + 10) / 4 = 2.5; накопленное при этом
 * 0.5 × 15 / 4 = 1.875, а работы на проверке не тянут максимум вверх.
 *
 * Запуск:
 *   bunx playwright test tests/course-possible-score.test.ts
 */

import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const plugins = resolve(__dirname, '..', 'src', 'plugins');
const SCRIPT = readFileSync(resolve(plugins, 'course-view/course_possible_score.js'), 'utf8');
const CSS = readFileSync(resolve(plugins, 'course-view/course_possible_score.css'), 'utf8');

const activity = { id: 1, name: 'ДЗ', weight: 0.5, maxExercisesCount: 4, bestScoresCount: 0 };
const task = (id: number, score: number | null) => ({ id, activity, score, maxScore: 10 });

const html = `<!doctype html><html><body><cu-course-progress-widget>
  <div class="progress-details"><div class="progress-bar" style="width:200px;height:10px"></div><div class="legend"><div class="r"><span>Накоплено</span><b>1</b></div><div class="r" style="font-size:16px"><span>Еще можно набрать</span><b>9</b></div><div class="r"><span>Хвост</span><b>0</b></div></div></div>
</cu-course-progress-widget></body></html>`;

test('максимум считается только по проверенным работам', async ({ page }) => {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/micro-lms/courses/1142/student-performance') {
      return route.fulfill({
        json: { tasks: [task(1, 10), task(2, 5), task(3, null), task(4, null)] },
      });
    }
    return route.fulfill({ contentType: 'text/html; charset=utf-8', body: html });
  });
  await page.goto('https://lms.test/learn/courses/view/actual/1142');
  await page.addStyleTag({ content: CSS });
  await page.addScriptTag({ content: SCRIPT });
  const row = page.locator('.legend > .r:has-text("Еще можно набрать") + #culms-course-possible');
  await expect(row).toContainText('Можно было набрать');
  await expect(row).toContainText('2.5');
  await expect(page.locator('.progress-bar > #culms-course-possible-mark')).toHaveCSS('left', '50px');
  // Копия родной строки: тот же размер шрифта, что у соседней.
  await expect(row).toHaveCSS('font-size', '16px');
});
