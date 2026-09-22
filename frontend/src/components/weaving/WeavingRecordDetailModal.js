import React from 'react';
import { FaTimes } from 'react-icons/fa';

const display = (value) => {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'number') return value.toLocaleString('en-PK', { maximumFractionDigits: 2 });
  return String(value);
};

export default function WeavingRecordDetailModal({ title, fields = [], lines = [], columns = [], actions = null, onClose }) {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/45 p-3">
      <section className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-md bg-white shadow-2xl" role="dialog" aria-modal="true" aria-label={title}>
        <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-5 py-4">
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <button type="button" aria-label="Close" title="Close" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100">
            <FaTimes />
          </button>
        </header>
        <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
          {fields.map(([label, value]) => (
            <div key={label} className="min-w-0 rounded-md border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs font-semibold uppercase text-slate-500">{label}</div>
              <div className="mt-1 break-words text-sm font-semibold text-slate-900">{display(value)}</div>
            </div>
          ))}
        </div>
        {lines.length > 0 && columns.length > 0 && (
          <div className="overflow-x-auto border-t">
            <table className="min-w-full text-sm">
              <thead className="bg-teal-50 text-left text-xs uppercase text-slate-700">
                <tr>{columns.map((column) => <th key={column.key} className="px-4 py-3">{column.label}</th>)}</tr>
              </thead>
              <tbody>
                {lines.map((line, index) => (
                  <tr key={line._id || index} className="border-t">
                    {columns.map((column) => <td key={column.key} className="px-4 py-3">{display(column.render ? column.render(line) : line[column.key])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {actions && <footer className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t bg-white px-5 py-4">{actions}</footer>}
      </section>
    </div>
  );
}
