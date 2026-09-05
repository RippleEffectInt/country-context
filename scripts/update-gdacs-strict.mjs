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

const res = await fetch(SOURCE, { headers: { Accept: 'application/geo+json,application/json' } });
if (!res.ok) throw new Error(`GDACS ${res.status} ${res.statusText}`);
const payload = await res.json();
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

const path = 'data/public-data.json';
const data = JSON.parse(await fs.readFile(path, 'utf8'));
data.countries ||= {};
for (const country of COUNTRIES) {
  data.countries[country.code] ||= {};
  data.countries[country.code].gdacs = byCountry[country.code]
    .sort((a, b) => Date.parse(b.date || 0) - Date.parse(a.date || 0));
}
data.global ||= {};
data.global.gdacs = { eventCount: features.length };
data.sources ||= {};
data.sources.GDACS = {
  status: 'ok',
  updatedAt: new Date().toISOString(),
  note: 'Current disaster alerts matched using GDACS country/ISO fields'
};

await fs.writeFile(path, JSON.stringify(data, null, 2));
console.log('GDACS strict country matching complete:', Object.fromEntries(COUNTRIES.map(c => [c.code, byCountry[c.code].length])));
