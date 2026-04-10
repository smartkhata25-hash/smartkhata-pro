// src/pages/MonthlySalesPage.js

import React from 'react';
import MonthlySalesChart from '../components/MonthlySalesChart';
import { t } from '../i18n/i18n';

const MonthlySalesPage = () => (
  <div style={{ padding: '20px' }}>
    <h2>📈 {t('dashboard.monthlySalesChart')}</h2>
    <MonthlySalesChart />
  </div>
);

export default MonthlySalesPage;
