'use strict';
/* Оболочка сайта: хранение, маршруты, страницы чтения, редактор */

const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const fid=p=>'f-'+p.replace(/\./g,'-');
const LS='apokrif-v2',LSA='apokrif-appearance';
let P=null;
const state={source:'',lastP:'body',edTab:'form',tocHidden:false};
const APP={size:'1',width:'std',theme:'auto'};

/* ---------- хранение ---------- */
function normalize(p){
  if(!p||!Array.isArray(p.pages))throw new Error('в тексте нет списка страниц (pages)');
  p.wiki=Object.assign({name:'Wikibox Editor',motto:'',tag:'Материал из Wikibox Editor — свободной энциклопедии',welcome:'энциклопедия несбывшейся истории, которую может редактировать каждый'},p.wiki||{});
  // старое название сайта меняем на новое
  if(p.wiki.name==='Апокрифопедия')p.wiki.name='Wikibox Editor';
  if(p.wiki.motto==='Энциклопедия несбывшейся истории')p.wiki.motto='';
  p.wiki.tag=String(p.wiki.tag).replace('Материал из Апокрифопедии','Материал из Wikibox Editor');
  p.media=Array.isArray(p.media)?p.media.filter(m=>m&&m.name&&(m.src||m.map)):[];
  p.pages=p.pages.map(pg=>{
    const ib=Object.assign({title:'',custom:false,theme:'#3366cc',w:23,rows:[]},pg.ib||{});
    if(p.v!==2){ib.custom=false;ib.w=23;}
    return Object.assign({id:uid(),type:'blank',title:'Без названия',hatnote:'',body:'',cats:'',created:Date.now(),updated:Date.now()},pg,{ib});
  });
  p.v=2;
  if(!p.pages.some(x=>x.id===p.featured))p.featured=p.pages[0]?.id;
  return p;
}
let svT,pvT;
function save(){
  try{localStorage.setItem(LS,serializeProject());state.source='local';setEdStatus('Сохранено в этом браузере в '+new Date().toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}));}
  catch(e){toast('Не удалось сохранить: в браузере закончилось место. Скачайте проект на странице «Файл проекта».',true);}
}
function changed(pg){if(pg)pg.updated=Date.now();clearTimeout(pvT);pvT=setTimeout(renderEdPreview,120);clearTimeout(svT);svT=setTimeout(save,500);}
function setEdStatus(t){const s=$('#ed-status');if(s)s.textContent=t;}
function toast(t,err){const el=$('#toast');el.textContent=t;el.classList.toggle('err',!!err);el.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>el.hidden=true,err?6000:2600);}
function setPath(o,path,v){const k=path.split('.');let x=o;for(let i=0;i<k.length-1;i++){if(x[k[i]]==null)x[k[i]]=/^\d+$/.test(k[i+1])?[]:{};x=x[k[i]];}x[k[k.length-1]]=v;}
function download(name,data,type){
  const b=data instanceof Blob?data:new Blob([data],{type:type||'application/octet-stream'});
  const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=name;document.body.append(a);a.click();
  setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1500);
}
const plural=(n,a,b,c)=>{const m=n%10,h=n%100;return m===1&&h!==11?a:m>=2&&m<=4&&(h<12||h>14)?b:c;};
const fmtDate=ts=>new Date(ts||Date.now()).toLocaleString('ru-RU',{day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'});
const typeName=t=>(TPL[t]||TPL.blank).name;

/* ---------- внешний вид ---------- */
function loadAppearance(){try{Object.assign(APP,JSON.parse(localStorage.getItem(LSA)||'{}'));}catch(e){}}
function applyAppearance(){const d=document.documentElement;d.dataset.size=APP.size;d.dataset.width=APP.width;if(APP.theme==='auto')delete d.dataset.theme;else d.dataset.theme=APP.theme;}
function appearanceHTML(px){
  const grp=(key,title,opts)=>`<fieldset class="ap-grp"><legend>${title}</legend>${opts.map(([v,l])=>`<label><input type="radio" name="${px}-${key}" data-ap="${key}" value="${v}"${APP[key]===v?' checked':''}> ${l}</label>`).join('')}</fieldset>`;
  return grp('size','Текст',[['0','Мелкий'],['1','Стандартный'],['2','Крупный']])+grp('width','Ширина',[['std','Стандартная'],['wide','Широкая']])+grp('theme','Цвета (бета)',[['auto','Автоматически'],['light','Светлая'],['dark','Тёмная']]);
}
function renderTools(){const rd=P&&parseHash().k==='wiki'&&cur();$('#tools').innerHTML=`${rd?`<div class="side-h">Инструменты</div><ul class="menu-list tools-list"><li><button class="linkbtn" data-act="snap" data-w="all">Скачать статью картинкой</button></li><li><button class="linkbtn" data-act="snap" data-w="lead">Скачать главное картинкой</button></li><li><button class="linkbtn" data-act="snap" data-w="ib">Скачать карточку картинкой</button></li></ul><p class="tools-hint">Двойной щелчок по абзацу, заголовку или строке карточки — быстрая правка прямо на странице.</p>`:''}<div class="side-h">Внешний вид <button class="pill" data-act="ap-toggle">${state.apHidden?'показать':'скрыть'}</button></div><div class="ap-body"${state.apHidden?' hidden':''}>${appearanceHTML('t')}</div>`;}

/* ---------- каркас страниц ---------- */
function applyBrand(){$('#logo-name').textContent=P.wiki.name;$('#logo-motto').textContent=P.wiki.motto||'';$('#logo-motto').hidden=!P.wiki.motto;$('#q').placeholder='Искать в '+P.wiki.name.replace(/ия$/,'ии');}
function mainMenuHTML(){
  const counts={};P.pages.forEach(p=>counts[p.type]=(counts[p.type]||0)+1);
  return `<div class="side-h">Главное меню</div><ul class="menu-list">
    <li><a href="#/">Заглавная страница</a></li><li><a href="#/all">Все статьи</a></li><li><a href="#/random">Случайная статья</a></li><li><a href="#/new">Создать статью</a></li><li><a href="#/import">Импорт из Википедии</a></li></ul>
    <div class="side-h2">Служебные</div><ul class="menu-list"><li><a href="#/media">Медиатека</a></li><li><a href="#/file">Файл проекта</a></li></ul>
    <div class="side-h2">Разделы</div><ul class="menu-list">${Object.keys(TPL).filter(k=>counts[k]).map(k=>`<li><a href="#/all/${k}">${TPL[k].name}</a> <span class="cnt">${counts[k]}</span></li>`).join('')||'<li class="cnt">пока пусто</li>'}</ul>`;
}
function tabsHTML(mode,pg){
  if(!pg)return `<div class="tabs"><div><span class="sel">${mode==='main'?'Заглавная страница':'Служебная страница'}</span></div><div></div></div>`;
  const read='#/wiki/'+slug(pg.title),edit='#/edit/'+pg.id;
  return `<div class="tabs"><div><a class="sel" href="${read}">Статья</a><span class="off" title="Обсуждений пока нет">Обсуждение</span></div>
  <div><a${mode==='read'?' class="sel"':''} href="${read}">Читать</a><a${mode==='edit'?' class="sel"':''} href="${edit}">Править</a><a href="${edit}/code">Править код</a><span class="off" title="История правок не ведётся">История</span>
  <span class="dd"><button class="tab-btn tab-more" data-act="dd" aria-expanded="false" aria-label="Инструменты" title="Инструменты">⋮</button><div class="dd-menu" hidden>
    <div class="dd-h">Действия</div>
    <div class="dd-h">Скачать картинкой (PNG)</div><button data-act="snap" data-w="all">Вся статья</button><button data-act="snap" data-w="lead">Главное: начало статьи и карточка</button><button data-act="snap" data-w="ib">Только карточка</button><div class="dd-h">Другое</div><button data-act="dl-html">Скачать статью (HTML)</button>
    <div class="dd-h">Страница</div>
    ${pg.source?`<a class="dd-link" href="${esc(pg.source.url)}" target="_blank" rel="noopener">Исходная статья в Википедии</a>`:''}<button data-act="feature">${P.featured===pg.id?'Это избранная статья':'Сделать избранной статьёй'}</button><button data-act="dup-page">Создать копию</button><button data-act="del-page" class="danger">Удалить страницу</button>
  </div></span></div></div>`;
}
function footerHTML(pg){
  return `<footer class="vfooter">${pg?`<p>Последнее изменение страницы: ${fmtDate(pg.updated)}.</p>`:''}${pg&&pg.source?`<p>Основано на статье «<a class="external" href="${esc(pg.source.url)}" target="_blank" rel="noopener">${esc(pg.source.title)}</a>» из Википедии (${esc(pg.source.lang)}). Текст доступен по лицензии <a class="external" href="https://creativecommons.org/licenses/by-sa/4.0/deed.ru" target="_blank" rel="noopener">CC BY-SA 4.0</a>.</p>`:''}<p>Все государства, события и персоны в статьях «${esc(P.wiki.name)}» вымышлены или изменены. Сайт сделан в Wikibox Editor.</p>
  <ul><li><a href="#/">Заглавная страница</a></li><li><a href="#/all">Все статьи</a></li><li><a href="#/file">Файл проекта</a></li></ul></footer>`;
}
function shell({title,mode,pg,content,sub=true,foot=true,cls=''}){
  return `<div class="snap-area ${cls}"><div class="titlebar"><h1 class="fh" id="top">${title}</h1></div>${tabsHTML(mode,pg)}${sub?`<div class="sitesub"><span>${esc(P.wiki.tag)}</span>${pg&&mode==='read'?`<span class="sitesub-r">[<a href="#/edit/${pg.id}/code">править код</a>]</span>`:''}</div>`:''}<div class="mw-content">${content}</div></div>${foot?footerHTML(pg):''}`;
}
function setView(side,main,title){$('#side').innerHTML=side;$('#main').innerHTML=main;document.title=title?title+' — '+P.wiki.name:P.wiki.name;renderTools();}

/* ---------- маршруты ---------- */
function parseHash(){const h=location.hash.replace(/^#\/?/,'');const i=h.indexOf('/');const k=i<0?h:h.slice(0,i);let arg=i<0?'':h.slice(i+1);try{arg=decodeURIComponent(arg);}catch(e){}return {k,arg:arg.replace(/_/g,' ')};}
function route(){
  const {k,arg}=parseHash();closeMenus();closeIE();
  if(typeof ME!=='undefined'&&(k!=='map'||(arg&&arg!=='new')))ME.target=null;
  document.body.classList.toggle('mode-edit',k==='edit'||(k==='map'&&!!arg));
  if(k==='random'){const p=P.pages[Math.floor(Math.random()*P.pages.length)];if(p){location.replace('#/wiki/'+slug(p.title));return;}}
  if(k==='wiki'){const pg=pageFind(arg);pg?viewArticle(pg):viewMissing(arg);}
  else if(k==='edit'){const code=/\/code$/.test(arg);const id=arg.replace(/\/code$/,'');const pg=P.pages.find(p=>p.id===id.replace(/ /g,'_'))||P.pages.find(p=>p.id===id)||pageFind(id);if(pg){viewEdit(pg);if(code)setTimeout(()=>{const t=$('#f-body');if(t){t.scrollIntoView({block:'center'});t.focus();}},60);}else viewMissing(id);}
  else if(k==='new')viewNew(arg);
  else if(k==='import')viewNew(arg,true);
  else if(k==='cat')viewCat(arg);
  else if(k==='all')viewAll(arg);
  else if(k==='search')viewSearch(arg);
  else if(k==='media')viewMedia();
  else if(k==='map'){if(arg==='new')viewMapEditor(null);else if(arg)viewMapEditor(arg);else viewMapNew();}
  else if(k==='file')viewFile();
  else viewMain();
  window.scrollTo(0,0);
}

/* ---------- заглавная ---------- */
function viewMain(){
  const n=P.pages.length,f=P.pages.find(p=>p.id===P.featured);
  const recent=[...P.pages].sort((a,b)=>(b.updated||0)-(a.updated||0)).slice(0,8);
  const byType={};P.pages.forEach(p=>(byType[p.type]=byType[p.type]||[]).push(p));
  const img=f&&firstImage(f);
  const content=`<div class="mp-welcome"><div class="mp-w-t">Добро пожаловать в ${esc(P.wiki.name.replace(/ия$/,'ию'))},</div><div class="mp-w-s">${esc(P.wiki.welcome)}.</div><div class="mp-w-c">Сейчас здесь <a href="#/all">${n} ${plural(n,'статья','статьи','статей')}</a>.</div><div class="mp-w-b"><a class="btn pri" href="#/new">Создать статью</a><a class="btn" href="#/random">Случайная статья</a></div></div>
  <div class="mp-grid">
    <section class="mp-box"><h2 class="mp-h">Избранная статья</h2><div class="mp-b">${f?`${img?`<img class="mp-img" src="${img}" alt="">`:''}<p><b><a href="#/wiki/${slug(f.title)}">${esc(f.title)}</a></b> — ${leadText(f).replace(/^<b>[^<]*<\/b>\s*(\([^)]*\)\s*)?—\s*/,'')}</p><p class="mp-more"><a href="#/wiki/${slug(f.title)}">Читать далее →</a></p><div class="clear"></div>`:'<p>Статей пока нет.</p>'}</div></section>
    <section class="mp-box"><h2 class="mp-h">Новые и обновлённые</h2><div class="mp-b"><ul class="mp-list">${recent.map(p=>`<li><a href="#/wiki/${slug(p.title)}">${esc(p.title)}</a> <span class="cnt">${esc(TPL[p.type]?.short||'')}</span></li>`).join('')}</ul></div></section>
  </div>
  <section class="mp-box"><h2 class="mp-h">Статьи по разделам</h2><div class="mp-b mp-cols">${Object.keys(TPL).filter(k=>byType[k]).map(k=>`<div><h3><a href="#/all/${k}">${TPL[k].name}</a></h3><ul class="mp-list">${byType[k].map(p=>`<li><a href="#/wiki/${slug(p.title)}">${esc(p.title)}</a></li>`).join('')}</ul></div>`).join('')}</div></section>`;
  setView(mainMenuHTML(),shell({title:'Заглавная страница',mode:'main',content,cls:'mainpage',sub:false}),'');
  $('#main').classList.add('is-main');
}

/* ---------- статья ---------- */
function tocList(heads){
  const top=[];for(const h of heads.filter(h=>h.lv<=3)){if(h.lv===2||!top.length)top.push({h,kids:[]});else top[top.length-1].kids.push(h);}
  return `<ul><li><a href="#" data-jump="top" class="active">Начало</a></li>${top.map(t=>`<li class="lv2${t.kids.length?' has-kids':''}">${t.kids.length?'<button class="toc-tg" data-act="toc-tg" aria-label="Развернуть" aria-expanded="false">›</button>':''}<a href="#" data-jump="${t.h.id}">${t.h.text}</a>${t.kids.length?`<ul hidden>${t.kids.map(k=>`<li class="lv3"><a href="#" data-jump="${k.id}">${k.text}</a></li>`).join('')}</ul>`:''}</li>`).join('')}</ul>`;
}
function viewArticle(pg){
  closeIE(true);
  $('#main').classList.remove('is-main');
  const {content,heads}=articleParts(pg,{editLinks:true});
  const side=heads.length?`<div class="vtoc${state.tocHidden?' collapsed':''}"><div class="side-h">Содержание <button class="pill" data-act="toc-toggle">${state.tocHidden?'показать':'скрыть'}</button></div>${tocList(heads)}</div>`:mainMenuHTML();
  const mob=heads.length?`<details class="toc-mobile"><summary>Содержание</summary>${tocList(heads)}</details>`:'';
  setView(side,shell({title:fmt(esc(pg.title)),mode:'read',pg,content:mob+content+catlinksHTML(pg)}),pg.title);
  tocSpy();
}
function viewMissing(t){
  $('#main').classList.remove('is-main');
  setView(mainMenuHTML(),shell({title:esc(t||'Страница не найдена'),content:`<div class="notice"><p>В «${esc(P.wiki.name)}» нет статьи с таким названием.</p><p><a class="btn pri" href="#/new/${slug(t)}">Создать статью «${esc(t)}»</a> <a class="btn" href="#/search/${slug(t)}">Искать «${esc(t)}» в текстах</a></p></div>`}),t);
}
let spyBound=false;
function tocSpy(){
  if(spyBound)return;spyBound=true;
  let raf=0;
  window.addEventListener('scroll',()=>{if(raf)return;raf=requestAnimationFrame(()=>{raf=0;
    const links=$$('.vtoc a[data-jump]');if(!links.length)return;
    let cur='top';for(const a of links){const el=document.getElementById(a.dataset.jump);if(el&&el.getBoundingClientRect().top<110)cur=a.dataset.jump;}
    links.forEach(a=>a.classList.toggle('active',a.dataset.jump===cur));
    const act=links.find(a=>a.dataset.jump===cur);const sub=act&&act.closest('ul[hidden]');if(sub){sub.hidden=false;const b=sub.parentElement.querySelector('.toc-tg');if(b){b.classList.add('open');b.setAttribute('aria-expanded','true');}}});},{passive:true});
}

/* ---------- списки, категории, поиск ---------- */
function letterGroups(pages){
  const g={};[...pages].sort((a,b)=>a.title.localeCompare(b.title,'ru')).forEach(p=>{const l=(p.title[0]||'#').toUpperCase();(g[l]=g[l]||[]).push(p);});
  return `<div class="letter-cols">${Object.entries(g).map(([l,ps])=>`<div class="lg"><h3>${esc(l)}</h3><ul>${ps.map(p=>`<li><a href="#/wiki/${slug(p.title)}">${esc(p.title)}</a></li>`).join('')}</ul></div>`).join('')}</div>`;
}
function viewAll(type){
  $('#main').classList.remove('is-main');
  const t=type&&TPL[type]?type:'';const list=t?P.pages.filter(p=>p.type===t):P.pages;
  const chips=`<div class="chips"><a class="chip${t?'':' on'}" href="#/all">Все</a>${Object.keys(TPL).filter(k=>P.pages.some(p=>p.type===k)).map(k=>`<a class="chip${k===t?' on':''}" href="#/all/${k}">${TPL[k].name}</a>`).join('')}</div>`;
  setView(mainMenuHTML(),shell({title:t?'Раздел: '+esc(TPL[t].name):'Все статьи',content:`${chips}<p>${list.length} ${plural(list.length,'страница','страницы','страниц')}.</p>${letterGroups(list)}`}),'Все статьи');
}
function viewCat(name){
  $('#main').classList.remove('is-main');
  const list=P.pages.filter(p=>catsOf(p).some(c=>norm(c)===norm(name)));
  setView(mainMenuHTML(),shell({title:'Категория:'+esc(name),content:`<h2>Страницы в категории «${esc(name)}»</h2><p>Показано ${list.length} ${plural(list.length,'страница','страницы','страниц')}.</p>${letterGroups(list)}`}),'Категория:'+name);
}
function viewSearch(q){
  $('#main').classList.remove('is-main');
  const n=norm(q);
  const hits=n?P.pages.map(p=>{const tt=norm(p.title).includes(n);const b=String(p.body||'').toLowerCase().replace(/ё/g,'е');const i=b.indexOf(n);return (tt||i>=0)?{p,tt,i}:null;}).filter(Boolean).sort((a,b)=>b.tt-a.tt):[];
  const snip=h=>{if(h.i<0)return leadText(h.p,200);const raw=String(h.p.body).replace(/<ref[\s\S]*?<\/ref>/g,'').replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g,'$1').replace(/'{2,}|\{\{[^}]*\}\}|={2,}/g,'');const j=Math.max(0,raw.toLowerCase().replace(/ё/g,'е').indexOf(n)-80);return esc((j?'…':'')+raw.slice(j,j+220)+'…').replace(new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi'),m=>`<mark>${m}</mark>`);};
  const exact=pageFind(q);
  setView(mainMenuHTML(),shell({title:'Результаты поиска',content:`<form class="search-big" data-form="search"><input id="q2" value="${esc(q)}" aria-label="Запрос"><button class="btn pri">Найти</button></form>
    ${!exact&&q?`<p class="notice">Создать страницу «<a class="new" href="#/new/${slug(q)}">${esc(q)}</a>» в этой вики.</p>`:''}
    <p class="cnt">Найдено: ${hits.length}</p><ul class="results">${hits.map(h=>`<li><a href="#/wiki/${slug(h.p.title)}">${esc(h.p.title)}</a><div class="snip">${snip(h)}</div><div class="cnt">${esc(typeName(h.p.type))} · изменено ${fmtDate(h.p.updated)}</div></li>`).join('')}</ul>`}),'Поиск');
}

/* ---------- создание ---------- */
function viewNew(title,focusImport){
  $('#main').classList.remove('is-main');
  const content=`${wiImportHTML(focusImport?title:'')}<h2>Новая статья по шаблону</h2><p>Выберите шаблон карточки. Любые строки карточки потом можно убрать, добавить или переставить.</p>
  <label class="fld"><span>Название статьи</span><input id="np-title" value="${esc(title||'')}" placeholder="Например: Битва при Тоболе"></label>
  <div class="tgrid">${Object.entries(TPL).map(([k,t])=>`<button class="tcard" data-act="create-page" data-tpl="${k}"><b>${t.name}</b><span>${t.desc}</span></button>`).join('')}</div>`;
  setView(mainMenuHTML(),shell({title:'Создание статьи',content}),'Создание статьи');
  setTimeout(()=>{if(focusImport){$('#wi')?.scrollIntoView();$('#wi-q')?.focus();}else $('#np-title')?.focus();},20);
}

/* ---------- медиатека ---------- */
function fbParams(){return {layout:$('#fb-layout').value,c1:$('#fb-c1').value,c2:$('#fb-c2').value,c3:$('#fb-c3').value,sym:$('#fb-sym').value,sc:$('#fb-sc').value};}
function viewMedia(){
  $('#main').classList.remove('is-main');
  const content=`<p>Флаги, гербы, портреты, карты. Картинки хранятся внутри проекта и уменьшаются до 900 пикселей по большей стороне. В тексте их зовут по имени: <code>{{флаг|Имя}}</code>, <code>[[Файл:Имя|Подпись]]</code>. Если переименовать картинку, ссылки на неё обновятся во всех статьях.</p>
  <p><label class="btn pri">Загрузить картинки<input type="file" accept="image/*" multiple data-upmedia="1" hidden></label> <a class="btn" href="#/map/">Нарисовать карту</a></p>
  <div class="mgrid">${P.media.map((m,i)=>`<div class="mitem"><div class="mthumb">${m.src?`<img src="${m.src}" alt="">`:'<span class="cnt">карта рисуется…</span>'}</div><input id="m-name-${i}" value="${esc(m.name)}" data-mrename="${i}" aria-label="Имя картинки"><div class="r">${m.map?`<a class="btn sm" href="#/map/${slug(m.name)}">Изменить карту</a>`:`<button class="btn sm" data-act="mcopy" data-i="${i}">Код флага</button>`}<button class="btn sm danger" data-act="mdel" data-i="${i}">Удалить</button></div></div>`).join('')||'<p>Пока пусто.</p>'}</div>
  <h2>Конструктор флагов</h2>
  <div class="fb"><div class="ctl">
    <label class="fld"><span>Схема</span><select id="fb-layout"><option value="h3">Три горизонтальные полосы</option><option value="h2">Две горизонтальные полосы</option><option value="v3">Три вертикальные полосы</option><option value="v2">Две вертикальные полосы</option><option value="nordic">Скандинавский крест</option><option value="canton">Крыж и поле</option><option value="tri">Треугольник у древка</option><option value="diag">По диагонали</option><option value="h1">Одноцветный</option></select></label>
    <div class="line"><label class="inl">Цвет 1 <input type="color" id="fb-c1" value="#ffffff"></label><label class="inl">Цвет 2 <input type="color" id="fb-c2" value="#1d4fa0"></label><label class="inl">Цвет 3 <input type="color" id="fb-c3" value="#c8102e"></label></div>
    <div class="line"><label class="inl">Знак <select id="fb-sym"><option value="">нет</option><option value="star">звезда</option><option value="disk">круг</option><option value="ring">кольцо</option></select></label><label class="inl">Цвет знака <input type="color" id="fb-sc" value="#f2c230"></label></div>
    <label class="fld"><span>Имя в медиатеке</span><input id="fb-name" placeholder="Например: Уральская Республика"></label>
    <div><button class="btn pri" data-act="fb-add">Добавить флаг</button></div>
  </div><img id="fb-prev" alt="Предпросмотр флага" src="${flagSVG({layout:'h3',c1:'#ffffff',c2:'#1d4fa0',c3:'#c8102e'})}"></div>`;
  setView(mainMenuHTML(),shell({title:'Медиатека',content}),'Медиатека');
}

/* ---------- файл проекта ---------- */
function viewFile(){
  $('#main').classList.remove('is-main');
  const kb=Math.round(JSON.stringify(P).length/1024);
  const src={local:'ваша копия в этом браузере (вы что-то меняли)',published:'опубликованная версия с сайта — вы её ещё не меняли',sample:'встроенный пример'}[state.source]||'';
  const content=`<div class="notice"><p><b>Сейчас открыта:</b> ${src}. Размер проекта ≈ ${kb} КБ.</p>
  <p>Правки сохраняются только в этом браузере. Чтобы их увидели все посетители сайта, скачайте <code>wiki.json</code> и замените им файл <code>data/wiki.json</code> на сервере.</p></div>
  <h2>Сохранить</h2>
  <p><button class="btn pri" data-act="dl-json" data-n="wiki.json">Скачать wiki.json для публикации</button> <button class="btn" data-act="dl-json" data-n="">Скачать резервную копию</button></p>
  <h2>Загрузить</h2>
  <p>Файл проекта (.json): его можно добавить к текущим статьям или заменить ими всё.</p>
  <p><label class="btn">Выбрать файл<input type="file" accept=".json,application/json,text/plain" id="imp-file" hidden></label> <span id="imp-name" class="cnt">файл не выбран</span></p>
  <p><button class="btn" data-act="imp-merge">Добавить к текущему</button> <button class="btn danger" data-act="imp-replace">Заменить текущий</button></p>
  <p><button class="btn" data-act="load-published">Загрузить опубликованную версию с сайта</button></p>
  <h2>Настройки вики</h2>
  <div class="settings">
    <label class="fld"><span>Название</span><input id="s-name" data-scope="proj" data-p="wiki.name" value="${esc(P.wiki.name)}"></label>
    <label class="fld"><span>Слоган под логотипом (можно оставить пустым)</span><input id="s-motto" data-scope="proj" data-p="wiki.motto" value="${esc(P.wiki.motto)}"></label>
    <label class="fld"><span>Строка под заголовком статьи</span><input id="s-tag" data-scope="proj" data-p="wiki.tag" value="${esc(P.wiki.tag)}"></label>
    <label class="fld"><span>Приветствие на заглавной</span><input id="s-welcome" data-scope="proj" data-p="wiki.welcome" value="${esc(P.wiki.welcome)}"></label>
    <label class="fld"><span>Избранная статья</span><select id="s-featured" data-scope="proj" data-p="featured">${P.pages.map(p=>`<option value="${p.id}"${p.id===P.featured?' selected':''}>${esc(p.title)}</option>`).join('')}</select></label>
  </div>
  <h2>Внешний вид</h2><div class="ap-inline">${appearanceHTML('f')}</div>
  <h2>Начать заново</h2>
  <p><button class="btn danger" data-act="reset-sample">Загрузить пример про Сибирь</button> <button class="btn danger" data-act="reset-empty">Удалить все статьи</button></p>`;
  setView(mainMenuHTML(),shell({title:'Файл проекта',content}),'Файл проекта');
}
let importText='';
function doImport(mode){
  if(!importText){toast('Сначала выберите файл проекта',true);return;}
  let d;try{d=normalize(JSON.parse(importText));}catch(e){toast('Не получилось прочитать файл: '+(e.message||e),true);return;}
  if(mode==='replace')P=d;
  else{
    const ren=[];
    const same=(x,m)=>m.map?JSON.stringify(x.map)===JSON.stringify(m.map):x.src===m.src;
    for(const m of d.media){let n=m.name;if(P.media.some(x=>x.name===n&&!same(x,m))){n=uniqueName(n);ren.push(m.name+' → '+n);}if(!P.media.some(x=>x.name===n))P.media.push(Object.assign({},m,{name:n}));}
    for(const p of d.pages){p.id=uid();P.pages.push(p);}
    if(ren.length)toast('Часть картинок переименована: '+ren.join(', '));
  }
  save();applyBrand();toast(mode==='replace'?'Проект заменён':'Статьи добавлены');location.hash='#/';route();
  renderStoredMaps().then(ok=>{if(ok)route();});
}

/* ---------- редактор ---------- */
const TB=[
  ['Ж',"'''","'''",'жирный'],['К',"''","''",'курсив'],['[[ссылка]]','[[',']]','Статья'],['Красная ссылка','[[!',']]','Статья'],['Раздел','\n== ',' ==\n','Раздел'],
  ['Сноска','<ref>','</ref>','Источник'],['Список','\n* ','','пункт'],['Флаг','{{флаг|','}}','Сибирь'],['Флаг без названия','{{флаг-|','}}','Сибирь|Сибирская Республика'],['Цвет','{{цвет|','}}','#3366cc'],
  ['Картинка','\n[[Файл:','|200px|Подпись]]\n','__MEDIA__'],['Таблица','\n{| class="wikitable"\n! Заголовок 1 !! Заголовок 2\n|-\n| ',' || ячейка\n|}\n','ячейка'],
  ['Осн. статья','{{основная статья|','}}','Статья'],['↗ рост','{{рост|','}}','5'],['↘ падение','{{падение|','}}','5'],['▶ плеер','{{плеер|','}}','1:13'],['и. о.','{{и. о.','}}',''],
];
const inp=(path,val,ph='')=>`<input id="${fid(path)}" data-p="${path}" value="${esc(val)}" placeholder="${esc(ph)}">`;
const ta=(path,val,ph='',rows)=>`<textarea id="${fid(path)}" data-p="${path}" rows="${rows||Math.min(6,Math.max(1,String(val||'').split('\n').length))}" placeholder="${esc(ph)}">${esc(val)}</textarea>`;
const ta1=(path,val,ph='')=>`<textarea class="one" id="${fid(path)}" data-p="${path}" rows="${Math.max(1,String(val||'').split('\n').length)}" placeholder="${esc(ph)}">${esc(val)}</textarea>`;
const num=(path,val,min,max)=>`<input type="number" id="${fid(path)}" data-p="${path}" value="${esc(val)}"${min!=null?` min="${min}"`:''}${max!=null?` max="${max}"`:''}>`;
const col=(path,val)=>`<input type="color" id="${fid(path)}" data-p="${path}" value="${esc(/^#[0-9a-f]{6}$/i.test(val)?val:'#888888')}" aria-label="Цвет">`;
function picker(path,val,label){
  const s=mediaSrc(val);
  return `<div class="pick">${label?`<span class="pick-l">${label}</span>`:''}<span class="pthumb">${s?`<img src="${s}" alt="">`:''}</span><select id="${fid(path)}" data-p="${path}" aria-label="${label||'Изображение'}"><option value="">— нет —</option>${P.media.map(m=>`<option value="${esc(m.name)}"${m.name===val?' selected':''}>${esc(m.name)}</option>`).join('')}${val&&!s?`<option value="${esc(val)}" selected>${esc(val)} (нет в медиатеке)</option>`:''}</select><label class="btn sm" title="Загрузить картинку с компьютера">Загрузить<input type="file" accept="image/*" data-up="${path}" hidden></label></div>`;
}
const rbtns=(i,dup=true)=>`<span class="rbtns"><span class="drag" data-drag="${i}" title="Перетащите, чтобы переставить строку" aria-label="Перетащить строку">⠿</span><button class="ic" data-act="row-up" data-i="${i}" aria-label="Выше" title="Выше">↑</button><button class="ic" data-act="row-down" data-i="${i}" aria-label="Ниже" title="Ниже">↓</button>${dup?`<button class="ic" data-act="row-dup" data-i="${i}" aria-label="Копировать строку" title="Копировать">⧉</button>`:''}<button class="ic x" data-act="row-del" data-i="${i}" aria-label="Удалить строку" title="Удалить">✕</button></span>`;
function rowEditor(r,i){
  const p='ib.rows.'+i;
  if(r.t==='field')return `<div class="rw f" data-row="${i}">${ta1(p+'.label',r.label,'Подпись')}${ta(p+'.value',r.value,r.ph||'Значение')}${rbtns(i,false)}</div>`;
  if(r.t==='header')return `<div class="rw h" data-row="${i}"><div class="rw-line">${ta1(p+'.text',r.text,'Заголовок раздела или название должности')}${rbtns(i,false)}</div><div class="two">${picker(p+'.l',r.l,'Слева')}${picker(p+'.r',r.r,'Справа')}</div></div>`;
  if(r.t==='hr')return `<div class="rw f hr" data-row="${i}"><span class="rw-type">Разделительная линия</span><span></span>${rbtns(i,false)}</div>`;
  let x='';
  switch(r.t){
    case 'text':x=ta(p+'.value',r.value,r.ph||'Текст по центру карточки');break;
    case 'below':x=ta(p+'.value',r.value,'Текст нижней строки');break;
    case 'anthem':x=`<div class="line">${inp(p+'.label',r.label,'Подпись, например: Гимн')}<label class="inl">Длительность ${inp(p+'.dur',r.dur,'1:13')}</label></div>${ta(p+'.value',r.value,'Название гимна, например: «Славься, Сибирь»')}<span class="cnt">Плеер ненастоящий: кнопка ▶ запускает только полосу и время. Пустая длительность убирает плеер.</span>`;break;
    case 'image':x=`${picker(p+'.src',r.src)}<div class="line"><button class="btn sm" data-act="map-for" data-path="${p}.src">Нарисовать карту</button>${P.media.some(m=>m.map&&m.name===r.src)?`<a class="btn sm" href="#/map/${slug(r.src)}">Изменить эту карту</a>`:''}</div><div class="line">${ta1(p+'.caption',r.caption,'Подпись под картинкой')}<label class="inl">Ширина, px ${num(p+'.w',r.w,40,400)}</label></div>`;break;
    case 'images2':x=`<div class="two"><div class="fld">${picker(p+'.src1',r.src1)}${inp(p+'.cap1',r.cap1,'Подпись')}</div><div class="fld">${picker(p+'.src2',r.src2)}${inp(p+'.cap2',r.cap2,'Подпись')}</div></div>`;break;
    case 'cols':x=`${ta1(p+'.label',r.label,'Заголовок над колонками')}<div class="cells">${r.cells.map((c,j)=>`<div class="cell">${ta(p+'.cells.'+j,c,'Сторона '+(j+1))}${r.cells.length>1?`<button class="ic x" data-act="cell-del" data-i="${i}" data-j="${j}" aria-label="Убрать колонку">✕</button>`:''}</div>`).join('')}</div><div><button class="btn sm" data-act="cell-add" data-i="${i}">+ колонка</button></div>`;break;
    case 'succ':x=`<div class="two">${inp(p+'.prev',r.prev,'← Предшественник')}${inp(p+'.next',r.next,'Преемник →')}</div>${inp(p+'.label',r.label,'Подпись посередине (необязательно)')}`;break;
    case 'seats':x=`${inp(p+'.label',r.label,'Подпись')}<div class="line"><label class="inl">Мест ${num(p+'.have',r.have,0)}</label><label class="inl">из ${num(p+'.total',r.total,1)}</label><label class="inl">Цвет ${col(p+'.color',r.color)}</label></div>`;break;
    case 'parl':{const tot=r.parties.reduce((a,q)=>a+(+q.seats||0),0);
      x=`${inp(p+'.label',r.label,'Заголовок')}<div class="plist2">${r.parties.map((q,j)=>`<div class="prow">${inp(p+'.parties.'+j+'.name',q.name,'Партия')}${num(p+'.parties.'+j+'.seats',q.seats,0)}${col(p+'.parties.'+j+'.color',q.color)}<button class="ic x" data-act="party-del" data-i="${i}" data-j="${j}" aria-label="Убрать партию">✕</button></div>`).join('')}</div><div class="line"><button class="btn sm" data-act="party-add" data-i="${i}">+ партия</button><label class="inl"><input type="checkbox" id="${fid(p+'.legend')}" data-p="${p}.legend"${r.legend?' checked':''}> легенда</label><span class="cnt">всего мест: ${tot}</span></div>`;break;}
    case 'cands':{const n=r.cands.length;
      x=`<div class="line"><label class="inl">В ряду по ${num(p+'.per',r.per,1,5)}</label></div>
      <div class="clist">${r.cands.map((c,j)=>`<div class="citem"><div class="citem-h"><span class="rw-type">№ ${j+1}</span><button class="ic x" data-act="cand-del" data-i="${i}" data-j="${j}" aria-label="Убрать кандидата">✕</button></div>${picker(p+'.cands.'+j+'.src',c.src)}${inp(p+'.cands.'+j+'.name',c.name,'Имя')}<label class="inl">Цвет ${col(p+'.cands.'+j+'.color',c.color)}</label></div>`).join('')}</div>
      <div><button class="btn sm" data-act="cand-add" data-i="${i}">+ кандидат</button></div>
      <div class="stats"><span class="cnt">Строки данных: подпись, затем значение для каждого кандидата</span>${r.stats.map((s,k)=>`<div class="stat" style="grid-template-columns:minmax(110px,1.3fr) repeat(${n},minmax(80px,1fr)) auto">${inp(p+'.stats.'+k+'.label',s.label,'Подпись')}${r.cands.map((c,j)=>inp(p+'.stats.'+k+'.values.'+j,(s.values||[])[j]||'','№ '+(j+1))).join('')}<button class="ic x" data-act="stat-del" data-i="${i}" data-j="${k}" aria-label="Убрать строку">✕</button></div>`).join('')}</div>
      <div><button class="btn sm" data-act="stat-add" data-i="${i}">+ строка данных</button></div>`;break;}
  }
  return `<div class="rw" data-row="${i}"><div class="rw-h"><span class="rw-type">${ROWTYPES[r.t]?ROWTYPES[r.t][0]:r.t}</span>${rbtns(i)}</div>${x}</div>`;
}
let edPage=null;
function editorForm(pg){
  return `<div class="ed-bar"><span class="tb">${TB.map((b,k)=>`<button data-tb="${k}" title="Вставить в последнее поле, где стоял курсор">${esc(b[0])}</button>`).join('')}</span></div>
  <div class="ed-top"><a class="btn pri" href="#/wiki/${slug(pg.title)}">Готово — к статье</a><span id="ed-status" class="cnt">Изменения сохраняются в этом браузере сами</span></div>
  <fieldset class="grp"><legend>Статья</legend>
    <label class="fld"><span>Название</span>${inp('title',pg.title)}</label>
    <label class="fld"><span>Пометка над текстом</span>${inp('hatnote',pg.hatnote,'Например: Об одноимённом городе см. [[Омск]]')}</label>
  </fieldset>
  <fieldset class="grp"><legend>Карточка</legend>
    <label class="fld"><span>Надпись над заголовком карточки</span>${ta1('ib.above',pg.ib.above||'','Например: Город-государство под протекторатом [[Лига Наций|Лиги Наций]]')}</label>
    <label class="fld"><span>Заголовок карточки</span>${ta1('ib.title',pg.ib.title)}</label>
    <div class="line"><label class="inl"><input type="checkbox" id="f-ib-custom" data-p="ib.custom"${pg.ib.custom?' checked':''}> свой цвет шапок</label>${col('ib.theme',pg.ib.theme)}<label class="inl">Ширина, em ${num('ib.w',pg.ib.w,14,40)}</label></div>
    <div id="rows">${pg.ib.rows.map(rowEditor).join('')}</div>
    <div class="addrow"><select id="addrow-type" aria-label="Тип строки">${Object.entries(ROWTYPES).map(([k,v])=>`<option value="${k}">${v[0]}</option>`).join('')}</select><button class="btn" data-act="add-row">Добавить строку</button></div>
  </fieldset>
  <fieldset class="grp"><legend>Текст статьи</legend>
    <textarea id="f-body" data-p="body" class="mono" rows="24" spellcheck="true">${esc(pg.body)}</textarea>
    <details class="cheat"><summary>Шпаргалка по разметке</summary><table><tbody>
      <tr><td><code>'''жирный'''</code> <code>''курсив''</code></td><td>начертание</td></tr>
      <tr><td><code>[[Статья]]</code> <code>[[Статья|текст]]</code></td><td>ссылка, всегда синяя; если статьи ещё нет — по ней можно её создать</td></tr>
      <tr><td><code>[[!Статья]]</code> <code>[[!Статья|текст]]</code> <code>{{красная ссылка|Статья}}</code></td><td>красная ссылка, как у Википедии на ненаписанные статьи</td></tr>
      <tr><td><code>== Раздел ==</code> <code>=== Подраздел ===</code></td><td>заголовки; из них строится оглавление слева</td></tr>
      <tr><td><code>* пункт</code> <code># пункт</code> <code>** вложенный</code></td><td>списки (в карточке тоже)</td></tr>
      <tr><td><code>&lt;ref&gt;Источник&lt;/ref&gt;</code></td><td>сноска; повтор: <code>&lt;ref name="a"&gt;…&lt;/ref&gt;</code> и <code>&lt;ref name="a"/&gt;</code>; место списка — <code>{{примечания}}</code></td></tr>
      <tr><td><code>{{флаг|Сибирь|Сибирская Республика}}</code></td><td>флаг из медиатеки и ссылка</td></tr>
      <tr><td><code>{{флагик|Сибирь}}</code></td><td>только флажок</td></tr>
      <tr><td><code>{{флаг-|Сибирь|Сибирская Республика}}</code></td><td>флажок-ссылка без названия: ведёт на статью, название видно при наведении</td></tr>
      <tr><td><code>{{цвет|#1d7a3e}}</code></td><td>цветной квадрат партии</td></tr>
      <tr><td><code>{{рост|5 %}}</code> <code>{{падение|3 %}}</code> <code>{{неизм}}</code></td><td>стрелки, как в статистике Википедии: ↗ зелёная, ↘ красная, → серая</td></tr>
      <tr><td><code>{{рост-|…}}</code> <code>{{падение+|…}}</code></td><td>наоборот: красный рост (например, безработицы) и зелёное падение</td></tr>
      <tr><td><code>{{▲|5}}</code> <code>{{▼|3}}</code> <code>{{▲-}}</code> <code>{{▼+}}</code> <code>{{▬}}</code></td><td>треугольники для результатов выборов (с минусом — красный, с плюсом — зелёный)</td></tr>
      <tr><td><code>{{плеер|1:13}}</code></td><td>фейковый аудиоплеер, как у гимна в Википедии (звука нет)</td></tr>
      <tr><td>подпись <code>• Итого</code></td><td>подстрока в карточке (обычным шрифтом); подпись <code>=ВВП (ППС)</code> — заголовок группы строк</td></tr>
      <tr><td><code>{{и. о.}}</code></td><td>и.&nbsp;о. с подсказкой</td></tr>
      <tr><td><code>[[Файл:Имя|200px|слева|Подпись]]</code></td><td>картинка-миниатюра из медиатеки</td></tr>
      <tr><td><code>{{основная статья|Статья}}</code> <code>{{см. также|А|Б}}</code></td><td>пометка под заголовком</td></tr>
      <tr><td><code>{| … |}</code></td><td>таблица (кнопка «Таблица»)</td></tr>
      <tr><td><code>&lt;br&gt; &lt;small&gt; &lt;s&gt; &lt;sup&gt;</code></td><td>разрешённые теги</td></tr>
      <tr><td><code>[https://адрес текст]</code></td><td>внешняя ссылка</td></tr>
    </tbody></table></details>
  </fieldset>
  <fieldset class="grp"><legend>Категории</legend>${ta('cats',pg.cats,'Через запятую: Государства альтернативной истории, 1918 год',2)}</fieldset>
  <div class="ed-top"><a class="btn pri" href="#/wiki/${slug(pg.title)}">Готово — к статье</a><button class="btn" data-act="dup-page">Создать копию</button><button class="btn danger" data-act="del-page">Удалить страницу</button></div>`;
}
function viewEdit(pg){
  edPage=pg;$('#main').classList.remove('is-main');
  const content=`<div class="ed-switch"><button data-act="ed-tab" data-v="form" class="${state.edTab==='form'?'on':''}">Правка</button><button data-act="ed-tab" data-v="prev" class="${state.edTab==='prev'?'on':''}">Предпросмотр</button></div>
  <div class="editor" data-tab="${state.edTab}"><div class="ed-form" id="edform">${editorForm(pg)}</div><div class="ed-prev"><div class="ed-prev-l">Предпросмотр</div><div id="edprev"></div></div></div>`;
  setView('',shell({title:`Редактирование: <span id="ed-title">${esc(pg.title)}</span>`,mode:'edit',pg,content,sub:false,foot:false}),'Редактирование: '+pg.title);
  renderEdPreview();
}
function rerenderForm(){
  const pg=edPage;if(!pg)return;const y=window.scrollY;
  $('#edform').innerHTML=editorForm(pg);window.scrollTo(0,y);
}
function renderEdPreview(){
  const el=$('#edprev');if(!el||!edPage)return;const pg=edPage;
  const {content}=articleParts(pg);
  el.innerHTML=`<h1 class="fh">${fmt(esc(pg.title))}</h1><div class="sitesub">${esc(P.wiki.tag)}</div><div class="mw-content">${content}${catlinksHTML(pg)}</div>`;
}
function insertTB(k){
  const b=TB[k];let el=document.getElementById(fid(state.lastP));if(!el||el.type==='color'||!$('#edform')?.contains(el))el=$('#f-body');if(!el)return;
  let ph=b[3];if(ph==='__MEDIA__')ph=P.media[0]?.name||'Имя';
  const s=el.selectionStart??el.value.length,e2=el.selectionEnd??s;const sel=el.value.slice(s,e2)||ph;
  el.focus();el.setRangeText(b[1]+sel+b[2],s,e2,'end');el.selectionStart=s+b[1].length;el.selectionEnd=s+b[1].length+sel.length;
  el.dispatchEvent(new Event('input',{bubbles:true}));
}

/* ---------- картинки ---------- */
function readImage(file){
  return new Promise((res,rej)=>{const fr=new FileReader();fr.onerror=()=>rej(fr.error);fr.onload=()=>{
    const url=fr.result;if(/svg|gif/.test(file.type))return res(url);
    const img=new Image();img.onerror=()=>res(url);img.onload=()=>{
      const k=Math.min(1,900/Math.max(img.width,img.height));const c=document.createElement('canvas');
      c.width=Math.max(1,Math.round(img.width*k));c.height=Math.max(1,Math.round(img.height*k));c.getContext('2d').drawImage(img,0,0,c.width,c.height);
      res(/png|webp/.test(file.type)?c.toDataURL('image/png'):c.toDataURL('image/jpeg',.86));};img.src=url;};fr.readAsDataURL(file);});
}
function uniqueName(base){base=(base||'Картинка').replace(/\.[a-z0-9]+$/i,'').trim()||'Картинка';let n=base,k=2;while(P.media.some(m=>m.name===n))n=`${base} (${k++})`;return n;}
async function addFiles(files){const names=[];for(const f of files){try{const src=await readImage(f);const name=uniqueName(f.name);P.media.push({name,src});names.push(name);}catch(e){}}return names;}
function renameMedia(i,nn){
  const old=P.media[i].name;nn=nn.trim();if(!nn||nn===old)return false;
  if(P.media.some(m=>m.name===nn)){toast('Картинка с таким именем уже есть',true);return false;}
  P.media[i].name=nn;
  const reEsc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const re=new RegExp('(\\{\\{\\s*(?:флаг-|флаг|флагик|flag|flagicon|флагификация|флагссылка)\\s*\\|\\s*|\\[\\[(?:Файл|File|Изображение|Image):\\s*)'+reEsc(old)+'(?=\\s*[|}\\]])','gi');
  const walk=o=>{for(const k in o){const v=o[k];if(typeof v==='string'){if(/^(src\d?|l|r)$/.test(k)&&v===old)o[k]=nn;else o[k]=v.replace(re,'$1'+nn);}else if(v&&typeof v==='object')walk(v);}};
  P.pages.forEach(walk);return true;
}

/* ---------- выгрузка ---------- */
/* внешние картинки (Википедия) перезагружаем с crossorigin, иначе снимок выходит без них */
async function prepImgs(root){
  const ext=[...root.querySelectorAll('img')].filter(i=>/^https?:/.test(i.getAttribute('src')||'')&&!i.crossOrigin);
  await Promise.all(ext.map(i=>new Promise(res=>{const done=()=>{i.removeEventListener('load',done);i.removeEventListener('error',done);res();};i.addEventListener('load',done);i.addEventListener('error',done);i.crossOrigin='anonymous';const s=i.src;i.src='';i.src=s;setTimeout(done,15000);})));
}
async function snap(which){
  if(!window.html2canvas){toast('Модуль снимков не загрузился — проверьте интернет и обновите страницу',true);return;}
  const area=$('#main .snap-area');const target=which==='ib'?$('#main .infobox'):area;
  if(!target){toast('У этой страницы нет карточки',true);return;}
  toast('Готовлю картинку…');
  const ed=$$('.mw-editsection,.toc-mobile,.sitesub-r',area);ed.forEach(e=>e.style.visibility='hidden');
  /* «главное»: всё, что выше первого раздела, — заголовок, вступление и карточка */
  const cut=[];$$('.tabs',area).forEach(el=>{cut.push([el,el.style.display]);el.style.display='none';});if(which==='lead'){const mc=$('.mw-content',area);let past=false;for(const el of [...mc.children]){if(/^H[2-4]$/.test(el.tagName))past=true;if((past&&!el.classList.contains('clear'))||el.matches('.toc-mobile,.reflist,.catlinks')){cut.push([el,el.style.display]);el.style.display='none';}}}
  closeIE();
  try{
    await prepImgs(target);
    const cv=await html2canvas(target,{backgroundColor:getComputedStyle(document.body).backgroundColor,scale:2,logging:false,useCORS:true,imageTimeout:20000});
    cv.toBlob(b=>download(((cur()?.title)||'статья')+(which==='ib'?' — карточка':which==='lead'?' — главное':'')+'.png',b));
  }catch(e){toast('Не получилось сделать снимок: '+(e.message||e),true);}
  finally{ed.forEach(e=>e.style.visibility='');cut.forEach(([el,d])=>el.style.display=d);}
}
function cur(){const {k,arg}=parseHash();if(k==='edit')return edPage;if(k==='wiki')return pageFind(arg);return null;}
async function dlHTML(pg){
  let css='';try{css=await (await fetch('css/site.css')).text();}catch(e){}
  const {content}=articleParts(pg);
  download(pg.title+'.html',`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(pg.title)} — ${esc(P.wiki.name)}</title><style>${css}body{padding:24px}.export{max-width:1100px;margin:0 auto}</style></head><body><main class="export"><h1 class="fh">${fmt(esc(pg.title))}</h1><div class="sitesub">${esc(P.wiki.tag)}</div><div class="mw-content">${content}${catlinksHTML(pg)}</div></main></body></html>`,'text/html');
}

/* ---------- меню ---------- */
function closeMenus(){$('#menu').hidden=true;$('#burger').setAttribute('aria-expanded','false');$$('.dd-menu').forEach(m=>m.hidden=true);$('#sugg').hidden=true;}
function renderMenu(){$('#menu').innerHTML=`<div class="menu-col">${mainMenuHTML()}</div><div class="menu-col menu-ap"><div class="side-h">Внешний вид</div>${appearanceHTML('m')}</div>`;}
function suggest(q){
  const n=norm(q),box=$('#sugg');if(!n){box.hidden=true;return;}
  const hits=P.pages.filter(p=>norm(p.title).includes(n)).sort((a,b)=>norm(a.title).indexOf(n)-norm(b.title).indexOf(n)).slice(0,8);
  box.innerHTML=hits.map(p=>`<li><a href="#/wiki/${slug(p.title)}"><b>${esc(p.title)}</b><span>${esc(typeName(p.type))}</span></a></li>`).join('')+`<li class="sugg-all"><a href="#/search/${slug(q)}">Искать страницы, содержащие «${esc(q)}»</a></li>`;
  box.hidden=false;
}

/* ---------- события ---------- */
document.addEventListener('input',e=>{
  const el=e.target;
  if(el.id==='q'){suggest(el.value);return;}
  if(el.id&&el.id.startsWith('fb-')&&el.id!=='fb-name'){$('#fb-prev').src=flagSVG(fbParams());return;}
  if(el.dataset.ap){APP[el.dataset.ap]=el.value;try{localStorage.setItem(LSA,JSON.stringify(APP));}catch(x){}applyAppearance();$$(`input[data-ap="${el.dataset.ap}"][value="${el.value}"]`).forEach(r=>r.checked=true);return;}
  const p=el.dataset.p;if(!p)return;
  if(el.dataset.scope==='proj'){setPath(P,p,el.value);applyBrand();clearTimeout(svT);svT=setTimeout(save,500);return;}
  const pg=edPage;if(!pg||!$('#edform')?.contains(el))return;
  let v=el.type==='checkbox'?el.checked:el.type==='number'?(el.value===''?'':+el.value):el.value;
  if(p==='title'){
    if(pg.ib.title===pg.title){pg.ib.title=v;const f=$('#f-ib-title');if(f)f.value=v;}
    const t=$('#ed-title');if(t)t.textContent=v;document.title='Редактирование: '+v+' — '+P.wiki.name;
    $$('#edform a.btn.pri').forEach(a=>a.href='#/wiki/'+slug(v));
  }
  setPath(pg,p,v);
  if(el.tagName==='SELECT'&&el.closest('.pick')){const s=mediaSrc(v);el.closest('.pick').querySelector('.pthumb').innerHTML=s?`<img src="${s}" alt="">`:'';}
  if(el.tagName==='TEXTAREA'&&el.id!=='f-body'){const n=Math.max(1,el.value.split('\n').length);if(el.classList.contains('one'))el.rows=Math.min(8,n);else if(el.scrollHeight>el.clientHeight+2)el.rows=Math.min(12,Math.max(el.rows||1,n));}
  changed(pg);
});
document.addEventListener('focusin',e=>{const p=e.target.dataset?.p;if(p&&(e.target.tagName==='TEXTAREA'||(e.target.tagName==='INPUT'&&!['number','color','checkbox'].includes(e.target.type))))state.lastP=p;});
document.addEventListener('change',async e=>{
  const el=e.target;
  if(el.dataset.up){const names=await addFiles([...el.files]);if(names[0]&&edPage){setPath(edPage,el.dataset.up,names[0]);rerenderForm();changed(edPage);}return;}
  if(el.dataset.upmedia){const n=await addFiles([...el.files]);save();viewMedia();if(n.length)toast('Добавлено картинок: '+n.length);return;}
  if(el.dataset.mrename!=null){if(renameMedia(+el.dataset.mrename,el.value)){save();viewMedia();toast('Переименовано, ссылки в статьях обновлены');}else el.value=P.media[+el.dataset.mrename].name;return;}
  if(el.id==='imp-file'&&el.files[0]){const f=el.files[0];importText=await f.text();$('#imp-name').textContent=f.name+' — выберите, добавить или заменить';return;}
  if(el.dataset.p&&edPage&&/\.(cands\.\d+\.name|parties\.\d+\.seats)$/.test(el.dataset.p))rerenderForm();
});
function armed(btn,label){if(btn.dataset.armed)return true;btn.dataset.armed='1';const o=btn.textContent;btn.textContent=label;setTimeout(()=>{if(btn.isConnected){delete btn.dataset.armed;btn.textContent=o;}},3500);return false;}
document.addEventListener('submit',e=>{
  e.preventDefault();
  const q=(e.target.id==='search'?$('#q'):$('#q2'))?.value.trim()||'';if(!q)return;
  const p=pageFind(q);location.hash=p?'#/wiki/'+slug(p.title):'#/search/'+slug(q);$('#q').blur();
});
/* фейковый плеер гимна: звука нет, идёт только время */
function fpToggle(pl){
  if(pl._t){clearInterval(pl._t);pl._t=null;pl.classList.remove('on');pl.setAttribute('aria-label','Воспроизвести аудио');return;}
  const d=+pl.dataset.dur||73;if((pl._pos||0)>=d)pl._pos=0;
  pl.classList.add('on');pl.setAttribute('aria-label','Пауза');
  const tick=()=>{pl._pos=(pl._pos||0)+.25;const k=Math.min(1,pl._pos/d);pl.querySelector('.fp-fill').style.width=(k*100)+'%';pl.querySelector('.fp-dur').textContent=fmtDur(k<1?pl._pos:d);
    if(k>=1){clearInterval(pl._t);pl._t=null;pl.classList.remove('on');setTimeout(()=>{if(!pl._t){pl._pos=0;pl.querySelector('.fp-fill').style.width='0';pl.querySelector('.fp-dur').textContent=fmtDur(d);}},900);}};
  tick();pl._t=setInterval(tick,250);
}
document.addEventListener('keydown',e=>{const pl=e.target.closest&&e.target.closest('.fplayer');if(pl&&(e.key==='Enter'||e.key===' ')){e.preventDefault();fpToggle(pl);}});
/* ---------- правка прямо на странице (двойной щелчок) ---------- */
let IE=null;
function closeIE(silent){if(!IE)return;IE.box.remove();if(IE.hidden)IE.hidden.hidden=false;if(IE.cell)IE.cell.innerHTML=IE.html;IE=null;}
function ieBox(val,hint){
  const box=document.createElement('div');box.className='ie';
  box.innerHTML=`<textarea class="ie-ta" spellcheck="true" aria-label="Текст для правки"></textarea><div class="ie-bar"><button class="btn pri sm" data-ie="ok">Сохранить</button><button class="btn sm" data-ie="no">Отмена</button><span class="cnt">${hint||'Ctrl+Enter — сохранить, Esc — отмена'}</span></div>`;
  const ta=box.querySelector('textarea');ta.value=val;
  const fit=()=>{ta.style.height='auto';ta.style.height=Math.min(window.innerHeight*.7,ta.scrollHeight+4)+'px';};ta.addEventListener('input',fit);setTimeout(()=>{fit();ta.focus();ta.setSelectionRange(ta.value.length,ta.value.length);},0);
  return box;
}
/* что править в строке карточки: [объект, поле] или null — тогда только в редакторе */
function ieTarget(pg,key,cell){
  if(key==='title'||key==='above')return [pg.ib,key];
  if(key==='hatnote')return [pg,'hatnote'];
  const r=pg.ib.rows[+key];if(!r)return null;
  switch(r.t){
    case 'field':return [r,cell&&cell.tagName==='TH'||cell&&cell.classList.contains('ib-sub')?'label':'value'];
    case 'header':return [r,'text'];
    case 'text':case 'below':return [r,'value'];
    case 'anthem':return [r,'value'];
    case 'image':return [r,'caption'];
    case 'seats':return cell&&cell.tagName==='TH'?[r,'label']:null;
    default:return null;
  }
}
function ieOpen(e){
  if(parseHash().k!=='wiki')return;const pg=cur();if(!pg)return;
  const t=e.target;if(!t.closest('#main .mw-content')||t.closest('.ie,a,button,input,textarea,select,.fplayer,.mw-editsection,.toc-mobile,.reflist'))return;
  if(IE){IE.box.querySelector('textarea').focus();return;}
  const ib=t.closest('[data-ib]');
  if(ib){
    const key=ib.dataset.ib;const cell=t.closest('td,th')||ib;const tg=ieTarget(pg,key,cell);
    if(!tg){toast('Эту строку карточки можно изменить только в редакторе');return;}
    const [o,f]=tg;e.preventDefault();window.getSelection()?.removeAllRanges();
    const box=ieBox(String(o[f]??''),'Ctrl+Enter — сохранить, Esc — отмена');
    if(key==='hatnote'){ib.hidden=true;ib.after(box);IE={box,pg,hidden:ib,apply:v=>{o[f]=v;}};}
    else{const html=cell.innerHTML;cell.innerHTML='';cell.appendChild(box);IE={box,pg,cell,html,apply:v=>{o[f]=v;}};}
    return;
  }
  const bl=t.closest('[data-l]');if(!bl||!bl.closest('#main .mw-content'))return;
  const [a,b]=bl.dataset.l.split('-').map(Number);
  const lines=String(pg.body||'').replace(/\r/g,'').split('\n');
  e.preventDefault();window.getSelection()?.removeAllRanges();
  const box=ieBox(lines.slice(a,b+1).join('\n'),'Ctrl+Enter — сохранить, Esc — отмена. Разметка та же, что в редакторе; пустая строка начинает новый абзац');
  bl.hidden=true;bl.after(box);
  IE={box,pg,hidden:bl,apply:v=>{const L=String(pg.body||'').replace(/\r/g,'').split('\n');L.splice(a,b-a+1,...(v.trim()?v.replace(/\r/g,'').split('\n'):[]));pg.body=L.join('\n').replace(/\n{3,}/g,'\n\n');}};
}
function ieSave(){
  if(!IE)return;const {pg,apply,box}=IE;const v=box.querySelector('textarea').value;
  apply(v);pg.updated=Date.now();save();
  const y=window.scrollY;IE=null;viewArticle(pg);window.scrollTo(0,y);toast('Сохранено');
}
document.addEventListener('dblclick',ieOpen);
document.addEventListener('keydown',e=>{if(!IE||!e.target.closest('.ie'))return;if(e.key==='Escape'){e.preventDefault();closeIE();}else if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();ieSave();}});
document.addEventListener('click',e=>{
  const ieb=e.target.closest('[data-ie]');if(ieb){e.preventDefault();ieb.dataset.ie==='ok'?ieSave():closeIE();return;}
  const fp=e.target.closest('.fplayer');if(fp){e.preventDefault();fpToggle(fp);return;}
  const tb=e.target.closest('[data-tb]');if(tb){e.preventDefault();insertTB(+tb.dataset.tb);return;}
  const j=e.target.closest('[data-jump],[data-cite],[data-back]');
  if(j){e.preventDefault();const root=j.closest('#edprev')||document;
    const id=j.dataset.jump||(j.dataset.cite?'cite_note-'+j.dataset.cite:'cite_ref-'+j.dataset.back+'-1');
    const t=id==='top'?null:root.querySelector('#'+CSS.escape(id));
    if(id==='top')window.scrollTo({top:0,behavior:'smooth'});else if(t)t.scrollIntoView({behavior:'smooth',block:'start'});
    const d=j.closest('details.toc-mobile');if(d)d.open=false;return;}
  if(!e.target.closest('.dd'))$$('.dd-menu').forEach(m=>m.hidden=true);
  if(!e.target.closest('#menu,#burger'))$('#menu').hidden=true;
  if(!e.target.closest('#search'))$('#sugg').hidden=true;
  const btn=e.target.closest('[data-act]');if(!btn)return;
  const act=btn.dataset.act,i=+btn.dataset.i,jx=+btn.dataset.j;const pg=cur();const rows=edPage?.ib.rows;
  const re=()=>{rerenderForm();changed(edPage);};
  switch(act){
    case 'burger':{const m=$('#menu');if(m.hidden)renderMenu();m.hidden=!m.hidden;btn.setAttribute('aria-expanded',String(!m.hidden));break;}
    case 'dd':{const m=btn.nextElementSibling;m.hidden=!m.hidden;btn.setAttribute('aria-expanded',String(!m.hidden));break;}
    case 'toc-tg':{const li=btn.closest('li');const ul=li&&li.querySelector('ul');if(ul){ul.hidden=!ul.hidden;btn.setAttribute('aria-expanded',String(!ul.hidden));btn.classList.toggle('open',!ul.hidden);}break;}
    case 'ap-toggle':state.apHidden=!state.apHidden;renderTools();break;
    case 'toc-toggle':state.tocHidden=!state.tocHidden;$('.vtoc')?.classList.toggle('collapsed',state.tocHidden);btn.textContent=state.tocHidden?'показать':'скрыть';break;
    case 'ed-tab':state.edTab=btn.dataset.v;$('.editor').dataset.tab=state.edTab;$$('.ed-switch button').forEach(b=>b.classList.toggle('on',b.dataset.v===state.edTab));break;
    case 'create-page':{const t=($('#np-title')?.value||'').trim();if(t&&pageFind(t)){toast('Статья «'+t+'» уже есть — откройте её или выберите другое название',true);break;}const p=newPage(btn.dataset.tpl,t);P.pages.push(p);save();location.hash='#/edit/'+p.id;break;}
    case 'dup-page':if(pg){const c=JSON.parse(JSON.stringify(pg));c.id=uid();c.title+=' (копия)';c.ib.title=c.ib.title?c.ib.title+' (копия)':'';c.created=c.updated=Date.now();P.pages.splice(P.pages.indexOf(pg)+1,0,c);save();location.hash='#/edit/'+c.id;}break;
    case 'del-page':if(pg&&armed(btn,'Удалить навсегда?')){P.pages.splice(P.pages.indexOf(pg),1);if(P.featured===pg.id)P.featured=P.pages[0]?.id;edPage=null;save();toast('Страница «'+pg.title+'» удалена');location.hash='#/';}break;
    case 'feature':if(pg){P.featured=pg.id;save();toast('«'+pg.title+'» теперь избранная статья');closeMenus();}break;
    case 'snap':closeMenus();snap(btn.dataset.w);break;
    case 'dl-html':closeMenus();if(pg)dlHTML(pg);break;
    case 'add-row':{const t=$('#addrow-type').value;rows.push(ROWTYPES[t][1]());re();$$('#rows > .rw').pop()?.scrollIntoView({block:'center'});break;}
    case 'row-up':if(i>0){[rows[i-1],rows[i]]=[rows[i],rows[i-1]];re();}break;
    case 'row-down':if(i<rows.length-1){[rows[i+1],rows[i]]=[rows[i],rows[i+1]];re();}break;
    case 'row-dup':rows.splice(i+1,0,JSON.parse(JSON.stringify(rows[i])));re();break;
    case 'row-del':rows.splice(i,1);re();break;
    case 'cell-add':rows[i].cells.push('');re();break;
    case 'cell-del':rows[i].cells.splice(jx,1);re();break;
    case 'party-add':rows[i].parties.push({name:'Новая партия',seats:10,color:'#888888'});re();break;
    case 'party-del':rows[i].parties.splice(jx,1);re();break;
    case 'cand-add':rows[i].cands.push({name:'Кандидат '+(rows[i].cands.length+1),src:'',color:'#888888'});rows[i].stats.forEach(s=>{s.values=s.values||[];s.values[rows[i].cands.length-1]='';});re();break;
    case 'cand-del':rows[i].cands.splice(jx,1);rows[i].stats.forEach(s=>(s.values||[]).splice(jx,1));re();break;
    case 'stat-add':rows[i].stats.push({label:'',values:rows[i].cands.map(()=>'')});re();break;
    case 'stat-del':rows[i].stats.splice(jx,1);re();break;
    case 'mcopy':{const t='{{флаг|'+P.media[i].name+'}}';navigator.clipboard?.writeText(t).then(()=>toast('Скопировано: '+t),()=>toast(t));break;}
    case 'mdel':if(armed(btn,'Точно?')){P.media.splice(i,1);save();viewMedia();}break;
    case 'fb-add':{const name=uniqueName($('#fb-name').value.trim()||'Флаг');P.media.push({name,src:flagSVG(fbParams())});save();viewMedia();toast('Флаг «'+name+'» добавлен');break;}
    case 'dl-json':download(btn.dataset.n||(P.wiki.name+' '+new Date().toISOString().slice(0,10)+'.json'),serializeProject(true),'application/json');break;
    case 'imp-merge':doImport('merge');break;
    case 'imp-replace':if(armed(btn,'Заменить? Текущие статьи пропадут'))doImport('replace');break;
    case 'load-published':if(armed(btn,'Ваши правки в этом браузере пропадут. Точно?'))fetch('data/wiki.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw new Error('файл не найден');return r.json();}).then(d=>{P=normalize(d);try{localStorage.removeItem(LS);}catch(x){}state.source='published';applyBrand();toast('Загружена опубликованная версия');location.hash='#/';route();renderStoredMaps().then(ok=>{if(ok)route();});}).catch(err=>toast('Не получилось загрузить data/wiki.json: '+err.message,true));break;
    case 'reset-sample':if(armed(btn,'Точно? Текущие статьи пропадут')){P=sampleProject();save();applyBrand();location.hash='#/';route();renderStoredMaps().then(ok=>{if(ok)route();});}break;
    case 'reset-empty':if(armed(btn,'Точно? Всё будет удалено')){P=normalize({v:2,wiki:P.wiki,media:[],pages:[]});save();location.hash='#/';route();}break;
  }
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape')closeMenus();
  if(e.key==='Enter'&&e.target.id==='np-title'){e.preventDefault();$('[data-tpl]')?.focus();}
});
/* перетаскивание строк карточки за ручку ⠿ */
let rowDrag=null;
document.addEventListener('pointerdown',e=>{
  const h=e.target.closest('[data-drag]');if(!h||!edPage)return;e.preventDefault();
  const row=h.closest('.rw');rowDrag={from:+h.dataset.drag,row,to:null,after:false};row.classList.add('dragging');h.setPointerCapture(e.pointerId);
});
document.addEventListener('pointermove',e=>{
  if(!rowDrag)return;
  $$('#rows .rw').forEach(r=>r.classList.remove('drop-before','drop-after'));
  const el=document.elementFromPoint(e.clientX,e.clientY);const over=el&&el.closest('#rows > .rw');
  if(!over){rowDrag.to=null;return;}
  const r=over.getBoundingClientRect();const after=e.clientY>r.top+r.height/2;
  over.classList.add(after?'drop-after':'drop-before');rowDrag.to=+over.dataset.row;rowDrag.after=after;
  // прокрутка у краёв окна
  if(e.clientY<60)window.scrollBy(0,-12);else if(e.clientY>innerHeight-60)window.scrollBy(0,12);
});
document.addEventListener('pointerup',()=>{
  if(!rowDrag)return;const d=rowDrag;rowDrag=null;
  $$('#rows .rw').forEach(r=>r.classList.remove('drop-before','drop-after','dragging'));
  if(d.to==null||!edPage)return;
  const rows=edPage.ib.rows;let to=d.to+(d.after?1:0);if(to>d.from)to--;
  if(to===d.from)return;
  const [it]=rows.splice(d.from,1);rows.splice(to,0,it);rerenderForm();changed(edPage);
});
window.addEventListener('hashchange',route);

/* ---------- запуск ---------- */
(async function boot(){
  loadAppearance();applyAppearance();renderTools();
  try{const s=localStorage.getItem(LS);if(s){P=normalize(JSON.parse(s));state.source='local';}}catch(e){P=null;}
  if(!P){try{const r=await fetch('data/wiki.json',{cache:'no-cache'});if(r.ok){P=normalize(await r.json());state.source='published';}}catch(e){}}
  if(!P){P=sampleProject();state.source='sample';}
  // проект из браузера мог быть сохранён до появления карт: добавляем недостающие картинки и карты из опубликованной версии
  if(state.source==='local'){
    try{const r=await fetch('data/wiki.json',{cache:'no-cache'});if(r.ok){const pub=await r.json();const add=(pub.media||[]).filter(m=>m&&m.name&&!P.media.some(x=>x.name===m.name));if(add.length){P.media.push(...add);save();}}}catch(e){}
  }
  applyBrand();
  await renderStoredMaps();
  route();
})();
