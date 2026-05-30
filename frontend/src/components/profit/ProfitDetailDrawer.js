import React from 'react';

const ProfitDetailDrawer = ({
  isOpen,
  onClose,
  title = 'Details',
  data = [],
  loading = false,
  type = 'sales',
}) => {
  if (!isOpen) return null;

  /* ======================================================
     ✅ TABLE HEADERS
  ====================================================== */

  const renderHeaders = () => {
    switch (type) {
      case 'sales':
        return (
          <tr>
            <th className="p-3 border">Invoice</th>
            <th className="p-3 border">Customer</th>
            <th className="p-3 border">Date</th>
            <th className="p-3 border">Amount</th>
          </tr>
        );

      case 'expense':
        return (
          <tr>
            <th className="p-3 border">Account</th>
            <th className="p-3 border">Code</th>
            <th className="p-3 border">Amount</th>
          </tr>
        );

      case 'cogs':
        return (
          <tr>
            <th className="p-3 border">Account</th>
            <th className="p-3 border">Amount</th>
          </tr>
        );

      case 'products':
        return (
          <tr>
            <th className="p-3 border">Product</th>

            <th className="p-3 border">Qty Sold</th>

            <th className="p-3 border">Sales</th>

            <th className="p-3 border">Cost</th>

            <th className="p-3 border">Profit</th>

            <th className="p-3 border">Margin %</th>
          </tr>
        );

      default:
        return null;
    }
  };

  /* ======================================================
     ✅ TABLE ROWS
  ====================================================== */

  const renderRows = () => {
    if (!data.length) {
      return (
        <tr>
          <td colSpan="10" className="text-center p-6 text-gray-500">
            No data found
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

            <td className="p-3 border font-semibold">Rs {Number(item.amount || 0).toFixed(0)}</td>
          </tr>
        ));

      case 'expense':
        return data.map((item, index) => (
          <tr key={index} className="text-center hover:bg-gray-50">
            <td className="p-3 border">{item._id?.accountName || '-'}</td>

            <td className="p-3 border">{item._id?.accountCode || '-'}</td>

            <td className="p-3 border font-semibold text-red-500">
              Rs {Number(item.total || 0).toFixed(0)}
            </td>
          </tr>
        ));

      case 'cogs':
        return data.map((item, index) => (
          <tr key={index} className="text-center hover:bg-gray-50">
            <td className="p-3 border">{item._id?.accountName || '-'}</td>

            <td className="p-3 border font-semibold text-orange-500">
              Rs {Number(item.total || 0).toFixed(0)}
            </td>
          </tr>
        ));

      case 'products':
        return data.map((item, index) => (
          <tr key={index} className="text-center hover:bg-gray-50">
            <td className="p-3 border font-medium">{item.productName || '-'}</td>

            <td className="p-3 border">{Number(item.qtySold || 0).toFixed(0)}</td>

            <td className="p-3 border text-blue-600">Rs {Number(item.sales || 0).toFixed(0)}</td>

            <td className="p-3 border text-red-500">Rs {Number(item.cost || 0).toFixed(0)}</td>

            <td
              className={`p-3 border font-bold ${
                item.profit >= 0 ? 'text-green-600' : 'text-red-600'
              }`}
            >
              Rs {Number(item.profit || 0).toFixed(0)}
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
      {/* Overlay */}

      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />

      {/* Drawer */}

      <div className="fixed top-0 right-0 h-full w-full sm:w-[650px] bg-white z-50 shadow-2xl overflow-hidden flex flex-col animate-slideIn">
        {/* Header */}

        <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50">
          <h2 className="text-lg font-bold text-gray-800">{title}</h2>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-gray-200 hover:bg-gray-300 transition"
          >
            ✕
          </button>
        </div>

        {/* Body */}

        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <p className="text-gray-500">Loading...</p>
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
