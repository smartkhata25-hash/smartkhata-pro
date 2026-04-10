import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  Legend,
  Tooltip,
  Title,
} from 'chart.js';
import { t } from '../i18n/i18n';

ChartJS.register(BarElement, CategoryScale, LinearScale, Legend, Tooltip, Title);

const CashFlowChart = () => {
  const currentYear = new Date().getFullYear();

  const [labels, setLabels] = useState([]);
  const [inflow, setInflow] = useState([]);
  const [outflow, setOutflow] = useState([]);

  const [year, setYear] = useState(currentYear);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const baseUrl = process.env.REACT_APP_API_BASE_URL;

  const fetchCashFlow = async (selectedYear = currentYear) => {
    try {
      setLoading(true);

      const token = localStorage.getItem('token');

      const res = await axios.get(
        `${baseUrl}/api/dashboard-monthly-cashflow?year=${selectedYear}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = res.data || {};

      setLabels(data.labels || []);
      setInflow(data.inflow || []);
      setOutflow(data.outflow || []);
      setError('');
    } catch (err) {
      console.error('Cash Flow Chart Error:', err);
      setError(t('dashboard.cashflowLoadError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCashFlow(year);
    // eslint-disable-next-line
  }, [year]);

  const handleReset = () => {
    setYear(currentYear);
  };

  const handleExportCSV = () => {
    const rows = [[t('month'), t('dashboard.cashInflow'), t('dashboard.cashOutflow')]];

    labels.forEach((label, i) => {
      rows.push([label, inflow[i] || 0, outflow[i] || 0]);
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map((e) => e.join(',')).join('\n');

    const encodedUri = encodeURI(csvContent);

    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `cash_flow_${year}.csv`);
    document.body.appendChild(link);

    link.click();
  };

  const handleExportJSON = () => {
    const data = labels.map((month, i) => ({
      month,
      inflow: inflow[i] || 0,
      outflow: outflow[i] || 0,
    }));

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });

    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `cash_flow_${year}.json`;
    link.click();
  };

  const totalInflow = inflow.reduce((a, b) => a + b, 0);
  const totalOutflow = outflow.reduce((a, b) => a + b, 0);
  const netCash = totalInflow - totalOutflow;

  const chartData = {
    labels,
    datasets: [
      {
        label: t('dashboard.cashInflow'),
        data: inflow,
        backgroundColor: 'rgba(34,197,94,0.85)',
        borderRadius: 8,
        barThickness: 32,
      },
      {
        label: t('dashboard.cashOutflow'),
        data: outflow,
        backgroundColor: 'rgba(239,68,68,0.85)',
        borderRadius: 8,
        barThickness: 32,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,

    interaction: {
      mode: 'index',
      intersect: false,
    },

    plugins: {
      legend: {
        position: 'top',
      },

      tooltip: {
        callbacks: {
          label: function (context) {
            return `${context.dataset.label}: Rs. ${context.raw}`;
          },
        },
      },

      title: {
        display: true,
        text: `${t('dashboard.monthlyCashFlow')} - ${year}`,
        font: {
          size: 18,
          weight: 'bold',
        },
      },
    },

    scales: {
      y: {
        beginAtZero: true,

        ticks: {
          callback: function (value) {
            return 'Rs. ' + value;
          },
        },

        grid: {
          color: '#f1f1f1',
        },
      },

      x: {
        grid: {
          display: false,
        },
      },
    },
  };

  return (
    <div
      style={{
        background: '#ffffff',
        padding: '25px',
        borderRadius: '12px',
        margin: '40px auto',
        maxWidth: '1000px',
        boxShadow: '0 6px 18px rgba(0,0,0,0.08)',
      }}
    >
      {/* HEADER */}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          alignItems: 'center',
          marginBottom: 20,
          gap: 10,
        }}
      >
        <h2 style={{ margin: 0 }}>💸 {t('dashboard.monthlyCashFlow')}</h2>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: '1px solid #ccc',
            }}
          >
            {[...Array(7)].map((_, i) => {
              const y = currentYear - i;
              return (
                <option key={y} value={y}>
                  {y}
                </option>
              );
            })}
          </select>

          <button
            onClick={handleReset}
            style={{
              background: '#64748b',
              color: 'white',
              padding: '6px 12px',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            {t('reset')}
          </button>

          <button
            onClick={handleExportCSV}
            style={{
              background: '#2563eb',
              color: 'white',
              padding: '6px 12px',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            {t('exportCSV')}
          </button>

          <button
            onClick={handleExportJSON}
            style={{
              background: '#16a34a',
              color: 'white',
              padding: '6px 12px',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            {t('exportJSON')}
          </button>
        </div>
      </div>

      {/* SUMMARY CARDS */}

      <div
        style={{
          display: 'flex',
          gap: 20,
          flexWrap: 'wrap',
          marginBottom: 20,
        }}
      >
        <div
          style={{
            flex: 1,
            background: '#f0fdf4',
            padding: 15,
            borderRadius: 10,
          }}
        >
          <strong>{t('dashboard.totalInflow')}</strong>
          <div style={{ fontSize: 20, color: '#16a34a' }}>Rs. {totalInflow.toLocaleString()}</div>
        </div>

        <div
          style={{
            flex: 1,
            background: '#fef2f2',
            padding: 15,
            borderRadius: 10,
          }}
        >
          <strong>{t('dashboard.totalOutflow')}</strong>
          <div style={{ fontSize: 20, color: '#dc2626' }}>Rs. {totalOutflow.toLocaleString()}</div>
        </div>

        <div
          style={{
            flex: 1,
            background: '#eff6ff',
            padding: 15,
            borderRadius: 10,
          }}
        >
          <strong>{t('dashboard.netCashFlow')}</strong>
          <div
            style={{
              fontSize: 20,
              color: netCash >= 0 ? '#16a34a' : '#dc2626',
            }}
          >
            Rs. {netCash.toLocaleString()}
          </div>
        </div>
      </div>

      {/* CHART */}

      <div style={{ height: 350 }}>
        {loading ? (
          <p>{t('dashboard.loadingChart')}</p>
        ) : error ? (
          <p style={{ color: 'red' }}>{error}</p>
        ) : (
          <Bar data={chartData} options={chartOptions} />
        )}
      </div>

      {/* FOOTNOTE */}

      <p
        style={{
          marginTop: 15,
          fontSize: 13,
          color: '#666',
          textAlign: 'center',
        }}
      >
        {t('dashboard.cashflowNote')}
      </p>
    </div>
  );
};

export default CashFlowChart;
