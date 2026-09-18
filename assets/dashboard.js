/* Homepage summaries use the existing snapshots; no additional external feeds. */
(()=>{
const data=window.PUBLIC_COUNTRY_DATA||{}, countries=[['KEN','Kenya'],['UGA','Uganda'],['RWA','Rwanda'],['BDI','Burundi'],['ETH','Ethiopia'],['ZMB','Zambia']];
const profilePath=code=>`countries/${(countries.find(([id])=>id===code)?.[1]||code).toLowerCase()}.html`;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=n=>typeof n==='number'&&Number.isFinite(n);
const compact=n=>new Intl.NumberFormat('en-GB',{notation:'compact',maximumFractionDigits:1}).format(n);
const date=s=>{const d=new Date(s);return s&&!Number.isNaN(+d)?d.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):'Period unavailable'};
const shortDate=s=>{const d=new Date(s);return s&&!Number.isNaN(+d)?d.toLocaleDateString('en-GB',{day:'numeric',month:'short'}):''};
const forecastPeriod=s=>s?.periodStart&&s?.periodEnd?`${shortDate(s.periodStart)} – ${date(s.periodEnd)}`:'Latest seven-day outlook';
const fresh=source=>source?.status==='ok'&&Number.isFinite(Date.parse(source.updatedAt))&&Date.now()-Date.parse(source.updatedAt)<=3*86400000;
let seasonal=null,seasonFailed=false;
// The refresh pipeline corrects ENSO after generating changes. Reconcile that
// entry against the final anomaly snapshots instead of repeating raw SST text.
function changes(){
  const list=(Array.isArray(data.changes)?data.changes:[]).filter(x=>x.metric!=='ENSO');
  const now=data.global?.enso,previous=data.previous?.global?.enso;
  if(now?.metric==='Niño 3.4 SST anomaly'&&previous?.metric===now.metric&&number(now.latest?.value)&&number(previous.latest?.value)){
    const delta=now.latest.value-previous.latest.value;
    if(Math.abs(delta)>=0.2||now.signal!==previous.signal)list.push({scope:'Global',metric:'ENSO',severity:'medium',text:`Niño 3.4 anomaly: ${previous.latest.value.toFixed(2)}°C → ${now.latest.value.toFixed(2)}°C. ${now.signal||''}`});
  }
  return list.sort((a,b)=>({high:0,medium:1,low:2}[a.severity]??3)-({high:0,medium:1,low:2}[b.severity]??3));
}
const updates=changes();
function changeHref(change,name){
  if(!name)return '#climate';
  const metric=String(change.metric||'').toLowerCase();
  const section=/alert|disaster/.test(metric)?'alerts':/rainfall|climate|drought/.test(metric)?'climateSummary':/ipc|food|refugee|displac|idp|funding/.test(metric)?'humanitarian':/inform|risk|violence|conflict/.test(metric)?'context':'trends';
  return `countries/${name.toLowerCase()}.html#${section}`;
}
function hazard(code,c){
  const gdacsFresh=fresh(data.sources?.GDACS),alerts=Array.isArray(c.gdacs)?c.gdacs:[];
  const weekly=seasonal?.data.countries?.[code]?.weekly;
  const weeklyFresh=fresh(seasonal?.data.sources?.['ICPAC weekly forecast']);
  const named=[['heavyRain','Heavy rainfall'],['heatStress','Heat stress'],['flood','Flood signal']].filter(([key])=>weekly?.[key+'Scope']==='country-or-subnational');
  const rank={red:0,orange:1,green:2};
  const alert=[...alerts].sort((a,b)=>(rank[String(a.alertLevel).toLowerCase()]??3)-(rank[String(b.alertLevel).toLowerCase()]??3))[0];
  if(alert){const level=String(alert.alertLevel||'').toLowerCase(),weatherWatch=named.length&&weeklyFresh;return {tone:!gdacsFresh?'unknown':level==='red'?'high':level==='orange'||weatherWatch?'watch':'context',badge:!gdacsFresh?'Check latest alerts':level==='red'?'Red GDACS alert':level==='orange'?'Orange GDACS alert':weatherWatch?'Weather watch':'Reported alert',text:(alert.name||'GDACS alert')+(named.length?' · '+named.map(x=>x[1]).join(' · '):''),note:`${alert.alertLevel||'Unspecified'} GDACS level · ${date(alert.date)}${alerts.length>1?` · +${alerts.length-1} more`:''}${!gdacsFresh?' · retained snapshot':''}${named.length?` · ICPAC ${weekly.period||'period unavailable'}${!weeklyFresh?' (retained)':''}`:''}`,links:[alert.url?{label:'Open GDACS report ↗',href:alert.url,external:true}:{label:'View alert details →',href:`${profilePath(code)}#alerts`},...(named.length?[{label:'View forecast detail →',href:`${profilePath(code)}#climateSummary`}]:[])]};}
  if(named.length)return {tone:weeklyFresh?'watch':'unknown',badge:weeklyFresh?'Weather watch':'Check latest outlook',text:named.map(x=>x[1]).join(' · '),note:`ICPAC · ${weekly.period||'Period unavailable'}${!weeklyFresh?' · retained snapshot':''}`,links:[{label:'View forecast detail →',href:`${profilePath(code)}#climateSummary`}]};
  if(!gdacsFresh||!Array.isArray(c.gdacs)||!seasonal||(!weeklyFresh&&code!=='ZMB'))return {tone:'unknown',badge:'Coverage incomplete',text:gdacsFresh&&Array.isArray(c.gdacs)?'No GDACS alert reported':'Current hazard status unavailable',note:'Check the profile and source status',links:[{label:'Check hazard details →',href:`${profilePath(code)}#alerts`}]};
  return {tone:'context',badge:'Latest context',text:'No major alert reported',note:`GDACS checked ${date(data.sources.GDACS.updatedAt)}${code==='ZMB'?' · ICPAC weekly coverage unavailable':''}`,links:[{label:'View alert sources →',href:`${profilePath(code)}#alerts`}]};
}
function hazardLinks(links=[]){return `<span class="hazard-links">${links.map(link=>`<a href="${esc(link.href)}"${link.external?' target="_blank" rel="noreferrer"':''}>${esc(link.label)}</a>`).join('<span aria-hidden="true"> · </span>')}</span>`;}
function sevenDay(code){
  const country=seasonal?.data.countries?.[code]||{},s=country.spatial7d,w=country.weekly||{};
  if(!s){
    const fallback=[w.rainfall,w.temperature].filter(Boolean).join(' ');
    return {headline:fallback||'Seven-day outlook unavailable',period:w.period||'Check the country profile for current coverage'};
  }
  const r=s.rainfall||{},t=s.temperature||{};
  const named=[['heavyRainScope','Heavy rainfall'],['heatStressScope','Heat stress'],['floodScope','Flood conditions']].filter(([key])=>w[key]==='country-or-subnational').map(x=>x[1]);
  let headline;
  if(named.length)headline=`${named.join(' · ')} flagged in parts`;
  else if(Number(r.heavySharePct)>=10&&Number(t.hotSharePct)>=10)headline='Heavy rain and heat possible in parts';
  else if(Number(r.drySharePct)>=70&&Number(t.hotSharePct)>=10)headline='Mostly dry; heat in some areas';
  else if(Number(r.drySharePct)>=70)headline='Mostly dry across much of the country';
  else if(Number(r.heavySharePct)>=10)headline='Heavy rain possible in parts';
  else if(Number(r.heavySharePct)>0)headline='Scattered rain, locally heavier in parts';
  else if(Number(r.medianMm)>=10)headline='Rain expected across many areas';
  else if(Number(r.medianMm)>=5)headline='Scattered rain across the country';
  else headline='Generally dry conditions';
  return {headline,period:forecastPeriod(s)};
}
function render(){
  document.getElementById('countrySummaries').innerHTML=countries.map(([code,name])=>{
    const c=data.countries?.[code]||{},s=seasonal?.data.countries?.[code]?.seasonal,food=c.foodSecurity,h=hazard(code,c),change=updates.find(x=>x.scope===name||x.scope===code),week=sevenDay(code);
    const climate=s?seasonal.headline(code,s):seasonFailed?'Seasonal outlook unavailable':'Loading seasonal outlook…';
    const seasonSource=seasonal?.data.sources?.[code==='ZMB'?'SADC / SARCOF-33':'ICPAC seasonal forecast'];
    const foodNote=food?.referencePeriodStart||food?.referencePeriodEnd?`${date(food.referencePeriodStart)} – ${date(food.referencePeriodEnd)}`:'Reporting period unavailable';
    const retained=data.sources?.['HDX HAPI · IPC']?.status!=='ok';
    const historical=Number.isFinite(Date.parse(food?.referencePeriodEnd))&&Date.parse(food.referencePeriodEnd)<Date.now();
    return `<article class="summary-card tone-${h.tone}"><div class="summary-card-heading"><h2>${name}</h2><span class="signal-badge">${esc(h.badge)}</span></div><dl>
      <div><dt>Next 7 days</dt><dd>${esc(week.headline)}<small>${esc(week.period)}</small><a class="forecast-link" href="${profilePath(code)}#climateSummary">View forecast <span aria-hidden="true">→</span></a></dd></div>
      <div><dt>Climate · season ahead</dt><dd>${esc(climate)}<small>${esc(s?seasonal.period(code,s)+(seasonSource?.status!=='ok'?' · retained outlook':''):'See the profile for available climate detail')}</small></dd></div>
      <div><dt>Immediate hazards</dt><dd>${esc(h.text)}<small>${esc(h.note)}</small>${hazardLinks(h.links)}</dd></div>
      <div><dt>What’s changing</dt><dd>${change?`<a class="change-detail-link" href="${changeHref(change,name)}">${esc(change.text)} <span aria-hidden="true">→</span></a>`:esc(data.previous?'No material change flagged':'No previous snapshot to compare')}</dd></div>
      </dl><div class="food-context"><div class="food-context-label">Food security context${historical?' · historical period':''}</div><div class="food-context-value">${number(food?.phase3Plus)?`<strong>${compact(food.phase3Plus)}</strong> people in Crisis or worse`:'No comparable IPC figure'}</div><small>${number(food?.phase3Plus)?esc(`IPC Phase 3+ · ${foodNote}${retained?' · retained snapshot':''}`):'Missing data does not mean zero'}</small></div><a class="profile-cta" href="countries/${name.toLowerCase()}.html">View ${name} <span aria-hidden="true">→</span></a></article>`;
  }).join('');
}
document.getElementById('changePeriod').textContent=data.previous?.generatedAt?`Since the previous snapshot (${date(data.previous.generatedAt)}). Only changes flagged by the available feeds are shown.`:'Change detection needs a previous snapshot.';
function changeItem(x){const country=countries.find(([code,name])=>x.scope===code||x.scope===name);return `<li><span class="change-scope">${esc(x.scope)} · ${esc(x.metric)}</span><span><a class="change-detail-link" href="${changeHref(x,country?.[1])}">${esc(x.text)} <span aria-hidden="true">→</span></a></span></li>`;}
document.getElementById('changes').innerHTML=updates.length?`<ul class="change-list">${updates.slice(0,3).map(changeItem).join('')}</ul>${updates.length>3?`<details class="more-changes"><summary>View ${updates.length-3} more changes</summary><ul class="change-list">${updates.slice(3).map(changeItem).join('')}</ul></details>`:''}`:'<p class="muted">No material changes flagged in the available comparison.</p>';
window.addEventListener('season-ready',event=>{seasonal=event.detail;render()});
window.addEventListener('season-unavailable',()=>{seasonFailed=true;render()});
render();
})();
