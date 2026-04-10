// 📁 src/pages/SupplierDetailLedgerPage.js
// بسم اللہ الرحمن الرحیم

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import PageLayout from '../components/PageLayout';

import { getSupplierDetailedLedger } from '../services/supplierDetailLedgerService';
import { fetchSupplierLedger } from '../services/supplierService';
import { t } from '../i18n/i18n';
import { sendPdfToWhatsApp } from '../utils/whatsappPdf';
import WhatsAppShareModal from '../components/WhatsAppShareModal';
import { FaWhatsapp } from 'react-icons/fa';

export default function SupplierDetailLedgerPage() {
  const { supplierId } = useParams();
  const token = localStorage.getItem('token');

  const [selectedSupplierId, setSelectedSupplierId] = useState(supplierId || '');
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
  const [showShareModal, setShowShareModal] = useState(false);
  const [supplierName, setSupplierName] = useState('');
  const [suppliers, setSuppliers] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchText, setSearchText] = useState('');

  // ✅ Print Size (Default A5)
  const [printSize, setPrintSize] = useState(
    localStorage.getItem('supplierDetailLedgerPrintSize') || 'A5'
  );

  useEffect(() => {
    localStorage.setItem('supplierDetailLedgerPrintSize', printSize);
  }, [printSize]);

  const loadData = useCallback(
    async (sid, s, e) => {
      if (!sid) return;

      setLoading(true);
      try {
        const supplier = suppliers.find((x) => x._id === sid);
        if (!supplier) {
          setLoading(false);
          return;
        }

        // 🟢 MASTER LEDGER (ACCOUNT BASED)
        const master = await fetchSupplierLedger(sid, {
          startDate: s,
          endDate: e,
        });

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

        // 🟡 DETAIL LEDGER (DISPLAY)
        const detail = await getSupplierDetailedLedger(sid, s, e);

        setSupplierName(detail?.supplierName || '');

        const grouped = buildBlocks(detail?.ledger || []);

        const openingBlock = {
          key: 'opening-balance',
          billNo: '-',
          date: startDate ? new Date(startDate) : new Date(),
          sourceType: 'opening_balance',
          sourceLabel: 'Opening Balance',
          items: [],
          debit: null,
          credit: null,
          balance: opening,
        };

        setBlocks([openingBlock, ...grouped]);
      } catch (err) {
        console.error('❌ Supplier detail ledger load failed', err);
      }
      setLoading(false);
    },
    [suppliers, startDate]
  );

  useEffect(() => {
    if (supplierId) {
      setSelectedSupplierId(supplierId);
      loadData(supplierId, startDate, endDate);
    }
  }, [supplierId, startDate, endDate, loadData]);

  useEffect(() => {
    fetch('/api/suppliers', {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
    })
      .then((r) => r.json())
      .then((d) => setSuppliers(Array.isArray(d) ? d : []))
      .catch(() => setSuppliers([]));
  }, []);

  const buildBlocks = (ledger = []) => {
    const map = {};

    ledger.forEach((row) => {
      const key = row.referenceId || row._id;

      if (!map[key]) {
        map[key] = {
          key,
          billNo: row.billNo || '-',
          date: row.date,
          sourceType: row.sourceType,
          sourceLabel:
            row.sourceType === 'purchase_invoice'
              ? t('purchase.invoice')
              : row.sourceType === 'payment'
                ? t('payment.payBill')
                : '-',
          items: [],
          debit: 0,
          credit: 0,
          balance: row.balance,
        };
      }

      map[key].debit += row.debit || 0;
      map[key].credit += row.credit || 0;

      if (Array.isArray(row.items) && row.items.length > 0) {
        map[key].items.push(...row.items);
      }
    });

    return Object.values(map);
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

    loadData(selectedSupplierId, s, e);
  };

  return (
    <PageLayout
      title={<span className="no-print">{t('ledger.supplierDetailed')}</span>}
      headerContent={
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
            background: '#fef2f2',
            borderRadius: 12,
            padding: '8px 12px',
            border: '1px solid #fecaca',
          }}
        >
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
                height: 36,
                width: window.innerWidth < 768 ? 120 : 220,
                borderRadius: 8,
                border: '1px solid #fca5a5',
                padding: window.innerWidth < 768 ? '0 4px' : '0 10px',
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
                        setSelectedSupplierId(s._id);
                        setShowSuggestions(false);
                        loadData(s._id, startDate, endDate);
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

          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={{
              height: 36,
              borderRadius: 8,
              border: '1px solid #fca5a5',
              padding: '0 10px',
              background: '#ffffff',
            }}
          />

          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={{
              height: 36,
              borderRadius: 8,
              border: '1px solid #fca5a5',
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
            onClick={() => loadData(selectedSupplierId, startDate, endDate)}
          >
            {t('common.load')}
          </button>

          <select
            value={printSize}
            onChange={(e) => setPrintSize(e.target.value)}
            style={{
              height: 36,
              borderRadius: 8,
              border: '1px solid #fca5a5',
              padding: '0 10px',
              background: '#ffffff',
              fontWeight: 600,
            }}
          >
            <option value="A5">A5</option>
            <option value="A4">A4</option>
          </select>
          <button
            disabled={!selectedSupplierId}
            onClick={async () => {
              if (!selectedSupplierId) return;

              const query = new URLSearchParams({
                startDate: startDate || '',
                endDate: endDate || '',
                size: printSize,
              }).toString();

              try {
                const response = await fetch(
                  `${process.env.REACT_APP_API_BASE_URL}/api/print/supplier-detail-ledger/${selectedSupplierId}/html?${query}`,
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
            disabled={!selectedSupplierId}
            onClick={async () => {
              if (!selectedSupplierId) return;

              const query = new URLSearchParams({
                startDate: startDate || '',
                endDate: endDate || '',
                size: printSize,
              }).toString();

              try {
                const response = await fetch(
                  `${process.env.REACT_APP_API_BASE_URL}/api/print/supplier-detail-ledger/${selectedSupplierId}/pdf?${query}`,
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

                const safeName = (supplierName || 'Supplier').replace(/\s+/g, '-');
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
            disabled={!selectedSupplierId}
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
              border: '1px solid #fca5a5',
              padding: '0 10px',
              background: '#ffffff',
              fontWeight: 600,
              minWidth: window.innerWidth < 768 ? 100 : 180,
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
              border: '1px solid #fca5a5',
              padding: '0 12px',
            }}
          />
        </div>
      }
      headerCards={
        <>
          <div className="card">
            <div style={{ fontSize: 12 }}>{t('ledger.opening')}</div>
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
            <div style={{ fontSize: 12, color: '#7c2d12' }}>{t('ledger.closing')}</div>
            <div style={{ fontWeight: 800 }}>Rs. {summary.closing.toFixed(2)}</div>
          </div>
        </>
      }
    >
      {loading ? (
        <p>{t('common.loading')}</p>
      ) : blocks.length === 0 ? (
        <p>{t('common.noRecords')}</p>
      ) : (
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            minHeight: 0,
          }}
        >
          <div id="print-section">
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
                <div style={{ fontWeight: 700, marginBottom: 6 }}>
                  {blk.sourceLabel} #{blk.billNo} — {new Date(blk.date).toLocaleDateString()}
                </div>

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
                      {blk.items.map((it, i) => (
                        <tr key={i}>
                          <td>{it.productName}</td>
                          <td>{it.quantity}</td>
                          <td>{it.rate.toFixed(2)}</td>
                          <td>{it.total.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

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

          if (!selectedSupplierId) return;

          const query = new URLSearchParams({
            startDate: startDate || '',
            endDate: endDate || '',
            size: printSize,
          }).toString();

          const pdfUrl = `${process.env.REACT_APP_API_BASE_URL}/api/print/supplier-detail-ledger/${selectedSupplierId}/pdf?${query}`;

          const token = localStorage.getItem('token');

          sendPdfToWhatsApp({
            phone: '',
            customerName: supplierName,
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
