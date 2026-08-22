import React, { useEffect, useRef, useState } from 'react';

import ProfitDetailDrawer from './ProfitDetailDrawer';

import {
  getProfitSummary,
  getSalesBreakdown,
  getExpenseBreakdown,
  getCogsBreakdown,
  getProductProfitability,
} from '../../services/profitService';

import {
  fetchInvoiceFormOptions,
  getCachedInvoiceFormOptions,
} from '../../services/invoiceFormOptionsService';

import { getCategories } from '../../services/categoryService';

import ProductDropdown from '../ProductDropdown';

import CategoryDropdown from '../CategoryDropdown';

import { t } from '../../i18n/i18n';

const ProfitSummaryModal = ({ isOpen, onClose, data }) => {
  const summaryRequestIdRef = useRef(0);

  const [drawerOpen, setDrawerOpen] = useState(false);

  const [drawerTitle, setDrawerTitle] = useState('');

  const [drawerType, setDrawerType] = useState('');

  const [drawerData, setDrawerData] = useState([]);

  const [loading, setLoading] = useState(false);

  const [quickFilter, setQuickFilter] = useState('this_month');

  const [summaryData, setSummaryData] = useState(data);

  const [products, setProducts] = useState([]);

  const [categories, setCategories] = useState([]);

  const [selectedProduct, setSelectedProduct] = useState('');

  const [selectedCategory, setSelectedCategory] = useState('');

  const [startDate, setStartDate] = useState('');

  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setDrawerOpen(false);
      setDrawerData([]);
      setDrawerTitle('');
      setDrawerType('');
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (quickFilter === 'custom' && (!startDate || !endDate)) {
      return;
    }

    const requestId = ++summaryRequestIdRef.current;

    const loadSummary = async () => {
      try {
        const response = await getProfitSummary({
          filterType: quickFilter,
          startDate,
          endDate,
          productId: selectedProduct,
          categoryId: selectedCategory,
        });

        if (requestId !== summaryRequestIdRef.current) {
          return;
        }

        setSummaryData(response?.data || null);
      } catch (error) {
        if (requestId !== summaryRequestIdRef.current) {
          return;
        }

        console.error('Profit summary load failed:', error);
      }
    };

    loadSummary();
  }, [quickFilter, isOpen, selectedProduct, selectedCategory, startDate, endDate]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let cancelled = false;

    const cachedOptions = getCachedInvoiceFormOptions();

    if (cachedOptions?.products?.length && !cancelled) {
      setProducts(cachedOptions.products);
    }

    const loadFilters = async () => {
      try {
        const [optionsResult, categoriesResult] = await Promise.allSettled([
          fetchInvoiceFormOptions(),
          getCategories(),
        ]);

        if (cancelled) {
          return;
        }

        if (optionsResult.status === 'fulfilled') {
          setProducts(
            Array.isArray(optionsResult.value?.products) ? optionsResult.value.products : []
          );
        }

        if (categoriesResult.status === 'fulfilled') {
          setCategories(Array.isArray(categoriesResult.value) ? categoriesResult.value : []);
        }
      } catch (error) {
        console.error('Profit filter options load failed:', error);
      }
    };

    loadFilters();

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    setDrawerOpen(false);
    setDrawerData([]);
    setDrawerTitle('');
    setDrawerType('');
  }, [quickFilter, selectedProduct, selectedCategory, startDate, endDate]);

  if (!isOpen || !summaryData) {
    return null;
  }

  const isProductMode = Boolean(selectedProduct || selectedCategory);

  const getActiveFilters = () => ({
    filterType: quickFilter,
    startDate,
    endDate,
    productId: selectedProduct,
    categoryId: selectedCategory,
  });

  const openDrawer = async (type) => {
    if (quickFilter === 'custom' && (!startDate || !endDate)) {
      return;
    }

    try {
      setLoading(true);
      setDrawerOpen(true);
      setDrawerData([]);
      setDrawerType(type);

      const activeFilters = getActiveFilters();

      let response = null;

      if (type === 'sales') {
        setDrawerTitle(t('reports.salesBreakdown'));

        response = await getSalesBreakdown(activeFilters);
      }

      if (type === 'expense') {
        setDrawerTitle(t('reports.expenseBreakdown'));

        response = await getExpenseBreakdown({
          filterType: activeFilters.filterType,
          startDate: activeFilters.startDate,
          endDate: activeFilters.endDate,
        });
      }

      if (type === 'cogs') {
        setDrawerTitle(t('reports.cogsBreakdown'));

        response = await getCogsBreakdown(activeFilters);
      }

      if (type === 'products') {
        setDrawerTitle(t('reports.productProfitability'));

        response = await getProductProfitability(activeFilters);
      }

      setDrawerData(Array.isArray(response?.data) ? response.data : []);
    } catch (error) {
      console.error('Profit detail load failed:', error);

      setDrawerData([]);

      alert(t('alerts.detailLoadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const clearFilters = () => {
    setSelectedProduct('');
    setSelectedCategory('');
    setQuickFilter('this_month');
    setStartDate('');
    setEndDate('');

    setDrawerOpen(false);
    setDrawerData([]);
    setDrawerTitle('');
    setDrawerType('');
  };

  const Row = ({ label, value, color = 'text-gray-800', clickable = false, onClick }) => (
    <button
      type="button"
      disabled={!clickable}
      onClick={onClick}
      className={`w-full flex items-center justify-between py-3 border-b border-gray-100 transition ${
        clickable ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default'
      }`}
    >
      <span className="text-sm font-medium text-gray-600">{label}</span>

      <span className={`text-sm font-bold ${color}`}>
        {t('currency.rs')} {Number(value || 0).toFixed(0)}
      </span>
    </button>
  );

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-fadeIn">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <div>
              <h2 className="text-lg font-bold text-gray-800">{t('reports.profitSummary')}</h2>

              <p className="text-xs text-gray-500 mt-1">{t('reports.financialOverview')}</p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 transition"
            >
              ✕
            </button>
          </div>

          <div className="px-6 pt-4">
            <select
              value={quickFilter}
              onChange={(e) => {
                const value = e.target.value;

                setQuickFilter(value);

                if (value !== 'custom') {
                  setStartDate('');
                  setEndDate('');
                }
              }}
              className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
            >
              <option value="today">{t('date.today')}</option>

              <option value="this_month">{t('date.thisMonth')}</option>

              <option value="last_month">{t('date.lastMonth')}</option>

              <option value="this_year">{t('date.thisYear')}</option>

              <option value="last_year">{t('date.lastYear')}</option>

              <option value="custom">{t('date.custom')}</option>
            </select>

            {quickFilter === 'custom' && (
              <div className="grid grid-cols-2 gap-3 mt-3">
                <input
                  type="date"
                  value={startDate}
                  max={endDate || undefined}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="border rounded-lg px-3 py-2 text-sm outline-none"
                />

                <input
                  type="date"
                  value={endDate}
                  min={startDate || undefined}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="border rounded-lg px-3 py-2 text-sm outline-none"
                />
              </div>
            )}
          </div>

          <div className="px-6 pt-4">
            <div className="grid grid-cols-3 gap-3 items-center">
              <div className="border border-gray-300 rounded-xl px-2 py-1 bg-white shadow-sm">
                <ProductDropdown
                  productList={products}
                  value={products.find((product) => product._id === selectedProduct)?.name || ''}
                  onSelect={(product) => {
                    setSelectedProduct(product?._id || '');
                  }}
                  onChange={(value) => {
                    if (!value.trim()) {
                      setSelectedProduct('');
                    }
                  }}
                  showAddOption={false}
                />
              </div>

              <div className="border border-gray-300 rounded-xl px-2 py-1 bg-white shadow-sm">
                <CategoryDropdown
                  categories={categories}
                  value={
                    categories.find((category) => category._id === selectedCategory)?.name || ''
                  }
                  onSelect={(category) => {
                    setSelectedCategory(category?._id || '');
                  }}
                />
              </div>

              <button
                type="button"
                onClick={clearFilters}
                className="h-full rounded-xl text-white text-sm font-semibold shadow-md transition hover:scale-[1.02] active:scale-[0.98]"
                style={{
                  background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #d946ef 100%)',
                  minHeight: '44px',
                }}
              >
                {t('clear')}
              </button>
            </div>
          </div>

          <div className="p-6 space-y-1">
            <Row
              label={t('reports.totalSales')}
              value={summaryData.totalSales}
              clickable
              onClick={() => openDrawer('sales')}
            />

            <Row
              label={t('reports.cogs')}
              value={summaryData.cogs}
              color="text-red-500"
              clickable
              onClick={() => openDrawer('cogs')}
            />

            <Row
              label={t('reports.grossProfit')}
              value={summaryData.grossProfit}
              color="text-blue-600"
            />

            {!isProductMode && (
              <>
                <Row
                  label={t('reports.expenses')}
                  value={summaryData.operatingExpenses}
                  color="text-orange-500"
                  clickable
                  onClick={() => openDrawer('expense')}
                />

                <Row
                  label={t('reports.netProfit')}
                  value={summaryData.netProfit}
                  color={summaryData.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}
                />
              </>
            )}

            <Row
              label={t('reports.productProfitability')}
              value={summaryData.netProfit}
              color="text-purple-600"
              clickable
              onClick={() => openDrawer('products')}
            />
          </div>
        </div>
      </div>

      <ProfitDetailDrawer
        isOpen={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setDrawerData([]);
        }}
        title={drawerTitle}
        type={drawerType}
        data={drawerData}
        loading={loading}
      />
    </>
  );
};

export default ProfitSummaryModal;
