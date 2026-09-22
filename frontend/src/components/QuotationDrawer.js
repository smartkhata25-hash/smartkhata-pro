import React, { useEffect, useState } from 'react';
import { t } from '../i18n/i18n';
import { formatBusinessDateForDisplay } from '../utils/localDateTime';

const QuotationDrawer = ({
  open,
  quotations = [],
  loading = false,
  deletingId = '',
  canDelete = false,
  onClose,
  onOpen,
  onDelete,
  onSearch,
}) => {
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!open) setSearch('');
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[10000] no-print" role="dialog" aria-modal="true">
      <button
        type="button"
        className="absolute inset-0 bg-black/35"
        aria-label={t('common.close')}
        onClick={onClose}
      />

      <aside className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{t('quotation.list')}</h2>
            <p className="text-xs text-gray-500">
              {quotations.length} {t('quotation.records')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded border text-lg text-gray-600 hover:bg-gray-100"
            aria-label={t('common.close')}
          >
            &times;
          </button>
        </div>

        <form
          className="flex gap-2 border-b p-3"
          onSubmit={(event) => {
            event.preventDefault();
            onSearch(search);
          }}
        >
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('quotation.search')}
            className="min-w-0 flex-1 rounded border px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
          <button type="submit" className="rounded bg-blue-600 px-4 py-2 text-sm text-white">
            {t('search')}
          </button>
        </form>

        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <p className="py-10 text-center text-sm text-gray-500">{t('common.loading')}</p>
          ) : quotations.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-500">{t('quotation.none')}</p>
          ) : (
            <div className="space-y-2">
              {quotations.map((quotation) => (
                <div
                  key={quotation._id}
                  className="flex items-center gap-3 rounded border border-gray-200 p-3 hover:border-blue-300 hover:bg-blue-50"
                >
                  <button
                    type="button"
                    onClick={() => onOpen(quotation._id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="block font-semibold text-gray-900">
                      {quotation.quotationNo}
                    </span>
                    <span className="block truncate text-sm text-gray-700">
                      {quotation.customerName}
                    </span>
                    <span className="block text-xs text-gray-500">
                      {formatBusinessDateForDisplay(quotation.quotationDate)} ·{' '}
                      {Number(quotation.grandTotal || 0).toLocaleString()}
                    </span>
                  </button>

                  {canDelete && (
                    <button
                      type="button"
                      disabled={deletingId === quotation._id}
                      onClick={() => onDelete(quotation)}
                      className="rounded border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      {deletingId === quotation._id
                        ? t('quotation.deleting')
                        : t('delete')}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
};

export default QuotationDrawer;
