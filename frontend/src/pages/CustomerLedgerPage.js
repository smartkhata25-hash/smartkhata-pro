// 📁 src/pages/CustomerLedgerPage.js

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';

import PageLayout from '../components/PageLayout';

import { getLedgerByCustomerAccount, deleteJournalEntry } from '../services/customerLedgerService';

import LedgerTable from '../components/LedgerTable';
import { t } from '../i18n/i18n';
import { sendPdfToWhatsApp } from '../utils/whatsappPdf';
import WhatsAppShareModal from '../components/WhatsAppShareModal';
import { FaWhatsapp } from 'react-icons/fa';

export default function CustomerLedgerPage() {
  useEffect(() => {
    setTimeout(() => {
      const scrollElements = document.querySelectorAll('*');

      scrollElements.forEach((el) => {
        if (el.scrollHeight > el.clientHeight) {
        }
      });
    }, 2000);
  }, []);
  const { customerId } = useParams();
  const token = localStorage.getItem('token');
  const navigate = useNavigate();

  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState(10);

  const [page, setPage] = useState(1);

  const [cid, setCid] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [ledger, setLedger] = useState([]);

  const [opening, setOpening] = useState(0);

  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [loading, setLoading] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  const [printSize, setPrintSize] = useState(localStorage.getItem('ledgerPrintSize') || 'A5');

  useEffect(() => {
    localStorage.setItem('ledgerPrintSize', printSize);
  }, [printSize]);

  const dateFilteredLedger = ledger.filter((e) => {
    if (!start && !end) return true;

    const d = new Date(e.date);
    const s = start ? new Date(start) : null;
    const en = end ? new Date(end) : null;

    if (s && d < s) return false;
    if (en && d > en) return false;

    return true;
  });

  const totalPages = Math.ceil(dateFilteredLedger.length / pageSize);

  const paginatedLedger = dateFilteredLedger.slice((page - 1) * pageSize, page * pageSize);

  const startRow = dateFilteredLedger.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const endRow = Math.min(page * pageSize, dateFilteredLedger.length);

  const totalDebit = dateFilteredLedger.reduce((sum, e) => sum + (e.debit || 0), 0);
  const totalCredit = dateFilteredLedger.reduce((sum, e) => sum + (e.credit || 0), 0);
  const closingBalance =
    dateFilteredLedger.length > 0
      ? dateFilteredLedger[dateFilteredLedger.length - 1].balance || 0
      : opening;

  let balanceStatus = t('ledger.settled');
  let balanceColor = '#6b7280';

  if (closingBalance > 0) {
    balanceStatus = t('ledger.receivable');
    balanceColor = '#16a34a';
  } else if (closingBalance < 0) {
    balanceStatus = t('ledger.advance');
    balanceColor = '#2563eb';
  }

  useEffect(() => {
    axios
      .get('/api/customers', { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => setCustomers(res.data))
      .catch(console.error);
  }, [token]);

  const load = useCallback(
    async (id = cid, s = start, e = end) => {
      if (!id) return;

      const customer = customers.find((c) => c._id === id);
      if (!customer) return;

      setLoading(true);
      try {
        const data = await getLedgerByCustomerAccount(
          customer.account?._id || customer.account,
          s,
          e
        );

        let openingBalance = data.openingBalance || 0;

        if (start && Array.isArray(data.ledger) && data.ledger.length > 0) {
          const firstRow = data.ledger[0];
          openingBalance = (firstRow.balance || 0) - (firstRow.debit || 0) + (firstRow.credit || 0);
        }

        const openingRow = {
          _id: 'opening-row',
          isOpening: true,
          date: s,
          billNo: '-',
          sourceType: 'opening',
          description: t('ledger.openingBalance'),
          debit: 0,
          credit: Math.abs(openingBalance),
          balance: openingBalance,
        };

        const ledgerRows = Array.isArray(data.ledger) ? data.ledger : [];
        setLedger([openingRow, ...ledgerRows]);
        setOpening(openingBalance);
      } catch (err) {}
      setLoading(false);
    },
    [cid, start, end, customers]
  );

  useEffect(() => {
    if (!customerId) return;
    if (customers.length === 0) return;

    setCid(customerId);
    load(customerId, start, end);
  }, [customerId, customers, load, start, end]);

  const del = async (id) => {
    if (window.confirm(t('alerts.deleteTransaction'))) {
      await deleteJournalEntry(id);
      load();
    }
  };

  const print = async () => {
    if (!cid) return;

    const query = new URLSearchParams({
      startDate: start || '',
      endDate: end || '',
      size: printSize,
    }).toString();
    try {
      const response = await fetch(
        `${process.env.REACT_APP_API_BASE_URL}/api/print/customer-ledger/${cid}/html?${query}`,
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

      // ✅ یہ add کریں
      newWindow.onload = function () {
        newWindow.print();
      };
    } catch (error) {
      alert(t('alerts.printFailed'));
    }
  };
  const handleRowClick = (entry) => {
    if (!entry || entry.isOpening) return;

    if (entry.sourceType === 'sale_invoice' && entry.invoiceId) {
      const confirm = window.confirm(t('alerts.invoiceLinkedEditConfirm'));
      if (confirm) navigate(`/edit-invoice/${entry.invoiceId}`);
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
              {t('ledger.closing')}
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
            justifyContent: 'center',
            background: '#eef2ff',
            borderRadius: 14,
            padding: window.innerWidth < 768 ? '6px 8px' : '8px 14px',
            minHeight: window.innerWidth < 768 ? 70 : 90,
            gap: 6,
            border: '1px solid #c7d2fe',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: window.innerWidth < 768 ? 4 : 10,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ position: 'relative' }}>
              {/* Mobile icon */}
              <span
                style={{
                  position: 'absolute',
                  left: 6,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  display: window.innerWidth < 768 ? 'block' : 'none',
                  fontSize: 14,
                }}
              >
                👤
              </span>

              <input
                placeholder={t('customer.search')}
                value={customerName}
                onChange={(e) => {
                  setCustomerName(e.target.value);
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

              {showSuggestions && customerName && (
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
                          padding: '8px 10px',
                          cursor: 'pointer',
                          borderBottom: '1px solid #f1f5f9',
                        }}
                      >
                        {c.name}
                      </div>
                    ))}
                </div>
              )}
            </div>

            <div style={{ position: 'relative' }}>
              {/* mobile icon */}
              <span
                style={{
                  position: 'absolute',
                  left: 6,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  display: window.innerWidth < 768 ? 'block' : 'none',
                  fontSize: 14,
                }}
              >
                📄
              </span>

              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                style={{
                  height: window.innerWidth < 768 ? 32 : 36,
                  width: window.innerWidth < 768 ? 44 : 'auto',
                  minWidth: window.innerWidth < 768 ? 44 : 'auto',
                  borderRadius: 8,
                  border: '1px solid #93c5fd',
                  padding: window.innerWidth < 768 ? '0 4px 0 20px' : '0 10px',
                  background: '#ffffff',
                  fontWeight: 600,
                }}
              >
                <option value={10}>10 / page</option>
                <option value={25}>25 / page</option>
                <option value={50}>50 / page</option>
              </select>
            </div>
            <select
              value={printSize}
              onChange={(e) => setPrintSize(e.target.value)}
              style={{
                height: window.innerWidth < 768 ? 32 : 36,
                width: window.innerWidth < 768 ? 46 : 'auto',
                minWidth: window.innerWidth < 768 ? 46 : 'auto',
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
              className="btn btn-primary text-xs md:text-sm"
              style={{ height: window.innerWidth < 768 ? 32 : 36 }}
              disabled={!cid}
              onClick={print}
            >
              {t('print')}
            </button>
            <button
              className="btn btn-primary text-xs md:text-sm"
              style={{ height: window.innerWidth < 768 ? 32 : 36 }}
              disabled={!cid}
              onClick={async () => {
                if (!cid) return;

                const query = new URLSearchParams({
                  startDate: start || '',
                  endDate: end || '',
                  size: printSize,
                }).toString();

                try {
                  const response = await fetch(
                    `${process.env.REACT_APP_API_BASE_URL}/api/print/customer-ledger/${cid}/pdf?${query}`,
                    {
                      headers: {
                        Authorization: `Bearer ${token}`,
                      },
                    }
                  );

                  const blob = await response.blob();
                  const url = window.URL.createObjectURL(blob);

                  const link = document.createElement('a');

                  const selectedCustomer = customers.find((c) => c._id === cid);
                  const customerName = selectedCustomer?.name || 'Customer';

                  link.href = url;
                  link.download = `${customerName.replace(/\s+/g, '-')}-Ledger.pdf`;

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

            <button
              style={{
                height: window.innerWidth < 768 ? 32 : 36,
                padding: window.innerWidth < 768 ? '0 10px' : '0 18px',
                borderRadius: 10,
                background: 'linear-gradient(135deg, #0ea5e9, #6366f1)',
                border: 'none',
                color: '#ffffff',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                transition: 'all 0.2s ease',
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

          <div className="flex items-center gap-1 md:gap-3 flex-wrap">
            <input
              placeholder={t('ledger.searchLedger')}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-[110px] md:w-[260px]"
              style={{
                height: window.innerWidth < 768 ? 32 : 36,
                borderRadius: 8,
                border: '1px solid #93c5fd',
                padding: '0 12px',
              }}
            />

            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="w-[40px] md:w-auto"
              style={{
                height: window.innerWidth < 768 ? 32 : 36,
                borderRadius: 8,
                border: '1px solid #93c5fd',
                padding: '0 4px',
                background: '#ffffff',
              }}
            />

            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="w-[40px] md:w-auto"
              style={{
                height: window.innerWidth < 768 ? 32 : 36,
                borderRadius: 8,
                border: '1px solid #93c5fd',
                padding: '0 4px',
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

            <button
              style={{
                height: window.innerWidth < 768 ? 32 : 36,
                padding: window.innerWidth < 768 ? '0 10px' : '0 18px',
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
          </div>
        </div>
      }
    >
      <>
        <div
          className="screen-only"
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            minHeight: 0,
          }}
        >
          <LedgerTable
            ledgerData={paginatedLedger}
            search={search}
            openingBalance={opening}
            onDelete={del}
            onEdit={(entry) => {
              const type = entry.sourceType?.toLowerCase();

              if ((type === 'sale_invoice' || type === 'invoice') && entry.invoiceId) {
                navigate(`/sales?invoiceId=${entry.invoiceId}`);
              } else if (type === 'receive_payment' && entry.referenceId) {
                navigate(`/receive-payments/edit/${entry.referenceId}`);
              } else if (type === 'refund_invoice' && entry.referenceId) {
                navigate(`/refunds/edit/${entry.referenceId}`);
              } else {
                alert(t('alerts.entryNotEditable'));
              }
            }}
            onRowClick={handleRowClick}
          />
          {totalPages > 1 && (
            <div
              className="pagination"
              style={{
                padding: '8px 0',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: 12,
                fontSize: window.innerWidth < 768 ? 10 : 12,
                color: '#6b7280',
                background: '#ffffff',
              }}
            >
              <span>
                {t('common.showing')} {startRow}–{endRow} {t('of')} {dateFilteredLedger.length}
              </span>

              <button
                className="pagination-btn"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                ⬅ {t('previous')}
              </button>

              <span>
                {t('page')} <strong>{page}</strong> {t('of')} {totalPages}
              </span>

              <button
                className="pagination-btn"
                disabled={page === totalPages}
                onClick={() => setPage(page + 1)}
              >
                {t('next')} ➡
              </button>
            </div>
          )}
        </div>

        {!loading && cid && ledger.length === 0 && <p>{t('ledger.noTransactions')}</p>}
      </>
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
            size: printSize,
          }).toString();

          const pdfUrl = `${process.env.REACT_APP_API_BASE_URL}/api/print/customer-ledger/${cid}/pdf?${query}`;

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
    </PageLayout>
  );
}
