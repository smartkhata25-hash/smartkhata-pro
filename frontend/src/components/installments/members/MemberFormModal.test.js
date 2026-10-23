import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import MemberFormModal from './MemberFormModal';
import {
  createInstallmentsMember,
  getNextInstallmentsMemberNumber,
  previewInstallmentsSchedule,
} from '../../../services/installmentsMemberService';

jest.mock('../../../services/installmentsMemberService', () => ({
  createInstallmentsMember: jest.fn(),
  updateInstallmentsMember: jest.fn(),
  getNextInstallmentsMemberNumber: jest.fn(),
  previewInstallmentsSchedule: jest.fn(),
}));

beforeEach(() => {
  localStorage.setItem('lang', 'en');
  getNextInstallmentsMemberNumber.mockResolvedValue({ number: '000001' });
  previewInstallmentsSchedule.mockResolvedValue({
    totalOccurrences: 100,
    estimatedEndDate: '2026-04-10',
    dates: ['2026-01-01', '2026-01-02'],
  });
  createInstallmentsMember.mockResolvedValue({
    member: { _id: 'member-1', memberNumber: '000001', fullName: 'Ali' },
    firstCommittee: null,
  });
});

test('shows one proposed number and always-visible optional committee fields without the old checkbox', async () => {
  render(<MemberFormModal open onClose={jest.fn()} onSaved={jest.fn()} canManageOpening canManageCommittees />);

  expect(await screen.findByDisplayValue('000001')).toBeInTheDocument();
  expect(screen.queryByText('Configure the first committee now')).not.toBeInTheDocument();
  expect(screen.getByLabelText(/Committee Amount/)).toBeInTheDocument();
  expect(screen.getByLabelText(/Payment Frequency/)).toBeInTheDocument();
  expect(screen.getByLabelText(/Installment Amount/)).toBeInTheDocument();
  expect(screen.getByLabelText(/CNIC.*Optional/)).toBeInTheDocument();
  expect(screen.queryByLabelText(/Alternate Mobile/)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/^Status/)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save Member' })).toBeInTheDocument();
});

test('reveals and preserves working custom amount inputs', async () => {
  render(<MemberFormModal open onClose={jest.fn()} onSaved={jest.fn()} canManageOpening canManageCommittees />);
  await screen.findByDisplayValue('000001');

  fireEvent.change(screen.getByLabelText(/Committee Amount/), { target: { value: 'custom' } });
  const customCommittee = screen.getByPlaceholderText('Enter custom committee amount');
  fireEvent.change(customCommittee, { target: { value: '85000' } });
  fireEvent.change(screen.getByLabelText(/Installment Amount/), { target: { value: 'custom' } });
  const customInstallment = screen.getByPlaceholderText('Enter installment amount');
  fireEvent.change(customInstallment, { target: { value: '750' } });

  expect(customCommittee).toHaveValue(85000);
  expect(customInstallment).toHaveValue(750);
});

test('rejects a partially configured committee instead of silently discarding it', async () => {
  render(<MemberFormModal open onClose={jest.fn()} onSaved={jest.fn()} canManageOpening canManageCommittees />);
  await screen.findByDisplayValue('000001');
  fireEvent.change(screen.getByLabelText(/Full Name/), { target: { value: 'Ali' } });
  fireEvent.change(screen.getByLabelText(/Mobile Number/), { target: { value: '03001234567' } });
  fireEvent.change(screen.getByLabelText(/Committee Amount/), { target: { value: '50000' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save Member & Committee' }));

  expect(await screen.findByText('Select a payment frequency.')).toBeInTheDocument();
  expect(screen.getByText('Select or enter a valid installment amount.')).toBeInTheDocument();
  expect(createInstallmentsMember).not.toHaveBeenCalled();
});

test('saves a complete first committee but permits a genuinely blank committee', async () => {
  const onSaved = jest.fn();
  const { unmount } = render(<MemberFormModal open onClose={jest.fn()} onSaved={onSaved} canManageOpening canManageCommittees />);
  await screen.findByDisplayValue('000001');
  fireEvent.change(screen.getByLabelText(/Full Name/), { target: { value: 'Ali' } });
  fireEvent.change(screen.getByLabelText(/Mobile Number/), { target: { value: '03001234567' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save Member' }));
  await waitFor(() => expect(createInstallmentsMember).toHaveBeenCalledWith(expect.not.objectContaining({ firstCommittee: expect.anything() })));

  unmount();
  createInstallmentsMember.mockClear();
  createInstallmentsMember.mockResolvedValue({ member: { _id: 'member-2' }, firstCommittee: { _id: 'committee-1' } });
  render(<MemberFormModal open onClose={jest.fn()} onSaved={onSaved} canManageOpening canManageCommittees />);
  await screen.findByDisplayValue('000001');
  fireEvent.change(screen.getByLabelText(/Full Name/), { target: { value: 'Ahmed' } });
  fireEvent.change(screen.getByLabelText(/Mobile Number/), { target: { value: '03009876543' } });
  fireEvent.change(screen.getByLabelText(/Committee Amount/), { target: { value: '50000' } });
  fireEvent.change(screen.getByLabelText(/Payment Frequency/), { target: { value: 'daily' } });
  fireEvent.change(screen.getByLabelText(/Installment Amount/), { target: { value: '400' } });
  expect(await screen.findByText(/Schedule Summary:/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'View Dates' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Save Member & Committee' }));

  await waitFor(() => expect(createInstallmentsMember).toHaveBeenCalledWith(expect.objectContaining({
    memberNumber: '000001',
    firstCommittee: expect.objectContaining({ targetAmount: '50000', contributionAmount: '400' }),
  })));
});
