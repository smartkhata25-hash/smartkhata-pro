import React, { useState, useEffect, useRef } from 'react';
import { t } from '../i18n/i18n';

const FILE_BASE_URL = process.env.REACT_APP_API_BASE_URL;

/* 🔒 STEP 1 — COLUMN ORDER LOCK */
const ALL_COLUMNS = [
  'date',
  'time',
  'billNo',
  'source',
  'via',
  'description',
  'debit',
  'credit',
  'balance',
  'attachment',
  'actions',
];

/* 🔤 Column Labels */
const COLUMN_LABELS = {
  date: t('common.date'),
  time: t('common.time'),
  billNo: t('common.billNo'),
  source: t('ledger.source'),
  via: t('ledger.via'),
  description: t('common.description'),
  debit: t('common.debit'),
  credit: t('common.credit'),
  balance: t('common.balance'),
  attachment: t('common.attachment'),
  actions: t('common.actions'),
};

/* 👁️ STEP 2 — Column Config (Hide / Show) */
const COLUMN_CONFIG = {
  date: { hideable: false },
  time: { hideable: true },
  billNo: { hideable: true },
  source: { hideable: true },
  via: { hideable: true },
  description: { hideable: true },
  debit: { hideable: false },
  credit: { hideable: false },
  balance: { hideable: false },
  attachment: { hideable: true },
  actions: { hideable: false },
};

const LedgerTable = ({
  ledgerData = [],
  search = '',
  openingBalance = 0,
  onEdit,
  onDelete,
  onRowClick,
  visibleColumns = ALL_COLUMNS,
}) => {
  const STORAGE_KEY = 'ledger_visible_columns';

  const tableEndRef = useRef(null);
  const bodyScrollRef = useRef(null);
  /* 👁️ Visible Columns State */
  const [columns, setColumns] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : visibleColumns;
  });

  /* 🔍 Filter Ledger */
  const filteredData = ledgerData
    .filter((e) => !e.isOpening && e.sourceType !== 'opening_balance' && e.sourceType !== 'opening')
    .filter((e) => {
      const s = search.toLowerCase().trim();
      if (!s) return true;

      return (
        (e.billNo || '').toString().toLowerCase().includes(s) ||
        (e.description || '').toLowerCase().includes(s) ||
        (e.sourceType || '').toLowerCase().includes(s) ||
        (e.paymentType || '').toLowerCase().includes(s) ||
        (e.debit || 0).toString().includes(s) ||
        (e.credit || 0).toString().includes(s) ||
        (e.balance || 0).toString().includes(s)
      );
    });

  /* 📎 Attachment */
  const detectFileType = (url) => {
    const ext = url.split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif'].includes(ext)) return 'image';
    if (ext === 'pdf') return 'pdf';
    if (['mp3', 'wav'].includes(ext)) return 'voice';
    return 'other';
  };

  const renderAttachment = (entry) => {
    let fileUrl = entry.attachmentUrl || entry.fileUrl;
    if (!fileUrl) return '-';

    fileUrl = fileUrl.replace(/^\/?uploads\//, '');
    const fullUrl = `${FILE_BASE_URL}/uploads/${fileUrl}`;
    const type = entry.attachmentType || detectFileType(fileUrl);

    if (type === 'image')
      return (
        <a href={fullUrl} target="_blank" rel="noreferrer">
          📷 {t('common.preview')}
        </a>
      );
    if (type === 'pdf')
      return (
        <a href={fullUrl} target="_blank" rel="noreferrer">
          📄 {t('common.pdf')}
        </a>
      );
    if (type === 'voice') return <audio controls src={fullUrl} style={{ maxWidth: 100 }} />;
    return (
      <a href={fullUrl} target="_blank" rel="noreferrer">
        📁 {t('common.file')}
      </a>
    );
  };

  /* 🎨 Row Color */
  const getRowColor = (e) => {
    const t = (e.sourceType || '').toLowerCase();
    if (t === 'receive_payment') return '#f0fdfd';
    if (t === 'sale_invoice') return '#fffbeb';
    if (t === 'refund_invoice') return '#fef2f2';
    if (e.runningBalance < 0) return '#f0fdf4';
    return 'transparent';
  };

  /* 🟦 Opening Row */
  const openingRow = {
    _id: 'opening-balance',
    isOpening: true,
    date: ledgerData[0]?.date || null,
    description: t('ledger.openingBalance'),
    sourceType: 'opening_balance',
    debit: openingBalance > 0 ? openingBalance : 0,
    credit: openingBalance < 0 ? Math.abs(openingBalance) : 0,
    balance: openingBalance,
    runningBalance: openingBalance,
  };

  useEffect(() => {
    if (bodyScrollRef.current) {
      bodyScrollRef.current.scrollTop = bodyScrollRef.current.scrollHeight;
    }
  }, [filteredData.length]);
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
      }}
    >
      {/* 👁️ TEMP COLUMN TOGGLE (TESTING) */}
      <div style={{ marginBottom: 8 }}>
        {ALL_COLUMNS.map((col) => {
          if (!COLUMN_CONFIG[col]?.hideable) return null;

          return (
            <label key={col} style={{ marginRight: 12, fontSize: 12 }}>
              <input
                type="checkbox"
                checked={columns.includes(col)}
                onChange={() => {
                  setColumns((prev) => {
                    const updated = prev.includes(col)
                      ? prev.filter((c) => c !== col)
                      : [...prev, col];

                    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
                    return updated;
                  });
                }}
              />{' '}
              {COLUMN_LABELS[col]}
            </label>
          );
        })}
      </div>

      {/* 🔁 TABLE SCROLL CONTAINER */}

      <div
        className="table-wrapper"
        style={{
          flex: 1,
          minHeight: 0,

          overflowX: 'auto',
          overflowY: 'hidden',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {/* 🔒 HEADER */}
        <table className="table w-full md:min-w-[900px] mobile-ledger">
          <thead>
            <tr className="bg-white">
              {ALL_COLUMNS.map((col) =>
                columns.includes(col) ? (
                  <th
                    key={col}
                    className={`col-${col} ${
                      ['attachment', 'actions'].includes(col) ? 'no-print' : ''
                    }`}
                  >
                    {COLUMN_LABELS[col]}
                  </th>
                ) : null
              )}
            </tr>
          </thead>
        </table>

        {/* 🔁 BODY */}
        <div
          ref={bodyScrollRef}
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            maxHeight: '100%',
          }}
        >
          <table className="table w-full md:min-w-[900px] mobile-ledger">
            <tbody>
              {[openingRow, ...filteredData].map((e, index) => (
                <tr
                  key={`${e._id}-${index}`}
                  className="ledger-row text-xs md:text-sm"
                  onClick={() => !e.isOpening && onRowClick && onRowClick(e)}
                  style={{
                    backgroundColor: e.isOpening ? '#e0f2fe' : getRowColor(e),
                    fontWeight: e.isOpening ? 'bold' : 'normal',
                  }}
                >
                  {ALL_COLUMNS.map((col) => {
                    if (!columns.includes(col)) return null;

                    if (col === 'date')
                      return (
                        <td key={col}>{e.date ? new Date(e.date).toLocaleDateString() : '-'}</td>
                      );
                    if (col === 'time')
                      return (
                        <td key={col} className="no-print">
                          {e.time || '-'}
                        </td>
                      );
                    if (col === 'billNo') return <td key={col}>{e.billNo || '-'}</td>;
                    if (col === 'source')
                      return (
                        <td key={col}>{e.isOpening ? t('ledger.openingBalance') : e.sourceType}</td>
                      );
                    if (col === 'via')
                      return (
                        <td key={col} className="no-print">
                          {e.paymentType || '-'}
                        </td>
                      );
                    if (col === 'description')
                      return (
                        <td key={col} className="no-print">
                          {e.description || '-'}
                        </td>
                      );
                    if (col === 'debit')
                      return (
                        <td key={col} className="amount-debit">
                          {(e.debit || 0).toFixed(2)}
                        </td>
                      );
                    if (col === 'credit')
                      return (
                        <td key={col} className="amount-credit">
                          {(e.credit || 0).toFixed(2)}
                        </td>
                      );
                    if (col === 'balance')
                      return (
                        <td key={col} className="amount-balance">
                          {(e.balance || 0).toFixed(2)}
                        </td>
                      );
                    if (col === 'attachment')
                      return (
                        <td key={col} className="no-print">
                          {renderAttachment(e)}
                        </td>
                      );
                    if (col === 'actions')
                      return (
                        <td key={col} className="no-print">
                          <button className="btn btn-primary" onClick={() => onEdit && onEdit(e)}>
                            ✏️ {t('common.edit')}
                          </button>{' '}
                          <button
                            className="btn btn-danger"
                            onClick={() => onDelete && onDelete(e._id)}
                          >
                            🗑 {t('common.delete')}
                          </button>
                        </td>
                      );
                    return null;
                  })}
                </tr>
              ))}
            </tbody>

            <tfoot>
              <tr className="totals-row">
                {ALL_COLUMNS.map((col) => {
                  if (!columns.includes(col)) return null;

                  if (columns.indexOf(col) === 0)
                    return (
                      <td key={col} style={{ textAlign: 'right', fontWeight: 700 }}>
                        {t('ledger.totals')}:
                      </td>
                    );

                  if (col === 'debit')
                    return (
                      <td key={col} className="amount-debit">
                        {ledgerData.reduce((s, e) => s + (e.debit || 0), 0).toFixed(2)}
                      </td>
                    );

                  if (col === 'credit')
                    return (
                      <td key={col} className="amount-credit">
                        {ledgerData.reduce((s, e) => s + (e.credit || 0), 0).toFixed(2)}
                      </td>
                    );

                  if (col === 'balance')
                    return (
                      <td key={col} className="amount-balance">
                        {(ledgerData.length > 0
                          ? ledgerData[ledgerData.length - 1].balance || 0
                          : openingBalance
                        ).toFixed(2)}
                      </td>
                    );

                  return <td key={col}></td>;
                })}
              </tr>
            </tfoot>
          </table>
        </div>

        <div ref={tableEndRef} />
      </div>
    </div>
  );
};

export default LedgerTable;
