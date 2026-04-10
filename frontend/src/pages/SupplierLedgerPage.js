// 📁 src/pages/SupplierLedgerPage.js

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

import PageLayout from '../components/PageLayout';
import LedgerTable from '../components/LedgerTable';
import { t } from '../i18n/i18n';
import { sendPdfToWhatsApp } from '../utils/whatsappPdf';
import WhatsAppShareModal from '../components/WhatsAppShareModal';
import { FaWhatsapp } from 'react-icons/fa';

import { fetchSuppliers, fetchSupplierLedger } from '../services/supplierService';

export default function SupplierLedgerPage() {
  const token = localStorage.getItem('token');
  const { supplierId } = useParams();
  const navigate = useNavigate();

  const [suppliers, setSuppliers] = useState([]);
  const [sid, setSid] = useState('');

  const [ledger, setLedger] = useState([]);
  const [opening, setOpening] = useState(0);

  const [search, setSearch] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);

  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [loading, setLoading] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  // ✅ Print Size (Default A5, Remembered)
  const [printSize, setPrintSize] = useState(localStorage.getItem('ledgerPrintSize') || 'A5');

  useEffect(() => {
    localStorage.setItem('ledgerPrintSize', printSize);
  }, [printSize]);

  /* ===============================
     DATE FILTER
  =============================== */
  const dateFilteredLedger = ledger.filter((e) => {
    if (!start && !end) return true;

    const d = new Date(e.date);
    const s = start ? new Date(start) : null;
    const en = end ? new Date(end) : null;

    if (s && d < s) return false;
    if (en && d > en) return false;
    return true;
  });

  /* ===============================
     PAGINATION
  =============================== */
  const totalPages = Math.ceil(dateFilteredLedger.length / pageSize);
  const paginatedLedger = dateFilteredLedger.slice((page - 1) * pageSize, page * pageSize);

  const startRow = dateFilteredLedger.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const endRow = Math.min(page * pageSize, dateFilteredLedger.length);

  /* ===============================
     TOTALS
  =============================== */
  const totalDebit = dateFilteredLedger.reduce((sum, e) => sum + (e.debit || 0), 0);
  const totalCredit = dateFilteredLedger.reduce((sum, e) => sum + (e.credit || 0), 0);

  const closingBalance =
    dateFilteredLedger.length > 0
      ? dateFilteredLedger[dateFilteredLedger.length - 1].balance || 0
      : opening;

  /* ===============================
     BALANCE STATUS
  =============================== */
  let balanceStatus = t('ledger.settled');
  let balanceColor = '#6b7280';

  if (closingBalance < 0) {
    balanceStatus = t('ledger.payable');
    balanceColor = '#dc2626';
  } else if (closingBalance > 0) {
    balanceStatus = t('ledger.advance');
    balanceColor = '#2563eb';
  }

  /* ===============================
     LOAD SUPPLIERS
  =============================== */
  useEffect(() => {
    fetchSuppliers().then(setSuppliers).catch(console.error);
  }, []);

  /* ===============================
     LOAD LEDGER
  =============================== */
  const load = useCallback(
    async (id = sid, s = start, e = end) => {
      if (!id) return;

      const supplier = suppliers.find((x) => x._id === id);
      if (!supplier) return;

      setLoading(true);
      try {
        const data = await fetchSupplierLedger(id, {
          startDate: s,
          endDate: e,
        });

        let openingBalance = data.openingBalance || 0;

        if (s && Array.isArray(data.ledger) && data.ledger.length > 0) {
          const firstRow = data.ledger[0];
          openingBalance = (firstRow.balance || 0) + (firstRow.debit || 0) - (firstRow.credit || 0);
        }

        const openingRow = {
          _id: 'opening-row',
          isOpening: true,
          date: s || new Date(),
          billNo: '-',
          sourceType: 'opening',
          description: t('ledger.openingBalance'),
          debit: openingBalance > 0 ? openingBalance : 0,
          credit: openingBalance < 0 ? Math.abs(openingBalance) : 0,
          balance: openingBalance,
        };

        const ledgerRows = Array.isArray(data.ledger) ? data.ledger : [];

        setLedger([openingRow, ...ledgerRows]);
        setOpening(openingBalance);
      } catch (err) {
        console.error(err);
      }
      setLoading(false);
    },
    [sid, start, end, suppliers]
  );

  /* ===============================
     LOAD FROM URL
  =============================== */
  useEffect(() => {
    if (!supplierId) return;
    if (suppliers.length === 0) return;

    setSid(supplierId);
    load(supplierId, start, end);
  }, [supplierId, suppliers, load, start, end]);

  const print = async () => {
    if (!sid) return;

    const query = new URLSearchParams({
      startDate: start || '',
      endDate: end || '',
      size: printSize,
    }).toString();

    try {
      const response = await fetch(
        `${process.env.REACT_APP_API_BASE_URL}/api/print/supplier-ledger/${sid}/html?${query}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const html = await response.text();

      const newWindow = window.open('', '_blank');
      newWindow.document.write(html);
      newWindow.document.close();

      newWindow.onload = function () {
        newWindow.print();
      };
    } catch (error) {
      alert(t('alerts.printFailed'));
    }
  };
  /* ===============================
     ROW CLICK / EDIT
  =============================== */
  const handleRowClick = (entry) => {
    if (!entry || entry.isOpening) return;

    if (entry.sourceType === 'purchase_invoice' && entry.invoiceId) {
      navigate(`/purchase-invoice/${entry.invoiceId}`);
    } else if (entry.sourceType === 'payment' && entry.referenceId) {
      navigate(`/pay-bill?edit=true&id=${entry.referenceId}`);
    }
  };

  return (
    <PageLayout
      headerCards={
        <>
          <div
            className="card"
            style={{
              minWidth: window.innerWidth < 768 ? 92 : 150,
              minHeight: window.innerWidth < 768 ? 44 : 90,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                color: '#16a34a',
                fontWeight: 600,
                fontSize: window.innerWidth < 768 ? 12 : 14,
              }}
            >
              {t('ledger.totalDebit')}
            </div>
            <div style={{ fontSize: window.innerWidth < 768 ? 14 : 18, fontWeight: 800 }}>
              Rs. {totalDebit.toFixed(2)}
            </div>
          </div>

          <div
            className="card"
            style={{
              minWidth: window.innerWidth < 768 ? 92 : 150,
              minHeight: window.innerWidth < 768 ? 44 : 90,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                color: '#dc2626',
                fontWeight: 600,
                fontSize: window.innerWidth < 768 ? 12 : 14,
              }}
            >
              {t('ledger.totalCredit')}
            </div>
            <div style={{ fontSize: window.innerWidth < 768 ? 14 : 18, fontWeight: 800 }}>
              Rs. {totalCredit.toFixed(2)}
            </div>
          </div>

          <div
            className="card"
            style={{
              minWidth: window.innerWidth < 768 ? 96 : 160,
              minHeight: window.innerWidth < 768 ? 44 : 90,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                color: '#2563eb',
                fontWeight: 600,
                fontSize: window.innerWidth < 768 ? 12 : 14,
              }}
            >
              {t('ledger.closingBalance')}
            </div>
            <div style={{ fontSize: window.innerWidth < 768 ? 14 : 18, fontWeight: 800 }}>
              Rs. {closingBalance.toFixed(2)}
            </div>
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
          </div>
        </>
      }
      headerContent={
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            background: '#fef2f2',
            borderRadius: 14,
            padding: window.innerWidth < 768 ? '6px 8px' : '8px 14px',
            minHeight: window.innerWidth < 768 ? 70 : 90,
            gap: 6,
            border: '1px solid #fecaca',
          }}
        >
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative' }}>
              <input
                placeholder={t('supplier.search')}
                value={supplierName}
                onChange={(e) => {
                  setSupplierName(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                style={{
                  height: window.innerWidth < 768 ? 32 : 36,
                  width: window.innerWidth < 768 ? 120 : 220,
                  borderRadius: 8,
                  border: '1px solid #93c5fd',
                  padding: '0 10px',
                  fontWeight: 600,
                  background: '#ffffff',
                }}
              />

              {showSuggestions && supplierName && (
                <div
                  style={{
                    position: 'absolute',
                    top: 40,
                    left: 0,
                    right: 0,
                    background: '#ffffff',
                    border: '1px solid #e5e7eb',
                    borderRadius: 8,
                    maxHeight: 200,
                    overflowY: 'auto',
                    zIndex: 50,
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
                          padding: '8px 10px',
                          cursor: 'pointer',
                          borderBottom: '1px solid #f1f5f9',
                        }}
                      >
                        {s.name}
                      </div>
                    ))}
                </div>
              )}
            </div>

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
              }}
            >
              <option value={10}>{t('pagination.page10')}</option>
              <option value={25}>{t('pagination.page25')}</option>
              <option value={50}>{t('pagination.page50')}</option>
            </select>
            <select
              value={printSize}
              onChange={(e) => setPrintSize(e.target.value)}
              style={{
                height: window.innerWidth < 768 ? 32 : 36,
                borderRadius: 8,
                border: '1px solid #93c5fd',
                padding: window.innerWidth < 768 ? '0 4px' : '0 10px',
                background: '#ffffff',
                fontWeight: 600,
              }}
            >
              <option value="A5">A5</option>
              <option value="A4">A4</option>
            </select>
            <button
              className="btn btn-primary"
              style={{
                height: window.innerWidth < 768 ? 32 : 36,
                width: window.innerWidth < 768 ? 36 : 'auto',
                padding: window.innerWidth < 768 ? '0' : '0 18px',
              }}
              disabled={!sid}
              onClick={print}
            >
              {window.innerWidth < 768 ? '🖨️' : t('print.print')}
            </button>

            <button
              className="btn btn-primary"
              style={{ height: window.innerWidth < 768 ? 32 : 36 }}
              disabled={!sid}
              onClick={async () => {
                if (!sid) return;

                const query = new URLSearchParams({
                  startDate: start || '',
                  endDate: end || '',
                  size: printSize,
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
              {t('print.pdf')}
            </button>

            <button
              style={{
                height: window.innerWidth < 768 ? 32 : 36,
                padding: window.innerWidth < 768 ? '0 8px' : '0 18px',
                borderRadius: 10,
                background: 'linear-gradient(135deg, #14b8a6, #06b6d4)',
                border: 'none',
                color: '#ffffff',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                transition: 'all 0.2s ease',
              }}
              disabled={!sid}
              onClick={() => navigate(`/supplier-ledger/${sid}/detail`)}
            >
              {window.innerWidth < 768 ? '📄' : `📄 ${t('ledger.detailLedger')}`}
            </button>
            <button
              disabled={!sid}
              onClick={() => setShowShareModal(true)}
              style={{
                height: window.innerWidth < 768 ? 32 : 36,
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

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input
              placeholder={t('ledger.search')}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              style={{
                height: window.innerWidth < 768 ? 32 : 36,
                width: window.innerWidth < 768 ? 110 : 260,
                borderRadius: 8,
                border: '1px solid #93c5fd',
                padding: '0 12px',
              }}
            />

            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              style={{
                height: window.innerWidth < 768 ? 32 : 36,
                borderRadius: 8,
                border: '1px solid #93c5fd',
                padding: window.innerWidth < 768 ? '0 4px' : '0 10px',
                background: '#ffffff',
              }}
            />

            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              style={{
                height: window.innerWidth < 768 ? 32 : 36,
                borderRadius: 8,
                border: '1px solid #93c5fd',
                padding: window.innerWidth < 768 ? '0 4px' : '0 10px',
                background: '#ffffff',
              }}
            />

            <button
              style={{
                height: window.innerWidth < 768 ? 32 : 36,
                padding: window.innerWidth < 768 ? '0 10px' : '0 18px',
                borderRadius: 10,
                background: 'linear-gradient(135deg, #6366f1, #3b82f6)',
                border: 'none',
                color: '#fff',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                transition: 'all 0.2s ease',
              }}
              onClick={() => load(sid, start, end)}
            >
              {t('load')}
            </button>

            <button
              style={{
                height: window.innerWidth < 768 ? 32 : 36,
                padding: '0 18px',
                borderRadius: 10,
                background: 'linear-gradient(135deg, #ef4444, #f97316)',
                border: 'none',
                color: '#fff',
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
                load(sid, '', '');
              }}
            >
              {t('clear')}
            </button>
          </div>
        </div>
      }
    >
      <div
        className="screen-only"
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minHeight: 0,
        }}
      >
        <LedgerTable
          ledgerData={paginatedLedger}
          search={search}
          openingBalance={opening}
          onRowClick={handleRowClick}
          onEdit={handleRowClick}
        />
      </div>

      {totalPages > 1 && (
        <div
          style={{
            padding: '6px 0',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 12,
            fontSize: 12,
          }}
        >
          <span>
            {t('pagination.showing')} {startRow}–{endRow} {t('pagination.of')}{' '}
            {dateFilteredLedger.length}
          </span>
          <button
            className="pagination-btn"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            ⬅ {t('pagination.prev')}
          </button>
          <span>
            {t('pagination.page')} <strong>{page}</strong> of {totalPages}
          </span>
          <button
            className="pagination-btn"
            disabled={page === totalPages}
            onClick={() => setPage(page + 1)}
          >
            {t('pagination.next')} ➡
          </button>
        </div>
      )}

      {!loading && sid && ledger.length === 0 && <p>{t('ledger.noEntries')}</p>}
      <WhatsAppShareModal
        open={showShareModal}
        onClose={() => setShowShareModal(false)}
        onSelect={(type) => {
          setShowShareModal(false);

          if (!sid) return;

          const selectedSupplier = suppliers.find((s) => s._id === sid);

          const query = new URLSearchParams({
            startDate: start || '',
            endDate: end || '',
            size: printSize,
          }).toString();

          const pdfUrl = `${process.env.REACT_APP_API_BASE_URL}/api/print/supplier-ledger/${sid}/pdf?${query}`;

          const token = localStorage.getItem('token');

          sendPdfToWhatsApp({
            phone: selectedSupplier?.phone || selectedSupplier?.mobile,
            customerName: selectedSupplier?.name,
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
    </PageLayout>
  );
}
