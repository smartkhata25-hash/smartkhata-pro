import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import RefundInvoiceForm from '../components/RefundInvoiceForm';
import { t } from '../i18n/i18n';

export default function RefundPage() {
  const token = localStorage.getItem('token');
  const { id } = useParams(); // اگر URL میں :id موجود ہو تو وہ یہاں آ جائے گا

  // 🔹 Selected IDs
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [selectedProductId, setSelectedProductId] = useState(null);

  // 🔹 Sales history state
  const [salesHistory, setSalesHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // 🔹 Fetch sales history
  const fetchSalesHistory = useCallback(
    async (customerId, productId) => {
      if (!customerId || !productId) {
        setSalesHistory([]);
        return;
      }

      try {
        setLoadingHistory(true);

        const res = await fetch(
          `/api/sales-history?customerId=${customerId}&productId=${productId}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        const data = await res.json();

        if (res.ok) {
          setSalesHistory(data || []);
        } else {
          setSalesHistory([]);
        }
      } catch (err) {
        console.error(t('alerts.salesHistoryFailed'), err);
        setSalesHistory([]);
      } finally {
        setLoadingHistory(false);
      }
    },
    [token]
  );

  // 🔁 Trigger fetch
  useEffect(() => {
    fetchSalesHistory(selectedCustomerId, selectedProductId);
  }, [selectedCustomerId, selectedProductId, fetchSalesHistory]);
  return (
    <div className="w-full max-w-full overflow-x-hidden px-2 md:px-4">
      <div className="grid grid-cols-12 gap-2 md:gap-4">
        {/* 🟨 LEFT SIDE – Sales History Panel */}
        <div className="hidden md:block col-span-1 border rounded p-2 bg-gray-50 min-h-[600px]">
          <h3 className="font-semibold text-sm mb-3">{t('sales.previous')}</h3>
          {loadingHistory && <p className="text-xs text-gray-400">{t('sales.loadingHistory')}</p>}

          {!loadingHistory && salesHistory.length === 0 && (
            <p className="text-xs text-gray-500">{t('sales.noHistory')}</p>
          )}

          {salesHistory.length > 0 && (
            <ul className="space-y-2 text-sm mt-2">
              {salesHistory.map((h) => {
                const safeDate = h.invoiceDate
                  ? new Date(h.invoiceDate).toLocaleDateString()
                  : t('common.na');

                return (
                  <li key={h._id} className="border rounded p-2 hover:bg-yellow-50">
                    <div className="text-xs text-gray-600">
                      {safeDate} | Bill #{h.billNo}
                    </div>
                    <div className="font-semibold text-gray-800">Rs. {h.rate}</div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* 🟩 RIGHT SIDE – Refund Form */}
        <div className="col-span-12 md:col-span-11">
          <RefundInvoiceForm
            token={token}
            refundId={id}
            onCustomerChange={setSelectedCustomerId}
            onProductChange={setSelectedProductId}
            salesHistory={salesHistory}
            loadingHistory={loadingHistory}
          />
        </div>
      </div>
    </div>
  );
}
