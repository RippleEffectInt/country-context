(()=>{
const code=document.body.dataset.country;if(!code)return;
const css=document.createElement('link');css.rel='stylesheet';css.href='../assets/trends.css';document.head.appendChild(css);
const fmt=n=>Intl.NumberFormat('en-GB',{notation:'compact',maximumFractionDigits:1}).format(n);
const dateLabel=s=>{if(!s)return'';if(/^\d{4}-\d{2}$/.test(s)){const [y,m]=s.split('-');return new Date(Date.UTC(+y,+m-1,1)).toLocaleDateString('en-GB',{month:'short',year:'numeric',timeZone:'UTC'})}const d=new Date(s);return Number.isNaN(d.getTime())?s:d.toLocaleDateString('en-GB',{month:'short',year:'numeric'})};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function chart(points,{format=v=>String(v),zero=false}={}){
  const p=(points||[]).filter(x=>Number.isFinite(Number(x.value))).map(x=>({...x,value:Number(x.value)}));
  if(p.length<2)return `<div class="trend-empty">${p.length===1?`Current recorded source period: <strong>${esc(dateLabel(p[0].date))}</strong> · ${esc(format(p[0].value))}. More points will appear as the source publishes new periods.`:'No comparable trend periods recorded yet.'}</div>`;
  const W=520,H=180,L=48,R=12,T=15,B=30,vals=p.map(x=>x.value);let min=Math.min(...vals),max=Math.max(...vals);if(zero&&min>0)min=0;if(min===max){min-=Math.abs(min||1)*.1;max+=Math.abs(max||1)*.1}const pad=(max-min)*.08;min-=pad;max+=pad;
  const x=i=>L+(W-L-R)*(p.length===1?0.5:i/(p.length-1)),y=v=>T+(H-T-B)*(1-(v-min)/(max-min));
  const poly=p.map((d,i)=>`${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(' ');
  const ticks=[max,(max+min)/2,min];
  const circles=p.map((d,i)=>`<circle cx="${x(i)}" cy="${y(d.value)}" r="3.5"><title>${esc(dateLabel(d.date))}: ${esc(format(d.value))}</title></circle>`).join('');
  return `<svg class="trend-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Trend from ${esc(dateLabel(p[0].date))} to ${esc(dateLabel(p.at(-1).date))}"><g class="trend-gridlines">${ticks.map(v=>`<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}"></line><text x="${L-7}" y="${y(v)+4}" text-anchor="end">${esc(format(v))}</text>`).join('')}</g><polyline class="trend-line" points="${poly}"></polyline><g class="trend-points">${circles}</g><text class="trend-date" x="${L}" y="${H-7}">${esc(dateLabel(p[0].date))}</text><text class="trend-date" x="${W-R}" y="${H-7}" text-anchor="end">${esc(dateLabel(p.at(-1).date))}</text></svg>`;
}
function direction(points,format){const p=(points||[]).filter(x=>Number.isFinite(Number(x.value)));if(p.length<2)return'';const a=Number(p.at(-2).value),b=Number(p.at(-1).value),diff=b-a;if(Math.abs(diff)<1e-9)return`<span class="trend-direction">No change since previous source period</span>`;return `<span class="trend-direction">${diff>0?'↑':'↓'} ${esc(format(Math.abs(diff)))} since previous source period</span>`}
const defs={
 rainfall:{title:'Rainfall compared with normal',help:'One-month CHIRPS rainfall anomaly. Positive values are wetter than the long-term average; negative values are drier.',format:v=>`${v>=0?'+':''}${v.toFixed(0)}%`,zero:false},
 ipc:{title:'People in IPC Phase 3+',help:'Estimated people in Crisis food insecurity or worse for each published IPC assessment period.',format:v=>fmt(v),zero:true},
 conflict:{title:'Political violence',help:'Recorded political-violence events over rolling three-month periods.',format:v=>fmt(v),zero:true},
 idps:{title:'Internally displaced people',help:'Latest comparable displacement total for each published source period.',format:v=>fmt(v),zero:true},
 inform:{title:'INFORM overall risk',help:'Overall humanitarian risk index (0–10). INFORM is updated less often, so this trend will usually change slowly.',format:v=>v.toFixed(1)+'/10',zero:true}
};
async function run(){
  const kpi=document.getElementById('kpis')?.closest('.section');if(!kpi)return;
  const section=document.createElement('section');section.className='section';section.id='trends';section.innerHTML='<div class="trend-heading"><div><h2>Trends</h2><p class="muted">How key indicators have moved across their published source periods. Hover over chart points for the value and date.</p></div></div><div id="trendGrid" class="trend-grid"><div class="card muted">Loading trend history…</div></div>';
  kpi.insertAdjacentElement('afterend',section);
  try{
    const h=await fetch(`../data/history.json?v=${Date.now()}`,{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('History unavailable');return r.json()});
    const c=h.countries?.[code]||{},cards=[];
    for(const[key,d]of Object.entries(defs)){const pts=c[key]||[];cards.push(`<div class="card trend-card"><div class="small">${esc(d.title)}</div><div class="trend-current">${pts.length?esc(d.format(Number(pts.at(-1).value))):'—'}</div>${direction(pts,d.format)}${chart(pts,d)}<p class="trend-help">${esc(d.help)}</p></div>`)}
    const enso=h.global?.enso||[],ef=v=>`${v>=0?'+':''}${Number(v).toFixed(2)}°C`;cards.push(`<div class="card trend-card trend-global"><div class="small">Global Niño 3.4 anomaly</div><div class="trend-current">${enso.length?esc(ef(enso.at(-1).value)):'—'}</div>${direction(enso,ef)}${chart(enso,{format:ef})}<p class="trend-help">Monthly tropical Pacific sea-surface-temperature anomaly. Around +0.5°C or higher is a warm/El Niño signal; around −0.5°C or lower is a cool/La Niña signal. A single monthly value is context, not an official ENSO declaration.</p></div>`);
    document.getElementById('trendGrid').innerHTML=cards.join('');
  }catch(e){document.getElementById('trendGrid').innerHTML='<div class="card muted">Trend history is being initialised. Current indicators above are still available.</div>'}
}
run();
})();
