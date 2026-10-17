'use strict';
/* Редактор карт: глобус и плоские карты, страны и регионы, государства и союзы разными цветами */

const GEO={countries:null,regions:null};
let geoLoading=null,regLoading=null;
async function loadGeo(withRegions){
  if(!GEO.countries){geoLoading=geoLoading||fetch('data/geo/countries.json').then(r=>{if(!r.ok)throw new Error('нет файла data/geo/countries.json');return r.json();});GEO.countries=await geoLoading;}
  if(withRegions&&!GEO.regions){regLoading=regLoading||fetch('data/geo/regions.json').then(r=>{if(!r.ok)throw new Error('нет файла data/geo/regions.json');return r.json();});GEO.regions=await regLoading;GEO._r=null;}
  return GEO;
}
const mapUsesRegions=m=>(m.split||[]).length>0;
/* Готовые карты хранятся как настройки; картинку рисуем при запуске сайта */
async function renderStoredMaps(){
  const maps=P.media.filter(m=>m.map);if(!maps.length||!window.MapDraw)return false;
  try{
    await loadGeo(maps.some(m=>mapUsesRegions(m.map)));
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

const ME={spec:null,name:'',orig:null,active:0,tool:'country',drag:null,raf:0};

function viewMapNew(){
  $('#main').classList.remove('is-main');
  const card=(k,t,d,img)=>`<button class="tcard mcard" data-act="map-start" data-k="${k}"><span class="mcard-img">${img}</span><b>${t}</b><span>${d}</span></button>`;
  const globe=`<svg viewBox="0 0 60 60" width="60" height="60"><circle cx="30" cy="30" r="27" fill="#fff" stroke="#999"/><path d="M14 22c6-6 14-8 20-4s10 2 12 8c-4 6-10 4-14 10s-12 4-14-2-8-6-4-12z" fill="#346733"/><path d="M3 30h54M30 3v54" stroke="#ccc" fill="none"/></svg>`;
  const flat=`<svg viewBox="0 0 90 46" width="90" height="46"><ellipse cx="45" cy="23" rx="43" ry="21" fill="#fff" stroke="#999"/><path d="M12 14h18v10H18zM40 10h10v8h-6v6h-6zM58 12h18v12H62zM24 28h8v10h-6zM46 26h8v10h-8zM66 30h8v6h-8z" fill="#c0c0c0"/><path d="M40 10h10v8h-6v6h-6zM66 30h8v6h-8z" fill="#1f93c0"/></svg>`;
  setView(mainMenuHTML(),shell({title:'Новая карта',content:`<p>Выберите вид карты. Потом щелчками по странам или регионам раскрасьте государства и союзы.</p><div class="tgrid">${card('globe','Глобус','Как в карточке статьи «Россия»: государство на глобусе, спорные земли светлее.',globe)}${card('flat','Плоская карта мира','Как у союзов и организаций: страны-участницы одним цветом.',flat)}</div>`}),'Новая карта');
}
async function viewMapEditor(name){
  $('#main').classList.remove('is-main');
  const m=name?P.media.find(x=>x.name===name&&x.map):null;
  if(name&&!m){setView(mainMenuHTML(),shell({title:'Карта не найдена',content:`<p>В медиатеке нет карты «${esc(name)}».</p><p><a class="btn pri" href="#/map/">Создать карту</a></p>`}),'Карта');return;}
  if(m){ME.spec=JSON.parse(JSON.stringify(m.map));ME.name=m.name;ME.orig=m.name;}
  else if(!ME.spec||ME.orig!==null){ME.spec=MapDraw.defaults(ME.kind||'globe');ME.name=uniqueName(ME.kind==='flat'?'Карта мира':'Карта');ME.orig=null;}
  ME.active=Math.min(ME.active,ME.spec.groups.length-1);if(ME.active<0)ME.active=0;
  setView('',shell({title:(m?'Карта: ':'Новая карта: ')+`<span id="me-title">${esc(ME.name)}</span>`,content:`<div class="mapedit"><div class="me-panel" id="me-panel"></div><div class="me-canvas"><div class="me-hover" id="me-hover">&nbsp;</div><div id="me-svg" class="me-svg"><p class="cnt">Загружаю карту мира…</p></div><p class="cnt me-help">Щелчок по стране добавляет её в выбранное государство или союз, повторный щелчок убирает. Карту можно таскать мышью или пальцем, колесо мыши меняет масштаб.</p></div></div>`,sub:false,foot:false}),'Редактор карт');
  document.body.classList.add('mode-edit');
  renderMePanel();
  try{await loadGeo(mapUsesRegions(ME.spec));}catch(e){$('#me-svg').innerHTML=`<p class="missing">Не удалось загрузить карту мира: ${esc(e.message)}. Редактор карт работает только на сайте или через локальный сервер, а не из файла на диске.</p>`;return;}
  drawMe();
}
function groupStat(g){const c=(g.countries||[]).length,r=(g.regions||[]).length;return [c?c+' '+plural(c,'страна','страны','стран'):'',r?r+' '+plural(r,'регион','региона','регионов'):''].filter(Boolean).join(', ')||'пусто';}
function renderMePanel(){
  const s=ME.spec;const pr=MapDraw.PROJ;
  const cname=id=>GEO.countries?((MapDraw.prepare(GEO)._cById[id]||{}).properties||{}).ru||id:id;
  $('#me-panel').innerHTML=`
  <div class="ed-top"><button class="btn pri" data-act="map-save">Сохранить карту</button><a class="btn" href="${ME.target?'#/edit/'+ME.target.pageId:'#/media'}">Отмена</a></div>
  <label class="fld"><span>Имя в медиатеке</span><input id="me-name" value="${esc(ME.name)}"></label>
  <fieldset class="grp"><legend>Вид</legend>
    <div class="seg">${Object.entries(pr).map(([k,v])=>`<button class="${s.proj===k?'on':''}" data-act="me-proj" data-k="${k}">${v.name}</button>`).join('')}</div>
    <label class="fld"><span>Долгота центра: <b id="me-lon-v">${Math.round(s.lon)}°</b></span><input type="range" id="me-lon" min="-180" max="180" step="1" value="${s.lon}"></label>
    ${s.proj==='ortho'||s.zoom>1?`<label class="fld"><span>Широта центра: <b id="me-lat-v">${Math.round(s.lat)}°</b></span><input type="range" id="me-lat" min="-90" max="90" step="1" value="${s.lat}"></label>`:''}
    <label class="fld"><span>Масштаб: <b id="me-zoom-v">${(+s.zoom).toFixed(1)}×</b></span><input type="range" id="me-zoom" min="1" max="8" step="0.1" value="${s.zoom}"></label>
    <div><button class="btn sm" data-act="me-center">Повернуть к выбранному государству</button></div>
  </fieldset>
  <fieldset class="grp"><legend>Государства и союзы</legend>
    <div class="me-groups">${s.groups.map((g,i)=>`<div class="me-g${i===ME.active?' on':''}"><label class="me-g-pick"><input type="radio" name="me-active" data-act="me-active" data-i="${i}"${i===ME.active?' checked':''} aria-label="Раскрашивать этим цветом"></label><input type="color" value="${esc(g.color)}" data-mg="color" data-i="${i}" aria-label="Цвет"><div class="me-g-txt"><input value="${esc(g.name)}" data-mg="name" data-i="${i}" aria-label="Название"><span class="cnt">${groupStat(g)}</span></div><button class="ic x" data-act="me-gdel" data-i="${i}" aria-label="Удалить">✕</button></div>`).join('')}</div>
    <div class="line"><button class="btn sm" data-act="me-gadd">+ государство или союз</button>
    <select id="me-preset" aria-label="Готовый союз"><option value="">Готовый союз…</option>${Object.keys(MAP_PRESETS).map(k=>`<option>${k}</option>`).join('')}</select></div>
    <p class="cnt">Щелчки по карте добавляют страны в отмеченную группу. Если группы пересекаются, сверху рисуется та, что ниже в списке.</p>
  </fieldset>
  <fieldset class="grp"><legend>Что раскрашивать</legend>
    <div class="seg"><button class="${ME.tool==='country'?'on':''}" data-act="me-tool" data-k="country">Страны целиком</button><button class="${ME.tool==='region'?'on':''}" data-act="me-tool" data-k="region">Регионы (новые границы)</button></div>
    <p class="cnt">${ME.tool==='region'?'Щёлкните по стране, чтобы разбить её на регионы. Потом щелчками по регионам собирайте новое государство. Его граница с остальной страной нарисуется сама.':'Чтобы провести новую границу внутри страны, переключитесь на «Регионы».'}</p>
    ${(s.split||[]).length?`<div class="chips">${s.split.map(c=>`<span class="chip on">${esc(cname(c))} <button class="ic x" data-act="me-unsplit" data-k="${c}" aria-label="Собрать страну обратно">✕</button></span>`).join('')}</div>`:''}
  </fieldset>
  <fieldset class="grp"><legend>Оформление</legend>
    <div class="line"><label class="inl">Суша <input type="color" data-ms="land" value="${s.land}"></label><label class="inl">Границы <input type="color" data-ms="border" value="${s.border}"></label><label class="inl">Океан <input type="color" data-ms="ocean" value="${s.ocean}"></label></div>
    <div class="line"><label class="inl"><input type="checkbox" data-ms="grat"${s.grat?' checked':''}> сетка</label>${s.proj==='ortho'?`<label class="inl"><input type="checkbox" data-ms="shade"${s.shade?' checked':''}> объём</label>`:''}<label class="inl"><input type="checkbox" data-ms="lakes"${s.lakes?' checked':''}> озёра</label><label class="inl">Толщина границ <input type="number" data-ms="bw" min="0" max="3" step="0.1" value="${s.bw}"></label></div>
  </fieldset>
  <fieldset class="grp"><legend>Подпись с легендой</legend>
    <p class="cnt">Вставьте в подпись картинки в карточке:</p>
    <textarea class="mono" rows="3" readonly id="me-legend">${esc(s.groups.map(g=>`{{цвет|${g.color}}} ${g.name}`).join('<br>'))}</textarea>
  </fieldset>`;
}
function drawMe(){
  if(!GEO.countries)return;const box=$('#me-svg');if(!box)return;
  try{box.innerHTML=MapDraw.drawMap(ME.spec,GEO,{interactive:true});}catch(e){box.innerHTML=`<p class="missing">Ошибка рисования: ${esc(e.message)}</p>`;}
}
function drawMeSoon(){if(ME.raf)return;ME.raf=requestAnimationFrame(()=>{ME.raf=0;drawMe();});}
function syncSliders(){const s=ME.spec;for(const k of ['lon','lat','zoom']){const el=$('#me-'+k);if(el)el.value=s[k];const v=$('#me-'+k+'-v');if(v)v.textContent=k==='zoom'?(+s.zoom).toFixed(1)+'×':Math.round(s[k])+'°';}}
function featName(t){
  const g=MapDraw.prepare(GEO);
  if(t.dataset.c){const f=g._cById[t.dataset.c];return f?f.properties.ru:t.dataset.c;}
  if(t.dataset.r){const f=g._rById[t.dataset.r];const c=g._cById[t.dataset.rc];return (f?f.properties.ru||f.properties.en:'')+(c?', '+c.properties.ru:'');}
  return '';
}
function toggleIn(arr,v){const i=arr.indexOf(v);if(i<0)arr.push(v);else arr.splice(i,1);}
async function meClick(t){
  const s=ME.spec;const g=s.groups[ME.active];
  if(t.dataset.c){
    const c=t.dataset.c;
    if(ME.tool==='region'){
      $('#me-hover').textContent='Загружаю регионы…';
      try{await loadGeo(true);}catch(e){toast('Не удалось загрузить регионы: '+e.message,true);return;}
      MapDraw.prepare(GEO);
      if(!GEO._rByC[c]){toast('Для этой страны нет деления на регионы',true);return;}
      s.split=s.split||[];if(!s.split.includes(c))s.split.push(c);
      renderMePanel();drawMe();return;
    }
    if(!g){toast('Сначала добавьте государство или союз',true);return;}
    toggleIn(g.countries,c);
  }else if(t.dataset.r){
    if(!g){toast('Сначала добавьте государство или союз',true);return;}
    const r=t.dataset.r,c=t.dataset.rc;
    if(g.countries.includes(c)){g.countries.splice(g.countries.indexOf(c),1);g.regions.push(...GEO._rByC[c].map(f=>f.properties.id).filter(id=>id!==r&&!g.regions.includes(id)));}
    else toggleIn(g.regions,r);
  }else return;
  renderMePanel();drawMe();
}
function meUnsplit(c){
  const s=ME.spec;MapDraw.prepare(GEO);const ids=new Set((GEO._rByC&&GEO._rByC[c]||[]).map(f=>f.properties.id));
  for(const g of s.groups){const mine=g.regions.filter(r=>ids.has(r));if(mine.length&&mine.length===ids.size&&!g.countries.includes(c))g.countries.push(c);g.regions=g.regions.filter(r=>!ids.has(r));}
  s.split=s.split.filter(x=>x!==c);renderMePanel();drawMe();
}
async function meSave(){
  const s=ME.spec;let name=($('#me-name').value||'').trim()||'Карта';
  const clash=P.media.find(m=>m.name===name&&m.name!==ME.orig);
  if(clash){toast('В медиатеке уже есть «'+name+'». Выберите другое имя.',true);return;}
  try{await loadGeo(mapUsesRegions(s));}catch(e){toast(e.message,true);return;}
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
  switch(a){
    case 'map-start':ME.kind=b.dataset.k;ME.spec=null;ME.orig=null;location.hash='#/map/new';break;
    case 'map-for':{const pg=edPage;if(!pg)break;ME.target={pageId:pg.id,path:b.dataset.path};ME.spec=null;ME.orig=null;location.hash='#/map/';break;}
    case 'map-save':meSave();break;
    case 'me-proj':{const was=s.proj;s.proj=b.dataset.k;if(was==='ortho'&&s.proj!=='ortho'){s.lat=0;s.grat=false;s.shade=false;s.bw=.6;}if(was!=='ortho'&&s.proj==='ortho'){s.lat=40;s.grat=true;s.shade=true;s.bw=.5;}s.zoom=1;renderMePanel();drawMe();break;}
    case 'me-active':ME.active=+b.dataset.i;renderMePanel();break;
    case 'me-gadd':s.groups.push({name:'Новая группа',color:MAP_COLORS[s.groups.length%MAP_COLORS.length],countries:[],regions:[]});ME.active=s.groups.length-1;renderMePanel();break;
    case 'me-gdel':if(armed(b,'Точно?')){s.groups.splice(+b.dataset.i,1);ME.active=Math.max(0,Math.min(ME.active,s.groups.length-1));renderMePanel();drawMe();}break;
    case 'me-tool':ME.tool=b.dataset.k;renderMePanel();break;
    case 'me-unsplit':meUnsplit(b.dataset.k);break;
    case 'me-center':{const c=MapDraw.groupCentroid(s,ME.active,GEO);if(!c){toast('В выбранной группе пока нет стран',true);break;}s.lon=Math.round(c[0]);if(s.proj==='ortho')s.lat=Math.round(Math.max(-60,Math.min(60,c[1])));syncSliders();drawMe();break;}
  }
});
document.addEventListener('input',e=>{
  const el=e.target;const s=ME.spec;if(!s||!el.closest('#me-panel'))return;
  if(el.id==='me-name'){ME.name=el.value;const t=$('#me-title');if(t)t.textContent=el.value;return;}
  if(el.id==='me-lon'||el.id==='me-lat'||el.id==='me-zoom'){s[el.id.slice(3)]=+el.value;syncSliders();if(el.id==='me-zoom'&&s.proj!=='ortho'&&!$('#me-lat')&&s.zoom>1)renderMePanel();drawMeSoon();return;}
  if(el.dataset.mg){const g=s.groups[+el.dataset.i];g[el.dataset.mg]=el.value;const lg=$('#me-legend');if(lg)lg.value=s.groups.map(g=>`{{цвет|${g.color}}} ${g.name}`).join('<br>');if(el.dataset.mg==='color')drawMeSoon();return;}
  if(el.dataset.ms){const k=el.dataset.ms;s[k]=el.type==='checkbox'?el.checked:el.type==='number'?+el.value:el.value;drawMeSoon();return;}
});
document.addEventListener('change',e=>{
  const el=e.target;if(el.id!=='me-preset'||!el.value)return;const s=ME.spec;
  const codes=MAP_PRESETS[el.value].split(' ');
  s.groups.push({name:el.value,color:MAP_COLORS[(s.groups.length+2)%MAP_COLORS.length],countries:codes,regions:[]});ME.active=s.groups.length-1;
  renderMePanel();drawMe();
});
/* перетаскивание, щелчки и колесо на карте */
document.addEventListener('pointerdown',e=>{
  const box=e.target.closest('#me-svg');if(!box||!ME.spec||!GEO.countries)return;
  const svg=box.querySelector('svg');if(!svg)return;
  ME.drag={x:e.clientX,y:e.clientY,lon:ME.spec.lon,lat:ME.spec.lat,moved:false,target:e.target,k:svg.viewBox.baseVal.width/svg.getBoundingClientRect().width};
  box.setPointerCapture(e.pointerId);
});
document.addEventListener('pointermove',e=>{
  const box=e.target.closest&&e.target.closest('#me-svg');
  if(ME.drag){
    const d=ME.drag,dx=e.clientX-d.x,dy=e.clientY-d.y;
    if(!d.moved&&Math.hypot(dx,dy)<4)return;d.moved=true;
    const s=ME.spec,{p}=MapDraw.projection(s);const deg=180/Math.PI/p.scale()*d.k;
    s.lon=((d.lon-dx*deg+540)%360)-180;
    if(s.proj==='ortho'||s.zoom>1)s.lat=Math.max(-90,Math.min(90,d.lat+dy*deg));
    syncSliders();drawMeSoon();return;
  }
  if(box&&GEO.countries){const h=$('#me-hover');if(h)h.textContent=featName(e.target)||' ';}
});
document.addEventListener('pointerup',e=>{
  const d=ME.drag;if(!d)return;ME.drag=null;
  if(!d.moved)meClick(d.target);
});
document.addEventListener('wheel',e=>{
  if(!e.target.closest('#me-svg')||!ME.spec)return;e.preventDefault();
  const s=ME.spec;s.zoom=Math.max(1,Math.min(8,+(s.zoom*(e.deltaY<0?1.15:1/1.15)).toFixed(2)));
  if(s.proj!=='ortho'&&s.zoom>1&&!$('#me-lat'))renderMePanel();syncSliders();drawMeSoon();
},{passive:false});
