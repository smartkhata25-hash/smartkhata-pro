import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  createJournalEntry,
  getJournalEntries,
  updateJournalEntry,
  deleteJournalEntry,
} from '../services/journalService';
import { getAccounts } from '../services/accountService';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { t } from '../i18n/i18n';
const inputStyle = {
  height: 40,
  borderRadius: 10,
  border: '1px solid #cbd5e1',
  padding: '0 12px',
};

const btnGreen = {
  background: '#22c55e',
  color: '#fff',
  border: 'none',
  padding: '8px 16px',
  borderRadius: 10,
};

const btnBlue = {
  background: '#3b82f6',
  color: '#fff',
  border: 'none',
  padding: '8px 16px',
  borderRadius: 10,
};

const btnYellow = {
  background: '#f59e0b',
  color: '#fff',
  border: 'none',
  padding: '8px 16px',
  borderRadius: 10,
};

const btnGray = {
  background: '#e5e7eb',
  border: 'none',
  padding: '8px 16px',
  borderRadius: 10,
};

const JournalEntriesPage = () => {
  const [date, setDate] = useState('');
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState([
    { account: '', type: 'debit', amount: 0 },
    { account: '', type: 'credit', amount: 0 },
  ]);
  const [accounts, setAccounts] = useState([]);
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState('');
  const [editId, setEditId] = useState(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const printRef = useRef();
  const [showModal, setShowModal] = useState(false);

  const fetchAccounts = useCallback(async () => {
    const data = await getAccounts();
    setAccounts(data);
  }, []);

  const fetchEntries = useCallback(async () => {
    const data = await getJournalEntries(startDate, endDate);
    setEntries(data);
  }, [startDate, endDate]);

  useEffect(() => {
    fetchAccounts();
    fetchEntries();
  }, [fetchAccounts, fetchEntries]);

  const handleLineChange = (index, field, value) => {
    const newLines = [...lines];
    newLines[index][field] = field === 'amount' ? parseFloat(value) || 0 : value;
    setLines(newLines);
  };

  const resetForm = () => {
    setDate('');
    setDescription('');
    setLines([
      { account: '', type: 'debit', amount: 0 },
      { account: '', type: 'credit', amount: 0 },
    ]);
    setEditId(null);
    setError('');
  };

  const validateAndSubmit = async () => {
    const debit = lines.filter((l) => l.type === 'debit').reduce((sum, l) => sum + l.amount, 0);

    const credit = lines.filter((l) => l.type === 'credit').reduce((sum, l) => sum + l.amount, 0);

    if (!lines.every((l) => l.account && l.amount > 0)) {
      alert(t('journal.selectAccountError'));
      return;
    }

    if (Number(debit) !== Number(credit)) {
      setError(t('alerts.debitCreditMismatch'));
      return;
    } else {
      setError('');
    }

    const entryData = { date, description, lines };

    try {
      if (editId) {
        await updateJournalEntry(editId, entryData);
      } else {
        await createJournalEntry(entryData);
      }

      resetForm();
      fetchEntries();
    } catch (err) {
      alert(t('alerts.journalSaveFailed'));
    }
  };

  const handleEdit = (entry) => {
    setEditId(entry._id);
    setDate(entry.date?.substring(0, 10));
    setDescription(entry.description);
    setLines(
      entry.lines.map((line) => ({
        account: line.account?._id || line.account,
        type: line.type,
        amount: line.amount,
      }))
    );
  };

  const handleDelete = async (id) => {
    const confirmDelete = window.confirm(t('alerts.deleteJournalConfirm'));
    if (confirmDelete) {
      await deleteJournalEntry(id);
      fetchEntries();
    }
  };

  const totalDebit = lines.filter((l) => l.type === 'debit').reduce((s, l) => s + l.amount, 0);
  const totalCredit = lines.filter((l) => l.type === 'credit').reduce((s, l) => s + l.amount, 0);
  const grandTotalDebit = entries.reduce(
    (sum, entry) =>
      sum + entry.lines.filter((l) => l.type === 'debit').reduce((s, l) => s + l.amount, 0),
    0
  );
  const grandTotalCredit = entries.reduce(
    (sum, entry) =>
      sum + entry.lines.filter((l) => l.type === 'credit').reduce((s, l) => s + l.amount, 0),
    0
  );

  const handlePrint = () => {
    const printContents = printRef.current.innerHTML;
    const win = window.open('', '', 'height=800,width=1000');
    win.document.write(`<html><head><title>${t('journal.printTitle')}</title></head><body>`);
    win.document.write(printContents);
    win.document.write('</body></html>');
    win.document.close();
    win.print();
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    doc.text(t('journal.report'), 14, 15);

    const rows = [];

    entries.forEach((entry) => {
      entry.lines.forEach((line) => {
        rows.push([
          entry.date?.substring(0, 10),
          entry.description,
          line.type.toUpperCase(),
          line.account?.name || 'Unknown',
          'Rs. ' + line.amount,
        ]);
      });
    });

    autoTable(doc, {
      head: [[t('date'), t('description'), t('type'), t('account'), t('amount')]],
      body: rows,
      startY: 20,
    });

    doc.text(
      `Total Debit: Rs. ${grandTotalDebit} | Total Credit: Rs. ${grandTotalCredit}`,
      14,
      doc.lastAutoTable.finalY + 10
    );
    doc.save('journal_entries.pdf');
  };

  const exportToCSV = () => {
    let csvContent = 'Date,Description,Type,Account,Amount\n';

    entries.forEach((entry) => {
      entry.lines.forEach((line) => {
        csvContent += `${entry.date?.substring(0, 10)},${
          entry.description
        },${line.type.toUpperCase()},${line.account?.name || 'Unknown'},${line.amount}\n`;
      });
    });

    csvContent += `\nTotal Debit:,Rs. ${grandTotalDebit},,,\n`;
    csvContent += `Total Credit:,Rs. ${grandTotalCredit},,,\n`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'journal_entries.csv');
    link.click();
  };

  return (
    <div
      style={{
        padding: '8px',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* 🔥 PRO COMPACT COLORFUL HEADER */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          background: 'linear-gradient(135deg,#1e293b,#0f172a)',
          borderRadius: 16,
          padding: '14px 16px',
          border: '1px solid #334155',
          marginBottom: 6,
          boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
            flex: 1,
          }}
        >
          {/* Dates */}
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={{
              height: 34,
              borderRadius: 8,
              border: '1px solid #93c5fd',
              padding: '0 8px',
              background: '#fff',
            }}
          />

          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={{
              height: 34,
              borderRadius: 8,
              border: '1px solid #93c5fd',
              padding: '0 8px',
              background: '#fff',
            }}
          />

          {/* Buttons */}
          <button
            style={{
              background: 'linear-gradient(135deg,#3b82f6,#6366f1)',
              color: '#fff',
              border: 'none',
              padding: '6px 14px',
              borderRadius: 8,
              cursor: 'pointer',
            }}
            onClick={fetchEntries}
          >
            🔍
          </button>

          <button
            style={{
              background: '#64748b',
              color: '#fff',
              border: 'none',
              padding: '6px 14px',
              borderRadius: 8,
              cursor: 'pointer',
            }}
            onClick={() => {
              setStartDate('');
              setEndDate('');
              fetchEntries();
              resetForm();
            }}
          >
            {t('reset')}
          </button>

          <button
            style={{
              background: 'linear-gradient(135deg,#6366f1,#4f46e5)',
              color: '#fff',
              border: 'none',
              padding: '6px 14px',
              borderRadius: 8,
              cursor: 'pointer',
            }}
            onClick={exportToPDF}
          >
            {t('pdf')}
          </button>

          <button
            style={{
              background: 'linear-gradient(135deg,#f59e0b,#f97316)',
              color: '#fff',
              border: 'none',
              padding: '6px 14px',
              borderRadius: 8,
              cursor: 'pointer',
            }}
            onClick={exportToCSV}
          >
            {t('csv')}
          </button>

          <button
            style={{
              background: 'linear-gradient(135deg,#22c55e,#16a34a)',
              color: '#fff',
              border: 'none',
              padding: '6px 14px',
              borderRadius: 8,
              cursor: 'pointer',
            }}
            onClick={handlePrint}
          >
            {t('print')}
          </button>

          <button
            style={{
              background: 'linear-gradient(135deg,#10b981,#059669)',
              color: '#fff',
              border: 'none',
              padding: '6px 14px',
              borderRadius: 8,
              cursor: 'pointer',
              fontWeight: 'bold',
            }}
            onClick={() => setShowModal(true)}
          >
            + {t('journal.newEntry')}
          </button>
        </div>
        {/* 🔹 TOTALS */}
        <div style={{ marginTop: 6, fontSize: 13, color: '#e2e8f0' }}>
          <strong>{t('debit')}:</strong> {grandTotalDebit} | <strong>{t('credit')}:</strong>{' '}
          {grandTotalCredit}
        </div>

        {error && <p style={{ color: 'red', marginTop: 4 }}>{error}</p>}
      </div>

      {/* 🔥 TABLE VIEW */}
      <div
        ref={printRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'auto',
          border: '1px solid #e5e7eb',
          borderRadius: 8,
        }}
      >
        <table className="table table-bordered">
          <thead style={{ position: 'sticky', top: 0, background: '#f3f4f6', zIndex: 10 }}>
            <tr>
              <th>{t('date')}</th>
              <th style={{ width: '35%' }}>{t('description')}</th>
              <th>{t('type')}</th>
              <th>{t('account')}</th>
              <th>{t('amount')}</th>
              <th style={{ width: '90px' }}>{t('common.actions')}</th>
            </tr>
          </thead>

          <tbody>
            {entries.map((entry) =>
              entry.lines.map((line, idx) => (
                <tr key={entry._id + idx}>
                  <td>{entry.date?.substring(0, 10)}</td>
                  <td
                    style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                  >
                    {entry.description}
                  </td>
                  <td>{line.type}</td>
                  <td>{line.account?.name}</td>
                  <td>{line.amount}</td>
                  <td style={{ width: 90, textAlign: 'center' }}>
                    <button
                      onClick={() => handleEdit(entry)}
                      style={{
                        background: '#3b82f6',
                        color: '#fff',
                        border: 'none',
                        padding: '4px 10px',
                        borderRadius: 6,
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      {t('edit')}
                    </button>
                    <button
                      onClick={() => handleDelete(entry._id)}
                      className="btn btn-danger btn-sm"
                      style={{ marginLeft: 5 }}
                    >
                      {t('delete')}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {showModal && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              background: 'rgba(15,23,42,0.7)',
              backdropFilter: 'blur(6px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 999,
            }}
          >
            <div
              style={{
                width: 720,
                borderRadius: 20,
                overflow: 'hidden',
                background: '#fff',
                boxShadow: '0 25px 60px rgba(0,0,0,0.35)',
              }}
            >
              {/* HEADER */}
              <div
                style={{
                  background: 'linear-gradient(135deg,#4f46e5,#22c55e)',
                  color: '#fff',
                  padding: '16px 20px',
                  fontWeight: 600,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>✨ {t('journal.newEntry')}</span>
                <span onClick={() => setShowModal(false)} style={{ cursor: 'pointer' }}>
                  ✖
                </span>
              </div>

              {/* BODY */}
              <div style={{ padding: 22 }}>
                {/* DATE + DESC */}
                <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    style={inputStyle}
                  />

                  <input
                    placeholder={t('description')}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    style={{ ...inputStyle, flex: 2 }}
                  />
                </div>

                {/* LINES */}
                {lines.map((line, index) => (
                  <div
                    key={index}
                    style={{
                      display: 'flex',
                      gap: 10,
                      marginBottom: 10,
                      padding: 10,
                      borderRadius: 12,
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    <select
                      value={line.account}
                      onChange={(e) => handleLineChange(index, 'account', e.target.value)}
                      style={{ ...inputStyle, flex: 2 }}
                    >
                      <option value="">{t('journal.selectAccount')}</option>
                      {accounts.map((acc) => (
                        <option key={acc._id} value={acc._id}>
                          {acc.name}
                        </option>
                      ))}
                    </select>

                    <div
                      style={{
                        width: 80,
                        fontWeight: 'bold',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      {line.type === 'debit' ? 'Debit' : 'Credit'}
                    </div>

                    <input
                      type="number"
                      value={line.amount}
                      onChange={(e) => handleLineChange(index, 'amount', e.target.value)}
                      style={{ ...inputStyle, width: 120 }}
                    />
                  </div>
                ))}

                <div style={{ marginTop: 14, fontWeight: 600 }}>
                  Debit: {totalDebit} | Credit: {totalCredit}
                </div>

                {error && <p style={{ color: 'red' }}>{error}</p>}
              </div>

              {/* FOOTER */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 10,
                  padding: 16,
                  borderTop: '1px solid #eee',
                }}
              >
                <button style={btnGreen} onClick={validateAndSubmit}>
                  {t('save')}
                </button>

                <button style={btnBlue} onClick={validateAndSubmit}>
                  {t('journal.saveNew')}
                </button>

                <button style={btnYellow} onClick={resetForm}>
                  {t('clear')}
                </button>

                <button style={btnGray} onClick={() => setShowModal(false)}>
                  {t('cancel')}
                </button>
              </div>
            </div>
          </div>
        )}

        <div style={{ marginTop: 10, fontWeight: 'bold' }}>
          Grand Total — Debit: Rs. {grandTotalDebit} | Credit: Rs. {grandTotalCredit}
        </div>
      </div>
    </div>
  );
};

export default JournalEntriesPage;
