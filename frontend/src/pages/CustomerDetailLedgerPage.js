import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PageLayout from '../components/PageLayout';
import { getCustomerDetailedLedger } from '../services/customerDetailLedgerService';
import { getLedgerByCustomerAccount } from '../services/customerLedgerService';
import { t } from '../i18n/i18n';
import { sendPdfToWhatsApp } from '../utils/whatsappPdf';
import WhatsAppShareModal from '../components/WhatsAppShareModal';
import { FaWhatsapp } from 'react-icons/fa';
import usePageMemory from '../hooks/usePageMemory';
const API = process.env.REACT_APP_API_BASE_URL;

const CUSTOMER_DETAIL_LEDGER_DEFAULTS = {
  selectedCustomerId: '',
  customerName: '',
  startDate: '',
  endDate: '',
  searchText: '',
};

export default function CustomerDetailLedgerPage() {
  const { customerId } = useParams();
  const navigate = useNavigate();
  const token = localStorage.getItem('token');

  const [blocks, setBlocks] = useState([]);

  const [summary, setSummary] = useState({
    opening: 0,
    debit: 0,
    credit: 0,
    closing: 0,
  });

  const [loading, setLoading] = useState(false);

  const [customers, setCustomers] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [showShareModal, setShowShareModal] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const handledRouteCustomerRef = useRef('');

  const { state: pageMemory, updateField: updatePageField } = usePageMemory(
    'customer_detail_ledger_page_state',
    CUSTOMER_DETAIL_LEDGER_DEFAULTS,
    {
      expiryHours: 24,
      delay: 350,
    }
  );

  const { selectedCustomerId, customerName, startDate, endDate, searchText } = pageMemory;

  const setSelectedCustomerId = React.useCallback(
    (value) => updatePageField('selectedCustomerId', value || ''),
    [updatePageField]
  );

  const setCustomerName = React.useCallback(
    (value) => updatePageField('customerName', value || ''),
    [updatePageField]
  );

  const setStartDate = React.useCallback(
    (value) => updatePageField('startDate', value),
    [updatePageField]
  );

  const setEndDate = React.useCallback(
    (value) => updatePageField('endDate', value),
    [updatePageField]
  );

  const setSearchText = React.useCallback(
    (value) => updatePageField('searchText', value),
    [updatePageField]
  );

  // ✅ Print Size (Default A5, Remembered)
  const [printSize, setPrintSize] = useState(localStorage.getItem('detailLedgerPrintSize') || 'A5');

  useEffect(() => {
    localStorage.setItem('detailLedgerPrintSize', printSize);
  }, [printSize]);

  // 🔢 PRINT SUMMARY CALCULATION (SAFE)

  const loadData = React.useCallback(
    async (cid, s = startDate, e = endDate) => {
      if (!cid) {
        setBlocks([]);

        setSummary({
          opening: 0,
          debit: 0,
          credit: 0,
          closing: 0,
        });

        return;
      }

      const customer = customers.find((item) => String(item._id) === String(cid));

      if (!customer) {
        return;
      }

      const accountId =
        typeof customer.account === 'object' ? customer.account?._id : customer.account;

      if (!accountId) {
        return;
      }

      setLoading(true);

      try {
        const [master, detail] = await Promise.all([
          getLedgerByCustomerAccount(accountId, s || '', e || ''),

          getCustomerDetailedLedger(cid, s || '', e || ''),
        ]);

        const opening = Number(master?.openingBalance || 0);

        const rows = Array.isArray(master?.ledger) ? master.ledger : [];

        const closing = rows.length > 0 ? Number(rows[rows.length - 1].balance || 0) : opening;

        const detailRows = Array.isArray(detail?.ledger) ? detail.ledger : [];

        const customerOpening = detailRows
          .filter((row) =>
            ['opening_sale_invoice', 'opening_refund_invoice'].includes(row.sourceType)
          )
          .reduce((sum, row) => sum + Number(row.debit || 0) - Number(row.credit || 0), 0);

        const businessDebit = rows
          .filter(
            (row) => !['opening_sale_invoice', 'opening_refund_invoice'].includes(row.sourceType)
          )
          .reduce((sum, row) => sum + Number(row.debit || 0), 0);

        const businessCredit = rows
          .filter(
            (row) => !['opening_sale_invoice', 'opening_refund_invoice'].includes(row.sourceType)
          )
          .reduce((sum, row) => sum + Number(row.credit || 0), 0);

        setSelectedCustomerId(cid);

        setCustomerName(detail?.customerName || customer.name || '');

        setSummary({
          opening: customerOpening || opening,
          debit: businessDebit,
          credit: businessCredit,
          closing,
        });

        setBlocks(buildBlocks(detailRows));
      } catch (err) {
        console.error(`❌ ${t('alerts.detailLedgerLoadFailed')}`, err);

        setBlocks([]);

        setSummary({
          opening: 0,
          debit: 0,
          credit: 0,
          closing: 0,
        });
      } finally {
        setLoading(false);
      }
    },
    [customers, startDate, endDate, setSelectedCustomerId, setCustomerName]
  );
  useEffect(() => {
    if (!customerId) return;
    if (customers.length === 0) return;

    if (handledRouteCustomerRef.current === String(customerId)) {
      return;
    }

    const customer = customers.find((item) => String(item._id) === String(customerId));

    if (!customer) return;

    handledRouteCustomerRef.current = String(customerId);

    setSelectedCustomerId(customer._id);
    setCustomerName(customer.name || '');

    loadData(customer._id, startDate, endDate);
  }, [customerId, customers, startDate, endDate, loadData, setSelectedCustomerId, setCustomerName]);

  useEffect(() => {
    if (customerId) return;
    if (!selectedCustomerId) return;
    if (customers.length === 0) return;

    const customer = customers.find((item) => String(item._id) === String(selectedCustomerId));

    if (!customer) return;

    loadData(selectedCustomerId, startDate, endDate);
  }, [customerId, selectedCustomerId, customers, startDate, endDate, loadData]);
  useEffect(() => {
    fetch(`${API}/api/customers`, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
    })
      .then((res) => res.json())
      .then((data) => {
        setCustomers(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        setCustomers([]);
      });
  }, []);

  // 🔹 Journal rows → Invoice-style blocks (WITH ITEMS)
  const buildBlocks = (ledger = []) => {
    const map = new Map();

    for (const row of ledger) {
      const key = row.referenceId || row._id;

      if (!map.has(key)) {
        map.set(key, {
          key,
          billNo: row.billNo || '-',
          date: row.date,
          sourceType: row.sourceType,
          sourceLabel:
            row.sourceType === 'opening_sale_invoice'
              ? 'Opening Sale Invoice'
              : row.sourceType === 'sale_invoice'
                ? t('saleInvoice')
                : row.sourceType === 'refund_invoice'
                  ? t('refund.sale')
                  : row.sourceType === 'receive_payment'
                    ? t('receivePayment')
                    : '-',
          items: [],
          debit: 0,
          credit: 0,
          balance: row.balance,
        });
      }

      const block = map.get(key);

      block.debit += row.debit || 0;
      block.credit += row.credit || 0;

      if (Array.isArray(row.items) && row.items.length > 0) {
        block.items.push(...row.items);
      }
    }

    return Array.from(map.values());
  };
  const filteredBlocks = blocks.filter((blk) => {
    if (!searchText) return true;

    const text = searchText.toLowerCase();

    const matchBill = (blk.billNo || '').toLowerCase().includes(text);

    const matchSource = (blk.sourceLabel || '').toLowerCase().includes(text);

    const matchItems =
      Array.isArray(blk.items) &&
      blk.items.some((it) => (it.productName || '').toLowerCase().includes(text));

    return matchBill || matchSource || matchItems;
  });
  const applyQuickRange = (type) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let start = '';
    let end = '';

    switch (type) {
      case 'today':
        start = end = today;
        break;

      case 'yesterday': {
        const y = new Date(today);
        y.setDate(y.getDate() - 1);
        start = end = y;
        break;
      }

      case 'this_week': {
        const d = new Date(today);
        const day = d.getDay() || 7;
        d.setDate(d.getDate() - day + 1);
        start = d;
        end = today;
        break;
      }

      case 'last_week': {
        const d = new Date(today);
        const day = d.getDay() || 7;
        d.setDate(d.getDate() - day - 6);
        start = new Date(d);
        end = new Date(d);
        end.setDate(start.getDate() + 6);
        break;
      }

      case 'this_month':
        start = new Date(today.getFullYear(), today.getMonth(), 1);
        end = today;
        break;

      case 'last_month':
        start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        end = new Date(today.getFullYear(), today.getMonth(), 0);
        break;

      case 'last_3_months':
        start = new Date(today.getFullYear(), today.getMonth() - 3, today.getDate());
        end = today;
        break;

      case 'last_6_months':
        start = new Date(today.getFullYear(), today.getMonth() - 6, today.getDate());
        end = today;
        break;

      case 'last_year':
        start = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
        end = today;
        break;

      default:
        return;
    }

    const toYMD = (d) => d.toISOString().split('T')[0];

    const s = toYMD(start);
    const e = toYMD(end);

    setStartDate(s);
    setEndDate(e);

    loadData(selectedCustomerId, s, e);
  };

  return (
    <PageLayout
      title={<span className="no-print">{t('ledger.customerDetailed')}</span>}
      headerContent={
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
            background: '#eef2ff',
            borderRadius: 12,
            padding: '8px 12px',
            border: '1px solid #c7d2fe',
          }}
        >
          {/* 🔍 Customer Search */}
          <div style={{ position: 'relative' }}>
            <input
              placeholder={t('customer.search')}
              value={customerName}
              onChange={(e) => {
                const value = e.target.value;

                setCustomerName(value);
                setShowSuggestions(true);

                if (selectedCustomerId) {
                  setSelectedCustomerId('');
                  setBlocks([]);

                  setSummary({
                    opening: 0,
                    debit: 0,
                    credit: 0,
                    closing: 0,
                  });
                }
              }}
              onFocus={() => setShowSuggestions(true)}
              style={{
                height: window.innerWidth < 768 ? 32 : 36,
                width: window.innerWidth < 768 ? 120 : 220,
                borderRadius: 8,
                border: '1px solid #93c5fd',
                padding: window.innerWidth < 768 ? '0 4px' : '0 10px',
                fontWeight: 600,
                background: '#ffffff',
              }}
            />

            {/* 🔽 Suggestions List */}
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
                        setSelectedCustomerId(c._id);
                        setShowSuggestions(false);

                        navigate(`/customer-ledger/${c._id}/detail`, {
                          replace: true,
                        });

                        loadData(c._id, startDate, endDate);
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

          {/* 🔹 Manual Date (Custom) */}
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={{
              height: window.innerWidth < 768 ? 32 : 36,
              borderRadius: 8,
              border: '1px solid #93c5fd',
              padding: '0 10px',
              background: '#ffffff',
            }}
          />

          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={{
              height: window.innerWidth < 768 ? 32 : 36,
              borderRadius: 8,
              border: '1px solid #93c5fd',
              padding: '0 10px',
              background: '#ffffff',
            }}
          />

          <button
            className="btn btn-primary"
            style={{
              height: window.innerWidth < 768 ? 32 : 36,
              padding: window.innerWidth < 768 ? '0 10px' : '0 18px',
            }}
            onClick={loadData}
          >
            {t('load')}
          </button>

          <select
            value={printSize}
            onChange={(e) => setPrintSize(e.target.value)}
            style={{
              height: window.innerWidth < 768 ? 32 : 36,
              borderRadius: 8,
              border: '1px solid #93c5fd',
              padding: '0 10px',
              background: '#ffffff',
              fontWeight: 600,
            }}
          >
            <option value="A5">A5</option>
            <option value="A4">A4</option>
          </select>

          <button
            disabled={!selectedCustomerId}
            onClick={async () => {
              if (!selectedCustomerId) return;

              const query = new URLSearchParams({
                startDate: startDate || '',
                endDate: endDate || '',
                size: printSize,
                lang: localStorage.getItem('lang') || 'ur',
              }).toString();

              try {
                const response = await fetch(
                  `${process.env.REACT_APP_API_BASE_URL}/api/print/customer-detail-ledger/${selectedCustomerId}/html?${query}`,
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

                  // ✅ Open print dialog
                  newWindow.print();

                  // ✅ Close after print
                  newWindow.onafterprint = function () {
                    newWindow.close();
                  };

                  // ✅ Fallback for Edge/other browsers
                  setTimeout(() => {
                    if (!newWindow.closed) {
                      newWindow.close();
                    }
                  }, 1000);
                };
              } catch (error) {
                alert(t('alerts.printFailed'));
              }
            }}
            style={{
              height: window.innerWidth < 768 ? 32 : 36,
              width: window.innerWidth < 768 ? 36 : 'auto',
              padding: window.innerWidth < 768 ? '0' : '0 16px',
              borderRadius: 8,
              border: 'none',
              fontWeight: 700,
              color: '#fff',
              cursor: 'pointer',
              background: 'linear-gradient(135deg,#6366f1,#4338ca)',
              boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
            }}
          >
            {window.innerWidth < 768 ? '🖨️' : `🖨 ${t('common.print')}`}
          </button>
          <button
            disabled={!selectedCustomerId || pdfLoading}
            onClick={async () => {
              if (!selectedCustomerId) return;

              const query = new URLSearchParams({
                startDate: startDate || '',
                endDate: endDate || '',
                size: printSize,
                lang: localStorage.getItem('lang') || 'ur',
              }).toString();

              try {
                setPdfLoading(true);

                const response = await fetch(
                  `${process.env.REACT_APP_API_BASE_URL}/api/print/customer-detail-ledger/${selectedCustomerId}/pdf?${query}`,
                  {
                    headers: {
                      Authorization: `Bearer ${token}`,
                    },
                  }
                );

                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);

                const link = document.createElement('a');
                link.href = url;

                const safeName = (customerName || 'Customer').replace(/\s+/g, '-');
                link.download = `${safeName}-Detail-Ledger.pdf`;

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
            style={{
              height: window.innerWidth < 768 ? 32 : 36,
              width: window.innerWidth < 768 ? 36 : 'auto',
              padding: window.innerWidth < 768 ? '0' : '0 16px',
              borderRadius: 8,
              border: 'none',
              fontWeight: 700,
              color: '#fff',
              cursor: pdfLoading ? 'not-allowed' : 'pointer',
              opacity: pdfLoading ? 0.7 : 1,
              transition: 'all 0.2s ease',
              background: pdfLoading ? '#9ca3af' : 'linear-gradient(135deg,#f59e0b,#d97706)',
              boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
            }}
          >
            {pdfLoading
              ? `⏳ ${t('pdf.preparing')}`
              : window.innerWidth < 768
                ? '📄'
                : `📄 ${t('common.pdf')}`}
          </button>
          <button
            disabled={!selectedCustomerId}
            onClick={() => {
              setShowShareModal(true);
            }}
            style={{
              height: window.innerWidth < 768 ? 32 : 36,
              width: window.innerWidth < 768 ? 34 : 40,
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              background: 'linear-gradient(135deg,#25D366,#128C7E)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <FaWhatsapp size={18} color="#fff" />
          </button>

          {/* 🔹 Date Range Dropdown */}
          <select
            onChange={(e) => {
              if (e.target.value) {
                applyQuickRange(e.target.value);
                e.target.value = '';
              }
            }}
            style={{
              height: window.innerWidth < 768 ? 32 : 36,
              borderRadius: 8,
              border: '1px solid #93c5fd',
              padding: '0 10px',
              background: '#ffffff',
              fontWeight: 600,
              minWidth: window.innerWidth < 768 ? 120 : 180,
            }}
          >
            <option value="">{t('ledger.quickRange')}</option>
            <option value="today">{t('date.today')}</option>
            <option value="yesterday">{t('date.yesterday')}</option>
            <option value="this_week">{t('date.thisWeek')}</option>
            <option value="last_week">{t('date.lastWeek')}</option>
            <option value="this_month">{t('date.thisMonth')}</option>
            <option value="last_month">{t('date.lastMonth')}</option>
            <option value="last_3_months">{t('date.last3Months')}</option>
            <option value="last_6_months">{t('date.last6Months')}</option>
            <option value="last_year">{t('date.lastYear')}</option>
          </select>
          <input
            placeholder="Search bill, product, description..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{
              height: window.innerWidth < 768 ? 32 : 36,
              width: window.innerWidth < 768 ? 110 : 260,
              borderRadius: 8,
              border: '1px solid #93c5fd',
              padding: '0 12px',
            }}
          />
        </div>
      }
      headerCards={
        <>
          <div className="card">
            <div style={{ fontSize: 12, color: '#6b7280' }}>{t('ledger.opening')}</div>
            <div style={{ fontWeight: 800 }}>Rs. {summary.opening.toFixed(2)}</div>
          </div>

          <div className="card">
            <div style={{ fontSize: 12, color: '#16a34a' }}>{t('credit')}</div>
            <div style={{ fontWeight: 800 }}>Rs. {summary.debit.toFixed(2)}</div>
          </div>

          <div className="card">
            <div style={{ fontSize: 12, color: '#dc2626' }}>{t('debit')}</div>
            <div style={{ fontWeight: 800 }}>Rs. {summary.credit.toFixed(2)}</div>
          </div>

          <div className="card">
            <div style={{ fontSize: 12, color: '#2563eb' }}>{t('ledger.closing')}</div>
            <div style={{ fontWeight: 800 }}>Rs. {summary.closing.toFixed(2)}</div>
          </div>
        </>
      }
    >
      {/* 🔽 PRINT + PDF SECTION */}
      {loading ? (
        <p>{t('common.loading')}</p>
      ) : blocks.length === 0 ? (
        <p>{t('common.noRecords')}</p>
      ) : (
        /* 🔽 SCROLLABLE DETAIL LEDGER AREA */
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            minHeight: 0,
          }}
        >
          <div id="print-section">
            {/* 🧾 PRINT HEADER — FIRST PAGE ONLY */}
            <table className="table print-ledger-table">
              <thead>
                <tr>
                  <th colSpan={4} style={{ textAlign: 'center', fontWeight: 700 }}>
                    {t('ledger.customerLedger')}
                  </th>
                  <th colSpan={4} style={{ textAlign: 'center' }}>
                    {customerName || '-'}
                  </th>
                  <th colSpan={4} style={{ textAlign: 'right' }}>
                    {startDate && endDate
                      ? `${startDate} ${t('common.to')} ${endDate}`
                      : t('ledger.allDates')}
                  </th>
                </tr>

                <tr>
                  <th colSpan={12} style={{ textAlign: 'center', fontSize: 12 }}>
                    {t('debit')}: {summary.debit.toFixed(2)} &nbsp; | &nbsp; {t('credit')}:{' '}
                    {summary.credit.toFixed(2)} &nbsp; | &nbsp; {t('ledger.closing')}:{' '}
                    {summary.closing.toFixed(2)}
                  </th>
                </tr>
              </thead>
            </table>

            {/* 📄 LEDGER BLOCKS */}
            {(searchText ? filteredBlocks : blocks).map((blk) => (
              <div
                key={blk.key}
                className={`ledger-block ${blk.sourceType}`}
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                  padding: 8,
                  marginBottom: 6,
                }}
              >
                {/* 🔹 Block Header */}
                <div style={{ fontWeight: 700, marginBottom: 6 }}>
                  {blk.sourceLabel} #{blk.billNo} — {new Date(blk.date).toLocaleDateString()}
                </div>

                {/* 🔹 PRODUCT TABLE */}
                {blk.items.length > 0 && (
                  <table className="table" style={{ marginBottom: 4 }}>
                    <thead>
                      <tr>
                        <th style={{ width: '55%' }}>{t('inventory.product')}</th>

                        <th style={{ width: '10%' }}>{t('qty')}</th>

                        <th style={{ width: '15%' }}>{t('rate')}</th>

                        <th style={{ width: '20%' }}>{t('total')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {blk.items.map((it, idx) => (
                        <tr key={idx}>
                          <td style={{ width: '55%' }}>{it.productName}</td>

                          <td style={{ width: '10%' }}>{it.quantity}</td>

                          <td style={{ width: '15%' }}>{it.rate.toFixed(2)}</td>

                          <td style={{ width: '20%' }}>{it.total.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {/* 🔹 TOTALS */}
                <table className="table">
                  <tbody>
                    <tr>
                      <td align="right">{t('credit')}:</td>
                      <td align="right" className="amount-debit">
                        {blk.debit ? blk.debit.toFixed(2) : '—'}
                      </td>
                    </tr>

                    <tr>
                      <td align="right">{t('debit')}:</td>
                      <td align="right" className="amount-credit">
                        {blk.credit ? blk.credit.toFixed(2) : '—'}
                      </td>
                    </tr>

                    <tr>
                      <td align="right">{t('balance')}:</td>
                      <td align="right" className="amount-balance">
                        {blk.balance.toFixed(2)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </div>
      )}
      <WhatsAppShareModal
        open={showShareModal}
        onClose={() => setShowShareModal(false)}
        onSelect={(type) => {
          setShowShareModal(false);

          const selectedCustomer = customers.find((c) => c._id === selectedCustomerId);

          const query = new URLSearchParams({
            startDate: startDate || '',
            endDate: endDate || '',
            size: printSize,
            lang: localStorage.getItem('lang') || 'ur',
          }).toString();

          const pdfUrl = `${process.env.REACT_APP_API_BASE_URL}/api/print/customer-detail-ledger/${selectedCustomerId}/pdf?${query}`;

          sendPdfToWhatsApp({
            phone: selectedCustomer?.phone || selectedCustomer?.mobile,
            customerName: selectedCustomer?.name,
            balance: summary.closing,
            businessName: 'Your Business',
            mobile: '',
            lang: localStorage.getItem('lang') || 'ur',
            pdfUrl,
            token,
            preferredApp: type,
          });
        }}
      />
    </PageLayout>
  );
}
