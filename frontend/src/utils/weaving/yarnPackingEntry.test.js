import { autoYarnWeight } from './yarnPackaging';
import {
  coneRowsToLegacy,
  fullPackageConversion,
  hydrateConeRows,
  parsePackageShorthand,
  validateYarnPackingLine,
} from './yarnPackingEntry';

describe('Yarn package shorthand', () => {
  test.each([
    ['5', 5, 0],
    ['5.2', 5, 2],
    ['5.10', 5, 10],
    ['5.23', 5, 23],
    ['5.02', 5, 2],
  ])('%s means %s packages and %s cones', (raw, packages, cones) => {
    expect(parsePackageShorthand(raw)).toEqual(expect.objectContaining({
      valid: true,
      packages,
      cones,
    }));
  });

  test.each(['-1', '.2', '5..2', '5.2.1', '5.-2', '5.2a'])('rejects invalid shorthand %s', (raw) => {
    expect(parsePackageShorthand(raw).valid).toBe(false);
  });
});

test('manual rows map to the stable legacy fields', () => {
  expect(coneRowsToLegacy([
    { qty: '10', type: 'small' },
    { qty: '4', type: 'large' },
  ])).toEqual({ valid: true, smallCones: 10, largeCones: 4, totalCones: 14 });
});

test('a positive cone quantity requires a type and duplicate types are rejected', () => {
  expect(coneRowsToLegacy([{ qty: '23', type: '' }])).toEqual(expect.objectContaining({ valid: false }));
  expect(coneRowsToLegacy([
    { qty: '2', type: 'small' },
    { qty: '3', type: 'small' },
  ])).toEqual(expect.objectContaining({ valid: false }));
});

describe('configured full-package conversion', () => {
  test.each([
    [5, 23, 24, false, 5, 23],
    [5, 24, 24, true, 6, 0],
    [5, 25, 24, true, 6, 1],
    [5, 39, 40, false, 5, 39],
    [5, 40, 40, true, 6, 0],
    [5, 41, 40, true, 6, 1],
    [5, 12, 12, true, 6, 0],
  ])('%s + %s at %s/package', (packageQty, coneQty, conesPerPackage, needsConversion, nextPackages, remainder) => {
    expect(fullPackageConversion({ packageQty, coneQty, conesPerPackage })).toEqual(
      expect.objectContaining({ needsConversion, packageQty: nextPackages, coneQty: remainder })
    );
  });
});

describe('existing packing hydration', () => {
  test.each([
    [{ smallCones: 10, largeCones: 0 }, [{ qty: '10', type: 'small' }]],
    [{ smallCones: 0, largeCones: 8 }, [{ qty: '8', type: 'large' }]],
    [{ smallCones: 10, largeCones: 8 }, [{ qty: '10', type: 'small' }, { qty: '8', type: 'large' }]],
    [{ smallCones: 0, largeCones: 0 }, [{ qty: '', type: '' }]],
  ])('hydrates legacy values %#', (source, expected) => {
    expect(hydrateConeRows(source)).toEqual(expected);
  });
});

test('save validation uses configured thresholds and whole-number rules', () => {
  expect(validateYarnPackingLine({
    packageQty: '5',
    coneRows: [{ qty: '23', type: '' }],
    smallConesPerPackage: 40,
    largeConesPerPackage: 24,
  })).toEqual(expect.objectContaining({ valid: false }));
  expect(validateYarnPackingLine({
    packageQty: '5.2',
    coneRows: [{ qty: '', type: '' }],
  })).toEqual(expect.objectContaining({ valid: false }));
});

describe('autoYarnWeight regression', () => {
  const base = {
    packageWeight: 100,
    smallConesPerPackage: 40,
    largeConesPerPackage: 20,
  };
  test.each([
    [{ packageQty: 5 }, '500'],
    [{ packageQty: 5, smallCones: 20 }, '550'],
    [{ packageQty: 5, largeCones: 10 }, '550'],
    [{ packageQty: 5, smallCones: 20, largeCones: 10 }, '600'],
  ])('preserves weight formula %#', (packing, lbs) => {
    expect(autoYarnWeight({ ...base, ...packing }).lbs).toBe(lbs);
  });
});
