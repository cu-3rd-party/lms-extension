/** Описание плагина, используемое background.ts для авто-инжекции */
export interface PluginManifest {
  /** Уникальный идентификатор плагина */
  readonly id: string;
  /**
   * Возвращает true, если плагин должен быть запущен на данном URL.
   * Вызывается при каждой навигации внутри my.centraluniversity.ru.
   */
  readonly matches: (url: string) => boolean;
  /**
   * JS-файлы для инжекции через chrome.scripting.executeScript.
   * Пути — относительно корня расширения (результаты ?script импортов).
   * Файлы внутри одного массива инжектируются в одном вызове (порядок гарантирован).
   */
  readonly scripts?: readonly string[];
  /**
   * CSS-файлы для инжекции через chrome.scripting.insertCSS.
   * Пути — относительно корня расширения.
   */
  readonly cssFiles?: readonly string[];
}
