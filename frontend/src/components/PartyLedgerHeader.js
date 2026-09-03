import React from 'react';
import { useNavigate } from 'react-router-dom';
import { t } from '../i18n/i18n';
import { sendPdfToWhatsApp } from '../utils/whatsappPdf';
import WhatsAppShareModal from './WhatsAppShareModal';
import { FaWhatsapp } from 'react-icons/fa';

const API = process.env.REACT_APP_API_BASE_URL;

const PartyLedgerHeader = ({
  parties = [],
  partyId,
  setPartyId,
  start,
  end,
  setStart,
  setEnd,
  load,
  setSearch,
  totalDebit = 0,
  totalCredit = 0,
  closingBalance = 0,
  balanceStatus = '',
  balanceColor = '#2563eb',
  isMobile = false,
  onBack,
  partyName = '',
  setPartyName,
  showSuggestions,
  setShowSuggestions,
  printSize = 'A5',
  moduleScope = '',
}) => {
  const [showShareModal, setShowShareModal] = React.useState(false);
  const navigate = useNavigate();
  const [pdfLoading, setPdfLoading] = React.useState(false);

  const selectedParty = parties.find((p) => String(p._id) === String(partyId));

  const filteredParties = parties
    .filter((p) => (p.name || '').toLowerCase().includes((partyName || '').toLowerCase()))
    .slice(0, 10);

  const buildQuery = () => {
    const params = new URLSearchParams({
      startDate: start || '',
      endDate: end || '',
      size: printSize || 'A5',
      lang: localStorage.getItem('lang') || 'ur',
    });

    if (moduleScope) {
      params.set('moduleScope', moduleScope);
    }

    return params.toString();
  };

  const handleSelectParty = (party) => {
    setPartyName(party.name);
    setPartyId(party._id);
    setShowSuggestions(false);
    load(party._id, start, end);
  };

  const handlePrint = async () => {
    if (!partyId) return;

    const token = localStorage.getItem('token');
    const query = buildQuery();

    try {
      const response = await fetch(`${API}/api/print/party-ledger/${partyId}/html?${query}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const html = await response.text();
      const newWindow = window.open('', '_blank');

      if (!newWindow) {
        alert('Print window blocked');
        return;
      }

      newWindow.document.write(html);
      newWindow.document.close();

      newWindow.onload = function () {
        newWindow.print();
      };
    } catch (error) {
      alert('Print failed');
    }
  };

  const handlePdf = async () => {
    if (!partyId) return;

    const token = localStorage.getItem('token');
    const query = buildQuery();

    try {
      setPdfLoading(true);

      const response = await fetch(`${API}/api/print/party-ledger/${partyId}/pdf?${query}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('PDF failed');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      const link = document.createElement('a');
      const name = selectedParty?.name || partyName || 'Party';

      link.href = url;
      link.download = `${name.replace(/\s+/g, '-')}-Ledger.pdf`;

      document.body.appendChild(link);
      link.click();
      link.remove();

      window.URL.revokeObjectURL(url);
    } catch (error) {
      alert('PDF generate failed');
    } finally {
      setPdfLoading(false);
    }
  };

  const handleClear = () => {
    const currentYear = new Date().getFullYear();

    const startDate = `${currentYear}-01-01`;
    const endDate = `${currentYear}-12-31`;

    setSearch('');
    setStart(startDate);
    setEnd(endDate);

    if (partyId) {
      load(partyId, startDate, endDate);
    }
  };

  const handleDetailLedger = () => {
    if (!partyId) return;

    const params = new URLSearchParams();

    if (moduleScope) {
      params.set('moduleScope', moduleScope);
    }

    navigate(`/party-ledger/${partyId}/detail${params.toString() ? `?${params}` : ''}`);
  };

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
        {isMobile && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              position: 'relative',
            }}
          >
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

            <input
              placeholder={t('party.search')}
              value={partyName}
              onChange={(e) => {
                setPartyName(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              style={{
                height: 32,
                width: 95,
                borderRadius: 8,
                border: '1px solid #93c5fd',
                padding: '0 6px',
                fontSize: 12,
              }}
            />

            {showSuggestions && partyName && (
              <div
                style={{
                  position: 'absolute',
                  top: 36,
                  left: 35,
                  right: 0,
                  background: '#ffffff',
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                  maxHeight: 150,
                  overflowY: 'auto',
                  zIndex: 50,
                }}
              >
                {filteredParties.map((p) => (
                  <div
                    key={p._id}
                    onClick={() => handleSelectParty(p)}
                    style={{
                      padding: '6px',
                      cursor: 'pointer',
                    }}
                  >
                    {p.name}
                  </div>
                ))}
              </div>
            )}

            <button
              className="btn btn-primary"
              style={{ height: 32, padding: '0 6px', fontSize: 11 }}
              disabled={!partyId}
              onClick={handlePrint}
            >
              🖨️
            </button>

            <button
              className={`btn ${pdfLoading ? 'bg-gray-400 cursor-not-allowed' : 'btn-primary'}`}
              style={{ height: 32, padding: '0 6px', fontSize: 11 }}
              disabled={!partyId || pdfLoading}
              onClick={handlePdf}
            >
              {pdfLoading ? '⏳' : t('pdf')}
            </button>

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
              disabled={!partyId}
              onClick={handleDetailLedger}
            >
              📊
            </button>

            <button
              disabled={!partyId}
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

        {isMobile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              placeholder="Search..."
              onChange={(e) => setSearch(e.target.value)}
              style={{
                height: 32,
                width: 110,
                borderRadius: 8,
                border: '1px solid #93c5fd',
                padding: '0 6px',
                fontSize: 12,
              }}
            />

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

            <button
              style={mobileBlueButton}
              onClick={() => {
                if (!partyId) return;
                load(partyId, start, end);
              }}
            >
              {t('load')}
            </button>

            <button style={mobileRedButton} onClick={handleClear}>
              ✖
            </button>
          </div>
        )}

        {!isMobile && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
              flex: 1,
              position: 'relative',
            }}
          >
            <button
              className="btn btn-primary"
              style={{ height: 36 }}
              disabled={!partyId}
              onClick={handlePrint}
            >
              {t('print')}
            </button>

            <button
              className={`btn ${pdfLoading ? 'bg-gray-400 cursor-not-allowed' : 'btn-primary'}`}
              style={{ height: 36 }}
              disabled={!partyId || pdfLoading}
              onClick={handlePdf}
            >
              {pdfLoading ? `⏳ ${t('pdf.preparing')}` : t('pdf')}
            </button>

            <input
              placeholder={t('party.search')}
              value={partyName}
              onChange={(e) => {
                setPartyName(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              style={{
                height: 36,
                width: 220,
                borderRadius: 8,
                border: '1px solid #93c5fd',
                padding: '0 12px',
                fontSize: 14,
              }}
            />

            {showSuggestions && partyName && (
              <div
                style={{
                  position: 'absolute',
                  top: 40,
                  left: 145,
                  width: 220,
                  background: '#ffffff',
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                  maxHeight: 180,
                  overflowY: 'auto',
                  zIndex: 50,
                }}
              >
                {filteredParties.map((p) => (
                  <div
                    key={p._id}
                    onClick={() => handleSelectParty(p)}
                    style={{
                      padding: '8px',
                      cursor: 'pointer',
                    }}
                  >
                    {p.name}
                  </div>
                ))}
              </div>
            )}

            <input
              placeholder={t('ledger.searchLedger')}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                height: 36,
                width: 260,
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
              style={desktopDateInput}
            />

            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              style={desktopDateInput}
            />

            <button
              style={desktopBlueButton}
              onClick={() => {
                if (!partyId) return;
                load(partyId, start, end);
              }}
            >
              {t('load')}
            </button>

            <button style={desktopRedButton} onClick={handleClear}>
              {t('common.clear')}
            </button>

            <button style={desktopDetailButton} disabled={!partyId} onClick={handleDetailLedger}>
              {t('ledger.detailLedger')}
            </button>

            <button
              disabled={!partyId}
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
              Rs. {Number(totalDebit || 0).toFixed(2)}
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
              Rs. {Number(totalCredit || 0).toFixed(2)}
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
              Rs. {Number(closingBalance || 0).toFixed(2)}
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

          if (!partyId) return;

          const queryParams = new URLSearchParams({
            startDate: start || '',
            endDate: end || '',
            size: printSize || 'A5',
          });

          if (moduleScope) {
            queryParams.set('moduleScope', moduleScope);
          }

          const query = queryParams.toString();

          const pdfUrl = `${API}/api/print/party-ledger/${partyId}/pdf?${query}`;
          const token = localStorage.getItem('token');

          sendPdfToWhatsApp({
            phone: selectedParty?.phone || selectedParty?.mobile,
            customerName: selectedParty?.name || partyName,
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

const mobileBlueButton = {
  height: 32,
  padding: '0 8px',
  borderRadius: 8,
  background: 'linear-gradient(135deg, #6366f1, #3b82f6)',
  border: 'none',
  color: '#ffffff',
  fontWeight: 600,
  fontSize: 11,
};

const mobileRedButton = {
  height: 32,
  padding: '0 8px',
  borderRadius: 8,
  background: 'linear-gradient(135deg, #ef4444, #f97316)',
  border: 'none',
  color: '#ffffff',
  fontWeight: 600,
  fontSize: 11,
};

const desktopDateInput = {
  height: 36,
  width: 120,
  borderRadius: 8,
  border: '1px solid #93c5fd',
  padding: '0 10px',
  background: '#ffffff',
};

const desktopBlueButton = {
  height: 36,
  padding: '0 10px',
  borderRadius: 10,
  background: 'linear-gradient(135deg, #6366f1, #3b82f6)',
  border: 'none',
  color: '#ffffff',
  fontWeight: 600,
  cursor: 'pointer',
};

const desktopRedButton = {
  height: 36,
  padding: '0 10px',
  borderRadius: 10,
  background: 'linear-gradient(135deg, #ef4444, #f97316)',
  border: 'none',
  color: '#ffffff',
  fontWeight: 600,
  cursor: 'pointer',
};

const desktopDetailButton = {
  height: 36,
  padding: '0 10px',
  borderRadius: 10,
  background: 'linear-gradient(135deg, #0ea5e9, #6366f1)',
  border: 'none',
  color: '#ffffff',
  fontWeight: 600,
};

export default PartyLedgerHeader;
