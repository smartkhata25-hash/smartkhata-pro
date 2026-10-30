export const purchaseLineStarted = (row, kind) => {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return false;

  if (kind === 'yarn') return Boolean(row.yarnId || row.kg || row.lbs || row.rate);
  if (kind === 'fabric') {
    return Boolean(row.fabricQualityId || row.quantity || row.weightKg || row.rate);
  }
  return Boolean(row.itemId || row.quantity || row.rate);
};

export const validPurchaseLines = (lines) =>
  Array.isArray(lines)
    ? lines.filter((row) => row && typeof row === 'object' && !Array.isArray(row))
    : [];

// Prepared rows correspond only to started rows. Build the position mapping inside
// this pure helper so React can safely replay a state updater in StrictMode.
export const mergePreparedYarnLines = (currentLines, preparedLines) => {
  const safeCurrent = validPurchaseLines(currentLines);
  const safePrepared = validPurchaseLines(preparedLines);
  const activePositions = safeCurrent.reduce((positions, row, index) => {
    if (purchaseLineStarted(row, 'yarn')) positions.push(index);
    return positions;
  }, []);
  const preparedByPosition = new Map(
    activePositions.map((lineIndex, preparedIndex) => [lineIndex, safePrepared[preparedIndex]])
  );

  return safeCurrent.map((row, index) => preparedByPosition.get(index) || row);
};
