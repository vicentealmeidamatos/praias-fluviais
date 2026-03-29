// ─── Open-Meteo Weather Integration ───
const WMO_CODES = {
  0: { desc: 'Céu limpo', icon: 'sun' },
  1: { desc: 'Céu limpo', icon: 'sun' },
  2: { desc: 'Parcialmente nublado', icon: 'cloud-sun' },
  3: { desc: 'Nublado', icon: 'cloud' },
  45: { desc: 'Nevoeiro', icon: 'cloud-fog' },
  48: { desc: 'Nevoeiro gelado', icon: 'cloud-fog' },
  51: { desc: 'Chuvisco ligeiro', icon: 'cloud-drizzle' },
  53: { desc: 'Chuvisco', icon: 'cloud-drizzle' },
  55: { desc: 'Chuvisco forte', icon: 'cloud-drizzle' },
  61: { desc: 'Chuva ligeira', icon: 'cloud-rain' },
  63: { desc: 'Chuva', icon: 'cloud-rain' },
  65: { desc: 'Chuva forte', icon: 'cloud-rain' },
  71: { desc: 'Neve ligeira', icon: 'snowflake' },
  73: { desc: 'Neve', icon: 'snowflake' },
  75: { desc: 'Neve forte', icon: 'snowflake' },
  80: { desc: 'Aguaceiros ligeiros', icon: 'cloud-rain-wind' },
  81: { desc: 'Aguaceiros', icon: 'cloud-rain-wind' },
  82: { desc: 'Aguaceiros fortes', icon: 'cloud-rain-wind' },
  95: { desc: 'Trovoada', icon: 'cloud-lightning' },
  96: { desc: 'Trovoada com granizo', icon: 'cloud-lightning' },
  99: { desc: 'Trovoada forte', icon: 'cloud-lightning' },
};

async function fetchWeather(lat, lng) {
  const cacheKey = `weather_${lat}_${lng}`;
  const cached = sessionStorage.getItem(cacheKey);
  if (cached) {
    const { data, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp < 30 * 60 * 1000) return data;
  }

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,uv_index&timezone=Europe/Lisbon`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Weather API error');
    const json = await res.json();
    const current = json.current;
    const wmo = WMO_CODES[current.weather_code] || { desc: 'Desconhecido', icon: 'cloud' };

    const data = {
      temperature: Math.round(current.temperature_2m),
      humidity: current.relative_humidity_2m,
      windSpeed: Math.round(current.wind_speed_10m),
      uvIndex: current.uv_index,
      description: wmo.desc,
      icon: wmo.icon,
    };

    sessionStorage.setItem(cacheKey, JSON.stringify({ data, timestamp: Date.now() }));
    return data;
  } catch {
    return null;
  }
}

function renderWeatherWidget(container, weather) {
  if (!weather) {
    container.innerHTML = `<p class="text-praia-sand-500 text-sm">Dados meteorológicos indisponíveis.</p>`;
    return;
  }
  container.innerHTML = `
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
      <div class="bg-white rounded-xl p-4 shadow-layered text-center">
        <i data-lucide="${weather.icon}" class="w-8 h-8 mx-auto text-praia-yellow-600 mb-2"></i>
        <div class="font-display text-2xl font-bold text-praia-teal-800">${weather.temperature}°C</div>
        <div class="text-xs text-praia-sand-500 mt-1">${weather.description}</div>
      </div>
      <div class="bg-white rounded-xl p-4 shadow-layered text-center">
        <i data-lucide="droplets" class="w-8 h-8 mx-auto text-praia-blue-500 mb-2"></i>
        <div class="font-display text-2xl font-bold text-praia-teal-800">${weather.humidity}%</div>
        <div class="text-xs text-praia-sand-500 mt-1">Humidade</div>
      </div>
      <div class="bg-white rounded-xl p-4 shadow-layered text-center">
        <i data-lucide="wind" class="w-8 h-8 mx-auto text-praia-teal-500 mb-2"></i>
        <div class="font-display text-2xl font-bold text-praia-teal-800">${weather.windSpeed} km/h</div>
        <div class="text-xs text-praia-sand-500 mt-1">Vento</div>
      </div>
      <div class="bg-white rounded-xl p-4 shadow-layered text-center">
        <i data-lucide="sun" class="w-8 h-8 mx-auto text-praia-yellow-500 mb-2"></i>
        <div class="font-display text-2xl font-bold text-praia-teal-800">${weather.uvIndex}</div>
        <div class="text-xs text-praia-sand-500 mt-1">Índice UV</div>
      </div>
    </div>
  `;
  if (typeof lucide !== 'undefined') lucide.createIcons();
}
