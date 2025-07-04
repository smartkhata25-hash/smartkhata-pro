import React, { useEffect, useState } from 'react';
import { getAllExpenses, deleteExpense } from '../services/expenseService';
import { useNavigate } from 'react-router-dom';

const ExpenseList = () => {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const fetchData = async () => {
    try {
      const data = await getAllExpenses();
      setExpenses(data);
    } catch (err) {
      alert('Error loading expenses');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this expense?')) return;
    try {
      await deleteExpense(id);
      fetchData(); // refresh list
    } catch (err) {
      alert('Failed to delete expense.');
    }
  };

  return (
    <div className="p-6 bg-white rounded shadow-md">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">All Expenses</h2>
        <button
          onClick={() => navigate('/add-expense')}
          className="bg-blue-600 text-white px-4 py-2 rounded"
        >
          + New Expense
        </button>
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : expenses.length === 0 ? (
        <p>No expenses found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm border">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-2 border">Date</th>
                <th className="p-2 border">Title</th>
                <th className="p-2 border">Category</th>
                <th className="p-2 border">Amount</th>
                <th className="p-2 border">Payment</th>
                <th className="p-2 border">Credit Accounts</th>
                <th className="p-2 border">Actions</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <tr key={e._id}>
                  <td className="p-2 border">{e.date}</td>
                  <td className="p-2 border">{e.title}</td>
                  <td className="p-2 border">{e.category?.name || '-'}</td>
                  <td className="p-2 border text-right">{parseFloat(e.amount).toFixed(2)}</td>
                  <td className="p-2 border">{e.paymentType}</td>
                  <td className="p-2 border">
                    {(e.creditEntries && e.creditEntries.map((c) => c.account?.name).join(', ')) ||
                      '-'}
                  </td>
                  <td className="p-2 border">
                    <div className="flex gap-2">
                      <button
                        onClick={() => navigate(`/edit-expense/${e._id}`)}
                        className="bg-yellow-500 text-white px-3 py-1 rounded"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(e._id)}
                        className="bg-red-600 text-white px-3 py-1 rounded"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ExpenseList;
