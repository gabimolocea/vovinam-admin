/** A real `<table>` from `sm:` up, and a stacked `<ul>` of cards below it -
 * avoids horizontal scroll on mobile for multi-column data. Shared across
 * pages that list tabular data (athlete history tabs, the Sportivi table). */
export default function ResponsiveTable({ head, rows, cards }) {
  return (
    <>
      <div className="hidden overflow-x-auto rounded-lg border border-[#dce0e5] sm:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#e9ecef] text-xs uppercase tracking-wide text-[#00334d]/60">
            <tr>{head}</tr>
          </thead>
          <tbody className="divide-y">{rows}</tbody>
        </table>
      </div>
      <ul className="flex flex-col gap-2 sm:hidden">{cards}</ul>
    </>
  );
}
