// ✅ src/pages/IncomeStatementPage.js

import React, { useState } from 'react';
import { fetchIncomeStatement } from '../services/journalService';

const IncomeStatementPage = () => {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [statement, setStatement] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleFetch = async () => {
    if (!startDate || !endDate) return alert('Please select both dates');
    setLoading(true);
    const token = localStorage.getItem('token');
    const data = await fetchIncomeStatement(startDate, endDate, token);
    setStatement(data);
    setLoading(false);
  };

  return (
    <div className="container" style={{ padding: '2rem' }}>
      <h2>📊 Income Statement</h2>

      <div style={{ margin: '1rem 0' }}>
        <label>Start Date: </label>
        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />

        <label style={{ marginLeft: '1rem' }}>End Date: </label>
        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />

        <button onClick={handleFetch} style={{ marginLeft: '1rem' }}>
          {loading ? 'Loading...' : 'Generate'}
        </button>
      </div>

      {statement && (
        <div style={{ marginTop: '2rem' }}>
          <h3>Result:</h3>
          <p><strong>Total Revenue:</strong> Rs. {statement.revenue}</p>
          <p><strong>Total Expenses:</strong> Rs. {statement.expenses}</p>
          <p><strong>Net Income:</strong> Rs. {statement.netIncome}</p>
        </div>
      )}
    </div>
  );
};

export default IncomeStatementPage;
