import React, { useEffect, useState } from 'react';
import {
  getAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
} from '../services/accountService';
import { t } from '../i18n/i18n';

const ChartOfAccountsPage = () => {
  const [accounts, setAccounts] = useState([]);
  // ===== CATEGORY → TYPE AUTO MAPPING =====
  const categoryTypeMap = {
    cash: 'Asset',
    bank: 'Asset',
    online: 'Asset',
    cheque: 'Asset',

    inventory: 'Asset',
    receivable: 'Asset',
    prepaid: 'Asset',
    fixed: 'Asset',

    payable: 'Liability',
    credit: 'Liability',
    loan: 'Liability',
    tax: 'Liability',

    capital: 'Equity',
    drawings: 'Equity',

    sales: 'Income',
    service: 'Income',
    discount_income: 'Income',
    other_income: 'Income',

    purchase: 'Expense',
    salary: 'Expense',
    rent: 'Expense',
    utility: 'Expense',
    transport: 'Expense',
    marketing: 'Expense',
    maintenance: 'Expense',
    other_expense: 'Expense',
  };
  const [form, setForm] = useState({
    name: '',
    type: 'Asset',
    code: '',
    category: '',
  });
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [hoverRow, setHoverRow] = useState(null);

  const pageSize = 10;

  const [filterType, setFilterType] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [showForm, setShowForm] = useState(false);

  const [editId, setEditId] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [error, setError] = useState('');

  const fetchAccounts = async () => {
    try {
      const data = await getAccounts();
      if (data) setAccounts(data);
    } catch (err) {
      console.error(t('alerts.accountsFetchError'), err);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;

    // اگر category change ہوئی
    if (name === 'category') {
      const autoType = categoryTypeMap[value] || 'Asset';

      setForm({
        ...form,
        category: value,
        type: autoType, // 👈 auto set
      });
    } else {
      setForm({ ...form, [name]: value });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      if (editId) {
        await updateAccount(editId, form);
        alert(t('alerts.accountUpdated'));
      } else {
        await createAccount(form);
        alert(t('alerts.accountCreated'));
      }
      setShowForm(false);
      setForm({ name: '', type: 'Asset', code: '', category: '' });
      setEditId(null);
      setShowForm(false);
      fetchAccounts();
    } catch (err) {
      const msg =
        err.response?.data?.error || err.response?.data?.message || err.message || 'Unknown error';

      setError(`❌ ${msg}`);
    }
  };

  const handleEdit = (acc) => {
    setForm({
      name: acc.name,
      type: acc.type,
      code: acc.code,
      category: acc.category || '',
    });

    setEditId(acc._id);

    setShowForm(true);
  };

  const confirmDelete = async () => {
    try {
      await deleteAccount(deleteId);
      setDeleteId(null);
      fetchAccounts();
      alert(t('alerts.accountDeleted'));
    } catch (err) {
      alert(t('alerts.accountDeleteFailed'));
    }
  };

  const cancelDelete = () => setDeleteId(null);

  const normalizedSearch = search.toLowerCase().trim();
  const filtered = accounts.filter((acc) => {
    const matchSearch =
      acc.name.toLowerCase().includes(normalizedSearch) ||
      acc.code.toLowerCase().includes(normalizedSearch) ||
      acc.type.toLowerCase().includes(normalizedSearch) ||
      (acc.category && acc.category.toLowerCase().includes(normalizedSearch));

    const matchType = filterType ? acc.type === filterType : true;
    const matchCategory = filterCategory ? acc.category === filterCategory : true;

    return matchSearch && matchType && matchCategory;
  });

  const totalAccounts = filtered.length;
  const systemAccounts = filtered.filter((a) => a.isSystem).length;
  const userAccounts = filtered.filter((a) => !a.isSystem).length;

  const totalPages = Math.ceil(totalAccounts / pageSize);

  const paginatedAccounts = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div
      style={{
        padding: '20px 20px 5px 20px',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* ===== HEADER SECTION ===== */}
      <div
        style={{
          background: 'linear-gradient(135deg, #2563eb, #1e40af)',
          color: '#fff',
          padding: '20px 24px',
          borderRadius: 12,
          marginBottom: 10,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 20,
          }}
        >
          {/* LEFT SIDE */}
          <div>
            <h2 style={{ margin: 0 }}>📘 {t('accounts.chartTitle')}</h2>

            <button
              onClick={() => setShowForm((prev) => !prev)}
              style={{
                marginTop: 8,
                background: '#fff',
                color: '#2563eb',
                border: 'none',
                borderRadius: 6,
                padding: '6px 12px',
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              {showForm ? t('close') : t('accounts.addAccount')}
            </button>
          </div>

          {/* RIGHT SIDE COUNTERS */}
          <div style={{ display: 'flex', gap: 15 }}>
            <div style={counterBox}>
              <span style={counterLabel}>{t('total')}</span>
              <strong style={counterValue}>{totalAccounts}</strong>
            </div>

            <div style={counterBox}>
              <span style={counterLabel}>{t('accounts.system')}</span>
              <strong style={counterValue}>{systemAccounts}</strong>
            </div>

            <div style={counterBox}>
              <span style={counterLabel}>{t('accounts.user')}</span>
              <strong style={counterValue}>{userAccounts}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* ===== ERROR MESSAGE ===== */}
      {error && <div style={{ color: '#dc2626', marginBottom: 10, fontSize: 14 }}>{error}</div>}

      {/* باقی آپ کا پورا existing code اسی طرح جاری رہے گا */}

      {showForm && (
        <>
          {/* ===== Add / Edit Account Form ===== */}
          <div
            style={{
              background: '#ffffff',
              padding: 20,
              borderRadius: 10,
              boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
              marginBottom: 30,
            }}
          >
            <h3 style={{ marginBottom: 15 }}>
              {editId ? `✏️ ${t('accounts.editAccount')}` : `➕ ${t('accounts.addNewAccount')}`}
            </h3>

            <form onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15 }}>
                {/* Account Name */}
                <div>
                  <label style={{ fontSize: 13, opacity: 0.8 }}>{t('accounts.accountName')}</label>
                  <input
                    name="name"
                    value={form.name}
                    onChange={handleChange}
                    placeholder={t('accounts.accountNameExample')}
                    required
                    style={inputStyle}
                  />
                </div>

                {/* Account Code */}
                <div>
                  <label style={{ fontSize: 13, opacity: 0.8 }}>{t('accounts.accountCode')}</label>
                  <input
                    name="code"
                    value={form.code}
                    onChange={handleChange}
                    placeholder={t('accounts.accountCodeExample')}
                    required
                    disabled={!!editId}
                    style={{
                      ...inputStyle,
                      backgroundColor: editId ? '#f3f4f6' : '#fff',
                    }}
                  />
                </div>

                {/* Type */}
                <div>
                  <label style={{ fontSize: 13, opacity: 0.8 }}>{t('accounts.accountType')}</label>
                  <select
                    name="type"
                    value={form.type}
                    onChange={handleChange}
                    style={{ ...inputStyle, backgroundColor: '#f3f4f6' }}
                    disabled
                  >
                    <option value="Asset">{t('accounts.type.asset')}</option>
                    <option value="Liability">{t('accounts.type.liability')}</option>
                    <option value="Equity">{t('accounts.type.equity')}</option>
                    <option value="Income">{t('accounts.type.income')}</option>
                    <option value="Expense">{t('accounts.type.expense')}</option>
                  </select>
                </div>

                {/* Category */}
                <div>
                  <label style={{ fontSize: 13, opacity: 0.8 }}>{t('inventory.category')}</label>
                  <select
                    name="category"
                    value={form.category}
                    onChange={handleChange}
                    required
                    style={inputStyle}
                  >
                    <option value="">{t('accounts.selectCategory')}</option>

                    <optgroup label="Assets">
                      <option value="cash">{t('accounts.category.cash')}</option>
                      <option value="bank">{t('accounts.category.bank')}</option>
                      <option value="online">{t('accounts.category.online')}</option>
                      <option value="cheque">{t('accounts.category.cheque')}</option>
                      <option value="inventory">{t('accounts.category.inventory')}</option>
                      <option value="receivable">{t('accounts.category.receivable')}</option>
                      <option value="prepaid">{t('accounts.category.prepaid')}</option>
                      <option value="fixed">{t('accounts.category.fixed')}</option>
                    </optgroup>

                    <optgroup label="Liabilities">
                      <option value="payable">{t('accounts.category.payable')}</option>
                      <option value="credit">{t('accounts.category.credit')}</option>
                      <option value="loan">{t('accounts.category.loan')}</option>
                      <option value="tax">{t('accounts.category.tax')}</option>
                    </optgroup>

                    <optgroup label="Equity">
                      <option value="capital">{t('accounts.category.capital')}</option>
                      <option value="drawings">{t('accounts.category.drawings')}</option>
                    </optgroup>

                    <optgroup label="Income">
                      <option value="sales">{t('accounts.category.sales')}</option>
                      <option value="service">{t('accounts.category.service')}</option>
                      <option value="discount_income">{t('accounts.category.discount')}</option>
                      <option value="other_income">{t('accounts.category.otherIncome')}</option>
                    </optgroup>

                    <optgroup label="Expenses">
                      <option value="purchase">{t('accounts.category.purchase')}</option>
                      <option value="salary">{t('accounts.category.salary')}</option>
                      <option value="rent">{t('accounts.category.rent')}</option>
                      <option value="utility">{t('accounts.category.utility')}</option>
                      <option value="transport">{t('accounts.category.transport')}</option>
                      <option value="marketing">{t('accounts.category.marketing')}</option>
                      <option value="maintenance">{t('accounts.category.maintenance')}</option>
                      <option value="other_expense">{t('accounts.category.otherExpense')}</option>
                    </optgroup>
                  </select>
                </div>
              </div>

              {/* Buttons */}
              <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
                <button type="submit" style={primaryBtn}>
                  {editId ? t('accounts.updateAccount') : t('accounts.addAccount')}
                </button>

                <button
                  type="button"
                  style={secondaryBtn}
                  onClick={() => {
                    setForm({ name: '', type: 'Asset', code: '', category: '' });
                    setEditId(null);
                  }}
                >
                  {t('clear')}
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* ===== Search & Filters ===== */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          alignItems: 'center',
          marginBottom: 20,
          background: '#f9fafb',
          padding: 12,
          borderRadius: 8,
        }}
      >
        {/* Search */}
        <input
          type="text"
          placeholder={`🔍 ${t('accounts.searchAccounts')}`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1,
            minWidth: 220,
            padding: '10px 12px',
            borderRadius: 6,
            border: '1px solid #d1d5db',
            fontSize: 14,
          }}
        />

        {/* Type Filter */}
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          style={filterSelect}
        >
          <option value="">{t('accounts.allTypes')}</option>
          <option value="Asset">{t('accounts.type.asset')}</option>
          <option value="Liability">{t('accounts.type.liability')}</option>
          <option value="Equity">{t('accounts.type.equity')}</option>
          <option value="Income">{t('accounts.type.income')}</option>
          <option value="Expense">{t('accounts.type.expense')}</option>
        </select>

        {/* Category Filter */}
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          style={filterSelect}
        >
          <option value="">{t('accounts.allCategories')}</option>
          <option value="cash">{t('accounts.category.cash')}</option>
          <option value="bank">{t('accounts.category.bank')}</option>
          <option value="online">{t('accounts.category.online')}</option>
          <option value="cheque">{t('accounts.category.cheque')}</option>
          <option value="credit">{t('accounts.category.credit')}</option>
          <option value="other">{t('accounts.category.other')}</option>
        </select>
      </div>

      {/* TABLE */}
      {filtered.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '40px 20px',
            color: '#6b7280',
            background: '#f9fafb',
            borderRadius: 8,
            marginTop: 20,
            fontSize: 14,
          }}
        >
          🔍 {t('accounts.noAccounts')}
          <br />
          <span style={{ fontSize: 13 }}>{t('accounts.tryDifferentSearch')}</span>
        </div>
      ) : (
        <div
          style={{
            overflowX: 'auto',
            overflowY: 'auto',
            flex: 1,
            marginTop: 20,
            border: '1px solid #e5e7eb',
            borderRadius: 8,
          }}
        >
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              backgroundColor: '#fff',
            }}
          >
            <thead>
              <tr
                style={{
                  background: '#f3f4f6',
                  textAlign: 'left',
                  position: 'sticky',
                  top: 0,
                  zIndex: 10,
                }}
              >
                <th style={thStyle}>{t('accounts.code')}</th>
                <th style={thStyle}>{t('accounts.accountName')}</th>
                <th style={thStyle}>{t('accounts.type')}</th>
                <th style={thStyle}>{t('inventory.category')}</th>
                <th style={thStyle}>{t('accounts.system')}</th>
                <th style={thStyle}>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {paginatedAccounts.map((acc) => (
                <tr
                  key={acc._id}
                  onMouseEnter={() => setHoverRow(acc._id)}
                  onMouseLeave={() => setHoverRow(null)}
                  style={{
                    borderBottom: '1px solid #eee',
                    backgroundColor:
                      hoverRow === acc._id
                        ? '#eef2ff' // 🔵 hover highlight color
                        : acc.isSystem
                          ? '#f9fafb'
                          : '#fff',
                    opacity: acc.isSystem ? 0.85 : 1,
                    transition: 'background 0.2s ease',
                    cursor: 'pointer',
                  }}
                >
                  <td style={tdStyle}>{acc.code}</td>
                  <td style={tdStyle}>{acc.name}</td>
                  <td style={tdStyle}>
                    <span style={typeBadge(acc.type)}>{acc.type}</span>
                  </td>

                  <td style={tdStyle}>{acc.category}</td>
                  <td style={tdStyle}>
                    <span
                      style={acc.isSystem ? systemBadge : userBadge}
                      title={
                        acc.isSystem
                          ? 'This is a system account and is read-only'
                          : 'User created account'
                      }
                    >
                      {acc.isSystem ? t('accounts.system') : t('accounts.user')}
                    </span>
                  </td>

                  <td style={tdStyle}>
                    <button
                      style={{
                        ...editBtn,
                        opacity: acc.isSystem ? 0.4 : 1,
                        cursor: acc.isSystem ? 'not-allowed' : 'pointer',
                      }}
                      disabled={acc.isSystem}
                      title={acc.isSystem ? 'System accounts cannot be edited' : 'Edit account'}
                      onClick={() => {
                        if (!acc.isSystem) handleEdit(acc);
                      }}
                    >
                      {t('edit')}
                    </button>

                    <button
                      style={{
                        ...deleteBtn,
                        opacity: acc.isSystem ? 0.4 : 1,
                        cursor: acc.isSystem ? 'not-allowed' : 'pointer',
                      }}
                      disabled={acc.isSystem}
                      onClick={() => {
                        if (!acc.isSystem) setDeleteId(acc._id);
                      }}
                    >
                      {t('delete')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 5 }}>
        <button disabled={currentPage === 1} onClick={() => setCurrentPage((p) => p - 1)}>
          {t('previous')}
        </button>

        <span>
          {t('page')} {currentPage} {t('of')} {totalPages}
        </span>

        <button disabled={currentPage === totalPages} onClick={() => setCurrentPage((p) => p + 1)}>
          {t('next')}
        </button>
      </div>

      {/* DELETE MODAL */}
      {deleteId && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <div style={{ background: '#fff', padding: 20, borderRadius: 8 }}>
            <p>❗ {t('accounts.deleteConfirm')}</p>
            <button onClick={confirmDelete} style={{ marginRight: 10 }}>
              {t('common.yes')}
            </button>
            <button onClick={cancelDelete}>{t('common.no')}</button>
          </div>
        </div>
      )}
    </div>
  );
};

/* ===== TABLE STYLES (MUST BE OUTSIDE COMPONENT) ===== */
const thStyle = {
  padding: '10px',
  fontWeight: 600,
  fontSize: '14px',
  borderBottom: '2px solid #ddd',
};

const tdStyle = {
  padding: '10px',
  fontSize: '14px',
};

/* ================= STYLES (Phase-8A + 8B) ================= */

const typeBadge = (type) => {
  const colors = {
    Asset: '#16a34a',
    Liability: '#dc2626',
    Equity: '#7c3aed',
    Income: '#2563eb',
    Expense: '#ea580c',
  };

  return {
    backgroundColor: colors[type] || '#6b7280',
    color: '#fff',
    padding: '4px 8px',
    borderRadius: 12,
    fontSize: 12,
    fontWeight: 600,
    display: 'inline-block',
  };
};

const systemBadge = {
  backgroundColor: '#111827',
  color: '#ffffff',
  padding: '4px 8px',
  borderRadius: 12,
  fontSize: 12,
  fontWeight: 700,
};

const userBadge = {
  backgroundColor: '#d1d5db',
  color: '#111827',
  padding: '4px 8px',
  borderRadius: 12,
  fontSize: 12,
  fontWeight: 600,
};

const editBtn = {
  padding: '6px 10px',
  borderRadius: 6,
  border: '1px solid #2563eb',
  backgroundColor: '#eff6ff',
  color: '#1d4ed8',
  cursor: 'pointer',
};

const deleteBtn = {
  padding: '6px 10px',
  borderRadius: 6,
  border: '1px solid #dc2626',
  backgroundColor: '#fef2f2',
  color: '#b91c1c',
  cursor: 'pointer',
  marginLeft: 8,
};

// ===== Form Styles =====
const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 6,
  border: '1px solid #d1d5db',
  fontSize: 14,
};

const primaryBtn = {
  background: '#2563eb',
  color: '#fff',
  padding: '10px 18px',
  borderRadius: 6,
  border: 'none',
  cursor: 'pointer',
};

const secondaryBtn = {
  background: '#e5e7eb',
  color: '#111',
  padding: '10px 18px',
  borderRadius: 6,
  border: 'none',
  cursor: 'pointer',
};
const filterSelect = {
  padding: '10px 12px',
  borderRadius: 6,
  border: '1px solid #d1d5db',
  fontSize: 14,
  background: '#fff',
};

// ===== Counter Styles (Phase-C) =====
const counterBox = {
  background: 'rgba(255,255,255,0.15)',
  padding: '10px 16px',
  borderRadius: 8,
  minWidth: 90,
};

const counterLabel = {
  fontSize: 12,
  opacity: 0.85,
};

const counterValue = {
  fontSize: 20,
};

export default ChartOfAccountsPage;
