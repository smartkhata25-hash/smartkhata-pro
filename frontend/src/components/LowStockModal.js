import React from 'react';
import { t } from '../i18n/i18n';
import { useNavigate } from 'react-router-dom';
const LowStockModal = ({ open, onClose, products }) => {
  const [isMobile, setIsMobile] = React.useState(window.innerWidth <= 768);

  React.useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const navigate = useNavigate();
  if (!open) return null;

  // 🔎 Filter Low Stock
  const lowStockItems = (products || []).filter(
    (p) => (p.stock || 0) <= (p.lowStockThreshold || 0)
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.45)' }}
    >
      {/* Modal Box */}
      <div
        className="bg-white rounded-xl shadow-2xl w-[900px] max-w-[95%]"
        style={{ animation: 'fadeIn 0.2s ease' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 rounded-t-xl"
          style={{
            background: 'linear-gradient(135deg,#dc2626,#7f1d1d)',
            color: '#fff',
          }}
        >
          <h2 style={{ fontSize: '18px', fontWeight: '600' }}>
            ⚠ {t('alerts.lowStockItems')} ({lowStockItems.length})
          </h2>

          <button
            onClick={onClose}
            style={{
              fontSize: '18px',
              background: 'transparent',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            padding: '20px',
            maxHeight: '500px',
            overflowY: 'auto',
          }}
        >
          {lowStockItems.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#16a34a', fontWeight: 500 }}>
              ✔ {t('alerts.noLowStock')}
            </p>
          ) : (
            <table className="w-full border text-sm">
              <thead>
                <tr className="bg-gray-100 text-center">
                  <th className="border p-2">{t('inventory.product')}</th>
                  {!isMobile && <th className="border p-2">{t('inventory.category')}</th>}
                  {!isMobile && <th className="border p-2">{t('inventory.rack')}</th>}
                  {!isMobile && <th className="border p-2">{t('inventory.unit')}</th>}
                  <th className="border p-2">{t('inventory.stock')}</th>
                  <th className="border p-2">{t('inventory.minimum')}</th>
                </tr>
              </thead>

              <tbody>
                {lowStockItems.map((p) => (
                  <tr
                    key={p._id}
                    className="text-center odd:bg-white even:bg-gray-50 cursor-pointer hover:bg-blue-50"
                    onDoubleClick={() => navigate(`/product-ledger/${p._id}`)}
                  >
                    <td className="border p-2">{p.name}</td>
                    {!isMobile && <td className="border p-2">{p.categoryId?.name || '-'}</td>}
                    {!isMobile && <td className="border p-2">{p.rackNo || '-'}</td>}
                    {!isMobile && <td className="border p-2">{p.unit}</td>}
                    <td
                      className="border p-2"
                      style={{
                        color: (p.stock || 0) < 0 ? '#dc2626' : '#b91c1c',
                        fontWeight: '600',
                      }}
                    >
                      {p.stock}
                    </td>
                    <td className="border p-2">{p.lowStockThreshold || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '15px 20px',
            display: 'flex',
            justifyContent: 'flex-end',
            borderTop: '1px solid #e5e7eb',
          }}
        >
          <button
            onClick={onClose}
            style={{
              background: '#6b7280',
              color: '#fff',
              border: 'none',
              padding: '8px 18px',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            {t('common.close')}
          </button>
        </div>
      </div>

      {/* Animation */}
      <style>
        {`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        `}
      </style>
    </div>
  );
};

export default LowStockModal;
