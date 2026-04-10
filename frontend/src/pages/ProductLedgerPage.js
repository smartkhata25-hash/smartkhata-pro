// pages/ProductLedgerPage.js
import React from 'react';
import { useParams } from 'react-router-dom';
import ProductLedger from '../components/ProductLedger';

const ProductLedgerPage = () => {
  const { productId } = useParams();

  return (
    <div style={{ padding: '0px', height: 'calc(100vh - 70px)', overflow: 'hidden' }}>
      <ProductLedger productId={productId} />
    </div>
  );
};

export default ProductLedgerPage;
