import fs from 'node:fs/promises';

const COUNTRIES = [
  { code: 'KEN', name: 'Kenya' },
  { code: 'UGA', name: 'Uganda' },
  { code: 'RWA', name: 'Rwanda' },
  { code: 'BDI', name: 'Burundi' },
  { code: 'ETH', name: 'Ethiopia' },
  { code: 'ZMB', name: 'Zambia' }
];

const SOURCE = 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/EVENTS4APP';
const norm = v => String(v ?? '').trim().toLowerCase();
const splitValues = v => String(v ?? '').split(/[;,|]/).map(x => x.trim()).filter(Boolean);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function affectedCountryMatches(p, country) {
  const isoValues = Array.isArray(p.iso3) ? p.iso3 : splitValues(p.iso3);
  if (isoValues.some(v => norm(v) === norm(country.code))) return true;

  const countryValues = Array.isArray(p.country) ? p.country : splitValues(p.country);
  if (countryValues.some(v => norm(v) === norm(country.name) || norm(v) === norm(country.code))) return true;

  const affected = Array.isArray(p.affectedcountries) ? p.affectedcountries : [];
  if (affected.some(v => norm(v?.iso3) === norm(country.code) || norm(v?.countryname) === norm(country.name) || norm(v?.country) === norm(country.name))) return true;

  return false;
}

function eventUrl(p) {
  const eventId = p.eventid ?? p.eventId;
  const episodeId = p.episodeid ?? p.episodeId ?? 1;
  const eventType = p.eventtype ?? p.eventType;
  if (eventId != null && eventType) {
    return `https://www.gdacs.org/report.aspx?eventid=${encodeURIComponent(eventId)}&episodeid=${encodeURIComponent(episodeId)}&eventtype=${encodeURIComponent(eventType)}`;
  }
  if (typeof p.url?.report === 'string') return p.url.report;
  if (typeof p.url === 'string') return p.url;
  return null;
}

async function fetchGdacs() {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(SOURCE, {
        headers: {
          Accept: 'application/geo+json,application/json',
          'User-Agent': 'Ripple-Effect-Country-Context/1.0'
        }
      });
      if (res.ok) return res.json();
      lastError = new Error(`GDACS ${res.status} ${res.statusText}`);
      if (attempt < 4 && (res.status === 400 || res.status === 408 || res.status === 429 || res.status >= 500)) {
        await sleep(attempt * 5000);
        continue;
      }
      throw lastError;
    } catch (error) {
      lastError = error;
      if (attempt < 4) {
        await sleep(attempt * 5000);
        continue;
      }
    }
  }
  throw lastError || new Error('GDACS request failed');
}

const path = 'data/public-data.json';
const data = JSON.parse(await fs.readFile(path, 'utf8'));
data.countries ||= {};
data.sources ||= {};

try {
  const payload = await fetchGdacs();
  const features = Array.isArray(payload?.features) ? payload.features : [];
  const byCountry = Object.fromEntries(COUNTRIES.map(c => [c.code, []]));

  for (const feature of features) {
    const p = feature?.properties ?? feature ?? {};
    for (const country of COUNTRIES) {
      if (!affectedCountryMatches(p, country)) continue;
      byCountry[country.code].push({
        type: p.eventtype ?? p.eventType ?? 'Event',
        eventId: p.eventid ?? p.eventId ?? null,
        episodeId: p.episodeid ?? p.episodeId ?? null,
        name: p.name ?? p.eventname ?? p.title ?? 'GDACS event',
        alertLevel: p.alertlevel ?? p.alertLevel ?? null,
        date: p.fromdate ?? p.fromDate ?? p.date ?? null,
        toDate: p.todate ?? p.toDate ?? null,
        url: eventUrl(p),
        country: p.country ?? null,
        iso3: p.iso3 ?? null
      });
    }
  }

  for (const country of COUNTRIES) {
    data.countries[country.code] ||= {};
    data.countries[country.code].gdacs = byCountry[country.code]
      .sort((a, b) => Date.parse(b.date || 0) - Date.parse(a.date || 0));
  }
  data.global ||= {};
  data.global.gdacs = { eventCount: features.length };
  data.sources.GDACS = {
    status: 'ok',
    updatedAt: new Date().toISOString(),
    note: 'Current disaster alerts matched using GDACS country/ISO fields'
  };
  await fs.writeFile(path, JSON.stringify(data, null, 2));
  console.log('GDACS strict country matching complete:', Object.fromEntries(COUNTRIES.map(c => [c.code, byCountry[c.code].length])));
} catch (error) {
  // GDACS can intermittently return 400/5xx responses. Preserve the last-good
  // country alert arrays rather than failing the entire country-context refresh.
  data.sources.GDACS = {
    ...(data.sources.GDACS || {}),
    status: 'stale',
    lastAttempt: new Date().toISOString(),
    error: String(error?.message || error),
    note: 'GDACS refresh failed; last-good disaster alerts retained'
  };
  await fs.writeFile(path, JSON.stringify(data, null, 2));
  console.warn('GDACS unavailable; retained last-good alert data:', error?.message || error);
}
