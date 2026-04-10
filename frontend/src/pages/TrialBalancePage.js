// ✅ src/pages/TrialBalancePage.js

import React, { useEffect, useState, useCallback } from 'react';
import { getTrialBalance } from '../services/journalService';
import { useNavigate } from 'react-router-dom';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { t } from '../i18n/i18n';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

const TrialBalancePage = () => {
  const navigate = useNavigate();
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
    setTotals({
      debit: data.totalDebit,
      credit: data.totalCredit,
    });
  }, [startDate, endDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const filtered = trialData.filter((row) =>
      row.accountName.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredData(filtered);
  }, [searchTerm, trialData]);

  const exportToPDF = () => {
    const doc = new jsPDF();

    doc.text(t('reports.trialBalanceReport'), 14, 15);

    const tableData = filteredData.map((row) => [
      row.accountName,
      row.debit.toFixed(2),
      row.credit.toFixed(2),
    ]);

    tableData.push([t('totals'), totals.debit.toFixed(2), totals.credit.toFixed(2)]);

    autoTable(doc, {
      head: [[t('account.name'), t('debit'), t('credit')]],
      body: tableData,
      startY: 20,
    });

    doc.save('trial_balance.pdf');
  };

  const handlePrint = () => {
    window.print();
  };

  const difference = totals.debit - totals.credit;

  return (
    <div
      id="print-section"
      style={{
        padding: '20px',
        background: '#f4f6f9',
      }}
    >
      {/* SINGLE HEADER ROW */}

      <div
        className="no-print"
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 10,
          background: 'linear-gradient(135deg,#0f172a,#1e293b)',
          borderRadius: 14,
          padding: '12px 14px',
          border: '1px solid #334155',
          marginBottom: 12,
        }}
      >
        {/* TITLE */}
        <div style={{ color: '#fff', fontWeight: 600, marginRight: 10 }}>
          📊 {t('reports.trialBalance')}
        </div>

        {/* FROM DATE */}
        <span style={{ color: '#cbd5f5', fontSize: 12 }}>{t('date.from')}</span>
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

        {/* TO DATE */}
        <span style={{ color: '#cbd5f5', fontSize: 12 }}>{t('date.to')}</span>
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

        {/* BUTTONS */}
        <button
          onClick={fetchData}
          style={{
            background: '#3b82f6',
            color: '#fff',
            border: 'none',
            padding: '6px 14px',
            borderRadius: 8,
            cursor: 'pointer',
          }}
        >
          🔍
        </button>

        <button
          onClick={exportToPDF}
          style={{
            background: '#6366f1',
            color: '#fff',
            border: 'none',
            padding: '6px 14px',
            borderRadius: 8,
            cursor: 'pointer',
          }}
        >
          PDF
        </button>

        <button
          onClick={handlePrint}
          style={{
            background: '#22c55e',
            color: '#fff',
            border: 'none',
            padding: '6px 14px',
            borderRadius: 8,
            cursor: 'pointer',
          }}
        >
          Print
        </button>

        {/* SEARCH */}
        <input
          type="text"
          placeholder={t('account.search')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            marginLeft: 10,
            height: 34,
            borderRadius: 8,
            border: '1px solid #93c5fd',
            padding: '0 10px',
            background: '#fff',
          }}
        />

        {/* TOTALS (CARDS STYLE - IMPROVED) */}
        <div
          style={{
            marginLeft: 'auto',
            display: 'flex',
            gap: 10,
          }}
        >
          {/* DEBIT */}
          <div
            style={{
              background: 'rgba(34,197,94,0.15)',
              padding: '6px 10px',
              borderRadius: 8,
              minWidth: 90,
            }}
          >
            <div style={{ fontSize: 11, color: '#86efac' }}>Debit</div>
            <strong style={{ color: '#22c55e' }}>{totals.debit.toFixed(2)}</strong>
          </div>

          {/* CREDIT */}
          <div
            style={{
              background: 'rgba(59,130,246,0.15)',
              padding: '6px 10px',
              borderRadius: 8,
              minWidth: 90,
            }}
          >
            <div style={{ fontSize: 11, color: '#93c5fd' }}>Credit</div>
            <strong style={{ color: '#3b82f6' }}>{totals.credit.toFixed(2)}</strong>
          </div>

          {/* DIFFERENCE */}
          <div
            style={{
              background: 'rgba(255,255,255,0.08)',
              padding: '6px 10px',
              borderRadius: 8,
              minWidth: 90,
            }}
          >
            <div style={{ fontSize: 11, color: '#cbd5f5' }}>Diff</div>
            <strong style={{ color: difference === 0 ? '#22c55e' : '#ef4444' }}>
              {difference.toFixed(2)}
            </strong>
          </div>
        </div>
      </div>
      {/* TABLE */}

      <div
        style={{
          background: '#fff',
          borderRadius: '8px',
          boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
          overflow: 'hidden',
        }}
      >
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
          }}
        >
          <thead style={{ background: '#f1f3f6' }}>
            <tr>
              <th style={{ padding: '12px', textAlign: 'left' }}>{t('account.name')}</th>
              <th style={{ padding: '12px', textAlign: 'center' }}>{t('debit')}</th>
              <th style={{ padding: '12px', textAlign: 'center' }}>{t('credit')}</th>
            </tr>
          </thead>

          <tbody>
            {filteredData.map((row, index) => (
              <tr
                key={index}
                style={{
                  borderTop: '1px solid #eee',
                  background: index % 2 === 0 ? '#fff' : '#fafafa',
                }}
              >
                <td
                  style={{
                    padding: '10px',
                    color: '#007bff',
                    cursor: 'pointer',
                    fontWeight: '500',
                  }}
                  onClick={() => navigate(`/ledger/${row.accountId}`)}
                >
                  {row.accountName}
                </td>
                <td style={{ padding: '10px', textAlign: 'center' }}>{row.debit.toFixed(2)}</td>
                <td style={{ padding: '10px', textAlign: 'center' }}>{row.credit.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>

          <tfoot style={{ background: '#f1f3f6' }}>
            <tr>
              <td style={{ padding: '12px' }}>
                <strong>{t('totals')}</strong>
              </td>
              <td style={{ padding: '12px', textAlign: 'center' }}>
                <strong>{totals.debit.toFixed(2)}</strong>
              </td>
              <td style={{ padding: '12px', textAlign: 'center' }}>
                <strong>{totals.credit.toFixed(2)}</strong>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* BALANCE MESSAGE */}

      <div
        style={{
          marginTop: '10px',
          fontWeight: 'bold',
          color: isBalanced ? 'green' : 'red',
        }}
      >
        {isBalanced ? t('reports.trialBalanced') : t('reports.trialNotBalanced')}
      </div>

      {/* CHART */}

      <div
        className="no-print"
        style={{
          marginTop: '30px',
          background: '#fff',
          padding: '20px',
          borderRadius: '8px',
          boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
          height: '350px',
        }}
      >
        <h3 style={{ marginBottom: '10px' }}>{t('reports.accountComparison')}</h3>

        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={filteredData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="accountName" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="debit" fill="#4caf50" name={t('debit')} />
            <Bar dataKey="credit" fill="#2196f3" name={t('credit')} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default TrialBalancePage;
