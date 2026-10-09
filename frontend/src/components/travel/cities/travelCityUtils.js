export const normalizeCityName = (value = '') =>
  String(value || '').trim().replace(/\s+/g, ' ');

export const getNormalizedCityKey = (value = '') => normalizeCityName(value).toLocaleLowerCase();

export const buildCitySuggestions = (cities = [], hotels = []) => {
  const suggestions = new Map();

  cities.forEach((city) => {
    if (city?.isDeleted === true || city?.isActive === false) return;
    const name = normalizeCityName(city?.name);
    const key = getNormalizedCityKey(name);
    if (key) suggestions.set(key, { ...city, name });
  });

  hotels.forEach((hotel) => {
    if (hotel?.isDeleted === true || hotel?.isActive === false) return;
    const name = normalizeCityName(hotel?.city);
    const key = getNormalizedCityKey(name);
    if (key && !suggestions.has(key)) {
      suggestions.set(key, {
        _id: `legacy-city:${key}`,
        name,
        country: hotel?.country || '',
        isLegacyHotelCity: true,
      });
    }
  });

  return [...suggestions.values()].sort((a, b) => a.name.localeCompare(b.name));
};

export const filterHotelsByCity = (hotels = [], city = '') => {
  const cityKey = getNormalizedCityKey(city);
  const activeHotels = hotels.filter(
    (hotel) => hotel?.isDeleted !== true && hotel?.isActive !== false
  );
  if (!cityKey) return activeHotels;
  return activeHotels.filter((hotel) => getNormalizedCityKey(hotel?.city) === cityKey);
};

export const applyHotelSelection = (details = {}, hotel = null) => ({
  ...details,
  hotelId: hotel?._id || '',
  city: normalizeCityName(hotel?.city || details.city),
});

export const applyHotelCityChange = (details = {}, city = '', hotels = []) => {
  const nextCity = normalizeCityName(city);
  const selectedHotel = hotels.find(
    (hotel) => String(hotel?._id) === String(details.hotelId?._id || details.hotelId || '')
  );
  const hotelMatches =
    !selectedHotel || !nextCity || getNormalizedCityKey(selectedHotel.city) === getNormalizedCityKey(nextCity);

  return {
    ...details,
    city: nextCity,
    hotelId: hotelMatches ? details.hotelId || '' : '',
  };
};

export const appendHotelBookingItem = (formState = {}, createHotelItem) => ({
  ...formState,
  serviceType: 'mixed',
  bookingItems: [...(formState.bookingItems || []), createHotelItem('hotel')],
});
