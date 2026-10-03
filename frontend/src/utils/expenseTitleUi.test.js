import { hasKnownExactExpenseTitle } from './expenseTitleUi';

test('selected or known Expense Titles suppress Add New while edited unknown text permits it', () => {
  const title = { _id: 'title-1', name: 'Delivery Charges' };
  expect(hasKnownExactExpenseTitle({ selectedTitleId: title._id, search: title.name })).toBe(true);
  expect(hasKnownExactExpenseTitle({ selectedTitleId: '', search: title.name, searchResults: [], knownTitles: [title] })).toBe(true);
  expect(hasKnownExactExpenseTitle({ selectedTitleId: '', search: 'Delivery Charges revised', searchResults: [], knownTitles: [title] })).toBe(false);
});
