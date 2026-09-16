/** A real `<table>` from `sm:` up, and a stacked `<ul>` of cards below it -
 * avoids horizontal scroll on mobile for multi-column data. Mirrors the
 * public site's own ResponsiveTable so this app's tabs read the same way. */
export default function ResponsiveTable({ head, rows, cards }) {
  return (
    <>
      <div className="hidden overflow-x-auto rounded-lg border border-border sm:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted text-xs uppercase tracking-wide text-muted-foreground">
            <tr>{head}</tr>
          </thead>
          <tbody className="divide-y divide-border">{rows}</tbody>
        </table>
      </div>
      <ul className="flex flex-col gap-2 sm:hidden">{cards}</ul>
    </>
  );
}
