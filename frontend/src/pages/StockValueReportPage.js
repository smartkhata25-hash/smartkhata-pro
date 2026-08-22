import React, { useEffect, useRef, useState } from 'react';

import { fetchStockValueReport } from '../services/stockValueService';

import { getCategories } from '../services/categoryService';

import { t } from '../i18n/i18n';

const PAGE_LIMIT = 50;

const EMPTY_SUMMARY = {
  totalProducts: 0,
  totalQty: 0,
  totalCostValue: 0,
  totalSaleValue: 0,
  negativeStockValue: 0,
};

const EMPTY_PAGINATION = {
  page: 1,
  limit: PAGE_LIMIT,
  totalRows: 0,
  totalPages: 0,
  hasPreviousPage: false,
  hasNextPage: false,
};

const StockValueReportPage = () => {
  const isMobile = window.innerWidth < 768;

  const requestIdRef = useRef(0);

  const [loading, setLoading] = useState(false);

  const [rows, setRows] = useState([]);

  const [categories, setCategories] = useState([]);

  const [summary, setSummary] = useState(EMPTY_SUMMARY);

  const [pagination, setPagination] = useState(EMPTY_PAGINATION);

  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    search: '',
    categoryId: '',
    hideZero: true,
    negativeOnly: false,
  });

  const loadReport = async ({ nextFilters = filters, page = 1 } = {}) => {
    const requestId = ++requestIdRef.current;

    try {
      setLoading(true);

      const data = await fetchStockValueReport({
        ...nextFilters,
        page,
        limit: PAGE_LIMIT,
      });

      if (requestId !== requestIdRef.current) {
        return;
      }

      setRows(Array.isArray(data?.rows) ? data.rows : []);

      setSummary({
        totalProducts: Number(data?.summary?.totalProducts || 0),
        totalQty: Number(data?.summary?.totalQty || 0),
        totalCostValue: Number(data?.summary?.totalCostValue || 0),
        totalSaleValue: Number(data?.summary?.totalSaleValue || 0),
        negativeStockValue: Number(data?.summary?.negativeStockValue || 0),
      });

      setPagination({
        page: Number(data?.pagination?.page || page),
        limit: Number(data?.pagination?.limit || PAGE_LIMIT),
        totalRows: Number(data?.pagination?.totalRows || 0),
        totalPages: Number(data?.pagination?.totalPages || 0),
        hasPreviousPage: Boolean(data?.pagination?.hasPreviousPage),
        hasNextPage: Boolean(data?.pagination?.hasNextPage),
      });
    } catch (err) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      console.error(err);

      setRows([]);
      setSummary(EMPTY_SUMMARY);
      setPagination(EMPTY_PAGINATION);

      alert(err?.message || t('alerts.somethingWrong') || 'Failed to load report');
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  };

  const loadCategories = async () => {
    try {
      const data = await getCategories();

      setCategories(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    loadReport({
      page: 1,
    });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (key, value) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleApplyFilters = () => {
    loadReport({
      nextFilters: filters,
      page: 1,
    });
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

    loadReport({
      nextFilters: resetFilters,
      page: 1,
    });
  };

  const handlePageChange = (nextPage) => {
    if (
      loading ||
      nextPage < 1 ||
      nextPage > pagination.totalPages ||
      nextPage === pagination.page
    ) {
      return;
    }

    loadReport({
      nextFilters: filters,
      page: nextPage,
    });
  };

  const handlePrint = () => {
    window.print();
  };

  const headerCards = (
    <div className="flex flex-wrap gap-2">
      <SummaryCard
        title="Products"
        value={Number(summary.totalProducts || 0).toLocaleString()}
        gradient="linear-gradient(135deg, #2563eb, #1d4ed8)"
      />

      <SummaryCard
        title="Qty"
        value={Number(summary.totalQty || 0).toLocaleString()}
        gradient="linear-gradient(135deg, #7c3aed, #6d28d9)"
      />

      <SummaryCard
        title="Cost Value"
        value={`Rs. ${Number(summary.totalCostValue || 0).toLocaleString()}`}
        gradient="linear-gradient(135deg, #059669, #047857)"
      />

      <SummaryCard
        title="Sale Value"
        value={`Rs. ${Number(summary.totalSaleValue || 0).toLocaleString()}`}
        gradient="linear-gradient(135deg, #ea580c, #c2410c)"
      />

      <SummaryCard
        title="Negative Stock"
        value={`Rs. ${Number(summary.negativeStockValue || 0).toLocaleString()}`}
        gradient="linear-gradient(135deg, #dc2626, #991b1b)"
      />
    </div>
  );

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
        <div className={isMobile ? 'min-w-[95px] flex-1' : 'min-w-[220px] flex-1'}>
          <input
            type="text"
            value={filters.search}
            onChange={(e) => handleChange('search', e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleApplyFilters();
              }
            }}
            placeholder={isMobile ? '🔍' : 'Search product...'}
            style={{
              ...inputStyle,
              height: isMobile ? 28 : 42,
              fontSize: isMobile ? 11 : 14,
              padding: isMobile ? '0 8px' : '10px 12px',
            }}
          />
        </div>

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

        <div className={`flex ${isMobile ? 'gap-1' : 'gap-2'}`}>
          <button
            type="button"
            onClick={handleApplyFilters}
            disabled={loading}
            style={{
              ...primaryBtn,
              height: isMobile ? 28 : 42,
              padding: isMobile ? '0 8px' : '10px 18px',
              fontSize: isMobile ? 11 : 14,
              opacity: loading ? 0.65 : 1,
            }}
          >
            🔎
          </button>

          <button
            type="button"
            onClick={handlePrint}
            disabled={loading}
            style={{
              ...printBtn,
              height: isMobile ? 28 : 42,
              padding: isMobile ? '0 8px' : '10px 18px',
              fontSize: isMobile ? 11 : 14,
              opacity: loading ? 0.65 : 1,
            }}
          >
            🖨
          </button>

          <button
            type="button"
            onClick={handleClearFilters}
            disabled={loading}
            style={{
              ...clearBtn,
              height: isMobile ? 28 : 42,
              padding: isMobile ? '0 8px' : '10px 18px',
              fontSize: isMobile ? 11 : 14,
              opacity: loading ? 0.65 : 1,
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
      <div
        style={{
          padding: '12px 12px 6px 12px',
        }}
      >
        {headerCards}
      </div>

      <div
        style={{
          padding: '0px 12px 0px 12px',
        }}
      >
        {headerContent}
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          overflow: 'hidden',
          padding: '0px 12px 0px 12px',
        }}
      >
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

                  <td style={footerStyle}>{Number(summary.totalQty || 0).toLocaleString()}</td>

                  <td style={footerStyle}>-</td>

                  <td style={footerStyle}>
                    Rs. {Number(summary.totalCostValue || 0).toLocaleString()}
                  </td>

                  <td style={footerStyle}>-</td>

                  <td style={footerStyle}>
                    Rs. {Number(summary.totalSaleValue || 0).toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        {pagination.totalPages > 1 && (
          <div
            className="no-print"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              padding: isMobile ? '6px 2px' : '8px 2px',
            }}
          >
            <button
              type="button"
              disabled={loading || !pagination.hasPreviousPage}
              onClick={() => handlePageChange(pagination.page - 1)}
              style={{
                ...paginationBtn,
                opacity: loading || !pagination.hasPreviousPage ? 0.45 : 1,
              }}
            >
              ←
            </button>

            <div
              style={{
                fontSize: isMobile ? 11 : 13,
                color: '#4b5563',
                textAlign: 'center',
                fontWeight: 600,
              }}
            >
              Page {pagination.page} of {pagination.totalPages}
              {' • '}
              {Number(pagination.totalRows || 0).toLocaleString()} Products
            </div>

            <button
              type="button"
              disabled={loading || !pagination.hasNextPage}
              onClick={() => handlePageChange(pagination.page + 1)}
              style={{
                ...paginationBtn,
                opacity: loading || !pagination.hasNextPage ? 0.45 : 1,
              }}
            >
              →
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

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

const paginationBtn = {
  minWidth: 42,
  height: 32,
  border: '1px solid #d1d5db',
  borderRadius: 8,
  background: '#fff',
  color: '#111827',
  fontSize: 17,
  fontWeight: 700,
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
