// src/pages/PartyDetailLedgerPage.js

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import PageLayout from '../components/PageLayout';
import WhatsAppShareModal from '../components/WhatsAppShareModal';

import { fetchParties } from '../services/partyService';
import { getPartyDetailedLedger } from '../services/partyDetailLedgerService';

import { sendPdfToWhatsApp } from '../utils/whatsappPdf';
import { t } from '../i18n/i18n';

import { FaWhatsapp } from 'react-icons/fa';

const API = process.env.REACT_APP_API_BASE_URL;

const PartyDetailLedgerPage = () => {
  const { partyId } = useParams();
  const navigate = useNavigate();

  const token = localStorage.getItem('token');
  const currentYear = new Date().getFullYear();

  const [parties, setParties] = useState([]);
  const [selectedPartyId, setSelectedPartyId] = useState(partyId || '');

  const [partyName, setPartyName] = useState('');
  const [partyPhone, setPartyPhone] = useState('');

  const [startDate, setStartDate] = useState(`${currentYear}-01-01`);
  const [endDate, setEndDate] = useState(`${currentYear}-12-31`);

  const [blocks, setBlocks] = useState([]);

  const [summary, setSummary] = useState({
    opening: 0,
    debit: 0,
    credit: 0,
    closing: 0,
  });

  const [searchText, setSearchText] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [loading, setLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  const [printSize, setPrintSize] = useState(
    localStorage.getItem('partyDetailLedgerPrintSize') || 'A5'
  );

  useEffect(() => {
    localStorage.setItem('partyDetailLedgerPrintSize', printSize);
  }, [printSize]);

  const selectedParty = useMemo(
    () => parties.find((p) => String(p._id) === String(selectedPartyId)),
    [parties, selectedPartyId]
  );

  const filteredParties = useMemo(() => {
    const q = String(partyName || '')
      .toLowerCase()
      .trim();

    return parties
      .filter((p) => {
        if (p.isActive === false || p.isDeleted === true) return false;

        if (!q) return true;

        return (
          String(p.name || '')
            .toLowerCase()
            .includes(q) ||
          String(p.phone || '').includes(q) ||
          String(p.email || '')
            .toLowerCase()
            .includes(q)
        );
      })
      .slice(0, 10);
  }, [parties, partyName]);

  const buildBlocks = useCallback((ledger = []) => {
    if (!Array.isArray(ledger)) return [];

    return ledger.map((row, index) => ({
      key: row.key || `${row._id || row.referenceId || index}-${index}`,

      sourceType: row.sourceType || '',
      sourceLabel: row.sourceLabel || row.sourceType || '-',

      billNo: row.billNo || '-',

      date: row.date,
      time: row.time || '',

      items: Array.isArray(row.items) ? row.items : [],

      debit: Number(row.debit || 0),
      credit: Number(row.credit || 0),
      balance: Number(row.balance || 0),

      description: row.description || '',
      paymentType: row.paymentType || '',

      documentTotal: Number(row.documentTotal || 0),
    }));
  }, []);

  const loadData = useCallback(
    async (id, start, end) => {
      if (!id) return;

      setLoading(true);

      try {
        const data = await getPartyDetailedLedger(id, start, end);

        setSelectedPartyId(data.partyId || id);
        setPartyName(data.partyName || '');
        setPartyPhone(data.partyPhone || '');

        setSummary({
          opening: Number(data.partyOpeningBalance ?? data.openingBalance ?? 0),
          debit: Number(data.totalDebit || 0),
          credit: Number(data.totalCredit || 0),
          closing: Number(data.closingBalance || 0),
        });

        setBlocks(buildBlocks(data.ledger || []));
      } catch (err) {
        console.error('Party detail ledger load failed:', err);

        alert(t('alerts.partyDetailLedgerLoadFailed'));

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
    [buildBlocks]
  );

  useEffect(() => {
    fetchParties()
      .then((data) => {
        setParties(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        console.error('Party list load failed:', err);

        setParties([]);
      });
  }, []);

  useEffect(() => {
    if (!partyId) return;
    if (parties.length === 0) return;

    const party = parties.find((p) => String(p._id) === String(partyId));

    if (!party) return;

    setSelectedPartyId(party._id);
    setPartyName(party.name || '');
    setPartyPhone(party.phone || '');

    loadData(party._id, startDate, endDate);
  }, [partyId, parties, startDate, endDate, loadData]);

  const filteredBlocks = useMemo(() => {
    const q = String(searchText || '')
      .toLowerCase()
      .trim();

    if (!q) return blocks;

    return blocks.filter((block) => {
      const matchBill = String(block.billNo || '')
        .toLowerCase()
        .includes(q);

      const matchSource = String(block.sourceLabel || '')
        .toLowerCase()
        .includes(q);

      const matchDescription = String(block.description || '')
        .toLowerCase()
        .includes(q);

      const matchPayment = String(block.paymentType || '')
        .toLowerCase()
        .includes(q);

      const matchItems =
        Array.isArray(block.items) &&
        block.items.some((item) =>
          String(item.productName || '')
            .toLowerCase()
            .includes(q)
        );

      return matchBill || matchSource || matchDescription || matchPayment || matchItems;
    });
  }, [blocks, searchText]);

  const buildPrintQuery = () =>
    new URLSearchParams({
      startDate: startDate || '',
      endDate: endDate || '',
      size: printSize || 'A5',
      lang: localStorage.getItem('lang') || 'ur',
    }).toString();

  const handleSelectParty = (party) => {
    setSelectedPartyId(party._id);
    setPartyName(party.name || '');
    setPartyPhone(party.phone || '');
    setShowSuggestions(false);

    navigate(`/party-ledger/${party._id}/detail`, { replace: true });

    loadData(party._id, startDate, endDate);
  };

  const handlePrint = async () => {
    if (!selectedPartyId) return;

    try {
      const query = buildPrintQuery();

      const response = await fetch(
        `${API}/api/print/party-detail-ledger/${selectedPartyId}/html?${query}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Print request failed');
      }

      const html = await response.text();

      const newWindow = window.open('', '_blank');

      if (!newWindow) {
        alert(t('alerts.printWindowBlocked'));
        return;
      }

      newWindow.document.write(html);
      newWindow.document.close();

      newWindow.onload = function () {
        newWindow.focus();
        newWindow.print();

        newWindow.onafterprint = function () {
          newWindow.close();
        };
      };
    } catch (error) {
      console.error('Print failed:', error);

      alert(t('alerts.printFailed'));
    }
  };

  const handlePdf = async () => {
    if (!selectedPartyId || pdfLoading) return;

    try {
      setPdfLoading(true);

      const query = buildPrintQuery();

      const response = await fetch(
        `${API}/api/print/party-detail-ledger/${selectedPartyId}/pdf?${query}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(t('alerts.pdfFailed'));
      }

      const blob = await response.blob();

      const url = window.URL.createObjectURL(blob);

      const link = document.createElement('a');

      const safeName = String(partyName || 'Party')
        .replace(/[^\w\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-');

      link.href = url;
      link.download = `${safeName || 'Party'}-Detail-Ledger.pdf`;

      document.body.appendChild(link);

      link.click();
      link.remove();

      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('PDF failed:', error);

      alert(t('alerts.pdfFailed'));
    } finally {
      setPdfLoading(false);
    }
  };

  const handleClear = () => {
    const start = `${currentYear}-01-01`;

    const end = `${currentYear}-12-31`;

    setStartDate(start);
    setEndDate(end);
    setSearchText('');

    if (selectedPartyId) {
      loadData(selectedPartyId, start, end);
    }
  };

  const applyQuickRange = (type) => {
    const today = new Date();

    today.setHours(0, 0, 0, 0);

    let start = null;
    let end = null;

    if (type === 'today') {
      start = new Date(today);
      end = new Date(today);
    }

    if (type === 'yesterday') {
      start = new Date(today);
      start.setDate(start.getDate() - 1);

      end = new Date(start);
    }

    if (type === 'this_month') {
      start = new Date(today.getFullYear(), today.getMonth(), 1);

      end = new Date(today);
    }

    if (type === 'last_month') {
      start = new Date(today.getFullYear(), today.getMonth() - 1, 1);

      end = new Date(today.getFullYear(), today.getMonth(), 0);
    }

    if (type === 'this_year') {
      start = new Date(today.getFullYear(), 0, 1);

      end = new Date(today);
    }

    if (!start || !end) return;

    const toYMD = (date) => {
      const year = date.getFullYear();

      const month = String(date.getMonth() + 1).padStart(2, '0');

      const day = String(date.getDate()).padStart(2, '0');

      return `${year}-${month}-${day}`;
    };

    const startValue = toYMD(start);
    const endValue = toYMD(end);

    setStartDate(startValue);
    setEndDate(endValue);

    if (selectedPartyId) {
      loadData(selectedPartyId, startValue, endValue);
    }
  };

  const renderAmount = (value) => {
    const num = Number(value);

    return Number.isFinite(num) ? num.toFixed(2) : '0.00';
  };

  return (
    <PageLayout
      title={<span className="no-print">{t('party.detailLedger')}</span>}
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
          <button onClick={() => navigate('/party-ledger')} style={grayButton}>
            ← {t('common.back')}
          </button>

          <div
            style={{
              position: 'relative',
            }}
          >
            <input
              placeholder={t('party.searchParty')}
              value={partyName}
              onChange={(e) => {
                setPartyName(e.target.value);

                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              style={inputStyle}
            />

            {showSuggestions && partyName && (
              <div style={suggestionBox}>
                {filteredParties.map((party) => (
                  <div
                    key={party._id}
                    onClick={() => handleSelectParty(party)}
                    style={suggestionItem}
                  >
                    <div
                      style={{
                        fontWeight: 700,
                      }}
                    >
                      {party.name}
                    </div>

                    {party.phone && (
                      <div
                        style={{
                          fontSize: 11,
                          color: '#6b7280',
                        }}
                      >
                        {party.phone}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={dateInput}
          />

          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={dateInput}
          />

          <button
            style={blueButton}
            disabled={!selectedPartyId}
            onClick={() => loadData(selectedPartyId, startDate, endDate)}
          >
            {t('common.load')}
          </button>

          <button style={redButton} onClick={handleClear}>
            {t('common.clear')}
          </button>

          <select
            value={printSize}
            onChange={(e) => setPrintSize(e.target.value)}
            style={smallSelect}
          >
            <option value="A5">A5</option>

            <option value="A4">A4</option>
          </select>

          <button style={purpleButton} disabled={!selectedPartyId} onClick={handlePrint}>
            🖨 {t('common.print')}
          </button>

          <button
            style={orangeButton}
            disabled={!selectedPartyId || pdfLoading}
            onClick={handlePdf}
          >
            {pdfLoading ? `⏳ ${t('common.pdf')}` : `📄 ${t('common.pdf')}`}
          </button>

          <button
            disabled={!selectedPartyId}
            onClick={() => setShowShareModal(true)}
            style={whatsappButton}
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
            style={smallSelect}
          >
            <option value="">{t('ledger.quickRange')}</option>

            <option value="today">{t('date.today')}</option>

            <option value="yesterday">{t('date.yesterday')}</option>

            <option value="this_month">{t('date.thisMonth')}</option>

            <option value="last_month">{t('date.lastMonth')}</option>

            <option value="this_year">{t('date.thisYear')}</option>
          </select>

          <input
            placeholder={t('party.searchBillItemSource')}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{
              ...inputStyle,

              width: window.innerWidth < 768 ? 140 : 260,
            }}
          />
        </div>
      }
      headerCards={
        <>
          <div className="card">
            <div
              style={{
                fontSize: 12,
                color: '#6b7280',
              }}
            >
              {t('ledger.opening')}
            </div>

            <div
              style={{
                fontWeight: 800,
              }}
            >
              {t('currency.rs')} {renderAmount(summary.opening)}
            </div>
          </div>

          <div className="card">
            <div
              style={{
                fontSize: 12,
                color: '#16a34a',
              }}
            >
              {t('common.debit')}
            </div>

            <div
              style={{
                fontWeight: 800,
              }}
            >
              {t('currency.rs')} {renderAmount(summary.debit)}
            </div>
          </div>

          <div className="card">
            <div
              style={{
                fontSize: 12,
                color: '#dc2626',
              }}
            >
              {t('common.credit')}
            </div>

            <div
              style={{
                fontWeight: 800,
              }}
            >
              {t('currency.rs')} {renderAmount(summary.credit)}
            </div>
          </div>

          <div className="card">
            <div
              style={{
                fontSize: 12,
                color: '#2563eb',
              }}
            >
              {t('ledger.closing')}
            </div>

            <div
              style={{
                fontWeight: 800,
              }}
            >
              {t('currency.rs')} {renderAmount(summary.closing)}
            </div>

            <div
              style={{
                marginTop: 6,
                fontSize: 12,
                fontWeight: 700,

                color:
                  summary.closing < 0 ? '#dc2626' : summary.closing > 0 ? '#16a34a' : '#6b7280',
              }}
            >
              {summary.closing < 0
                ? t('ledger.payable')
                : summary.closing > 0
                  ? t('ledger.receivable')
                  : t('ledger.settled')}
            </div>
          </div>
        </>
      }
    >
      {loading ? (
        <div
          style={{
            padding: 24,
            textAlign: 'center',
          }}
        >
          {t('common.loading')}
        </div>
      ) : !selectedPartyId ? (
        <div
          style={{
            padding: 30,
            textAlign: 'center',
            color: '#6b7280',
          }}
        >
          {t('party.selectToViewDetailLedger')}
        </div>
      ) : filteredBlocks.length === 0 ? (
        <div
          style={{
            padding: 30,
            textAlign: 'center',
            color: '#6b7280',
          }}
        >
          {t('party.noDetailLedgerEntries')}
        </div>
      ) : (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            overflowX: 'hidden',
          }}
        >
          {filteredBlocks.map((block) => (
            <div
              key={block.key}
              style={{
                border: '1px solid #e5e7eb',
                borderRadius: 10,
                padding: 10,
                marginBottom: 8,

                background: [
                  'opening_balance',
                  'opening_sale_invoice',
                  'opening_refund_invoice',
                  'opening_purchase_invoice',
                  'opening_purchase_return',
                ].includes(block.sourceType)
                  ? '#f3f4f6'
                  : block.items?.length
                    ? '#ffffff'
                    : '#f8fafc',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 10,
                  flexWrap: 'wrap',
                  fontWeight: 800,
                  marginBottom: 6,
                }}
              >
                <div>
                  {block.sourceLabel || '-'} #{block.billNo || '-'}
                </div>

                <div
                  style={{
                    color: '#475569',
                  }}
                >
                  {block.date ? new Date(block.date).toLocaleDateString() : '-'}

                  {block.time ? ` | ${block.time}` : ''}
                </div>
              </div>

              {block.description && (
                <div
                  style={{
                    fontSize: 12,
                    color: '#475569',
                    marginBottom: 6,
                  }}
                >
                  {block.description}
                </div>
              )}

              {Array.isArray(block.items) && block.items.length > 0 && (
                <div
                  style={{
                    overflowX: 'auto',
                    marginBottom: 6,
                  }}
                >
                  <table className="table w-full">
                    <thead>
                      <tr>
                        <th
                          style={{
                            width: '45%',
                          }}
                        >
                          {t('inventory.product')}
                        </th>

                        <th
                          style={{
                            width: '12%',
                          }}
                        >
                          {t('inventory.unit')}
                        </th>

                        <th
                          style={{
                            width: '12%',
                          }}
                        >
                          {t('common.qty')}
                        </th>

                        <th
                          style={{
                            width: '15%',
                          }}
                        >
                          {t('rate')}
                        </th>

                        <th
                          style={{
                            width: '16%',
                          }}
                        >
                          {t('common.total')}
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {block.items.map((item, index) => (
                        <tr key={index}>
                          <td>{item.productName || t('inventory.product')}</td>

                          <td>{item.unit || '-'}</td>

                          <td>{Number(item.quantity || 0)}</td>

                          <td>{renderAmount(item.rate)}</td>

                          <td>{renderAmount(item.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <table className="table w-full">
                <tbody>
                  <tr>
                    <td
                      align="right"
                      style={{
                        fontWeight: 700,
                      }}
                    >
                      {t('common.debit')}
                    </td>

                    <td align="right">{block.debit ? renderAmount(block.debit) : '-'}</td>
                  </tr>

                  <tr>
                    <td
                      align="right"
                      style={{
                        fontWeight: 700,
                      }}
                    >
                      {t('common.credit')}
                    </td>

                    <td align="right">{block.credit ? renderAmount(block.credit) : '-'}</td>
                  </tr>

                  <tr>
                    <td
                      align="right"
                      style={{
                        fontWeight: 800,
                      }}
                    >
                      {t('common.balance')}
                    </td>

                    <td
                      align="right"
                      style={{
                        fontWeight: 800,
                      }}
                    >
                      {renderAmount(block.balance)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      <WhatsAppShareModal
        open={showShareModal}
        onClose={() => setShowShareModal(false)}
        onSelect={(type) => {
          setShowShareModal(false);

          if (!selectedPartyId) {
            return;
          }

          const query = buildPrintQuery();

          const pdfUrl = `${API}/api/print/party-detail-ledger/${selectedPartyId}/pdf?${query}`;

          sendPdfToWhatsApp({
            phone: selectedParty?.phone || partyPhone,

            customerName: selectedParty?.name || partyName,

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
};

const inputStyle = {
  height: window.innerWidth < 768 ? 32 : 36,

  width: window.innerWidth < 768 ? 130 : 220,

  borderRadius: 8,
  border: '1px solid #93c5fd',
  padding: '0 10px',
  background: '#ffffff',
  fontWeight: 600,
};

const dateInput = {
  height: window.innerWidth < 768 ? 32 : 36,

  borderRadius: 8,
  border: '1px solid #93c5fd',
  padding: '0 10px',
  background: '#ffffff',
};

const smallSelect = {
  height: window.innerWidth < 768 ? 32 : 36,

  borderRadius: 8,
  border: '1px solid #93c5fd',
  padding: '0 10px',
  background: '#ffffff',
  fontWeight: 600,
};

const blueButton = {
  height: window.innerWidth < 768 ? 32 : 36,

  padding: '0 14px',
  borderRadius: 8,
  border: 'none',
  color: '#ffffff',
  fontWeight: 700,
  cursor: 'pointer',

  background: 'linear-gradient(135deg,#2563eb,#4f46e5)',
};

const purpleButton = {
  ...blueButton,

  background: 'linear-gradient(135deg,#6366f1,#4338ca)',
};

const orangeButton = {
  ...blueButton,

  background: 'linear-gradient(135deg,#f59e0b,#d97706)',
};

const redButton = {
  ...blueButton,

  background: 'linear-gradient(135deg,#ef4444,#f97316)',
};

const grayButton = {
  ...blueButton,
  background: '#6b7280',
};

const whatsappButton = {
  height: window.innerWidth < 768 ? 32 : 36,

  width: window.innerWidth < 768 ? 34 : 40,

  borderRadius: 8,
  border: 'none',
  cursor: 'pointer',

  background: 'linear-gradient(135deg,#25D366,#128C7E)',

  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const suggestionBox = {
  position: 'absolute',
  top: 40,
  left: 0,
  right: 0,

  background: '#ffffff',

  border: '1px solid #e5e7eb',

  borderRadius: 8,

  maxHeight: 220,
  overflowY: 'auto',

  zIndex: 100,

  boxShadow: '0 8px 20px rgba(0,0,0,0.12)',
};

const suggestionItem = {
  padding: '8px 10px',
  cursor: 'pointer',

  borderBottom: '1px solid #f1f5f9',
};

export default PartyDetailLedgerPage;
