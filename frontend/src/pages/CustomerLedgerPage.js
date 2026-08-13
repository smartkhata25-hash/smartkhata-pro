// 📁 src/pages/CustomerLedgerPage.js

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';

import PageLayout from '../components/PageLayout';

import { getLedgerByCustomerAccount } from '../services/customerLedgerService';

import LedgerTable from '../components/LedgerTable';
import { t, getCurrentLanguage } from '../i18n/i18n';
import { sendPdfToWhatsApp } from '../utils/whatsappPdf';
import WhatsAppShareModal from '../components/WhatsAppShareModal';
import { FaWhatsapp } from 'react-icons/fa';
import usePageMemory from '../hooks/usePageMemory';

const CUSTOMER_LEDGER_DEFAULTS = {
  search: '',
  cid: '',
  customerName: '',
  start: `${new Date().getFullYear()}-01-01`,
  end: `${new Date().getFullYear()}-12-31`,
};

export default function CustomerLedgerPage() {
  const { customerId } = useParams();
  const token = localStorage.getItem('token');
  const navigate = useNavigate();

  const [customers, setCustomers] = useState([]);

  const [showSuggestions, setShowSuggestions] = useState(false);
  const [ledger, setLedger] = useState([]);

  const [opening, setOpening] = useState(0);

  const currentYear = new Date().getFullYear();

  const [loading, setLoading] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [pdfLoading, setPdfLoading] = React.useState(false);

  const handledRouteCustomerRef = useRef('');

  const { state: pageMemory, updateField: updatePageField } = usePageMemory(
    'customer_ledger_page_state',
    CUSTOMER_LEDGER_DEFAULTS,
    {
      expiryHours: 24,
      delay: 350,
    }
  );

  const { search, cid, customerName, start, end } = pageMemory;

  const setSearch = useCallback((value) => updatePageField('search', value), [updatePageField]);

  const setCid = useCallback((value) => updatePageField('cid', value || ''), [updatePageField]);

  const setCustomerName = useCallback(
    (value) => updatePageField('customerName', value || ''),
    [updatePageField]
  );

  const setStart = useCallback((value) => updatePageField('start', value), [updatePageField]);

  const setEnd = useCallback((value) => updatePageField('end', value), [updatePageField]);

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
      .get(`${process.env.REACT_APP_API_BASE_URL}/api/customers`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => setCustomers(res.data))
      .catch(console.error);
  }, [token]);

  const load = useCallback(
    async (id = cid, s = start, e = end) => {
      if (!id) {
        setLedger([]);
        setOpening(0);
        return;
      }

      const customer = customers.find((item) => String(item._id) === String(id));

      if (!customer) {
        setLedger([]);
        setOpening(0);
        return;
      }

      const accountId = customer.account?._id || customer.account;

      if (!accountId) {
        setLedger([]);
        setOpening(0);
        return;
      }

      setLoading(true);

      try {
        const data = await getLedgerByCustomerAccount(accountId, s || '', e || '');

        const ledgerRows = Array.isArray(data?.ledger) ? data.ledger : [];

        setCid(customer._id);
        setCustomerName(customer.name || '');

        setOpening(Number(data?.openingBalance || 0));
        setLedger(ledgerRows);
      } catch (err) {
        console.error('LEDGER LOAD ERROR:', err);

        setLedger([]);
        setOpening(0);
      } finally {
        setLoading(false);
      }
    },
    [cid, start, end, customers, setCid, setCustomerName]
  );

  useEffect(() => {
    if (!customerId) return;
    if (customers.length === 0) return;

    if (handledRouteCustomerRef.current === String(customerId)) {
      return;
    }

    const selectedCustomer = customers.find(
      (customer) => String(customer._id) === String(customerId)
    );

    if (!selectedCustomer) return;

    handledRouteCustomerRef.current = String(customerId);

    setCid(selectedCustomer._id);
    setCustomerName(selectedCustomer.name || '');
  }, [customerId, customers, setCid, setCustomerName]);

  useEffect(() => {
    if (!cid) {
      setLedger([]);
      setOpening(0);
      return;
    }

    if (customers.length === 0) return;

    const selectedCustomer = customers.find((customer) => String(customer._id) === String(cid));

    if (!selectedCustomer) {
      setLedger([]);
      setOpening(0);
      return;
    }

    load(cid, start, end);
  }, [cid, customers, start, end, load]);

  const print = async () => {
    if (!cid) return;

    const query = new URLSearchParams({
      startDate: start || '',
      endDate: end || '',
      size: printSize,
      lang: getCurrentLanguage(),
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

      newWindow.onload = function () {
        newWindow.focus();

        // ✅ Print dialog open
        newWindow.print();

        // ✅ Print ke baad close
        newWindow.onafterprint = function () {
          newWindow.close();
        };

        // ✅ Fallback for browsers jahan onafterprint work nahi karta
        setTimeout(() => {
          if (!newWindow.closed) {
            newWindow.close();
          }
        }, 1000);
      };
    } catch (error) {
      alert(t('alerts.printFailed'));
    }
  };
  const handleRowClick = (entry) => {
    if (!entry || entry.isOpening) return;

    if (
      ['sale_invoice', 'invoice', 'opening_sale_invoice'].includes(entry.sourceType) &&
      entry.invoiceId
    ) {
      navigate(`/create-sale?invoiceId=${entry.invoiceId}`);
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
              Rs. {totalCredit.toFixed(2)}
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
              Rs. {totalDebit.toFixed(2)}
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
                  const value = e.target.value;

                  setCustomerName(value);
                  setShowSuggestions(true);

                  if (cid) {
                    setCid('');
                    setLedger([]);
                    setOpening(0);
                  }
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
                          handledRouteCustomerRef.current = String(c._id);

                          setCustomerName(c.name);
                          setCid(c._id);
                          setShowSuggestions(false);

                          navigate(`/customer-ledger/${c._id}`, {
                            replace: true,
                          });
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
              className={`btn text-xs md:text-sm ${
                pdfLoading ? 'bg-gray-400 cursor-not-allowed' : 'btn-primary'
              }`}
              style={{ height: window.innerWidth < 768 ? 32 : 36 }}
              disabled={!cid || pdfLoading}
              onClick={async () => {
                if (!cid) return;

                const query = new URLSearchParams({
                  startDate: start || '',
                  endDate: end || '',
                  size: printSize,
                  lang: getCurrentLanguage(),
                }).toString();

                try {
                  setPdfLoading(true);

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

                  window.URL.revokeObjectURL(url);
                } catch (error) {
                  alert(t('alerts.pdfFailed'));
                } finally {
                  setPdfLoading(false);
                }
              }}
            >
              {pdfLoading ? `⏳ ${t('pdf.preparing')}` : t('pdf')}
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
                const defaultStart = `${currentYear}-01-01`;
                const defaultEnd = `${currentYear}-12-31`;

                setSearch('');
                setStart(defaultStart);
                setEnd(defaultEnd);

                if (cid) {
                  load(cid, defaultStart, defaultEnd);
                }
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
            ledgerData={dateFilteredLedger}
            search={search}
            openingBalance={opening}
            onDelete={null}
            onEdit={(entry) => {
              const type = entry.sourceType?.toLowerCase();

              // ✅ Sale Invoice + Opening Sale Invoice
              if (
                ['sale_invoice', 'invoice', 'opening_sale_invoice'].includes(type) &&
                entry.invoiceId
              ) {
                navigate(`/create-sale?invoiceId=${entry.invoiceId}`);
              }

              // ✅ Refund Invoice + Opening Refund Invoice
              else if (
                ['refund_invoice', 'opening_refund_invoice'].includes(type) &&
                entry.invoiceId
              ) {
                navigate(`/refunds/edit/${entry.invoiceId}`);
              }

              // ✅ Receive Payment
              else if (type === 'receive_payment') {
                // ✅ Invoice se aayi payment
                if (entry.originModule === 'sale_invoice') {
                  navigate(`/create-sale?invoiceId=${entry.referenceId}`);

                  return;
                }

                // ✅ Standalone Receive Payment
                if (entry.originModule === 'receive_payment_form') {
                  navigate(`/receive-payments/edit/${entry.referenceId || entry._id}`);

                  return;
                }

                // ❌ Unknown
                alert(t('alerts.entryNotEditable'));
              }

              // ❌ Unknown
              else {
                alert(t('alerts.entryNotEditable'));
              }
            }}
            onRowClick={handleRowClick}
          />
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
            lang: getCurrentLanguage(),
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
