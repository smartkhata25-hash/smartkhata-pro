import React from 'react';
import { t } from '../i18n/i18n';
const LowStockAlert = ({ products }) => {
  const lowStock = products.filter((p) => p.stock <= p.lowStockThreshold);

  if (lowStock.length === 0) return null;

  return (
    <div style={{ color: 'red' }}>
      <h4>⚠️ {t('alerts.lowStockAlerts')}</h4>
      <ul>
        {lowStock.map((p) => (
          <li key={p._id}>
            {p.name} - {t('alerts.only')} {p.stock} {t('alerts.left')}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default LowStockAlert;
