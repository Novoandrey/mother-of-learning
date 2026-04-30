'use client'

import { useState } from 'react'

type TestRow = readonly [area: string, title: string, desc: string]

const TESTS: TestRow[] = [
  ['Доска', 'Открыть прототип', 'Загружается без ошибок, видна матрица 5×5, sticky шапки на скролле.'],
  ['Доска', 'Счётчик в шапке', 'В крошке возле «Задачи» — N/M карт. соответствует сидам.'],
  ['Карточка', 'Открыть popover', 'Клик на карточке → popover anchored сбоку, доска видна.'],
  ['Карточка', 'Закрыть popover', 'Клик по фону → popover закрывается.'],
  ['Карточка', 'Авто-флип popover', 'Карточки в правой колонке («готово») — popover слева.'],
  ['Карточка', 'Сменить статус через popover', 'Triger статуса → picker → выбор → карточка переехала, тост.'],
  ['Карточка', 'Сменить исполнителя', 'Picker исполнителя в popover → выбор → аватар обновился.'],
  ['Карточка', 'Сменить проект', 'Picker проекта → карточка переехала в другую строку.'],
  ['Карточка', 'Тогл «требует внимания»', 'В popover тогл переключается, на карточке появляется красная точка.'],
  ['Карточка', 'Тогл auto-sync', 'В popover тогл меняется, на карточке индикатор ↻ vs ·.'],
  ['Карточка', '«Снять с доски»', 'Карточка исчезает, тост с «Отменить» возвращает её.'],
  ['Карточка', '«Готово» визуально отличимо', 'Карточки в колонке «готово» — strike-through, приглушённые.'],
  ['DnD', 'Перетащить между ячейками', 'Drag → drop в другую ячейку → status и project обновлены, тост.'],
  ['DnD', 'Подсветка drop-target', 'При hover на чужую ячейку — голубая заливка.'],
  ['Фильтры', 'Поиск', 'Ввод текста в search → матрица фильтруется, счётчик меняется.'],
  ['Фильтры', 'Multi-select проекта', 'Picker → выбрать 2 проекта → видны только их строки.'],
  ['Фильтры', 'Тогл «●внимание»', 'Только карточки с needs_attention остаются.'],
  ['Фильтры', 'Сбросить', 'Кнопка «Сбросить» очищает все фильтры разом.'],
  ['Drawer', 'Открыть Настройки', 'Drawer справа, доска недоступна за затемнением.'],
  ['Drawer', 'Колонки — список', 'Видны 5 колонок, у каждой счётчик карт. и палитра цветов.'],
  ['Drawer', 'Удаление колонки заблокировано', 'Если count > 0 — кнопка ✕ полупрозрачна, тултип.'],
  ['Wizard', 'Запуск из header', 'Кнопка «Засеять автоматически» → wizard step 1.'],
  ['Wizard', 'Шаги', 'Шаги 1→2→3 переключаются, кнопка «Назад» работает.'],
  ['Wizard', 'Exclude в превью', 'Чекбокс рядом с карточкой → строка зачёркнута, счётчик меняется.'],
  ['Wizard', 'Финальное распределение', 'Step 3 показывает 5 счётчиков по статусам и итоговое число.'],
  ['Wizard', 'Засеять', 'Кнопка «Засеять N» → wizard закрывается, тост «Создано N карт.».'],
  ['Tweaks', 'Density compact', 'Tweak «плотно» → меньше padding, заголовок 12px.'],
  ['Tweaks', 'Layout list', 'Tweak «строки» → карточки в одну строку с ellipsis.'],
  ['Tweaks', 'Color top/dot/tint', 'Все 4 варианта рисуют статус по-разному.'],
  ['Tweaks', 'Cell limit', 'Слайдер меняет лимит, появляется/исчезает «+N ещё».'],
]

export function TestsChecklist() {
  const [checked, setChecked] = useState<Set<number>>(new Set())

  const toggle = (i: number) => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      {TESTS.map(([area, title, desc], i) => {
        const isChecked = checked.has(i)
        return (
          <button
            key={i}
            type="button"
            onClick={() => toggle(i)}
            className={`grid w-full grid-cols-[22px_1fr_auto] items-start gap-2.5 border-b border-gray-200 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-gray-50 ${
              isChecked ? '' : ''
            }`}
          >
            <span
              className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border text-[11px] ${
                isChecked
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-gray-300 bg-white text-transparent'
              }`}
              aria-checked={isChecked}
              role="checkbox"
            >
              ✓
            </span>
            <div>
              <div
                className={`font-medium ${
                  isChecked ? 'text-gray-400 line-through' : 'text-gray-900'
                }`}
              >
                {title}
              </div>
              <div className="mt-0.5 text-xs leading-snug text-gray-500">{desc}</div>
            </div>
            <span className="font-mono text-[11px] text-gray-400">{area}</span>
          </button>
        )
      })}
    </div>
  )
}
