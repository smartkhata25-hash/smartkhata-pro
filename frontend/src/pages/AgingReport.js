import React, { useEffect, useState, useCallback, useRef } from 'react';
import { getAgingReport } from '../services/agingService';
import { useNavigate } from 'react-router-dom';
import { t } from '../i18n/i18n';

const AgingReport = () => {
  const navigate = useNavigate();
  const tableRef = useRef(null);

  const [originalData, setOriginalData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [loading, setLoading] = useState(true);

  const [filters, setFilters] = useState({
    searchName: '',
    asOfDate: '',
    onlyWithDue: false,
  });

  const [printSize, setPrintSize] = useState(localStorage.getItem('agingPrintSize') || 'A4');

  /* ================================
      FORMAT AMOUNT
  ================================= */

  const formatAmount = (num) =>
    new Intl.NumberFormat('en-PK', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num || 0);

  /* ================================
      FETCH DATA
  ================================= */

  const fetchReport = useCallback(async () => {
    try {
      setLoading(true);

      const params = {};
      if (filters.asOfDate) params.asOfDate = filters.asOfDate;

      const data = await getAgingReport(params);

      setOriginalData(data);
      setFilteredData(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [filters.asOfDate]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  useEffect(() => {
    localStorage.setItem('agingPrintSize', printSize);
  }, [printSize]);

  /* ================================
      FILTERS
  ================================= */

  useEffect(() => {
    let data = [...originalData];

    if (filters.searchName) {
      data = data.filter((c) =>
        c.customerName.toLowerCase().includes(filters.searchName.toLowerCase())
      );
    }

    if (filters.onlyWithDue) {
      data = data.filter((c) => c.total > 0);
    }

    setFilteredData(data);
  }, [filters, originalData]);

  const handleChange = (e) => {
    const { name, value, checked, type } = e.target;

    setFilters((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const clearFilters = () => {
    setFilters({
      searchName: '',
      asOfDate: '',
      onlyWithDue: false,
    });
  };

  const token = localStorage.getItem('token');

  /* ================================
   PRINT (SERVER PDF ENGINE)
================================ */

  const handlePrint = async () => {
    const query = new URLSearchParams({
      asOfDate: filters.asOfDate || '',
      size: printSize,
    }).toString();

    const response = await fetch(
      `${process.env.REACT_APP_API_BASE_URL}/api/print/aging-report/html?${query}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const html = await response.text();

    const newWindow = window.open('', '_blank');

    newWindow.document.write(html);
    newWindow.document.close();

    newWindow.onload = function () {
      newWindow.print();
    };
  };

  /* ================================
   PDF DOWNLOAD
================================ */

  const exportPDF = async () => {
    const query = new URLSearchParams({
      asOfDate: filters.asOfDate || '',
      size: printSize,
    }).toString();

    const response = await fetch(
      `${process.env.REACT_APP_API_BASE_URL}/api/print/aging-report/pdf?${query}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const blob = await response.blob();

    const url = window.URL.createObjectURL(blob);

    const link = document.createElement('a');

    link.href = url;
    link.download = 'Customer-Aging-Report.pdf';

    document.body.appendChild(link);

    link.click();

    link.remove();
  };

  /* ================================
      TOTALS
  ================================= */

  const totals = filteredData.reduce(
    (acc, item) => {
      acc.recent += item.aging.recent;
      acc.mid1 += item.aging.mid1;
      acc.mid2 += item.aging.mid2;
      acc.oldest += item.aging.oldest;
      acc.total += item.total;
      return acc;
    },
    {
      recent: 0,
      mid1: 0,
      mid2: 0,
      oldest: 0,
      total: 0,
    }
  );

  if (loading) {
    return <div className="p-10 text-center text-gray-500">{t('reports.loadingAging')}</div>;
  }

  return (
    <div className="page p-6">
      {/* PROFESSIONAL HEADER */}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'stretch',
          gap: 14,
          marginBottom: 16,
        }}
      >
        {/* LEFT SIDE — CONTROLS */}

        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            background: '#eef2ff',
            borderRadius: 14,
            padding: '10px 14px',
            height: 90,
            gap: 6,
            border: '1px solid #c7d2fe',
          }}
        >
          {/* ROW 1 */}

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder={t('customer.search')}
              name="searchName"
              value={filters.searchName}
              onChange={handleChange}
              style={{
                height: 36,
                minWidth: 220,
                borderRadius: 8,
                border: '1px solid #93c5fd',
                padding: '0 12px',
                background: '#ffffff',
                fontWeight: 600,
              }}
            />

            <input
              type="date"
              name="asOfDate"
              value={filters.asOfDate}
              onChange={handleChange}
              style={{
                height: 36,
                borderRadius: 8,
                border: '1px solid #93c5fd',
                padding: '0 10px',
                background: '#ffffff',
              }}
            />

            <select
              value={printSize}
              onChange={(e) => setPrintSize(e.target.value)}
              style={{
                height: 36,
                borderRadius: 8,
                border: '1px solid #93c5fd',
                padding: '0 10px',
                background: '#ffffff',
                fontWeight: 600,
              }}
            >
              <option value="A4">A4</option>
              <option value="A5">A5</option>
            </select>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontWeight: 600,
              }}
            >
              <input
                type="checkbox"
                name="onlyWithDue"
                checked={filters.onlyWithDue}
                onChange={handleChange}
              />
              {t('reports.dueOnly')}
            </label>
          </div>

          {/* ROW 2 */}

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              style={{
                height: 36,
                padding: '0 18px',
                borderRadius: 10,
                background: 'linear-gradient(135deg,#6366f1,#3b82f6)',
                border: 'none',
                color: '#fff',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
              }}
              onClick={fetchReport}
            >
              {t('load')}
            </button>

            <button
              style={{
                height: 36,
                padding: '0 18px',
                borderRadius: 10,
                background: 'linear-gradient(135deg,#ef4444,#f97316)',
                border: 'none',
                color: '#fff',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
              }}
              onClick={clearFilters}
            >
              {t('clear')}
            </button>

            <button
              style={{
                height: 36,
                padding: '0 18px',
                borderRadius: 10,
                background: 'linear-gradient(135deg,#6366f1,#4338ca)',
                border: 'none',
                color: '#fff',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
              }}
              onClick={handlePrint}
            >
              {t('print')}
            </button>

            <button
              style={{
                height: 36,
                padding: '0 18px',
                borderRadius: 10,
                background: 'linear-gradient(135deg,#f59e0b,#d97706)',
                border: 'none',
                color: '#fff',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
              }}
              onClick={exportPDF}
            >
              {t('pdf')}
            </button>
          </div>
        </div>

        {/* RIGHT SIDE — SUMMARY CARDS */}

        <div
          style={{
            display: 'flex',
            gap: 12,
            alignItems: 'stretch',
          }}
        >
          <div className="card" style={{ minWidth: 150 }}>
            <div style={{ color: '#2563eb', fontWeight: 600 }}>{t('reports.totalReceivable')}</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>Rs {formatAmount(totals.total)}</div>
          </div>

          <div className="card" style={{ minWidth: 150 }}>
            <div style={{ color: '#16a34a', fontWeight: 600 }}>{t('reports.days0_30')}</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>Rs {formatAmount(totals.recent)}</div>
          </div>

          <div className="card" style={{ minWidth: 150 }}>
            <div style={{ color: '#d97706', fontWeight: 600 }}>{t('reports.days31_60')}</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>Rs {formatAmount(totals.mid1)}</div>
          </div>

          <div className="card" style={{ minWidth: 150 }}>
            <div style={{ color: '#dc2626', fontWeight: 600 }}>{t('reports.days90plus')}</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>Rs {formatAmount(totals.oldest)}</div>
          </div>
        </div>
      </div>

      {/* TABLE */}

      <div className="card table-wrapper mt-6" ref={tableRef}>
        <table className="table" style={{ width: '100%', tableLayout: 'fixed' }}>
          <thead>
            <tr>
              <th style={{ width: '30%' }}>{t('customer')}</th>

              <th style={{ width: '14%' }}>0-30</th>

              <th style={{ width: '14%' }}>31-60</th>

              <th style={{ width: '14%' }}>61-90</th>

              <th style={{ width: '14%' }}>90+</th>

              <th style={{ width: '14%' }}>{t('total')}</th>
            </tr>
          </thead>

          <tbody>
            {filteredData.length === 0 ? (
              <tr>
                <td colSpan="6">{t('common.noRecords')}</td>
              </tr>
            ) : (
              <>
                {filteredData.map((item) => (
                  <tr key={item.customerId} className="ledger-row">
                    <td
                      className="text-blue-600 cursor-pointer font-medium text-left"
                      onClick={() => navigate(`/customer-ledger/${item.customerId}`)}
                    >
                      {item.customerName}
                    </td>

                    <td className="text-green-700 font-semibold text-right">
                      {formatAmount(item.aging.recent)}
                    </td>

                    <td className="text-yellow-700 font-semibold text-right">
                      {formatAmount(item.aging.mid1)}
                    </td>

                    <td className="text-orange-600 font-semibold text-right">
                      {formatAmount(item.aging.mid2)}
                    </td>

                    <td className="text-red-600 font-bold text-right">
                      {formatAmount(item.aging.oldest)}
                    </td>

                    <td className="font-bold text-blue-900 text-right">
                      {formatAmount(item.total)}
                    </td>
                  </tr>
                ))}

                {/* TOTAL ROW */}

                <tr className="totals-row font-bold">
                  <td className="text-center">{t('reports.grandTotal')}</td>

                  <td className="text-center">{formatAmount(totals.recent)}</td>

                  <td className="text-center">{formatAmount(totals.mid1)}</td>

                  <td className="text-center">{formatAmount(totals.mid2)}</td>

                  <td className="text-center">{formatAmount(totals.oldest)}</td>

                  <td className="text-center">{formatAmount(totals.total)}</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AgingReport;
