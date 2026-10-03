import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FaUndo } from 'react-icons/fa';
import { restoreProduct } from '../services/inventoryService';
import { clearInventoryCache } from '../utils/inventoryCache';

const DeletedProductsTable = ({ products, onRestored }) => {
  const navigate = useNavigate();
  const restore = async (product) => {
    if (!window.confirm('Restore Item?\n\nThis item will become available again in Inventory, Sales and Purchases.')) return;
    try {
      await restoreProduct(product._id);
      clearInventoryCache();
      onRestored(product._id);
    } catch (error) {
      alert(error.response?.data?.message || 'Could not restore this item.');
    }
  };

  return <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div><h1 className="text-xl font-bold text-slate-900">Deleted Items</h1><p className="text-sm text-slate-500">Restore archived products without changing their history or image.</p></div>
      <button type="button" onClick={() => navigate('/inventory')} className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white">Back to Item List</button>
    </div>
    <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200 bg-white">
      <table className="min-w-full text-sm"><thead className="sticky top-0 bg-slate-100 text-left"><tr><th className="p-3">Item Name</th><th className="p-3">Category</th><th className="p-3">Unit</th><th className="p-3">Deleted Date</th><th className="p-3">Deleted By</th><th className="p-3">Stock</th><th className="p-3 text-center">Action</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{products.map((product) => <tr key={product._id}><td className="p-3 font-semibold">{product.name}</td><td className="p-3">{product.categoryId?.name || '-'}</td><td className="p-3">{product.unit || '-'}</td><td className="p-3">{product.deletedAt ? new Date(product.deletedAt).toLocaleString() : '-'}</td><td className="p-3">{product.deletedBy?.name || product.deletedBy?.email || '-'}</td><td className="p-3">{product.stock ?? 0}</td><td className="p-3 text-center"><button type="button" onClick={() => restore(product)} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 font-semibold text-white"><FaUndo /> Restore</button></td></tr>)}{!products.length && <tr><td colSpan="7" className="p-10 text-center text-slate-500">No deleted items.</td></tr>}</tbody>
      </table>
    </div>
  </div>;
};

export default DeletedProductsTable;
