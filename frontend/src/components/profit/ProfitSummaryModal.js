import React, { useEffect, useState } from 'react';

import ProfitDetailDrawer from './ProfitDetailDrawer';

import {
  getProfitSummary,
  getSalesBreakdown,
  getExpenseBreakdown,
  getCogsBreakdown,
  getProductProfitability,
} from '../../services/profitService';

import { fetchProducts } from '../../services/inventoryService';

import { getCategories } from '../../services/categoryService';

import ProductDropdown from '../ProductDropdown';

import CategoryDropdown from '../CategoryDropdown';

import { t } from '../../i18n/i18n';

const ProfitSummaryModal = ({ isOpen, onClose, data }) => {
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

  useEffect(() => {
    if (!isOpen) {
      setDrawerOpen(false);
      setDrawerData([]);
    }
  }, [isOpen]);

  useEffect(() => {
    const loadSummary = async () => {
      try {
        const response = await getProfitSummary({
          filterType: quickFilter,
          productId: selectedProduct,
          categoryId: selectedCategory,
        });

        setSummaryData(response.data);
      } catch (error) {
        console.error(error);
      }
    };

    if (isOpen) {
      loadSummary();
    }
  }, [quickFilter, isOpen, selectedProduct, selectedCategory]);

  useEffect(() => {
    const loadFilters = async () => {
      try {
        const [productsRes, categoriesRes] = await Promise.all([fetchProducts(), getCategories()]);

        setProducts(productsRes || []);
        setCategories(categoriesRes || []);
      } catch (error) {
        console.error(error);
      }
    };

    if (isOpen) {
      loadFilters();
    }
  }, [isOpen]);

  if (!isOpen || !summaryData) return null;

  const isProductMode = selectedProduct || selectedCategory;

  const openDrawer = async (type) => {
    try {
      setLoading(true);
      setDrawerOpen(true);

      let response;

      if (type === 'sales') {
        response = await getSalesBreakdown({
          filterType: quickFilter,
          productId: selectedProduct,
          categoryId: selectedCategory,
        });

        setDrawerTitle(t('reports.salesBreakdown'));
      }

      if (type === 'expense') {
        response = await getExpenseBreakdown({
          filterType: quickFilter,
        });

        setDrawerTitle(t('reports.expenseBreakdown'));
      }

      if (type === 'cogs') {
        response = await getCogsBreakdown({
          filterType: quickFilter,
        });

        setDrawerTitle(t('reports.cogsBreakdown'));
      }

      if (type === 'products') {
        response = await getProductProfitability({
          filterType: quickFilter,
          productId: selectedProduct,
          categoryId: selectedCategory,
        });

        setDrawerTitle(t('reports.productProfitability'));
      }

      setDrawerType(type);
      setDrawerData(response?.data || []);
    } catch (error) {
      console.error(error);
      alert(t('alerts.detailLoadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const Row = ({ label, value, color = 'text-gray-800', clickable = false, onClick }) => (
    <button
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
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 transition"
            >
              ✕
            </button>
          </div>

          <div className="px-6 pt-4">
            <select
              value={quickFilter}
              onChange={(e) => setQuickFilter(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
            >
              <option value="today">{t('date.today')}</option>
              <option value="this_month">{t('date.thisMonth')}</option>
              <option value="last_month">{t('date.lastMonth')}</option>
              <option value="this_year">{t('date.thisYear')}</option>
              <option value="last_year">{t('date.lastYear')}</option>
            </select>
          </div>

          <div className="px-6 pt-4">
            <div className="grid grid-cols-3 gap-3 items-center">
              <div className="border border-gray-300 rounded-xl px-2 py-1 bg-white shadow-sm">
                <ProductDropdown
                  productList={products}
                  value={products.find((p) => p._id === selectedProduct)?.name || ''}
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
                  value={categories.find((c) => c._id === selectedCategory)?.name || ''}
                  onSelect={(category) => {
                    setSelectedCategory(category?._id || '');
                  }}
                />
              </div>

              <button
                onClick={() => {
                  setSelectedProduct('');
                  setSelectedCategory('');
                }}
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
        onClose={() => setDrawerOpen(false)}
        title={drawerTitle}
        type={drawerType}
        data={drawerData}
        loading={loading}
      />
    </>
  );
};

export default ProfitSummaryModal;
