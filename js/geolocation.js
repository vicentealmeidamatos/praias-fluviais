function getUserLocation() {
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
