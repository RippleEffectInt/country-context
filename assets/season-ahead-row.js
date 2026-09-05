(()=>{
if(document.body.dataset.country)return;
const CODES=['KEN','UGA','RWA','BDI','ETH','ZMB'];
const NAMES={KEN:'Kenya',UGA:'Uganda',RWA:'Rwanda',BDI:'Burundi',ETH:'Ethiopia',ZMB:'Zambia'};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let climateData=null;
function cleanSummary(code,s){
  let text=String(s?.rainfall||'No current seasonal rainfall outlook available.').trim();
  for(const prefix of [`${NAMES[code]} — `,`${NAMES[code]} - `,`${NAMES[code]}: `])if(text.startsWith(prefix)){text=text.slice(prefix.length);break}
  return text.replace(/\.$/,'');
}
function displayPeriod(code,s){
  const p=String(s?.period||'Latest seasonal outlook');
  if(code==='ZMB'&&/2026\/27 rainy season/i.test(p))return'October 2026 – March 2027';
  return p.replace(/\s*-\s*/g,' – ');
}
function helpHtml(){return '<details class="info-details"><summary>What does this mean?</summary><div class="info-box"><p>The current multi-month rainfall outlook. It shows the broad seasonal tendency, not the weather expected in every week or every part of the country. East African countries use ICPAC seasonal guidance; Zambia uses SADC/SARCOF.</p><p>Open the source link in each country cell for the official outlook and methodology.</p></div></details>'}
function cellHtml(code){
  const s=climateData?.countries?.[code]?.seasonal;
  if(!s)return'<td>No current seasonal outlook</td>';
  const source=s.url?`<div class="small"><a href="${esc(s.url)}" target="_blank" rel="noreferrer">Official source ↗</a></div>`:'';
  return `<td><div style="font-weight:700;line-height:1.35">${esc(cleanSummary(code,s))}</div><div class="small" style="margin-top:4px">${esc(displayPeriod(code,s))}</div>${source}</td>`;
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
