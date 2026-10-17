'use strict';
/* Отрисовка вики-разметки, карточек и статей. Зависит от глобального P (проект). */

const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const unesc=s=>String(s??'').replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
/* Оформление статьи: русская или английская Википедия. RL — язык, в котором сейчас рисуется страница */
let RL='ru';
const I18N_EN={'Содержание':'Contents','скрыть':'hide','показать':'show','Начало':'(Top)','Статья':'Article','Обсуждение':'Talk','Читать':'Read','Править':'Edit','Править код':'Edit source','История':'View history','Инструменты':'Tools','Внешний вид':'Appearance','Текст':'Text','Мелкий':'Small','Стандартный':'Standard','Крупный':'Large','Ширина':'Width','Стандартная':'Standard','Широкая':'Wide','Цвета (бета)':'Color (beta)','Автоматически':'Automatic','Светлая':'Light','Тёмная':'Dark','Режим':'Mode','Редактор':'Editor','Википедия (без правки)':'Wikipedia (read only)','Скачать статью картинкой':'Download article as image','Скачать главное картинкой':'Download lead as image','Скачать карточку картинкой':'Download infobox as image','Режим Википедии':'Wikipedia mode','Выключить режим Википедии':'Turn off Wikipedia mode','Двойной щелчок по абзацу, заголовку или строке карточки — быстрая правка прямо на странице. Выделите текст — появится меню оформления.':'Double-click a paragraph, heading or infobox row to edit it right on the page. Select text to get a formatting menu.','Примечания':'References','Категории':'Categories','Основная статья':'Main article','Основные статьи':'Main articles','См. также':'See also','править':'edit','править код':'edit source','Вернуться к тексту':'Jump up','из':'of','Развернуть':'Expand','Служебная страница':'Special page','Заглавная страница':'Main Page','Обсуждений пока нет':'No discussion yet','История правок не ведётся':'Page history is not kept','Воспроизвести аудио':'Play audio','Без изменений':'Steady','Увеличение':'Increase','Уменьшение':'Decrease','Негативное увеличение':'Negative increase','Позитивное уменьшение':'Positive decrease','Рост':'Increase','Падение':'Decrease'};
const tr=s=>RL==='en'&&I18N_EN[s]||s;
const pgLang=pg=>(pg&&pg.lang)||(typeof P!=='undefined'&&P&&P.wiki&&P.wiki.lang)||'ru';
const norm=s=>String(s||'').trim().toLowerCase().replace(/ё/g,'е').replace(/_/g,' ').replace(/\s+/g,' ');
const slug=t=>encodeURIComponent(String(t||'').trim().replace(/ /g,'_'));
const mediaSrc=n=>{if(!n)return '';const m=P.media.find(x=>x.name===n);return m?m.src:'';};
const pageFind=t=>{const n=norm(t);return n?P.pages.find(p=>norm(p.title)===n):null;};
const safeColor=c=>{c=String(c||'').trim();return /^#[0-9a-f]{3,8}$/i.test(c)||/^[a-z]{3,20}$/i.test(c)?c:'#cccccc';};
function textOn(c){const m=/^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(c||'');if(!m)return '#202122';let h=m[1];if(h.length===3)h=h.split('').map(x=>x+x).join('');const n=parseInt(h,16);return (.299*(n>>16&255)+.587*(n>>8&255)+.114*(n&255))>150?'#202122':'#ffffff';}

/* ---------- inline ---------- */
const REF_RE=/<ref(?:\s+name\s*=\s*"?([^"\/>]+?)"?\s*)?(?:\/>|>([\s\S]*?)<\/ref>)/gi;
const fmt=s=>s.replace(/'''''(.+?)'''''/g,'<b><i>$1</i></b>').replace(/'''(.+?)'''/g,'<b>$1</b>').replace(/''(.+?)''/g,'<i>$1</i>');
const newCtx=()=>({refs:[],names:{},uses:{}});

function refHTML(name,content,ctx){
  let n;
  if(name&&ctx.names[name]) n=ctx.names[name];
  else{
    ctx.refs.push(content==null?'<i>сноска «'+esc(name)+'» без текста</i>':inline(content,newCtx()));
    n=ctx.refs.length;if(name)ctx.names[name]=n;
  }
  ctx.uses[n]=(ctx.uses[n]||0)+1;
  return `<sup class="reference" id="cite_ref-${n}-${ctx.uses[n]}"><a href="#" data-cite="${n}">[${n}]</a></sup>`;
}
/* Ссылки всегда синие; красная — только если её так отметили: [[!Статья]] или {{красная ссылка|Статья}} */
function linkHTML(tEsc,textEsc,red){
  const raw=unesc(tEsc).trim();const [t]=raw.split('#');const p=pageFind(t);
  const label=textEsc!==undefined?fmt(textEsc):tEsc;const cls=red?' class="new"':'';
  return p?`<a${cls} href="#/wiki/${slug(p.title)}" title="${esc(p.title)}">${label}</a>`
          :`<a${cls} href="#/new/${slug(t)}" title="${esc(t)} (статья ещё не написана — нажмите, чтобы создать)">${label}</a>`;
}
/* флажок; серая рамка отключается параметром «без рамки» или галочкой у картинки в медиатеке */
function flagIcon(nEsc,nob){const n=unesc(nEsc||'').trim();const m=P.media.find(x=>x.name===n)||P.media.find(x=>x.name==='Флаг '+n);const s=m&&m.src;return s?`<img class="flagicon${nob||m.noborder?' nob':''}" src="${s}" alt="">`:'';}
const NOB_RE=/^(без рамки|без обводки|рамка\s*=\s*(нет|0|no)|noborder|border\s*=\s*(no|0))$/i;
function tplInline(inner){
  let a=inner.split('|').map(x=>x.trim());const n=a[0].toLowerCase();
  let nob=false;if(/^(флаг-?|флагик|flag|flagicon|флагификация|флагссылка|flaglink)$/.test(n)){nob=a.some(x=>NOB_RE.test(x));a=a.filter(x=>!NOB_RE.test(x));}
  switch(n){
    case 'флаг':case 'flag':case 'флагификация':return flagIcon(a[1],nob)+'&nbsp;'+linkHTML(a[2]||a[1]||'',a[3]);
    case 'флагик':case 'flagicon':if(!a[2])return flagIcon(a[1],nob);
    /* флаг-ссылка без названия: {{флаг-|Сибирь|Сибирская Республика}} */
    case 'флаг-':case 'флагссылка':case 'flaglink':{const t=a[2]||a[1]||'';const ic=flagIcon(a[1],nob);if(!ic)return linkHTML(t,a[3]);const raw=unesc(t).split('#')[0].trim();const p=pageFind(raw);return `<a class="flaglink" href="${p?'#/wiki/'+slug(p.title):'#/new/'+slug(raw)}" title="${esc(p?p.title:raw)}">${ic}</a>`;}
    case 'красная ссылка':case 'красная':case 'redlink':return linkHTML(a[1]||'',a[2],true);
    /* квадрат легенды с подписью, как на картах выборов: {{легенда|#4488CC|ЛДПР}} */
    case 'легенда':case 'legend':case 'квадрат':{const t=a.slice(2).join('|');return `<span class="legend-item"><span class="legend-sq" style="background:${safeColor(unesc(a[1]||''))}"></span>${t?' '+inline(unesc(t),newCtx()):''}</span><!--/lg-->`;}
    case 'цвет':case 'color':return `<span class="legend-color" style="background:${safeColor(unesc(a[1]))}"></span>`+(a[2]?' '+a[2]:'');
    case 'рост':case 'up':case 'увеличение':return trend('up','good')+(a[1]?' '+a[1]:'');
    case 'падение':case 'down':case 'уменьшение':return trend('down','bad')+(a[1]?' '+a[1]:'');
    case 'рост-':case 'рост плохо':case 'рост отриц':return trend('up','bad')+(a[1]?' '+a[1]:'');
    case 'падение+':case 'падение хорошо':case 'падение полож':return trend('down','good')+(a[1]?' '+a[1]:'');
    case 'неизм':case 'steady':case '=':case 'без изменений':return trend('flat','')+(a[1]?' '+a[1]:'');
    case '▲':return tri('up','good')+(a[1]?' '+a[1]:'');
    case '▼':return tri('down','bad')+(a[1]?' '+a[1]:'');
    case '▲-':return tri('up','bad')+(a[1]?' '+a[1]:'');
    case '▼+':return tri('down','good')+(a[1]?' '+a[1]:'');
    case '▲0':return tri('up','')+(a[1]?' '+a[1]:'');
    case '▼0':return tri('down','')+(a[1]?' '+a[1]:'');
    case '▬':return tri('flat','')+(a[1]?' '+a[1]:'');
    /* текстовые треугольники, как в карточках компаний («Роснефть»): ▲ зелёный, ▼ красный, вплотную к числу */
    case 'вверх':case 'texticon up':return ticon('up','good')+(a[1]||'');
    case 'вниз':case 'texticon down':return ticon('down','bad')+(a[1]||'');
    case 'вверх-':return ticon('up','bad')+(a[1]||'');
    case 'вниз+':return ticon('down','good')+(a[1]||'');
    case 'плеер':case 'гимн':case 'аудио':case 'player':return playerHTML(a[a.length-1]&&a.length>1?a[a.length-1]:'');
    case 'и. о.':case 'ио':return '<abbr title="исполняющий обязанности">и.&nbsp;о.</abbr>';
    case 'нп':case 'nowrap':return '<span class="nowrap">'+a.slice(1).join('|')+'</span>';
    default:return '{{'+inner+'}}';
  }
}
/* Стрелки, как в шаблонах Википедии {{Увеличение}}, {{Уменьшение}}, {{Без изменений}} */
function trend(dir,mood){
  const g=dir==='up'?'↗':dir==='down'?'↘':'→';
  const cl=mood==='good'?'ts-g':mood==='bad'?'ts-r':'ts-n';
  const t=dir==='flat'?'Без изменений':(dir==='up'?(mood==='bad'?'Негативное увеличение':'Увеличение'):(mood==='good'?'Позитивное уменьшение':'Уменьшение'));
  return `<span class="ts ${cl}" title="${tr(t)}">${g}</span>`;
}
/* Треугольники, как {{Рост}} и {{Падение}} */
function tri(dir,mood){
  const g=dir==='up'?'▲':dir==='down'?'▼':'▬';
  const cl=mood==='good'?'ts-g':mood==='bad'?'ts-r':'ts-n';
  return `<span class="ts ${cl}" title="${tr(dir==='up'?'Рост':dir==='down'?'Падение':'Без изменений')}">${g}</span>`;
}
function ticon(dir,mood){return `<span class="ticon ${mood==='good'?'ticon-g':'ticon-r'}" title="${tr(dir==='up'?'Рост':'Падение')}">${dir==='up'?'▲':'▼'}</span>`;}
/* Фейковый аудиоплеер, как у гимна в карточке «Чехии»: звука нет, но кнопка и время работают */
function durSec(d){const m=String(d||'').trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);if(m)return (+m[1]||0)*3600+(+m[2])*60+(+m[3]);const n=parseInt(d,10);return n>0?n:0;}
function fmtDur(s){s=Math.max(0,Math.round(s));const h=Math.floor(s/3600),m=Math.floor(s%3600/60),c=String(s%60).padStart(2,'0');return h?`${h}:${String(m).padStart(2,'0')}:${c}`:`${m}:${c}`;}
function playerHTML(dur){
  const s=durSec(dur)||73;
  return `<span class="fplayer" data-dur="${s}" role="button" tabindex="0" aria-label="Воспроизвести аудио (${fmtDur(s)})" title="Воспроизвести аудио"><span class="fp-fill"></span><span class="fp-play" aria-hidden="true"></span><span class="fp-dur">${fmtDur(s)}</span></span>`;
}
function inline(src,ctx){
  if(src==null||src==='')return '';
  ctx=ctx||newCtx();
  const tok=[];const keep=h=>'\u0001'+(tok.push(h)-1)+'\u0002';
  let s=String(src).replace(REF_RE,(m,name,content)=>keep(refHTML(name,content,ctx)));
  s=esc(s);
  s=s.replace(/\r?\n/g,'<br>').replace(/&lt;br\s*\/?&gt;/gi,'<br>').replace(/&lt;(\/?)(small|big|s|u|sup|sub|code)&gt;/gi,'<$1$2>');
  s=s.replace(/\{\{([^{}]+)\}\}/g,(m,inner)=>keep(tplInline(inner)));
  s=s.replace(/\[\[(?:Файл|File|Изображение|Image):([^\]]+)\]\]/gi,(m,spec)=>{const a=spec.split('|');const src=mediaSrc(unesc(a[0].trim()));const px=a.find(x=>/^\d+px$/.test(x.trim()));return keep(src?`<img src="${src}" alt="" style="height:${px?parseInt(px):20}px;width:auto;vertical-align:middle">`:'');});
  // буквы сразу после ссылки входят в неё, как в Википедии: [[1993 год]]а → «1993 года»
  // в тексте ссылки допустимы одиночные скобки: [[МФА|[ˈtʃɛskɔ]]]
  s=s.replace(/\[\[(!?)([^\[\]|]+)(?:\|((?:[^\[\]]|\[[^\[\]]*\])*))?\]\]([а-яёa-z]*)/g,(m,r,t,x,tr)=>keep(linkHTML(t,tr?(x||t)+tr:x||undefined,!!r)));
  s=s.replace(/\[(https?:\/\/[^\s\]]+)(?:\s+([^\]]+))?\]/g,(m,u,t)=>keep(`<a class="external" href="${u}" target="_blank" rel="noopener">${t?fmt(t):u}</a>`));
  s=fmt(s);
  return s.replace(/\u0001(\d+)\u0002/g,(m,i)=>tok[+i]);
}
function ibVal(v,ctx){
  let html='',list=[],blank=0;
  const fl=()=>{if(list.length){html+='<ul>'+list.map(x=>'<li>'+inline(x,ctx)+'</li>').join('')+'</ul>';list=[];}};
  for(const l of String(v??'').split('\n')){
    const m=l.match(/^\s*\*\s*(.*)$/);
    if(m){list.push(m[1]);blank=0;continue;}
    fl();
    // пустая строка в значении — пустая строка в карточке
    if(!l.trim()){if(html)blank++;continue;}
    html+=(html&&!html.endsWith('</ul>')?'<br>':'')+'<br>'.repeat(blank)+inline(l,ctx);blank=0;
  }
  fl();return html;
}

/* ---------- blocks ---------- */
function renderList(ll,ctx){
  let h='';const st=[];
  for(const l of ll){
    const m=l.match(/^([*#]+)\s*(.*)$/);const mk=m[1];
    while(st.length>mk.length)h+='</li></'+st.pop()+'>';
    if(st.length===mk.length&&st.length)h+='</li>';
    while(st.length<mk.length){const tg=mk[st.length]==='#'?'ol':'ul';h+='<'+tg+'>';st.push(tg);}
    h+='<li>'+inline(m[2],ctx);
  }
  while(st.length)h+='</li></'+st.pop()+'>';
  return h;
}
function cellAttrs(a){
  let out='';
  a.replace(/([a-z-]+)\s*=\s*("([^"]*)"|[^\s"]+)/gi,(m,k,v,q)=>{
    k=k.toLowerCase();v=q!==undefined?q:v;
    if((k==='colspan'||k==='rowspan')&&/^\d+$/.test(v))out+=` ${k}="${v}"`;
    else if(k==='align'&&/^(left|right|center)$/i.test(v))out+=` style="text-align:${v}"`;
    else if(k==='bgcolor'&&/^#[0-9a-f]{3,8}$|^[a-z]+$/i.test(v))out+=` style="background:${v}"`;
    else if(k==='style'){const ok=v.split(';').map(x=>x.trim()).filter(x=>/^(background|background-color|color|text-align|width|white-space)\s*:\s*[#\w.%\s-]+$/i.test(x));if(ok.length)out+=` style="${esc(ok.join(';'))}"`;}
    return m;});
  return out;
}
/* Таблица; mark — пометить строки и ячейки номерами строк исходника (data-tr, data-tc), чтобы менять их цвет прямо на странице */
function renderTable(tl,ctx,mark){
  let cap='';const rows=[];let row=null,rowA='',rowL=-1;
  tl.forEach((raw,li)=>{
    const l=raw.trim();if(!l)return;
    if(l.startsWith('|+')){cap=l.slice(2).trim();return;}
    if(l.startsWith('|-')){row=null;rowA=cellAttrs(l.slice(2));rowL=li;return;}
    if(l[0]==='!'||l[0]==='|'){
      if(!row){row={cells:[],a:rowA,rl:rowL,fl:li};rows.push(row);rowA='';rowL=-1;}
      const isH=l[0]==='!';
      l.slice(1).split(isH?/!!|\|\|/:/\|\|/).forEach((part,pi)=>{
        const m=part.match(/^\s*((?:[a-z-]+\s*=\s*(?:"[^"]*"|[^\s|"]+)\s*)+)\|(?!\|)(.*)$/i);
        row.cells.push({h:isH,a:m?cellAttrs(m[1]):'',c:m?m[2]:part,li,pi});
      });
    }else if(row&&row.cells.length){row.cells[row.cells.length-1].c+=' '+l;}
  });
  return `<div class="table-wrap">${mark?'<button type="button" class="tbl-edit" title="Открыть редактор таблицы">✎ править таблицу</button>':''}<table class="wikitable">${cap?`<caption>${inline(cap,ctx)}</caption>`:''}<tbody>${rows.map(r=>`<tr${r.a}${mark?` data-tr="${r.rl}:${r.fl}"`:''}>`+r.cells.map(c=>`<${c.h?'th':'td'}${c.a}${mark?` data-tc="${c.li}:${c.pi}"`:''}>${inline(c.c.trim(),ctx)}</${c.h?'th':'td'}>`).join('')+'</tr>').join('')}</tbody></table></div>`;
}
/* цвет фона в атрибутах строки или ячейки таблицы: '' — убрать */
function setBgAttr(attrs,color){
  let a=String(attrs||'').replace(/\s*bgcolor\s*=\s*("[^"]*"|[^\s"|]+)/i,'').trim();
  const sm=a.match(/style\s*=\s*"([^"]*)"/i);
  if(sm){let st=sm[1].replace(/(^|;)\s*background(-color)?\s*:[^;]*/gi,'$1').split(';').map(x=>x.trim()).filter(Boolean).join(';');if(color)st=(st?st+';':'')+'background:'+color;a=st?a.replace(sm[0],`style="${st}"`):a.replace(sm[0],'').trim();}
  else if(color)a=(a?a+' ':'')+`style="background:${color}"`;
  return a.trim();
}
/* разбить по «|» верхнего уровня — не внутри [[…]] и {{…}} (подписи со ссылками и шаблонами) */
function splitTop(s){const out=[];let d1=0,d2=0,cur='';for(let i=0;i<s.length;i++){const two=s.slice(i,i+2);if(two==='[['){d1++;cur+=two;i++;continue;}if(two===']]'&&d1){d1--;cur+=two;i++;continue;}if(two==='{{'){d2++;cur+=two;i++;continue;}if(two==='}}'&&d2){d2--;cur+=two;i++;continue;}if(s[i]==='|'&&!d1&&!d2){out.push(cur);cur='';continue;}cur+=s[i];}out.push(cur);return out;}
/* квадраты легенды в подписи — в колонки (cols: число колонок, 0 — подобрать) */
function legendWrap(html,cols){
  const i=html.indexOf('<span class="legend-item"');if(i<0)return html;const j=html.lastIndexOf('<!--/lg-->')+10;
  const n=(html.match(/class="legend-item"/g)||[]).length;const k=Math.max(1,Math.min(6,+cols||(n<=3?1:n<=8?2:3)));
  return html.slice(0,i).replace(/(\s*<br>\s*)+$/,'')+`<div class="legend-cols" style="column-count:${k}">`+html.slice(i,j).replace(/<br>/g,'')+'</div>'+html.slice(j);
}
function renderThumb(spec,ctx){
  const a=splitTop(spec).map(x=>x.trim());const name=a.shift();let left=false,w=220,cap='',lc=0;
  for(const o of a){let m;if(/^(слева|left)$/i.test(o))left=true;else if(/^\d+px$/.test(o))w=parseInt(o);else if(m=o.match(/^(?:колонки|columns)\s*=\s*(\d)$/i))lc=+m[1];else if(/^(мини|миниатюра|thumb|справа|right)$/i.test(o)){}else cap=o;}
  const src=mediaSrc(name);
  if(!src)return `<div class="missing">Картинки «${esc(name)}» нет в медиатеке</div>`;
  return `<figure class="thumb${left?' left':''}" style="width:${w+8}px"><img src="${src}" alt="" style="width:${w}px">${cap?`<figcaption>${legendWrap(inline(cap,ctx),lc)}</figcaption>`:''}</figure>`;
}
function renderBody(src,ctx,pid){
  const lines=String(src||'').replace(/\r/g,'').split('\n');
  const out=[],heads=[];let para=[];let i=0,m,ps=0;
  /* в режиме чтения каждый блок помнит свои строки исходника (data-l) — по ним работает правка двойным щелчком */
  const at=(h,a,b)=>pid&&h?h.replace(/^<([a-z0-9]+)/i,`<$1 data-l="${a}-${b}"`):h;
  const push=(h,a,b)=>out.push(at(h,a,b));
  const flush=()=>{if(para.length){push('<p>'+inline(para.join('\n'),ctx)+'</p>',ps,ps+para.length-1);para=[];}};
  while(i<lines.length){
    const t=lines[i].trim();
    if(!t){flush();i++;continue;}
    if(m=t.match(/^(={2,4})\s*(.+?)\s*\1$/)){
      flush();const lv=m[1].length,id='sec-'+heads.length;
      const text=inline(m[2],newCtx());heads.push({lv,id,text:text.replace(/<[^>]+>/g,'')});
      const ed=pid&&lv===2?`<span class="mw-editsection"><span class="br">[</span>${RL==='en'?`<a href="#/edit/${pid}">edit</a>`:`<a href="#/edit/${pid}">править</a><span class="sep">|</span><a href="#/edit/${pid}/code">править код</a>`}<span class="br">]</span></span>`:'';
      push(`<h${lv} id="${id}">${inline(m[2],ctx)}${ed}</h${lv}>`,i,i);i++;continue;}
    if(/^\{\|/.test(t)){flush();const s0=i;const tl=[];i++;while(i<lines.length&&!/^\|\}/.test(lines[i].trim())){tl.push(lines[i]);i++;}i++;push(renderTable(tl,ctx,!!pid),s0,Math.min(i,lines.length)-1);continue;}
    if(/^[*#]/.test(t)){flush();const s0=i;const ll=[];while(i<lines.length&&/^[*#]/.test(lines[i].trim())){ll.push(lines[i].trim());i++;}push(renderList(ll,ctx),s0,i-1);continue;}
    if(m=t.match(/^\[\[(?:Файл|File|Изображение|Image):(.+)\]\]$/i)){flush();push(renderThumb(m[1],ctx),i,i);i++;continue;}
    if(m=t.match(/^\{\{\s*(основная статья|основные статьи|main|см\. также|see also)\s*\|(.+)\}\}$/i)){flush();const it=m[2].split('|').map(x=>x.trim()).filter(Boolean);const main=!/также|also/i.test(m[1]);push(`<div class="hatnote">${main?(it.length>1?tr('Основные статьи'):tr('Основная статья')):tr('См. также')}: ${inline(it.map(x=>'[['+x+']]').join(', '),ctx)}</div>`,i,i);i++;continue;}
    if(/^(\{\{\s*(примечания|reflist|references)\s*\}\}|<references\s*\/?>)$/i.test(t)){flush();out.push('\u0003REFS\u0003');i++;continue;}
    if(t==='----'){flush();push('<hr>',i,i);i++;continue;}
    if(t[0]===':'){flush();push(`<dl><dd>${inline(t.replace(/^:+/,''),ctx)}</dd></dl>`,i,i);i++;continue;}
    if(!para.length)ps=i;para.push(t);i++;
  }
  flush();
  return {out,heads};
}

/* ---------- parliament diagram ---------- */
/* Полукруг парламента — раскладка как у генератора диаграмм, которым пользуется Википедия (parliamentdiagram, «arch»):
   число рядов по таблице вместимости, ряды на равном шаге, места сортируются по углу слева направо */
const PARL_TOTALS=[3,15,33,61,95,138,189,247,313,388,469,559,657,762,876,997,1126,1263,1408,1560,1722,1889,2066,2250,2442,2641,2850,3064];
function parlSVG(parties){
  const list=parties.map(p=>({...p,seats:Math.max(0,Math.floor(+p.seats||0))})).filter(p=>p.seats>0);
  const N=list.reduce((a,p)=>a+p.seats,0);if(!N)return '';
  if(N>3000)return '<div class="missing">Больше 3000 мест — диаграмма не строится</div>';
  let rows=PARL_TOTALS.findIndex(t=>t>=N)+1;
  const rad=0.4/rows;const pos=[];
  const row=(R,J)=>{if(J<=0)return;if(J===1){pos.push([Math.PI/2,R]);return;}
    const a0=Math.asin(Math.min(1,rad/R));for(let k=0;k<J;k++)pos.push([k*(Math.PI-2*a0)/(J-1)+a0,R]);};
  for(let r=1;r<rows;r++){const R=(3*rows+4*r-2)/(4*rows);row(R,Math.floor(N/PARL_TOTALS[rows-1]*Math.PI/(2*Math.asin(2/(3*rows+4*r-2)))));}
  row((7*rows-2)/(4*rows),N-pos.length);
  pos.sort((p,q)=>q[0]-p[0]||q[1]-p[1]);
  const pad=5,W=350+2*pad;let k=0,used=0,c='',maxY=0;
  for(const [a,R] of pos){while(used>=list[k].seats){k++;used=0;}used++;
    const x=pad+100*(1.75+R*Math.cos(a)),y=pad+100*(1.75-R*Math.sin(a));maxY=Math.max(maxY,y+rad*100);
    c+=`<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${(rad*100*0.98).toFixed(2)}" fill="${safeColor(list[k].color)}"/>`;}
  const H=Math.ceil(Math.max(maxY,pad+175)+pad);const fs=N>=1000?30:36;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Распределение ${N} мест">${c}<text x="${pad+175}" y="${pad+172}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${fs}" font-weight="bold" fill="currentColor">${N}</text></svg>`;
}

/* ---------- infobox (как «Государственный деятель» в русской Википедии) ---------- */
/* Кнопка «показать/скрыть», как в карточке «НАТО»: у строки сворачивается значение, у заголовка — строки до следующего заголовка */
function foldBtn(open,id){return `<button type="button" class="fold-tg" aria-expanded="${open}"${id?` data-fold="${id}"`:''}>${open?tr('скрыть'):tr('показать')}</button>`;}
function foldBox(r,html,c){if(!r.fold)return html;const open=!!r.foldOpen;return `<div class="ib-fold">${foldBtn(open)}${String(r.foldSum||'').trim()?`<div class="fold-sum">${inline(r.foldSum,c)}</div>`:''}<div class="fold-body"${open?'':' hidden'}>${html}</div></div>`;}
function hdr(content,c,hs){return `<tr><th colspan="2" scope="colgroup" class="infobox-header${hs.dk}"${hs.st}>${content}</th></tr>`;}
const RENDER={
  header:(r,c,hs,i)=>{
    if(!r.text)return '';
    const l=mediaSrc(r.l),rr=mediaSrc(r.r);const fb=r.fold?foldBtn(!!r.foldOpen,'f'+i):'';
    if(!l&&!rr)return hdr(fb+inline(r.text,c),c,hs);
    return hdr(fb+`<div class="ib-office"><div class="ib-office-img">${l?`<img src="${l}" alt="">`:''}</div><div class="ib-office-label">${inline(r.text,c)}</div><div class="ib-office-img">${rr?`<img src="${rr}" alt="">`:''}</div></div>`,c,hs);},
  field:(r,c)=>{const lb=String(r.label||'');if(/^=/.test(lb))return `<tr><td colspan="2" class="ib-sub">${inline(lb.replace(/^=\s*/,''),c)}${String(r.value||'').trim()?' '+ibVal(r.value,c):''}</td></tr>`;if(!String(r.value||'').trim())return '';return r.label?`<tr><th scope="row" class="plainlist${/^\s*•/.test(lb)?' ib-l2':''}">${inline(/^\s*•/.test(lb)?'\u00a0•\u00a0'+lb.replace(/^\s*•\s*/,''):r.label,c)}</th><td class="plainlist">${foldBox(r,ibVal(r.value,c),c)}</td></tr>`:`<tr><td colspan="2" class="plainlist">${foldBox(r,ibVal(r.value,c),c)}</td></tr>`;},
  text:(r,c)=>String(r.value||'').trim()?`<tr><td colspan="2" class="plainlist" style="text-align:center">${foldBox(r,ibVal(r.value,c),c)}</td></tr>`:'',
  hr:()=>`<tr><td colspan="2" class="ib-hr"><hr></td></tr>`,
  anthem:(r,c)=>{const v=String(r.value||'').trim();if(!v&&!r.dur)return '';return `<tr><td colspan="2" class="plainlist ib-anthem">${r.label?inline(r.label,c)+': ':''}${v?ibVal(v,c):''}${r.dur?playerHTML(r.dur):''}</td></tr>`;},
  below:(r,c,hs)=>String(r.value||'').trim()?`<tr><td colspan="2" class="infobox-below${hs.dk}"${hs.st2}>${ibVal(r.value,c)}</td></tr>`:'',
  image:(r,c)=>{const s=mediaSrc(r.src);if(!s)return '';return `<tr><td colspan="2" class="infobox-image"><img src="${s}" alt="" style="width:${Math.max(40,+r.w||250)}px">${r.caption?`<span class="media-caption">${legendWrap(inline(r.caption,c),r.lcols)}</span>`:''}</td></tr>`;},
  images2:(r,c)=>{const a=mediaSrc(r.src1),b=mediaSrc(r.src2);if(!a&&!b)return '';
    const im=[a&&[a,'ib-flag',r.cap1],b&&[b,'ib-coat',r.cap2]].filter(Boolean);
    return `<tr><td colspan="2" class="infobox-image"><table class="ib-flags"><tbody><tr>${im.map(([s,k])=>`<td><img class="${k}" src="${s}" alt=""></td>`).join('')}</tr>${im.some(x=>String(x[2]||'').trim())?`<tr>${im.map(x=>`<td>${inline(x[2]||'',c)}</td>`).join('')}</tr>`:''}</tbody></table></td></tr>`;},
  cols:(r,c,hs)=>{const cells=r.cells||[];if(!r.label&&cells.every(x=>!String(x).trim()))return '';const n=cells.length||1;return (r.label?hdr(inline(r.label,c),c,hs):'')+`<tr><td colspan="2" class="ib-nest"><table class="ib-in ib-cols${r.plain?' ib-cols-plain':''}"><tbody><tr>${cells.map(x=>`<td${r.plain?' class="plainlist"':''} style="width:${(100/n).toFixed(2)}%">${ibVal(x,c)}</td>`).join('')}</tr></tbody></table></td></tr>`;},
  succ:(r,c,hs)=>{if(!r.prev&&!r.next&&!r.label)return '';
    // raw — стрелки уже в тексте (импорт из Википедии), каждая строка — отдельный предшественник или преемник
    const side=(v,left)=>r.raw?String(v||'').split('\n').filter(x=>x.trim()).map(x=>`<span class="nowrap">${inline(x,c)}</span>`).join('<br>'):(v?(left?'← '+inline(v,c):inline(v,c)+' →'):'');
    return `<tr><td colspan="2" class="ib-nest${r.hd?' ib-succ-hd':''}"${r.hd?hs.st:''}><table class="ib-in ib-succ${r.raw?' raw':''}"><tbody><tr><td class="l">${side(r.prev,true)}</td><td class="m">${inline(r.label,c)}</td><td class="r">${side(r.next,false)}</td></tr></tbody></table></td></tr>`;},
  seats:(r,c,hs)=>{const have=+r.have||0,tot=Math.max(1,+r.total||1);const pct=Math.min(100,have/tot*100).toFixed(2);return `<tr><th scope="row" class="plainlist">${inline(r.label,c)}</th><td class="plainlist"><span class="seats-w">${have}&nbsp;${tr('из')}&nbsp;${tot}<span class="seatbar"><span style="width:${pct}%;background:${safeColor(r.color)}"></span></span></span></td></tr>`;},
  parl:(r,c,hs)=>{const svg=parlSVG(r.parties||[]);if(!svg)return '';return (r.label?hdr(inline(r.label,c),c,hs):'')+`<tr><td colspan="2" class="parl">${svg}${r.legend?`<ul class="parl-legend">${r.parties.filter(p=>+p.seats>0).map(p=>`<li><span class="legend-color" style="background:${safeColor(p.color)}"></span><span>${inline(p.name,c)}: <b>${+p.seats}</b></span></li>`).join('')}</ul>`:''}</td></tr>`;},
  cands:(r,c)=>{
    const cs=r.cands||[];if(!cs.length)return '';const per=Math.max(1,Math.min(5,+r.per||3));let h='';
    for(let s=0;s<cs.length;s+=per){
      const ch=cs.slice(s,s+per).map((x,j)=>({...x,idx:s+j}));const w=`style="width:${(100/per).toFixed(1)}%"`;
      let t='<table class="ib-cands"><tbody>';
      const lab=k=>r[k]?`<th>${inline(r[k],c)}</th>`:'<td></td>';
      if(r.wiki){
        if(ch.some(x=>mediaSrc(x.src)))t+=`<tr class="cph">${lab('photoLabel')}${ch.map(x=>`<td ${w}>${mediaSrc(x.src)?`<img src="${mediaSrc(x.src)}" alt="">`:''}<div class="cbar" style="background:${safeColor(x.color)}"></div></td>`).join('')}</tr>`;
        if(ch.some(x=>String(x.name||'').trim()))t+=`<tr>${lab('nameLabel')}${ch.map(x=>`<td class="cl">${inline(x.name,c)}</td>`).join('')}</tr>`;
      }else{
      if(ch.some(x=>mediaSrc(x.src)))t+=`<tr><td></td>${ch.map(x=>`<td ${w}>${mediaSrc(x.src)?`<img src="${mediaSrc(x.src)}" alt="">`:''}</td>`).join('')}</tr>`;
      t+=`<tr><td></td>${ch.map(x=>`<td ${w}><div class="cbar" style="background:${safeColor(x.color)}"></div></td>`).join('')}</tr>`;
      t+=`<tr><td></td>${ch.map(x=>`<td><b>${inline(x.name,c)}</b></td>`).join('')}</tr>`;
      }
      for(const st of r.stats||[])t+=`<tr><th>${inline(st.label,c)}</th>${ch.map(x=>`<td${r.wiki?' class="cl"':''}>${ibVal((st.values||[])[x.idx]||'',c)}</td>`).join('')}</tr>`;
      h+=`<tr><td colspan="2" class="ib-nest ib-cw">${t.replace('<table class="ib-cands">',`<table class="ib-cands${r.wiki?' ib-cands-w':''}">`)}</tbody></table></td></tr>`;
    }
    return h;},
};
function renderInfobox(ib,ctx,mark){
  const th=ib.custom?safeColor(ib.theme):'';const fg=th?textOn(th):'';
  const hs={st:th?` style="background:${th};color:${fg}"`:'',st2:th?` style="background:${th};color:${fg}"`:'',dk:fg==='#ffffff'?' dk':''};
  let h='',fold=null;(ib.rows||[]).forEach((r,i)=>{
    if(r.t==='header')fold=r.fold&&r.text?{id:'f'+i,open:!!r.foldOpen}:null;
    let x=RENDER[r.t]?RENDER[r.t](r,ctx,hs,i):'';if(mark)x=x.replace(/<tr(?=[ >])/g,`<tr data-ib="${i}"`);
    if(fold&&r.t!=='header')x=x.replace(/<tr(?=[ >])/g,`<tr data-fold="${fold.id}"${fold.open?'':' hidden'}`);
    h+=x;});
  if(!h&&!ib.title&&!ib.above)return '';
  // стандартная ширина 23em в Википедии на деле 23,4em (ru) и 22em (en); своя ширина (style=width) — ровно как задана
  const w0=Math.min(40,Math.max(14,+ib.w||23));const w=w0===23?(RL==='en'?22:23.4):w0;
  return `<table class="infobox" style="width:${w}em"><tbody>${ib.above?`<tr${mark?' data-ib="above"':''}><td colspan="2" class="infobox-pre">${inline(ib.above,ctx)}</td></tr>`:''}${ib.title?`<tr${mark?' data-ib="title"':''}><th colspan="2" scope="colgroup" class="infobox-above${hs.dk}"${hs.st}>${inline(ib.title,ctx)}</th></tr>`:''}${h}</tbody></table>`;
}

/* ---------- article ---------- */
function articleParts(pg,opts={}){
  RL=pgLang(pg);
  const ctx=newCtx();
  const ibh=renderInfobox(pg.ib,ctx,opts.editLinks);
  const b=renderBody(pg.body,ctx,opts.editLinks?pg.id:null);
  let html=b.out.join('\n');
  const refs=ctx.refs.length?`<div class="reflist"><ol class="references">${ctx.refs.map((r,i)=>`<li id="cite_note-${i+1}"><span class="mw-cite-backlink"><a href="#" data-back="${i+1}" title="${tr('Вернуться к тексту')}">${RL==='en'?'^':'↑'}</a></span> ${r}</li>`).join('')}</ol></div>`:'';
  if(html.includes('\u0003REFS\u0003'))html=html.replace('\u0003REFS\u0003',refs).replace(/\u0003REFS\u0003/g,'');
  else if(refs){const id='sec-'+b.heads.length;b.heads.push({lv:2,id,text:tr('Примечания')});html+=`<h2 id="${id}">${tr('Примечания')}</h2>`+refs;}
  const content=`${pg.hatnote?`<div class="hatnote"${opts.editLinks?' data-ib="hatnote"':''}>${inline(pg.hatnote,ctx)}</div>`:''}${ibh}${html}<div class="clear"></div>`;
  return {content,heads:b.heads};
}
function catsOf(pg){return String(pg.cats||'').split(/[,\n]/).map(s=>s.trim()).filter(Boolean);}
function catlinksHTML(pg){const c=catsOf(pg);return c.length?`<div class="catlinks"><a href="#/all">${tr('Категории')}</a>: <ul>${c.map(x=>`<li><a href="#/cat/${slug(x)}">${esc(x)}</a></li>`).join('')}</ul></div>`:'';}
/* Первый абзац без сносок — для заглавной и поиска */
function leadText(pg,max=420){
  const p=String(pg.body||'').split(/\n\s*\n/).map(x=>x.trim()).find(x=>x&&!/^(==|\{\||\[\[(Файл|File)|\{\{|[*#:])/i.test(x))||'';
  let h=inline(p.replace(REF_RE,''),newCtx());
  const plain=h.replace(/<[^>]+>/g,'');
  if(plain.length>max){return esc(unesc(plain).slice(0,max).replace(/\s+\S*$/,''))+'…';}
  return h;
}
function firstImage(pg){for(const r of pg.ib.rows||[]){if(r.t==='image'&&mediaSrc(r.src))return mediaSrc(r.src);if(r.t==='images2'&&(mediaSrc(r.src1)||mediaSrc(r.src2)))return mediaSrc(r.src1)||mediaSrc(r.src2);}return '';}
