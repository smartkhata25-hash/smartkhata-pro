import React from 'react';
import { t } from '../i18n/i18n';
import { FaWhatsapp } from 'react-icons/fa';

const SupplierLedgerHeader = ({
  suppliers,
  sid,
  setSid,
  pageSize,
  setPageSize,
  print,
  name,
  token,
  printSize,
  start,
  end,
  setStart,
  setEnd,
  load,
  setSearch,
  setPage,
  navigate,
  opening,
  dateilteredLedger,
  totalDebit,
  totalCredit,
  closingBalance,
  balanceStatus,
  balanceColor,
  isMobile,
  onBack,
  supplierName,
  setSupplierName,
  showSuggestions,
  setShowSuggestions,
  onShareClick,
}) => {
  return (
    <>
      <div
        style={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          alignItems: isMobile ? 'stretch' : 'center',
          gap: isMobile ? 8 : 16,
          background: '#eef2ff',
          borderRadius: 14,
          padding: isMobile ? '6px 8px' : '8px 14px',
          border: '1px solid #c7d2fe',
        }}
      >
        {/* ================= LEFT SIDE ================= */}

        {/* 📱 MOBILE: ROW 1 */}
        {isMobile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {/* Back */}
            <button
              onClick={onBack}
              style={{
                padding: '4px 8px',
                borderRadius: 6,
                border: '1px solid #d1d5db',
                background: '#ffffff',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              ←
            </button>

            {/* Supplier Search */}
            <input
              placeholder={t('supplier.search')}
              value={supplierName || ''}
              onChange={(e) => {
                setSupplierName(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              style={{
                height: 32,
                width: 100,
                borderRadius: 8,
                border: '1px solid #93c5fd',
                padding: '0 6px',
                fontSize: 12,
              }}
            />

            {showSuggestions && supplierName && (
              <div
                style={{
                  position: 'absolute',
                  top: 34,
                  left: 0,
                  right: 0,
                  background: '#ffffff',
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                  maxHeight: 150,
                  overflowY: 'auto',
                  zIndex: 999,
                }}
              >
                {suppliers
                  .filter((s) => s.name.toLowerCase().includes(supplierName.toLowerCase()))
                  .slice(0, 10)
                  .map((s) => (
                    <div
                      key={s._id}
                      onClick={() => {
                        setSupplierName(s.name);
                        setSid(s._id);
                        setShowSuggestions(false);
                        setPage(1);
                        load(s._id);
                      }}
                      style={{
                        padding: '6px',
                        cursor: 'pointer',
                      }}
                    >
                      {s.name}
                    </div>
                  ))}
              </div>
            )}

            {/* Print */}
            <button
              className="btn btn-primary"
              style={{ height: 32, padding: '0 6px', fontSize: 11 }}
              onClick={print}
            >
              🖨️
            </button>

            {/* PDF (FULL ORIGINAL LOGIC — SAFE) */}
            <button
              className="btn btn-primary"
              style={{ height: 32, padding: '0 6px', fontSize: 11 }}
              disabled={!sid}
              onClick={async () => {
                if (!sid) return;

                const query = new URLSearchParams({
                  startDate: start || '',
                  endDate: end || '',
                  size: printSize || 'A5',
                }).toString();

                try {
                  const response = await fetch(
                    `${process.env.REACT_APP_API_BASE_URL}/api/print/supplier-ledger/${sid}/pdf?${query}`,
                    {
                      headers: {
                        Authorization: `Bearer ${token}`,
                      },
                    }
                  );

                  const blob = await response.blob();
                  const url = window.URL.createObjectURL(blob);

                  const link = document.createElement('a');

                  const selectedSupplier = suppliers.find((s) => s._id === sid);
                  const supplierName = selectedSupplier?.name || 'Supplier';

                  link.href = url;
                  link.download = `${supplierName.replace(/\s+/g, '-')}-Ledger.pdf`;

                  document.body.appendChild(link);
                  link.click();
                  link.remove();
                } catch (error) {
                  alert(t('alerts.pdfFailed'));
                }
              }}
            >
              PDF
            </button>

            {/* Detail */}
            <button
              style={{
                height: 32,
                padding: '0 6px',
                borderRadius: 8,
                background: 'linear-gradient(135deg, #0ea5e9, #6366f1)',
                border: 'none',
                color: '#ffffff',
                fontWeight: 600,
                fontSize: 11,
              }}
              disabled={!sid}
              onClick={() => navigate(`/supplier-ledger/${sid}/detail`)}
            >
              📊
            </button>
            <button
              disabled={!sid}
              onClick={onShareClick}
              style={{
                height: 32,
                width: 34,
                borderRadius: 8,
                border: 'none',
                background: 'linear-gradient(135deg,#25D366,#128C7E)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <FaWhatsapp size={14} color="#fff" />
            </button>
          </div>
        )}

        {/* 📱 MOBILE: ROW 2 */}
        {isMobile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {/* Search */}
            <input
              placeholder="Search..."
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              style={{
                height: 32,
                width: 110,
                borderRadius: 8,
                border: '1px solid #93c5fd',
                padding: '0 6px',
                fontSize: 12,
              }}
            />

            {/* Dates */}
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              style={{
                height: 30,
                borderRadius: 8,
                border: '1px solid #93c5fd',
                background: '#ffffff',
              }}
            />

            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              style={{
                height: 30,
                borderRadius: 8,
                border: '1px solid #93c5fd',
                background: '#ffffff',
              }}
            />

            {/* Load */}
            <button
              style={{
                height: 32,
                padding: '0 8px',
                borderRadius: 8,
                background: 'linear-gradient(135deg, #6366f1, #3b82f6)',
                border: 'none',
                color: '#ffffff',
                fontWeight: 600,
                fontSize: 11,
              }}
              onClick={() => {
                if (!sid) return;
                load(sid, start, end);
              }}
            >
              Load
            </button>

            {/* Clear */}
            <button
              style={{
                height: 32,
                padding: '0 8px',
                borderRadius: 8,
                background: 'linear-gradient(135deg, #ef4444, #f97316)',
                border: 'none',
                color: '#ffffff',
                fontWeight: 600,
                fontSize: 11,
              }}
              onClick={() => {
                setSearch('');
                setStart('');
                setEnd('');
                setPage(1);
                load(sid, '', '');
              }}
            >
              ✖
            </button>
          </div>
        )}

        {/* 💻 DESKTOP */}
        {!isMobile && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
              flex: 1,
            }}
          >
            {/* Page size */}
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              style={{
                height: 36,
                borderRadius: 8,
                border: '1px solid #93c5fd',
                padding: '0 10px',
                background: '#ffffff',
                fontWeight: 600,
                fontSize: 14,
              }}
            >
              <option value={10}>10 {t('perPage')}</option>
              <option value={25}>25 {t('perPage')}</option>
              <option value={50}>50 {t('perPage')}</option>
            </select>

            <button className="btn btn-primary" style={{ height: 36 }} onClick={print}>
              {t('print')}
            </button>

            <button
              className="btn btn-primary"
              style={{ height: 36 }}
              disabled={!sid}
              onClick={() => {
                if (!sid) return;
                const query = new URLSearchParams({
                  startDate: start || '',
                  endDate: end || '',
                }).toString();
                window.open(`/api/print/supplier-ledger/${sid}/pdf?${query}`, '_blank');
              }}
            >
              {t('pdf')}
            </button>

            <input
              placeholder={t('ledger.searchLedger')}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              style={{
                height: 36,
                width: isMobile ? 110 : 180,
                borderRadius: 8,
                border: '1px solid #93c5fd',
                padding: '0 12px',
                fontSize: 14,
              }}
            />

            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              style={{
                height: 36,
                width: 120,
                borderRadius: 8,
                border: '1px solid #93c5fd',
                padding: '0 10px',
                background: '#ffffff',
              }}
            />

            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              style={{
                height: 36,
                width: 120,
                borderRadius: 8,
                border: '1px solid #93c5fd',
                padding: '0 10px',
                background: '#ffffff',
              }}
            />

            <button
              style={{
                height: 36,
                padding: '0 10px',
                borderRadius: 10,
                background: 'linear-gradient(135deg, #6366f1, #3b82f6)',
                border: 'none',
                color: '#ffffff',
                fontWeight: 600,
              }}
              onClick={() => {
                if (!sid) return;
                load(sid, start, end);
              }}
            >
              {t('load')}
            </button>

            <button
              style={{
                height: 36,
                padding: '0 10px',
                borderRadius: 10,
                background: 'linear-gradient(135deg, #ef4444, #f97316)',
                border: 'none',
                color: '#ffffff',
                fontWeight: 600,
              }}
              onClick={() => {
                setSearch('');
                setStart('');
                setEnd('');
                setPage(1);
                load(sid, '', '');
              }}
            >
              {t('common.clear')}
            </button>

            <button
              style={{
                height: 36,
                padding: '0 10px',
                borderRadius: 10,
                background: 'linear-gradient(135deg, #0ea5e9, #6366f1)',
                border: 'none',
                color: '#ffffff',
                fontWeight: 600,
              }}
              disabled={!sid}
              onClick={() => navigate(`/supplier-ledger/${sid}/detail`)}
            >
              {t('ledger.detailLedger')}
            </button>
            <button
              disabled={!sid}
              onClick={onShareClick}
              style={{
                height: 36,
                width: 40,
                borderRadius: 10,
                border: 'none',
                background: 'linear-gradient(135deg,#25D366,#128C7E)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <FaWhatsapp size={18} color="#fff" />
            </button>
          </div>
        )}

        {/* ================= RIGHT SIDE ================= */}
        <div
          style={{
            display: 'flex',
            gap: isMobile ? 6 : 12,
            flexShrink: 0,
            width: isMobile ? '100%' : 'auto',
            justifyContent: isMobile ? 'space-between' : 'flex-start',
            flexWrap: isMobile ? 'wrap' : 'nowrap',
          }}
        >
          <div
            className="card"
            style={{
              minWidth: isMobile ? '30%' : 130,
              flex: isMobile ? '1 1 30%' : 'none',
              padding: isMobile ? '6px 8px' : undefined,
            }}
          >
            <div style={{ color: '#16a34a', fontWeight: 600, fontSize: isMobile ? 11 : 14 }}>
              {t('ledger.totalDebit')}
            </div>
            <div style={{ fontWeight: 800, fontSize: isMobile ? 13 : 16 }}>
              Rs. {totalDebit.toFixed(2)}
            </div>
          </div>

          <div
            className="card"
            style={{
              minWidth: isMobile ? '30%' : 130,
              flex: isMobile ? '1 1 30%' : 'none',
              padding: isMobile ? '6px 8px' : undefined,
            }}
          >
            <div style={{ color: '#dc2626', fontWeight: 600 }}>{t('ledger.totalCredit')}</div>
            <div style={{ fontWeight: 800, fontSize: isMobile ? 13 : 16 }}>
              Rs. {totalCredit.toFixed(2)}
            </div>
          </div>

          <div
            className="card"
            style={{
              minWidth: isMobile ? '30%' : 140,
              flex: isMobile ? '1 1 30%' : 'none',
              padding: isMobile ? '6px 8px' : undefined,
            }}
          >
            <div style={{ color: '#2563eb', fontWeight: 600 }}>
              {isMobile ? 'Balance' : t('ledger.closingBalance')}
            </div>
            <div style={{ fontWeight: 800, fontSize: isMobile ? 13 : 16 }}>
              Rs. {closingBalance.toFixed(2)}
            </div>
            {!isMobile && (
              <div
                style={{
                  marginTop: 4,
                  padding: '2px 8px',
                  borderRadius: 999,
                  fontSize: 11,
                  background: `${balanceColor}20`,
                  color: balanceColor,
                  width: 'fit-content',
                }}
              >
                {balanceStatus}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default SupplierLedgerHeader;
