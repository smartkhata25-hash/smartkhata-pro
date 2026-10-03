export const hasKnownExactExpenseTitle = ({ selectedTitleId, search, searchResults = [], knownTitles = [] }) => {
  if (selectedTitleId) return true;
  const normalizedSearch = String(search || '').trim().toLowerCase();
  if (!normalizedSearch) return false;
  return [...searchResults, ...knownTitles].some((item) => String(item?.name || '').trim().toLowerCase() === normalizedSearch);
};
