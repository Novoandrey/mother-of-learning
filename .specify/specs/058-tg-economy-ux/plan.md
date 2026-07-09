# Plan: UX-переработка /tg-экономики (spec-058)

Ветка `claude/spec-058-tg-ux`. Реализует spec.md (решения Andrey: 3 таба,
полная переборка форм 044/052, продажа из сумки, NL позже).

## Архитектура: распил ledger-app.tsx (4941 строка) на модули

```
app/tg/_components/
  shell.tsx        — таб-бар (⚡/🎒/🏰) + навигационный СТЕК (View[], push/pop;
                     системный «назад» = pop) + realtime-refresh как сейчас
  primitives.tsx   — Sheet(R2), SegToggle, IntInput, SubmitButton, WalletCard,
                     FeedList/FeedRow, Avatar/Portrait, AppButton, FIELD,
                     parseGp/parseHHMM (перенос из ledger-app как есть)
  action-hub.tsx   — таб ⚡: чипы последних операций PC (из ленты) + плитка
                     глаголов: Потратил·Получил·Купил·Передал·Продал·Ещё
  action-sheets.tsx— ЕДИНЫЙ пайплайн: каждый глагол = короткая форма → превью
                     («−50 зм · зелье ×1 · за свои») → сабмит → тост.
                     Внутри: SpendSheet, GainSheet, BuySheet(перенос+адаптация
                     с funding/keep), GiveSheet (кому: PC/общак; что: деньги/
                     предмет — замена мега-TransferSheet), SellSheet (новый,
                     sellPcItem + ресурсы общака), MoreSheet (кредит,
                     стартовый набор, наборы-управление)
  character-tab.tsx— таб 🎒: кошелёк + «Надето» (слоты, tap-to-equip) +
                     «Сумка» + лента своих движений; тап по предмету →
                     ItemActionSheet (Надеть/Снять·Передать·В общак·Продал)
                     — вызывает те же action-sheets с префиллом
  party-tab.tsx    — таб 🏰: общак (кошелёк+предметы+положить/забрать+
                     ресурсы-продажа) + Вылазки + Крафт + Балансы (перенос
                     ExpeditionsScreen/CraftScreen/шитов КАК ЕСТЬ)
  wiki-app.tsx     — не трогаем; вход «📖» из шапки shell
```

- `page.tsx`: View-switch → shell с тремя табами; выбор PC остаётся
  (CharacterList при ≥2 PC; активный PC — в шапке shell, переключение тапом).
- Хоронится: RequestsScreen, тернарник dirOptions, дубль-корни, ручные onBack.
- `dayInLoop:1` — одна константа `QUICK_ACTION_DAY` с комментом (спека 057).

## Новый server action: `sellPcItem` (данные — интегратор)

`app/actions/transactions.ts` или рядом: гейт resolveAuth+isPcOwner (канон
createTransaction) → item-out (−qty, actor=PC) + money-in (+сумма, actor=PC)
одним батчем с transfer_group_id; цена по умолчанию из каталога
(resolveBuyUnitPriceGp), правится в форме; событие в ленту (тип 'sale' НЕ
заводим — обычные строки, как продажа ресурсов). Аналогично — вариант
«продать из общака» уже есть (sellStashResource).

## Волны

- **W0 (интегратор)**: sellPcItem + тест. Параллельно W1.
- **W1 (агент)**: shell + primitives + page.tsx + скелеты трёх табов
  (пустые, но навигация работает). Определяет ИНТЕРФЕЙСЫ (нав-API, пропсы).
- **W2 (агент, после W1)**: action-hub + action-sheets (переборка форм).
- **W3 (агент, после W1, ∥ W2)**: character-tab (+ItemActionSheet).
- **W4 (агент, после W1, ∥ W2/W3)**: party-tab (перенос вылазок/крафта/общака).
- **W5 (интегратор)**: сшивка, удаление старого кода из ledger-app.tsx,
  полный гейт, **прогон ux-auditor** (вердикт ship по фразам игрока),
  фиксы, PR.

Файловые домены W2/W3/W4 не пересекаются (каждый — свой новый файл; общие
shell/primitives — read-only после W1).

## Success Criteria — как в spec.md (SC-001…005). Ключевой гейт: ux-auditor.
