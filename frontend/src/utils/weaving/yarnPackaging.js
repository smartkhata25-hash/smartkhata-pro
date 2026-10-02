export const LBS_TO_KG = 0.45359237;

export const roundYarnQuantity = (value) => Math.round(Number(value || 0) * 1000) / 1000;

export const packageProfilesFor = (yarn) => {
  const profiles = Array.isArray(yarn?.packagingProfiles)
    ? yarn.packagingProfiles.filter((profile) => profile?.packageType).map((profile) => ({
        ...profile,
        packageType: String(profile.packageType).toLowerCase(),
        packageWeightUnit: profile.packageWeightUnit || yarn?.packageWeightUnit || 'LBS',
      }))
    : [];
  if (!profiles.some((profile) => profile.packageType === 'bag')) {
    profiles.unshift({
      packageType: 'bag',
      packageWeight: yarn?.defaultPackageType === 'bag' ? Number(yarn?.packageWeight || 100) : 100,
      packageWeightUnit: yarn?.packageWeightUnit || 'LBS',
      smallConesPerPackage: yarn?.defaultPackageType === 'bag' ? Number(yarn?.smallConesPerPackage || 40) : 40,
      largeConesPerPackage: yarn?.defaultPackageType === 'bag' ? Number(yarn?.largeConesPerPackage || 24) : 24,
    });
  }
  return profiles.length ? profiles : [{ packageType: 'bag', packageWeight: 100, packageWeightUnit: 'LBS', smallConesPerPackage: 40, largeConesPerPackage: 24 }];
};

export const defaultPackageProfileFor = (yarn) => {
  const profiles = packageProfilesFor(yarn);
  const defaultType = String(yarn?.defaultPackageType || 'bag').toLowerCase();
  return profiles.find((profile) => profile.packageType === defaultType) || profiles[0];
};

export const autoYarnWeight = (row) => {
  const packageWeight = Number(row.packageWeight || 0);
  const packageQty = Number(row.packageQty || 0);
  const smallCones = Number(row.smallCones || 0);
  const largeCones = Number(row.largeCones || 0);
  const smallPerPackage = Number(row.smallConesPerPackage || 0);
  const largePerPackage = Number(row.largeConesPerPackage || 0);
  if (!(packageQty > 0 || smallCones > 0 || largeCones > 0)) return { lbs: '', kg: '', sourceEntryUnit: 'LBS' };
  if (!packageWeight) return {};
  let lbs = packageQty * packageWeight;
  if (smallCones > 0 && smallPerPackage > 0) lbs += (smallCones / smallPerPackage) * packageWeight;
  if (largeCones > 0 && largePerPackage > 0) lbs += (largeCones / largePerPackage) * packageWeight;
  if (lbs <= 0) return { lbs: '', kg: '', sourceEntryUnit: 'LBS' };
  return { lbs: String(roundYarnQuantity(lbs)), kg: String(roundYarnQuantity(lbs * LBS_TO_KG)), sourceEntryUnit: 'LBS' };
};
