import React, { useState, useEffect } from 'react';
import { createSupplier, updateSupplier } from '../services/supplierService';

const initialState = {
  name: '',
  phone: '',
  email: '',
  address: '',
  openingBalance: 0,
  supplierType: 'vendor',
  notes: '',
};

export default function SupplierForm({ selected, onSuccess, onCancel }) {
  const [form, setForm] = useState(initialState);
  const [error, setError] = useState('');

  useEffect(() => {
    if (selected) setForm(selected);
    else setForm(initialState);
  }, [selected]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm({ ...form, [name]: name === 'openingBalance' ? parseFloat(value) : value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      if (selected) {
        await updateSupplier(selected._id, form);
      } else {
        await createSupplier(form);
      }
      setForm(initialState);
      onSuccess();
    } catch (err) {
      console.error('❌ Supplier save error:', err);
      if (err?.response?.data?.message?.includes('exists')) {
        setError('⚠️ Supplier with this name already exists!');
      } else {
        setError('❌ Failed to save supplier. Please try again.');
      }
    }
  };

  const handleCancel = () => {
    setForm(initialState);
    onCancel?.();
  };

  return (
    <form onSubmit={handleSubmit} className="card p-4 mb-4 shadow">
      <h4>{selected ? '✏️ Edit Supplier' : '➕ Add Supplier'}</h4>

      {error && <div className="text-red-600 mb-2">{error}</div>}

      <div className="grid gap-2 grid-cols-2">
        <input name="name" value={form.name} onChange={handleChange} placeholder="Name" required />
        <input
          name="phone"
          value={form.phone}
          onChange={handleChange}
          placeholder="Phone"
          type="text"
          pattern="\d*"
        />
        <input
          name="email"
          value={form.email}
          onChange={handleChange}
          placeholder="Email"
          type="email"
        />
        <input name="address" value={form.address} onChange={handleChange} placeholder="Address" />
        <input
          name="openingBalance"
          value={form.openingBalance}
          onChange={handleChange}
          placeholder="Opening Balance"
          type="number"
        />
        <select name="supplierType" value={form.supplierType} onChange={handleChange}>
          <option value="vendor">Vendor</option>
          <option value="blocked">Blocked</option>
          <option value="other">Other</option>
        </select>

        <textarea
          name="notes"
          value={form.notes}
          onChange={handleChange}
          placeholder="Notes"
          className="col-span-2"
        />
      </div>

      <div className="mt-3 flex gap-2">
        <button type="submit" className="btn btn-primary">
          {selected ? 'Update' : 'Save'}
        </button>
        {selected && (
          <button type="button" onClick={handleCancel} className="btn">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
