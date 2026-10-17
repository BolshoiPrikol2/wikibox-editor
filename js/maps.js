'use strict';
/* Редактор карт: основа (современные границы или шаблон по году), государства и союзы цветами,
   провинции, передача провинций между государствами, разрез и объединение провинций */

const GEO={countries:null,prov:{},tpl:{},names:null,tplIndex:null};
const GV='?v=14';
const geoJobs={};
function fetchJSON(url){return geoJobs[url]=geoJobs[url]||fetch(url).then(r=>{if(!r.ok)throw new Error('нет файла '+url);return r.json();});}
async function loadTplIndex(){if(!GEO.tplIndex){try{GEO.tplIndex=await fetchJSON('data/geo/tpl/index.json'+GV);}catch(e){GEO.tplIndex={years:[]};}}return GEO.tplIndex;}
/* Загрузить всё, что нужно для карты: основу, шаблон и файлы провинций разбитых государств */
async function loadFor(spec,extraUnits){
  if(!GEO.countries)GEO.countries=await fetchJSON('data/geo/countries.json'+GV);
  if(spec&&spec.base&&!GEO.tpl[spec.base])GEO.tpl[spec.base]=await fetchJSON('data/geo/tpl/'+spec.base+'.json'+GV);
  const units=[...((spec&&spec.split)||[]),...(extraUnits||[])];
  if(!units.length)return GEO;
  if(!GEO.names)GEO.names=await fetchJSON('data/geo/prov/index.json'+GV);
  const files=[...new Set(units.flatMap(u=>MapDraw.filesFor(GEO,spec,u)))].filter(c=>GEO.names.c[c]&&!GEO.prov[c]);
  await Promise.all(files.map(async c=>{GEO.prov[c]=await fetchJSON('data/geo/prov/'+c+'.json'+GV);}));
  return GEO;
}
/* Готовые карты хранятся как настройки; картинку рисуем при запуске сайта */
async function renderStoredMaps(){
  const maps=P.media.filter(m=>m.map);if(!maps.length||!window.MapDraw)return false;
  try{
    for(const m of maps){await loadFor(m.map);m.src=svgURI(MapDraw.drawMap(m.map,GEO));}
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
  country:['Страны','Щелчок добавляет государство целиком в отмеченную группу или убирает его. Так удобно собирать союзы вроде ЕС.'],
  prov:['Кисть','Щёлкните по государству, чтобы разбить его на провинции, потом закрашивайте их цветом группы, проводя мышью. Провинция принадлежит только одной группе. Если повести кистью по уже закрашенной провинции, она станет прежней.'],
  region:['Регион целиком','Щелчок закрашивает целую область, штат или провинцию первого уровня.'],
  erase:['Ластик','Проведите мышью, чтобы освободить провинции от любых групп.'],
  owner:['Границы государств','',1],
  cut:['Разрезать','Проведите линию через провинции насквозь, и они разделятся по ней. Чтобы сдвинуть границу, отрежьте кусок и присоедините его к соседу инструментом «Объединить».',1],
  lasso:['Новая провинция','Обведите область: она станет отдельной провинцией выбранной группы, а соседние провинции станут меньше.',1],
  merge:['Объединить','Щёлкайте по провинциям одной страны, потом нажмите «Объединить выбранные».',1],
};

const ME={spec:null,name:'',orig:null,active:0,tool:'prov',drag:null,raf:0,stroke:null,space:false,draft:null,sel:new Map(),ownT:'',ownMode:'pick'};
const S=()=>ME.spec;
function normSpec(s){
  for(const g of s.groups){g.countries=g.countries||[];g.regions=g.regions||[];g.prov=g.prov||[];}
  s.split=s.split||[];s.owner=s.owner||{};s.states=s.states||{};s.base=s.base||'';
  return s;
}

function viewMapNew(){
  $('#main').classList.remove('is-main');
  const card=(k,t,d,img)=>`<button class="tcard mcard" data-act="map-start" data-k="${k}"><span class="mcard-img">${img}</span><b>${t}</b><span>${d}</span></button>`;
  const globe=`<svg viewBox="0 0 60 60" width="60" height="60"><circle cx="30" cy="30" r="27" fill="#fff" stroke="#999"/><path d="M14 22c6-6 14-8 20-4s10 2 12 8c-4 6-10 4-14 10s-12 4-14-2-8-6-4-12z" fill="#346733"/><path d="M3 30h54M30 3v54" stroke="#ccc" fill="none"/></svg>`;
  const flat=`<svg viewBox="0 0 90 46" width="90" height="46"><ellipse cx="45" cy="23" rx="43" ry="21" fill="#fff" stroke="#999"/><path d="M12 14h18v10H18zM40 10h10v8h-6v6h-6zM58 12h18v12H62zM24 28h8v10h-6zM46 26h8v10h-8zM66 30h8v6h-8z" fill="#c0c0c0"/><path d="M40 10h10v8h-6v6h-6zM66 30h8v6h-8z" fill="#1f93c0"/></svg>`;
  setView(mainMenuHTML(),shell({title:'Новая карта',content:`<p>Выберите вид карты. Основу можно взять современную или из шаблона по году, а потом перекроить границы и раскрасить государства и союзы.</p><div class="tgrid">${card('globe','Глобус','Как в карточке статьи «Россия»: государство на глобусе, спорные земли светлее.',globe)}${card('flat','Плоская карта мира','Как у союзов и организаций: страны-участницы одним цветом.',flat)}</div>`}),'Новая карта');
}
async function viewMapEditor(name){
  $('#main').classList.remove('is-main');
  const m=name?P.media.find(x=>x.name===name&&x.map):null;
  if(name&&!m){setView(mainMenuHTML(),shell({title:'Карта не найдена',content:`<p>В медиатеке нет карты «${esc(name)}».</p><p><a class="btn pri" href="#/map/">Создать карту</a></p>`}),'Карта');return;}
  if(m){ME.spec=JSON.parse(JSON.stringify(m.map));ME.name=m.name;ME.orig=m.name;}
  else if(!ME.spec||ME.orig!==null){ME.spec=MapDraw.defaults(ME.kind||'globe');ME.name=uniqueName(ME.kind==='flat'?'Карта мира':'Карта');ME.orig=null;}
  normSpec(ME.spec);
  ME.active=Math.max(0,Math.min(ME.active,ME.spec.groups.length-1));ME.sel.clear();ME.ownT='';
  setView('',shell({title:(m?'Карта: ':'Новая карта: ')+`<span id="me-title">${esc(ME.name)}</span>`,content:`<div class="mapedit"><div class="me-panel" id="me-panel"></div><div class="me-canvas"><div class="me-tools" id="me-tools"></div><div class="me-hover" id="me-hover">&nbsp;</div><div id="me-svg" class="me-svg"><p class="cnt">Загружаю карту мира…</p></div><p class="cnt me-help" id="me-help"></p></div></div>`,sub:false,foot:false}),'Редактор карт');
  document.body.classList.add('mode-edit');
  await loadTplIndex();
  renderMePanel();
  try{await loadFor(ME.spec);}catch(e){$('#me-svg').innerHTML=`<p class="missing">Не удалось загрузить карту мира: ${esc(e.message)}. Редактор карт работает только на сайте или через локальный сервер, а не из файла на диске.</p>`;return;}
  renderMePanel();drawMe();
}
const uname=u=>GEO.countries?MapDraw.unitName(GEO,S(),u):u;
const cname=c=>{const f=GEO.countries&&MapDraw.prepare(GEO)._cById[c];return f?f.properties.ru:c;};
const SD=()=>GEO.countries?MapDraw.splitData(GEO,S()):null;
const PV=cid=>MapDraw.provFor(GEO,cid,S());
function provCount(g){
  let n=(g.prov||[]).length;
  for(const r of g.regions||[]){const c=GEO.names&&GEO.names.r[r]&&GEO.names.r[r][1];const Pp=c&&GEO.prov[c]&&PV(c);n+=Pp&&Pp.byRegion[r]?Pp.byRegion[r].length:1;}
  return n;
}
function groupStat(g){const c=(g.countries||[]).length,p=provCount(g);return [c?c+' '+plural(c,'государство','государства','государств'):'',p?p+' '+plural(p,'провинция','провинции','провинций'):''].filter(Boolean).join(' и ')||'пока пусто';}
/* Список государств для выбора владельца земель */
function unitOptions(){
  const s=S();const T=MapDraw.tplOf(GEO,s);let list;
  if(T)list=T.units.filter(Boolean).map(u=>[u.id,u.ru]);
  else list=(GEO.countries?MapDraw.prepare(GEO)._c:[]).map(f=>[f.properties.id,f.properties.ru]);
  list.sort((a,b)=>a[1].localeCompare(b[1],'ru'));
  const custom=Object.entries(s.states).map(([id,v])=>[id,v.name+' (новое)']);
  return [...custom,...list];
}
function renderMeTools(){
  const t=$('#me-tools');if(!t)return;const s=S();
  const tb=list=>list.map(([k,v])=>`<button class="${ME.tool===k?'on':''}" data-act="me-tool" data-k="${k}">${v[0]}</button>`).join('');
  let extra='';
  if(ME.tool==='merge')extra=`<button class="btn sm pri" data-act="me-merge"${ME.sel.size<2?' disabled':''}>Объединить выбранные (${ME.sel.size})</button>${ME.sel.size?'<button class="btn sm" data-act="me-unsel">Снять выбор</button>':''}`;
  if(ME.tool==='owner'){
    const om=(k,l)=>`<button class="${ME.ownMode===k?'on':''}" data-act="me-ownmode" data-k="${k}">${l}</button>`;
    const st=Object.entries(s.states);
    extra=`<div class="me-own">
      <div class="seg">${om('pick','1. Выбрать на карте')}${om('paint','2. Передавать земли')}${om('lasso','Обвести новую страну')}</div>
      <span class="me-target">${ME.ownT?`Земли отходят: <b>${esc(uname(ME.ownT))}</b>`:'Государство не выбрано'}</span>
      <label class="inl">или из списка: <select id="me-own"><option value="">—</option>${unitOptions().map(([id,n])=>`<option value="${esc(id)}"${id===ME.ownT?' selected':''}>${esc(n)}</option>`).join('')}</select></label>
      <button class="btn sm" data-act="me-addstate">+ Новая страна</button>
      ${Object.keys(s.owner).length?`<button class="btn sm danger" data-act="me-ownreset">Вернуть все границы</button>`:''}
      ${st.length?`<div class="me-states"><span class="cnt">Новые страны:</span>${st.map(([id,v])=>`<span class="me-state${id===ME.ownT?' on':''}"><input value="${esc(v.name)}" data-state="${id}" aria-label="Название страны"><button class="ic" data-act="me-pickstate" data-k="${id}" title="Передавать земли этой стране" aria-label="Выбрать">✎</button><button class="ic x" data-act="me-delstate" data-k="${id}" title="Удалить страну" aria-label="Удалить">✕</button></span>`).join('')}</div>`:''}
    </div>`;
  }
  t.innerHTML=`<div class="seg">${tb(Object.entries(MAP_TOOLS).filter(([k,v])=>!v[2]))}</div>
    <span class="me-tl">Границы:</span><div class="seg">${tb(Object.entries(MAP_TOOLS).filter(([k,v])=>v[2]))}</div>
    <div class="seg"><button data-act="me-zoom" data-z="1.5" aria-label="Приблизить" title="Приблизить">+</button><button data-act="me-zoom" data-z="0.667" aria-label="Отдалить" title="Отдалить">−</button></div>
    ${ME.tool==='owner'?'':`<span class="me-active">Цвет кисти: ${s.groups[ME.active]?`<span class="legend-color" style="background:${esc(s.groups[ME.active].color)}"></span> ${esc(s.groups[ME.active].name)}`:'нет групп'}</span>`}
    ${extra}`;
  const help=ME.tool==='owner'?{pick:'Щёлкните по государству, которому хотите отдать земли. Потом режим сам переключится на передачу.',paint:'Проводите мышью по провинциям: они отойдут выбранному государству, граница перерисуется. С Shift — целый регион. Чтобы выбрать другое государство, нажмите «1. Выбрать на карте» или щёлкните по нему с Alt.',lasso:'Обведите мышью область: все провинции внутри станут новой страной. Название потом можно поменять в списке «Новые страны».'}[ME.ownMode]:MAP_TOOLS[ME.tool][1];
  const h=$('#me-help');if(h)h.textContent=help+(ME.tool!=='pan'?' Двигать и приближать карту: правой кнопкой мыши, с зажатым пробелом или двумя пальцами.':'');
}
function renderMePanel(){
  const s=S();const pr=MapDraw.PROJ;const years=(GEO.tplIndex&&GEO.tplIndex.years)||[];
  const editedFiles=Object.entries(s.pedit||{}).filter(([c,e])=>e&&(e.del.length||e.add.length)).map(([c])=>c);
  $('#me-panel').innerHTML=`
  <div class="ed-top"><button class="btn pri" data-act="map-save">Сохранить карту</button><a class="btn" href="${ME.target?'#/edit/'+ME.target.pageId:'#/media'}">Отмена</a></div>
  <label class="fld"><span>Имя в медиатеке</span><input id="me-name" value="${esc(ME.name)}"></label>
  <fieldset class="grp"><legend>Основа карты</legend>
    <select id="me-base" aria-label="Основа карты"><option value="">Современные границы</option>${years.map(y=>`<option value="${y}"${String(y)===String(s.base)?' selected':''}>Границы ${y} года</option>`).join('')}</select>
    ${s.base?`<p class="cnt">Исторические границы: <a class="external" href="https://github.com/aourednik/historical-basemaps" target="_blank" rel="noopener">historical-basemaps</a> (А. Уреднек, GPL-3.0), разложены по провинциям — их можно перекраивать.</p>`:''}
  </fieldset>
  <fieldset class="grp"><legend>Государства и союзы (цвета)</legend>
    <div class="me-groups">${s.groups.map((g,i)=>`<div class="me-g${i===ME.active?' on':''}" data-act="me-active" data-i="${i}"><input type="color" value="${esc(g.color)}" data-mg="color" data-i="${i}" aria-label="Цвет"><div class="me-g-txt"><input value="${esc(g.name)}" data-mg="name" data-i="${i}" aria-label="Название"><span class="cnt">${groupStat(g)}</span></div><span class="me-g-btns"><button class="ic" data-act="me-gup" data-i="${i}" aria-label="Выше" title="Рисовать ниже других">↑</button><button class="ic x" data-act="me-gdel" data-i="${i}" aria-label="Удалить">✕</button></span></div>`).join('')}</div>
    <div class="line"><button class="btn sm" data-act="me-gadd">+ государство или союз</button>
    ${s.base?'':`<select id="me-preset" aria-label="Готовый союз"><option value="">Готовый союз…</option>${Object.keys(MAP_PRESETS).map(k=>`<option>${k}</option>`).join('')}</select>`}</div>
    <p class="cnt">Щёлкните по группе, чтобы рисовать её цветом. Если союзы пересекаются, сверху рисуется тот, что ниже в списке.</p>
  </fieldset>
  ${s.split.length?`<fieldset class="grp"><legend>Разбиты на провинции</legend><div class="chips">${s.split.map(u=>`<span class="chip on">${esc(uname(u))} <button class="ic x" data-act="me-unsplit" data-k="${esc(u)}" aria-label="Собрать обратно" title="Собрать обратно">✕</button></span>`).join('')}</div>
    ${editedFiles.length?`<p class="cnt">Изменены границы провинций: ${editedFiles.map(c=>`${esc(cname(c))} <button class="ic" data-act="me-preset-reset" data-k="${c}" title="Вернуть исходные провинции" aria-label="Вернуть исходные провинции">⟲</button>`).join(' ')}</p>`:''}</fieldset>`:''}
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
const legendText=()=>S().groups.map(g=>`{{цвет|${g.color}}} ${g.name}`).join('<br>');
function drawMe(){
  if(!GEO.countries)return;const box=$('#me-svg');if(!box)return;
  try{box.innerHTML=MapDraw.drawMap(S(),GEO,{interactive:true,hl:ME.tool==='owner'?ME.ownT:''});}catch(e){console.error(e);box.innerHTML=`<p class="missing">Ошибка рисования: ${esc(e.message)}</p>`;return;}
  for(const id of ME.sel.keys()){const el=box.querySelector(`path[data-p="${CSS.escape(id)}"]`);if(el)el.classList.add('sel');else ME.sel.delete(id);}
  drawDraft();
}
function drawDraft(){
  const svg=$('#me-svg svg');if(!svg)return;const old=svg.querySelector('#me-draft');if(old)old.remove();
  const d=ME.draft;if(!d||d.pts.length<2)return;
  const {p}=MapDraw.projection(S());const xy=d.pts.map(q=>p(q)).filter(q=>q&&isFinite(q[0]));if(xy.length<2)return;
  const lasso=ME.tool==='lasso'||(ME.tool==='owner'&&ME.ownMode==='lasso');
  svg.insertAdjacentHTML('beforeend',`<path id="me-draft" d="M${xy.map(q=>q[0].toFixed(1)+','+q[1].toFixed(1)).join('L')}${lasso?'Z':''}" fill="${lasso?'rgba(215,51,51,.15)':'none'}" stroke="#d33" stroke-width="2" stroke-dasharray="6 4" pointer-events="none"/>`);
}
function clientToGeo(e){
  const svg=$('#me-svg svg');if(!svg)return null;
  // учитываем, что картинка может быть вписана в рамку со сдвигом
  const m=svg.getScreenCTM();if(!m)return null;const pt=new DOMPoint(e.clientX,e.clientY).matrixTransform(m.inverse());
  const {p}=MapDraw.projection(S());const g=p.invert([pt.x,pt.y]);
  return g&&isFinite(g[0])&&isFinite(g[1])?[+g[0].toFixed(5),+g[1].toFixed(5)]:null;
}
function drawMeSoon(){if(ME.raf)return;ME.raf=requestAnimationFrame(()=>{ME.raf=0;drawMe();});}
function syncSliders(){const s=S();for(const k of ['lon','lat','zoom']){const el=$('#me-'+k);if(el)el.value=s[k];const v=$('#me-'+k+'-v');if(v)v.textContent=k==='zoom'?(+s.zoom).toFixed(1)+'×':Math.round(s[k])+'°';}}
function featName(t){
  if(!t||!t.dataset)return '';
  if(t.dataset.p){const r=GEO.names&&GEO.names.r[t.dataset.r];const n=t.dataset.p.slice(t.dataset.p.lastIndexOf('.')+1);
    const label=n[0]==='n'?'Новая провинция':/^\d+$/.test(n)?'Провинция '+(+n+1):'Часть провинции '+(+n.split('~')[0]+1);
    return `${label} · ${r?r[0]:''} · ${uname(t.dataset.u)}`;}
  if(t.dataset.u)return uname(t.dataset.u);
  return '';
}

/* ---- принадлежность провинций группам (цветам) ---- */
function rm(arr,v){const i=arr.indexOf(v);if(i>=0)arr.splice(i,1);}
function unitToProv(g,u,except){
  // государство целиком в группе → перечислить его провинции поштучно
  rm(g.countries,u);const D=SD();if(!D)return;
  for(const f of D.feats)if(MapDraw.ownerOf(GEO,S(),f)===u&&f.properties.id!==except&&!g.prov.includes(f.properties.id))g.prov.push(f.properties.id);
}
function detachProv(g,u,c,r,p){
  if(g.countries.includes(u))unitToProv(g,u,p);
  if(g.regions.includes(r)){rm(g.regions,r);for(const q of PV(c).byRegion[r]||[])if(q!==p&&!g.prov.includes(q))g.prov.push(q);}
  rm(g.prov,p);
}
function detachRegion(g,u,c,r){
  if(g.countries.includes(u))unitToProv(g,u);
  rm(g.regions,r);const set=new Set(PV(c).byRegion[r]||[]);g.prov=g.prov.filter(p=>!set.has(p));
}
function claimProv(g,u,c,r,p){
  for(const o of S().groups)if(o!==g&&MapDraw.owns(o,u,r,p))detachProv(o,u,c,r,p);
  if(!MapDraw.owns(g,u,r,p))g.prov.push(p);
}
function claimRegion(g,u,c,r){
  const provs=PV(c).byRegion[r]||[];
  for(const o of S().groups)if(o!==g&&(o.countries.includes(u)||o.regions.includes(r)||provs.some(p=>o.prov.includes(p))))detachRegion(o,u,c,r);
  if(g.countries.includes(u))return;
  const set=new Set(provs);g.prov=g.prov.filter(p=>!set.has(p));if(!g.regions.includes(r))g.regions.push(r);
}
function compact(g){
  // все провинции региона закрашены — храним регион целиком
  const byR={};for(const p of g.prov){const r=p.slice(0,p.lastIndexOf('.'));(byR[r]=byR[r]||[]).push(p);}
  for(const r in byR){const c=GEO.names&&GEO.names.r[r]&&GEO.names.r[r][1];const Pp=c&&GEO.prov[c]&&PV(c);if(Pp&&Pp.byRegion[r]&&byR[r].length===Pp.byRegion[r].length){const set=new Set(byR[r]);g.prov=g.prov.filter(p=>!set.has(p));g.regions.push(r);}}
}
function recolor(paths){const s=S();for(const el of paths)el.setAttribute('fill',MapDraw.colorOf(s,el.dataset.u,el.dataset.r,el.dataset.p)||s.land);}
/* ---- владельцы провинций (государственные границы) ---- */
function setOwner(pid,target){
  const s=S();const D=SD();const f=D&&D.byId[pid];if(!f)return false;
  const base=f.properties.u;const cur=s.owner[pid]||base;if(cur===target)return false;
  if(target===base)delete s.owner[pid];else s.owner[pid]=target;
  s.ownerV=(s.ownerV||0)+1;return true;
}
function applyStroke(el){
  const st=ME.stroke;if(!st||!el||!el.dataset.p)return;
  const s=S(),g=s.groups[ME.active];const {c,r,p,u}=el.dataset;
  if(st.owner){
    const key=st.region?r:p;if(st.done.has(key))return;st.done.add(key);
    const els=st.region?$$(`#me-svg path[data-r="${CSS.escape(r)}"]`):[el];
    for(const x of els)if(setOwner(x.dataset.p,ME.ownT)){x.dataset.u=ME.ownT;x.classList.add('tgt');st.changed=true;}
    recolor(els);return;
  }
  if(ME.tool==='region'){
    if(st.done.has(r))return;st.done.add(r);
    if(st.mode==='add')claimRegion(g,u,c,r);else for(const o of s.groups)if(st.all||o===g)detachRegion(o,u,c,r);
    recolor($$(`#me-svg path[data-r="${CSS.escape(r)}"]`));
  }else{
    if(st.done.has(p))return;st.done.add(p);
    if(st.mode==='add')claimProv(g,u,c,r,p);else for(const o of s.groups)if((st.all||o===g)&&MapDraw.owns(o,u,r,p))detachProv(o,u,c,r,p);
    recolor([el]);
  }
  st.changed=true;
}
async function splitUnit(u,quiet){
  const s=S();if(!u||s.split.includes(u))return true;
  if(s.states[u]){s.split.push(u);return true;}
  const h=$('#me-hover');if(h)h.textContent='Загружаю провинции: '+uname(u)+'…';
  try{await loadFor(s,[u]);}catch(e){toast('Не удалось загрузить провинции: '+e.message,true);return false;}
  const files=MapDraw.filesFor(GEO,s,u).filter(c=>GEO.prov[c]);
  if(!files.length){if(!quiet)toast('Для этой территории нет деления на провинции',true);return false;}
  s.split.push(u);
  if(!quiet){const D=SD();const n=D?D.feats.filter(f=>f.properties.u===u).length:0;if(h)h.textContent=uname(u)+': '+n+' '+plural(n,'провинция','провинции','провинций');renderMePanel();drawMe();}
  return true;
}
/* ---- правка границ провинций ---- */
const PCL=()=>window.polygonClipping;
const mpOf=f=>f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;
function bboxMP(mp){const b=[Infinity,Infinity,-Infinity,-Infinity];for(const poly of mp)for(const q of poly[0]){if(q[0]<b[0])b[0]=q[0];if(q[1]<b[1])b[1]=q[1];if(q[0]>b[2])b[2]=q[0];if(q[1]>b[3])b[3]=q[1];}return b;}
const ovl=(a,b)=>a[0]<=b[2]&&b[0]<=a[2]&&a[1]<=b[3]&&b[1]<=a[3];
const ringArea=r=>{let a=0;for(let i=0,j=r.length-1;i<r.length;j=i++)a+=(r[j][0]+r[i][0])*(r[j][1]-r[i][1]);return Math.abs(a/2);};
const areaMP=mp=>mp.reduce((s,poly)=>s+ringArea(poly[0])-poly.slice(1).reduce((h,r)=>h+ringArea(r),0),0);
function ringCentroid(r){let A=0,X=0,Y=0;for(let i=0,j=r.length-1;i<r.length;j=i++){const f=r[j][0]*r[i][1]-r[i][0]*r[j][1];A+=f;X+=(r[j][0]+r[i][0])*f;Y+=(r[j][1]+r[i][1])*f;}return Math.abs(A)<1e-12?r[0]:[X/(3*A),Y/(3*A)];}
function sideOf(pt,line){
  // знак векторного произведения относительно ближайшего отрезка линии
  let best=Infinity,side=0;
  for(let i=0;i<line.length-1;i++){const a=line[i],b=line[i+1];const dx=b[0]-a[0],dy=b[1]-a[1];const L2=dx*dx+dy*dy||1e-12;
    const t=Math.max(0,Math.min(1,((pt[0]-a[0])*dx+(pt[1]-a[1])*dy)/L2));const px=a[0]+t*dx-pt[0],py=a[1]+t*dy-pt[1];const d=px*px+py*py;
    if(d<best){best=d;side=Math.sign(dx*(pt[1]-a[1])-dy*(pt[0]-a[0]));}}
  return side;
}
function fixMP(mp){
  // округление и порядок обхода колец, который ждёт d3
  return mp.map(poly=>{poly=poly.map(r=>r.map(q=>[+q[0].toFixed(4),+q[1].toFixed(4)]));if(d3.geoArea({type:'Polygon',coordinates:poly})>2*Math.PI)poly=poly.map(r=>r.slice().reverse());return poly;}).filter(poly=>poly[0].length>=4);
}
function applyEdit(cid,dels,adds){
  const s=S();s.pedit=s.pedit||{};const e=s.pedit[cid]=s.pedit[cid]||{del:[],add:[],v:0};
  const orig=MapDraw.prepare(GEO)._p[cid].byId;
  for(const id of dels){const i=e.add.findIndex(a=>a.id===id);if(i>=0)e.add.splice(i,1);if(orig[id]&&!e.del.includes(id))e.del.push(id);}
  for(const a of adds){const i=e.add.findIndex(x=>x.id===a.id);if(i>=0)e.add[i]=a;else e.add.push(a);if(orig[a.id]&&!e.del.includes(a.id))e.del.push(a.id);}
  e.v=(e.v||0)+1;
}
function replaceProv(old,ids){const s=S();for(const g of s.groups){const i=g.prov.indexOf(old);if(i>=0)g.prov.splice(i,1,...ids);}if(s.owner[old]){for(const id of ids)s.owner[id]=s.owner[old];delete s.owner[old];s.ownerV=(s.ownerV||0)+1;}}
function removeProvRefs(id){const s=S();for(const g of s.groups)rm(g.prov,id);if(s.owner[id]){delete s.owner[id];s.ownerV=(s.ownerV||0)+1;}}
async function ensureSplit(pts){
  // государства, по которым прошла линия, сами разбиваются на провинции
  const s=S();const G=MapDraw.prepare(GEO);const T=MapDraw.tplOf(GEO,s);const need=new Set();const sample=pts.filter((q,i)=>i%3===0||i===pts.length-1);
  const feats=T?T.feats.map(f=>[f,f.properties.u]):G._c.map(f=>[f,f.properties.id]);
  for(const [f,u] of feats){if(s.split.includes(u))continue;
    const b=d3.geoBounds(f);const wrap=b[0][0]>b[1][0];
    for(const q of sample){if(!wrap&&(q[0]<b[0][0]||q[0]>b[1][0]||q[1]<b[0][1]||q[1]>b[1][1]))continue;if(d3.geoContains(f,q)){need.add(u);break;}}}
  for(const u of need)await splitUnit(u,true);
}
/* провинции разбитых государств в файле c */
function editable(c){const D=SD();if(!D)return [];return PV(c).feats.filter(f=>D.byId[f.properties.id]);}
async function doCut(pts){
  if(pts.length<2)return;
  await ensureSplit(pts);
  const eps=0.0004,quads=[];
  for(let i=0;i<pts.length-1;i++){const [ax,ay]=pts[i],[bx,by]=pts[i+1];const dx=bx-ax,dy=by-ay,L=Math.hypot(dx,dy);if(L<1e-9)continue;const nx=-dy/L*eps,ny=dx/L*eps;
    quads.push([[[ax+nx,ay+ny],[bx+nx,by+ny],[bx-nx,by-ny],[ax-nx,ay-ny],[ax+nx,ay+ny]]]);}
  if(!quads.length)return;
  const lb=bboxMP([[pts]]);lb[0]-=eps;lb[1]-=eps;lb[2]+=eps;lb[3]+=eps;
  let n=0;const D=SD();
  for(const cid of (D?D.files:[])){const dels=[],adds=[];
    for(const f of editable(cid)){const mp=mpOf(f);if(!ovl(bboxMP(mp),lb))continue;
      let res;try{res=PCL().difference(mp,...quads);}catch(e){continue;}
      if(res.length<2)continue;
      const sides={};for(const poly of res){const k=sideOf(ringCentroid(poly[0]),pts);(sides[k]=sides[k]||[]).push(poly);}
      const keys=Object.keys(sides);if(keys.length<2)continue;
      const id=f.properties.id,r=f.properties.r;const ids=keys.map((k,i)=>id+'~'+(i+1)+uid().slice(0,3));
      const u0=D.byId[id]?MapDraw.ownerOf(GEO,S(),D.byId[id]):null;
      dels.push(id);keys.forEach((k,i)=>adds.push({id:ids[i],r,g:fixMP(sides[k])}));replaceProv(id,ids);
      // части остаются у прежнего государства, даже если основа отдаёт их соседу
      ids.forEach(x=>{if(u0)S().owner[x]=u0;});n++;}
    if(dels.length)applyEdit(cid,dels,adds);}
  normalizeOwners();
  toast(n?`Разрезано ${n} ${plural(n,'провинция','провинции','провинций')}`:'Линия не прошла ни одну провинцию насквозь. Проведите её от края до края.',!n);
  renderMePanel();drawMe();
}
function normalizeOwners(){
  // убрать записи владельца, совпадающие с основой
  const s=S();const D=SD();if(!D)return;
  for(const id in s.owner){const f=D.byId[id];if(f&&f.properties.u===s.owner[id])delete s.owner[id];}
  s.ownerV=(s.ownerV||0)+1;
}
async function doLasso(pts){
  if(pts.length<3)return;
  await ensureSplit(pts);
  let L=[[...pts,pts[0]]];try{L=PCL().union(L);}catch(e){L=[L];}
  if(!L.length){toast('Не получилось построить область. Обведите её ещё раз.',true);return;}
  const lb=bboxMP(L),g=S().groups[ME.active];let made=0;const D=SD();const newIds=[];
  for(const cid of (D?D.files:[])){const dels=[],adds=[],parts=[];let bestR=null,bestA=0,bestU=null;
    for(const f of editable(cid)){const mp=mpOf(f);if(!ovl(bboxMP(mp),lb))continue;
      let inter;try{inter=PCL().intersection(mp,L);}catch(e){continue;}if(!inter.length)continue;
      const a=areaMP(inter);if(a<1e-8)continue;if(a>bestA){bestA=a;bestR=f.properties.r;bestU=MapDraw.ownerOf(GEO,S(),D.byId[f.properties.id]);}parts.push(inter);
      let diff;try{diff=PCL().difference(mp,L);}catch(e){diff=mp;}
      const id=f.properties.id;
      if(!diff.length||areaMP(diff)<1e-7){dels.push(id);removeProvRefs(id);}else adds.push({id,r:f.properties.r,g:fixMP(diff)});}
    if(!parts.length)continue;
    let u;try{u=PCL().union(...parts);}catch(e){u=parts.flat();}
    const nid=bestR+'.n'+uid().slice(0,5);adds.push({id:nid,r:bestR,g:fixMP(u)});
    applyEdit(cid,dels,adds);if(bestU)S().owner[nid]=bestU;newIds.push([nid,cid,bestR,bestU]);made++;
  }
  normalizeOwners();
  if(g)for(const [nid,cid,r,u] of newIds)claimProv(g,u||cid,cid,r,nid);
  S().groups.forEach(compact);
  toast(made?(g?`Новая провинция отдана группе «${g.name}»`:'Новая провинция создана'):'Внутри области нет провинций. Обведите сушу.',!made);
  renderMePanel();drawMe();
}
function doMerge(){
  const ids=[...ME.sel.keys()];if(ids.length<2){toast('Выберите хотя бы две провинции',true);return;}
  const cs=new Set(ME.sel.values());if(cs.size>1){toast('Объединять можно только провинции одной страны',true);return;}
  const cid=[...cs][0],Pp=PV(cid);const geoms=ids.map(id=>Pp.byId[id]).filter(Boolean).map(mpOf);
  let u;try{u=PCL().union(...geoms);}catch(e){toast('Не получилось объединить: '+e.message,true);return;}
  const keep=ids[0],r=Pp.byId[keep].properties.r;
  applyEdit(cid,ids.slice(1),[{id:keep,r,g:fixMP(u)}]);ids.slice(1).forEach(removeProvRefs);
  ME.sel.clear();toast(`Объединено провинций: ${ids.length}`);renderMePanel();drawMe();
}
function resetBorders(c){
  const s=S();if(!s.pedit||!s.pedit[c])return;
  const ids=new Set(PV(c).feats.map(f=>f.properties.id));delete s.pedit[c];
  const base=new Set(MapDraw.prepare(GEO)._p[c].feats.map(f=>f.properties.id));
  for(const g of s.groups)g.prov=g.prov.filter(p=>!ids.has(p)||base.has(p));
  for(const id in s.owner)if(ids.has(id)&&!base.has(id))delete s.owner[id];
  s.ownerV=(s.ownerV||0)+1;
  toast('Провинции: '+cname(c)+' — как были');renderMePanel();drawMe();
}
function meUnsplit(u){
  const s=S();const D=SD();
  if(D){
    const mine=D.feats.filter(f=>f.properties.u===u||s.owner[f.properties.id]===u);
    const ids=new Set(mine.map(f=>f.properties.id));let lost=false;
    const regs=new Set(mine.map(f=>f.properties.r));
    for(const g of s.groups){
      const all=mine.length&&mine.every(f=>MapDraw.owns(g,MapDraw.ownerOf(GEO,s,f),f.properties.r,f.properties.id));
      const some=mine.some(f=>MapDraw.owns(g,MapDraw.ownerOf(GEO,s,f),f.properties.r,f.properties.id));
      if(all&&!g.countries.includes(u))g.countries.push(u);else if(some&&!all)lost=true;
      g.prov=g.prov.filter(p=>!ids.has(p));g.regions=g.regions.filter(r=>!regs.has(r)||D.feats.some(f=>f.properties.r===r&&!ids.has(f.properties.id)));
    }
    for(const id in s.owner)if(ids.has(id))delete s.owner[id];
    if(lost)toast('Раскраска внутри «'+uname(u)+'» сброшена');
  }
  s.split=s.split.filter(x=>x!==u);s.ownerV=(s.ownerV||0)+1;
  renderMePanel();drawMe();
}
async function changeBase(v){
  const s=S();if(String(v)===String(s.base))return;
  const had=s.split.length||Object.keys(s.owner).length||s.groups.some(g=>g.countries.length);
  s.base=v?String(v):'';s.split=[];s.owner={};s.ownerV=(s.ownerV||0)+1;for(const g of s.groups)g.countries=[];
  ME.ownT='';ME.sel.clear();
  $('#me-svg').innerHTML='<p class="cnt">Загружаю границы…</p>';
  try{await loadFor(s);}catch(e){toast('Не удалось загрузить шаблон: '+e.message,true);}
  if(had)toast('Основа сменилась: разбиения и передачи земель сброшены, закраска провинций сохранена');
  renderMePanel();drawMe();
}
async function meSave(){
  const s=S();let name=($('#me-name').value||'').trim()||'Карта';
  const clash=P.media.find(m=>m.name===name&&m.name!==ME.orig);
  if(clash){toast('В медиатеке уже есть «'+name+'». Выберите другое имя.',true);return;}
  try{await loadFor(s);}catch(e){toast(e.message,true);return;}
  const src=svgURI(MapDraw.drawMap(s,GEO));
  if(ME.orig){const i=P.media.findIndex(m=>m.name===ME.orig);if(i>=0){if(name!==ME.orig)renameMedia(i,name);P.media[i].map=JSON.parse(JSON.stringify(s));P.media[i].src=src;}}
  else P.media.push({name,src,map:JSON.parse(JSON.stringify(s))});
  ME.orig=name;ME.name=name;save();toast('Карта «'+name+'» сохранена');
  const t=ME.target;ME.target=null;
  if(t){const pg=P.pages.find(p=>p.id===t.pageId);if(pg){setPath(pg,t.path,name);pg.updated=Date.now();save();location.hash='#/edit/'+pg.id;return;}}
  location.hash='#/media';
}
function newState(name){
  const s=S();const n=Object.keys(s.states).length+1;const id='x'+uid().slice(0,6);
  s.states[id]={name:name||('Новая страна '+n)};s.split.push(id);return id;
}
async function doNewStateLasso(pts){
  if(pts.length<3)return;
  await ensureSplit(pts);
  const ring=[...pts,pts[0]];let poly={type:'Polygon',coordinates:[ring]};
  if(d3.geoArea(poly)>2*Math.PI)poly={type:'Polygon',coordinates:[ring.slice().reverse()]};
  const D=SD();if(!D){toast('Внутри обводки нет суши',true);return;}
  const inside=D.feats.filter(f=>d3.geoContains(poly,d3.geoCentroid(f)));
  if(!inside.length){toast('Внутри обводки нет провинций. Обведите область пошире.',true);return;}
  const id=newState();for(const f of inside)setOwner(f.properties.id,id);
  ME.ownT=id;ME.ownMode='paint';
  toast(`«${S().states[id].name}»: ${inside.length} ${plural(inside.length,'провинция','провинции','провинций')}. Поменяйте название в списке «Новые страны».`);
  renderMePanel();drawMe();
  setTimeout(()=>{const inp=document.querySelector(`input[data-state="${id}"]`);if(inp){inp.focus();inp.select();}},50);
}
async function pickOwner(u){
  if(!u)return;ME.ownT=u;ME.ownMode='paint';const ok=await splitUnit(u,true);
  if(!ok&&!S().states[u]){toast('У этого государства нет провинций для передачи',true);}
  renderMePanel();drawMe();
  const h=$('#me-hover');if(h)h.textContent='Земли отходят: '+uname(u);
}

/* события редактора карт */
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-act]');if(!b)return;const a=b.dataset.act;const s=S();
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
    case 'me-tool':ME.tool=b.dataset.k;ME.draft=null;setTimeout(drawMe,0);if(ME.tool==='owner'&&!ME.ownT)ME.ownMode='pick';if(ME.tool!=='merge'&&ME.sel.size){ME.sel.clear();drawMe();}renderMeTools();break;
    case 'me-merge':doMerge();renderMeTools();break;
    case 'me-unsel':ME.sel.clear();$$('#me-svg path.sel').forEach(p=>p.classList.remove('sel'));renderMeTools();break;
    case 'me-preset-reset':resetBorders(b.dataset.k);break;
    case 'me-zoom':setZoom(s.zoom*+b.dataset.z);break;
    case 'me-unsplit':meUnsplit(b.dataset.k);break;
    case 'me-addstate':{const id=newState();ME.ownT=id;ME.ownMode='paint';renderMeTools();drawMe();toast('Страна «'+s.states[id].name+'» создана. Проводите мышью по провинциям, чтобы отдать ей земли, а название поменяйте в списке.');break;}
    case 'me-ownmode':ME.ownMode=b.dataset.k;ME.draft=null;renderMeTools();break;
    case 'me-pickstate':ME.ownT=b.dataset.k;ME.ownMode='paint';renderMeTools();drawMe();break;
    case 'me-delstate':if(armed(b,'?')){const id=b.dataset.k;delete s.states[id];for(const p in s.owner)if(s.owner[p]===id)delete s.owner[p];s.split=s.split.filter(x=>x!==id);for(const g of s.groups)rm(g.countries,id);if(ME.ownT===id)ME.ownT='';s.ownerV=(s.ownerV||0)+1;renderMePanel();drawMe();}break;
    case 'me-ownreset':if(armed(b,'Точно вернуть?')){s.owner={};s.ownerV=(s.ownerV||0)+1;renderMeTools();drawMe();toast('Государственные границы — как в основе карты');}break;
    case 'me-center':{const c=MapDraw.groupCentroid(s,ME.active,GEO);if(!c){toast('В выбранной группе пока ничего нет',true);break;}s.lon=Math.round(c[0]);if(s.proj==='ortho')s.lat=Math.round(Math.max(-60,Math.min(60,c[1])));syncSliders();drawMe();break;}
  }
});
document.addEventListener('input',e=>{
  const el=e.target;const s=S();
  if(s&&el.dataset&&el.dataset.state&&s.states[el.dataset.state]){s.states[el.dataset.state].name=el.value;const t=$('.me-target b');if(t&&ME.ownT===el.dataset.state)t.textContent=el.value;const o=$('#me-own option[value="'+el.dataset.state+'"]');if(o)o.textContent=el.value+' (новое)';return;}
  if(!s||!el.closest('#me-panel'))return;
  if(el.id==='me-name'){ME.name=el.value;const t=$('#me-title');if(t)t.textContent=el.value;return;}
  if(el.id==='me-lon'||el.id==='me-lat'||el.id==='me-zoom'){s[el.id.slice(3)]=+el.value;syncSliders();if(el.id==='me-zoom'&&s.proj!=='ortho'&&!$('#me-lat')&&s.zoom>1)renderMePanel();drawMeSoon();return;}
  if(el.dataset.mg){const g=s.groups[+el.dataset.i];g[el.dataset.mg]=el.value;const lg=$('#me-legend');if(lg)lg.value=legendText();renderMeTools();if(el.dataset.mg==='color')drawMeSoon();return;}
  if(el.dataset.ms){const k=el.dataset.ms;s[k]=el.type==='checkbox'?el.checked:el.type==='number'?+el.value:el.value;drawMeSoon();return;}
});
document.addEventListener('change',e=>{
  const el=e.target;const s=S();if(!s)return;
  if(el.dataset&&el.dataset.state){renderMePanel();return;}
  if(el.id==='me-base'){changeBase(el.value);return;}
  if(el.id==='me-own'){pickOwner(el.value);return;}
  if(el.id!=='me-preset'||!el.value)return;
  s.groups.push({name:el.value,color:MAP_COLORS[(s.groups.length+2)%MAP_COLORS.length],countries:MAP_PRESETS[el.value].split(' '),regions:[],prov:[]});ME.active=s.groups.length-1;
  el.value='';renderMePanel();drawMe();
});
document.addEventListener('keydown',e=>{if(e.code==='Space'&&$('#me-svg')&&!/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)){ME.space=true;e.preventDefault();}});
document.addEventListener('keyup',e=>{if(e.code==='Space')ME.space=false;});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&ME.draft){ME.draft=null;drawDraft();}});
document.addEventListener('contextmenu',e=>{if(e.target.closest('#me-svg'))e.preventDefault();});
/* перетаскивание, кисть, щипок и колесо на карте */
const PTRS=new Map();
function pinchState(){const [a,b]=[...PTRS.values()];return {d:Math.hypot(a.x-b.x,a.y-b.y),mx:(a.x+b.x)/2,my:(a.y+b.y)/2};}
function setZoom(z){const s=S();s.zoom=Math.max(1,Math.min(12,+z.toFixed(2)));if(s.proj!=='ortho'&&s.zoom>1&&!$('#me-lat'))renderMePanel();syncSliders();drawMeSoon();}
function endStroke(){
  const st=ME.stroke;ME.stroke=null;if(!st||!st.changed)return;
  if(!st.owner)S().groups.forEach(compact);
  renderMePanel();drawMe();
}
document.addEventListener('pointerdown',e=>{
  const box=e.target.closest('#me-svg');if(!box||!S()||!GEO.countries)return;
  const svg=box.querySelector('svg');if(!svg)return;
  e.preventDefault();box.setPointerCapture(e.pointerId);
  PTRS.set(e.pointerId,{x:e.clientX,y:e.clientY});
  const k=1/((svg.getScreenCTM()||{a:1}).a||1);
  if(PTRS.size===2){
    // второй палец отменяет мазок и включает щипок
    ME.draft=null;drawDraft();if(ME.stroke)endStroke();
    ME.drag=null;const st=pinchState();
    ME.pinch={...st,zoom:S().zoom,lon:S().lon,lat:S().lat,k};return;
  }
  if(PTRS.size>2)return;
  const t=e.target;const left=e.button===0&&!ME.space;
  if(left&&e.altKey&&t.dataset&&t.dataset.u){if(ME.tool!=='owner'){ME.tool='owner';}pickOwner(t.dataset.u);return;}
  if((ME.tool==='cut'||ME.tool==='lasso')&&left){
    const g0=clientToGeo(e);ME.draft={pts:g0?[g0]:[],x:e.clientX,y:e.clientY,moved:false,target:t};return;
  }
  if(ME.tool==='owner'&&left&&ME.ownMode==='pick'){if(t.dataset&&t.dataset.u)pickOwner(t.dataset.u);return;}
  if(ME.tool==='owner'&&left&&ME.ownMode==='lasso'){const g0=clientToGeo(e);ME.draft={pts:g0?[g0]:[],x:e.clientX,y:e.clientY,moved:false,target:t,newState:true};return;}
  if(ME.tool==='owner'&&left&&t.dataset.p){
    if(!ME.ownT){toast('Сначала выберите, кому отходят земли',true);return;}
    ME.stroke={owner:true,region:e.shiftKey,done:new Set(),changed:false};applyStroke(t);return;
  }
  if(['prov','region','erase'].includes(ME.tool)&&left&&t.dataset.p){
    const g=S().groups[ME.active];
    if(!g&&ME.tool!=='erase'){toast('Сначала добавьте государство или союз',true);return;}
    let mode='add';
    if(ME.tool==='erase')mode='remove';
    else if(g&&MapDraw.owns(g,t.dataset.u,t.dataset.r,t.dataset.p))mode='remove';
    ME.stroke={mode,all:ME.tool==='erase',done:new Set(),changed:false};
    applyStroke(t);return;
  }
  ME.drag={x:e.clientX,y:e.clientY,lon:S().lon,lat:S().lat,moved:false,target:t,k,click:left};
});
document.addEventListener('pointermove',e=>{
  if(PTRS.has(e.pointerId))PTRS.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(ME.pinch&&PTRS.size>=2){
    const q=ME.pinch,st=pinchState(),s=S();
    s.zoom=Math.max(1,Math.min(12,+(q.zoom*st.d/Math.max(10,q.d)).toFixed(2)));
    const {p}=MapDraw.projection(s);const deg=180/Math.PI/p.scale()*q.k;
    s.lon=((q.lon-(st.mx-q.mx)*deg+540)%360)-180;
    if(s.proj==='ortho'||s.zoom>1)s.lat=Math.max(-90,Math.min(90,q.lat+(st.my-q.my)*deg));
    if(s.proj!=='ortho'&&s.zoom>1&&!$('#me-lat'))renderMePanel();
    syncSliders();drawMeSoon();return;
  }
  if(ME.draft){
    const d=ME.draft;if(Math.hypot(e.clientX-d.x,e.clientY-d.y)<4)return;
    d.x=e.clientX;d.y=e.clientY;d.moved=true;const g=clientToGeo(e);if(g)d.pts.push(g);drawDraft();return;
  }
  if(ME.stroke){const el=document.elementFromPoint(e.clientX,e.clientY);if(el&&el.closest('#me-svg'))applyStroke(el);const h=$('#me-hover');if(h)h.textContent=featName(el)||' ';return;}
  if(ME.drag){
    const d=ME.drag,dx=e.clientX-d.x,dy=e.clientY-d.y;
    if(!d.moved&&Math.hypot(dx,dy)<4)return;d.moved=true;
    const s=S(),{p}=MapDraw.projection(s);const deg=180/Math.PI/p.scale()*d.k;
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
  if(ME.draft){
    const d=ME.draft;ME.draft=null;
    if(!d.moved){drawDraft();const t=d.target;if(t&&t.dataset&&t.dataset.u&&!t.dataset.p)splitUnit(t.dataset.u);return;}
    $('#me-hover').textContent=d.newState?'Создаю страну…':ME.tool==='cut'?'Режу провинции…':'Создаю провинцию…';
    try{if(d.newState)await doNewStateLasso(d.pts);else if(ME.tool==='cut')await doCut(d.pts);else await doLasso(d.pts);}
    catch(err){console.error(err);toast('Не получилось изменить границы: '+(err.message||err),true);drawMe();}
    $('#me-hover').textContent=' ';return;
  }
  if(ME.stroke){endStroke();return;}
  const d=ME.drag;if(!d)return;ME.drag=null;
  if(d.moved||!d.click)return;
  const t=d.target,s=S(),g=s.groups[ME.active];
  if(!t.dataset||!t.dataset.u)return;
  if(ME.tool==='country'){
    if(!g){toast('Сначала добавьте государство или союз',true);return;}
    const u=t.dataset.u;if(g.countries.includes(u))rm(g.countries,u);else g.countries.push(u);
    renderMePanel();drawMe();return;
  }
  if(ME.tool==='merge'){
    if(!t.dataset.p){splitUnit(t.dataset.u);return;}
    const id=t.dataset.p;if(ME.sel.has(id)){ME.sel.delete(id);t.classList.remove('sel');}else{ME.sel.set(id,t.dataset.c);t.classList.add('sel');}
    renderMeTools();return;
  }
  if(['prov','region','erase','owner'].includes(ME.tool)&&!t.dataset.p)splitUnit(t.dataset.u);
});
document.addEventListener('wheel',e=>{
  if(!e.target.closest('#me-svg')||!S())return;e.preventDefault();
  const s=S();s.zoom=Math.max(1,Math.min(12,+(s.zoom*(e.deltaY<0?1.15:1/1.15)).toFixed(2)));
  if(s.proj!=='ortho'&&s.zoom>1&&!$('#me-lat'))renderMePanel();syncSliders();drawMeSoon();
},{passive:false});
