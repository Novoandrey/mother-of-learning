# Дизайн-токены

> `mat-ucheniya/STYLE.md` — единственный источник истины для UI-стилей.
> Принцип constitution XI: «реюзай, не городи». Если `className` не совпадает
> с токеном ниже — остановись и сверься с `STYLE.md` перед тем, как изобретать
> новый.

---

## Инпуты

Все текстовые поля, `<textarea>`, `<select>`, числовые инпуты:

```
rounded-lg border border-gray-200 px-3 py-2 text-sm
placeholder:text-gray-400 focus:border-blue-500 focus:outline-none
```

Дополнения для `<textarea>`: `resize-y`. Для code/markdown: `font-mono`.

---

## Кнопки

### Primary (полная)
```
rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white
hover:bg-blue-700 disabled:opacity-50 transition-colors
```

### Primary (compact — в хедерах, навигации)
```
rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white
hover:bg-blue-700 transition-colors
```

### Secondary
```
rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600
hover:bg-gray-50 transition-colors
```

### Secondary (compact — «Редактировать» в хедерах)
```
rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600
hover:bg-gray-50 transition-colors
```

### Text link
```
text-sm text-blue-600 hover:underline
```

### Danger text
```
text-sm text-red-500 hover:text-red-700
```

---

## Карточки и контейнеры

**Стандартная карточка:** `rounded-lg border border-gray-200 bg-white p-4`.
Для крупных секций — `p-5`.

**Кликабельная строка списка:** `rounded-lg border border-gray-200 bg-white px-4 py-3 hover:border-gray-300 transition-colors`.

**Инлайн-редактирование:** `rounded-lg border border-blue-200 bg-blue-50/50 p-3`.

---

## Чипы и статусные цвета

Чипы — кнопки-фильтры в списках:

| Вариант | Классы |
|---|---|
| Активный | `rounded-full px-3 py-1 text-sm font-medium bg-gray-900 text-white transition-colors` |
| Неактивный | `rounded-full px-3 py-1 text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors` |

Теги на карточках сущностей: `rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-600`.

**Статусные цвета** ledger-строк (amber/emerald/red/gray) обеспечивают контраст
WCAG AAA — использовать только эти токены, не вводить ad-hoc цвета.

---

## Типографика

| Роль | Классы |
|---|---|
| Заголовок страницы | `text-2xl font-bold text-gray-900` |
| Секционный хедер (uppercase) | `text-xs font-semibold uppercase tracking-wide text-gray-400` |
| Ссылка «назад» | `text-sm text-gray-400 hover:text-gray-600 transition-colors` |

---

## Сайдбар

- Поиск — стандартный инпут-токен.
- Тип-хедеры — `text-xs font-semibold uppercase tracking-wide text-gray-400`.
- Активный элемент: `bg-blue-50 text-blue-700 font-medium`.
- Неактивный: `text-gray-700 hover:bg-gray-100`.

---

## Пустые состояния и ошибки

**Пустое состояние:** `rounded-lg border border-dashed border-gray-200 py-12 text-center`, текст `text-gray-400` или `text-gray-500`.

**Ошибка:** `text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2`.

---

## Как добавить новый токен

1. Убедись, что ни один из существующих токенов не подходит.
2. Добавь в `STYLE.md` с описанием, когда использовать.
3. Создай компонент, используя новый токен.
4. **Не копируй `className` из других компонентов** — только из `STYLE.md`.
   Дублирование ведёт к расхождениям стиля и к рефакторингу через боль.
