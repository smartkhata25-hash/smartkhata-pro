import React, { useState, useEffect } from 'react';
import { getLedgerByAccount } from '../services/journalService';
import { getAllAccounts } from '../services/accountService';
import { useNavigate } from 'react-router-dom';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CSVLink } from 'react-csv';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { t } from '../i18n/i18n';

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
      alert(t('alerts.ledgerNeedsRefresh'));
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
      const response = await getLedgerByAccount(accountId, startDate, endDate);

      const data = Array.isArray(response) ? response : response.ledger || [];

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
      console.error(t('alerts.ledgerLoadError'), error);
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
    doc.text(t('ledger.generalReport'), 14, 15);

    const tableData = filteredLedger.map((row) => [
      row.date ? new Date(row.date).toLocaleDateString() : '',
      row.description,
      row.debit.toFixed(2),
      row.credit.toFixed(2),
      row.balance.toFixed(2),
    ]);

    autoTable(doc, {
      head: [[t('date'), t('description'), t('debit'), t('credit'), t('balance')]],
      body: tableData,
      startY: 20,
    });

    doc.save(t('ledger.generalLedgerFile') + '.pdf');
  };

  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredLedger(ledger);
    } else {
      const filtered = ledger.filter((row) =>
        row.description.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredLedger(filtered);
    }
  }, [searchTerm, ledger]);

  const chartData = [
    { name: 'Debit', value: summary?.totalDebit || 0, fill: '#16a34a' },
    { name: 'Credit', value: summary?.totalCredit || 0, fill: '#dc2626' },
  ];

  const handleRowClick = (row) => {
    if (!row.isOpening) setSelectedRow(row);
  };

  const closeModal = () => setSelectedRow(null);

  return (
    <div className="ledger-page">
      {/* HEADER */}
      <div className="ledger-header">
        <h2>📘 {t('ledger.generalLedger')}</h2>

        <select value={selectedAccount} onChange={handleAccountChange} className="ledger-select">
          <option value="">{t('accounts.selectAccount')}</option>
          {accounts.map((acc) => (
            <option key={acc._id} value={acc._id}>
              {acc.name}
            </option>
          ))}
        </select>

        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="ledger-input"
        />

        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="ledger-input"
        />

        <input
          type="text"
          placeholder={t('ledger.search')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="ledger-search"
        />

        <button className="btn gradient-blue" onClick={handleFilter}>
          {t('common.filter')}
        </button>

        <button className="btn gradient-purple" onClick={exportToPDF}>
          {t('common.pdf')}
        </button>

        <CSVLink
          data={filteredLedger.map((row) => ({
            Date: row.date ? new Date(row.date).toLocaleDateString() : '',
            Description: row.description,
            Debit: row.debit.toFixed(2),
            Credit: row.credit.toFixed(2),
            Balance: row.balance.toFixed(2),
          }))}
          filename={t('ledger.generalLedgerFile')}
          className="btn gradient-green"
        >
          CSV
        </CSVLink>

        <button className="btn gradient-red" onClick={clearFilters}>
          {t('clear')}
        </button>
      </div>

      {/* TABLE */}

      <div className="ledger-table-container">
        {loading ? (
          <p>{t('common.loading')}</p>
        ) : (
          <table className="ledger-table">
            <thead>
              <tr>
                <th>{t('date')}</th>
                <th>{t('description')}</th>
                <th>{t('debit')}</th>
                <th>{t('credit')}</th>
                <th>{t('balance')}</th>
              </tr>
            </thead>

            <tbody>
              {Array.isArray(filteredLedger) &&
                filteredLedger.map((row, idx) => (
                  <tr key={idx} onClick={() => handleRowClick(row)}>
                    <td>{row.date ? new Date(row.date).toLocaleDateString() : ''}</td>

                    <td
                      style={{
                        fontWeight: row.isOpening ? 'bold' : 'normal',
                      }}
                    >
                      {row.description}
                    </td>

                    <td className="debit">{row.debit.toFixed(2)}</td>

                    <td className="credit">{row.credit.toFixed(2)}</td>

                    <td className={row.balance < 0 ? 'balance-negative' : 'balance-positive'}>
                      {row.balance.toFixed(2)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </div>

      {/* SUMMARY + CHART */}

      <div className="ledger-bottom">
        {summary && (
          <div className="summary-card">
            <h3>{t('ledger.summary')}</h3>

            <p>
              <strong>{t('ledger.opening')}:</strong> {summary.opening.toFixed(2)}
            </p>

            <p>
              <strong>{t('ledger.totalDebit')}:</strong> {summary.totalDebit.toFixed(2)}
            </p>

            <p>
              <strong>{t('ledger.totalCredit')}:</strong> {summary.totalCredit.toFixed(2)}
            </p>

            <p>
              <strong>{t('ledger.closing')}:</strong> {summary.closing.toFixed(2)}
            </p>
          </div>
        )}

        <div className="chart-card">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />

              <XAxis dataKey="name" />

              <YAxis />

              <Tooltip />

              <Bar dataKey="value">
                {chartData.map((entry, index) => (
                  <Cell key={index} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* BACK BUTTON */}

      <div style={{ marginTop: '30px' }}>
        <button className="btn gradient-dark" onClick={() => navigate('/dashboard')}>
          {t('common.back')} {t('dashboard')}
        </button>
      </div>

      {/* MODAL */}

      {selectedRow && (
        <div className="modal-overlay">
          <div className="modal-box">
            <h3>{t('ledger.entryDetail')}</h3>

            <p>
              <strong>{t('date')}:</strong>{' '}
              {selectedRow.date ? new Date(selectedRow.date).toLocaleDateString() : '---'}
            </p>

            <p>
              <strong>{t('description')}:</strong> {selectedRow.description}
            </p>

            <p>
              <strong>{t('debit')}:</strong> {selectedRow.debit.toFixed(2)}
            </p>

            <p>
              <strong>{t('credit')}:</strong> {selectedRow.credit.toFixed(2)}
            </p>

            <p>
              <strong>{t('balance')}:</strong> {selectedRow.balance.toFixed(2)}
            </p>

            <button className="btn gradient-red" onClick={closeModal}>
              {t('close')}
            </button>
          </div>
        </div>
      )}

      {/* STYLES */}

      <style>{`

      .ledger-page{
      padding:20px;
      font-family:Segoe UI;
      background:#f5f7fb;
      }

      .ledger-header{
      display:flex;
      flex-wrap:wrap;
      gap:10px;
      align-items:center;
      background:white;
      padding:15px;
      border-radius:10px;
      box-shadow:0 2px 10px rgba(0,0,0,0.05);
      margin-bottom:20px;
      }

      .ledger-input,
      .ledger-select,
      .ledger-search{
      padding:8px 10px;
      border:1px solid #ccc;
      border-radius:6px;
      }

      .ledger-search{
      min-width:200px;
      }

      .btn{
      border:none;
      padding:8px 14px;
      border-radius:6px;
      color:white;
      cursor:pointer;
      font-weight:500;
      }

      .gradient-blue{
      background:linear-gradient(45deg,#3b82f6,#2563eb);
      }

      .gradient-purple{
      background:linear-gradient(45deg,#8b5cf6,#6d28d9);
      }

      .gradient-green{
      background:linear-gradient(45deg,#22c55e,#15803d);
      }

      .gradient-red{
      background:linear-gradient(45deg,#ef4444,#b91c1c);
      }

      .gradient-dark{
      background:linear-gradient(45deg,#374151,#111827);
      }

      .ledger-table-container{
      background:white;
      border-radius:10px;
      box-shadow:0 2px 10px rgba(0,0,0,0.05);
      overflow:auto;
      }

      .ledger-table{
      width:100%;
      border-collapse:collapse;
      }

      .ledger-table th{
      background:#f1f5f9;
      padding:12px;
      text-align:left;
      }

      .ledger-table td{
      padding:10px;
      border-top:1px solid #eee;
      }

      .ledger-table tr:hover{
      background:#f9fafb;
      }

      .debit{
      color:#16a34a;
      font-weight:500;
      }

      .credit{
      color:#dc2626;
      font-weight:500;
      }

      .balance-positive{
      color:#16a34a;
      font-weight:600;
      }

      .balance-negative{
      color:#dc2626;
      font-weight:600;
      }

      .ledger-bottom{
      display:flex;
      gap:20px;
      margin-top:20px;
      flex-wrap:wrap;
      }

      .summary-card{
      background:white;
      padding:20px;
      border-radius:10px;
      box-shadow:0 2px 10px rgba(0,0,0,0.05);
      min-width:250px;
      }

      .chart-card{
      background:white;
      padding:20px;
      border-radius:10px;
      box-shadow:0 2px 10px rgba(0,0,0,0.05);
      flex:1;
      }

      .modal-overlay{
      position:fixed;
      top:0;
      left:0;
      right:0;
      bottom:0;
      background:rgba(0,0,0,0.5);
      display:flex;
      justify-content:center;
      align-items:center;
      }

      .modal-box{
      background:white;
      padding:25px;
      border-radius:10px;
      width:350px;
      }

      `}</style>
    </div>
  );
};

export default GeneralLedgerPage;
