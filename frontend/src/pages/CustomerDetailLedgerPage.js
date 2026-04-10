import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import PageLayout from '../components/PageLayout';
import { getCustomerDetailedLedger } from '../services/customerDetailLedgerService';
import { getLedgerByCustomerAccount } from '../services/customerLedgerService';
import { t } from '../i18n/i18n';
import { sendPdfToWhatsApp } from '../utils/whatsappPdf';
import WhatsAppShareModal from '../components/WhatsAppShareModal';
import { FaWhatsapp } from 'react-icons/fa';

export default function CustomerDetailLedgerPage() {
  const { customerId } = useParams();
  const token = localStorage.getItem('token');
  const [selectedCustomerId, setSelectedCustomerId] = useState(customerId || '');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [blocks, setBlocks] = useState([]);
  const [summary, setSummary] = useState({
    opening: 0,
    debit: 0,
    credit: 0,
    closing: 0,
  });

  const [loading, setLoading] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customers, setCustomers] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [showShareModal, setShowShareModal] = useState(false);

  // ✅ Print Size (Default A5, Remembered)
  const [printSize, setPrintSize] = useState(localStorage.getItem('detailLedgerPrintSize') || 'A5');

  useEffect(() => {
    localStorage.setItem('detailLedgerPrintSize', printSize);
  }, [printSize]);

  // 🔢 PRINT SUMMARY CALCULATION (SAFE)

  const loadData = React.useCallback(
    async (cid, s, e) => {
      if (!cid) return;

      setLoading(true);
      try {
        // 🟢 1️⃣ BOSS LEDGER (ACCOUNTING TRUTH)
        const customer = customers.find((c) => c._id === cid);

        if (!customer) {
          setLoading(false);
          return;
        }

        const master = await getLedgerByCustomerAccount(
          typeof customer.account === 'object' ? customer.account._id : customer.account,
          s,
          e
        );

        const opening = master.openingBalance || 0;
        const rows = Array.isArray(master.ledger) ? master.ledger : [];

        const closing = rows.length > 0 ? rows[rows.length - 1].balance : opening;

        const debit = rows.reduce((sum, r) => sum + (r.debit || 0), 0);
        const credit = rows.reduce((sum, r) => sum + (r.credit || 0), 0);

        setSummary({
          opening,
          debit,
          credit,
          closing,
        });
        const detail = await getCustomerDetailedLedger(cid, s, e);

        setCustomerName(detail?.customerName || '');

        const grouped = buildBlocks(detail?.ledger || []);

        // 🟦 OPENING BLOCK (SIMPLE)
        const openingBlock = {
          key: 'opening-balance',
          billNo: '-',
          date: startDate ? new Date(startDate) : new Date(),

          sourceType: 'opening_balance',
          sourceLabel: t('ledger.openingBalance'),
          items: [],
          debit: null,
          credit: null,
          balance: opening,
        };

        setBlocks([openingBlock, ...grouped]);
      } catch (err) {
        console.error(`❌ ${t('alerts.detailLedgerLoadFailed')}`, err);
      }
      setLoading(false);
    },

    // eslint-disable-next-line
    [selectedCustomerId, startDate, endDate, customers]
  );

  useEffect(() => {
    if (customerId) {
      setSelectedCustomerId(customerId);
      loadData(customerId, startDate, endDate);
    }

    // eslint-disable-next-line
  }, [customerId]);

  useEffect(() => {
    fetch('/api/customers', {
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
            row.sourceType === 'sale_invoice'
              ? t('saleInvoice')
              : row.sourceType === 'refund_invoice'
                ? t('refund.new')
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
                setCustomerName(e.target.value);
                setShowSuggestions(true);
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
                        setCustomerName(c.name);
                        setSelectedCustomerId(c._id);
                        setShowSuggestions(false);

                        // 👇 IMPORTANT: dates کے ساتھ load کرو
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
                  newWindow.print();
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
            disabled={!selectedCustomerId}
            onClick={async () => {
              if (!selectedCustomerId) return;

              const query = new URLSearchParams({
                startDate: startDate || '',
                endDate: endDate || '',
                size: printSize,
              }).toString();

              try {
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
              } catch (error) {
                alert(t('alerts.pdfFailed'));
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
              background: 'linear-gradient(135deg,#f59e0b,#d97706)',
              boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
            }}
          >
            {window.innerWidth < 768 ? '📄' : `📄 ${t('common.pdf')}`}
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
            <div style={{ fontSize: 12, color: '#16a34a' }}>{t('debit')}</div>
            <div style={{ fontWeight: 800 }}>Rs. {summary.debit.toFixed(2)}</div>
          </div>

          <div className="card">
            <div style={{ fontSize: 12, color: '#dc2626' }}>{t('credit')}</div>
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
                        <th>{t('inventory.product')}</th>
                        <th>{t('qty')}</th>
                        <th>{t('rate')}</th>
                        <th>{t('total')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {blk.items.map((it, idx) => (
                        <tr key={idx}>
                          <td>{it.productName}</td>
                          <td>{it.quantity}</td>
                          <td>{it.rate.toFixed(2)}</td>
                          <td>{it.total.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {/* 🔹 TOTALS */}
                <table className="table">
                  <tbody>
                    <tr>
                      <td align="right">{t('debit')}:</td>
                      <td align="right" className="amount-debit">
                        {blk.debit ? blk.debit.toFixed(2) : '—'}
                      </td>
                    </tr>

                    <tr>
                      <td align="right">{t('credit')}:</td>
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
          }).toString();

          const pdfUrl = `${process.env.REACT_APP_API_BASE_URL}/api/print/customer-detail-ledger/${selectedCustomerId}/pdf?${query}`;

          sendPdfToWhatsApp({
            phone: selectedCustomer?.phone || selectedCustomer?.mobile,
            customerName: selectedCustomer?.name,
            balance: summary.closing,
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
