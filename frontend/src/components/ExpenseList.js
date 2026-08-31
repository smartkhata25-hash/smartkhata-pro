import React, { useEffect, useState, useCallback } from 'react';
import { getAllExpenses, deleteExpense } from '../services/expenseService';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { t } from '../i18n/i18n';
import { hasPermission } from '../utils/permissionHelper';

const ExpenseList = () => {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const moduleScope = String(searchParams.get('moduleScope') || '').toLowerCase();
  const isTravelExpenseView = moduleScope === 'travel';
  const canViewExpenses = hasPermission('expenses.view');
  const canCreateExpenses = hasPermission('expenses.create');
  const canEditExpenses = hasPermission('expenses.edit');
  const canDeleteExpenses = hasPermission('expenses.delete');

  const fetchData = useCallback(async () => {
    if (!canViewExpenses) {
      setLoading(false);
      return;
    }

    try {
      const data = await getAllExpenses(isTravelExpenseView ? { moduleScope: 'travel' } : {});
      setExpenses(Array.isArray(data) ? data : []);
    } catch (err) {
      alert(t('alerts.expenseLoadError'));
      setExpenses([]);
    } finally {
      setLoading(false);
    }
  }, [canViewExpenses, isTravelExpenseView]);

  useEffect(() => {
    if (!canViewExpenses) {
      navigate('/dashboard');
      return;
    }

    fetchData();
  }, [canViewExpenses, navigate, fetchData]);

  const handleDelete = async (id) => {
    if (!canDeleteExpenses) {
      alert('You do not have permission to delete expenses');
      return;
    }

    if (!window.confirm(t('alerts.confirmDeleteExpense'))) return;

    try {
      await deleteExpense(id, isTravelExpenseView ? { moduleScope: 'travel' } : {});
      fetchData();
    } catch (err) {
      alert(t('alerts.expenseDeleteFailed'));
    }
  };

  return (
    <div className="p-6 bg-white rounded shadow-md">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">
          {t(isTravelExpenseView ? 'travel.reports.expenses.title' : 'expense.allExpenses')}
        </h2>
        {canCreateExpenses && (
          <button
            onClick={() => navigate(isTravelExpenseView ? '/travel/expenses/new' : '/add-expense')}
            className="bg-blue-600 text-white px-4 py-2 rounded"
          >
            + {t('expense.new')}
          </button>
        )}
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
                      {canEditExpenses && (
                        <button
                          onClick={() =>
                            navigate(
                              isTravelExpenseView
                                ? `/travel/expenses/${e._id}/edit`
                                : `/edit-expense/${e._id}`
                            )
                          }
                          className="bg-yellow-500 text-white px-3 py-1 rounded"
                        >
                          {t('common.edit')}
                        </button>
                      )}
                      {canDeleteExpenses && (
                        <button
                          onClick={() => handleDelete(e._id)}
                          className="bg-red-600 text-white px-3 py-1 rounded"
                        >
                          {t('common.delete')}
                        </button>
                      )}
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
