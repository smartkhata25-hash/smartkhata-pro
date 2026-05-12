import React, { useEffect, useMemo, useState } from 'react';

import { fetchStockValueReport } from '../services/stockValueService';

import { getCategories } from '../services/categoryService';

import { t } from '../i18n/i18n';

const StockValueReportPage = () => {
  const isMobile = window.innerWidth < 768;
  const [loading, setLoading] = useState(false);

  const [rows, setRows] = useState([]);

  const [categories, setCategories] = useState([]);

  const [summary, setSummary] = useState({
    totalProducts: 0,
    totalQty: 0,
    totalCostValue: 0,
    totalSaleValue: 0,
    negativeStockValue: 0,
  });

  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    search: '',
    categoryId: '',
    hideZero: true,
    negativeOnly: false,
  });

  /* =========================================================
     📦 LOAD REPORT
  ========================================================= */

  const loadReport = async () => {
    try {
      setLoading(true);

      const data = await fetchStockValueReport(filters);

      const sortedRows = [...(data.rows || [])].sort((a, b) => b.costValue - a.costValue);

      setRows(sortedRows);

      setSummary(
        data.summary || {
          totalProducts: 0,
          totalQty: 0,
          totalCostValue: 0,
          totalSaleValue: 0,
          negativeStockValue: 0,
        }
      );
    } catch (err) {
      console.error(err);

      alert(err.message || t('alerts.somethingWrong') || 'Failed to load report');
    }

    setLoading(false);
  };

  /* =========================================================
     📂 LOAD CATEGORIES
  ========================================================= */

  const loadCategories = async () => {
    try {
      const data = await getCategories();

      setCategories(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    }
  };

  /* =========================================================
     🚀 INITIAL LOAD
  ========================================================= */

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    loadReport();
    // eslint-disable-next-line
  }, []);

  /* =========================================================
     🔄 FILTERED TOTALS
  ========================================================= */

  const liveTotals = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.totalProducts += 1;

        acc.totalQty += Number(row.stockQty || 0);

        acc.totalCostValue += Number(row.costValue || 0);

        acc.totalSaleValue += Number(row.saleValue || 0);

        return acc;
      },

      {
        totalProducts: 0,
        totalQty: 0,
        totalCostValue: 0,
        totalSaleValue: 0,
      }
    );
  }, [rows]);

  /* =========================================================
     🔍 HANDLE FILTER CHANGE
  ========================================================= */

  const handleChange = (key, value) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  /* =========================================================
     🔎 APPLY FILTERS
  ========================================================= */

  const handleApplyFilters = () => {
    loadReport();
  };

  const handleClearFilters = () => {
    const resetFilters = {
      startDate: '',
      endDate: '',
      search: '',
      categoryId: '',
      hideZero: true,
      negativeOnly: false,
    };

    setFilters(resetFilters);

    setTimeout(() => {
      loadReport();
    }, 0);
  };

  /* =========================================================
     🖨 PRINT
  ========================================================= */

  const handlePrint = () => {
    window.print();
  };

  /* =========================================================
     🎨 SUMMARY CARDS
  ========================================================= */

  const headerCards = (
    <div className="flex flex-wrap gap-2">
      <SummaryCard
        title="Products"
        value={liveTotals.totalProducts}
        gradient="linear-gradient(135deg, #2563eb, #1d4ed8)"
      />

      <SummaryCard
        title="Qty"
        value={Number(liveTotals.totalQty || 0).toLocaleString()}
        gradient="linear-gradient(135deg, #7c3aed, #6d28d9)"
      />

      <SummaryCard
        title="Cost Value"
        value={`Rs. ${Number(liveTotals.totalCostValue || 0).toLocaleString()}`}
        gradient="linear-gradient(135deg, #059669, #047857)"
      />

      <SummaryCard
        title="Sale Value"
        value={`Rs. ${Number(liveTotals.totalSaleValue || 0).toLocaleString()}`}
        gradient="linear-gradient(135deg, #ea580c, #c2410c)"
      />

      <SummaryCard
        title="Negative Stock"
        value={`Rs. ${Number(summary.negativeStockValue || 0).toLocaleString()}`}
        gradient="linear-gradient(135deg, #dc2626, #991b1b)"
      />
    </div>
  );

  /* =========================================================
     🎛 FILTERS
  ========================================================= */

  const headerContent = (
    <div
      style={{
        background: 'linear-gradient(135deg, #ffffff, #f8fafc)',
        border: '1px solid #e5e7eb',
        borderRadius: isMobile ? 10 : 14,
        padding: isMobile ? 5 : 8,
        boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
      }}
    >
      <div className={`flex flex-wrap items-center ${isMobile ? 'gap-1' : 'gap-3'}`}>
        {/* SEARCH */}
        <div className={isMobile ? 'min-w-[95px] flex-1' : 'min-w-[220px] flex-1'}>
          <input
            type="text"
            value={filters.search}
            onChange={(e) => handleChange('search', e.target.value)}
            placeholder={isMobile ? '🔍' : 'Search product...'}
            style={{
              ...inputStyle,
              height: isMobile ? 28 : 42,
              fontSize: isMobile ? 11 : 14,
              padding: isMobile ? '0 8px' : '10px 12px',
            }}
          />
        </div>

        {/* CATEGORY */}
        <div className={isMobile ? 'w-[85px]' : 'min-w-[180px]'}>
          <select
            value={filters.categoryId}
            onChange={(e) => handleChange('categoryId', e.target.value)}
            style={{
              ...inputStyle,
              height: isMobile ? 28 : 42,
              fontSize: isMobile ? 11 : 14,
              padding: isMobile ? '0 4px' : '10px 12px',
            }}
          >
            <option value="">{isMobile ? '📂' : 'All Categories'}</option>

            {categories.map((cat) => (
              <option key={cat._id} value={cat._id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>

        {/* CHECKBOXES */}
        <div className={`flex ${isMobile ? 'flex-row gap-1' : 'flex-col gap-2'}`}>
          <label
            className="flex items-center gap-1 text-gray-700"
            style={{
              fontSize: isMobile ? 10 : 14,
            }}
          >
            <input
              type="checkbox"
              checked={filters.hideZero}
              onChange={(e) => handleChange('hideZero', e.target.checked)}
              style={{
                width: isMobile ? 12 : 16,
                height: isMobile ? 12 : 16,
              }}
            />
            {isMobile ? '0' : 'Hide Zero'}
          </label>

          <label
            className="flex items-center gap-1 text-gray-700"
            style={{
              fontSize: isMobile ? 10 : 14,
            }}
          >
            <input
              type="checkbox"
              checked={filters.negativeOnly}
              onChange={(e) => handleChange('negativeOnly', e.target.checked)}
              style={{
                width: isMobile ? 12 : 16,
                height: isMobile ? 12 : 16,
              }}
            />
            {isMobile ? '-' : 'Negative'}
          </label>
        </div>

        {/* START DATE */}
        <div>
          <input
            type="date"
            value={filters.startDate}
            onChange={(e) => handleChange('startDate', e.target.value)}
            style={{
              height: isMobile ? 28 : 42,
              width: isMobile ? 38 : 160,
              border: '1px solid #d1d5db',
              borderRadius: 8,
              padding: isMobile ? '0 2px' : '0 10px',
              background: '#fff',
              fontSize: isMobile ? 10 : 14,
            }}
          />
        </div>

        {/* END DATE */}
        <div>
          <input
            type="date"
            value={filters.endDate}
            onChange={(e) => handleChange('endDate', e.target.value)}
            style={{
              height: isMobile ? 28 : 42,
              width: isMobile ? 38 : 160,
              border: '1px solid #d1d5db',
              borderRadius: 8,
              padding: isMobile ? '0 2px' : '0 10px',
              background: '#fff',
              fontSize: isMobile ? 10 : 14,
            }}
          />
        </div>

        {/* BUTTONS */}
        <div className={`flex ${isMobile ? 'gap-1' : 'gap-2'}`}>
          <button
            onClick={handleApplyFilters}
            style={{
              ...primaryBtn,
              height: isMobile ? 28 : 42,
              padding: isMobile ? '0 8px' : '10px 18px',
              fontSize: isMobile ? 11 : 14,
            }}
          >
            🔎
          </button>

          <button
            onClick={handlePrint}
            style={{
              ...printBtn,
              height: isMobile ? 28 : 42,
              padding: isMobile ? '0 8px' : '10px 18px',
              fontSize: isMobile ? 11 : 14,
            }}
          >
            🖨
          </button>

          <button
            onClick={handleClearFilters}
            style={{
              ...clearBtn,
              height: isMobile ? 28 : 42,
              padding: isMobile ? '0 8px' : '10px 18px',
              fontSize: isMobile ? 11 : 14,
            }}
          >
            ✖
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: '#f9fafb',
        height: '100%',
        minHeight: 0,
      }}
    >
      {/* 🔹 ROW 1 — SUMMARY CARDS */}
      <div
        style={{
          padding: '12px 12px 6px 12px',
        }}
      >
        {headerCards}
      </div>

      {/* 🔹 ROW 2 — FILTERS */}
      <div
        style={{
          padding: '0px 12px 0px 12px',
        }}
      >
        {headerContent}
      </div>
      {/* =========================================================
         📦 MAIN CONTENT
      ========================================================= */}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          overflow: 'hidden',
          padding: '0px 12px 0px 12px',
        }}
      >
        {/* =========================================================
           📋 TABLE
        ========================================================= */}

        <div
          style={{
            flex: 1,
            overflow: 'auto',
            borderRadius: 14,
            border: '1px solid #e5e7eb',
            background: '#fff',
            boxShadow: '0 2px 10px rgba(0,0,0,0.04)',
          }}
        >
          {loading ? (
            <div
              style={{
                padding: 60,
                textAlign: 'center',
                color: '#6b7280',
                fontSize: 15,
              }}
            >
              ⏳ Loading Stock Report...
            </div>
          ) : rows.length === 0 ? (
            <div
              style={{
                padding: 60,
                textAlign: 'center',
                color: '#6b7280',
                fontSize: 15,
              }}
            >
              📭 No stock data found
            </div>
          ) : (
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                minWidth: 1100,
              }}
            >
              <thead
                style={{
                  position: 'sticky',
                  top: 0,
                  zIndex: 20,
                  background: '#f8fafc',
                }}
              >
                <tr>
                  <th style={thStyle}>Product</th>

                  <th style={thStyle}>Category</th>

                  <th style={thStyle}>Qty</th>

                  <th style={thStyle}>Unit Cost</th>

                  <th style={thStyle}>Cost Value</th>

                  <th style={thStyle}>Sale Price</th>

                  <th style={thStyle}>Sale Value</th>
                </tr>
              </thead>

              <tbody>
                {rows.map((row, index) => (
                  <tr
                    key={row.productId}
                    style={{
                      background:
                        row.stockQty < 0 ? '#fef2f2' : index % 2 === 0 ? '#ffffff' : '#fafafa',

                      transition: '0.2s ease',
                    }}
                  >
                    <td style={tdStyleProduct}>
                      <div className="font-semibold text-gray-800">{row.productName}</div>
                    </td>

                    <td style={tdStyle}>{row.category}</td>

                    <td
                      style={{
                        ...tdStyle,

                        fontWeight: 700,

                        color: row.stockQty < 0 ? '#dc2626' : '#111827',
                      }}
                    >
                      {Number(row.stockQty || 0).toLocaleString()}
                    </td>

                    <td style={tdStyle}>Rs. {Number(row.unitCost || 0).toLocaleString()}</td>

                    <td
                      style={{
                        ...tdStyle,

                        fontWeight: 700,

                        color: '#047857',
                      }}
                    >
                      Rs. {Number(row.costValue || 0).toLocaleString()}
                    </td>

                    <td style={tdStyle}>Rs. {Number(row.salePrice || 0).toLocaleString()}</td>

                    <td
                      style={{
                        ...tdStyle,

                        fontWeight: 700,

                        color: '#c2410c',
                      }}
                    >
                      Rs. {Number(row.saleValue || 0).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>

              {/* =========================================================
                 📊 FOOTER TOTALS
              ========================================================= */}

              <tfoot
                style={{
                  background: 'linear-gradient(135deg, #111827, #1f2937)',

                  color: '#fff',

                  fontWeight: 700,
                }}
              >
                <tr>
                  <td style={footerStyle}>TOTAL</td>

                  <td style={footerStyle}>-</td>

                  <td style={footerStyle}>{Number(liveTotals.totalQty || 0).toLocaleString()}</td>

                  <td style={footerStyle}>-</td>

                  <td style={footerStyle}>
                    Rs. {Number(liveTotals.totalCostValue || 0).toLocaleString()}
                  </td>

                  <td style={footerStyle}>-</td>

                  <td style={footerStyle}>
                    Rs. {Number(liveTotals.totalSaleValue || 0).toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

/* =========================================================
   🎨 SUMMARY CARD
========================================================= */

const SummaryCard = ({ title, value, gradient }) => {
  const isMobile = window.innerWidth < 768;

  return (
    <div
      style={{
        background: gradient,
        minWidth: isMobile ? 88 : 140,
        borderRadius: isMobile ? 10 : 14,
        padding: isMobile ? '7px 10px' : '12px 16px',
        color: '#fff',
        boxShadow: '0 8px 18px rgba(0,0,0,0.12)',
      }}
    >
      <div
        style={{
          fontSize: isMobile ? 10 : 12,
          opacity: 0.85,
          marginBottom: isMobile ? 3 : 6,
        }}
      >
        {title}
      </div>

      <div
        style={{
          fontSize: isMobile ? 13 : 20,
          fontWeight: 700,
          whiteSpace: 'nowrap',
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
    </div>
  );
};

/* =========================================================
   🎨 STYLES
========================================================= */

const inputStyle = {
  width: '100%',
  border: '1px solid #d1d5db',
  borderRadius: 10,
  padding: '10px 12px',
  fontSize: 14,
  background: '#fff',
};

const primaryBtn = {
  background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',

  color: '#fff',

  border: 'none',

  borderRadius: 10,

  padding: '10px 18px',

  fontWeight: 600,

  cursor: 'pointer',

  boxShadow: '0 4px 12px rgba(37,99,235,0.25)',
};

const clearBtn = {
  background: 'linear-gradient(135deg, #dc2626, #b91c1c)',

  color: '#fff',

  border: 'none',

  borderRadius: 10,

  padding: '10px 18px',

  fontWeight: 600,

  cursor: 'pointer',

  boxShadow: '0 4px 12px rgba(220,38,38,0.25)',
};

const printBtn = {
  background: 'linear-gradient(135deg, #111827, #1f2937)',

  color: '#fff',

  border: 'none',

  borderRadius: 10,

  padding: '10px 18px',

  fontWeight: 600,

  cursor: 'pointer',
};

const thStyle = {
  padding: '14px 12px',

  textAlign: 'left',

  fontSize: 13,

  fontWeight: 700,

  color: '#374151',

  borderBottom: '1px solid #e5e7eb',

  background: '#f8fafc',
};

const tdStyle = {
  padding: '13px 12px',

  borderBottom: '1px solid #f1f5f9',

  fontSize: 14,
};

const tdStyleProduct = {
  padding: '13px 12px',

  borderBottom: '1px solid #f1f5f9',

  fontSize: 14,

  minWidth: 220,
};

const footerStyle = {
  padding: '16px 12px',

  borderTop: '2px solid rgba(255,255,255,0.08)',

  fontSize: 14,
};

export default StockValueReportPage;
