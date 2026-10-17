'use strict';
/* Редактор карт: глобус и плоские карты; страны, регионы и мелкие провинции; государства и союзы разными цветами */

const GEO={countries:null,prov:{},names:null};
const geoJobs={};
function fetchJSON(url){return geoJobs[url]=geoJobs[url]||fetch(url).then(r=>{if(!r.ok)throw new Error('нет файла '+url);return r.json();});}
async function loadGeo(splitCodes){
  if(!GEO.countries)GEO.countries=await fetchJSON('data/geo/countries.json?v=9');
  const codes=(splitCodes||[]).filter(c=>!GEO.prov[c]);
  if(codes.length||((splitCodes||[]).length&&!GEO.names)){
    if(!GEO.names)GEO.names=await fetchJSON('data/geo/prov/index.json?v=9');
    await Promise.all(codes.filter(c=>GEO.names.c[c]).map(async c=>{GEO.prov[c]=await fetchJSON('data/geo/prov/'+c+'.json?v=9');}));
  }
  return GEO;
}
const splitOf=m=>(m&&m.split)||[];
/* Готовые карты хранятся как настройки; картинку рисуем при запуске сайта */
async function renderStoredMaps(){
  const maps=P.media.filter(m=>m.map);if(!maps.length||!window.MapDraw)return false;
  try{
    await loadGeo([...new Set(maps.flatMap(m=>splitOf(m.map)))]);
    for(const m of maps)m.src=svgURI(MapDraw.drawMap(m.map,GEO));
    return true;
  }catch(e){console.warn(e);toast('Не удалось загрузить данные для карт: '+e.message,true);return false;}
}
function serializeProject(pretty){return JSON.stringify(P,function(k,v){return k==='src'&&this&&this.map?undefined:v;},pretty?1:0);}

const MAP_PRESETS={
  'Европейский союз':'AUT BEL BGR HRV CYP CZE DNK EST FIN FRA DEU GRC HUN IRL ITA LVA LTU LUX MLT NLD POL PRT ROU SVK SVN ESP SWE',
  'НАТО':'ALB BEL BGR CAN HRV CZE DNK EST FIN FRA DEU GRC HUN ISL ITA LVA LTU LUX MNE NLD MKD NOR POL PRT ROU SVK SVN ESP SWE TUR GBR USA',
  'СССР (1991)':'RUS UKR BLR UZB KAZ GEO AZE LTU MDA LVA KGZ TJK ARM TKM EST',
  'СНГ':'ARM AZE BLR KAZ KGZ MDA RUS TJK UZB',
  'ОДКБ':'ARM BLR KAZ KGZ RUS TJK',
  'ШОС':'CHN IND IRN KAZ KGZ PAK RUS TJK UZB BLR',
  'БРИКС':'BRA RUS IND CHN ZAF EGY ETH IRN ARE IDN',
  'АСЕАН':'BRN KHM IDN LAO MYS MMR PHL SGP THA VNM TLS',
  'Лига арабских государств':'DZA BHR COM DJI EGY IRQ JOR KWT LBN LBY MRT MAR OMN PSX QAT SAU SOM SDN SYR TUN ARE YEM',
};
const MAP_COLORS=['#346733','#66cc66','#1f93c0','#c0392b','#e67e22','#8e44ad','#f1c40f','#16a085','#7f8c8d','#2c3e50'];
const MAP_TOOLS={
  pan:['Двигать','Перетаскивайте карту, колесо мыши меняет масштаб.'],
  country:['Страны','Щелчок добавляет страну целиком в отмеченную группу или убирает её. Так удобно собирать союзы вроде ЕС.'],
  prov:['Кисть','Щёлкните по стране, чтобы разбить её на провинции, потом закрашивайте их, проводя мышью. Провинция принадлежит только одной группе. Если повести кистью по уже закрашенной провинции, она станет прежней.'],
  region:['Регион целиком','Щелчок закрашивает целую область, штат или провинцию первого уровня.'],
  erase:['Ластик','Проведите мышью, чтобы освободить провинции от любых групп.'],
};

const ME={spec:null,name:'',orig:null,active:0,tool:'prov',drag:null,raf:0,stroke:null,space:false};

function viewMapNew(){
  $('#main').classList.remove('is-main');
  const card=(k,t,d,img)=>`<button class="tcard mcard" data-act="map-start" data-k="${k}"><span class="mcard-img">${img}</span><b>${t}</b><span>${d}</span></button>`;
  const globe=`<svg viewBox="0 0 60 60" width="60" height="60"><circle cx="30" cy="30" r="27" fill="#fff" stroke="#999"/><path d="M14 22c6-6 14-8 20-4s10 2 12 8c-4 6-10 4-14 10s-12 4-14-2-8-6-4-12z" fill="#346733"/><path d="M3 30h54M30 3v54" stroke="#ccc" fill="none"/></svg>`;
  const flat=`<svg viewBox="0 0 90 46" width="90" height="46"><ellipse cx="45" cy="23" rx="43" ry="21" fill="#fff" stroke="#999"/><path d="M12 14h18v10H18zM40 10h10v8h-6v6h-6zM58 12h18v12H62zM24 28h8v10h-6zM46 26h8v10h-8zM66 30h8v6h-8z" fill="#c0c0c0"/><path d="M40 10h10v8h-6v6h-6zM66 30h8v6h-8z" fill="#1f93c0"/></svg>`;
  setView(mainMenuHTML(),shell({title:'Новая карта',content:`<p>Выберите вид карты. Потом раскрасьте государства и союзы: целыми странами или кистью по мелким провинциям.</p><div class="tgrid">${card('globe','Глобус','Как в карточке статьи «Россия»: государство на глобусе, спорные земли светлее.',globe)}${card('flat','Плоская карта мира','Как у союзов и организаций: страны-участницы одним цветом.',flat)}</div>`}),'Новая карта');
}
async function viewMapEditor(name){
  $('#main').classList.remove('is-main');
  const m=name?P.media.find(x=>x.name===name&&x.map):null;
  if(name&&!m){setView(mainMenuHTML(),shell({title:'Карта не найдена',content:`<p>В медиатеке нет карты «${esc(name)}».</p><p><a class="btn pri" href="#/map/">Создать карту</a></p>`}),'Карта');return;}
  if(m){ME.spec=JSON.parse(JSON.stringify(m.map));ME.name=m.name;ME.orig=m.name;}
  else if(!ME.spec||ME.orig!==null){ME.spec=MapDraw.defaults(ME.kind||'globe');ME.name=uniqueName(ME.kind==='flat'?'Карта мира':'Карта');ME.orig=null;}
  for(const g of ME.spec.groups){g.countries=g.countries||[];g.regions=g.regions||[];g.prov=g.prov||[];}
  ME.spec.split=ME.spec.split||[];
  ME.active=Math.max(0,Math.min(ME.active,ME.spec.groups.length-1));
  setView('',shell({title:(m?'Карта: ':'Новая карта: ')+`<span id="me-title">${esc(ME.name)}</span>`,content:`<div class="mapedit"><div class="me-panel" id="me-panel"></div><div class="me-canvas"><div class="me-tools" id="me-tools"></div><div class="me-hover" id="me-hover">&nbsp;</div><div id="me-svg" class="me-svg"><p class="cnt">Загружаю карту мира…</p></div><p class="cnt me-help" id="me-help"></p></div></div>`,sub:false,foot:false}),'Редактор карт');
  document.body.classList.add('mode-edit');
  renderMePanel();
  try{await loadGeo(ME.spec.split);}catch(e){$('#me-svg').innerHTML=`<p class="missing">Не удалось загрузить карту мира: ${esc(e.message)}. Редактор карт работает только на сайте или через локальный сервер, а не из файла на диске.</p>`;return;}
  drawMe();
}
function provCount(g){
  let n=(g.prov||[]).length;
  for(const r of g.regions||[]){const c=GEO.names&&GEO.names.r[r]&&GEO.names.r[r][1];const Pp=c&&GEO._p&&GEO._p[c];n+=Pp&&Pp.byRegion[r]?Pp.byRegion[r].length:1;}
  return n;
}
function groupStat(g){const c=(g.countries||[]).length,p=provCount(g);return [c?c+' '+plural(c,'страна','страны','стран'):'',p?p+' '+plural(p,'провинция','провинции','провинций'):''].filter(Boolean).join(' и ')||'пока пусто';}
const cname=id=>{const f=GEO.countries&&MapDraw.prepare(GEO)._cById[id];return f?f.properties.ru:id;};
function renderMeTools(){
  const t=$('#me-tools');if(!t)return;
  t.innerHTML=`<div class="seg">${Object.entries(MAP_TOOLS).map(([k,v])=>`<button class="${ME.tool===k?'on':''}" data-act="me-tool" data-k="${k}">${v[0]}</button>`).join('')}</div>
    <div class="seg"><button data-act="me-zoom" data-z="1.5" aria-label="Приблизить" title="Приблизить">+</button><button data-act="me-zoom" data-z="0.667" aria-label="Отдалить" title="Отдалить">−</button></div>
    <span class="me-active">Цвет кисти: ${ME.spec.groups[ME.active]?`<span class="legend-color" style="background:${esc(ME.spec.groups[ME.active].color)}"></span> ${esc(ME.spec.groups[ME.active].name)}`:'нет групп'}</span>`;
  const h=$('#me-help');if(h)h.textContent=MAP_TOOLS[ME.tool][1]+(ME.tool!=='pan'?' Двигать и приближать карту: правой кнопкой мыши, с зажатым пробелом или двумя пальцами.':'');
}
function renderMePanel(){
  const s=ME.spec;const pr=MapDraw.PROJ;
  $('#me-panel').innerHTML=`
  <div class="ed-top"><button class="btn pri" data-act="map-save">Сохранить карту</button><a class="btn" href="${ME.target?'#/edit/'+ME.target.pageId:'#/media'}">Отмена</a></div>
  <label class="fld"><span>Имя в медиатеке</span><input id="me-name" value="${esc(ME.name)}"></label>
  <fieldset class="grp"><legend>Государства и союзы</legend>
    <div class="me-groups">${s.groups.map((g,i)=>`<div class="me-g${i===ME.active?' on':''}" data-act="me-active" data-i="${i}"><input type="color" value="${esc(g.color)}" data-mg="color" data-i="${i}" aria-label="Цвет"><div class="me-g-txt"><input value="${esc(g.name)}" data-mg="name" data-i="${i}" aria-label="Название"><span class="cnt">${groupStat(g)}</span></div><span class="me-g-btns"><button class="ic" data-act="me-gup" data-i="${i}" aria-label="Выше" title="Рисовать ниже других">↑</button><button class="ic x" data-act="me-gdel" data-i="${i}" aria-label="Удалить">✕</button></span></div>`).join('')}</div>
    <div class="line"><button class="btn sm" data-act="me-gadd">+ государство или союз</button>
    <select id="me-preset" aria-label="Готовый союз"><option value="">Готовый союз…</option>${Object.keys(MAP_PRESETS).map(k=>`<option>${k}</option>`).join('')}</select></div>
    <p class="cnt">Щёлкните по группе, чтобы рисовать её цветом. Если союзы пересекаются, сверху рисуется тот, что ниже в списке.</p>
  </fieldset>
  ${s.split.length?`<fieldset class="grp"><legend>Разбиты на провинции</legend><div class="chips">${s.split.map(c=>`<span class="chip on">${esc(cname(c))} <button class="ic x" data-act="me-unsplit" data-k="${c}" aria-label="Собрать страну обратно" title="Собрать обратно">✕</button></span>`).join('')}</div></fieldset>`:''}
  <fieldset class="grp"><legend>Вид</legend>
    <div class="seg">${Object.entries(pr).map(([k,v])=>`<button class="${s.proj===k?'on':''}" data-act="me-proj" data-k="${k}">${v.name}</button>`).join('')}</div>
    <label class="fld"><span>Долгота центра: <b id="me-lon-v">${Math.round(s.lon)}°</b></span><input type="range" id="me-lon" min="-180" max="180" step="1" value="${s.lon}"></label>
    ${s.proj==='ortho'||s.zoom>1?`<label class="fld"><span>Широта центра: <b id="me-lat-v">${Math.round(s.lat)}°</b></span><input type="range" id="me-lat" min="-90" max="90" step="1" value="${s.lat}"></label>`:''}
    <label class="fld"><span>Масштаб: <b id="me-zoom-v">${(+s.zoom).toFixed(1)}×</b></span><input type="range" id="me-zoom" min="1" max="12" step="0.1" value="${s.zoom}"></label>
    <div><button class="btn sm" data-act="me-center">Повернуть к выбранной группе</button></div>
  </fieldset>
  <fieldset class="grp"><legend>Оформление</legend>
    <div class="line"><label class="inl">Суша <input type="color" data-ms="land" value="${s.land}"></label><label class="inl">Границы <input type="color" data-ms="border" value="${s.border}"></label><label class="inl">Океан <input type="color" data-ms="ocean" value="${s.ocean}"></label></div>
    <div class="line"><label class="inl"><input type="checkbox" data-ms="grat"${s.grat?' checked':''}> сетка</label>${s.proj==='ortho'?`<label class="inl"><input type="checkbox" data-ms="shade"${s.shade?' checked':''}> объём</label>`:''}<label class="inl"><input type="checkbox" data-ms="lakes"${s.lakes?' checked':''}> озёра</label><label class="inl">Толщина границ <input type="number" data-ms="bw" min="0" max="3" step="0.1" value="${s.bw}"></label></div>
  </fieldset>
  <fieldset class="grp"><legend>Подпись с легендой</legend>
    <p class="cnt">Вставьте в подпись картинки в карточке:</p>
    <textarea class="mono" rows="3" readonly id="me-legend">${esc(legendText())}</textarea>
  </fieldset>`;
  renderMeTools();
}
const legendText=()=>ME.spec.groups.map(g=>`{{цвет|${g.color}}} ${g.name}`).join('<br>');
function drawMe(){
  if(!GEO.countries)return;const box=$('#me-svg');if(!box)return;
  try{box.innerHTML=MapDraw.drawMap(ME.spec,GEO,{interactive:true});}catch(e){box.innerHTML=`<p class="missing">Ошибка рисования: ${esc(e.message)}</p>`;}
}
function drawMeSoon(){if(ME.raf)return;ME.raf=requestAnimationFrame(()=>{ME.raf=0;drawMe();});}
function syncSliders(){const s=ME.spec;for(const k of ['lon','lat','zoom']){const el=$('#me-'+k);if(el)el.value=s[k];const v=$('#me-'+k+'-v');if(v)v.textContent=k==='zoom'?(+s.zoom).toFixed(1)+'×':Math.round(s[k])+'°';}}
function featName(t){
  if(!t||!t.dataset)return '';
  if(t.dataset.p){const r=GEO.names&&GEO.names.r[t.dataset.r];return `Провинция ${+t.dataset.p.split('.').pop()+1} · ${r?r[0]:''}, ${cname(t.dataset.c)}`;}
  if(t.dataset.c)return cname(t.dataset.c);
  return '';
}

/* ---- принадлежность провинций ---- */
const PV=cid=>MapDraw.prepare(GEO)._p[cid];
function rm(arr,v){const i=arr.indexOf(v);if(i>=0)arr.splice(i,1);}
function detachProv(g,cid,rid,pid){
  const Pp=PV(cid);
  if(g.countries.includes(cid)){rm(g.countries,cid);for(const r of Pp.regions)if(!g.regions.includes(r))g.regions.push(r);}
  if(g.regions.includes(rid)){rm(g.regions,rid);for(const p of Pp.byRegion[rid])if(!g.prov.includes(p))g.prov.push(p);}
  rm(g.prov,pid);
}
function detachRegion(g,cid,rid){
  const Pp=PV(cid);
  if(g.countries.includes(cid)){rm(g.countries,cid);for(const r of Pp.regions)if(!g.regions.includes(r))g.regions.push(r);}
  rm(g.regions,rid);const set=new Set(Pp.byRegion[rid]);g.prov=g.prov.filter(p=>!set.has(p));
}
function claimProv(g,cid,rid,pid){
  for(const o of ME.spec.groups)if(o!==g&&MapDraw.owns(o,cid,rid,pid))detachProv(o,cid,rid,pid);
  if(!MapDraw.owns(g,cid,rid,pid))g.prov.push(pid);
}
function claimRegion(g,cid,rid){
  for(const o of ME.spec.groups)if(o!==g&&(o.countries.includes(cid)||o.regions.includes(rid)||PV(cid).byRegion[rid].some(p=>o.prov.includes(p))))detachRegion(o,cid,rid);
  if(g.countries.includes(cid))return;
  const set=new Set(PV(cid).byRegion[rid]);g.prov=g.prov.filter(p=>!set.has(p));if(!g.regions.includes(rid))g.regions.push(rid);
}
function compact(g){
  // все провинции региона закрашены — храним регион целиком
  const byR={};for(const p of g.prov){const r=p.slice(0,p.lastIndexOf('.'));(byR[r]=byR[r]||[]).push(p);}
  for(const r in byR){const c=GEO.names.r[r]&&GEO.names.r[r][1];const Pp=c&&PV(c);if(Pp&&Pp.byRegion[r]&&byR[r].length===Pp.byRegion[r].length){const set=new Set(byR[r]);g.prov=g.prov.filter(p=>!set.has(p));g.regions.push(r);}}
}
function recolor(paths){const s=ME.spec;for(const el of paths)el.setAttribute('fill',MapDraw.colorOf(s,el.dataset.c,el.dataset.r,el.dataset.p)||s.land);}
function applyStroke(el){
  const st=ME.stroke;if(!st||!el||!el.dataset.p)return;
  const s=ME.spec,g=s.groups[ME.active];const {c,r,p}=el.dataset;
  if(ME.tool==='region'){
    if(st.done.has(r))return;st.done.add(r);
    if(st.mode==='add')claimRegion(g,c,r);else for(const o of s.groups)if(st.all||o===g)detachRegion(o,c,r);
    recolor($$(`#me-svg path[data-r="${CSS.escape(r)}"]`));
  }else{
    if(st.done.has(p))return;st.done.add(p);
    if(st.mode==='add')claimProv(g,c,r,p);else for(const o of s.groups)if((st.all||o===g)&&MapDraw.owns(o,c,r,p))detachProv(o,c,r,p);
    recolor([el]);
  }
  st.changed=true;
}
async function splitCountry(c){
  $('#me-hover').textContent='Загружаю провинции: '+cname(c)+'…';
  try{await loadGeo([...ME.spec.split,c]);}catch(e){toast('Не удалось загрузить провинции: '+e.message,true);return;}
  if(!GEO.prov[c]){toast('Для этой территории нет деления на провинции',true);return;}
  if(!ME.spec.split.includes(c))ME.spec.split.push(c);
  $('#me-hover').textContent=cname(c)+': '+PV(c).feats.length+' провинций';
  renderMePanel();drawMe();
}
function meUnsplit(c){
  const s=ME.spec;const Pp=PV(c);if(!Pp){s.split=s.split.filter(x=>x!==c);renderMePanel();drawMe();return;}
  const regs=new Set(Pp.regions),provs=new Set(Pp.feats.map(f=>f.properties.id));let lost=false;
  for(const g of s.groups){
    const all=Pp.feats.every(f=>MapDraw.owns(g,c,f.properties.r,f.properties.id));
    const some=Pp.feats.some(f=>MapDraw.owns(g,c,f.properties.r,f.properties.id));
    if(all&&!g.countries.includes(c))g.countries.push(c);else if(some&&!all)lost=true;
    g.regions=g.regions.filter(r=>!regs.has(r));g.prov=g.prov.filter(p=>!provs.has(p));
  }
  s.split=s.split.filter(x=>x!==c);if(lost)toast('Границы внутри страны «'+cname(c)+'» сброшены');
  renderMePanel();drawMe();
}
async function meSave(){
  const s=ME.spec;let name=($('#me-name').value||'').trim()||'Карта';
  const clash=P.media.find(m=>m.name===name&&m.name!==ME.orig);
  if(clash){toast('В медиатеке уже есть «'+name+'». Выберите другое имя.',true);return;}
  try{await loadGeo(s.split);}catch(e){toast(e.message,true);return;}
  const src=svgURI(MapDraw.drawMap(s,GEO));
  if(ME.orig){const i=P.media.findIndex(m=>m.name===ME.orig);if(i>=0){if(name!==ME.orig)renameMedia(i,name);P.media[i].map=JSON.parse(JSON.stringify(s));P.media[i].src=src;}}
  else P.media.push({name,src,map:JSON.parse(JSON.stringify(s))});
  ME.orig=name;ME.name=name;save();toast('Карта «'+name+'» сохранена');
  const t=ME.target;ME.target=null;
  if(t){const pg=P.pages.find(p=>p.id===t.pageId);if(pg){setPath(pg,t.path,name);pg.updated=Date.now();save();location.hash='#/edit/'+pg.id;return;}}
  location.hash='#/media';
}

/* события редактора карт */
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-act]');if(!b)return;const a=b.dataset.act;const s=ME.spec;
  if(e.target.closest('input')&&a==='me-active'&&e.target.type!=='color')return;
  switch(a){
    case 'map-start':ME.kind=b.dataset.k;ME.spec=null;ME.orig=null;location.hash='#/map/new';break;
    case 'map-for':{const pg=edPage;if(!pg)break;ME.target={pageId:pg.id,path:b.dataset.path};ME.spec=null;ME.orig=null;location.hash='#/map/';break;}
    case 'map-save':meSave();break;
    case 'me-proj':{const was=s.proj;s.proj=b.dataset.k;if(was==='ortho'&&s.proj!=='ortho'){s.lat=0;s.grat=false;s.shade=false;s.bw=.6;}if(was!=='ortho'&&s.proj==='ortho'){s.lat=40;s.grat=true;s.shade=true;s.bw=.5;}s.zoom=1;renderMePanel();drawMe();break;}
    case 'me-active':ME.active=+b.dataset.i;$$('.me-g').forEach((el,i)=>el.classList.toggle('on',i===ME.active));renderMeTools();break;
    case 'me-gadd':s.groups.push({name:'Новое государство',color:MAP_COLORS[s.groups.length%MAP_COLORS.length],countries:[],regions:[],prov:[]});ME.active=s.groups.length-1;renderMePanel();break;
    case 'me-gup':{e.stopPropagation();const i=+b.dataset.i;if(i>0){[s.groups[i-1],s.groups[i]]=[s.groups[i],s.groups[i-1]];if(ME.active===i)ME.active--;else if(ME.active===i-1)ME.active++;renderMePanel();drawMe();}break;}
    case 'me-gdel':e.stopPropagation();if(armed(b,'?')){s.groups.splice(+b.dataset.i,1);ME.active=Math.max(0,Math.min(ME.active,s.groups.length-1));renderMePanel();drawMe();}break;
    case 'me-tool':ME.tool=b.dataset.k;renderMeTools();break;
    case 'me-zoom':setZoom(s.zoom*+b.dataset.z);break;
    case 'me-unsplit':meUnsplit(b.dataset.k);break;
    case 'me-center':{const c=MapDraw.groupCentroid(s,ME.active,GEO);if(!c){toast('В выбранной группе пока ничего нет',true);break;}s.lon=Math.round(c[0]);if(s.proj==='ortho')s.lat=Math.round(Math.max(-60,Math.min(60,c[1])));syncSliders();drawMe();break;}
  }
});
document.addEventListener('input',e=>{
  const el=e.target;const s=ME.spec;if(!s||!el.closest('#me-panel'))return;
  if(el.id==='me-name'){ME.name=el.value;const t=$('#me-title');if(t)t.textContent=el.value;return;}
  if(el.id==='me-lon'||el.id==='me-lat'||el.id==='me-zoom'){s[el.id.slice(3)]=+el.value;syncSliders();if(el.id==='me-zoom'&&s.proj!=='ortho'&&!$('#me-lat')&&s.zoom>1)renderMePanel();drawMeSoon();return;}
  if(el.dataset.mg){const g=s.groups[+el.dataset.i];g[el.dataset.mg]=el.value;const lg=$('#me-legend');if(lg)lg.value=legendText();renderMeTools();if(el.dataset.mg==='color')drawMeSoon();return;}
  if(el.dataset.ms){const k=el.dataset.ms;s[k]=el.type==='checkbox'?el.checked:el.type==='number'?+el.value:el.value;drawMeSoon();return;}
});
document.addEventListener('change',e=>{
  const el=e.target;if(el.id!=='me-preset'||!el.value)return;const s=ME.spec;
  s.groups.push({name:el.value,color:MAP_COLORS[(s.groups.length+2)%MAP_COLORS.length],countries:MAP_PRESETS[el.value].split(' '),regions:[],prov:[]});ME.active=s.groups.length-1;
  el.value='';renderMePanel();drawMe();
});
document.addEventListener('keydown',e=>{if(e.code==='Space'&&$('#me-svg')&&!/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)){ME.space=true;e.preventDefault();}});
document.addEventListener('keyup',e=>{if(e.code==='Space')ME.space=false;});
document.addEventListener('contextmenu',e=>{if(e.target.closest('#me-svg'))e.preventDefault();});
/* перетаскивание, кисть и колесо на карте */
/* два пальца: масштаб щипком и сдвиг */
const PTRS=new Map();
function pinchState(){const [a,b]=[...PTRS.values()];return {d:Math.hypot(a.x-b.x,a.y-b.y),mx:(a.x+b.x)/2,my:(a.y+b.y)/2};}
function setZoom(z){const s=ME.spec;s.zoom=Math.max(1,Math.min(12,+z.toFixed(2)));if(s.proj!=='ortho'&&s.zoom>1&&!$('#me-lat'))renderMePanel();syncSliders();drawMeSoon();}
document.addEventListener('pointerdown',e=>{
  const box=e.target.closest('#me-svg');if(!box||!ME.spec||!GEO.countries)return;
  const svg=box.querySelector('svg');if(!svg)return;
  e.preventDefault();box.setPointerCapture(e.pointerId);
  PTRS.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(PTRS.size===2){
    // второй палец отменяет мазок и включает щипок
    if(ME.stroke){const st=ME.stroke;ME.stroke=null;if(st.changed){ME.spec.groups.forEach(compact);renderMePanel();}}
    ME.drag=null;const st=pinchState();
    ME.pinch={...st,zoom:ME.spec.zoom,lon:ME.spec.lon,lat:ME.spec.lat,k:svg.viewBox.baseVal.width/svg.getBoundingClientRect().width};return;
  }
  if(PTRS.size>2)return;
  const paint=['prov','region','erase'].includes(ME.tool)&&e.button===0&&!ME.space;
  const t=e.target;
  if(paint&&t.dataset.p){
    const g=ME.spec.groups[ME.active];
    if(!g&&ME.tool!=='erase'){toast('Сначала добавьте государство или союз',true);return;}
    let mode='add';
    if(ME.tool==='erase')mode='remove';
    else if(g&&MapDraw.owns(g,t.dataset.c,t.dataset.r,t.dataset.p))mode='remove';
    ME.stroke={mode,all:ME.tool==='erase',done:new Set(),changed:false};
    applyStroke(t);return;
  }
  ME.drag={x:e.clientX,y:e.clientY,lon:ME.spec.lon,lat:ME.spec.lat,moved:false,target:t,k:svg.viewBox.baseVal.width/svg.getBoundingClientRect().width,click:e.button===0&&!ME.space};
});
document.addEventListener('pointermove',e=>{
  if(PTRS.has(e.pointerId))PTRS.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(ME.pinch&&PTRS.size>=2){
    const q=ME.pinch,st=pinchState(),s=ME.spec;
    s.zoom=Math.max(1,Math.min(12,+(q.zoom*st.d/Math.max(10,q.d)).toFixed(2)));
    const {p}=MapDraw.projection(s);const deg=180/Math.PI/p.scale()*q.k;
    s.lon=((q.lon-(st.mx-q.mx)*deg+540)%360)-180;
    if(s.proj==='ortho'||s.zoom>1)s.lat=Math.max(-90,Math.min(90,q.lat+(st.my-q.my)*deg));
    if(s.proj!=='ortho'&&s.zoom>1&&!$('#me-lat'))renderMePanel();
    syncSliders();drawMeSoon();return;
  }
  if(ME.stroke){const el=document.elementFromPoint(e.clientX,e.clientY);if(el&&el.closest('#me-svg'))applyStroke(el);const h=$('#me-hover');if(h)h.textContent=featName(el)||' ';return;}
  if(ME.drag){
    const d=ME.drag,dx=e.clientX-d.x,dy=e.clientY-d.y;
    if(!d.moved&&Math.hypot(dx,dy)<4)return;d.moved=true;
    const s=ME.spec,{p}=MapDraw.projection(s);const deg=180/Math.PI/p.scale()*d.k;
    s.lon=((d.lon-dx*deg+540)%360)-180;
    if(s.proj==='ortho'||s.zoom>1)s.lat=Math.max(-90,Math.min(90,d.lat+dy*deg));
    syncSliders();drawMeSoon();return;
  }
  if(e.target.closest&&e.target.closest('#me-svg')&&GEO.countries){const h=$('#me-hover');if(h)h.textContent=featName(e.target)||' ';}
});
document.addEventListener('pointercancel',e=>{PTRS.delete(e.pointerId);if(PTRS.size<2)ME.pinch=null;});
document.addEventListener('pointerup',async e=>{
  PTRS.delete(e.pointerId);
  if(ME.pinch){if(PTRS.size<2)ME.pinch=null;return;}
  if(ME.stroke){const st=ME.stroke;ME.stroke=null;if(st.changed){ME.spec.groups.forEach(compact);renderMePanel();drawMe();}return;}
  const d=ME.drag;if(!d)return;ME.drag=null;
  if(d.moved||!d.click)return;
  const t=d.target,s=ME.spec,g=s.groups[ME.active];
  if(!t.dataset||!t.dataset.c)return;
  if(ME.tool==='country'){
    if(!g){toast('Сначала добавьте государство или союз',true);return;}
    if(t.dataset.p){toast('Эта страна разбита на провинции: закрашивайте кистью или соберите её обратно в списке слева');return;}
    const c=t.dataset.c;if(g.countries.includes(c))rm(g.countries,c);else g.countries.push(c);
    renderMePanel();drawMe();return;
  }
  if(['prov','region','erase'].includes(ME.tool)&&!t.dataset.p)splitCountry(t.dataset.c);
});
document.addEventListener('wheel',e=>{
  if(!e.target.closest('#me-svg')||!ME.spec)return;e.preventDefault();
  const s=ME.spec;s.zoom=Math.max(1,Math.min(12,+(s.zoom*(e.deltaY<0?1.15:1/1.15)).toFixed(2)));
  if(s.proj!=='ortho'&&s.zoom>1&&!$('#me-lat'))renderMePanel();syncSliders();drawMeSoon();
},{passive:false});
