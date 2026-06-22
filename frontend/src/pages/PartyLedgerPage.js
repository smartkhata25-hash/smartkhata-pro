import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import PageLayout from '../components/PageLayout';
import LedgerTable from '../components/LedgerTable';

import { fetchParties } from '../services/partyService';
import PartyLedgerHeader from '../components/PartyLedgerHeader';
import { getPartyLedger } from '../services/partyLedgerService';

import { t } from '../i18n/i18n';

const PartyLedgerPage = () => {
  const { partyId } = useParams();
  const navigate = useNavigate();

  const [parties, setParties] = useState([]);
  const [selectedPartyId, setSelectedPartyId] = useState(partyId || '');
  const [partyName, setPartyName] = useState('');
  const [ledger, setLedger] = useState([]);
  const [opening, setOpening] = useState(0);

  const currentYear = new Date().getFullYear();

  const [startDate, setStartDate] = useState(`${currentYear}-01-01`);
  const [endDate, setEndDate] = useState(`${currentYear}-12-31`);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    fetchParties()
      .then((data) => setParties(Array.isArray(data) ? data : []))
      .catch((err) => {
        console.error('Party load failed:', err);
        alert(t('alerts.partyListLoadFailed'));
      });
  }, []);

  const loadLedger = useCallback(
    async (id = selectedPartyId, start = startDate, end = endDate) => {
      if (!id) return;

      setLoading(true);

      try {
        const data = await getPartyLedger(id, start, end);
        setLedger(Array.isArray(data.ledger) ? data.ledger : []);
        setOpening(Number(data.openingBalance || 0));
        setPartyName(data.partyName || '');
        setSelectedPartyId(data.partyId || id);
      } catch (err) {
        console.error('Party ledger load failed:', err);
        setLedger([]);
        setOpening(0);
        alert(t('alerts.partyLedgerLoadFailed'));
      }

      setLoading(false);
    },
    [selectedPartyId, startDate, endDate]
  );

  useEffect(() => {
    if (!partyId) return;
    if (parties.length === 0) return;

    const selected = parties.find((p) => p._id === partyId);

    if (selected) {
      setSelectedPartyId(selected._id);
      setPartyName(selected.name);
      loadLedger(selected._id, startDate, endDate);
    }
  }, [partyId, parties, loadLedger, startDate, endDate]);

  const dateFilteredLedger = ledger;

  const totalDebit = dateFilteredLedger.reduce((sum, e) => sum + Number(e.debit || 0), 0);
  const totalCredit = dateFilteredLedger.reduce((sum, e) => sum + Number(e.credit || 0), 0);

  const closingBalance =
    dateFilteredLedger.length > 0
      ? Number(dateFilteredLedger[dateFilteredLedger.length - 1].runningBalance || 0)
      : opening;

  const balanceStatus =
    closingBalance > 0
      ? t('ledger.receivable')
      : closingBalance < 0
        ? t('ledger.payable')
        : t('ledger.settled');

  const balanceColor = closingBalance > 0 ? '#16a34a' : closingBalance < 0 ? '#dc2626' : '#6b7280';

  const handleRowEdit = (entry) => {
    const type = entry.sourceType?.toLowerCase();

    if (type === 'sale_invoice' && entry.invoiceId) {
      navigate(`/create-sale?invoiceId=${entry.invoiceId}`);
      return;
    }

    if (type === 'purchase_invoice' && entry.invoiceId) {
      navigate(`/purchase-invoice/${entry.invoiceId}`);
      return;
    }

    if (type === 'receive_payment' && entry.referenceId) {
      navigate(`/receive-payments/edit/${entry.referenceId}`);
      return;
    }

    if (type === 'pay_bill' && entry.referenceId) {
      navigate(`/pay-bills/edit/${entry.referenceId}`);
      return;
    }

    if (type === 'refund_invoice' && entry.invoiceId) {
      navigate(`/refunds/edit/${entry.invoiceId}`);
      return;
    }

    if (type === 'purchase_return' && entry.invoiceId) {
      navigate(`/purchase-returns/edit/${entry.invoiceId}`);
      return;
    }

    alert(t('alerts.entryNotEditable'));
  };

  return (
    <PageLayout
      headerContent={
        <PartyLedgerHeader
          parties={parties}
          partyId={selectedPartyId}
          setPartyId={setSelectedPartyId}
          start={startDate}
          end={endDate}
          setStart={setStartDate}
          setEnd={setEndDate}
          load={loadLedger}
          setSearch={setSearch}
          navigate={navigate}
          totalDebit={totalDebit}
          totalCredit={totalCredit}
          closingBalance={closingBalance}
          balanceStatus={balanceStatus}
          balanceColor={balanceColor}
          isMobile={window.innerWidth <= 768}
          onBack={() => navigate('/parties')}
          partyName={partyName}
          setPartyName={setPartyName}
          showSuggestions={showSuggestions}
          setShowSuggestions={setShowSuggestions}
          printSize="A5"
        />
      }
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        {loading && <div style={{ padding: 20, textAlign: 'center' }}>{t('common.loading')}</div>}

        {!loading && !selectedPartyId && (
          <div style={{ padding: 30, textAlign: 'center', color: '#6b7280' }}>
            {t('party.selectToViewLedger')}
          </div>
        )}

        {!loading && selectedPartyId && ledger.length === 0 && (
          <div style={{ padding: 30, textAlign: 'center', color: '#6b7280' }}>
            {t('ledger.noEntries')}
          </div>
        )}

        {!loading && selectedPartyId && ledger.length > 0 && (
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            <LedgerTable
              ledgerData={dateFilteredLedger}
              search={search}
              openingBalance={opening}
              onDelete={null}
              onEdit={handleRowEdit}
              onRowClick={handleRowEdit}
            />
          </div>
        )}
      </div>
    </PageLayout>
  );
};

export default PartyLedgerPage;
