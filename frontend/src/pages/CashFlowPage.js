// src/pages/CashFlowPage.js

import React from 'react';
import CashFlowChart from '../components/CashFlowChart';

const CashFlowPage = () => (
  <div
    style={{
      minHeight: '100vh',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      background: '#f4f4f4',
      overflow: 'hidden', // ✅ scroll کو روکے گا
    }}
  >
    <CashFlowChart />
  </div>
);

export default CashFlowPage;
