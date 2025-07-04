import React from 'react';

const LowStockAlert = ({ products }) => {
  const lowStock = products.filter(p => p.stock <= p.lowStockThreshold);

  if (lowStock.length === 0) return null;

  return (
    <div style={{ color: 'red' }}>
      <h4>⚠️ Low Stock Alerts</h4>
      <ul>
        {lowStock.map(p => (
          <li key={p._id}>{p.name} - only {p.stock} left!</li>
        ))}
      </ul>
    </div>
  );
};

export default LowStockAlert;
