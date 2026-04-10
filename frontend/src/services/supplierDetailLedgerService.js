import axios from 'axios';

export const getSupplierDetailedLedger = async (supplierId, startDate, endDate) => {
  const token = localStorage.getItem('token');

  const params = {};
  if (startDate) params.startDate = startDate;
  if (endDate) params.endDate = endDate;

  const res = await axios.get(`/api/suppliers/${supplierId}/detailed-ledger`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    params,
  });

  return res.data;
};
