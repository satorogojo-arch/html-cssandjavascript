/* ============================================================
   Weather Forecast App — Pure Vanilla JS
   Uses Open-Meteo (free, no API key required)
   ============================================================ */

"use strict";

/* ── State ── */
let unit = "celsius";   // "celsius" | "fahrenheit"
let weatherData = null; // raw API response
let currentCity = null; // { name, country, admin1, latitude, longitude }
let searchTimer = null;
let currentHourIdx = 0;

/* ── DOM refs ── */
const bgLayer        = document.getElementById("bgLayer");
const searchInput    = document.getElementById("searchInput");
const searchSpinner  = document.getElementById("searchSpinner");
const suggestions    = document.getElementById("suggestions");
const locateBtn      = document.getElementById("locateBtn");
const unitBtn        = document.getElementById("unitBtn");
const errorBanner    = document.getElementById("errorBanner");
const errorMsg       = document.getElementById("errorMsg");
const loadingState   = document.getElementById("loadingState");
const emptyState     = document.getElementById("emptyState");
const weatherContent = document.getElementById("weatherContent");

/* ── WMO code → label + emoji ── */
const WMO = {
   0: { label: "Clear Sky",               day: "☀️", night: "🌙" },
   1: { label: "Mainly Clear",            day: "🌤️", night: "🌙" },
   2: { label: "Partly Cloudy",           day: "⛅",  night: "🌥️" },
   3: { label: "Overcast",               day: "☁️",  night: "☁️" },
  45: { label: "Foggy",                  day: "🌫️", night: "🌫️" },
  48: { label: "Icy Fog",               day: "🌫️", night: "🌫️" },
  51: { label: "Light Drizzle",          day: "🌦️", night: "🌧️" },
  53: { label: "Drizzle",               day: "🌦️", night: "🌧️" },
  55: { label: "Heavy Drizzle",          day: "🌧️", night: "🌧️" },
  56: { label: "Freezing Drizzle",       day: "🌨️", night: "🌨️" },
  57: { label: "Heavy Freezing Drizzle", day: "🌨️", night: "🌨️" },
  61: { label: "Light Rain",            day: "🌦️", night: "🌧️" },
  63: { label: "Rain",                  day: "🌧️", night: "🌧️" },
  65: { label: "Heavy Rain",            day: "🌧️", night: "🌧️" },
  66: { label: "Freezing Rain",         day: "🌨️", night: "🌨️" },
  67: { label: "Heavy Freezing Rain",   day: "🌨️", night: "🌨️" },
  71: { label: "Light Snow",            day: "🌨️", night: "❄️" },
  73: { label: "Snow",                  day: "🌨️", night: "🌨️" },
  75: { label: "Heavy Snow",            day: "❄️",  night: "❄️" },
  77: { label: "Snow Grains",           day: "🌨️", night: "🌨️" },
  80: { label: "Light Showers",         day: "🌦️", night: "🌧️" },
  81: { label: "Showers",              day: "🌧️", night: "🌧️" },
  82: { label: "Heavy Showers",         day: "⛈️",  night: "⛈️" },
  85: { label: "Snow Showers",          day: "🌨️", night: "❄️" },
  86: { label: "Heavy Snow Showers",    day: "❄️",  night: "❄️" },
  95: { label: "Thunderstorm",          day: "⛈️",  night: "⛈️" },
  96: { label: "Thunderstorm + Hail",   day: "⛈️",  night: "⛈️" },
  99: { label: "Severe Thunderstorm",   day: "⛈️",  night: "⛈️" },
};

function getWeatherInfo(code, isDay = 1) {
  const w = WMO[code] ?? { label: "Unknown", day: "🌡️", night: "🌡️" };
  return { label: w.label, icon: isDay ? w.day : w.night };
}

/* ── Background theming ── */
function getBgClass(code, isDay) {
  if (!isDay) return "bg--clear-night";
  if (code <= 1) return "bg--clear-day";
  if (code <= 3) return "bg--cloudy";
  if (code <= 48) return "bg--fog";
  if (code <= 67) return "bg--rain";
  if (code <= 77) return "bg--snow";
  if (code <= 82) return "bg--rain";
  return "bg--thunder";
}

const BG_CLASSES = ["bg--clear-day","bg--clear-night","bg--cloudy","bg--fog","bg--rain","bg--snow","bg--thunder"];
function applyBg(code, isDay) {
  BG_CLASSES.forEach(c => bgLayer.classList.remove(c));
  bgLayer.classList.add(getBgClass(code, isDay));
}

/* ── Particles ── */
function spawnParticles() {
  const container = document.getElementById("bgParticles");
  container.innerHTML = "";
  const count = Math.min(14, Math.floor(window.innerWidth / 80));
  for (let i = 0; i < count; i++) {
    const el = document.createElement("div");
    el.className = "particle";
    const size = 40 + Math.random() * 120;
    el.style.cssText = `
      width: ${size}px;
      height: ${size}px;
      left: ${Math.random() * 100}%;
      animation-duration: ${10 + Math.random() * 18}s;
      animation-delay: ${-Math.random() * 20}s;
    `;
    container.appendChild(el);
  }
}

/* ── Temperature conversion ── */
function toDisplay(celsius) {
  if (unit === "fahrenheit") return Math.round(celsius * 9 / 5 + 32);
  return Math.round(celsius);
}
function unitSymbol() { return unit === "celsius" ? "°C" : "°F"; }

/* ── Formatting helpers ── */
function fmtHour(timeStr) {
  const d = new Date(timeStr);
  const h = d.getHours();
  return (h % 12 || 12) + (h >= 12 ? "PM" : "AM");
}

function fmtDate(timeStr) {
  // timeStr is "YYYY-MM-DD"
  return new Date(timeStr + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric"
  });
}

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

const UV_LABELS = ["Low","Low","Low","Moderate","Moderate","Moderate","High","High","Very High","Very High","Very High","Extreme"];
function uvLabel(v) { return UV_LABELS[Math.min(Math.round(v ?? 0), 11)] ?? "Extreme"; }

/* ── UI helpers ── */
function setEl(id, val) { document.getElementById(id).textContent = val; }

function showState(state) {
  loadingState.style.display  = state === "loading"  ? "flex"  : "none";
  emptyState.style.display    = state === "empty"    ? "flex"  : "none";
  weatherContent.style.display= state === "weather"  ? "flex"  : "none";
}

function showError(msg) {
  errorMsg.textContent = msg;
  errorBanner.style.display = "flex";
  setTimeout(() => { errorBanner.style.display = "none"; }, 6000);
}

/* ── Geocoding search ── */
async function searchCities(q) {
  if (q.length < 2) { closeSuggestions(); return; }
  searchSpinner.classList.add("active");
  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&format=json`
    );
    const data = await res.json();
    renderSuggestions(data.results ?? []);
  } catch {
    closeSuggestions();
  } finally {
    searchSpinner.classList.remove("active");
  }
}

function renderSuggestions(results) {
  if (!results.length) { closeSuggestions(); return; }
  suggestions.innerHTML = results.map((r, i) => `
    <div class="suggestion-item" data-idx="${i}">
      <span class="suggestion-name">${r.name}</span>
      <span class="suggestion-meta">${r.admin1 ? r.admin1 + ", " : ""}${r.country ?? ""}</span>
    </div>
  `).join("");

  suggestions.querySelectorAll(".suggestion-item").forEach((el, i) => {
    el.addEventListener("mousedown", (e) => {
      e.preventDefault();
      selectCity(results[i]);
    });
  });

  suggestions.classList.add("open");
}

function closeSuggestions() {
  suggestions.classList.remove("open");
  suggestions.innerHTML = "";
}

/* ── City selection & weather fetch ── */
function selectCity(city) {
  currentCity = city;
  searchInput.value = `${city.name}${city.country ? ", " + city.country : ""}`;
  closeSuggestions();
  fetchWeather(city);
}

async function fetchWeather(city) {
  showState("loading");
  errorBanner.style.display = "none";

  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude",  city.latitude);
    url.searchParams.set("longitude", city.longitude);
    url.searchParams.set("current_weather", "true");
    url.searchParams.set("hourly",
      "temperature_2m,weathercode,precipitation_probability,windspeed_10m,apparent_temperature,relative_humidity_2m"
    );
    url.searchParams.set("daily",
      "temperature_2m_max,temperature_2m_min,weathercode,precipitation_probability_max,sunrise,sunset,windspeed_10m_max,uv_index_max"
    );
    url.searchParams.set("temperature_unit", "celsius");
    url.searchParams.set("windspeed_unit", "kmh");
    url.searchParams.set("timezone", "auto");
    url.searchParams.set("forecast_days", "7");

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error("Failed to fetch weather data.");
    weatherData = await res.json();
    renderWeather();
  } catch (e) {
    showState("empty");
    showError(e.message ?? "Something went wrong. Please try again.");
  }
}

/* ── Render weather ── */
function renderWeather() {
  if (!weatherData || !currentCity) return;

  const cw      = weatherData.current_weather;
  const hourly  = weatherData.hourly;
  const daily   = weatherData.daily;
  const isDay   = cw.is_day;
  const code    = cw.weathercode;
  const info    = getWeatherInfo(code, isDay);

  /* Current hour index in the hourly array */
  const now = new Date();
  currentHourIdx = hourly.time.findIndex(t => {
    const d = new Date(t);
    return d.getDate() === now.getDate() && d.getHours() === now.getHours();
  });
  if (currentHourIdx < 0) currentHourIdx = 0;

  /* Background */
  applyBg(code, isDay);

  /* City info */
  setEl("cityName",    currentCity.name);
  setEl("cityRegion",  [currentCity.admin1, currentCity.country].filter(Boolean).join(", "));
  setEl("currentDate", now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }));

  /* Weather icon (animated) */
  const iconEl = document.getElementById("mainWeatherIcon");
  iconEl.textContent = info.icon;
  iconEl.classList.remove("pop");
  void iconEl.offsetWidth; // force reflow
  iconEl.classList.add("pop");

  /* Temperature & condition */
  setEl("currentTemp",      toDisplay(cw.temperature) + unitSymbol());
  setEl("currentCondition", info.label);

  /* Meta stats */
  const ht = hourly.apparent_temperature[currentHourIdx];
  setEl("feelsLike",  ht != null ? toDisplay(ht) + unitSymbol() : "—");
  setEl("humidity",   (hourly.relative_humidity_2m[currentHourIdx] ?? "—") + "%");
  setEl("windSpeed",  Math.round(cw.windspeed) + " km/h");
  setEl("rainChance", (hourly.precipitation_probability[currentHourIdx] ?? "—") + "%");

  /* Stats row */
  setEl("todayMin", toDisplay(daily.temperature_2m_min[0]) + unitSymbol());
  setEl("todayMax", toDisplay(daily.temperature_2m_max[0]) + unitSymbol());
  setEl("sunrise",  fmtTime(daily.sunrise[0]));
  setEl("sunset",   fmtTime(daily.sunset[0]));
  setEl("uvIndex",  Math.round(daily.uv_index_max[0] ?? 0));
  setEl("uvLabel",  uvLabel(daily.uv_index_max[0]));
  setEl("maxWind",  Math.round(daily.windspeed_10m_max[0] ?? 0));

  /* Hourly forecast */
  renderHourly();

  /* Daily forecast */
  renderDaily();

  showState("weather");
}

function renderHourly() {
  const hourly = weatherData.hourly;
  const slice  = 24;
  let html = "";

  for (let i = 0; i < slice; i++) {
    const idx   = currentHourIdx + i;
    if (idx >= hourly.time.length) break;
    const time   = hourly.time[idx];
    const code   = hourly.weathercode[idx] ?? 0;
    const temp   = hourly.temperature_2m[idx] ?? 0;
    const precip = hourly.precipitation_probability[idx] ?? 0;
    const info   = getWeatherInfo(code, i === 0 ? weatherData.current_weather.is_day : 1);
    const isNow  = i === 0;

    html += `
      <div class="hourly-item ${isNow ? "hourly-item--now" : ""}">
        <span class="hourly-item__time">${isNow ? "Now" : fmtHour(time)}</span>
        <span class="hourly-item__icon">${info.icon}</span>
        <span class="hourly-item__temp">${toDisplay(temp)}${unitSymbol()}</span>
        ${precip > 0 ? `<span class="hourly-item__rain">💧${precip}%</span>` : "<span></span>"}
      </div>`;
  }

  document.getElementById("hourlyList").innerHTML = html;
}

function renderDaily() {
  const daily = weatherData.daily;
  let html = "";

  for (let i = 0; i < daily.time.length; i++) {
    const code    = daily.weathercode[i] ?? 0;
    const info    = getWeatherInfo(code);
    const max     = daily.temperature_2m_max[i] ?? 0;
    const min     = daily.temperature_2m_min[i] ?? 0;
    const precip  = daily.precipitation_probability_max[i] ?? 0;
    const isToday = i === 0;
    const range   = Math.max(max - min, 1);
    const pct     = Math.min(100, Math.max(15, (range / 20) * 100));

    html += `
      <div class="daily-item ${isToday ? "daily-item--today" : ""}">
        <span class="daily-item__day">${isToday ? "Today" : fmtDate(daily.time[i])}</span>
        <span class="daily-item__icon">${info.icon}</span>
        <span class="daily-item__rain">${precip > 0 ? "💧" + precip + "%" : ""}</span>
        <div class="daily-item__range">
          <span class="daily-item__min">${toDisplay(min)}${unitSymbol()}</span>
          <div class="daily-item__bar-wrap">
            <div class="daily-item__bar" style="width:${pct}%"></div>
          </div>
          <span class="daily-item__max">${toDisplay(max)}${unitSymbol()}</span>
        </div>
      </div>`;
  }

  document.getElementById("dailyList").innerHTML = html;
}

/* ── Tabs ── */
document.getElementById("tabHourly").addEventListener("click", () => {
  document.getElementById("tabHourly").classList.add("tab--active");
  document.getElementById("tabDaily").classList.remove("tab--active");
  document.getElementById("panelHourly").style.display = "";
  document.getElementById("panelDaily").style.display  = "none";
});

document.getElementById("tabDaily").addEventListener("click", () => {
  document.getElementById("tabDaily").classList.add("tab--active");
  document.getElementById("tabHourly").classList.remove("tab--active");
  document.getElementById("panelDaily").style.display  = "";
  document.getElementById("panelHourly").style.display = "none";
});

/* ── Search input ── */
searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  const q = searchInput.value.trim();
  if (q.length < 2) { closeSuggestions(); return; }
  searchTimer = setTimeout(() => searchCities(q), 320);
});

searchInput.addEventListener("focus", () => {
  if (searchInput.value.trim().length >= 2) searchCities(searchInput.value.trim());
});

searchInput.addEventListener("blur", () => {
  setTimeout(closeSuggestions, 200);
});

searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeSuggestions();
});

/* ── Unit toggle ── */
unitBtn.addEventListener("click", () => {
  unit = unit === "celsius" ? "fahrenheit" : "celsius";
  unitBtn.textContent = unit === "celsius" ? "°F" : "°C";
  if (weatherData) renderWeather();
});

/* ── Geolocation ── */
locateBtn.addEventListener("click", () => {
  if (!navigator.geolocation) {
    showError("Geolocation is not supported by your browser.");
    return;
  }
  locateBtn.style.opacity = "0.5";
  locateBtn.style.pointerEvents = "none";

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude, longitude } = pos.coords;
      try {
        const res = await fetch(
          `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${latitude}&longitude=${longitude}&language=en`
        );
        const data = await res.json();
        const r = data.results?.[0];
        const city = r
          ? { name: r.name, country: r.country ?? "", country_code: r.country_code ?? "", admin1: r.admin1, latitude, longitude }
          : { name: "My Location", country: "", country_code: "", admin1: "", latitude, longitude };
        searchInput.value = `${city.name}${city.country ? ", " + city.country : ""}`;
        selectCity(city);
      } catch {
        selectCity({ name: "My Location", country: "", admin1: "", latitude, longitude });
      } finally {
        locateBtn.style.opacity = "";
        locateBtn.style.pointerEvents = "";
      }
    },
    () => {
      showError("Location permission denied. Please allow location access.");
      locateBtn.style.opacity = "";
      locateBtn.style.pointerEvents = "";
    },
    { timeout: 10000 }
  );
});

/* ── Init ── */
spawnParticles();
window.addEventListener("resize", spawnParticles);
showState("empty");

/* Auto-load a default city so the app doesn't look blank on desktop */
(function loadDefault() {
  const defaultCity = {
    name: "New York",
    country: "United States",
    admin1: "New York",
    latitude: 40.7128,
    longitude: -74.006
  };
  searchInput.value = "New York, United States";
  selectCity(defaultCity);
})();
