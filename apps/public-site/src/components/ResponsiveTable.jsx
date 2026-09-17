import { Children } from 'react';

/** A real `<table>` from `sm:` up, and a stacked `<ul>` of cards below it -
 * avoids horizontal scroll on mobile for multi-column data. Shared across
 * pages that list tabular data (athlete history tabs, the Sportivi table).
 * When `rows`/`cards` are empty and `emptyMessage` is given, the table/card
 * list itself stays (header still visible) with a single row/card saying so,
 * instead of the whole table disappearing behind a plain paragraph. */
export default function ResponsiveTable({ head, rows, cards, emptyMessage }) {
  const isEmpty = emptyMessage != null && (Array.isArray(rows) ? rows.length === 0 : !rows);
  const columnCount = Children.count(head?.props?.children) || 1;
  return (
    <>
      <div className="hidden overflow-x-auto rounded-lg border border-[#dce0e5] sm:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#e9ecef] text-xs uppercase tracking-wide text-[#00334d]/60">
            <tr>{head}</tr>
          </thead>
          <tbody className="divide-y">
            {isEmpty ? (
              <tr><td colSpan={columnCount} className="px-4 py-6 text-center text-[#00334d]/60">{emptyMessage}</td></tr>
            ) : rows}
          </tbody>
        </table>
      </div>
      <ul className="flex flex-col gap-2 sm:hidden">
        {isEmpty ? (
          <li className="rounded-lg border border-[#dce0e5] px-4 py-6 text-center text-sm text-[#00334d]/60">{emptyMessage}</li>
        ) : cards}
      </ul>
    </>
  );
}
