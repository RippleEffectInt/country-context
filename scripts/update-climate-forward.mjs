import fs from 'node:fs/promises';

const FILE='data/climate-forward.json';
const WEEKLY='https://www.icpac.net/weekly-forecast/';
const SEASONAL='https://www.icpac.net/seasonal-forecast/';
const DROUGHT='https://droughtwatch.icpac.net/report-v2/';
const SADC='https://www.sadc.int/latest-news/sadc-outlook-favours-drier-conditions-across-much-southern-africa-during-202627-rainy';
const ZMD='https://zmd.gov.zm/';
const EA=[['KEN','Kenya'],['UGA','Uganda'],['RWA','Rwanda'],['BDI','Burundi'],['ETH','Ethiopia']];

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function get(url){let last;for(let i=0;i<4;i++){try{const r=await fetch(url,{headers:{'User-Agent':'Ripple-Effect-Country-Context/2.0','Accept':'text/html,application/xhtml+xml'}});if(r.ok)return await r.text();last=new Error(`${r.status} ${r.statusText}`);if((r.status===429||r.status>=500)&&i<3){await sleep(1200*(i+1));continue}throw last}catch(e){last=e;if(i<3){await sleep(1200*(i+1));continue}}}throw last}
function decode(s){return s.replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&ndash;|&#8211;/gi,'–').replace(/&mdash;|&#8212;/gi,'—').replace(/&deg;/gi,'°').replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(+n));}
function text(html){return decode(html.replace(/<script\b[\s\S]*?<\/script>/gi,' ').replace(/<style\b[\s\S]*?<\/style>/gi,' ').replace(/<\/(li|p|h[1-6]|div|section|article|tr|td)>/gi,'. ').replace(/<br\s*\/?>/gi,'. ').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').replace(/\.\s*\./g,'. ').trim()}
function top(t,marker){const i=t.toLowerCase().indexOf(marker.toLowerCase());return i>0?t.slice(0,i):t}
function sentences(t){return [...new Set(t.split(/(?<=[.!?])\s+/).map(x=>x.trim()).filter(x=>x.length>18))]}
function mentions(s,name){return new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b`,'i').test(s)}
function pick(ss,name,test){return ss.filter(s=>mentions(s,name)&&test(s));}
function combine(a,fallback){return a.length?a.join(' '):fallback}
function periodWeekly(t){return t.match(/\b\d{1,2}\s*[-–]\s*\d{1,2}\s+[A-Za-z]+\s+20\d{2}\b/)?.[0]||'Latest weekly forecast'}
function periodSeasonal(t){return t.match(/\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s*[-–]\s*(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+20\d{2}\b/i)?.[0]||'Latest seasonal forecast'}
async function readOld(){try{return JSON.parse(await fs.readFile(FILE,'utf8'))}catch{return{generatedAt:null,sources:{},countries:{}}}}
function source(out,key,status,url,period,error){out.sources[key]={...(out.sources[key]||{}),status,url,period:period||out.sources[key]?.period||null,updatedAt:new Date().toISOString(),...(error?{error:String(error)}:{})}}

const out=await readOld();out.sources||={};out.countries||={};for(const[c]of [...EA,['ZMB','Zambia']])out.countries[c]||={};

try{
  const raw=await get(WEEKLY),t=top(text(raw),'Weekly Forecasts'),ss=sentences(t),period=periodWeekly(t);
  const regionalTemp=ss.find(s=>/warmer than usual|cooler than usual|temperature anomalies/i.test(s)&&/GHA|Greater Horn|region|most parts/i.test(s));
  for(const[c,name]of EA){
    const rain=pick(ss,name,s=>/rainfall/i.test(s)&&/(more than usual|less than usual|wetter than usual|drier than usual|rainfall anomal)/i.test(s));
    const heavy=pick(ss,name,s=>/90th percentile|exceptional rainfall|heavy rainfall/i.test(s));
    const heat=pick(ss,name,s=>/heat stress|extreme caution|danger category/i.test(s));
    const flood=pick(ss,name,s=>/flood/i.test(s)&&!/mitigate risks associated/i.test(s));
    out.countries[c].weekly={period,rainfall:combine(rain,`No country-specific rainfall anomaly is highlighted for ${name} in the latest ICPAC weekly bulletin.`),temperature:regionalTemp||`No country-specific temperature anomaly is highlighted for ${name} in the latest ICPAC weekly bulletin.`,heavyRain:combine(heavy,`No country-specific exceptional-rainfall signal is highlighted for ${name} in the latest ICPAC weekly bulletin.`),heatStress:combine(heat,`No country-specific severe heat-stress signal is highlighted for ${name} in the latest ICPAC weekly bulletin.`),flood:combine(flood,`No country-specific flood update is listed for ${name} in the latest ICPAC weekly bulletin. This does not mean there is no local flood risk.`),url:WEEKLY};
  }
  source(out,'ICPAC weekly forecast','ok',WEEKLY,period);
}catch(e){source(out,'ICPAC weekly forecast','stale',WEEKLY,null,e.message);console.warn('ICPAC weekly stale:',e.message)}

try{
  const raw=await get(SEASONAL),t=top(text(raw),'Seasonal forecasts'),ss=sentences(t),period=periodSeasonal(t);
  const regionalTemp=ss.find(s=>/above normal temperatures|warmer than usual|below normal temperatures|cooler than usual/i.test(s)&&/region/i.test(s));
  for(const[c,name]of EA){
    const rain=pick(ss,name,s=>/rainfall/i.test(s)&&/(above normal|below normal|wetter than usual|drier than usual)/i.test(s));
    const temp=pick(ss,name,s=>/temperature/i.test(s)&&/(above normal|below normal|warmer than usual|cooler than usual)/i.test(s));
    out.countries[c].seasonal={period,rainfall:combine(rain,`No country-specific seasonal rainfall signal is highlighted for ${name} in the latest ICPAC seasonal summary.`),temperature:combine(temp,regionalTemp||'See the latest ICPAC seasonal temperature outlook.'),url:SEASONAL};
  }
  source(out,'ICPAC seasonal forecast','ok',SEASONAL,period);
}catch(e){source(out,'ICPAC seasonal forecast','stale',SEASONAL,null,e.message);console.warn('ICPAC seasonal stale:',e.message)}

try{
  const raw=await get(DROUGHT),t=text(raw),date=t.match(/Date of Analysis:\s*([^.]*(?:20\d{2}))/i)?.[1]?.trim()||'Latest analysis';
  const val=label=>{const m=t.match(new RegExp(`${label}[\\s.|:;-]*[\\d,]+\\s*\\(([\\d.]+)%\\)`,'i'));return m?Number(m[1]):null};
  const alertPct=val('Alert'),warningPct=val('Warning'),watchPct=val('Watch');
  const bits=[];if(alertPct!=null)bits.push(`${alertPct.toFixed(2)}% Alert`);if(warningPct!=null)bits.push(`${warningPct.toFixed(2)}% Warning`);if(watchPct!=null)bits.push(`${watchPct.toFixed(2)}% Watch`);
  for(const[c]of EA){const old=out.countries[c].drought||{},a=alertPct??old.alertPct??null,w=warningPct??old.warningPct??null,wa=watchPct??old.watchPct??null,oldBits=[];if(a!=null)oldBits.push(`${Number(a).toFixed(2)}% Alert`);if(w!=null)oldBits.push(`${Number(w).toFixed(2)}% Warning`);if(wa!=null)oldBits.push(`${Number(wa).toFixed(2)}% Watch`);const narrative=bits.length?`Latest East Africa regional CDI analysis: ${bits.join(', ')} of the population. Open Drought Watch for country and local-area inspection.`:oldBits.length?`Latest retained East Africa regional CDI figures: ${oldBits.join(', ')} of the population. Open Drought Watch for the newest country and local-area analysis.`:(old.text||'Open East Africa Drought Watch for the latest Combined Drought Indicator and country/local-area inspection.');out.countries[c].drought={scope:'regional',period:date||old.period||'Latest analysis',text:narrative,alertPct:a,warningPct:w,watchPct:wa,url:DROUGHT};}
  source(out,'East Africa Drought Watch','ok',DROUGHT,date);
}catch(e){source(out,'East Africa Drought Watch','stale',DROUGHT,null,e.message);console.warn('EADW stale:',e.message)}

try{
  const raw=await get(SADC),t=text(raw),ss=sentences(t),date=t.match(/August\s+27,\s+2026/i)?.[0]||'27 August 2026';
  const rain=ss.filter(s=>mentions(s,'Zambia')&&/rainfall/i.test(s));
  const temp=ss.find(s=>/temperature outlook/i.test(s)&&/above-average|above average/i.test(s));
  out.countries.ZMB.weekly={period:'Current',rainfall:"ICPAC's weekly forecast does not cover Zambia. Shorter-range information should come from Zambia Meteorological Department or SADC services.",temperature:"ICPAC's weekly forecast does not cover Zambia.",heavyRain:'No ICPAC weekly product is applied to Zambia.',heatStress:'No ICPAC weekly product is applied to Zambia.',flood:'No ICPAC weekly flood product is applied to Zambia.',url:ZMD};
  out.countries.ZMB.seasonal={period:'2026/27 rainy season',rainfall:combine(rain,'See the latest SADC/SARCOF seasonal rainfall outlook for Zambia.'),temperature:temp||'See the latest SADC/SARCOF temperature outlook.',url:SADC};
  out.countries.ZMB.drought={scope:'not-covered',period:'Current',text:'East Africa Drought Watch does not cover Zambia. Seasonal drought context is therefore taken from SADC/SARCOF and observed CHIRPS rainfall rather than ICPAC CDI.',url:SADC};
  source(out,'SADC / SARCOF-33','ok',SADC,date);
}catch(e){source(out,'SADC / SARCOF-33','stale',SADC,null,e.message);console.warn('SADC stale:',e.message)}

out.generatedAt=new Date().toISOString();await fs.writeFile(FILE,JSON.stringify(out,null,2));console.log('Current/upcoming climate data updated');
