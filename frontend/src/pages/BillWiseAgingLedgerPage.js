import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import PageLayout from '../components/PageLayout';
import { getCurrentLanguage, t } from '../i18n/i18n';
import {
  getCustomerBillWiseAging,
  getPartyBillWiseAging,
} from '../services/billWiseAgingService';

const API = process.env.REACT_APP_API_BASE_URL;

const formatAmount = (value) =>
  Number(value || 0).toLocaleString('en-PK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatDateKey = (value) => {
  if (!value) return '-';
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return String(value);

  return `${match[3]}/${match[2]}/${match[1]}`;
};

const getBucketLabel = (bucket) => {
  switch (bucket) {
    case 'days31to60':
      return t('agingLedger.days31to60');
    case 'days61to90':
      return t('agingLedger.days61to90');
    case 'days90plus':
      return t('agingLedger.days90plus');
    default:
      return t('agingLedger.days0to30');
  }
};

const BillWiseAgingLedgerPage = ({ entityType }) => {
  const { customerId, partyId } = useParams();
  const navigate = useNavigate();
  const entityId = entityType === 'party' ? partyId : customerId;
  const isParty = entityType === 'party';
  const [asOfDate, setAsOfDate] = useState('');
  const [printSize, setPrintSize] = useState(
    localStorage.getItem('billWiseAgingPrintSize') || 'A4'
  );
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [error, setError] = useState('');

  const loadReport = useCallback(async () => {
    if (!entityId) return;

    setLoading(true);
    setError('');

    try {
      const params = {};
      if (asOfDate) params.asOfDate = asOfDate;

      const data = isParty
        ? await getPartyBillWiseAging(entityId, params)
        : await getCustomerBillWiseAging(entityId, params);

      setReport(data);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || t('agingLedger.loadFailed'));
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [asOfDate, entityId, isParty]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  useEffect(() => {
    localStorage.setItem('billWiseAgingPrintSize', printSize);
  }, [printSize]);

  const rows = Array.isArray(report?.rows) ? report.rows : [];
  const summary = report?.summary || {};
  const buckets = summary.buckets || {};
  const title = isParty ? t('agingLedger.partyTitle') : t('agingLedger.customerTitle');
  const entityLabel = isParty ? t('party.party') : t('customer');
  const backPath = isParty ? `/party-ledger/${entityId}` : `/customer-ledger/${entityId}`;

  const printQuery = useMemo(() => {
    const params = new URLSearchParams({
      asOfDate: report?.asOfDate || asOfDate || '',
      size: printSize,
      lang: getCurrentLanguage(),
    });

    return params.toString();
  }, [asOfDate, printSize, report?.asOfDate]);

  const handlePrint = async () => {
    if (!entityId) return;

    const token = localStorage.getItem('token');
    const response = await fetch(
      `${API}/api/bill-wise-aging/${entityType}/${entityId}/html?${printQuery}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(t('alerts.printFailed'));
    }

    const html = await response.text();
    const printWindow = window.open('', '_blank');

    if (!printWindow) {
      alert(t('alerts.printWindowBlocked'));
      return;
    }

    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.onload = function () {
      printWindow.print();
    };
  };

  const handlePdf = async () => {
    if (!entityId || pdfLoading) return;

    const token = localStorage.getItem('token');

    try {
      setPdfLoading(true);

      const response = await fetch(
        `${API}/api/bill-wise-aging/${entityType}/${entityId}/pdf?${printQuery}`,
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
      const safeName = (report?.entity?.name || title).replace(/\s+/g, '-');

      link.href = url;
      link.download = `${safeName}-Aging-Ledger.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.message || t('alerts.pdfFailed'));
    } finally {
      setPdfLoading(false);
    }
  };

  const headerContent = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexWrap: 'wrap',
        background: '#eef2ff',
        border: '1px solid #c7d2fe',
        borderRadius: 14,
        padding: '10px 14px',
      }}
    >
      <button
        onClick={() => navigate(backPath)}
        style={{
          height: 36,
          padding: '0 12px',
          borderRadius: 10,
          border: '1px solid #d1d5db',
          background: '#ffffff',
          fontWeight: 700,
        }}
      >
        {t('back')}
      </button>

      <div style={{ minWidth: 190 }}>
        <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 700 }}>{entityLabel}</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: '#111827' }}>
          {report?.entity?.name || '-'}
        </div>
      </div>

      <input
        type="date"
        value={asOfDate}
        onChange={(event) => setAsOfDate(event.target.value)}
        title={t('agingLedger.asOfDate')}
        style={{
          height: 36,
          borderRadius: 8,
          border: '1px solid #93c5fd',
          padding: '0 10px',
          background: '#ffffff',
        }}
      />

      <select
        value={printSize}
        onChange={(event) => setPrintSize(event.target.value)}
        style={{
          height: 36,
          borderRadius: 8,
          border: '1px solid #93c5fd',
          padding: '0 10px',
          background: '#ffffff',
          fontWeight: 700,
        }}
      >
        <option value="A4">A4</option>
        <option value="A5">A5</option>
      </select>

      <button className="btn btn-primary" style={{ height: 36 }} onClick={loadReport}>
        {t('load')}
      </button>

      <button className="btn btn-primary" style={{ height: 36 }} onClick={handlePrint}>
        {t('print')}
      </button>

      <button
        className={`btn ${pdfLoading ? 'bg-gray-400 cursor-not-allowed' : 'btn-primary'}`}
        style={{ height: 36 }}
        disabled={pdfLoading}
        onClick={handlePdf}
      >
        {pdfLoading ? t('pdf.preparing') : t('pdf')}
      </button>
    </div>
  );

  const headerCards = (
    <>
      <SummaryCard label={t('agingLedger.totalOutstanding')} value={summary.totalOutstanding} />
      <SummaryCard label={t('agingLedger.days0to30')} value={buckets.days0to30} />
      <SummaryCard label={t('agingLedger.days31to60')} value={buckets.days31to60} />
      <SummaryCard label={t('agingLedger.days61to90')} value={buckets.days61to90} />
      <SummaryCard label={t('agingLedger.days90plus')} value={buckets.days90plus} />
    </>
  );

  return (
    <PageLayout headerContent={headerContent} headerCards={headerCards}>
      <div style={{ padding: 14, overflow: 'auto' }}>
        <div style={{ marginBottom: 10 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#111827' }}>
            {title}
          </h1>
          <div style={{ color: '#6b7280', fontWeight: 600 }}>
            {t('agingLedger.asOfDate')}: {formatDateKey(report?.asOfDate)}
          </div>
        </div>

        {loading && (
          <div className="card" style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>
            {t('common.loading')}
          </div>
        )}

        {!loading && error && (
          <div className="card" style={{ padding: 18, color: '#dc2626', fontWeight: 700 }}>
            {error}
          </div>
        )}

        {!loading && !error && (
          <div className="card" style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', minWidth: 900, tableLayout: 'fixed' }}>
              <thead>
                <tr>
                  <th style={{ width: '13%' }}>{t('billNo')}</th>
                  <th style={{ width: '13%' }}>{t('agingLedger.invoiceDate')}</th>
                  <th style={{ width: '13%' }}>{t('agingLedger.dueDate')}</th>
                  <th style={{ width: '12%' }}>{t('agingLedger.days')}</th>
                  <th style={{ width: '13%' }}>{t('agingLedger.bucket')}</th>
                  <th style={{ width: '16%' }}>{t('agingLedger.originalAmount')}</th>
                  <th style={{ width: '16%' }}>{t('agingLedger.paidAdjusted')}</th>
                  <th style={{ width: '16%' }}>{t('agingLedger.outstanding')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', padding: 24 }}>
                      {t('agingLedger.noOutstandingBills')}
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.invoiceId}>
                      <td style={{ fontWeight: 700, color: '#1d4ed8' }}>{row.billNo || '-'}</td>
                      <td>{formatDateKey(row.invoiceDateKey)}</td>
                      <td>{row.dueDateKey ? formatDateKey(row.dueDateKey) : '-'}</td>
                      <td>
                        <span style={{ fontWeight: 700 }}>
                          {row.daysType === 'overdue'
                            ? t('agingLedger.overdueDays')
                            : t('agingLedger.ageDays')}
                        </span>
                        : {row.days}
                      </td>
                      <td>{getBucketLabel(row.bucket)}</td>
                      <td style={amountCell}>{formatAmount(row.originalAmount)}</td>
                      <td style={amountCell}>{formatAmount(row.paidAdjusted)}</td>
                      <td style={{ ...amountCell, fontWeight: 800, color: '#dc2626' }}>
                        {formatAmount(row.outstanding)}
                      </td>
                    </tr>
                  ))
                )}
                {rows.length > 0 && (
                  <tr className="totals-row">
                    <td colSpan="5" style={{ textAlign: 'right', fontWeight: 800 }}>
                      {t('totals')}
                    </td>
                    <td style={amountCell}>{formatAmount(summary.originalTotal)}</td>
                    <td style={amountCell}>{formatAmount(summary.paidAdjustedTotal)}</td>
                    <td style={{ ...amountCell, fontWeight: 800 }}>
                      {formatAmount(summary.totalOutstanding)}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PageLayout>
  );
};

const amountCell = {
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
};

const SummaryCard = ({ label, value }) => (
  <div className="card" style={{ minWidth: 118, padding: '8px 10px' }}>
    <div style={{ fontSize: 12, color: '#4b5563', fontWeight: 700 }}>{label}</div>
    <div style={{ fontSize: 16, fontWeight: 800, color: '#111827' }}>
      Rs. {formatAmount(value)}
    </div>
  </div>
);

export default BillWiseAgingLedgerPage;
