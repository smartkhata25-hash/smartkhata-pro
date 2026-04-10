import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import InvoiceForm from '../components/InvoiceForm';
import { t } from '../i18n/i18n';

export default function SalesPage() {
  const token = localStorage.getItem('token');
  const [searchParams] = useSearchParams();
  const invoiceId = searchParams.get('invoiceId');

  // 🔹 Panel show / hide
  const [showHistory, setShowHistory] = useState(true);

  // 🔹 Selected IDs from InvoiceForm
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

  // 🔁 Trigger fetch when customer or product changes
  useEffect(() => {
    fetchSalesHistory(selectedCustomerId, selectedProductId);
  }, [selectedCustomerId, selectedProductId, fetchSalesHistory]);

  return (
    <div className="w-full px-2 md:px-4">
      <div className="grid grid-cols-12 gap-2 md:gap-4">
        {/* 🔹 Show button when panel hidden */}
        {!showHistory && (
          <div className="col-span-12 mb-2">
            <button
              onClick={() => setShowHistory(true)}
              className="text-sm text-blue-600 underline"
            >
              {t('sales.showPrevious')}
            </button>
          </div>
        )}

        {/* 🟨 LEFT SIDE – Sales History Panel */}
        {showHistory && (
          <div className="hidden md:block col-span-1 border rounded p-2 bg-gray-50 min-h-[600px]">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold text-sm">{t('sales.previous')}</h3>
              <button
                onClick={() => setShowHistory(false)}
                className="text-xs text-blue-600 underline"
              >
                {t('hide')}
              </button>
            </div>

            {/* 🔄 Loading */}
            {loadingHistory && <p className="text-xs text-gray-400">{t('sales.loadingHistory')}</p>}

            {/* ❌ No data */}
            {!loadingHistory && salesHistory.length === 0 && (
              <p className="text-xs text-gray-500">{t('sales.noHistory')}</p>
            )}

            {/* ✅ History list */}
            {salesHistory.length > 0 && (
              <ul className="space-y-2 text-sm mt-2">
                {salesHistory.map((h) => {
                  const safeDate = h.invoiceDate
                    ? new Date(h.invoiceDate).toLocaleDateString()
                    : h.createdAt
                      ? new Date(h.createdAt).toLocaleDateString()
                      : t('common.na');

                  return (
                    <li key={h._id} className="border rounded p-2 hover:bg-yellow-50">
                      <div className="text-xs text-gray-600">
                        {safeDate} | Bill #{h.billNo}
                      </div>

                      {/* ✅ Rate (display only) */}
                      <div className="font-semibold text-gray-800">Rs. {h.rate}</div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {/* 🟩 RIGHT SIDE – Invoice Form */}
        <div className={showHistory ? 'col-span-12 md:col-span-11' : 'col-span-12'}>
          <InvoiceForm
            token={token}
            invoiceId={invoiceId}
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
