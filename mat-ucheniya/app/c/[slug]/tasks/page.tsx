export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getCampaignBySlug } from '@/lib/campaign'
import { getMembership, requireAuth } from '@/lib/auth'
import { TestsChecklist } from './tests-checklist'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const campaign = await getCampaignBySlug(slug)
  return { title: campaign ? `Задачи — ${campaign.name}` : 'Задачи' }
}

/**
 * Spec-022 «Тасктрекер» — placeholder overview page.
 *
 * This page renders the design package's overview.html as a status
 * landing page while the actual feature goes through spec-kit
 * (Specify → Clarify → Plan → Tasks → Implement). It documents what
 * the kanban board will be, what's already decided, and what's left
 * for the spec.
 *
 * Source: Claude Design package h/e2Zv9lvo8GKkV4FiTp47JA · overview.html
 * (chat 81, 2026-04-30).
 */
export default async function TasksPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const campaign = await getCampaignBySlug(slug)
  if (!campaign) notFound()

  await requireAuth()
  const membership = await getMembership(campaign.id)
  if (!membership) notFound()

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Crumb */}
      <div className="font-mono text-xs text-gray-400">
        spec-022 · Task Tracker · обзор
      </div>

      {/* Heading */}
      <h1 className="mt-1.5 text-3xl font-bold tracking-tight text-gray-900">
        Задачи · обзор прототипа
      </h1>
      <p className="mt-1.5 mb-7 max-w-3xl text-base leading-relaxed text-gray-600">
        Хи-фай прототип канбана{' '}
        <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-900">
          /c/[slug]/tasks
        </code>{' '}
        для «Мать Учения». Эта страница — точка входа: посмотреть, какие решения
        приняты, прогнать тестовые сценарии и подготовиться к спецификации.
      </p>

      {/* TOC */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          В этой странице:
        </span>
        <a href="#what" className="text-blue-600 hover:underline">
          Что внутри
        </a>
        <a href="#decisions" className="text-blue-600 hover:underline">
          Решения
        </a>
        <a href="#screens" className="text-blue-600 hover:underline">
          Экраны
        </a>
        <a href="#tests" className="text-blue-600 hover:underline">
          Тесты
        </a>
        <a href="#openq" className="text-blue-600 hover:underline">
          Открытые вопросы
        </a>
        <a href="#scope" className="text-blue-600 hover:underline">
          Out of scope
        </a>
      </div>

      <hr className="my-7 border-gray-200" />

      {/* What's inside */}
      <h2 id="what" className="mb-3 text-xl font-semibold tracking-tight text-gray-900">
        Что внутри прототипа
      </h2>
      <div className="rounded-lg border border-gray-200 bg-white px-5 py-4">
        <dl className="grid grid-cols-[140px_1fr] gap-x-5 gap-y-1.5 text-sm">
          <dt className="pt-0.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Маршрут
          </dt>
          <dd className="m-0 text-gray-900">
            <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs">
              /c/[slug]/tasks
            </code>
          </dd>

          <dt className="pt-0.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Аудитория
          </dt>
          <dd className="m-0 text-gray-900">1 ДМ (десктоп) + 4–6 игроков (read-mostly)</dd>

          <dt className="pt-0.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Стек
          </dt>
          <dd className="m-0 text-gray-900">
            <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs">Next.js 16</code>{' '}
            ·{' '}
            <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs">React 19</code>{' '}
            ·{' '}
            <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs">Tailwind v4</code>{' '}
            ·{' '}
            <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs">Supabase</code>
          </dd>

          <dt className="pt-0.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Язык интерфейса
          </dt>
          <dd className="m-0 text-gray-900">
            Русский (
            <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs">
              html lang=&quot;ru&quot;
            </code>
            )
          </dd>

          <dt className="pt-0.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Дизайн-система
          </dt>
          <dd className="m-0 text-gray-900">
            Мать Учения (warm-white spreadsheet · single blue accent)
          </dd>

          <dt className="pt-0.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Состав
          </dt>
          <dd className="m-0 text-gray-900">
            Доска (matrix) + popover-карточка + drawer настроек + 3-step wizard
          </dd>
        </dl>
      </div>

      {/* Decisions */}
      <h2 id="decisions" className="mb-3 mt-10 text-xl font-semibold tracking-tight text-gray-900">
        Решения по дизайну
      </h2>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <DecisionCard title="Структура">
          <li>
            Матрица <b>5×5</b>: проекты × статусы
          </li>
          <li>Sticky первая строка (статусы) и первый столбец (проекты)</li>
          <li>
            Сортировка в ячейке:{' '}
            <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs">
              last_activity DESC
            </code>
          </li>
          <li>
            Лимит карт. в ячейке: 6 → потом «
            <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs">+N ещё</code>»
          </li>
          <li>Status set: идея / backlog / в работе / на проверке / готово</li>
        </DecisionCard>

        <DecisionCard title="Карточка">
          <li>Левая 3px полоса = цвет статуса (по умолчанию)</li>
          <li>
            Эмодзи типа узла +{' '}
            <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs">ref</code>{' '}
            (spec-022, IDEA-047, E-04)
          </li>
          <li>
            Заголовок · 2 строки клампа ·{' '}
            <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs">
              text-wrap: pretty
            </code>
          </li>
          <li>
            Мета: аватар · дата ·{' '}
            <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs">↻</code>{' '}
            auto-sync · ● внимание
          </li>
          <li>
            «Готово» — <i>strike-through</i> + приглушённый цвет
          </li>
        </DecisionCard>

        <DecisionCard title="Раскрытая карточка">
          <li>Floating popover, anchor — карточка в ячейке</li>
          <li>Авто-флип left↔right при нехватке места</li>
          <li>Backdrop прозрачный — доска видна, но клик по фону закрывает</li>
          <li>
            Внутри: пикеры статуса/проекта/исполнителя, тогглы внимания и auto-sync, выдержка узла,
            активность, «Открыть узел →» / «Снять с доски»
          </li>
        </DecisionCard>

        <DecisionCard title="Действия и состояние">
          <li>DnD карточек между ячейками → меняет project+status</li>
          <li>Pickers по статусу / исполнителю / проекту — оптимистичный апдейт + тост</li>
          <li>
            Тост «Снято с доски» с <i>Отменить</i> (в течение ~4 сек)
          </li>
          <li>Filter chips конъюнктивно + поиск + ●внимание</li>
          <li>Default assignee на создание — текущий пользователь</li>
        </DecisionCard>
      </div>

      {/* Screens */}
      <h2 id="screens" className="mb-3 mt-10 text-xl font-semibold tracking-tight text-gray-900">
        Экраны
      </h2>
      <div className="rounded-lg border border-gray-200 bg-white px-5 py-4">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <Th width="220px">Экран</Th>
              <Th>Где открывается</Th>
              <Th>Назначение</Th>
            </tr>
          </thead>
          <tbody>
            <ScreenRow
              name="Главная — доска"
              where={
                <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs">
                  /c/[slug]/tasks
                </code>
              }
              purpose="Матрица project × status. Header + filter row + 2D-скролл, sticky шапки."
            />
            <ScreenRow
              name="Popover карточки"
              where="клик на карточке"
              purpose="Все поля + действия. Не блокирует доску."
            />
            <ScreenRow
              name="Pickers"
              where="триггеры в popover'е и в фильтрах"
              purpose="Статус, исполнитель, проект, тип узла."
            />
            <ScreenRow
              name="Drawer · настройки"
              where={<i>кнопка «Настройки»</i>}
              purpose="Колонки (label · color · count · удалить) и проекты. CTA «Засеять»."
            />
            <ScreenRow
              name="Wizard · pre-seed"
              where="CTA из header / drawer / empty-state"
              purpose="3 шага: источники → превью с exclude → подтверждение с распределением."
            />
            <ScreenRow
              name="Tweaks"
              where="тогл «Tweaks» в тулбаре превью"
              purpose="Плотность · раскладка ячейки · цвет статуса · лимит · подсказка пустой ячейки."
              isLast
            />
          </tbody>
        </table>
      </div>

      {/* Tests */}
      <h2 id="tests" className="mb-3 mt-10 text-xl font-semibold tracking-tight text-gray-900">
        Тестовые сценарии
      </h2>
      <p className="mb-3 text-sm leading-relaxed text-gray-600">
        Прогон вручную по прототипу. Чекбоксы — локальное состояние, не сохраняются.
      </p>
      <TestsChecklist />

      {/* Open questions */}
      <h2 id="openq" className="mb-3 mt-10 text-xl font-semibold tracking-tight text-gray-900">
        Открытые вопросы (из брифа)
      </h2>
      <div className="rounded-lg border border-gray-200 bg-white px-5 py-4">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <Th width="60px">№</Th>
              <Th>Вопрос</Th>
              <Th width="220px">Решение в прототипе</Th>
              <Th>Статус</Th>
            </tr>
          </thead>
          <tbody>
            <QRow n="1" q="DnD между ячейками в MVP" answer="Да, с тостом" status="wip" />
            <QRow
              n="2"
              q="Default assignee при создании"
              answer="Текущий пользователь"
              status="done"
            />
            <QRow
              n="3"
              q="Лимит карт. в ячейке до сворачивания"
              answer="6 (настраивается tweak'ом)"
              status="review"
            />
            <QRow
              n="4"
              q="Откат pre-seed — нужен ли"
              answer="Нота про 24-ч окно (UI готов)"
              status="backlog"
            />
            <QRow
              n="5"
              q="Сортировка карт. в ячейке"
              answer={
                <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs">
                  last_activity DESC
                </code>
              }
              status="done"
            />
            <QRow
              n="6"
              q="Per-project status sets"
              answer="Один общий набор"
              status="idea"
              isLast
            />
          </tbody>
        </table>
      </div>

      {/* Out of scope */}
      <h2 id="scope" className="mb-3 mt-10 text-xl font-semibold tracking-tight text-gray-900">
        Out of scope для MVP
      </h2>
      <div className="rounded-lg border border-gray-200 bg-white px-5 py-4">
        <ul className="ml-5 list-disc space-y-1 text-sm leading-relaxed text-gray-600">
          <li>Тайм-трекинг, спринты, burndown, velocity</li>
          <li>Уведомления, дедлайны, e-mail</li>
          <li>Real-time co-editing</li>
          <li>Trello / Linear / Notion интеграции</li>
          <li>
            Filter DSL (
            <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs">
              is:open assignee:me
            </code>
            )
          </li>
          <li>Mobile / touch — отдельная спека</li>
          <li>Sub-tasks, parent/child зависимости</li>
          <li>Иерархия Epic → spec (в MVP оба независимы)</li>
          <li>Описание проекта (только имя)</li>
        </ul>
      </div>

      <hr className="my-7 border-gray-200" />
      <p className="font-mono text-xs text-gray-400">spec-022 · prototype v1 · 2026-04-30</p>
    </div>
  )
}

function DecisionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-5 py-4">
      <h3 className="mb-2 mt-0 text-base font-semibold text-gray-900">{title}</h3>
      <ul className="ml-5 list-disc space-y-1 text-sm leading-relaxed text-gray-600">{children}</ul>
    </div>
  )
}

function Th({ children, width }: { children: React.ReactNode; width?: string }) {
  return (
    <th
      className="border-b border-gray-200 px-2.5 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-400"
      style={width ? { width } : undefined}
    >
      {children}
    </th>
  )
}

function ScreenRow({
  name,
  where,
  purpose,
  isLast,
}: {
  name: string
  where: React.ReactNode
  purpose: string
  isLast?: boolean
}) {
  const cls = `px-2.5 py-1.5 align-top text-gray-900 ${isLast ? '' : 'border-b border-gray-200'}`
  return (
    <tr>
      <td className={cls}>
        <b>{name}</b>
      </td>
      <td className={`${cls} text-gray-600`}>{where}</td>
      <td className={`${cls} text-gray-600`}>{purpose}</td>
    </tr>
  )
}

const STATUS_PILL: Record<string, { bg: string; fg: string; dot: string; label: string }> = {
  idea: { bg: 'bg-gray-100', fg: 'text-gray-500', dot: 'bg-gray-400', label: 'в идеях' },
  backlog: { bg: 'bg-gray-100', fg: 'text-gray-600', dot: 'bg-gray-500', label: 'обсуждаем' },
  wip: { bg: 'bg-blue-100', fg: 'text-blue-700', dot: 'bg-blue-600', label: 'в работе' },
  review: { bg: 'bg-amber-100', fg: 'text-amber-800', dot: 'bg-amber-500', label: 'тестируем' },
  done: { bg: 'bg-emerald-100', fg: 'text-emerald-700', dot: 'bg-emerald-600', label: 'решено' },
}

function StatusPill({ kind }: { kind: keyof typeof STATUS_PILL }) {
  const s = STATUS_PILL[kind]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${s.bg} ${s.fg}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  )
}

function QRow({
  n,
  q,
  answer,
  status,
  isLast,
}: {
  n: string
  q: string
  answer: React.ReactNode
  status: keyof typeof STATUS_PILL
  isLast?: boolean
}) {
  const cls = `px-2.5 py-1.5 align-top ${isLast ? '' : 'border-b border-gray-200'}`
  return (
    <tr>
      <td className={`${cls} text-gray-900`}>
        <b>{n}</b>
      </td>
      <td className={`${cls} text-gray-900`}>{q}</td>
      <td className={`${cls} text-gray-600`}>{answer}</td>
      <td className={cls}>
        <StatusPill kind={status} />
      </td>
    </tr>
  )
}
