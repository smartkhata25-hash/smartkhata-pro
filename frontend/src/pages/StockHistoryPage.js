import React, { useEffect, useState } from 'react';
import TransactionTable from '../components/TransactionTable';
import { getAllTransactions, deleteTransaction, fetchProducts } from '../services/inventoryService';
import { t } from '../i18n/i18n';

const StockHistoryPage = () => {
  const [transactions, setTransactions] = useState([]);
  const [products, setProducts] = useState([]);

  // 🔁 Load Stock History + Products
  const loadData = async () => {
    const tx = await getAllTransactions();
    const pr = await fetchProducts();
    setTransactions(tx);
    setProducts(pr);
  };

  useEffect(() => {
    loadData();
  }, []);

  // ❌ Delete history entry
  const handleDelete = async (id) => {
    const confirm = window.confirm(t('alerts.deleteTransaction'));
    if (!confirm) return;
    await deleteTransaction(id);
    loadData();
  };

  return (
    <div style={{ padding: '20px' }}>
      <h2 className="text-xl font-bold mb-4">📜 {t('inventory.stockHistory')}</h2>

      <TransactionTable transactions={transactions} products={products} onDelete={handleDelete} />
    </div>
  );
};

export default StockHistoryPage;
