import React, { useEffect, useState } from 'react';
import {
  getAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
} from '../services/accountService';

const ChartOfAccountsPage = () => {
  const [accounts, setAccounts] = useState([]);
  const [form, setForm] = useState({
    name: '',
    type: 'Asset',
    code: '',
    category: '',
  });
  const [search, setSearch] = useState('');
  const [editId, setEditId] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [error, setError] = useState('');

  const fetchAccounts = async () => {
    try {
      const data = await getAccounts();
      if (data) setAccounts(data);
    } catch (err) {
      console.error('Error fetching accounts:', err);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      if (editId) {
        await updateAccount(editId, form);
        alert('✅ Account updated successfully.');
      } else {
        await createAccount(form);
        alert('✅ Account created successfully.');
      }

      setForm({ name: '', type: 'Asset', code: '', category: '' });
      setEditId(null);
      fetchAccounts();
    } catch (err) {
      console.error('Error submitting account:', err);
      const msg = err.response?.data?.message || 'Account create/update failed.';
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
  };

  const confirmDelete = async () => {
    try {
      await deleteAccount(deleteId);
      setDeleteId(null);
      fetchAccounts();
      alert('✅ Account deleted.');
    } catch (err) {
      console.error('Error deleting account:', err);
      alert('❌ Failed to delete account.');
    }
  };

  const cancelDelete = () => {
    setDeleteId(null);
  };

  const normalizedSearch = search.toLowerCase().trim();
  const filtered = accounts.filter(
    (acc) =>
      acc.name.toLowerCase().includes(normalizedSearch) ||
      acc.code.toLowerCase().includes(normalizedSearch) ||
      acc.type.toLowerCase().includes(normalizedSearch) ||
      (acc.category && acc.category.toLowerCase().includes(normalizedSearch))
  );

  return (
    <div style={{ padding: '20px' }}>
      <h2>📘 Chart of Accounts</h2>

      {error && <div style={{ color: 'red', marginBottom: '10px' }}>{error}</div>}

      <form onSubmit={handleSubmit} style={{ marginBottom: '20px' }}>
        <input
          name="name"
          value={form.name}
          onChange={handleChange}
          placeholder="Account Name"
          required
        />
        <input
          name="code"
          value={form.code}
          onChange={handleChange}
          placeholder="Account Code"
          required
          disabled={!!editId}
        />
        <select name="type" value={form.type} onChange={handleChange}>
          <option value="Asset">Asset</option>
          <option value="Liability">Liability</option>
          <option value="Equity">Equity</option>
          <option value="Income">Income</option>
          <option value="Expense">Expense</option>
        </select>
        <select name="category" value={form.category} onChange={handleChange} required>
          <option value="">Select Category</option>
          <option value="cash">Cash</option>
          <option value="credit">Credit</option>
          <option value="cheque">Cheque</option>
          <option value="online">Online</option>
          <option value="bank">Bank</option>
          <option value="other">Other</option>
        </select>
        <button type="submit">{editId ? 'Update' : 'Add'} Account</button>
      </form>

      <input
        type="text"
        placeholder="🔍 Search accounts..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ marginBottom: '10px' }}
      />

      {filtered.length === 0 ? (
        <p style={{ color: '#777' }}>No accounts found.</p>
      ) : (
        <ul>
          {filtered.map((acc) => (
            <li key={acc._id}>
              <strong>{acc.code}</strong> - {acc.name} ({acc.type}) [{acc.category}]
              <button onClick={() => handleEdit(acc)} style={{ marginLeft: '10px' }}>
                ✏️ Edit
              </button>
              <button onClick={() => setDeleteId(acc._id)} style={{ marginLeft: '5px' }}>
                🗑️ Delete
              </button>
            </li>
          ))}
        </ul>
      )}

      {deleteId && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <div style={{ background: 'white', padding: 20, borderRadius: 8 }}>
            <p>❗ Are you sure you want to delete this account?</p>
            <button onClick={confirmDelete} style={{ marginRight: 10 }}>
              Yes
            </button>
            <button onClick={cancelDelete}>No</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChartOfAccountsPage;
