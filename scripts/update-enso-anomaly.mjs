import fs from 'node:fs/promises';

const DATA_FILE='data/public-data.json';
const SOURCE='https://psl.noaa.gov/data/correlation/nina34.anom.data';
const num=v=>Number.isFinite(Number(v))?Number(v):null;

const r=await fetch(SOURCE,{headers:{'User-Agent':'Ripple-Effect-Country-Context/1.0','Accept':'text/plain'}});
if(!r.ok)throw new Error(`NOAA Niño 3.4 anomaly ${r.status} ${r.statusText}`);
const text=await r.text();
const series=[];
for(const line of text.split(/\r?\n/)){
  const p=line.trim().split(/\s+/);
  if(!/^\d{4}$/.test(p[0])||p.length<13)continue;
  for(let month=1;month<=12;month++){
    const value=num(p[month]);
    if(value!=null&&value>-90)series.push({year:Number(p[0]),month,value});
  }
}
if(!series.length)throw new Error('NOAA Niño 3.4 anomaly file contained no usable values');
const latest=series.at(-1),previous=series.at(-2);
const absNow=Math.abs(latest.value),absPrev=previous?Math.abs(previous.value):null;
const trend=!previous?'No trend available':absNow>absPrev+0.05?'Strengthening':absNow<absPrev-0.05?'Weakening':'Little change';
const signal=latest.value>=0.5?'Warm / El Niño signal':latest.value<=-0.5?'Cool / La Niña signal':'Neutral signal';
const data=JSON.parse(await fs.readFile(DATA_FILE,'utf8'));
data.global=data.global||{};
data.global.enso={latest,previous,signal,trend,series:series.slice(-36),metric:'Niño 3.4 SST anomaly',units:'°C',source:'NOAA PSL / CPC',sourceUrl:SOURCE};
data.sources=data.sources||{};
data.sources['NOAA Niño 3.4']={status:'ok',updatedAt:new Date().toISOString(),note:'Monthly Niño 3.4 sea-surface-temperature anomaly (not absolute SST)'};
await fs.writeFile(DATA_FILE,JSON.stringify(data,null,2));
console.log(`NOAA Niño 3.4 anomaly updated: ${latest.year}-${String(latest.month).padStart(2,'0')} ${latest.value>=0?'+':''}${latest.value.toFixed(2)}°C`);
