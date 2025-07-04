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

const JournalEntriesPage = () => {
  const [date, setDate] = useState('');
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState([{ account: '', type: 'debit', amount: 0 }]);
  const [accounts, setAccounts] = useState([]);
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState('');
  const [editId, setEditId] = useState(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const printRef = useRef();

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

  const addLine = () => {
    setLines([...lines, { account: '', type: 'debit', amount: 0 }]);
  };

  const resetForm = () => {
    setDate('');
    setDescription('');
    setLines([{ account: '', type: 'debit', amount: 0 }]);
    setEditId(null);
    setError('');
  };

  const validateAndSubmit = async () => {
    const debit = lines.filter((l) => l.type === 'debit').reduce((sum, l) => sum + l.amount, 0);
    const credit = lines.filter((l) => l.type === 'credit').reduce((sum, l) => sum + l.amount, 0);

    if (debit !== credit) {
      setError('Total Debit must equal Total Credit');
      return;
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
      alert('Failed to save entry');
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
    const confirmDelete = window.confirm(
      'Are you sure you want to delete this entry?\n\nYes = Delete\nNo = Cancel'
    );
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
    win.document.write('<html><head><title>Print Journal Entries</title></head><body>');
    win.document.write(printContents);
    win.document.write('</body></html>');
    win.document.close();
    win.print();
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    doc.text('Journal Entries Report', 14, 15);

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
      head: [['Date', 'Description', 'Type', 'Account', 'Amount']],
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
    <div>
      <h2>{editId ? 'Edit Journal Entry' : 'New Journal Entry'}</h2>

      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <br />
      <textarea
        placeholder="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <br />

      {lines.map((line, index) => (
        <div key={index}>
          <select
            value={line.account}
            onChange={(e) => handleLineChange(index, 'account', e.target.value)}
          >
            <option value="">Select Account</option>
            {accounts.map((acc) => (
              <option key={acc._id} value={acc._id}>
                {acc.name}
              </option>
            ))}
          </select>

          <select
            value={line.type}
            onChange={(e) => handleLineChange(index, 'type', e.target.value)}
          >
            <option value="debit">Debit</option>
            <option value="credit">Credit</option>
          </select>

          <input
            type="number"
            placeholder="Amount"
            value={line.amount}
            onChange={(e) => handleLineChange(index, 'amount', e.target.value)}
          />
        </div>
      ))}

      <button onClick={addLine}>+ Add Line</button>

      <div style={{ marginTop: '10px' }}>
        <strong>Total Debit:</strong> Rs. {totalDebit} | <strong>Total Credit:</strong> Rs.{' '}
        {totalCredit}
      </div>

      {error && <p style={{ color: 'red' }}>{error}</p>}
      <button
        onClick={validateAndSubmit}
        style={{ backgroundColor: '#007bff', color: 'white', padding: '6px 12px' }}
      >
        {editId ? 'Update Entry' : 'Save Entry'}
      </button>
      {editId && (
        <button
          onClick={resetForm}
          style={{
            marginLeft: 10,
            backgroundColor: '#6c757d',
            color: 'white',
            padding: '6px 12px',
          }}
        >
          Cancel Edit
        </button>
      )}

      <hr />
      <h3>🔍 Filter Entries by Date</h3>

      <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
      <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
      <button onClick={fetchEntries}>Search</button>
      <button
        onClick={() => {
          setStartDate('');
          setEndDate('');
          fetchEntries();
          resetForm(); // ✅ بہتر UX
        }}
      >
        Reset
      </button>

      <button
        onClick={exportToPDF}
        style={{ marginTop: '10px', background: '#007bff', color: 'white', padding: '5px 10px' }}
      >
        📄 Export to PDF
      </button>

      <button
        onClick={exportToCSV}
        style={{ marginTop: '10px', background: '#ffc107', color: 'black', padding: '5px 10px' }}
      >
        📁 Export to CSV
      </button>

      <button
        onClick={handlePrint}
        style={{ marginTop: '10px', background: '#28a745', color: 'white', padding: '5px 10px' }}
      >
        🖨️ Print Entries
      </button>

      <div ref={printRef}>
        <h3>📜 Filtered Journal Entries</h3>
        {entries.map((entry) => (
          <div
            key={entry._id}
            style={{ border: '1px solid #ccc', marginBottom: '10px', padding: '10px' }}
          >
            <strong>{entry.date?.substring(0, 10)}</strong> — {entry.description}
            <ul>
              {entry.lines.map((line, idx) => (
                <li key={line._id || idx}>
                  {line.type.toUpperCase()} — {line.account?.name || 'Unknown'} — Rs. {line.amount}
                </li>
              ))}
            </ul>
            <button onClick={() => handleEdit(entry)}>✏️ Edit</button>
            <button onClick={() => handleDelete(entry._id)}>🗑️ Delete</button>
          </div>
        ))}

        <div style={{ marginTop: '10px', fontWeight: 'bold' }}>
          Grand Total — Debit: Rs. {grandTotalDebit} &nbsp; | &nbsp; Credit: Rs. {grandTotalCredit}
        </div>
      </div>
    </div>
  );
};

export default JournalEntriesPage;
