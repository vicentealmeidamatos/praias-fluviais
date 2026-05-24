async function getUserLocation() {
  // Capacitor nativo quando dentro da app
  if (window.isApp && window.isApp() && window.Capacitor?.Plugins?.Geolocation) {
    const Geolocation = window.Capacitor.Plugins.Geolocation;
    try {
      const perm = await Geolocation.requestPermissions({ permissions: ['location'] });
      if (perm.location === 'denied') {
        throw new Error('Permissão de localização negada. Ative nas definições da app.');
      }
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true, timeout: 10000, maximumAge: 300000,
      });
      return { lat: pos.coords.latitude, lng: pos.coords.longitude };
    } catch (err) {
      throw new Error(err.message || 'Erro de geolocalização.');
    }
  }

  // Web fallback
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocalização não suportada pelo seu browser.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        const messages = {
          1: 'Permissão de localização negada. Ative nas definições do browser.',
          2: 'Não foi possível determinar a sua localização.',
          3: 'Tempo esgotado ao obter localização.',
        };
        reject(new Error(messages[err.code] || 'Erro de geolocalização.'));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
    );
  });
}

function sortByDistance(items, userLat, userLng) {
  return items
    .map(item => ({
      ...item,
      _distance: haversineDistance(userLat, userLng, item.coordinates.lat, item.coordinates.lng)
    }))
    .sort((a, b) => a._distance - b._distance);
}
