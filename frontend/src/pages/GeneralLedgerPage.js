import React, { useState, useEffect } from 'react';
import { getLedgerByAccount } from '../services/journalService';
import { getAllAccounts } from '../services/accountService';
import { useNavigate } from 'react-router-dom';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CSVLink } from 'react-csv';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell
} from 'recharts';

const GeneralLedgerPage = () => {
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [ledger, setLedger] = useState([]);
  const [filteredLedger, setFilteredLedger] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedRow, setSelectedRow] = useState(null);
  const [summary, setSummary] = useState(null);
  const token = localStorage.getItem('token');
  const navigate = useNavigate();

  useEffect(() => {
    if (!token) return navigate('/login');

    const needsRefresh = localStorage.getItem('ledgerNeedsRefresh');
    if (needsRefresh === 'true') {
      alert('⚠️ نئی انٹری ہو چکی ہے۔ براہ کرم Ledger کو دوبارہ Filter کریں۔');
      localStorage.removeItem('ledgerNeedsRefresh');
    }

    const fetchAccounts = async () => {
      const data = await getAllAccounts(token);
      setAccounts(data);
    };
    fetchAccounts();
  }, [token, navigate]);

  const fetchLedger = async (accountId) => {
    setLoading(true);
    try {
      const data = await getLedgerByAccount(accountId, startDate, endDate);
      setLedger(data);
      setFilteredLedger(data);

      if (data.length > 0) {
        const hasOpening = data[0].isOpening;
        const opening = hasOpening ? data[0].balance : 0;
        const rows = hasOpening ? data.slice(1) : data;

        const totalDebit = rows.reduce((sum, r) => sum + r.debit, 0);
        const totalCredit = rows.reduce((sum, r) => sum + r.credit, 0);
        const closing = data[data.length - 1].balance;

        setSummary({
          opening,
          totalDebit,
          totalCredit,
          closing,
        });
      } else {
        setSummary(null);
      }
    } catch (error) {
      console.error('Error loading ledger:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAccountChange = (e) => {
    const accountId = e.target.value;
    setSelectedAccount(accountId);
    if (!accountId) {
      setLedger([]);
      setFilteredLedger([]);
      setSummary(null);
      return;
    }
    fetchLedger(accountId);
  };

  const handleFilter = () => {
    if (selectedAccount) fetchLedger(selectedAccount);
  };

  const clearFilters = () => {
    setSelectedAccount('');
    setStartDate('');
    setEndDate('');
    setSearchTerm('');
    setLedger([]);
    setFilteredLedger([]);
    setSummary(null);
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    doc.text('General Ledger Report', 14, 15);
    const tableData = filteredLedger.map(row => [
      row.date ? new Date(row.date).toLocaleDateString() : '',
      row.description,
      row.debit.toFixed(2),
      row.credit.toFixed(2),
      row.balance.toFixed(2),
    ]);
    autoTable(doc, {
      head: [['Date', 'Description', 'Debit', 'Credit', 'Balance']],
      body: tableData,
      startY: 20,
    });
    doc.save('general_ledger.pdf');
  };

  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredLedger(ledger);
    } else {
      const filtered = ledger.filter(row =>
        row.description.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredLedger(filtered);
    }
  }, [searchTerm, ledger]);

  const chartData = [
    { name: 'Debit', value: summary?.totalDebit || 0, fill: '#4CAF50' },
    { name: 'Credit', value: summary?.totalCredit || 0, fill: '#F44336' },
  ];

  const handleRowClick = (row) => {
    if (!row.isOpening) setSelectedRow(row);
  };

  const closeModal = () => setSelectedRow(null);

  return (
    <div style={{ padding: '20px' }} id="print-section">
      <h2>📘 General Ledger</h2>

      <div className="no-print" style={{ marginBottom: '20px' }}>
        <label>Select Account: </label>
        <select value={selectedAccount} onChange={handleAccountChange}>
          <option value="">-- Select --</option>
          {accounts.map(acc => (
            <option key={acc._id} value={acc._id}>{acc.name}</option>
          ))}
        </select>

        <div style={{ marginTop: '10px' }}>
          <label>From: </label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          <label style={{ marginLeft: '10px' }}>To: </label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
          <button onClick={handleFilter} style={{ marginLeft: '10px' }}>Filter</button>
          <button onClick={exportToPDF} style={{ marginLeft: '10px' }}>PDF</button>
          <CSVLink
            data={filteredLedger.map(row => ({
              Date: row.date ? new Date(row.date).toLocaleDateString() : '',
              Description: row.description,
              Debit: row.debit.toFixed(2),
              Credit: row.credit.toFixed(2),
              Balance: row.balance.toFixed(2),
            }))}
            filename="general_ledger.csv"
            className="btn btn-secondary"
            style={{ marginLeft: '10px', textDecoration: 'none', padding: '6px 12px', border: '1px solid gray', borderRadius: '5px' }}
          >
            CSV
          </CSVLink>
          <button onClick={clearFilters} style={{ marginLeft: '10px' }}>Clear</button>
        </div>

        <div style={{ marginTop: '10px' }}>
          <label>Search by Description: </label>
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Type something..."
            style={{ marginLeft: '10px' }}
          />
        </div>
      </div>

      {loading ? <p>Loading...</p> : (
        <>
          <table border="1" cellPadding="8" cellSpacing="0" style={{ width: '100%', cursor: 'pointer' }}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Debit</th>
                <th>Credit</th>
                <th>Balance</th>
              </tr>
            </thead>
            <tbody>
              {filteredLedger.map((row, idx) => (
                <tr key={idx} onClick={() => handleRowClick(row)}>
                  <td>{row.date ? new Date(row.date).toLocaleDateString() : ''}</td>
                  <td style={{ fontWeight: row.isOpening ? 'bold' : 'normal' }}>{row.description}</td>
                  <td style={{ color: row.debit > 0 ? 'green' : 'black' }}>{row.debit.toFixed(2)}</td>
                  <td style={{ color: row.credit > 0 ? 'red' : 'black' }}>{row.credit.toFixed(2)}</td>
                  <td style={{
                    fontWeight: row.isOpening ? 'bold' : 'normal',
                    color: row.balance < 0 ? 'red' : 'green'
                  }}>
                    {row.balance.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* ✅ Summary & Graph */}
          <div style={{ display: 'flex', flexWrap: 'wrap', marginTop: '30px', gap: '30px' }}>
            {summary && (
              <div style={{
                padding: '20px',
                border: '1px solid #ccc',
                borderRadius: '8px',
                maxWidth: '400px',
                backgroundColor: '#f9f9f9',
                flex: '1 1 300px'
              }}>
                <h4>📊 Ledger Summary</h4>
                <p><strong>Opening Balance:</strong> {summary.opening.toFixed(2)}</p>
                <p><strong>Total Debit:</strong> {summary.totalDebit.toFixed(2)}</p>
                <p><strong>Total Credit:</strong> {summary.totalCredit.toFixed(2)}</p>
                <p><strong>Closing Balance:</strong> {summary.closing.toFixed(2)}</p>
              </div>
            )}

            <div style={{ height: 300, flex: '1 1 400px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="value" name="Amount">
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ✅ Back Button */}
          <div style={{ marginTop: '30px' }}>
            <button onClick={() => navigate('/dashboard')}>🔙 Back to Dashboard</button>
          </div>
        </>
      )}

      {/* ✅ Modal */}
      {selectedRow && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{
            background: '#fff',
            padding: '20px',
            borderRadius: '10px',
            maxWidth: '500px',
            width: '90%',
            boxShadow: '0 0 10px rgba(0,0,0,0.3)'
          }}>
            <h3>🧾 Entry Detail</h3>
            <p><strong>Date:</strong> {selectedRow.date ? new Date(selectedRow.date).toLocaleDateString() : '---'}</p>
            <p><strong>Description:</strong> {selectedRow.description}</p>
            <p><strong>Debit:</strong> {selectedRow.debit.toFixed(2)}</p>
            <p><strong>Credit:</strong> {selectedRow.credit.toFixed(2)}</p>
            <p><strong>Balance:</strong> {selectedRow.balance.toFixed(2)}</p>
            <button onClick={closeModal} style={{ marginTop: '10px' }}>Close</button>
          </div>
        </div>
      )}

      {/* ✅ Print Styles */}
      <style>
        {`
          @media print {
            .no-print { display: none; }
            #print-section { margin: 0; padding: 0; }
          }
        `}
      </style>
    </div>
  );
};

export default GeneralLedgerPage;
