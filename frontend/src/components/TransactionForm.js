import React, { useState } from 'react';
import { createTransaction } from '../services/inventoryService';

const TransactionForm = ({ products, onAdd }) => {
  const [form, setForm] = useState({
    productId: '',
    type: 'IN',
    quantity: 1,
    note: '',
  });

  const handleSubmit = async (e) => {
    e.preventDefault();

    const quantity = parseInt(form.quantity);

    if (!form.productId || isNaN(quantity) || quantity <= 0) {
      alert('❌ Please select a product and enter a valid quantity (> 0).');
      return;
    }

    try {
      await createTransaction({ ...form, quantity });
      setForm({ productId: '', type: 'IN', quantity: 1, note: '' });
      if (onAdd) onAdd();
    } catch (error) {
      console.error('❌ Transaction error:', error);
      alert('Something went wrong: ' + (error.message || 'Please try again.'));
    }
  };

  return (
    <div className="mt-6 p-4 bg-white rounded shadow">
      <h3 className="text-lg font-semibold mb-3">➕ New Stock Entry (In / Out)</h3>
      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
        <div>
          <label className="block mb-1">Product:</label>
          <select
            value={form.productId}
            onChange={(e) => setForm({ ...form, productId: e.target.value })}
            className="border rounded p-2 w-full"
            required
          >
            <option value="">Select Product</option>
            {Array.isArray(products) &&
              products.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name}
                </option>
              ))}
          </select>
        </div>

        <div>
          <label className="block mb-1">Type:</label>
          <select
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
            className="border rounded p-2 w-full"
          >
            <option value="IN">In</option>
            <option value="OUT">Out</option>
          </select>
        </div>

        <div>
          <label className="block mb-1">Quantity:</label>
          <input
            type="number"
            min="1"
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            className="border rounded p-2 w-full"
            required
          />
        </div>

        <div className="md:col-span-2">
          <label className="block mb-1">Note (optional):</label>
          <input
            type="text"
            placeholder="e.g., Opening stock, damage, etc."
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            className="border rounded p-2 w-full"
          />
        </div>

        <div className="md:col-span-2 text-right">
          <button
            type="submit"
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Save
          </button>
        </div>
      </form>
    </div>
  );
};

export default TransactionForm;
