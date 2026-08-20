// src/utils/inventoryCache.js

const PRODUCTS_CACHE_KEY = 'products';
const INVENTORY_VERSION_KEY = 'inventory_version';

export const getCachedProducts = () => {
  try {
    const raw = sessionStorage.getItem(PRODUCTS_CACHE_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);

    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Inventory cache read failed:', error);

    return [];
  }
};

export const setCachedProducts = (products = []) => {
  try {
    const safeProducts = Array.isArray(products) ? products : [];

    sessionStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify(safeProducts));

    return true;
  } catch (error) {
    console.error('Inventory cache save failed:', error);

    return false;
  }
};

export const hasInventoryCache = () => {
  try {
    const raw = sessionStorage.getItem(PRODUCTS_CACHE_KEY);

    if (!raw) {
      return false;
    }

    const parsed = JSON.parse(raw);

    return Array.isArray(parsed);
  } catch (error) {
    console.error('Inventory cache check failed:', error);

    return false;
  }
};

export const setInventoryVersion = (version) => {
  try {
    if (version === null || version === undefined || version === '') {
      sessionStorage.removeItem(INVENTORY_VERSION_KEY);

      return false;
    }

    sessionStorage.setItem(INVENTORY_VERSION_KEY, String(version));

    return true;
  } catch (error) {
    console.error('Inventory version save failed:', error);

    return false;
  }
};

export const getInventoryVersion = () => {
  try {
    return sessionStorage.getItem(INVENTORY_VERSION_KEY);
  } catch (error) {
    console.error('Inventory version read failed:', error);

    return null;
  }
};

export const isInventoryVersionChanged = (serverVersion) => {
  if (serverVersion === null || serverVersion === undefined || serverVersion === '') {
    return false;
  }

  const cachedVersion = getInventoryVersion();

  if (!cachedVersion) {
    return true;
  }

  return String(cachedVersion) !== String(serverVersion);
};

export const clearInventoryCache = () => {
  try {
    sessionStorage.removeItem(PRODUCTS_CACHE_KEY);
    sessionStorage.removeItem(INVENTORY_VERSION_KEY);

    return true;
  } catch (error) {
    console.error('Inventory cache clear failed:', error);

    return false;
  }
};

export const updateCachedProduct = (updatedProduct) => {
  if (!updatedProduct?._id) {
    return false;
  }

  const products = getCachedProducts();

  const index = products.findIndex(
    (product) => String(product?._id) === String(updatedProduct._id)
  );

  if (index === -1) {
    return false;
  }

  products[index] = {
    ...products[index],
    ...updatedProduct,
  };

  return setCachedProducts(products);
};

export const addCachedProduct = (newProduct) => {
  if (!newProduct?._id) {
    return false;
  }

  const products = getCachedProducts();

  const alreadyExists = products.some((product) => String(product?._id) === String(newProduct._id));

  if (alreadyExists) {
    return updateCachedProduct(newProduct);
  }

  return setCachedProducts([...products, newProduct]);
};

export const removeCachedProduct = (productId) => {
  if (!productId) {
    return false;
  }

  const products = getCachedProducts();

  const nextProducts = products.filter((product) => String(product?._id) !== String(productId));

  return setCachedProducts(nextProducts);
};
