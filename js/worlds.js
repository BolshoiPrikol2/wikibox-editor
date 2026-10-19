'use strict';
/* Свои миры: импорт карты другого мира из картинки и список миров.
   Мир хранится в проекте (P.worlds) и служит основой карт так же, как карта Земли. */

const WGEO=new WeakMap(),WTHUMB=new WeakMap();
/* Данные мира в том виде, в каком их ждёт MapDraw (как у Земли) */
function worldGeo(id){
  const w=(P.worlds||[]).find(x=>x.id===id);if(!w)return null;
  let g=WGEO.get(w);
  if(!g){g={countries:w.countries,prov:w.prov,tpl:{},names:w.names,tplIndex:{years:[]},world:{id:w.id,name:w.name,ext:w.ext,img:w.img}};WGEO.set(w,g);}
  return g;
}
/* Новая карта на основе мира. У мира из политической карты группы сразу с исходными цветами */
function worldSpec(w){
  const s=MapDraw.defaults('flat');
  Object.assign(s,{world:w.id,proj:'eqrect',lon:0,lat:0,zoom:1,grat:false,shade:false,inset:false,lakes:false});s.groups[0].name='Государство';
  const cols=Object.entries(w.colors||{});
  if(cols.length&&cols.length<=60){
    const names={};topojson.feature(w.countries,w.countries.objects.countries).features.forEach(f=>names[f.properties.id]=f.properties.ru);
    s.groups=cols.map(([id,c])=>({name:names[id]||id,color:c,countries:[id],regions:[],prov:[]}));
  }
  return s;
}
const worldUsers=id=>P.media.filter(m=>m.map&&m.map.world===id).map(m=>m.name).concat((P.mapTpl||[]).filter(t=>t.map&&t.map.world===id).map(t=>'шаблон «'+t.name+'»'));

/* Миры на странице «Новая карта» */
function worldsSectionHTML(){
  const L=P.worlds||[];
  return `<h2>Ваши миры</h2>${L.length?`<div class="tgrid">${L.map(w=>`<div class="tcard mcard tpl-card"><button class="tpl-use" data-act="world-map" data-id="${w.id}" title="Создать карту этого мира"><span class="mcard-img tpl-img" data-world="${w.id}"><span class="cnt">рисую…</span></span><b>${esc(w.name)}</b><span>${w.mode==='color'?'по цветам':'по береговой линии'}, ${w.nCountries} ${plural(w.nCountries,'государство','государства','государств')}${w.mode==='color'?'':' и островов'}, ${w.nProv} ${plural(w.nProv,'провинция','провинции','провинций')}</span></button><span class="tpl-btns"><button class="btn sm pri" data-act="world-map" data-id="${w.id}">Создать карту</button><a class="btn sm" href="#/world/${w.id}">Названия</a><button class="btn sm danger" data-act="world-del" data-id="${w.id}">Удалить</button></span></div>`).join('')}</div>`:'<p class="cnt">Пока нет. Нажмите «Свой мир по картинке» и загрузите карту выдуманного мира.</p>'}`;
}
async function worldThumbs(){
  for(const el of $$('[data-world]')){const w=(P.worlds||[]).find(x=>x.id===el.dataset.world);if(!w)continue;
    try{let src=WTHUMB.get(w);if(!src){src=svgURI(MapDraw.drawMap(worldSpec(w),worldGeo(w.id)));WTHUMB.set(w,src);}if(el.isConnected)el.innerHTML=`<img src="${src}" alt="">`;}catch(e){console.warn(e);if(el.isConnected)el.innerHTML='<span class="cnt">нет превью</span>';}}
}

/* ---------- страница импорта ---------- */
const WI={src:null,W:0,H:0,data:null,seg:null,fin:null,pr:null,view:'res',t:0,
  opt:{name:'',mode:'auto',thr:70,close:1,tol:24,byColor:true,minIsle:20,count:150,planet:false,span:40}};
function viewWorld(arg){
  $('#main').classList.remove('is-main');
  if(arg&&arg!=='new'){viewWorldEdit(arg);return;}
  const o=WI.opt;
  setView(mainMenuHTML(),shell({title:'Свой мир по картинке',content:`
  <p>Загрузите карту выдуманного мира. Из неё получится основа для карт, как карта Земли: суша, море, острова, провинции и регионы. На этой основе можно рисовать государства, союзы, карты выборов и выноски.</p>
  <ul><li><b>Рисованная карта</b> (Inkarnate, Wonderdraft, от руки): сушу ищем по тёмной береговой линии. Государства потом рисуются в редакторе карт: «Границы государств» → «Новая страна».</li>
  <li><b>Политическая карта</b> с ровной заливкой: каждый цвет — отдельное государство, цвета сохраняются.</li></ul>
  <p><label class="btn pri wi-file">Выбрать картинку…<input type="file" id="wi-file" accept="image/*" hidden></label> <span class="cnt">или перетащите файл сюда. PNG или JPG; большие картинки уменьшаются до 1600 точек.</span></p>
  <div id="wi-work" class="wi-grid"${WI.data?'':' hidden'}>
    <div class="wi-view">
      <div class="seg"><button data-act="wi-view" data-k="res" class="${WI.view==='res'?'on':''}">Результат</button><button data-act="wi-view" data-k="src" class="${WI.view==='src'?'on':''}">Исходная картинка</button></div>
      <canvas id="wi-canvas"></canvas>
      <p class="cnt">Голубое — вода, цветное — государства или острова, тонкие линии — провинции. Если что-то определилось неверно (озеро стало сушей или наоборот), щёлкните по этому месту.</p>
    </div>
    <div class="wi-side">
      <label class="fld"><span>Название мира</span><input id="wi-name" value="${esc(o.name)}" placeholder="Например, Иксия"></label>
      <label class="fld"><span>Как разбирать</span><select id="wi-mode"><option value="auto"${o.mode==='auto'?' selected':''}>сам определю</option><option value="outline"${o.mode==='outline'?' selected':''}>по береговой линии (рисованная)</option><option value="color"${o.mode==='color'?' selected':''}>по цветам (политическая)</option></select></label>
      <div id="wi-modeopts"></div>
      <label class="fld"><span>Убрать острова меньше: <b id="wi-minIsle-v">${o.minIsle}</b> точек</span><input type="range" id="wi-minIsle" min="1" max="400" step="1" value="${o.minIsle}"></label>
      <label class="fld"><span>Провинций примерно: <b id="wi-count-v">${o.count}</b></span><input type="range" id="wi-count" min="10" max="800" step="5" value="${o.count}"></label>
      <label class="inl"><input type="checkbox" id="wi-planet"${o.planet?' checked':''}> это карта всей планеты (развёртка 2:1)</label>
      <label class="fld" id="wi-span-f"${o.planet?' hidden':''}><span>Размер по долготе: <b id="wi-span-v">${o.span}°</b></span><input type="range" id="wi-span" min="5" max="180" step="1" value="${o.span}"></label>
      <p class="cnt" id="wi-stat"></p>
      <p><button class="btn pri" data-act="wi-create" id="wi-create" disabled>Создать мир</button></p>
    </div>
  </div>`}),'Свой мир по картинке');
  if(WI.data)wiRun('seg');
}
function wiModeOpts(){
  const o=WI.opt,el=$('#wi-modeopts');if(!el)return;const m=WI.seg?WI.seg.mode:o.mode;
  el.innerHTML=m==='color'?`<p class="cnt">Разбор по цветам.</p>
    <label class="fld"><span>Похожие цвета склеивать: <b id="wi-tol-v">${o.tol}</b></span><input type="range" id="wi-tol" min="6" max="70" step="1" value="${o.tol}"></label>
    <label class="inl"><input type="checkbox" id="wi-byColor"${o.byColor?' checked':''}> один цвет — одно государство (иначе каждое пятно отдельно)</label>`
  :`<p class="cnt">Разбор по береговой линии.</p>
    <label class="fld"><span>Что считать линией (темнее): <b id="wi-thr-v">${o.thr}</b></span><input type="range" id="wi-thr" min="15" max="200" step="1" value="${o.thr}"></label>
    <label class="fld"><span>Заделывать разрывы линии: <b id="wi-close-v">${o.close}</b></span><input type="range" id="wi-close" min="0" max="3" step="1" value="${o.close}"></label>`;
}
async function wiLoad(file){
  if(!file||!/^image\//.test(file.type)){toast('Это не картинка',true);return;}
  const url=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(file);});
  const im=new Image();im.src=url;try{await im.decode();}catch(e){toast('Не удалось открыть картинку',true);return;}
  const sc=Math.min(1,1600/Math.max(im.width,im.height));const W=Math.max(1,Math.round(im.width*sc)),H=Math.max(1,Math.round(im.height*sc));
  const c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,W,H);x.drawImage(im,0,0,W,H);
  WI.W=W;WI.H=H;WI.data=x.getImageData(0,0,W,H);WI.src=c;WI.seg=null;
  if(!WI.opt.name)WI.opt.name=file.name.replace(/\.[a-z0-9]+$/i,'').replace(/[_-]+/g,' ').replace(/^./,ch=>ch.toUpperCase());
  WI.opt.planet=Math.abs(W/H-2)<.08;
  viewWorld('');
}
/* stage: seg — разобрать заново; fin — пересчитать сушу; prov — только провинции */
function wiRun(stage){
  if(!WI.data)return;const o=WI.opt;const st=$('#wi-stat');if(st)st.textContent='Разбираю…';
  clearTimeout(WI.t);WI.t=setTimeout(()=>{
    try{
      if(stage==='seg'||!WI.seg){WI.seg=WorldImg.segment(WI.data.data,WI.W,WI.H,{mode:o.mode,thr:o.thr,close:o.close,tol:o.tol});wiModeOpts();}
      if(stage!=='prov'||!WI.fin)WI.fin=WorldImg.finalize(WI.seg,{minIsle:o.minIsle,byColor:o.byColor});
      WI.pr=WorldImg.provinces(WI.fin,{count:o.count});
      wiDraw();
      const nc=WI.fin.countries.length;
      if(st)st.textContent=nc?`${WI.seg.mode==='color'?'Государств':'Кусков суши (материков и островов)'}: ${nc}. Провинций: ${WI.pr.np}.`:'Суши не найдено. Попробуйте другой способ разбора или порог линии.';
      const b=$('#wi-create');if(b)b.disabled=!nc;
    }catch(e){console.error(e);if(st)st.textContent='Ошибка разбора: '+e.message;}
  },60);
}
function wiDraw(){
  const c=$('#wi-canvas');if(!c||!WI.data)return;c.width=WI.W;c.height=WI.H;const x=c.getContext('2d');
  if(WI.view==='src'||!WI.fin){x.drawImage(WI.src,0,0);return;}
  const out=x.createImageData(WI.W,WI.H);WorldImg.preview(WI.fin,WI.pr,out.data);x.putImageData(out,0,0);
}
function wiCreate(){
  if(!WI.fin||!WI.fin.countries.length)return;const o=WI.opt;
  const name=(o.name||'').trim()||'Мой мир';
  let w;try{w=WorldImg.build(WI.fin,WI.pr,{planet:o.planet,span:o.span,name});}catch(e){console.error(e);toast('Не удалось построить мир: '+e.message,true);return;}
  // исходная картинка — чтобы обводить по ней границы в редакторе
  const sc=Math.min(1,1200/Math.max(WI.W,WI.H));const c=document.createElement('canvas');c.width=Math.round(WI.W*sc);c.height=Math.round(WI.H*sc);c.getContext('2d').drawImage(WI.src,0,0,c.width,c.height);
  Object.assign(w,{id:'w'+uid().slice(0,6),name,mode:WI.seg.mode,created:Date.now(),img:c.toDataURL('image/jpeg',.8),nCountries:WI.fin.countries.length,nProv:WI.pr.np});
  P.worlds=P.worlds||[];P.worlds.push(w);save();
  toast('Мир «'+name+'» создан');
  WI.data=null;WI.seg=WI.fin=WI.pr=null;WI.opt.name='';
  ME.spec=worldSpec(w);ME.orig=null;ME.name=uniqueName('Карта: '+name);ME.hist=[];ME.fut=[];location.hash='#/map/new';
}

/* ---------- названия государств мира ---------- */
function viewWorldEdit(id){
  const w=(P.worlds||[]).find(x=>x.id===id);
  if(!w){setView(mainMenuHTML(),shell({title:'Мир не найден',content:'<p><a class="btn" href="#/map/">К картам</a></p>'}),'Мир не найден');return;}
  const feats=topojson.feature(w.countries,w.countries.objects.countries).features;
  const rows=feats.map(f=>`<tr><td>${w.colors&&w.colors[f.properties.id]?`<span class="legend-color" style="background:${esc(w.colors[f.properties.id])}"></span>`:''}</td><td><input data-wn="${esc(f.properties.id)}" value="${esc(f.properties.ru)}" aria-label="Название"></td><td class="cnt">${esc(f.properties.id)}</td></tr>`).join('');
  setView(mainMenuHTML(),shell({title:'Мир: '+esc(w.name),content:`
    <label class="fld"><span>Название мира</span><input id="wn-name" value="${esc(w.name)}"></label>
    <p><img class="wi-thumb" src="${MapDraw?svgURI(MapDraw.drawMap(worldSpec(w),worldGeo(w.id))):''}" alt=""></p>
    <h2>${w.mode==='color'?'Государства':'Материки и острова'}</h2>
    <p class="cnt">Эти названия видны при наведении на карту и в списках редактора карт. Новые государства на рисованной карте создаются в самой карте: «Границы государств» → «Новая страна».</p>
    <table class="wikitable wn-tbl"><tbody>${rows}</tbody></table>
    <p><button class="btn pri" data-act="wn-save" data-id="${w.id}">Сохранить</button> <button class="btn" data-act="world-map" data-id="${w.id}">Создать карту</button> <a class="btn" href="#/map/">Назад</a></p>`}),'Мир: '+w.name);
}
function wnSave(id){
  const w=(P.worlds||[]).find(x=>x.id===id);if(!w)return;
  const nm=($('#wn-name').value||'').trim();if(nm)w.name=nm;
  const names={};$$('[data-wn]').forEach(i=>{const v=i.value.trim();if(v)names[i.dataset.wn]=v;});
  for(const g of w.countries.objects.countries.geometries){const v=names[g.properties.id];if(v){g.properties.ru=v;g.properties.en=v;}}
  // регион из одной провинции страны называется как страна
  for(const r in w.names.r){const [n,c]=w.names.r[r];if(!/^Регион \d+$/.test(n)&&names[c])w.names.r[r]=[names[c],c];}
  WGEO.delete(w);WTHUMB.delete(w);save();toast('Сохранено');location.hash='#/map/';
}

/* события */
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-act]');
  if(b)switch(b.dataset.act){
    case 'wi-view':WI.view=b.dataset.k;$$('[data-act="wi-view"]').forEach(x=>x.classList.toggle('on',x===b));wiDraw();return;
    case 'wi-create':wiCreate();return;
    case 'world-map':{const w=(P.worlds||[]).find(x=>x.id===b.dataset.id);if(!w)return;ME.spec=worldSpec(w);ME.orig=null;ME.name=uniqueName('Карта: '+w.name);ME.hist=[];ME.fut=[];location.hash='#/map/new';return;}
    case 'world-del':{const id=b.dataset.id;const used=worldUsers(id);
      if(used.length){toast('Этот мир используется: '+used.slice(0,4).join(', ')+(used.length>4?' и ещё '+(used.length-4):'')+'. Сначала удалите эти карты.',true);return;}
      if(armed(b,'Точно удалить?')){P.worlds=P.worlds.filter(w=>w.id!==id);save();toast('Мир удалён');route();}return;}
    case 'wn-save':wnSave(b.dataset.id);return;
  }
  const cv=e.target.closest('#wi-canvas');
  if(cv&&WI.seg&&WI.view==='res'){const r=cv.getBoundingClientRect();const x=Math.floor((e.clientX-r.left)/r.width*WI.W),y=Math.floor((e.clientY-r.top)/r.height*WI.H);
    if(WorldImg.toggleAt(WI.seg,Math.max(0,Math.min(WI.W-1,x)),Math.max(0,Math.min(WI.H-1,y))))wiRun('fin');}
});
document.addEventListener('change',e=>{if(e.target.id==='wi-file')wiLoad(e.target.files[0]);});
document.addEventListener('input',e=>{
  const t=e.target;if(!t.id||!/^wi-/.test(t.id))return;const k=t.id.slice(3);const o=WI.opt;
  if(k==='name'){o.name=t.value;return;}
  if(k==='mode'){o.mode=t.value;wiRun('seg');return;}
  if(k==='planet'){o.planet=t.checked;const f=$('#wi-span-f');if(f)f.hidden=o.planet;return;}
  if(k==='byColor'){o.byColor=t.checked;wiRun('fin');return;}
  if(!(k in o))return;o[k]=+t.value;const v=$('#wi-'+k+'-v');if(v)v.textContent=t.value+(k==='span'?'°':'');
  if(k==='span')return;
  wiRun(k==='thr'||k==='close'||k==='tol'?'seg':k==='count'?'prov':'fin');
});
document.addEventListener('dragover',e=>{if($('#wi-file')){e.preventDefault();}});
document.addEventListener('drop',e=>{if(!$('#wi-file'))return;const f=e.dataTransfer&&e.dataTransfer.files[0];if(f){e.preventDefault();wiLoad(f);}});
