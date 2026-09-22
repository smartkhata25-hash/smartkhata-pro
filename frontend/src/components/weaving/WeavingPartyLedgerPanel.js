import React, { useEffect, useState } from 'react';
import {
  FaArrowLeft,
  FaDownload,
  FaEdit,
  FaExternalLinkAlt,
  FaPrint,
  FaSpinner,
  FaWhatsapp,
} from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import WeavingRecordDetailModal from './WeavingRecordDetailModal';
import { useWeavingFeedback } from './WeavingFeedbackModal';

import {
  downloadCounterpartyLedgerPdf,
  getCounterpartyLedger,
  getCounterpartyLedgerOutputUrl,
  getWeavingJournalById,
  openCounterpartyLedgerPrint,
} from '../../services/weavingCommercialService';

import { hasPermission } from '../../utils/permissionHelper';
import { sendWhatsAppReminder } from '../../utils/whatsapp';
import { sendPdfToWhatsApp } from '../../utils/whatsappPdf';

const control =
  'h-9 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100';

const money = (value) =>
  `Rs. ${Number(value || 0).toLocaleString('en-PK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export default function WeavingPartyLedgerPanel({ party, onBack, onEdit, fullPage = false }) {
  const navigate = useNavigate();

  const [dates, setDates] = useState({
    from: '',
    to: '',
  });

  const [applied, setApplied] = useState({
    from: '',
    to: '',
  });

  const [ledger, setLedger] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useWeavingFeedback(error, setError, { type: 'error' });
  const [journalDetail, setJournalDetail] = useState(null);

  const openLedgerSource = async (row) => {
    const source = row.source || { kind: 'journal', id: row._id, journalId: row._id };
    const deny = (permission) => {
      if (hasPermission(permission)) return false;
      setError('You do not have permission to view this source record.');
      return true;
    };

    if (source.kind === 'opening') {
      if (deny('weaving.counterparties.edit')) return;
      if (onEdit) {
        onEdit({ focus: 'opening' });
        return;
      }
      const partyTab = party.serviceTypes?.includes('sizing') ? 'sizing' : party.role || 'both';
      navigate(`/weaving/parties?tab=${partyTab}&edit=${party._id}&focus=opening`);
      return;
    }
    if (source.kind === 'purchase') {
      if (deny('weaving.purchases.view')) return;
      const purchaseTab =
        source.purchaseType === 'yarn' || source.purchaseType === 'fabric'
          ? source.purchaseType
          : 'general';
      navigate(`/weaving/purchase?tab=${purchaseTab}&purchaseId=${source.id}`);
      return;
    }
    if (source.kind === 'payment') {
      if (deny('weaving.payments.view')) return;
      navigate(`/weaving/payments?tab=history&transactionId=${source.id}`);
      return;
    }
    if (source.kind === 'sale_invoice') {
      if (deny('weaving.sales.view')) return;
      navigate(`/weaving/sales-settlement?tab=invoices&invoiceId=${source.id}`);
      return;
    }
    if (source.kind === 'sizing_bill') {
      if (deny('weaving.sizing.view')) return;
      navigate(`/weaving/sizing?tab=receiving&billId=${source.id}`);
      return;
    }

    try {
      setError('');
      setJournalDetail(await getWeavingJournalById(source.journalId || row._id));
    } catch (reason) {
      setError(
        reason.response?.status === 404
          ? 'Source record is no longer available.'
          : reason.response?.data?.message || 'Could not open source record.'
      );
    }
  };

  useEffect(() => {
    if (!party?._id) {
      setLedger(null);
      return;
    }

    let current = true;

    setLoading(true);
    setError('');

    getCounterpartyLedger(party._id, applied)
      .then((data) => {
        if (current) {
          setLedger(data);
        }
      })
      .catch((reason) => {
        if (current) {
          setError(reason.response?.data?.message || 'Could not load ledger');
        }
      })
      .finally(() => {
        if (current) {
          setLoading(false);
        }
      });

    return () => {
      current = false;
    };
  }, [party?._id, applied]);

  if (!party) {
    return (
      <div className="flex min-h-[430px] items-center justify-center rounded-md border bg-white text-slate-400">
        Select a party to open its ledger
      </div>
    );
  }

  const params = applied;

  const shareBalance = () =>
    party.phone
      ? sendWhatsAppReminder({
          phone: party.phone,
          customerName: party.name,
          balance: Math.abs(ledger?.summary?.closing || 0).toLocaleString(),
          businessName: 'Smart Khata',
          lang: 'en',
        })
      : setError('Add a phone number before using WhatsApp');

  const sharePdf = () =>
    party.phone
      ? sendPdfToWhatsApp({
          phone: party.phone,
          customerName: party.name,
          balance: Math.abs(ledger?.summary?.closing || 0).toLocaleString(),
          businessName: 'Smart Khata',
          lang: 'en',
          pdfUrl: getCounterpartyLedgerOutputUrl(party._id, 'pdf', params),
          token: localStorage.getItem('token'),
        })
      : setError('Add a phone number before using WhatsApp');

  const summaryItems = ledger
    ? [
        ['Opening', ledger.summary.opening],
        ['Debit', ledger.summary.debit],
        ['Credit', ledger.summary.credit],
        ['Closing', ledger.summary.closing],
      ]
    : [];

  return (
    <section className="min-w-0 overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
      {/* NAME + SUMMARY + ACTIONS */}
      <div className="flex min-h-[48px] flex-wrap items-center gap-2 border-b bg-gradient-to-r from-teal-50 via-emerald-50 to-blue-50 px-3 py-1.5">
        {onBack && (
          <button
            type="button"
            title="Back to Parties"
            aria-label="Back to Parties"
            onClick={onBack}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-600 hover:bg-white"
          >
            <FaArrowLeft />
          </button>
        )}

        {/* PARTY NAME ONLY */}
        <div className="min-w-[120px] max-w-[220px] shrink-0">
          <h2 className="truncate text-base font-bold text-slate-900" title={party.name}>
            {party.name}
          </h2>
        </div>

        {/* COMPACT SUMMARY */}
        {loading ? (
          <div className="flex h-8 flex-1 items-center justify-center">
            <FaSpinner className="animate-spin text-lg text-teal-700" />
          </div>
        ) : ledger ? (
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            {summaryItems.map(([label, value]) => (
              <div
                key={label}
                className="flex h-9 min-w-[112px] items-center gap-2 rounded-md border border-slate-200 bg-white/90 px-2.5"
              >
                <span className="text-[10px] font-semibold uppercase text-slate-500">{label}</span>

                <span className="ml-auto whitespace-nowrap text-xs font-bold text-slate-900">
                  {money(value)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex-1" />
        )}

        {/* ACTIONS */}
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          {onEdit && (
            <button
              type="button"
              title="Edit"
              aria-label="Edit"
              onClick={onEdit}
              className="flex h-8 w-8 items-center justify-center rounded-md text-blue-700 hover:bg-white"
            >
              <FaEdit />
            </button>
          )}

          <button
            type="button"
            title="WhatsApp balance"
            aria-label="WhatsApp balance"
            onClick={shareBalance}
            disabled={!party.phone}
            className="flex h-8 w-8 items-center justify-center rounded-md text-emerald-700 hover:bg-white disabled:opacity-35"
          >
            <FaWhatsapp />
          </button>

          {!fullPage && (
            <button
              type="button"
              title="Open Full Ledger"
              aria-label="Open Full Ledger"
              onClick={() => navigate(`/weaving/party-ledger?partyId=${party._id}`)}
              className="flex h-8 w-8 items-center justify-center rounded-md text-teal-700 hover:bg-white"
            >
              <FaExternalLinkAlt />
            </button>
          )}
        </div>
      </div>

      {/* DATE FILTER + PRINT / PDF */}
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <input
          type="date"
          aria-label="From date"
          title="From date"
          className={`${control} w-[170px]`}
          value={dates.from}
          onChange={(event) =>
            setDates({
              ...dates,
              from: event.target.value,
            })
          }
        />

        <input
          type="date"
          aria-label="To date"
          title="To date"
          className={`${control} w-[170px]`}
          value={dates.to}
          onChange={(event) =>
            setDates({
              ...dates,
              to: event.target.value,
            })
          }
        />

        <button
          type="button"
          onClick={() => setApplied(dates)}
          className="h-9 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
        >
          Load
        </button>

        <button
          type="button"
          onClick={() => {
            setDates({
              from: '',
              to: '',
            });

            setApplied({
              from: '',
              to: '',
            });
          }}
          className="h-9 rounded-md border px-3 text-sm text-slate-700 hover:bg-slate-50"
        >
          Clear
        </button>

        <div className="ml-auto flex gap-1">
          <button
            type="button"
            title="Print"
            aria-label="Print"
            onClick={() => openCounterpartyLedgerPrint(party._id, params)}
            className="flex h-9 w-9 items-center justify-center rounded-md border text-slate-700 hover:bg-slate-50"
          >
            <FaPrint />
          </button>

          <button
            type="button"
            title="Download PDF"
            aria-label="Download PDF"
            onClick={() => downloadCounterpartyLedgerPdf(party._id, params)}
            className="flex h-9 w-9 items-center justify-center rounded-md border text-blue-700 hover:bg-blue-50"
          >
            <FaDownload />
          </button>

          <button
            type="button"
            title="Share Ledger PDF"
            aria-label="Share Ledger PDF"
            disabled={!party.phone}
            onClick={sharePdf}
            className="flex h-9 w-9 items-center justify-center rounded-md border text-emerald-700 hover:bg-emerald-50 disabled:opacity-35"
          >
            <FaWhatsapp />
          </button>
        </div>
      </div>

      {/* ERROR */}

      {/* LEDGER TABLE */}
      {loading && !ledger ? (
        <div className="flex h-48 items-center justify-center">
          <FaSpinner className="animate-spin text-2xl text-teal-700" />
        </div>
      ) : ledger ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-teal-50 text-xs uppercase text-slate-700">
              <tr>
                {['Date', 'Ref', 'Type', 'Description', 'Debit', 'Credit', 'Balance'].map(
                  (heading) => (
                    <th
                      key={heading}
                      className={`border-y border-r border-teal-100 px-3 py-2.5 text-left ${
                        ['Debit', 'Credit', 'Running Balance'].includes(heading) ? 'text-right' : ''
                      }`}
                    >
                      {heading}
                    </th>
                  )
                )}
              </tr>
            </thead>

            <tbody>
              {ledger.rows.length ? (
                ledger.rows.map((row) => (
                  <tr
                    key={row._id}
                    tabIndex={0}
                    role="button"
                    aria-label={`Open source for ${row.description || row.type || 'ledger transaction'}`}
                    onClick={() => openLedgerSource(row)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openLedgerSource(row);
                      }
                    }}
                    className="cursor-pointer transition hover:bg-teal-50 focus:bg-teal-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-teal-500"
                  >
                    <td className="border-b border-r px-3 py-2">{String(row.date).slice(0, 10)}</td>

                    <td className="border-b border-r px-3 py-2">{row.reference || '-'}</td>

                    <td className="border-b border-r px-3 py-2">{row.type || '-'}</td>

                    <td className="border-b border-r px-3 py-2">{row.description || '-'}</td>

                    <td className="border-b border-r px-3 py-2 text-right">
                      {row.debit ? money(row.debit) : '-'}
                    </td>

                    <td className="border-b border-r px-3 py-2 text-right">
                      {row.credit ? money(row.credit) : '-'}
                    </td>

                    <td className="border-b px-3 py-2 text-right font-bold">
                      {money(row.runningBalance)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="7" className="px-4 py-10 text-center text-slate-400">
                    No ledger entries in this period
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : null}
      {journalDetail && (
        <WeavingRecordDetailModal
          title="Journal Entry Details"
          fields={[
            ['Date', String(journalDetail.date || '').slice(0, 10)],
            ['Description', journalDetail.description],
            ['Source', journalDetail.originModule || journalDetail.sourceType],
            ['Reference', journalDetail.billNo || journalDetail.referenceId],
            [
              'Reversal',
              journalDetail.isReversal ? 'Yes' : journalDetail.isReversed ? 'Reversed' : 'No',
            ],
          ]}
          lines={journalDetail.lines || []}
          columns={[
            {
              key: 'account',
              label: 'Account',
              render: (line) => line.account?.name || line.account?.code,
            },
            { key: 'type', label: 'Debit / Credit' },
            { key: 'amount', label: 'Amount', render: (line) => money(line.amount) },
          ]}
          onClose={() => setJournalDetail(null)}
        />
      )}
    </section>
  );
}
