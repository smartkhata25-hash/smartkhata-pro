// src/components/MonthlySalesChart.js

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
  Title,
} from 'chart.js';
import { t } from '../i18n/i18n';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend, Title);

const MonthlySalesChart = () => {
  const currentYear = new Date().getFullYear();

  const [labels, setLabels] = useState([]);
  const [salesData, setSalesData] = useState([]);

  const [year, setYear] = useState(currentYear);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const baseUrl = process.env.REACT_APP_API_BASE_URL;

  const fetchSales = async (selectedYear = currentYear) => {
    try {
      setLoading(true);

      const token = localStorage.getItem('token');

      const res = await axios.get(`${baseUrl}/api/dashboard-monthly-sales?year=${selectedYear}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = res.data || {};

      setLabels(data.labels || []);
      setSalesData(data.data || []);

      setError('');
    } catch (err) {
      console.error('Monthly sales fetch error:', err);
      setError(t('alerts.salesLoadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSales(year);
    // eslint-disable-next-line
  }, [year]);

  const handleReset = () => {
    setYear(currentYear);
  };

  const handleExportCSV = () => {
    const rows = [[t('month'), t('sales')]];

    labels.forEach((label, i) => {
      rows.push([label, salesData[i] || 0]);
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map((e) => e.join(',')).join('\n');

    const encodedUri = encodeURI(csvContent);

    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `monthly_sales_${year}.csv`);
    document.body.appendChild(link);

    link.click();
  };

  const totalSales = salesData.reduce((a, b) => a + b, 0);
  const avgSales = salesData.length ? Math.round(totalSales / salesData.length) : 0;

  const chartData = {
    labels: labels,

    datasets: [
      {
        label: t('dashboard.monthlySalesRs'),
        data: salesData,

        backgroundColor: [
          'rgba(37,99,235,0.9)',
          'rgba(59,130,246,0.9)',
          'rgba(99,102,241,0.9)',
          'rgba(79,70,229,0.9)',
          'rgba(147,51,234,0.9)',
          'rgba(139,92,246,0.9)',
          'rgba(16,185,129,0.9)',
          'rgba(34,197,94,0.9)',
          'rgba(14,165,233,0.9)',
          'rgba(6,182,212,0.9)',
          'rgba(20,184,166,0.9)',
          'rgba(59,130,246,0.9)',
        ],

        borderRadius: 10,
        borderSkipped: false,
        barThickness: 36,
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
        labels: {
          font: {
            size: 13,
          },
        },
      },

      tooltip: {
        backgroundColor: '#111827',
        titleColor: '#fff',
        bodyColor: '#fff',

        callbacks: {
          label: function (context) {
            return `${t('sales')}: Rs. ${context.raw.toLocaleString()}`;
          },
        },
      },

      title: {
        display: true,
        text: `${t('dashboard.monthlySalesOverview')} - ${year}`,
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
            return 'Rs. ' + value.toLocaleString();
          },
        },

        grid: {
          color: '#f1f5f9',
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
        borderRadius: '14px',
        marginTop: '40px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
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
        <h2 style={{ margin: 0 }}>📈 {t('dashboard.monthlySales')}</h2>

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
              background: 'linear-gradient(135deg,#6b7280,#4b5563)',
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
              background: 'linear-gradient(135deg,#2563eb,#1d4ed8)',
              color: 'white',
              padding: '6px 12px',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            {t('exportCSV')}
          </button>
        </div>
      </div>

      {/* SUMMARY */}

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
            background: '#eff6ff',
            padding: 15,
            borderRadius: 10,
          }}
        >
          <strong>{t('totalSales')}</strong>

          <div
            style={{
              fontSize: 20,
              color: '#2563eb',
            }}
          >
            Rs. {totalSales.toLocaleString()}
          </div>
        </div>

        <div
          style={{
            flex: 1,
            background: '#f0fdf4',
            padding: 15,
            borderRadius: 10,
          }}
        >
          <strong>{t('dashboard.avgMonthlySales')}</strong>

          <div
            style={{
              fontSize: 20,
              color: '#16a34a',
            }}
          >
            Rs. {avgSales.toLocaleString()}
          </div>
        </div>
      </div>

      {/* CHART */}

      <div style={{ height: 380 }}>
        {loading ? (
          <p>{t('dashboard.loadingChart')}</p>
        ) : error ? (
          <p style={{ color: 'red' }}>{error}</p>
        ) : salesData.length === 0 ? (
          <p>
            {t('dashboard.noSalesData')} {year}
          </p>
        ) : (
          <Bar data={chartData} options={chartOptions} />
        )}
      </div>

      <p
        style={{
          marginTop: 15,
          fontSize: 13,
          color: '#666',
          textAlign: 'center',
        }}
      >
        {t('dashboard.salesChartNote')}
      </p>
    </div>
  );
};

export default MonthlySalesChart;
