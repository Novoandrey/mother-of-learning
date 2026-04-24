'use client';

/**
 * `<InventoryGridRow>` — one item row with expandable instance list
 * (spec-011, T021).
 *
 * Internal state keeps this component simple (one row expanded at a
 * time is a UX polish that would require a shared parent context; MVP
 * uses per-row local state so expanding one row doesn't auto-collapse
 * others). Keyboard-accessible: Enter/Space toggle expand.
 *
 * Rendering:
 *   - Row header is a CSS grid: `1fr 80px 120px 1fr` on desktop,
 *     stacked on mobile. Clicking/tapping anywhere on the header
 *     toggles expand.
 *   - Expand area lists `instances[]` newest-first with the full
 *     droppedBy / session / comment / author / day context.
 *   - Negative-qty items (`warning`) show a red badge + red qty.
 */

import { useState, type KeyboardEvent } from 'react';
import type { StashItem } from '@/lib/stash';

type Props = {
  item: StashItem;
};

export function InventoryGridRow({ item }: Props) {
  const [isExpanded, setIsExpanded] = useState(false);

  const hasWarning = item.warning === true;
  const qtyClass = hasWarning
    ? 'text-red-600 font-semibold'
    : 'text-gray-900 font-medium';

  const toggle = () => setIsExpanded((v) => !v);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle();
    }
  };

  const latestInstance = item.instances[0];
  const commentPreview = latestInstance?.comment ?? '';

  return (
    <div className="rounded-lg border border-gray-200 bg-white transition-colors hover:border-gray-300">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        onClick={toggle}
        onKeyDown={onKeyDown}
        className="cursor-pointer px-4 py-3 md:grid md:grid-cols-[1fr_80px_120px_1fr] md:items-center md:gap-4"
      >
        {/* Item name + warning badge */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-900">{item.itemName || '(без названия)'}</span>
          {hasWarning && (
            <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-600">
              ⚠ отрицательный остаток
            </span>
          )}
        </div>

        {/* Qty */}
        <div className={`mt-1 text-sm md:mt-0 md:text-right ${qtyClass}`}>
          <span className="md:hidden text-xs uppercase tracking-wide text-gray-400 mr-2">
            Кол-во:
          </span>
          {item.qty}
        </div>

        {/* Latest (loop/day) */}
        <div className="mt-1 text-xs text-gray-500 md:mt-0">
          <span className="md:hidden text-xs uppercase tracking-wide text-gray-400 mr-2">
            Последний:
          </span>
          петля {item.latestLoop} · день {item.latestDay}
        </div>

        {/* Comment preview */}
        <div className="mt-1 truncate text-xs text-gray-500 md:mt-0">
          {commentPreview || <span className="text-gray-300">—</span>}
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-gray-100 px-4 py-3">
          {item.instances.length === 0 ? (
            <p className="text-xs text-gray-400">
              Нет зарегистрированных приходов этого предмета.
            </p>
          ) : (
            <ul className="space-y-2">
              {item.instances.map((inst) => (
                <li
                  key={inst.transactionId}
                  className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <span className="text-sm text-gray-900">
                      +{inst.qty}{' '}
                      {inst.droppedBy ? (
                        <span className="text-xs text-gray-500">
                          от {inst.droppedBy.pcTitle}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">от [неизвестно]</span>
                      )}
                    </span>
                    <span className="text-xs text-gray-400">
                      петля {inst.loopNumber} · день {inst.dayInLoop}
                    </span>
                  </div>
                  {inst.comment && (
                    <p className="mt-1 text-xs text-gray-600">{inst.comment}</p>
                  )}
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-400">
                    {inst.session && <span>Сессия: {inst.session.title}</span>}
                    {inst.author?.displayName && (
                      <span>Автор: {inst.author.displayName}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
