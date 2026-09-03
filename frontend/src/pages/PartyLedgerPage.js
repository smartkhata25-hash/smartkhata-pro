import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import PageLayout from '../components/PageLayout';
import LedgerTable from '../components/LedgerTable';

import { fetchParties } from '../services/partyService';
import { fetchTravelParties } from '../services/travelMasterService';
import PartyLedgerHeader from '../components/PartyLedgerHeader';
import { getPartyLedger } from '../services/partyLedgerService';

import { t } from '../i18n/i18n';
import usePageMemory from '../hooks/usePageMemory';
const currentYear = new Date().getFullYear();

const PARTY_LEDGER_DEFAULTS = {
  selectedPartyId: '',
  partyName: '',
  startDate: `${currentYear}-01-01`,
  endDate: `${currentYear}-12-31`,
  search: '',
};

const PartyLedgerPage = () => {
  const { partyId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const moduleScope = searchParams.get('moduleScope') === 'travel' ? 'travel' : '';
  const isTravelLedger = moduleScope === 'travel';

  const [parties, setParties] = useState([]);
  const [ledger, setLedger] = useState([]);

  const [summary, setSummary] = useState({
    opening: 0,
    debit: 0,
    credit: 0,
    closing: 0,
  });

  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const { state: pageMemory, updateField: updatePageField } = usePageMemory(
    'party_ledger_page_state',
    PARTY_LEDGER_DEFAULTS,
    {
      expiryHours: 24,
      delay: 350,
    }
  );

  const { selectedPartyId, partyName, startDate, endDate, search } = pageMemory;

  const setSelectedPartyId = useCallback(
    (value) => updatePageField('selectedPartyId', value || ''),
    [updatePageField]
  );

  const setPartyName = useCallback(
    (value) => updatePageField('partyName', value || ''),
    [updatePageField]
  );

  const setStartDate = useCallback(
    (value) => updatePageField('startDate', value || ''),
    [updatePageField]
  );

  const setEndDate = useCallback(
    (value) => updatePageField('endDate', value || ''),
    [updatePageField]
  );

  const setSearch = useCallback(
    (value) => updatePageField('search', value || ''),
    [updatePageField]
  );

  useEffect(() => {
    const loadParties = isTravelLedger
      ? fetchTravelParties({ includeBalance: 'false' }, { forceRefresh: true })
      : fetchParties();

    Promise.resolve(loadParties)
      .then((data) => {
        setParties(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        console.error('Party load failed:', err);
        alert(t('alerts.partyListLoadFailed'));
      });
  }, [isTravelLedger]);

  const loadLedger = useCallback(
    async (id, start = startDate, end = endDate) => {
      if (!id) {
        setLedger([]);

        setSummary({
          opening: 0,
          debit: 0,
          credit: 0,
          closing: 0,
        });

        return;
      }

      setLoading(true);

      try {
        const data = await getPartyLedger(id, start || '', end || '', {
          moduleScope,
        });

        setLedger(Array.isArray(data?.ledger) ? data.ledger : []);

        setSummary({
          opening: Number(data?.openingBalance || 0),
          debit: Number(data?.totalDebit || 0),
          credit: Number(data?.totalCredit || 0),
          closing: Number(data?.closingBalance || 0),
        });

        setSelectedPartyId(data?.partyId || id);

        if (data?.partyName) {
          setPartyName(data.partyName);
        }
      } catch (err) {
        console.error('Party ledger load failed:', err);

        setLedger([]);

        setSummary({
          opening: 0,
          debit: 0,
          credit: 0,
          closing: 0,
        });

        alert(t('alerts.partyLedgerLoadFailed'));
      } finally {
        setLoading(false);
      }
    },
    [moduleScope, startDate, endDate, setSelectedPartyId, setPartyName]
  );

  useEffect(() => {
    if (!partyId) return;

    const selected = parties.find((party) => String(party._id) === String(partyId));

    setSelectedPartyId(selected?._id || partyId);

    if (selected?.name) {
      setPartyName(selected.name);
    }
  }, [partyId, parties, setSelectedPartyId, setPartyName]);

  useEffect(() => {
    if (!selectedPartyId) {
      setLedger([]);

      setSummary({
        opening: 0,
        debit: 0,
        credit: 0,
        closing: 0,
      });

      return;
    }

    const selected = parties.find((party) => String(party._id) === String(selectedPartyId));

    if (selected?.name) {
      setPartyName(selected.name);
    }

    loadLedger(selectedPartyId, startDate, endDate);
  }, [selectedPartyId, parties, startDate, endDate, loadLedger, setPartyName]);
  const totalDebit = summary.debit;
  const totalCredit = summary.credit;
  const closingBalance = summary.closing;
  const opening = summary.opening;

  const balanceStatus =
    closingBalance > 0
      ? t('ledger.receivable')
      : closingBalance < 0
        ? t('ledger.payable')
        : t('ledger.settled');

  const balanceColor = closingBalance > 0 ? '#16a34a' : closingBalance < 0 ? '#dc2626' : '#6b7280';

  const handleRowEdit = (entry) => {
    if (!entry) return;

    const type = entry.sourceType?.toLowerCase();

    if (['sale_invoice', 'opening_sale_invoice'].includes(type) && entry.invoiceId) {
      navigate(`/create-sale?invoiceId=${entry.invoiceId}`);

      return;
    }

    if (['purchase_invoice', 'opening_purchase_invoice'].includes(type) && entry.invoiceId) {
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

    if (['refund_invoice', 'opening_refund_invoice'].includes(type) && entry.invoiceId) {
      navigate(`/refunds/edit/${entry.invoiceId}`);

      return;
    }

    if (['purchase_return', 'opening_purchase_return'].includes(type) && entry.invoiceId) {
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
          load={(id, start, end) =>
            loadLedger(id || selectedPartyId, start ?? startDate, end ?? endDate)
          }
          setSearch={setSearch}
          navigate={navigate}
          totalDebit={totalDebit}
          totalCredit={totalCredit}
          closingBalance={closingBalance}
          balanceStatus={balanceStatus}
          balanceColor={balanceColor}
          isMobile={window.innerWidth <= 768}
          onBack={() => navigate(isTravelLedger ? '/travel/parties' : '/parties')}
          partyName={partyName}
          setPartyName={setPartyName}
          showSuggestions={showSuggestions}
          setShowSuggestions={setShowSuggestions}
          printSize="A5"
          moduleScope={moduleScope}
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
        {loading && (
          <div
            style={{
              padding: 20,
              textAlign: 'center',
            }}
          >
            {t('common.loading')}
          </div>
        )}

        {!loading && !selectedPartyId && (
          <div
            style={{
              padding: 30,
              textAlign: 'center',
              color: '#6b7280',
            }}
          >
            {t('party.selectToViewLedger')}
          </div>
        )}

        {!loading && selectedPartyId && ledger.length === 0 && (
          <div
            style={{
              padding: 30,
              textAlign: 'center',
              color: '#6b7280',
            }}
          >
            {t('ledger.noEntries')}
          </div>
        )}

        {!loading && selectedPartyId && ledger.length > 0 && (
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
            }}
          >
            <LedgerTable
              ledgerData={ledger}
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
