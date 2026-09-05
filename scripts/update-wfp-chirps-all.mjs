import fs from 'node:fs/promises';

const countries=[['KEN','Kenya'],['UGA','Uganda'],['RWA','Rwanda'],['BDI','Burundi'],['ETH','Ethiopia'],['ZMB','Zambia']];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const low=v=>String(v??'').trim().toLowerCase();
const norm=v=>low(v).replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
const stamp=v=>Date.parse(v||'')||0;
const num=v=>{const n=Number(String(v??'').replace(/,/g,''));return Number.isFinite(n)?n:null};

async function get(url,text=false){
  for(let i=0;i<4;i++){
    const r=await fetch(url,{headers:{'User-Agent':'Ripple-Effect-Country-Context/2.0','Accept':text?'text/csv,text/plain,*/*':'application/json'}});
    if(r.ok)return text?r.text():r.json();
    if((r.status===429||r.status>=500)&&i<3){await sleep(1000*(i+1));continue}
    throw Error(`${r.status} ${r.statusText}`);
  }
}

function csv(s){
  const a=[];let r=[],f='',q=false;
  for(let i=0;i<s.length;i++){
    const c=s[i],n=s[i+1];
    if(q){if(c==='"'&&n==='"'){f+='"';i++}else if(c==='"')q=false;else f+=c}
    else if(c==='"')q=true;
    else if(c===','){r.push(f);f=''}
    else if(c==='\n'){r.push(f.replace(/\r$/,''));a.push(r);r=[];f=''}
    else f+=c;
  }
  if(f||r.length){r.push(f);a.push(r)}
  if(a.length<2)return[];
  const h=a[0].map(norm);
  return a.slice(1).filter(x=>x.some(y=>String(y).trim())).map(x=>Object.fromEntries(h.map((k,i)=>[k,x[i]??''])));
}

function pick(o,ks){for(const k of ks)if(o[k]!==undefined&&String(o[k]).trim()!=='')return o[k];return null}
const anomaly=r=>num(pick(r,['r1q','rainfall_1_month_anomaly_pct','rainfall_anomaly_pct','anomaly_pct']));
const pixels=r=>num(pick(r,['n_pixels','number_pixels','pixel_count','pixels']));
const end=r=>pick(r,['date','reference_period_end','period_end','end_date','year_month','dekad']);
const regionCode=r=>pick(r,['pcode','admin1_code','adm1_code','admin_1_code']);
const regionName=r=>pick(r,['admin1_name','adm1_name','admin_1_name','adm1','admin1','name_1','province','region']);
const level=r=>num(pick(r,['adm_level','admin_level','adminlevel']));

function select(rows){
  let x=rows.filter(r=>anomaly(r)!=null&&!low(pick(r,['version','status'])).includes('forecast'));
  if(!x.length)return[];
  let mx=0;for(const r of x){const t=stamp(end(r));if(t>mx)mx=t}
  return mx>0?x.filter(r=>stamp(end(r))===mx):x;
}

async function discover(name){
  for(const q of[`CHIRPS ${name}`,`rainfall ${name} WFP`,`${name} rainfall indicators`]){
    const p=await get('https://data.humdata.org/api/3/action/package_search?rows=20&q='+encodeURIComponent(q));
    const rs=p?.result?.results||[];
    const ranked=rs.map(x=>{const t=low([x.title,x.name,x.notes,x.organization?.title,x.organization?.name].join(' '));return{x,s:(t.includes('chirps')?8:0)+(t.includes('rainfall')?5:0)+(t.includes('world food')||t.includes('wfp')?4:0)+(t.includes(low(name))?3:0)}}).sort((a,b)=>b.s-a.s);
    for(const {x,s} of ranked){
      if(s<7)continue;
      const res=(x.resources||[]).filter(r=>low(r.format)==='csv'||low(r.url).includes('.csv')).sort((a,b)=>(low(b.name+' '+b.description).includes('rain')?1:0)-(low(a.name+' '+a.description).includes('rain')?1:0));
      if(res[0]?.url)return{x,r:res[0]};
    }
  }
  return null;
}

async function country(code,name){
  const d=await discover(name);if(!d)throw Error('No WFP/HDX CHIRPS CSV found');
  const rows=csv(await get(d.r.url,true));if(!rows.length)throw Error('CSV empty');
  const chosen=select(rows);if(!chosen.length)throw Error('No recognised rainfall anomaly rows');
  let regional=chosen.filter(r=>level(r)===1);if(!regional.length)regional=chosen.filter(r=>regionCode(r)||regionName(r));if(!regional.length)regional=chosen;
  const map=new Map();
  for(const r of regional){
    const v=anomaly(r);if(v==null)continue;
    const codeValue=regionCode(r)||null;
    const nameValue=String(regionName(r)||'').trim()||null;
    const key=codeValue||nameValue||'national';
    const g=map.get(key)||{name:nameValue,code:codeValue,sw:0,w:0,s:0,n:0};
    const p=pixels(r);g.s+=v;g.n++;if(p>0){g.sw+=v*p;g.w+=p}map.set(key,g);
  }
  const areas=[...map.values()].map(g=>({name:g.name,code:g.code,anomalyPct:g.w?g.sw/g.w:g.s/g.n})).filter(x=>x.anomalyPct!=null).sort((a,b)=>a.anomalyPct-b.anomalyPct);
  let sw=0,w=0,s=0,n=0;for(const r of regional){const v=anomaly(r),p=pixels(r);if(v==null)continue;s+=v;n++;if(p>0){sw+=v*p;w+=p}}
  const sample=chosen[0];
  return{national:{anomalyPct:w?sw/w:s/n,referencePeriodStart:null,referencePeriodEnd:end(sample)||null,aggregationPeriod:'one_month',adminUnits:areas.length,source:'WFP CHIRPS via HDX'},areas,datasetUrl:`https://data.humdata.org/dataset/${d.x.name}`};
}

const data=JSON.parse(await fs.readFile('data/public-data.json','utf8'));
let ok=0,sourceUrl=null;
for(const[code,name]of countries){
  try{
    const r=await country(code,name);ok++;sourceUrl=r.datasetUrl;
    data.countries[code]={...(data.countries[code]||{}),rainfall:r.national};
    const current=data.countries[code].subnational||{};
    data.countries[code].subnational={...current,rainfall:r.areas};
    console.log(`Direct CHIRPS ${code}: ${r.national.anomalyPct.toFixed(1)}%, ${r.areas.length} regional records`);
  }catch(e){console.warn(`Direct CHIRPS ${code}: ${e.message}; previous data preserved`)}
  await sleep(400);
}

data.sources['WFP CHIRPS via HDX']=ok?{status:'ok',updatedAt:new Date().toISOString(),note:'WFP pre-computed CHIRPS 1-month rainfall anomaly (r1q) downloaded directly from HDX.',datasetUrl:sourceUrl}:{...(data.sources['WFP CHIRPS via HDX']||{}),status:'stale',lastAttempt:new Date().toISOString(),error:'No country direct CHIRPS refresh succeeded; previous data preserved.'};
const out=JSON.stringify(data,null,2);
const uiEnhancements=`
(function(){
  const COUNTRY_CODES=['KEN','UGA','RWA','BDI','ETH','ZMB'];
  const fmt=n=>n==null?'—':Intl.NumberFormat('en-GB',{notation:'compact',maximumFractionDigits:1}).format(n);
  const pct=n=>n==null?'—':\`${'${'}n>=0?'+':''}${'${'}Number(n).toFixed(0)}%\`;
  const readable=x=>x&&x.name&&x.name!==x.code&&!/^[A-Z]{2,3}\\d+$/i.test(x.name);
  function helpHtml(){return '<details class="context-help"><summary>What do these figures mean?</summary><p><strong>Rainfall:</strong> percentages compare rainfall over the latest rolling one-month CHIRPS period with the long-term average. For example, <strong>+40%</strong> means about 40% more rainfall than usual; <strong>-20%</strong> means about 20% less.</p><p><strong>Regions/provinces:</strong> these are the main administrative areas within each country — for example counties in Kenya, regions in Ethiopia or provinces in Zambia. We only show rainfall results when the source provides a readable area name.</p><p><strong>IPC Phase 3+:</strong> the displayed value is the estimated <em>number of people</em> facing Crisis or worse food insecurity, not a percentage.</p><p><a href="https://www.chc.ucsb.edu/data/chirps3" target="_blank" rel="noreferrer">Learn more about CHIRPS rainfall data ↗</a><br><a href="https://www.ipcinfo.org/ipcinfo-website/ipc-overview-and-classification-system/en/" target="_blank" rel="noreferrer">Learn more about the IPC food insecurity scale ↗</a></p></details>'}
  function enhance(){
    if(document.getElementById('context-help-style'))return;
    const style=document.createElement('style');style.id='context-help-style';
    style.textContent='.metric-help{cursor:help;border-bottom:1px dotted #6b7280}.context-help{margin-top:10px;padding-top:8px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280}.context-help summary{cursor:pointer;color:#2563eb;font-weight:700}.context-help p{margin:7px 0}.context-help strong{color:#18212b}.context-help a{color:#2563eb}.subgrid .small{margin-top:2px}';
    document.head.appendChild(style);
    document.querySelectorAll('.country-card').forEach((card,i)=>{
      const code=COUNTRY_CODES[i],d=window.PUBLIC_COUNTRY_DATA?.countries?.[code]||{},sub=d.subnational||{},detail=card.querySelector('.detail');if(!detail)return;
      const existing=detail.querySelector('.subgrid');if(existing)existing.remove();
      const oldHelp=detail.querySelector('.context-help');if(oldHelp)oldHelp.remove();
      const rain=(sub.rainfall||[]).filter(readable),dry=rain.slice(0,3),wet=rain.slice(-3).reverse(),ipc=(sub.foodSecurity||[]).slice(0,3);
      const grid=document.createElement('div');grid.className='subgrid';
      const rainEmpty='<div class="small">Named regional rainfall results are not available from this source.</div>';
      const ipcEmpty='<div class="small">No current comparable named regional IPC Phase 3+ data are available.</div>';
      grid.innerHTML='<div><b class="metric-help" title="The named regions, provinces or counties with the lowest rainfall compared with their long-term average over the latest one-month CHIRPS period.">Lowest recent rainfall ⓘ</b>'+ (dry.length?dry.map(x=>'<div class="small">'+x.name+': '+pct(x.anomalyPct)+'</div>').join(''):rainEmpty) +'</div><div><b class="metric-help" title="The named regions, provinces or counties with the highest rainfall compared with their long-term average over the latest one-month CHIRPS period.">Highest recent rainfall ⓘ</b>'+ (wet.length?wet.map(x=>'<div class="small">'+x.name+': '+pct(x.anomalyPct)+'</div>').join(''):rainEmpty) +'</div><div><b class="metric-help" title="The named regions, provinces or counties with the largest estimated number of people facing IPC Phase 3 Crisis, Phase 4 Emergency or Phase 5 Catastrophe/Famine.">Most people in IPC Phase 3+ ⓘ</b>'+ (ipc.length?ipc.map(x=>'<div class="small">'+x.name+': '+fmt(x.phase3Plus)+'</div>').join(''):ipcEmpty) +'</div>';
      detail.appendChild(grid);detail.insertAdjacentHTML('beforeend',helpHtml());
      const rainfallP=[...detail.querySelectorAll('p')].find(p=>p.textContent.trim().startsWith('Observed rainfall:'));if(rainfallP)rainfallP.innerHTML=rainfallP.innerHTML.replace(' vs normal',' vs long-term average <span class="small">(latest 1-month CHIRPS period)</span>');
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',enhance);else setTimeout(enhance,0);
})();`;
await fs.writeFile('data/public-data.json',out);
await fs.writeFile('data/public-data.js',`window.PUBLIC_COUNTRY_DATA = ${out};\n${uiEnhancements}\n`);
