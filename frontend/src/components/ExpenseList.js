import React, { useEffect, useState } from 'react';
import { getAllExpenses, deleteExpense } from '../services/expenseService';
import { useNavigate } from 'react-router-dom';
import { t } from '../i18n/i18n';

const ExpenseList = () => {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const fetchData = async () => {
    try {
      const data = await getAllExpenses();
      setExpenses(data);
    } catch (err) {
      alert(t('alerts.expenseLoadError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDelete = async (id) => {
    if (!window.confirm(t('alerts.confirmDeleteExpense'))) return;
    try {
      await deleteExpense(id);
      fetchData(); // refresh list
    } catch (err) {
      alert(t('alerts.expenseDeleteFailed'));
    }
  };

  return (
    <div className="p-6 bg-white rounded shadow-md">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">{t('expense.allExpenses')}</h2>
        <button
          onClick={() => navigate('/add-expense')}
          className="bg-blue-600 text-white px-4 py-2 rounded"
        >
          + {t('expense.new')}
        </button>
      </div>

      {loading ? (
        <p>{t('common.loading')}</p>
      ) : expenses.length === 0 ? (
        <p>{t('expense.noneFound')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm border">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-2 border">{t('common.date')}</th>
                <th className="p-2 border">{t('common.title')}</th>
                <th className="p-2 border">{t('expense.category')}</th>
                <th className="p-2 border">{t('expense.paymentMode')}</th>
                <th className="p-2 border">{t('expense.creditAccounts')}</th>
                <th className="p-2 border">{t('common.amount')}</th>
                <th className="p-2 border">{t('common.actions')}</th>
              </tr>
            </thead>

            <tbody>
              {expenses.map((e) => (
                <tr key={e._id} className="text-center">
                  <td className="p-2 border">
                    {e.date ? new Date(e.date).toLocaleDateString() : '-'}
                  </td>

                  <td className="p-2 border">{e.title}</td>

                  <td className="p-2 border">{e.category?.name || '-'}</td>

                  {/* ✅ Payment Mode */}
                  <td className="p-2 border capitalize">{e.paymentMode || '-'}</td>

                  {/* ✅ Credit Accounts */}
                  <td className="p-2 border">{e.creditAccounts || '-'}</td>

                  <td className="p-2 border">{Number(e.amount).toFixed(2)}</td>
                  <td className="p-2 border">
                    <div className="flex gap-2 justify-center">
                      <button
                        onClick={() => navigate(`/edit-expense/${e._id}`)}
                        className="bg-yellow-500 text-white px-3 py-1 rounded"
                      >
                        {t('common.edit')}
                      </button>

                      <button
                        onClick={() => handleDelete(e._id)}
                        className="bg-red-600 text-white px-3 py-1 rounded"
                      >
                        {t('common.delete')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {expenses.length === 0 && (
                <tr>
                  <td colSpan="7" className="text-center p-4">
                    {t('expense.noneFound')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ExpenseList;
