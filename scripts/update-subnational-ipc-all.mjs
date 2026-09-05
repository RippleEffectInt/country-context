import fs from 'node:fs/promises';

const HAPI='https://hapi.humdata.org/api/v2';
const app=process.env.HAPI_APP_IDENTIFIER||'';
const countries=['KEN','UGA','RWA','BDI','ETH','ZMB'];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const num=v=>Number.isFinite(Number(v))?Number(v):null;
const low=v=>String(v??'').trim().toLowerCase();
const phase=v=>{const m=String(v??'').match(/[1-5]/);return m?+m[0]:null};
const rows=p=>Array.isArray(p)?p:(p?.data||p?.items||p?.results||[]);
const stamp=v=>Date.parse(v||'')||0;
function latest(a){if(!a.length)return[];let m=0;for(const x of a){const t=stamp(x.reference_period_end||x.reference_period_start);if(t>m)m=t}return m?a.filter(x=>stamp(x.reference_period_end||x.reference_period_start)===m):a}

async function getJson(url){
  for(let i=0;i<5;i++){
    const r=await fetch(url,{headers:{'User-Agent':'Ripple-Effect-Country-Context/2.0','Accept':'application/json'}});
    if(r.ok)return r.json();
    if(r.status===429||r.status>=500){
      const retry=Number(r.headers.get('retry-after'));
      await sleep(Number.isFinite(retry)&&retry>0?retry*1000:2500*(i+1));
      continue;
    }
    throw new Error(`${r.status} ${r.statusText}`);
  }
  throw new Error('HAPI retry limit exceeded');
}

async function ipcRegions(code){
  const q=new URLSearchParams({output_format:'json',location_code:code,limit:'10000',offset:'0',app_identifier:app});
  let a=rows(await getJson(`${HAPI}/food-security-nutrition-poverty/food-security?${q}`));
  let z=a.filter(x=>low(x.ipc_type)==='current');
  if(!z.length)z=a;
  z=latest(z);
  const by=new Map();
  for(const x of z.filter(x=>(+x.admin_level===1||x.admin1_code)&&!x.admin2_code)){
    if((phase(x.ipc_phase)||0)<3)continue;
    const name=String(x.admin1_name||'').trim();
    const key=x.admin1_code||name;
    if(!key||!name)continue;
    const item=by.get(key)||{name,phase3Plus:0};
    item.phase3Plus+=num(x.population_in_phase)||0;
    by.set(key,item);
  }
  return [...by.values()].filter(x=>x.phase3Plus>0).sort((a,b)=>b.phase3Plus-a.phase3Plus);
}

if(!app)throw new Error('HAPI_APP_IDENTIFIER not configured');
const data=JSON.parse(await fs.readFile('data/public-data.json','utf8'));
for(const code of countries){
  try{
    const values=await ipcRegions(code);
    const current=data.countries?.[code]?.subnational||{};
    if(values.length){
      data.countries[code].subnational={...current,foodSecurity:values};
      console.log(`Regional IPC ${code}: ${values.length} named areas`);
    }else{
      data.countries[code].subnational={...current,foodSecurity:[]};
      console.log(`Regional IPC ${code}: no current named Phase 3+ areas`);
    }
  }catch(e){
    console.warn(`Regional IPC ${code} failed: ${e.message}; existing data preserved`);
  }
  await sleep(1800);
}
const json=JSON.stringify(data,null,2);
await fs.writeFile('data/public-data.json',json);
await fs.writeFile('data/public-data.js',`window.PUBLIC_COUNTRY_DATA = ${json};\n`);
