import React, { useState } from 'react';

const FILE_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const LedgerTable = ({ ledgerData = [], openingBalance = 0, onEdit, onDelete, onRowClick }) => {
  const [q, setQ] = useState('');

  const filtered = ledgerData.filter((e) => {
    const s = q.toLowerCase();
    return (
      (e.billNo || '').toLowerCase().includes(s) ||
      (e.description || '').toLowerCase().includes(s) ||
      new Date(e.date).toLocaleDateString().includes(s) ||
      (e.debit || 0).toString().includes(s) ||
      (e.credit || 0).toString().includes(s) ||
      (e.paymentType || '').toLowerCase().includes(s)
    );
  });

  // 🔢 Totals calculation
  const totalDebit = filtered.reduce((sum, e) => sum + (e.debit || 0), 0);
  const totalCredit = filtered.reduce((sum, e) => sum + (e.credit || 0), 0);
  const finalBalance =
    filtered.length > 0 ? filtered[filtered.length - 1].balance || 0 : openingBalance;

  const renderAttachment = (entry) => {
    let fileUrl = entry.attachmentUrl || entry.fileUrl;
    if (!fileUrl) return '-';

    fileUrl = fileUrl.replace(/^\/?uploads\//, '');
    const fullUrl = `${FILE_BASE_URL}/uploads/${fileUrl}`;
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

  const detectFileType = (url) => {
    const ext = url.split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif'].includes(ext)) return 'image';
    if (ext === 'pdf') return 'pdf';
    if (['mp3', 'wav'].includes(ext)) return 'voice';
    return 'other';
  };

  const handleRowClick = (e, entry) => {
    if (e.target.closest('button')) return;
    if (onRowClick) {
      onRowClick(entry);
    } else if (window.confirm('Do you want to edit this entry?')) {
      onEdit && onEdit(entry);
    }
  };

  const getPaymentTypeLabel = (type) => {
    switch (type) {
      case 'party':
        return 'Credit';
      case 'cheque':
        return 'Cheque';
      case 'bank':
        return 'Bank';
      case 'cash':
        return 'Cash';
      default:
        return type || '-';
    }
  };

  return (
    <div>
      <h3>Opening Balance: {openingBalance.toFixed(2)}</h3>

      {/* Search Box */}
      <div style={{ display: 'flex', gap: 10, margin: '8px 0' }}>
        <input
          style={{ flex: 1 }}
          placeholder="🔍 Search by bill no, type, amount, date..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button onClick={() => setQ('')}>Clear</button>
      </div>

      {/* Table */}
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
          {filtered.length === 0 ? (
            <tr>
              <td colSpan="10" align="center">
                No entries found.
              </td>
            </tr>
          ) : (
            <>
              {filtered.map((e) => {
                const isAdvance = e.credit > 0 && (e.debit || 0) === 0;

                return (
                  <tr
                    key={`${e._id || ''}-${e.date}-${e.billNo}-${e.credit}-${e.debit}`}
                    onClick={(event) => handleRowClick(event, e)}
                    style={{
                      cursor: 'pointer',
                      backgroundColor: isAdvance ? '#fff8dc' : 'transparent',
                    }}
                  >
                    <td>{e.date ? new Date(e.date).toLocaleDateString() : '-'}</td>
                    <td>
                      {e.time ||
                        (e.date
                          ? new Date(e.date).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '-')}
                    </td>
                    <td>{e.billNo || '-'}</td>
                    <td>{getPaymentTypeLabel(e.paymentType)}</td>
                    <td>
                      {e.description || '-'}
                      {isAdvance && (
                        <span
                          style={{
                            marginLeft: 6,
                            background: '#ffc107',
                            color: '#000',
                            padding: '2px 6px',
                            borderRadius: 4,
                            fontSize: 12,
                          }}
                        >
                          Advance
                        </span>
                      )}
                    </td>
                    <td>{(e.debit || 0).toFixed(2)}</td>
                    <td>{(e.credit || 0).toFixed(2)}</td>
                    <td>{renderAttachment(e)}</td>
                    <td>{(e.balance || 0).toFixed(2)}</td>
                    <td>
                      <button
                        onClick={(ev) => {
                          ev.stopPropagation();
                          onEdit && onEdit(e);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={(ev) => {
                          ev.stopPropagation();
                          onDelete && onDelete(e._id);
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}

              {/* ✅ Total Row */}
              <tr style={{ backgroundColor: '#e6f7ff', fontWeight: 'bold' }}>
                <td colSpan="5" align="right">
                  Totals:
                </td>
                <td>{totalDebit.toFixed(2)}</td>
                <td>{totalCredit.toFixed(2)}</td>
                <td colSpan="1" />
                <td>{finalBalance.toFixed(2)}</td>
                <td />
              </tr>
            </>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default LedgerTable;
