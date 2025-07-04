import React, { useState, useEffect } from 'react';

const AccountTransactionTable = ({ transactions = [] }) => {
  const [filtered, setFiltered] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    if (!Array.isArray(transactions)) {
      setFiltered([]);
      return;
    }

    let result = [...transactions];

    if (searchText.trim() !== '') {
      result = result.filter(
        (txn) =>
          txn.description?.toLowerCase().includes(searchText.toLowerCase()) ||
          txn.billNo?.toLowerCase().includes(searchText.toLowerCase())
      );
    }

    if (typeFilter !== 'all') {
      result = result.filter((txn) => (typeFilter === 'debit' ? txn.debit > 0 : txn.credit > 0));
    }

    if (startDate) {
      result = result.filter((txn) => new Date(txn.date) >= new Date(startDate));
    }

    if (endDate) {
      result = result.filter((txn) => new Date(txn.date) <= new Date(endDate));
    }

    setFiltered(result);
  }, [transactions, searchText, typeFilter, startDate, endDate]);

  return (
    <div style={{ marginTop: '20px' }}>
      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Search description or bill no..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={input}
        />
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={input}>
          <option value="all">All</option>
          <option value="debit">Debit Only</option>
          <option value="credit">Credit Only</option>
        </select>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          style={input}
        />
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          style={input}
        />
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <p style={{ color: '#888', textAlign: 'center' }}>No transactions found.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Date</th>
              <th style={th}>Time</th>
              <th style={th}>Bill No</th>
              <th style={th}>Source</th>
              <th style={th}>Payment Type</th>
              <th style={th}>Description</th>
              <th style={th}>Debit</th>
              <th style={th}>Credit</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((txn) => (
              <tr key={txn._id || txn.referenceId || Math.random()}>
                <td style={td}>
                  {txn.date ? new Date(txn.date).toLocaleDateString('en-GB') : '-'}
                </td>
                <td style={td}>{txn.time || '-'}</td>
                <td style={td}>{txn.billNo || '-'}</td>
                <td style={td}>{txn.sourceType || txn.source || '-'}</td>
                <td style={td}>{txn.paymentType || '-'}</td>
                <td style={td}>{txn.description || '-'}</td>
                <td style={td}>{txn.debit > 0 ? `Rs. ${txn.debit.toLocaleString()}` : '-'}</td>
                <td style={td}>{txn.credit > 0 ? `Rs. ${txn.credit.toLocaleString()}` : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

// Styles
const th = {
  border: '1px solid #ccc',
  padding: '10px',
  backgroundColor: '#f2f2f2',
  textAlign: 'left',
};

const td = {
  border: '1px solid #ccc',
  padding: '10px',
};

const input = {
  padding: '8px',
  borderRadius: '5px',
  border: '1px solid #ccc',
};

export default AccountTransactionTable;
