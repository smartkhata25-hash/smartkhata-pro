import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import SearchableCreatableSelect from './SearchableCreatableSelect';

const options = [
  { _id: '1', name: 'Alpha Yarn' },
  { _id: '2', name: 'Beta Yarn' },
  { _id: '3', name: 'Gamma Yarn' },
];

const renderSelect = (props = {}) => {
  const onChange = jest.fn();
  const result = render(
    <SearchableCreatableSelect
      label="Yarn"
      placeholder="Choose yarn"
      options={options}
      value=""
      onChange={onChange}
      {...props}
    />
  );

  return { ...result, input: screen.getByRole('combobox'), onChange };
};

describe('SearchableCreatableSelect keyboard navigation', () => {
  test('ArrowDown and ArrowUp traverse and wrap available records', () => {
    const { input } = renderSelect();

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input).toHaveAttribute('aria-activedescendant', expect.stringContaining('option-0'));

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input).toHaveAttribute('aria-activedescendant', expect.stringContaining('option-2'));
  });

  test('Enter selects the highlighted record without submitting its parent form', () => {
    const onSubmit = jest.fn((event) => event.preventDefault());
    const onChange = jest.fn();

    render(
      <form onSubmit={onSubmit}>
        <SearchableCreatableSelect label="Yarn" options={options} value="" onChange={onChange} />
      </form>
    );

    const input = screen.getByRole('combobox');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('1', options[0]);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });

  test('filtering resets the highlight and empty results remain safe', async () => {
    const { input } = renderSelect();

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.change(input, { target: { value: 'Beta' } });

    await waitFor(() => expect(input).not.toHaveAttribute('aria-activedescendant'));
    expect(screen.getAllByRole('option')).toHaveLength(1);

    fireEvent.change(input, { target: { value: 'No such yarn' } });
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(() => fireEvent.keyDown(input, { key: 'ArrowDown' })).not.toThrow();
  });

  test('Quick Add executes from the keyboard only once while pending', async () => {
    let resolveQuickAdd;
    const onQuickAdd = jest.fn(() => new Promise((resolve) => { resolveQuickAdd = resolve; }));
    const { input } = renderSelect({ onQuickAdd });

    fireEvent.change(input, { target: { value: 'Delta Yarn' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onQuickAdd).toHaveBeenCalledTimes(1);
    expect(onQuickAdd).toHaveBeenCalledWith('Delta Yarn');

    resolveQuickAdd({ _id: '4', name: 'Delta Yarn' });
    await waitFor(() => expect(input).toHaveAttribute('aria-expanded', 'false'));
  });

  test('Add With Details executes only when its action is explicitly highlighted', () => {
    const onAddDetails = jest.fn();
    const { input } = renderSelect({ onAddDetails });

    fireEvent.change(input, { target: { value: 'New Quality' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onAddDetails).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onAddDetails).toHaveBeenCalledTimes(1);
    expect(onAddDetails).toHaveBeenCalledWith('New Quality');
  });

  test('Escape closes without clearing the selected value or reaching a parent handler', () => {
    const parentKeyDown = jest.fn();
    const onChange = jest.fn();

    render(
      <div onKeyDown={parentKeyDown}>
        <SearchableCreatableSelect label="Yarn" options={options} value="2" onChange={onChange} />
      </div>
    );

    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(input).toHaveValue('Beta Yarn');
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(onChange).not.toHaveBeenCalled();
    expect(parentKeyDown).not.toHaveBeenCalled();
  });

  test('mouse selection still uses the existing selection callback', () => {
    const { input, onChange } = renderSelect();

    fireEvent.focus(input);
    fireEvent.pointerDown(screen.getByRole('option', { name: 'Gamma Yarn' }));
    expect(onChange).toHaveBeenCalledWith('3', options[2]);
  });

  test('Tab remains available for normal form navigation', () => {
    const { input } = renderSelect();

    expect(fireEvent.keyDown(input, { key: 'Tab' })).toBe(true);
  });
});
