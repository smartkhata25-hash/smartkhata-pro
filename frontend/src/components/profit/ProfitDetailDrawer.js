import React from 'react';
import { t } from '../../i18n/i18n';

const ProfitDetailDrawer = ({
  isOpen,
  onClose,
  title = '',
  data = [],
  loading = false,
  type = 'sales',
}) => {
  if (!isOpen) return null;

  const displayTitle = title || t('reports.details');

  const renderHeaders = () => {
    switch (type) {
      case 'sales':
        return (
          <tr>
            <th className="p-3 border">{t('common.invoice')}</th>
            <th className="p-3 border">{t('customer')}</th>
            <th className="p-3 border">{t('common.date')}</th>
            <th className="p-3 border">{t('common.amount')}</th>
          </tr>
        );

      case 'expense':
        return (
          <tr>
            <th className="p-3 border">{t('account')}</th>
            <th className="p-3 border">{t('accounts.code')}</th>
            <th className="p-3 border">{t('common.amount')}</th>
          </tr>
        );

      case 'cogs':
        return (
          <tr>
            <th className="p-3 border">{t('account')}</th>
            <th className="p-3 border">{t('common.amount')}</th>
          </tr>
        );

      case 'products':
        return (
          <tr>
            <th className="p-3 border">{t('inventory.product')}</th>
            <th className="p-3 border">{t('reports.qtySold')}</th>
            <th className="p-3 border">{t('sales')}</th>
            <th className="p-3 border">{t('cost')}</th>
            <th className="p-3 border">{t('reports.profit')}</th>
            <th className="p-3 border">{t('reports.marginPercent')}</th>
          </tr>
        );

      default:
        return null;
    }
  };

  const renderRows = () => {
    if (!data.length) {
      return (
        <tr>
          <td colSpan="10" className="text-center p-6 text-gray-500">
            {t('common.noDataFound')}
          </td>
        </tr>
      );
    }

    switch (type) {
      case 'sales':
        return data.map((item, index) => (
          <tr key={index} className="text-center hover:bg-gray-50">
            <td className="p-3 border">{item.invoiceNo || '-'}</td>
            <td className="p-3 border">{item.customerName || '-'}</td>
            <td className="p-3 border">
              {item.invoiceDate ? new Date(item.invoiceDate).toLocaleDateString() : '-'}
            </td>
            <td className="p-3 border font-semibold">
              {t('currency.rs')} {Number(item.amount || 0).toFixed(0)}
            </td>
          </tr>
        ));

      case 'expense':
        return data.map((item, index) => (
          <tr key={index} className="text-center hover:bg-gray-50">
            <td className="p-3 border">{item._id?.accountName || '-'}</td>
            <td className="p-3 border">{item._id?.accountCode || '-'}</td>
            <td className="p-3 border font-semibold text-red-500">
              {t('currency.rs')} {Number(item.total || 0).toFixed(0)}
            </td>
          </tr>
        ));

      case 'cogs':
        return data.map((item, index) => (
          <tr key={index} className="text-center hover:bg-gray-50">
            <td className="p-3 border">{item._id?.accountName || '-'}</td>
            <td className="p-3 border font-semibold text-orange-500">
              {t('currency.rs')} {Number(item.total || 0).toFixed(0)}
            </td>
          </tr>
        ));

      case 'products':
        return data.map((item, index) => (
          <tr key={index} className="text-center hover:bg-gray-50">
            <td className="p-3 border font-medium">{item.productName || '-'}</td>
            <td className="p-3 border">{Number(item.qtySold || 0).toFixed(0)}</td>
            <td className="p-3 border text-blue-600">
              {t('currency.rs')} {Number(item.sales || 0).toFixed(0)}
            </td>
            <td className="p-3 border text-red-500">
              {t('currency.rs')} {Number(item.cost || 0).toFixed(0)}
            </td>
            <td
              className={`p-3 border font-bold ${
                item.profit >= 0 ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {t('currency.rs')} {Number(item.profit || 0).toFixed(0)}
            </td>
            <td className="p-3 border font-semibold text-purple-600">
              {Number(item.margin || 0).toFixed(1)}%
            </td>
          </tr>
        ));

      default:
        return null;
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />

      <div className="fixed top-0 right-0 h-full w-full sm:w-[650px] bg-white z-50 shadow-2xl overflow-hidden flex flex-col animate-slideIn">
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50">
          <h2 className="text-lg font-bold text-gray-800">{displayTitle}</h2>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-gray-200 hover:bg-gray-300 transition"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <p className="text-gray-500">{t('common.loading')}</p>
            </div>
          ) : (
            <div className="overflow-auto border rounded-xl">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-100 sticky top-0">{renderHeaders()}</thead>
                <tbody>{renderRows()}</tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default ProfitDetailDrawer;
