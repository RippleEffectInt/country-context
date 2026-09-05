import fs from 'node:fs/promises';

const DATA='data/public-data.json',HISTORY='data/history.json';
const CODES=['KEN','UGA','RWA','BDI','ETH','ZMB'];
const readJson=async(path,fallback)=>{try{return JSON.parse(await fs.readFile(path,'utf8'))}catch{return fallback}};
const data=await readJson(DATA,{countries:{},global:{}});
const history=await readJson(HISTORY,{version:1,startedAt:new Date().toISOString(),generatedAt:null,global:{enso:[]},countries:{}});
history.global=history.global||{enso:[]};history.global.enso=history.global.enso||[];history.countries=history.countries||{};

function cleanDate(v){if(!v)return null;const s=String(v);return /^\d{4}-\d{2}$/.test(s)?s:s.slice(0,10)}
function shiftMonth(ym,delta){if(!/^\d{4}-\d{2}$/.test(String(ym||'')))return null;const [y,m]=ym.split('-').map(Number),d=new Date(Date.UTC(y,m-1+delta,1));return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`}
function upsert(arr,date,value,meta={}){if(date==null||value==null||!Number.isFinite(Number(value)))return;const point={date:String(date),value:Number(value),...meta};const i=arr.findIndex(x=>x.date===point.date);if(i>=0)arr[i]=point;else arr.push(point);arr.sort((a,b)=>a.date.localeCompare(b.date));if(arr.length>120)arr.splice(0,arr.length-120)}
function ensureCountry(code){return history.countries[code]||(history.countries[code]={rainfall:[],ipc:[],conflict:[],idps:[],inform:[]})}
function addCountry(code,c){if(!c)return;const h=ensureCountry(code);upsert(h.rainfall,cleanDate(c.rainfall?.referencePeriodEnd),c.rainfall?.anomalyPct,{source:'CHIRPS'});upsert(h.ipc,cleanDate(c.foodSecurity?.referencePeriodEnd),c.foodSecurity?.phase3Plus,{source:'IPC'});upsert(h.idps,cleanDate(c.idps?.referencePeriodEnd),c.idps?.population,{source:'IOM DTM'});upsert(h.inform,cleanDate(c.inform?.referencePeriodEnd),c.inform?.overallRisk,{source:'INFORM'});if(c.conflict?.periodEnd){upsert(h.conflict,c.conflict.periodEnd,c.conflict.events3m,{source:'ACLED aggregate',window:'latest 3 months'});const prevDate=shiftMonth(c.conflict.periodEnd,-3);upsert(h.conflict,prevDate,c.conflict.previous3m,{source:'ACLED aggregate',window:'previous 3 months'})}}

for(const code of CODES){addCountry(code,data.previous?.countries?.[code]);addCountry(code,data.countries?.[code])}
for(const x of data.global?.enso?.series||[]){if(x?.year&&x?.month)upsert(history.global.enso,`${x.year}-${String(x.month).padStart(2,'0')}`,x.value,{source:'NOAA Niño 3.4 anomaly'})}
history.generatedAt=new Date().toISOString();
await fs.writeFile(HISTORY,JSON.stringify(history,null,2));
console.log('Trend history updated',Object.fromEntries(CODES.map(c=>[c,Object.fromEntries(Object.entries(ensureCountry(c)).map(([k,v])=>[k,v.length]))])));
