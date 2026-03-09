export function StatusBadge({ status, label }) {
  const styles = {
    approved: 'bg-green-100 text-green-800',
    pending: 'bg-yellow-200 text-black border border-black',
    rejected: 'bg-red-100 text-red-800',
    revision_required: 'bg-orange-100 text-orange-800',
    active: 'bg-yellow-300 text-black border border-black',
    completed: 'bg-black text-yellow-300 border border-yellow-300',
    draft: 'bg-gray-100 text-gray-800 border border-gray-400',
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide ${styles[status] ?? 'bg-gray-100 text-gray-800 border border-gray-400'}`}
    >
      {label ?? status?.replace(/_/g, ' ') ?? '—'}
    </span>
  );
}

export function Card({ children, className = '' }) {
  return <div className={`frvv-surface p-6 ${className}`}>{children}</div>;
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b-2 border-black pb-3">
      <div>
        <h1 className="text-2xl font-black uppercase tracking-wide text-black">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-gray-600">{subtitle}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}

export function Spinner({ className = 'h-8 w-8' }) {
  return (
    <div className={`animate-spin rounded-full border-4 border-black border-t-yellow-400 ${className}`} />
  );
}

export function EmptyState({ icon = '📭', title, message }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-gray-500">
      <span className="text-4xl">{icon}</span>
      <p className="mt-2 font-medium">{title}</p>
      {message && <p className="mt-1 text-sm">{message}</p>}
    </div>
  );
}

export function DataTable({ columns, rows, onRowClick }) {
  return (
    <div className="overflow-x-auto border-2 border-black bg-white">
      <table className="min-w-full divide-y divide-gray-300">
        <thead className="bg-black text-white">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-yellow-200"
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 bg-white">
          {rows.map((row, i) => (
            <tr
              key={row.id ?? i}
              onClick={() => onRowClick?.(row)}
              className={onRowClick ? 'cursor-pointer hover:bg-yellow-50' : ''}
            >
              {columns.map((col) => (
                <td key={col.key} className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                  {col.render ? col.render(row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
