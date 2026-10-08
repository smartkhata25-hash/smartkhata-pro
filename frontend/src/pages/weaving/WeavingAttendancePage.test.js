import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

jest.mock('../../services/weavingAttendanceService', () => ({
  getWeavingAttendanceMeta: jest.fn(),
  getWeavingAttendanceHistory: jest.fn(),
  getWeavingAttendanceSession: jest.fn(),
  getWeavingWorkPeriodState: jest.fn(),
  saveWeavingAttendanceSession: jest.fn(),
  startWeavingWorkPeriod: jest.fn(),
  swapWeavingAttendanceOrder: jest.fn(),
}));

import { ReplacementSelect } from './WeavingAttendancePage';

const employees = [
  { _id: 'current', name: 'Current Worker', shiftId: 'day' },
  { _id: 'night', name: 'Night Worker', employeeNo: 'E-2', shiftId: 'night' },
  { _id: 'assigned', name: 'Assigned Worker', shiftId: 'night' },
  { _id: 'evening', name: 'Evening Worker', shiftId: 'evening' },
];

const renderReplacement = (props = {}) => {
  const onChange = jest.fn();
  render(
    <ReplacementSelect
      row={{ employeeId: 'current', replacementEmployeeId: '' }}
      options={employees}
      assignedIds={new Set(['assigned'])}
      selectedShiftId="day"
      disabled={false}
      onChange={onChange}
      {...props}
    />
  );

  return { input: screen.getByRole('combobox'), onChange };
};

describe('attendance ReplacementSelect keyboard navigation', () => {
  test('selects an eligible replacement with ArrowDown and Enter', async () => {
    const { input, onChange } = renderReplacement();

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('night');
    await waitFor(() => expect(input).toHaveAttribute('aria-expanded', 'false'));
  });

  test('search filtering is preserved and resets the active option', async () => {
    const { input } = renderReplacement();

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.change(input, { target: { value: 'Evening' } });

    await waitFor(() => expect(input).not.toHaveAttribute('aria-activedescendant'));
    expect(screen.getByRole('option', { name: /Evening Worker/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Assigned Worker/ })).not.toBeInTheDocument();
  });

  test('ArrowUp reaches No Replacement and Escape is contained', () => {
    const parentKeyDown = jest.fn();
    const onChange = jest.fn();
    const row = { employeeId: 'current', replacementEmployeeId: 'night' };

    render(
      <div onKeyDown={parentKeyDown}>
        <ReplacementSelect
          row={row}
          options={employees}
          assignedIds={new Set()}
          selectedShiftId="day"
          disabled={false}
          onChange={onChange}
        />
      </div>
    );

    const input = screen.getByRole('combobox');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('');

    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(parentKeyDown).not.toHaveBeenCalled();
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });
});
