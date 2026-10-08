const wholeNumberPattern = /^\d+$/;

const digitsToInteger = (digits = '') =>
  String(digits).split('').reduce((value, digit) => value * 10 + digit.charCodeAt(0) - 48, 0);

export const parsePackageShorthand = (rawValue = '') => {
  const raw = String(rawValue);
  if (raw !== '' && !/^\d+(?:\.\d*)?$/.test(raw)) return { valid: false, raw };

  const [packageDigits = '', coneDigits = ''] = raw.split('.');
  return {
    valid: true,
    raw,
    packages: packageDigits ? digitsToInteger(packageDigits) : 0,
    cones: coneDigits ? digitsToInteger(coneDigits) : 0,
    hasDot: raw.includes('.'),
    hasConeSuffix: raw.includes('.') && coneDigits.length > 0,
  };
};

export const hydrateConeRows = (source = {}) => {
  if (Array.isArray(source.coneRows) && source.coneRows.length) {
    return source.coneRows.slice(0, 2).map((row) => ({
      qty: row?.qty === undefined || row?.qty === null ? '' : String(row.qty),
      type: row?.type === 'small' || row?.type === 'large' ? row.type : '',
    }));
  }

  const rows = [];
  if (Number(source.smallCones || 0) > 0) rows.push({ qty: String(source.smallCones), type: 'small' });
  if (Number(source.largeCones || 0) > 0) rows.push({ qty: String(source.largeCones), type: 'large' });
  return rows.length ? rows : [{ qty: '', type: '' }];
};

export const coneRowsToLegacy = (rows = []) => {
  let smallCones = 0;
  let largeCones = 0;
  const seen = new Set();

  for (const row of rows) {
    const rawQty = String(row?.qty ?? '').trim();
    if (rawQty && !wholeNumberPattern.test(rawQty)) {
      return { valid: false, message: 'Cone Qty must be a non-negative whole number.' };
    }
    const qty = rawQty ? digitsToInteger(rawQty) : 0;
    const type = row?.type || '';
    if (qty > 0 && !type) {
      return { valid: false, message: `Please select Small or Large for ${qty} cones.` };
    }
    if (type && seen.has(type)) {
      return { valid: false, message: `${type === 'small' ? 'Small' : 'Large'} can only be selected once.` };
    }
    if (type) seen.add(type);
    if (type === 'small') smallCones += qty;
    if (type === 'large') largeCones += qty;
  }

  return {
    valid: true,
    smallCones,
    largeCones,
    totalCones: smallCones + largeCones,
  };
};

export const fullPackageConversion = ({ packageQty, coneQty, conesPerPackage }) => {
  const packages = Number(packageQty || 0);
  const cones = Number(coneQty || 0);
  const perPackage = Number(conesPerPackage || 0);
  if (!Number.isInteger(packages) || packages < 0 || !Number.isInteger(cones) || cones < 0) {
    return { valid: false };
  }
  if (!(perPackage > 0) || cones < perPackage) {
    return { valid: true, needsConversion: false, packageQty: packages, coneQty: cones };
  }
  const extraPackages = Math.floor(cones / perPackage);
  return {
    valid: true,
    needsConversion: true,
    extraPackages,
    packageQty: packages + extraPackages,
    coneQty: cones % perPackage,
  };
};

export const hydrateYarnPackingLine = (source = {}) => {
  const coneRows = hydrateConeRows(source);
  const mapped = coneRowsToLegacy(coneRows);
  return {
    ...source,
    packageQtyInput:
      source.packageQtyInput === undefined || source.packageQtyInput === null
        ? String(source.packageQty ?? '')
        : String(source.packageQtyInput),
    coneRows,
    ...(mapped.valid
      ? {
          smallCones: mapped.smallCones,
          largeCones: mapped.largeCones,
          totalCones: mapped.totalCones,
        }
      : {}),
  };
};

export const validateYarnPackingLine = (source = {}) => {
  const rawPackages = String(source.packageQty ?? '').trim();
  if (rawPackages && !wholeNumberPattern.test(rawPackages)) {
    return { valid: false, message: 'Package Quantity must be a non-negative whole number.' };
  }
  const packageQty = rawPackages ? digitsToInteger(rawPackages) : 0;
  const rows = hydrateConeRows(source);
  const mapped = coneRowsToLegacy(rows);
  if (!mapped.valid) return mapped;
  if (mapped.smallCones > 0 && !(Number(source.smallConesPerPackage) > 0)) {
    return { valid: false, message: 'Small cones per package are not configured for this Yarn.' };
  }
  if (mapped.largeCones > 0 && !(Number(source.largeConesPerPackage) > 0)) {
    return { valid: false, message: 'Large cones per package are not configured for this Yarn.' };
  }
  return { valid: true, packageQty, rows, ...mapped };
};

export const stripYarnPackingUiState = (source = {}) => {
  const { coneRows, packageQtyInput, ...stable } = source;
  return stable;
};
