'use strict';
/* ---------- правка прямо на странице: двойной щелчок, текст как на странице, меню над выделением ---------- */
let IE=null;

/* Разметка → редактируемый HTML. Ссылки, жирный и курсив правятся как обычный текст,
   всё сложное (сноски, шаблоны, картинки, внешние ссылки) — неразрывные «кусочки» */
const ATOM_RE=/<ref\b[^>]*\/>|<ref\b[^>]*>[\s\S]*?<\/ref>|\{\{(?:[^{}]|\{\{[^{}]*\}\})*\}\}|\[\[(?:Файл|File|Изображение|Image):[^\]]*\]\]|\[https?:\/\/[^\]\s]+(?:\s[^\]]*)?\]|<(small|big|s|u|sup|sub|code)>[\s\S]*?<\/\1>/gi;
const LINK_RE=/\[\[(!?)([^\[\]|]+)(?:\|((?:[^\[\]]|\[[^\[\]]*\])*))?\]\]([а-яёa-z]*)/g;
function atomHTML(src,ctx){return `<span class="wk-atom" contenteditable="false" data-wk="${esc(src)}" title="${esc(src.length>120?src.slice(0,120)+'…':src)}">${inline(src,ctx)||'⧉'}</span>`;}
function richHTML(src){
  const ctx=newCtx();const atoms=[];
  let s=String(src??'').replace(ATOM_RE,m=>'\u0001'+(atoms.push(m)-1)+'\u0002');
  s=esc(s);
  const links=[];
  s=s.replace(LINK_RE,(m,r,t,x,tr)=>'\u0003'+(links.push({r,t,x:(x||t)+(tr||'')})-1)+'\u0004');
  s=s.replace(/\r?\n/g,'<br>');
  s=fmt(s);
  s=s.replace(/\u0003(\d+)\u0004/g,(m,i)=>{const l=links[+i];return `<a class="wk-link${l.r?' new':''}" data-t="${l.t}" href="#">${fmt(l.x)}</a>`;});
  return s.replace(/\u0001(\d+)\u0002/g,(m,i)=>atomHTML(atoms[+i],ctx));
}
/* Редактируемый HTML → разметка */
function richWiki(node){
  let o='';
  for(const n of node.childNodes){
    if(n.nodeType===3){o+=n.nodeValue;continue;}
    if(n.nodeType!==1)continue;
    const tg=n.tagName;
    if(n.classList.contains('wk-atom')){o+=n.dataset.wk||'';continue;}
    if(tg==='BR'){o+='\n';continue;}
    const inner=richWiki(n);
    if(tg==='A'&&n.dataset.t!=null){
      const t=n.dataset.t,r=n.classList.contains('new')?'!':'';const txt=inner;
      if(!txt.trim())continue;
      if(txt===t)o+=`[[${r}${t}]]`;
      else if(txt.startsWith(t)&&/^[а-яёa-z]+$/.test(txt.slice(t.length)))o+=`[[${r}${t}]]${txt.slice(t.length)}`;
      else o+=`[[${r}${t}|${txt}]]`;
      continue;
    }
    if(tg==='B'||tg==='STRONG'){o+=inner.trim()?`'''${inner}'''`:inner;continue;}
    if(tg==='I'||tg==='EM'){o+=inner.trim()?`''${inner}''`:inner;continue;}
    if(tg==='DIV'||tg==='P'){o+=(o&&!o.endsWith('\n')?'\n':'')+inner;continue;}
    o+=inner;
  }
  return o;
}

function closeIE(){
  if(!IE)return;IE.box.remove();if(IE.hidden)IE.hidden.hidden=false;if(IE.cell)IE.cell.innerHTML=IE.html;IE=null;selbarHide();
}
function ieBar(rich){return `<div class="ie-bar"><button class="btn pri sm" data-ie="ok">Сохранить</button><button class="btn sm" data-ie="no">Отмена</button>${rich?'<button class="btn sm" data-ie="code" title="Показать разметку целиком">Разметка</button>':''}<span class="cnt">${rich?'Выделите текст — появится меню. Ctrl+Enter — сохранить, Esc — отмена':'Ctrl+Enter — сохранить, Esc — отмена'}</span></div>`;}
function ieCodeBox(val,hint){
  const box=document.createElement('div');box.className='ie';
  box.innerHTML=`<textarea class="ie-ta" spellcheck="true" aria-label="Текст для правки"></textarea>${ieBar(false).replace('Ctrl+Enter — сохранить, Esc — отмена',hint||'Ctrl+Enter — сохранить, Esc — отмена')}`;
  const ta=box.querySelector('textarea');ta.value=val;
  const fit=()=>{ta.style.height='auto';ta.style.height=Math.min(window.innerHeight*.7,ta.scrollHeight+4)+'px';};ta.addEventListener('input',fit);setTimeout(()=>{fit();ta.focus();ta.setSelectionRange(ta.value.length,ta.value.length);},0);
  return box;
}
function ieRichBox(val,tag){
  const box=document.createElement('div');box.className='ie ie-r';
  box.innerHTML=`<${tag} class="ie-rich" contenteditable="true" spellcheck="true" role="textbox" aria-multiline="${/^H/.test(tag)?'false':'true'}" aria-label="Текст для правки">${richHTML(val)}</${tag}>${ieBar(true)}`;
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
const isList=v=>/^\s*[*#]/m.test(String(v||''));
/* блок, который можно править: абзац/заголовок/строка карточки под элементом el */
function ieBlockOf(el){
  if(!el||!el.closest||!el.closest('#main .mw-content'))return null;
  if(el.closest('.ie,.toc-mobile,.reflist,.mw-editsection'))return null;
  const ib=el.closest('[data-ib]');if(ib)return {ib,cell:el.closest('td,th')||ib};
  const bl=el.closest('[data-l]');return bl?{bl}:null;
}
/* открыть правку блока; mode 'rich' — визуально, 'code' — разметкой */
function ieOpenAt(el,mode){
  if(parseHash().k!=='wiki'||wikiMode())return false;const pg=cur();if(!pg)return false;
  const B=ieBlockOf(el);if(!B)return false;
  if(IE)closeIE();
  if(B.ib){
    const key=B.ib.dataset.ib;const cell=B.cell;const tg=ieTarget(pg,key,cell);
    if(!tg){toast('Эту строку карточки можно изменить только в редакторе');return false;}
    const [o,f]=tg;const val=String(o[f]??'');
    const rich=mode!=='code'&&!isList(val)&&!/^=/.test(val);
    const box=rich?ieRichBox(val,'div'):ieCodeBox(val);
    if(key==='hatnote'){B.ib.hidden=true;B.ib.after(box);IE={box,pg,hidden:B.ib,src:val,apply:v=>{o[f]=v;}};}
    else{const html=cell.innerHTML;cell.innerHTML='';cell.appendChild(box);IE={box,pg,cell,html,src:val,apply:v=>{o[f]=v;}};}
  }else{
    const bl=B.bl;const [a,b]=bl.dataset.l.split('-').map(Number);
    const lines=String(pg.body||'').replace(/\r/g,'').split('\n');const raw=lines.slice(a,b+1).join('\n');
    const setLines=v=>{const L=String(pg.body||'').replace(/\r/g,'').split('\n');L.splice(a,b-a+1,...(v.trim()?v.replace(/\r/g,'').split('\n'):[]));pg.body=L.join('\n').replace(/\n{3,}/g,'\n\n');};
    let rich=mode!=='code',val=raw,tag='p',apply=setLines;
    const hm=raw.trim().match(/^(={2,4})\s*(.+?)\s*\1$/);
    if(/^H[2-4]$/.test(bl.tagName)&&hm){val=hm[2];tag=bl.tagName.toLowerCase();apply=v=>setLines(v.trim()?`${hm[1]} ${v.replace(/\s*\n\s*/g,' ').trim()} ${hm[1]}`:'');}
    else if(bl.tagName==='DL'&&/^:+/.test(raw.trim())){const pre=raw.trim().match(/^:+/)[0];val=raw.trim().slice(pre.length);apply=v=>setLines(v.trim()?pre+v.replace(/\n/g,' '):'');}
    else if(bl.tagName!=='P')rich=false;
    if(!rich){val=raw;apply=setLines;}
    const box=rich?ieRichBox(val,tag):ieCodeBox(raw,'Ctrl+Enter — сохранить, Esc — отмена. Разметка та же, что в редакторе; пустая строка начинает новый абзац');
    bl.hidden=true;bl.after(box);IE={box,pg,hidden:bl,src:val,apply,raw,setLines};
  }
  const ed=IE.box.querySelector('.ie-rich');
  if(ed){IE.rich=ed;setTimeout(()=>{ed.focus();const r=document.createRange();r.selectNodeContents(ed);r.collapse(false);const s=getSelection();s.removeAllRanges();s.addRange(r);},0);}
  return true;
}
function ieValue(){
  if(!IE)return '';
  if(IE.rich){let v=richWiki(IE.rich).replace(/\n+$/,'');if(!String(IE.src).includes(' '))v=v.replace(/ /g,' ');return v;}
  return IE.box.querySelector('textarea').value;
}
function ieSave(){
  if(!IE)return;const {pg,apply}=IE;const v=ieValue();
  apply(v);pg.updated=Date.now();save();
  const y=window.scrollY;IE=null;selbarHide();viewArticle(pg);window.scrollTo(0,y);toast('Сохранено');
}
/* переключиться на разметку: из визуальной правки — в текстовое поле с тем же содержимым */
function ieToCode(){
  if(!IE||!IE.rich)return;const v=ieValue();
  const box=ieCodeBox(v);
  IE.box.replaceWith(box);IE.box=box;IE.rich=null;selbarHide();
}
function ieAction(k){if(k==='ok')ieSave();else if(k==='code')ieToCode();else closeIE();}

/* ---------- меню над выделенным текстом ---------- */
let SB=null,sbRange=null,sbMode='';
const SB_TOOLS=[['b','<b>Ж</b>','Жирный (Ctrl+B)'],['i','<i>К</i>','Курсив (Ctrl+I)'],['link','Ссылка','Ссылка на статью (Ctrl+K)'],['red','Красная ссылка','Красная ссылка'],['unlink','Убрать ссылку','Убрать ссылку'],['ref','Сноска','Добавить сноску после выделенного'],['clear','Очистить','Убрать оформление']];
function selbar(){
  if(SB)return SB;
  SB=document.createElement('div');SB.className='selbar';SB.hidden=true;SB.setAttribute('role','toolbar');SB.setAttribute('aria-label','Оформление текста');
  document.body.appendChild(SB);
  SB.addEventListener('mousedown',e=>{if(!e.target.closest('input'))e.preventDefault();});
  SB.addEventListener('click',e=>{const b=e.target.closest('[data-sb]');if(!b)return;e.preventDefault();sbDo(b.dataset.sb);});
  SB.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();sbDo('ok');}else if(e.key==='Escape'){e.preventDefault();sbMode='';selbarShow(true);}});
  return SB;
}
function selbarHide(){if(SB){SB.hidden=true;sbMode='';}}
function selRange(){const s=getSelection();return s&&s.rangeCount&&!s.isCollapsed?s.getRangeAt(0):null;}
/* где сейчас выделение: в открытой правке или в тексте статьи (режим чтения) */
function selCtx(){
  const r=selRange();if(!r)return null;
  const a=r.startContainer,b=r.endContainer;const el=n=>n.nodeType===1?n:n.parentElement;
  if(IE&&IE.rich&&IE.rich.contains(a)&&IE.rich.contains(b))return {edit:true,r};
  if(parseHash().k!=='wiki'||wikiMode()||IE)return null;
  {const ca=el(a).closest('#main .mw-content [data-tc]'),cb=el(b).closest('#main .mw-content [data-tc]');
   if(ca||cb){if(ca!==cb)return null;const tbl=ca.closest('[data-l]');if(!tbl)return null;return {table:true,r,cell:ca,row:ca.closest('tr'),tbl};}}
  const A=ieBlockOf(el(a)),Bb=ieBlockOf(el(b));if(!A||!Bb)return null;
  const blk=A.ib?A.cell:A.bl,blk2=Bb.ib?Bb.cell:Bb.bl;if(blk!==blk2)return null;
  if(A.bl&&!/^(P|H2|H3|H4|DL)$/.test(A.bl.tagName))return null;
  return {edit:false,r,blk};
}
function selbarShow(force){
  const c=selCtx();const bar=selbar();
  if(!c){if(!sbMode||!force)bar.hidden=true;return;}
  if(sbMode&&!force)return;
  if(c.table){
    const sw=k=>TABLE_COLORS.map(([col,n])=>`<button type="button" class="sb sw" data-sb="${k}:${col}" title="${n}" aria-label="${k==='cell'?'Ячейка':'Строка'}: ${n}" style="${col?`background:${col}`:''}">${col?'':'✕'}</button>`).join('');
    bar.innerHTML=`<span class="sb-l">Ячейка</span>${sw('cell')}<span class="sb-sep"></span><span class="sb-l">Строка</span>${sw('row')}<span class="sb-sep"></span><button type="button" class="sb" data-sb="tcode" title="Править таблицу разметкой">✎ Разметка</button>`;
    bar.hidden=false;sbPlace(c.r);return;
  }
  const tools=SB_TOOLS.map(([k,l,t])=>`<button type="button" class="sb" data-sb="${k}" title="${t}" aria-label="${t}">${l}</button>`).join('');
  bar.innerHTML=tools+(c.edit?'':`<span class="sb-sep"></span><button type="button" class="sb" data-sb="edit" title="Править этот абзац">✎ Править</button>`);
  bar.hidden=false;sbPlace(c.r);
}
function sbPlace(r){
  const rc=r.getBoundingClientRect();const bar=SB;const w=bar.offsetWidth,h=bar.offsetHeight;
  let x=rc.left+rc.width/2-w/2+window.scrollX;x=Math.max(8+window.scrollX,Math.min(x,window.scrollX+document.documentElement.clientWidth-w-8));
  let y=rc.top+window.scrollY-h-8;if(rc.top-h-8<4)y=rc.bottom+window.scrollY+8;
  bar.style.left=x+'px';bar.style.top=y+'px';
}
/* смещения выделения в тексте блока (без номеров сносок и ссылок «править») */
function textNodes(root){const out=[];const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode:n=>n.parentElement.closest('sup,.mw-editsection,.wk-atom')&&n.parentElement.closest('sup,.mw-editsection,.wk-atom')!==root?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT});let n;while((n=w.nextNode()))out.push(n);return out;}
function rangeOffsets(root,r){
  let pos=0,s=null,e=null;
  for(const n of textNodes(root)){
    if(n===r.startContainer)s=pos+r.startOffset;
    if(n===r.endContainer)e=pos+r.endOffset;
    pos+=n.nodeValue.length;
  }
  if(s==null){const pre=document.createRange();pre.selectNodeContents(root);pre.setEnd(r.startContainer,r.startOffset);s=pre.toString().length;}
  if(e==null)e=s+r.toString().length;
  return [s,e];
}
function rangeAt(root,s,e){
  let pos=0;const r=document.createRange();let okS=false,okE=false;
  for(const n of textNodes(root)){
    const L=n.nodeValue.length;
    if(!okS&&s<=pos+L){r.setStart(n,s-pos);okS=true;}
    if(!okE&&e<=pos+L){r.setEnd(n,e-pos);okE=true;break;}
    pos+=L;
  }
  if(!okS||!okE)return null;return r;
}
function wrapRange(r,el){el.appendChild(r.extractContents());r.insertNode(el);const s=getSelection();s.removeAllRanges();const nr=document.createRange();nr.selectNodeContents(el);s.addRange(nr);}
function sbInput(kind,val){
  sbMode=kind;const r=selRange();sbRange=r&&r.cloneRange();
  const titles=P.pages.map(p=>`<option value="${esc(p.title)}">`).join('');
  SB.innerHTML=`<span class="sb-l">${kind==='ref'?'Текст сноски':kind==='red'?'Красная ссылка на':'Ссылка на статью'}</span><input class="sb-in" ${kind==='ref'?'':'list="sb-pages"'} value="${esc(val||'')}" aria-label="${kind==='ref'?'Текст сноски':'Название статьи'}"><datalist id="sb-pages">${titles}</datalist><button type="button" class="sb sb-ok" data-sb="ok">OK</button><button type="button" class="sb" data-sb="cancel" aria-label="Отмена">✕</button>`;
  const inp=SB.querySelector('input');setTimeout(()=>{inp.focus();inp.select();},0);if(sbRange)sbPlace(sbRange);
}
function sbDo(k){
  if(k==='cancel'){sbMode='';SB.hidden=true;if(sbRange&&IE&&IE.rich){const s=getSelection();s.removeAllRanges();s.addRange(sbRange);IE.rich.focus();}return;}
  if(k==='ok'){
    const kind=sbMode;const v=SB.querySelector('input').value.trim();sbMode='';SB.hidden=true;
    if(!IE||!IE.rich||!sbRange)return;IE.rich.focus();const s=getSelection();s.removeAllRanges();s.addRange(sbRange);
    if(!v)return;
    if(kind==='ref'){const r=sbRange.cloneRange();r.collapse(false);const span=document.createElement('span');span.className='wk-atom';span.contentEditable='false';span.dataset.wk=`<ref>${v}</ref>`;span.title=v;span.innerHTML='<sup class="reference">[*]</sup>';r.insertNode(span);r.setStartAfter(span);r.collapse(true);s.removeAllRanges();s.addRange(r);}
    else{const a=document.createElement('a');a.className='wk-link'+(kind==='red'?' new':'');a.dataset.t=v;a.href='#';wrapRange(sbRange,a);}
    return;
  }
  const c=selCtx();if(!c)return;
  if(c.table){tableAction(c,k);return;}
  if(!c.edit){
    // режим чтения: открываем правку этого блока и переносим выделение
    const [s,e]=rangeOffsets(c.blk,c.r);
    if(!ieOpenAt(c.blk,'rich')||!IE.rich)return;
    const nr=rangeAt(IE.rich,s,e);IE.rich.focus();const sel=getSelection();sel.removeAllRanges();if(nr)sel.addRange(nr);
    if(k==='edit'){selbarShow(true);return;}
  }
  const r=selRange();if(!r||!IE||!IE.rich)return;
  switch(k){
    case 'b':document.execCommand('bold');break;
    case 'i':document.execCommand('italic');break;
    case 'link':sbInput('link',r.toString().trim());return;
    case 'red':sbInput('red',r.toString().trim());return;
    case 'ref':sbInput('ref','');return;
    case 'unlink':{for(const a of [...IE.rich.querySelectorAll('a.wk-link')])if(r.intersectsNode(a)){a.replaceWith(...a.childNodes);}break;}
    case 'clear':{const t=r.toString();r.deleteContents();const tn=document.createTextNode(t);r.insertNode(tn);const nr=document.createRange();nr.selectNodeContents(tn);const s=getSelection();s.removeAllRanges();s.addRange(nr);break;}
  }
  selbarShow(true);
}
/* цвета таблиц, как в Википедии (и. о. в списке президентов — #d1edf2) */
const TABLE_COLORS=[['#d1edf2','голубой'],['#cedff2','синий'],['#d4f4d4','зелёный'],['#fff3b0','жёлтый'],['#ffe4c4','оранжевый'],['#ffd6d6','красный'],['#eaecf0','серый'],['','без цвета']];
function tableAction(c,k){
  const pg=cur();if(!pg)return;
  if(k==='tcode'){selbarHide();ieOpenAt(c.tbl,'code');return;}
  const m=k.match(/^(cell|row):(.*)$/);if(!m)return;const color=m[2];
  const s0=+c.tbl.dataset.l.split('-')[0];const L=String(pg.body||'').replace(/\r/g,'').split('\n');const at=k2=>s0+1+k2;
  if(m[1]==='row'){
    const [rl,fl]=c.row.dataset.tr.split(':').map(Number);
    if(rl>=0){const t=L[at(rl)].trim();const a=setBgAttr(t.slice(2),color);L[at(rl)]='|-'+(a?' '+a:'');}
    else if(color)L.splice(at(fl),0,`|- style="background:${color}"`);
  }else{
    const [li,pi]=c.cell.dataset.tc.split(':').map(Number);const t=L[at(li)].trim();const lead=t[0];
    const parts=t.slice(1).split(lead==='!'?/(!!|\|\|)/:/(\|\|)/);const idx=pi*2;let part=parts[idx];if(part==null)return;
    const mm=part.match(/^\s*((?:[a-z-]+\s*=\s*(?:"[^"]*"|[^\s|"]+)\s*)+)\|(?!\|)(.*)$/i);
    const attrs=mm?mm[1]:'',body=mm?mm[2]:part;const na=setBgAttr(attrs,color);
    parts[idx]=na?' '+na+' |'+(body.startsWith(' ')?body:' '+body):(body.startsWith(' ')?body:' '+body);
    L[at(li)]=lead+parts.join('');
  }
  pg.body=L.join('\n');pg.updated=Date.now();save();selbarHide();getSelection().removeAllRanges();
  const y=window.scrollY;viewArticle(pg);window.scrollTo(0,y);toast(color?(m[1]==='row'?'Цвет строки изменён':'Цвет ячейки изменён'):'Цвет убран');
}
let sbT=0;
document.addEventListener('selectionchange',()=>{if(sbMode)return;cancelAnimationFrame(sbT);sbT=requestAnimationFrame(()=>selbarShow(false));});
window.addEventListener('resize',()=>{if(SB&&!SB.hidden&&!sbMode)selbarShow(true);});

/* ---------- события ---------- */
document.addEventListener('dblclick',e=>{
  const t=e.target;if(t.closest('a,button,input,textarea,select,.fplayer,.ie,#main .mw-content .table-wrap [data-tc]'))return;
  if(ieOpenAt(t,'rich')){e.preventDefault();}
});
document.addEventListener('keydown',e=>{
  if(!IE||!e.target.closest('.ie'))return;
  if(e.key==='Escape'){e.preventDefault();closeIE();return;}
  if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();ieSave();return;}
  if(IE.rich&&e.target===IE.rich){
    if(e.key==='Enter'){e.preventDefault();if(/^H/.test(IE.rich.tagName))ieSave();else document.execCommand('insertLineBreak');return;}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();if(selRange())sbInput('link',selRange().toString().trim());return;}
  }
});
document.addEventListener('paste',e=>{
  if(!IE||!IE.rich||!IE.rich.contains(e.target))return;
  e.preventDefault();const t=(e.clipboardData||window.clipboardData).getData('text/plain');document.execCommand('insertText',false,t);
});
document.addEventListener('click',e=>{if(e.target.closest('.ie-rich a, .ie-rich .wk-atom')){e.preventDefault();e.stopPropagation();}},true);
document.addEventListener('mousedown',e=>{if(SB&&!SB.hidden&&!e.target.closest('.selbar')&&sbMode){sbMode='';SB.hidden=true;}});
