(()=>{
if(document.body.dataset.country)return;
const CODES=['KEN','UGA','RWA','BDI','ETH','ZMB'];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let climateData=null;
function seasonHeadline(code,s){
  const text=String(s?.rainfall||'').replace(/\s+/g,' ').trim();
  const lower=text.toLowerCase();
  if(code==='ZMB')return 'Mostly below normal; wetter far north in Oct–Dec';
  if(code==='ETH'&&lower.includes('above normal')&&lower.includes('below normal'))return 'Mixed: wetter in parts; drier central/west';
  if(lower.includes('above normal')&&lower.includes('below normal'))return 'Mixed rainfall outlook';
  if(lower.includes('above normal')||lower.includes('above-normal')||lower.includes('wetter than usual'))return 'Above-normal rainfall';
  if(lower.includes('below normal')||lower.includes('below-normal')||lower.includes('drier than usual'))return 'Below-normal rainfall';
  if(lower.includes('near normal')||lower.includes('near-normal'))return 'Near-normal rainfall';
  return text?'See seasonal outlook':'No current seasonal outlook';
}
function displayPeriod(code,s){
  const p=String(s?.period||'Latest seasonal outlook');
  if(code==='ZMB'&&/2026\/27 rainy season/i.test(p))return'October 2026 – March 2027';
  return p.replace(/\s*-\s*/g,' – ');
}
function helpHtml(){return '<details class="info-details"><summary>What does this mean?</summary><div class="info-box"><p>The headline summarises the current multi-month rainfall outlook so countries can be compared quickly. It shows the broad seasonal tendency, not the weather expected in every week or every part of the country.</p><p>East African countries use ICPAC seasonal guidance; Zambia uses SADC/SARCOF. Open the source link for the full geographic detail and probabilities.</p></div></details>'}
function cellHtml(code){
  const s=climateData?.countries?.[code]?.seasonal;
  if(!s)return'<td>No current seasonal outlook</td>';
  const source=s.url?`<div class="small"><a href="${esc(s.url)}" target="_blank" rel="noreferrer">Official source ↗</a></div>`:'';
  return `<td><div style="font-weight:700;line-height:1.35">${esc(seasonHeadline(code,s))}</div><div class="small" style="margin-top:4px">${esc(displayPeriod(code,s))}</div>${source}</td>`;
}
function render(){
  const body=document.getElementById('metrics');
  if(!body||!climateData)return;
  body.querySelector('.season-ahead-row')?.remove();
  const active=document.querySelector('.filters button.on')?.dataset.cat||'All';
  if(active!=='All'&&active!=='Climate')return;
  const tr=document.createElement('tr');
  tr.className='season-ahead-row';
  tr.innerHTML=`<td class="metric">Season ahead${helpHtml()}</td>${CODES.map(cellHtml).join('')}`;
  const rows=[...body.children];
  if(active==='All'){
    if(rows[4])rows[4].after(tr);else body.appendChild(tr);
  }else{
    if(rows[1])rows[1].after(tr);else body.appendChild(tr);
  }
}
fetch('data/climate-forward.json?v='+Date.now(),{cache:'no-store'})
  .then(r=>{if(!r.ok)throw new Error('seasonal outlook unavailable');return r.json()})
  .then(F=>{climateData=F;render()})
  .catch(e=>console.warn('Season-ahead table row unavailable:',e.message));
document.querySelectorAll('.filters button').forEach(b=>b.addEventListener('click',()=>setTimeout(render,0)));
})();
