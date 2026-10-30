import {
  mergePreparedYarnLines,
  purchaseLineStarted,
  validPurchaseLines,
} from './purchaseFormState';

test('started rejects nullish and malformed recovered rows', () => {
  expect(purchaseLineStarted(undefined, 'yarn')).toBe(false);
  expect(purchaseLineStarted(null, 'fabric')).toBe(false);
  expect(purchaseLineStarted([], 'general')).toBe(false);
  expect(purchaseLineStarted({ yarnId: 'yarn-1' }, 'yarn')).toBe(true);
});

test('recovered lines preserve valid entries and remove corrupt values', () => {
  const first = { yarnId: 'yarn-1', kg: '10' };
  const second = { yarnId: '', notes: 'blank row state' };
  expect(validPurchaseLines([first, undefined, null, 'bad', second])).toEqual([first, second]);
});

test('prepared yarn rows retain line order and inactive rows', () => {
  const blank = { yarnId: '', kg: '', marker: 'keep-me' };
  const current = [
    { yarnId: 'yarn-1', kg: '10' },
    blank,
    { yarnId: 'yarn-2', kg: '20' },
  ];
  const prepared = [
    { yarnId: 'yarn-1', kg: '11', prepared: true },
    { yarnId: 'yarn-2', kg: '22', prepared: true },
  ];

  expect(mergePreparedYarnLines(current, prepared)).toEqual([prepared[0], blank, prepared[1]]);
  expect(mergePreparedYarnLines(current, prepared)).toEqual([prepared[0], blank, prepared[1]]);
});

test('a preparation mismatch never inserts undefined rows', () => {
  const current = [{ yarnId: 'yarn-1' }, { yarnId: 'yarn-2' }];
  const result = mergePreparedYarnLines(current, [{ yarnId: 'prepared-1' }]);
  expect(result).toEqual([{ yarnId: 'prepared-1' }, current[1]]);
  expect(result.every(Boolean)).toBe(true);
});
