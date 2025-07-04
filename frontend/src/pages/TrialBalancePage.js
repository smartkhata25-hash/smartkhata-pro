// ✅ src/pages/TrialBalancePage.js

import React, { useEffect, useState, useCallback } from 'react';
import { getTrialBalance } from '../services/journalService';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

const TrialBalancePage = () => {
  const [trialData, setTrialData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [isBalanced, setIsBalanced] = useState(true);
  const [totals, setTotals] = useState({ debit: 0, credit: 0 });
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const fetchData = useCallback(async () => {
    const data = await getTrialBalance(startDate, endDate);
    setTrialData(data.trialBalance);
    setFilteredData(data.trialBalance);
    setIsBalanced(data.isBalanced);
    setTotals({ debit: data.totalDebit, credit: data.totalCredit });
  }, [startDate, endDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const filtered = trialData.filter(row =>
      row.accountName.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredData(filtered);
  }, [searchTerm, trialData]);

  const exportToPDF = () => {
    const doc = new jsPDF();
    doc.text('Trial Balance Report', 14, 15);

    const tableData = trialData.map(row => [
      row.accountName,
      row.debit.toFixed(2),
      row.credit.toFixed(2),
    ]);

    tableData.push([
      'Total',
      totals.debit.toFixed(2),
      totals.credit.toFixed(2),
    ]);

    autoTable(doc, {
      head: [['Account Name', 'Debit', 'Credit']],
      body: tableData,
      startY: 20,
    });

    doc.save('trial_balance.pdf');
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div id="print-section" style={{ padding: '20px' }}>
      <h2>📊 Trial Balance</h2>

      <div className="no-print" style={{ marginBottom: '20px' }}>
        <label>From: </label>
        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
        <label style={{ marginLeft: '10px' }}>To: </label>
        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
        <button onClick={fetchData} style={{ marginLeft: '10px' }}>Filter</button>
        <button onClick={exportToPDF} style={{ marginLeft: '10px' }}>PDF</button>
        <button onClick={handlePrint} style={{ marginLeft: '10px' }}>Print</button>
        <div style={{ marginTop: '10px' }}>
          <label>Search Account: </label>
          <input
            type="text"
            placeholder="Enter account name..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ marginLeft: '10px' }}
          />
        </div>
      </div>

      <table border="1" cellPadding="10" cellSpacing="0" style={{ width: '100%' }}>
        <thead>
          <tr>
            <th>Account Name</th>
            <th>Debit</th>
            <th>Credit</th>
          </tr>
        </thead>
        <tbody>
          {filteredData.map((row, index) => (
            <tr key={index}>
              <td>{row.accountName}</td>
              <td>{row.debit.toFixed(2)}</td>
              <td>{row.credit.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td><strong>Total</strong></td>
            <td><strong>{totals.debit.toFixed(2)}</strong></td>
            <td><strong>{totals.credit.toFixed(2)}</strong></td>
          </tr>
        </tfoot>
      </table>

      <div style={{ marginTop: '20px', fontWeight: 'bold', color: isBalanced ? 'green' : 'red' }}>
        {isBalanced ? '✅ Trial Balance is Balanced' : '❌ Trial Balance is NOT Balanced'}
      </div>

      <div className="no-print" style={{ marginTop: '30px', height: '300px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={filteredData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="accountName" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="debit" fill="#82ca9d" name="Debit" />
            <Bar dataKey="credit" fill="#8884d8" name="Credit" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default TrialBalancePage;
