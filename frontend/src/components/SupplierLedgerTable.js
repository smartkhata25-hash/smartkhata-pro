import React, { useState } from 'react';

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
      description: 'Opening Balance',
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
    const fullUrl = `http://localhost:5000/uploads/${fileUrl}`;
    const type = entry.attachmentType || detectFileType(fileUrl);

    switch (type) {
      case 'image':
        return (
          <a href={fullUrl} target="_blank" rel="noreferrer">
            📷 Preview
          </a>
        );
      case 'pdf':
        return (
          <a href={fullUrl} target="_blank" rel="noreferrer">
            📄 PDF
          </a>
        );
      case 'voice':
        return <audio controls src={fullUrl} style={{ maxWidth: 100 }} />;
      default:
        return (
          <a href={fullUrl} target="_blank" rel="noreferrer">
            📁 File
          </a>
        );
    }
  };

  return (
    <div>
      <h3>Opening Balance: {openingBalance.toFixed(2)}</h3>

      <div style={{ display: 'flex', gap: 10, margin: '8px 0' }}>
        <input
          style={{ flex: 1 }}
          placeholder="🔍 Search by Bill No, Date, Amount…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button onClick={() => setQ('')}>Clear</button>
      </div>

      <table border="1" cellPadding="8" width="100%">
        <thead>
          <tr>
            <th>Date</th>
            <th>Time</th>
            <th>Bill No</th>
            <th>Payment</th>
            <th>Description</th>
            <th>Debit</th>
            <th>Credit</th>
            <th>Attachment</th>
            <th>Balance</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 1 ? (
            <tr>
              <td colSpan="10" align="center">
                No entries found.
              </td>
            </tr>
          ) : (
            rows.map((e, idx) => (
              <tr
                key={e._id || `row-${idx}`}
                style={{ cursor: e.isOpening ? 'default' : 'pointer' }}
                onClick={() => {
                  if (e.isOpening) return;
                  onEdit?.(e); // ✅ call parent handler
                }}
              >
                <td>{new Date(e.date).toLocaleDateString()}</td>
                <td>
                  {e.time && e.time.trim() !== ''
                    ? e.time
                    : new Date(e.date).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                </td>
                <td>{e.billNo || '-'}</td>
                <td>
                  {e.paymentType === 'party'
                    ? 'Udhaar'
                    : e.paymentType === 'cheque'
                    ? 'Cheque'
                    : e.paymentType || '-'}
                </td>
                <td>{e.description || '-'}</td>
                <td>{(e.debit ?? 0).toFixed(2)}</td>
                <td>{(e.credit ?? 0).toFixed(2)}</td>
                <td>{renderAttachment(e)}</td>
                <td>{(e.balance ?? 0).toFixed(2)}</td>
                <td>
                  {!e.isOpening && (
                    <>
                      <button
                        onClick={(ev) => {
                          ev.stopPropagation();
                          onEdit?.(e);
                        }}
                      >
                        Edit
                      </button>{' '}
                      <button
                        onClick={(ev) => {
                          ev.stopPropagation();
                          console.log('🗑️ Trying to delete entry:', e);

                          if (!e.referenceId) {
                            alert('❌ No reference ID to delete.');
                            return;
                          }
                          onDelete?.(e._id);
                        }}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
