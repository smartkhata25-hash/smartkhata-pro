import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import InstallmentsMembersPage from './InstallmentsMembersPage';
import {
  getInstallmentsMember,
  getInstallmentsMembers,
  getNextInstallmentsMemberNumber,
} from '../../services/installmentsMemberService';

let mockSearchValue = '';
jest.mock('react-router-dom', () => ({
  useSearchParams: () => [new URLSearchParams(mockSearchValue), jest.fn()],
}), { virtual: true });

jest.mock('../../services/installmentsMemberService', () => ({
  getInstallmentsMembers: jest.fn(),
  getInstallmentsMember: jest.fn(),
  getInstallmentsMemberFinancialSummary: jest.fn(),
  archiveInstallmentsMember: jest.fn(),
  restoreInstallmentsMember: jest.fn(),
  createInstallmentsCommittee: jest.fn(),
  updateInstallmentsCommittee: jest.fn(),
  getNextInstallmentsMemberNumber: jest.fn().mockResolvedValue({ number: '000001' }),
  previewInstallmentsSchedule: jest.fn(),
}));

jest.mock('../../services/whatsAppTemplateService', () => ({
  fetchWhatsAppTemplate: jest.fn(),
}));

const member = {
  _id: 'member-1',
  memberNumber: 'MEM-000001',
  fullName: 'Muhammad Ali',
  mobile: '03001234567',
  joiningDate: '2026-01-01',
  openingBalanceSigned: 15000,
  balance: 15000,
  isArchived: false,
};

beforeEach(() => {
  localStorage.setItem('lang', 'en');
  localStorage.setItem('user', JSON.stringify({ accountRole: 'owner' }));
  sessionStorage.clear();
  mockSearchValue = '';
  getInstallmentsMembers.mockResolvedValue([member]);
  getNextInstallmentsMemberNumber.mockResolvedValue({ number: '000001' });
  getInstallmentsMember.mockResolvedValue({
    member,
    committees: [{
      _id: 'committee-1',
      committeeNumber: 'COM-000001',
      targetAmount: 50000,
      contributionAmount: 500,
      status: 'active',
      schedule: { frequency: 'daily', startDate: '2026-01-01' },
      preview: { totalOccurrences: 100, estimatedEndDate: '2026-04-10' },
    }],
    ledger: [{
      _id: 'entry-1',
      entryDate: '2026-01-01',
      description: 'Opening Balance',
      referenceNumber: 'OPEN-MEM-000001',
      debit: 15000,
      credit: 0,
      runningBalance: 15000,
    }],
    closingBalance: 15000,
  });
});

test('uses the responsive list-to-detail workflow and renders real ledger data', async () => {
  render(<InstallmentsMembersPage />);

  const listMember = await screen.findByRole('button', { name: /Muhammad Ali/i });
  fireEvent.click(listMember);

  await waitFor(() => expect(getInstallmentsMember).toHaveBeenCalledWith('member-1', {
    startDate: '',
    endDate: '',
  }));
  expect(await screen.findByText('COM-000001')).toBeInTheDocument();
  expect(screen.getAllByText('Opening Balance').length).toBeGreaterThan(0);
  expect(screen.getByRole('button', { name: /Back/i })).toBeInTheDocument();
  expect(sessionStorage.getItem('installmentsSelectedMember')).toBe('member-1');
});

test('opens the member form from the dashboard-compatible new query', async () => {
  mockSearchValue = 'new=1';
  render(<InstallmentsMembersPage />);
  expect(await screen.findByRole('dialog')).toBeInTheDocument();
  expect(screen.getByText('Add Member / Customer')).toBeInTheDocument();
});
