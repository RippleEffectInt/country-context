import fs from 'node:fs/promises';

const countries = [['KEN','Kenya'],['UGA','Uganda'],['RWA','Rwanda'],['BDI','Burundi'],['ETH','Ethiopia'],['ZMB','Zambia']];
const HAPI = 'https://hapi.humdata.org/api/v2';
const app = process.env.HAPI_APP_IDENTIFIER || '';
const num = v => Number.isFinite(Number(v)) ? Number(v) : null;
const low = v => String(v ?? '').trim().toLowerCase();
const stamp = v => Date.parse(v || '') || 0;
const rows = p => Array.isArray(p) ? p : (p?.data || p?.items || p?.results || []);

async function get(url) {
  const r = await fetch(url, {headers:{'User-Agent':'Ripple-Effect-Country-Context/1.3','Accept':'application/json'}});
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

async function hapi(endpoint, code, extra={}) {
  const q = new URLSearchParams({output_format:'json', location_code:code, limit:'10000', offset:'0', app_identifier:app, ...extra});
  return rows(await get(`${HAPI}/${endpoint}?${q}`));
}

function periodRank(v) {
  const s = low(v).replace(/[_-]+/g,' ');
  if (s.includes('one month') || s === 'month' || s === 'monthly') return 3;
  if (s.includes('three month')) return 2;
  if (s.includes('dekad')) return 1;
  return 0;
}

async function adminNames(code) {
  try {
    const a = await hapi('metadata/admin1', code);
    return new Map(a.flatMap(x => {
      const name = x.name || x.admin1_name;
      return [[x.code,name],[x.admin1_code,name],[x.provider_admin1_code,name]].filter(([k,v]) => k && v);
    }));
  } catch { return new Map(); }
}

async function rainfallFor(code) {
  const all = await hapi('climate/hazards-rainfall', code);
  const usable = all.filter(x => num(x.rainfall_anomaly_pct) != null && !low(x.version).includes('forecast'));
  if (!usable.length) return {national:null, admin1:[], note:'No observed rainfall anomaly records returned'};

  const bestRank = Math.max(...usable.map(x => periodRank(x.aggregation_period)));
  let selected = bestRank > 0 ? usable.filter(x => periodRank(x.aggregation_period) === bestRank) : usable;
  const latestEnd = Math.max(...selected.map(x => stamp(x.reference_period_end || x.reference_period_start)));
  selected = selected.filter(x => stamp(x.reference_period_end || x.reference_period_start) === latestEnd);

  const nameMap = await adminNames(code);
  let weightedSum = 0, weight = 0, sum = 0, count = 0;
  const admin1 = [];
  for (const x of selected) {
    const anomaly = num(x.rainfall_anomaly_pct);
    if (anomaly == null) continue;
    const px = num(x.number_pixels);
    sum += anomaly; count += 1;
    if (px > 0) { weightedSum += anomaly * px; weight += px; }
    const rawCode = x.admin1_code || x.provider_admin1_code || '';
    const name = x.admin1_name || nameMap.get(rawCode) || rawCode || x.location_name || 'Admin-1 area';
    admin1.push({name, code:rawCode || null, anomalyPct:anomaly, numberPixels:px});
  }
  admin1.sort((a,b) => a.anomalyPct - b.anomalyPct);
  const anomalyPct = weight ? weightedSum / weight : (count ? sum / count : null);
  const first = selected[0] || {};
  return {
    national: anomalyPct == null ? null : {
      anomalyPct,
      referencePeriodStart:first.reference_period_start || null,
      referencePeriodEnd:first.reference_period_end || null,
      aggregationPeriod:first.aggregation_period || null,
      adminUnits:admin1.length
    },
    admin1
  };
}

if (!app) throw new Error('HAPI_APP_IDENTIFIER not configured');
const data = JSON.parse(await fs.readFile('data/public-data.json','utf8'));
for (const [code] of countries) {
  try {
    const r = await rainfallFor(code);
    data.countries[code] = {...(data.countries[code] || {}), rainfall:r.national};
    if (code === 'ETH' || code === 'ZMB') {
      data.countries[code].subnational = {...(data.countries[code].subnational || {}), rainfall:r.admin1};
    }
    console.log(`CHIRPS ${code}:`, r.national ? `${r.national.anomalyPct.toFixed(1)}%, ${r.admin1.length} admin areas` : r.note);
  } catch (e) {
    console.warn(`CHIRPS ${code} failed:`, e.message);
  }
}
data.sources['HDX HAPI · CHIRPS'] = {...(data.sources['HDX HAPI · CHIRPS'] || {}), status:'ok', updatedAt:new Date().toISOString()};
const json = JSON.stringify(data,null,2);
await fs.writeFile('data/public-data.json',json);
await fs.writeFile('data/public-data.js',`window.PUBLIC_COUNTRY_DATA = ${json};\n`);
