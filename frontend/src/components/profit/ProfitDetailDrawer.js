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
            <th className="p-3 border">{t('reports.transactionType')}</th>
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
            <th className="p-3 border">{t('inventory.product')}</th>
            <th className="p-3 border">{t('reports.qtySold')}</th>
            <th className="p-3 border">{t('reports.refundQty')}</th>
            <th className="p-3 border">{t('reports.saleCost')}</th>
            <th className="p-3 border">{t('reports.refundCost')}</th>
            <th className="p-3 border">{t('reports.netCogs')}</th>
          </tr>
        );

      case 'products':
        return (
          <tr>
            <th className="p-3 border">{t('inventory.product')}</th>
            <th className="p-3 border">{t('reports.qtySold')}</th>
            <th className="p-3 border">{t('reports.refundQty')}</th>
            <th className="p-3 border">{t('sales')}</th>
            <th className="p-3 border">{t('reports.refundAmount')}</th>
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
        return data.map((item, index) => {
          const isRefund = item.transactionType === 'refund';

          return (
            <tr
              key={item._id || index}
              className={`text-center hover:bg-gray-50 ${isRefund ? 'bg-red-50' : ''}`}
            >
              <td
                className={`p-3 border font-semibold ${
                  isRefund ? 'text-red-600' : 'text-green-600'
                }`}
              >
                {isRefund ? t('reports.refund') : t('reports.sale')}
              </td>

              <td className="p-3 border">{item.invoiceNo || '-'}</td>

              <td className="p-3 border">{item.customerName || '-'}</td>

              <td className="p-3 border">
                {item.invoiceDate ? new Date(item.invoiceDate).toLocaleDateString() : '-'}
              </td>

              <td
                className={`p-3 border font-semibold ${
                  isRefund ? 'text-red-600' : 'text-gray-800'
                }`}
              >
                {t('currency.rs')} {Number(item.amount || 0).toFixed(0)}
              </td>
            </tr>
          );
        });

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
        return data.map((item, index) => {
          const netCogs = Number(item.netCogs || item.total || 0);
          const refundQty = Number(item.refundQty || 0);
          const refundCost = Number(item.refundCost || 0);

          return (
            <tr key={item.productId || index} className="text-center hover:bg-gray-50">
              <td className="p-3 border font-medium">
                {item.productName || item._id?.accountName || '-'}
              </td>

              <td className="p-3 border">{Number(item.soldQty || 0).toFixed(0)}</td>

              <td className="p-3 border text-orange-600 font-medium">
                {refundQty > 0 ? `-${refundQty.toFixed(0)}` : '0'}
              </td>

              <td className="p-3 border text-blue-600 font-semibold">
                {t('currency.rs')} {Number(item.saleCost || 0).toFixed(0)}
              </td>

              <td className="p-3 border text-red-500 font-semibold">
                {refundCost > 0
                  ? `-${t('currency.rs')} ${refundCost.toFixed(0)}`
                  : `${t('currency.rs')} 0`}
              </td>

              <td
                className={`p-3 border font-bold ${
                  netCogs >= 0 ? 'text-orange-600' : 'text-red-600'
                }`}
              >
                {t('currency.rs')} {netCogs.toFixed(0)}
              </td>
            </tr>
          );
        });

      case 'products':
        return data.map((item, index) => (
          <tr key={item.productId || index} className="text-center hover:bg-gray-50">
            <td className="p-3 border font-medium">{item.productName || '-'}</td>

            <td className="p-3 border">{Number(item.qtySold || 0).toFixed(0)}</td>

            <td className="p-3 border text-orange-600 font-medium">
              {Number(item.refundQty || 0) > 0 ? `-${Number(item.refundQty).toFixed(0)}` : '0'}
            </td>

            <td className="p-3 border text-blue-600">
              {t('currency.rs')} {Number(item.sales || 0).toFixed(0)}
            </td>

            <td className="p-3 border text-red-500 font-medium">
              {Number(item.refundAmount || 0) > 0
                ? `-${Number(item.refundAmount).toFixed(0)}`
                : '0'}
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

      <div className="fixed top-0 right-0 h-full w-full sm:w-[900px] bg-white z-50 shadow-2xl overflow-hidden flex flex-col animate-slideIn">
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50">
          <h2 className="text-lg font-bold text-gray-800">{displayTitle}</h2>

          <button
            type="button"
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
