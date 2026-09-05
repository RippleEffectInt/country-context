import fs from 'node:fs/promises';

const HAPI='https://hapi.humdata.org/api/v2';
const app=process.env.HAPI_APP_IDENTIFIER||'';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const num=v=>Number.isFinite(Number(v))?Number(v):null;
const low=v=>String(v??'').trim().toLowerCase();
const phase=v=>{const m=String(v??'').match(/[1-5]/);return m?+m[0]:null};
const rows=p=>Array.isArray(p)?p:(p?.data||p?.items||p?.results||[]);
const stamp=v=>Date.parse(v||'')||0;
function latest(a){if(!a.length)return[];const m=Math.max(...a.map(x=>stamp(x.reference_period_end||x.reference_period_start)));return a.filter(x=>stamp(x.reference_period_end||x.reference_period_start)===m)}

async function getJson(url){
  for(let i=0;i<5;i++){
    const r=await fetch(url,{headers:{'User-Agent':'Ripple-Effect-Country-Context/1.5','Accept':'application/json'}});
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

async function ipcAdmin1(code){
  const q=new URLSearchParams({output_format:'json',location_code:code,limit:'10000',offset:'0',app_identifier:app});
  let a=rows(await getJson(`${HAPI}/food-security-nutrition-poverty/food-security?${q}`));
  let z=a.filter(x=>low(x.ipc_type)==='current');
  if(!z.length)z=a;
  z=latest(z);
  const by=new Map();
  for(const x of z.filter(x=>(+x.admin_level===1||x.admin1_code)&&!x.admin2_code)){
    if((phase(x.ipc_phase)||0)<3)continue;
    const key=x.admin1_code||x.admin1_name;
    if(!key)continue;
    const item=by.get(key)||{name:x.admin1_name||key,phase3Plus:0};
    item.phase3Plus+=num(x.population_in_phase)||0;
    by.set(key,item);
  }
  return [...by.values()].filter(x=>x.phase3Plus>0).sort((a,b)=>b.phase3Plus-a.phase3Plus);
}

if(!app)throw new Error('HAPI_APP_IDENTIFIER not configured');
const data=JSON.parse(await fs.readFile('data/public-data.json','utf8'));
for(const code of ['ETH','ZMB']){
  try{
    const values=await ipcAdmin1(code);
    if(values.length){
      const current=data.countries?.[code]?.subnational||{};
      data.countries[code].subnational={...current,foodSecurity:values};
      console.log(`Subnational IPC ${code}: ${values.length} Admin-1 areas`);
    } else {
      console.log(`Subnational IPC ${code}: no current Admin-1 Phase 3+ records; existing data preserved`);
    }
  }catch(e){
    console.warn(`Subnational IPC ${code} failed: ${e.message}; existing data preserved`);
  }
  await sleep(2500);
}
const json=JSON.stringify(data,null,2);
await fs.writeFile('data/public-data.json',json);
await fs.writeFile('data/public-data.js',`window.PUBLIC_COUNTRY_DATA = ${json};\n`);
