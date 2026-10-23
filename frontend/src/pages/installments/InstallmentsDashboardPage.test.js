import { render, screen } from '@testing-library/react';

import InstallmentsDashboardPage from './InstallmentsDashboardPage';
import { getInstallmentsPaymentDashboard } from '../../services/installmentsPaymentService';

jest.mock('react-router-dom', () => ({ useNavigate: () => jest.fn() }), { virtual: true });
jest.mock('../../services/installmentsPaymentService', () => ({
  getInstallmentsPaymentDashboard: jest.fn(() => Promise.resolve({
    collections: { expected: 300, actuallyReceived: 200, previousOverdue: 100 },
    customerReceivables: 1000,
    supplierPayables: 500,
    unappliedCustomerSavings: 250,
    totalSales: 1500,
    netProfit: 300,
  })),
}));

test('renders posted collection metrics and active payment actions', async () => {
  getInstallmentsPaymentDashboard.mockResolvedValue({
    collections: { expected: 300, actuallyReceived: 200, previousOverdue: 100 },
    customerReceivables: 1000,
    supplierPayables: 500,
    unappliedCustomerSavings: 250,
    totalSales: 1500,
    netProfit: 300,
  });
  localStorage.setItem('lang', 'en');
  localStorage.setItem('user', JSON.stringify({ accountRole: 'owner' }));
  render(<InstallmentsDashboardPage />);

  expect(await screen.findAllByText('300')).toHaveLength(2);
  expect(screen.queryByText('Committee & Installments Dashboard')).not.toBeInTheDocument();
  expect(screen.queryByText("Today's Collection Schedule")).not.toBeInTheDocument();
  expect(screen.queryByText('Coming Soon')).not.toBeInTheDocument();

  const plannedActions = screen.getAllByRole('button');
  expect(screen.getByRole('button', { name: 'Add Member' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Receive Payment' })).toBeEnabled();
});

