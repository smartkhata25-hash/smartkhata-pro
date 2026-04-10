import React, { useState } from 'react';
import { t } from '../i18n/i18n';

export default function SupplierLedgerTable({ ledgerData, openingBalance, onEdit, onDelete }) {
  const [q, setQ] = useState('');

  const filtered = ledgerData.filter((e) => {
    const s = q.toLowerCase();
    return (
      (e.billNo || '').toLowerCase().includes(s) ||
      (e.description || '').toLowerCase().includes(s) ||
      new Date(e.date).toLocaleDateString().includes(s) ||
      e.debit.toString().includes(s) ||
      e.credit.toString().includes(s)
    );
  });

  const rows = [
    {
      _id: 'opening-row',
      date: new Date().toISOString(),
      billNo: '',
      paymentType: '',
      description: t('openingBalance'),
      debit: 0,
      credit: 0,
      attachmentType: '',
      runningBalance: openingBalance,
      isOpening: true,
    },
    ...filtered,
  ];

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
    const fullUrl = `${process.env.REACT_APP_API_BASE_URL}/uploads/${fileUrl}`;
    const type = entry.attachmentType || detectFileType(fileUrl);

    switch (type) {
      case 'image':
        return (
          <a href={fullUrl} target="_blank" rel="noreferrer">
            📷 {t('preview')}
          </a>
        );
      case 'pdf':
        return (
          <a href={fullUrl} target="_blank" rel="noreferrer">
            📄 {t('pdf')}
          </a>
        );
      case 'voice':
        return <audio controls src={fullUrl} style={{ maxWidth: 100 }} />;
      default:
        return (
          <a href={fullUrl} target="_blank" rel="noreferrer">
            📁 {t('file')}
          </a>
        );
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
      }}
    >
      <h3>
        {t('openingBalance')}: {openingBalance.toFixed(2)}
      </h3>

      <div style={{ display: 'flex', gap: 10, margin: '8px 0' }}>
        <input
          style={{ flex: 1 }}
          placeholder={t('ledger.search')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button onClick={() => setQ('')}>{t('clear')}</button>
      </div>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
        }}
      >
        <table className="table">
          <thead>
            <tr>
              <th>{t('date')}</th>
              <th>{t('time')}</th>
              <th>{t('billNo')}</th>
              <th>{t('source')}</th>
              <th>{t('via')}</th>
              <th>{t('description')}</th>
              <th>{t('debit')}</th>
              <th>{t('credit')}</th>
              <th>{t('balance')}</th>
              <th>{t('attachment')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>

          <tbody>
            {rows.length === 1 ? (
              <tr>
                <td colSpan="11" align="center">
                  {t('common.noRecords')}
                </td>
              </tr>
            ) : (
              <>
                {rows.map((e, idx) => (
                  <tr
                    key={`${e._id}-${idx}`}
                    style={{ cursor: e.isOpening ? 'default' : 'pointer' }}
                    onClick={() => {
                      if (e.isOpening) return;

                      onEdit?.(e);
                    }}
                  >
                    {/* Date */}
                    <td>{new Date(e.date).toLocaleDateString()}</td>

                    {/* Time */}
                    <td>
                      {e.time && e.time.trim() !== ''
                        ? e.time
                        : new Date(e.date).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                    </td>

                    {/* Bill No */}
                    <td>{e.billNo || '-'}</td>

                    {/* Source */}
                    <td>
                      {e.isOpening
                        ? t('openingBalance')
                        : e.sourceType === 'purchase_invoice'
                          ? t('purchase.invoice')
                          : e.sourceType === 'pay_bill'
                            ? t('payment.payBill')
                            : '-'}
                    </td>

                    {/* Via (sirf debit par) */}
                    <td>{e.debit > 0 ? e.paymentType || '-' : '-'}</td>

                    {/* Description (sirf user text) */}
                    <td>{e.description || '-'}</td>

                    {/* Debit / Credit */}
                    <td>{(e.debit ?? 0).toFixed(2)}</td>
                    <td>{(e.credit ?? 0).toFixed(2)}</td>

                    {/* Balance */}
                    <td>{(e.balance ?? 0).toFixed(2)}</td>

                    <td>{renderAttachment(e)}</td>

                    {/* Actions */}
                    <td>
                      {!e.isOpening && (
                        <>
                          <button
                            onClick={(ev) => {
                              ev.stopPropagation();
                              onEdit?.(e);
                            }}
                          >
                            {t('edit')}
                          </button>{' '}
                          <button
                            onClick={(ev) => {
                              ev.stopPropagation();
                              onDelete?.(e._id);
                            }}
                          >
                            {t('delete')}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}

                {/* ✅ TOTAL / CLOSING BALANCE ROW */}
                <tr style={{ backgroundColor: '#e6f7ff', fontWeight: 'bold' }}>
                  <td colSpan="6" align="right">
                    {t('totals')}:
                  </td>
                  <td>{rows.reduce((sum, r) => sum + (r.debit || 0), 0).toFixed(2)}</td>
                  <td>{rows.reduce((sum, r) => sum + (r.credit || 0), 0).toFixed(2)}</td>
                  <td />
                  <td>{rows.length > 0 ? rows[rows.length - 1].balance.toFixed(2) : '0.00'}</td>
                  <td />
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
