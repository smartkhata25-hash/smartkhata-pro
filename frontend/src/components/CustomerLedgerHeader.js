import React from 'react';
import { t } from '../i18n/i18n';
import { sendPdfToWhatsApp } from '../utils/whatsappPdf';
import WhatsAppShareModal from '../components/WhatsAppShareModal';
import { FaWhatsapp } from 'react-icons/fa';

const CustomerLedgerHeader = ({
  customers,
  cid,
  setCid,
  pageSize,
  setPageSize,
  print,
  start,
  end,
  setStart,
  setEnd,
  load,
  setSearch,
  setPage,
  navigate,
  totalDebit,
  totalCredit,
  closingBalance,
  balanceStatus,
  balanceColor,
  isMobile,
  onBack,
  customerName,
  setCustomerName,
  showSuggestions,
  setShowSuggestions,
}) => {
  const [showShareModal, setShowShareModal] = React.useState(false);
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
            {/* Customer */}
            <input
              placeholder={t('customer.search')}
              value={customerName}
              onChange={(e) => {
                setCustomerName(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              style={{
                height: 32,
                width: 90,
                borderRadius: 8,
                border: '1px solid #93c5fd',
                padding: '0 6px',
                fontSize: 12,
              }}
            />

            {showSuggestions && customerName && (
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
                  zIndex: 50,
                }}
              >
                {customers
                  .filter((c) => c.name.toLowerCase().includes(customerName.toLowerCase()))
                  .slice(0, 10)
                  .map((c) => (
                    <div
                      key={c._id}
                      onClick={() => {
                        setCustomerName(c.name);
                        setCid(c._id);
                        setShowSuggestions(false);
                        setPage(1);
                        load(c._id);
                      }}
                      style={{
                        padding: '6px',
                        cursor: 'pointer',
                      }}
                    >
                      {c.name}
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

            {/* PDF */}
            <button
              className="btn btn-primary"
              style={{ height: 32, padding: '0 6px', fontSize: 11 }}
              disabled={!cid}
              onClick={() => {
                if (!cid) return;
                const query = new URLSearchParams({
                  startDate: start || '',
                  endDate: end || '',
                }).toString();
                window.open(`/api/print/customer-ledger/${cid}/pdf?${query}`, '_blank');
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
              disabled={!cid}
              onClick={() => navigate(`/customer-ledger/${cid}/detail`)}
            >
              📊
            </button>
            <button
              disabled={!cid}
              onClick={() => setShowShareModal(true)}
              style={{
                height: 32,
                width: 36,
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
                if (!cid) return;
                load(cid, start, end);
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
                load(cid, '', '');
              }}
            >
              ✖
            </button>
          </div>
        )}

        {/* 💻 DESKTOP (UNCHANGED) */}
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
              disabled={!cid}
              onClick={() => {
                if (!cid) return;
                const query = new URLSearchParams({
                  startDate: start || '',
                  endDate: end || '',
                }).toString();
                window.open(`/api/print/customer-ledger/${cid}/pdf?${query}`, '_blank');
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
                width: 260,
                borderRadius: 8,
                border: '1px solid #93c5fd',
                padding: '0 12px',
                fontSize: 14,
              }}
            />

            {/* Dates */}
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

            {/* Load */}
            <button
              style={{
                height: 36,
                padding: '0 10px',
                borderRadius: 10,
                background: 'linear-gradient(135deg, #6366f1, #3b82f6)',
                border: 'none',
                color: '#ffffff',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                transition: 'all 0.2s ease',
              }}
              onClick={() => {
                if (!cid) return;
                load(cid, start, end);
              }}
            >
              {t('load')}
            </button>

            {/* Clear */}
            <button
              style={{
                height: 36,
                padding: '0 10px',
                borderRadius: 10,
                background: 'linear-gradient(135deg, #ef4444, #f97316)',
                border: 'none',
                color: '#ffffff',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                transition: 'all 0.2s ease',
              }}
              onClick={() => {
                setSearch('');
                setStart('');
                setEnd('');
                setPage(1);
                load(cid, '', '');
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
              disabled={!cid}
              onClick={() => navigate(`/customer-ledger/${cid}/detail`)}
            >
              {t('ledger.detailLedger')}
            </button>
            <button
              disabled={!cid}
              onClick={() => setShowShareModal(true)}
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
          {/* SAME CARDS — untouched */}
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
      <WhatsAppShareModal
        open={showShareModal}
        onClose={() => setShowShareModal(false)}
        onSelect={(type) => {
          setShowShareModal(false);

          if (!cid) return;

          const selectedCustomer = customers.find((c) => c._id === cid);

          const query = new URLSearchParams({
            startDate: start || '',
            endDate: end || '',
          }).toString();

          const pdfUrl = `/api/print/customer-ledger/${cid}/pdf?${query}`;

          const token = localStorage.getItem('token');

          sendPdfToWhatsApp({
            phone: selectedCustomer?.phone || selectedCustomer?.mobile,
            customerName: selectedCustomer?.name,
            balance: closingBalance,
            businessName: 'Your Business',
            mobile: '',
            lang: 'en',
            pdfUrl,
            token,
            preferredApp: type,
          });
        }}
      />
    </>
  );
};

export default CustomerLedgerHeader;
