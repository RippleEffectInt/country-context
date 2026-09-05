import fs from 'node:fs/promises';

const countries=[['KEN','Kenya'],['UGA','Uganda'],['RWA','Rwanda'],['BDI','Burundi'],['ETH','Ethiopia'],['ZMB','Zambia']];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const num=v=>{const n=Number(String(v??'').replace(/,/g,''));return Number.isFinite(n)?n:null};
const low=v=>String(v??'').trim().toLowerCase();
const norm=v=>low(v).replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
const date=v=>Date.parse(v||'')||0;

async function get(url,text=false){
  for(let i=0;i<4;i++){
    const r=await fetch(url,{headers:{'User-Agent':'Ripple-Effect-Country-Context/1.6','Accept':text?'text/csv,text/plain,*/*':'application/json'}});
    if(r.ok)return text?r.text():r.json();
    if((r.status===429||r.status>=500)&&i<3){await sleep(1000*(i+1));continue}
    throw new Error(`${r.status} ${r.statusText}`);
  }
}

function parseCsv(s){
  const out=[];let row=[],field='',q=false;
  for(let i=0;i<s.length;i++){
    const c=s[i],n=s[i+1];
    if(q){if(c==='"'&&n==='"'){field+='"';i++}else if(c==='"')q=false;else field+=c}
    else if(c==='"')q=true;
    else if(c===','){row.push(field);field=''}
    else if(c==='\n'){row.push(field.replace(/\r$/,''));out.push(row);row=[];field=''}
    else field+=c;
  }
  if(field||row.length){row.push(field.replace(/\r$/,''));out.push(row)}
  if(out.length<2)return[];
  const h=out[0].map(norm);
  return out.slice(1).filter(r=>r.some(x=>String(x).trim())).map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]??''])));
}

function first(o,names){for(const n of names)if(o[n]!==undefined&&String(o[n]).trim()!=='')return o[n];return null}
function anomaly(row){return num(first(row,['rainfall_anomaly_pct','rainfall_anomaly_percent','anomaly_pct','anomaly_percent','rfh_avg','rainfall_anomaly']))}
function pixels(row){return num(first(row,['number_pixels','pixel_count','pixels','n_pixels']))}
function endDate(row){return first(row,['reference_period_end','date','period_end','end_date','year_month','dekad'])}
function startDate(row){return first(row,['reference_period_start','period_start','start_date'])}
function admin1Name(row){return first(row,['admin1_name','adm1_name','admin_1_name','adm1','admin1','name_1','province','region'])}
function admin1Code(row){return first(row,['admin1_code','adm1_code','admin_1_code','pcode','admin1_pcode'])}
function adminLevel(row){return num(first(row,['admin_level','adm_level','adminlevel']))}
function version(row){return low(first(row,['version','data_version','status']))}
function aggregation(row){return low(first(row,['aggregation_period','aggregation','period_type','time_period']))}

function latestRows(rows){
  if(!rows.length)return[];
  const dated=rows.map(r=>({r,t:date(endDate(r)||startDate(r))}));
  const max=Math.max(...dated.map(x=>x.t));
  return max>0?dated.filter(x=>x.t===max).map(x=>x.r):rows;
}

function choosePeriod(rows){
  let r=rows.filter(x=>anomaly(x)!=null&&!version(x).includes('forecast'));
  if(!r.length)return[];
  const month=r.filter(x=>aggregation(x).includes('month'));
  if(month.length)r=month;
  return latestRows(r);
}

async function findDataset(country){
  const queries=[`CHIRPS ${country}`,`rainfall ${country} WFP`,`${country} rainfall indicators`];
  for(const q of queries){
    const u='https://data.humdata.org/api/3/action/package_search?rows=20&q='+encodeURIComponent(q);
    const p=await get(u),rs=p?.result?.results||[];
    const ranked=rs.map(x=>{
      const text=low([x.title,x.name,x.notes,x.organization?.title,x.organization?.name].join(' '));
      let score=0;if(text.includes('chirps'))score+=8;if(text.includes('rainfall'))score+=5;if(text.includes('world food')||text.includes('wfp'))score+=4;if(text.includes(low(country)))score+=3;
      return{x,score};
    }).sort((a,b)=>b.score-a.score);
    for(const {x,score} of ranked){
      if(score<7)continue;
      const res=(x.resources||[]).filter(r=>low(r.format)==='csv'||low(r.url).includes('.csv'));
      const rr=res.sort((a,b)=>{
        const sa=(low(a.name+' '+a.description).includes('rain')?3:0)+(low(a.name+' '+a.description).includes('chirps')?3:0);
        const sb=(low(b.name+' '+b.description).includes('rain')?3:0)+(low(b.name+' '+b.description).includes('chirps')?3:0);
        return sb-sa;
      })[0];
      if(rr?.url)return{dataset:x,resource:rr};
    }
  }
  return null;
}

async function rainfallCountry(code,name){
  const found=await findDataset(name);
  if(!found)throw new Error(`No WFP/HDX CHIRPS CSV discovered for ${name}`);
  const csv=await get(found.resource.url,true),rows=parseCsv(csv);
  if(!rows.length)throw new Error(`Empty/unreadable CSV for ${name}`);
  console.log(`CHIRPS ${code}: dataset=${found.dataset.title}; resource=${found.resource.name||found.resource.url}; columns=${Object.keys(rows[0]).join(',')}`);
  let r=choosePeriod(rows);
  if(!r.length)throw new Error(`No rainfall anomaly rows recognised for ${name}`);
  let adm1=r.filter(x=>adminLevel(x)===1||admin1Name(x)||admin1Code(x));
  if(!adm1.length)adm1=r;
  const grouped=new Map();
  for(const x of adm1){
    const v=anomaly(x);if(v==null)continue;
    const key=admin1Code(x)||admin1Name(x)||'national';
    const g=grouped.get(key)||{name:admin1Name(x)||admin1Code(x)||name,code:admin1Code(x)||null,sw:0,w:0,s:0,n:0};
    const px=pixels(x);g.s+=v;g.n++;if(px>0){g.sw+=v*px;g.w+=px}grouped.set(key,g);
  }
  const areas=[...grouped.values()].map(g=>({name:g.name,code:g.code,anomalyPct:g.w?g.sw/g.w:g.s/g.n})).filter(x=>x.anomalyPct!=null).sort((a,b)=>a.anomalyPct-b.anomalyPct);
  if(!areas.length)throw new Error(`No usable anomaly values for ${name}`);
  let sw=0,w=0,s=0,n=0;
  for(const x of adm1){const v=anomaly(x),px=pixels(x);if(v==null)continue;s+=v;n++;if(px>0){sw+=v*px;w+=px}}
  const national= w?sw/w:s/n;
  const first=r[0];
  return{national:{anomalyPct:national,referencePeriodStart:startDate(first)||null,referencePeriodEnd:endDate(first)||null,aggregationPeriod:first(first,['aggregation_period','aggregation','period_type','time_period'])||null,adminUnits:areas.length,source:'WFP CHIRPS via HDX'},areas,datasetUrl:`https://data.humdata.org/dataset/${found.dataset.name}`,resourceUrl:found.resource.url};
}

const data=JSON.parse(await fs.readFile('data/public-data.json','utf8'));
let successes=0,lastSource=null;
for(const[code,name]of countries){
  try{
    const r=await rainfallCountry(code,name);successes++;lastSource=r;
    data.countries[code]={...(data.countries[code]||{}),rainfall:r.national};
    if(code==='ETH'||code==='ZMB'){
      const old=data.countries[code].subnational||{};
      data.countries[code].subnational={...old,rainfall:r.areas};
    }
    console.log(`Direct CHIRPS ${code}: ${r.national.anomalyPct.toFixed(1)}%, ${r.areas.length} Admin-1 areas`);
  }catch(e){console.warn(`Direct CHIRPS ${code} preserved previous value: ${e.message}`)}
  await sleep(500);
}
if(successes){data.sources['WFP CHIRPS via HDX']={status:'ok',updatedAt:new Date().toISOString(),note:'Pre-computed CHIRPS rainfall metrics published by WFP on HDX; direct CSV access.',datasetUrl:lastSource?.datasetUrl||null};}
else data.sources['WFP CHIRPS via HDX']={...(data.sources['WFP CHIRPS via HDX']||{}),status:'stale',lastAttempt:new Date().toISOString(),error:'No direct CHIRPS country refresh succeeded; previous values preserved.'};
const json=JSON.stringify(data,null,2);await fs.writeFile('data/public-data.json',json);await fs.writeFile('data/public-data.js',`window.PUBLIC_COUNTRY_DATA = ${json};\n`);
