'use strict';
/* Импорт статьи из Википедии: готовый HTML через API → разметка редактора (карточка, текст, сноски, категории) */

const WI_LANGS={ru:'Русская',en:'English',uk:'Українська',be:'Беларуская',de:'Deutsch',fr:'Français',es:'Español',it:'Italiano',pl:'Polski',pt:'Português',ja:'日本語',zh:'中文'};
const WI_STOP=/^(примечания|комментарии|литература|ссылки|см\.\s*также|источники|библиография|references|notes|citations|footnotes|external links|further reading|see also|sources|bibliography|einzelnachweise|weblinks|literatur|siehe auch|anmerkungen|notes et références|liens externes|bibliographie|voir aussi|примітки|посилання|література|див\. також)$/i;
const WI_TYPES=[
  [/выбор|election|референдум|referendum/i,'election'],
  [/государственный деятель|политик|officeholder|ib-officeholder|president|prime minister/i,'leader'],
  [/монарх|royalty|ib-royalty/i,'monarch'],
  [/вооружённый конфликт|сражение|military conflict|ib-military-conflict|battle/i,'battle'],
  [/политическая партия|political party|ib-political-party/i,'party'],
  [/выборы|election|ib-election/i,'election'],
  [/историческое государство|государство|country|ib-country|former country/i,'country'],
  [/договор|treaty/i,'treaty'],
  [/воинское формирование|military unit|ib-military-unit/i,'unit'],
  [/организация|organization|organisation|ib-organization|alliance/i,'org'],
  [/населённый пункт|город|settlement|ib-settlement|city/i,'city'],
  [/событие|event|civil conflict|ib-event|catastrophe|disaster/i,'event'],
  [/персона|person|учёный|писатель|военачальник|scientist|writer|military person|ib-person/i,'person'],
];

function wiParseInput(q,lang){
  q=String(q||'').trim();
  const m=q.match(/^https?:\/\/([a-z-]+)(?:\.m)?\.wikipedia\.org\/wiki\/([^?#]+)/i);
  if(m)return {lang:m[1].toLowerCase(),title:decodeURIComponent(m[2]).replace(/_/g,' ')};
  const m2=q.match(/^https?:\/\/([a-z-]+)(?:\.m)?\.wikipedia\.org\/w\/index\.php\?.*title=([^&#]+)/i);
  if(m2)return {lang:m2[1].toLowerCase(),title:decodeURIComponent(m2[2]).replace(/_/g,' ')};
  return {lang,title:q};
}
async function wiFetch(lang,title){
  const u=`https://${lang}.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(title)}&prop=text|categories|displaytitle&format=json&formatversion=2&redirects=1&disableeditsection=1&origin=*`;
  const r=await fetch(u);if(!r.ok)throw new Error('Википедия ответила ошибкой '+r.status);
  const j=await r.json();
  if(j.error)throw new Error(j.error.code==='missingtitle'?'В Википедии нет статьи «'+title+'»':j.error.info);
  return j.parse;
}

/* ---------- конвертер ---------- */
function makeConverter(lang,opts){
  const C={lang,media:[],refs:{},refUse:{},refNames:{},refCount:0,opts};
  const mediaName=(img)=>{
    let src=img.getAttribute('src')||'';if(!src)return '';if(src.startsWith('//'))src='https:'+src;
    src=src.replace(/\?utm_[^"]*$/,'');
    const a=img.closest('a');let file='';
    const href=a&&a.getAttribute('href')||'';const fm=href.match(/\/wiki\/[^:]+:(.+)$/);
    file=fm?decodeURIComponent(fm[1]):decodeURIComponent(src.split('/').pop().replace(/^\d+px-/,''));
    let name=file.replace(/\.(svg|png|jpe?g|gif|webp|tiff?)(\.png)?$/i,'').replace(/_/g,' ').trim()||'Картинка';
    const same=P.media.find(m=>m.src===src)||C.media.find(m=>m.src===src);if(same)return same.name;
    let n=name,k=2;while(P.media.some(m=>m.name===n)||C.media.some(m=>m.name===n))n=`${name} (${k++})`;
    C.media.push({name:n,src});return n;
  };
  C.mediaName=mediaName;
  const SKIP='style,link,meta,script,.mw-editsection,.mw-empty-elt,.noprint,.reference-accessdate,.sortkey,.mw-cite-backlink,.Z3988,.metadata,.navbar,.plainlinks.hlist.navbar,.ext-phonos';
  const linkTitle=href=>{const m=href.match(/^\/wiki\/([^#?]+)/);if(!m)return null;const t=decodeURIComponent(m[1]).replace(/_/g,' ');if(/^[^:]+:/.test(t)&&!/^[^:]+: /.test(t)&&/^(Файл|File|Категория|Category|Служебная|Special|Шаблон|Template|Википедия|Wikipedia|Портал|Portal|Help|Справка|Обсуждение|Talk|Image|Изображение)/i.test(t))return null;return t;};
  /* стрелки и треугольники из шаблонов ru.wiki (span.ts-…) и картинки en.wiki (Increase2.svg …) */
  const TS={'ts-up-arrow':'рост','ts-down-arrow':'падение','ts-updown-arrow':'падение+','ts-downup-arrow':'рост-','ts-nochange-arrow':'неизм','ts-up':'▲','ts-profit':'▲','ts-down':'▼','ts-loss':'▼','ts-updown':'▼+','ts-downup':'▲-','ts-nochange':'▬','ts-stalledprofit':'▬'};
  const TIMG=[[/^(increase2|increase|increase positive|green arrow up(?: darker)?|arrow up green|up green arrow)$/,'▲'],[/^(decrease2|decrease|decrease negative|red arrow down|arrow down red|down red arrow)$/,'▼'],[/^(increase negative|red arrow up|arrow up red)$/,'▲-'],[/^(decrease positive|green arrow down|arrow down green)$/,'▼+'],[/^(increase neutral|increase steady)$/,'▲0'],[/^(decrease neutral|decrease steady)$/,'▼0'],[/^(steady|steady hold|nochange|no change|blue steady|yellow arrow right|steady2)$/,'▬']];
  function trendOf(el){
    const tag=el.tagName.toLowerCase();
    if(tag==='span'){for(const c of el.classList)if(TS[c])return `{{${TS[c]}}}`;}
    const img=tag==='img'?el:(tag==='span'||tag==='a'||tag==='figure')&&el.querySelectorAll('img').length===1&&!el.textContent.trim()?el.querySelector('img'):null;
    if(!img)return '';
    const w=+img.getAttribute('width')||0;if(w>30)return '';
    const a=img.closest('a');const href=a&&a.getAttribute('href')||'';
    let f=(href.match(/\/wiki\/[^:]+:(.+)$/)||[])[1]||(img.getAttribute('src')||'').split('?')[0].split('/').pop().replace(/^\d+px-/,'');
    try{f=decodeURIComponent(f);}catch(e){}
    f=f.replace(/\.(svg|png|gif)(\.png)?$/i,'').replace(/_/g,' ').replace(/\s+/g,' ').trim().toLowerCase();
    for(const [re,t] of TIMG)if(re.test(f))return `{{${t}}}`;
    return '';
  }
  const wrapLines=(t,a,b)=>t.split('\n').map(x=>x.trim()?a+x+b:x).join('\n');
  function inl(node,ctx={}){
    let out='';
    for(const n of node.childNodes){
      if(n.nodeType===3){out+=n.nodeValue.replace(/[\u200b\u200c\u2060\ufeff]/g,'').replace(/[ \t\n\r\f\v]+/g,' ');continue;}
      if(n.nodeType!==1)continue;
      const el=n,tag=el.tagName.toLowerCase();
      if(el.matches(SKIP))continue;
      if(el.getAttribute('style')&&/display:\s*none/i.test(el.getAttribute('style')))continue;
      if(tag==='sup'&&el.classList.contains('reference')){out+=refMark(el);continue;}
      {const tr=trendOf(el);if(tr){out+=tr;continue;}}
      if(el.classList.contains('mw-tmh-player')||tag==='audio'||tag==='video'){
        const a=tag==='audio'||tag==='video'?el:el.querySelector('audio,video');const hint=+(a&&a.getAttribute('data-durationhint'))||0;
        const lab=el.querySelector('.mw-tmh-duration [aria-hidden]');const d=(lab&&lab.textContent.trim())||(hint?Math.floor(hint/60)+':'+String(Math.round(hint%60)).padStart(2,'0'):'');
        out+=(ctx.lines?'\n':' ')+`{{плеер${d?'|'+d:''}}}`+(ctx.lines?'\n':' ');continue;}
      if(tag==='br'){out+=ctx.lines?'\n':'<br>';continue;}
      if(tag==='img'){
        const w=+el.getAttribute('width')||0,h=+el.getAttribute('height')||0;
        if(!opts.images)continue;
        if(w&&w<=60||h&&h<=40){const nm=mediaName(el);if(nm)out+=`[[Файл:${nm}|${Math.max(12,Math.min(40,h||15))}px]] `;}
        else if(ctx.big){const nm=mediaName(el);if(nm)out+=`[[Файл:${nm}|${Math.min(120,h||60)}px]]`;}
        continue;
      }
      if(tag==='a'){
        const href=el.getAttribute('href')||'';
        if(el.querySelector('img')){out+=inl(el,ctx);continue;}
        const text=inl(el,ctx).trim();if(!text)continue;
        if(el.classList.contains('external')||/^https?:/.test(href)){out+=href.startsWith('http')?`[${href} ${text}]`:text;continue;}
        const t=linkTitle(href)||(el.classList.contains('new')&&(el.getAttribute('title')||'').replace(/\s*\(.*(страница|page).*\)\s*$/i,''));
        if(t){out+=(t===text?`[[${t}]]`:(text.startsWith(t)&&/^[а-яёa-z]*$/i.test(text.slice(t.length))?`[[${t}]]${text.slice(t.length)}`:`[[${t}|${text}]]`));}else out+=text;
        continue;
      }
      if(tag==='b'||tag==='strong'){out+=wrapLines(inl(el,ctx),"'''","'''");continue;}
      if(tag==='i'||tag==='em'){out+=wrapLines(inl(el,ctx),"''","''");continue;}
      if(['small','sup','sub','s','u'].includes(tag)){out+=wrapLines(inl(el,ctx),`<${tag}>`,`</${tag}>`);continue;}
      if(tag==='ul'||tag==='ol'){
        const items=[...el.children].filter(li=>li.tagName==='LI').map(li=>inl(li,ctx).trim()).filter(Boolean);
        if(el.closest('.hlist')){out+=items.join('\u00a0· ');continue;}
        out+=ctx.lines?'\n'+items.map(x=>'* '+x).join('\n')+'\n':items.join(', ');continue;
      }
      if(tag==='li'||tag==='p'||tag==='div'||tag==='dd'||tag==='dt'){const t=inl(el,ctx);out+=ctx.lines?(t.trim()?'\n'+t+'\n':''):t+' ';continue;}
      if(tag==='table'){
        // вложенная таблица в ячейке: строки через перевод строки
        const rows=[...el.rows].map(r=>[...r.cells].map(c=>inl(c,ctx).trim()).filter(Boolean).join(' ')).filter(Boolean);
        out+=ctx.lines?'\n'+rows.join('\n')+'\n':rows.join('; ');continue;
      }
      out+=inl(el,ctx);
    }
    return out;
  }
  function tidy(s,lines){
    s=s.replace(/[ \t ]+/g,m=>m.includes(' ')?' ':' ');
    if(lines)s=s.split('\n').map(x=>x.trim()).filter(Boolean).join('\n');
    else s=s.replace(/\s*\n\s*/g,' ');
    return s.replace(/\s+(<ref)/g,'$1').replace(/ ([,.;:)])/g,'$1').trim();
  }
  function refMark(sup){
    const a=sup.querySelector('a[href^="#"]');if(!a)return '';
    const id=decodeURIComponent(a.getAttribute('href').slice(1));
    const text=C.refs[id];if(text==null)return '';
    if(!C.refNames[id]){C.refNames[id]='r'+(++C.refCount);return `<ref name="${C.refNames[id]}">${text}</ref>`;}
    return `<ref name="${C.refNames[id]}"/>`;
  }
  C.collectRefs=root=>{
    for(const li of root.querySelectorAll('ol.references > li[id]')){
      const t=li.querySelector('.reference-text')||li;
      const c=t.cloneNode(true);c.querySelectorAll('.mw-cite-backlink').forEach(x=>x.remove());
      C.refs[li.id]=tidy(inl(c,{}),false).replace(/<\/?ref[^>]*>/g,'');
    }
  };
  C.inline=(node,lines)=>tidy(inl(node,{lines,big:lines}),lines);
  return C;
}

function wiInfobox(tbl,C){
  const rows=[];let title='';
  const cap=tbl.querySelector(':scope > caption');if(cap)title=C.inline(cap,false);
  for(const tr of tbl.rows){
    const cells=[...tr.cells];if(!cells.length)continue;
    const th=cells.filter(c=>c.tagName==='TH'),td=cells.filter(c=>c.tagName==='TD');
    const one=cells.length===1?cells[0]:null;
    if(one&&(one.classList.contains('infobox-above')||(!rows.length&&!title&&one.tagName==='TH'&&!one.querySelector('img')))){title=title||C.inline(one,false);continue;}
    if(one&&one.classList.contains('infobox-below')){const v=C.inline(one,true);if(v)rows.push(R.below(v));continue;}
    if(one&&(one.classList.contains('infobox-header')||one.tagName==='TH')){
      const imgs=C.opts.images?[...one.querySelectorAll('img')]:[];
      const lbl=one.querySelector('.label');const text=C.inline(lbl||one,false);
      if(imgs.length>=2&&lbl){rows.push(R.h(text,C.mediaName(imgs[0]),C.mediaName(imgs[imgs.length-1])));}
      else if(text)rows.push(R.h(text));
      continue;
    }
    if(one&&one.querySelector('hr')&&!one.textContent.trim()){rows.push(R.hr());continue;}
    {const tl=one&&one.querySelector('[class*="хронология"],.ts-Карточка-хронология');
     if(tl){const part=sel=>{const e=tl.querySelector(sel);return e?C.inline(e,false).replace(/^\s*←\s*|\s*→\s*$/g,'').trim():'';};
       rows.push(R.s(part('[class*="изображение"]'),part('[class*="prev"]'),part('[class*="next"]')));continue;}}
    if(cells.length===3&&!th.length&&/^\s*←/.test(cells[0].textContent)&&/→\s*$/.test(cells[2].textContent)){
      const v=c=>C.inline(c,false).replace(/^\s*←\s*|\s*→\s*$/g,'').trim();rows.push(R.s(v(cells[1]),v(cells[0]),v(cells[2])));continue;}
    // стороны конфликта во вложенной таблице (русская Википедия): колонки
    const nt=one&&[...one.querySelectorAll('table')].find(t=>t.closest('td')===one&&[...t.rows].some(r=>r.cells.length>=2)&&![...t.querySelectorAll('img')].some(i=>(+i.getAttribute('width')||0)>60||(+i.getAttribute('height')||0)>60));
    if(nt){
      const n=Math.max(...[...nt.rows].map(r=>r.cells.length));const vals=Array(n).fill('');
      for(const r of nt.rows)[...r.cells].forEach((c,j)=>{const v=C.inline(c,true);if(v)vals[j]+=(vals[j]?'\n':'')+v;});
      const prev=rows[rows.length-1];
      if(prev&&prev.t==='header'&&!prev.l&&!prev.r){rows.pop();rows.push(R.c(prev.text,vals));}else rows.push(R.c('',vals));
      continue;
    }
    if(one){
      const big=[...one.querySelectorAll('img')].filter(i=>(+i.getAttribute('width')||0)>60||(+i.getAttribute('height')||0)>60);
      if(big.length&&C.opts.images){
        const caps=[...one.querySelectorAll('.infobox-caption,.media-caption,.ib-country-map-caption,figcaption')];
        if(big.length>=2){
          // флаг и герб: подпись под каждой картинкой ищем в ближайшем общем блоке
          const isBig=i=>(+i.getAttribute('width')||0)>60||(+i.getAttribute('height')||0)>60;
          const capFor=img=>{let p=img.parentElement,best=null;while(p&&p!==one&&[...p.querySelectorAll('img')].filter(isBig).length===1){best=p;p=p.parentElement;}return best?best.textContent.replace(/s+/g,' ').trim():'';};
          const capEls=[...one.querySelectorAll('.media-caption,.infobox-caption')];const capOf=(img,i)=>capEls.length>=2?C.inline(capEls[i],false):(capFor(img)||img.getAttribute('alt')||'');
          rows.push(R.i2(C.mediaName(big[0]),capOf(big[0],0),C.mediaName(big[1]),capOf(big[1],1)));
          for(const extra of big.slice(2))rows.push(R.i(C.mediaName(extra),'',Math.min(300,+extra.getAttribute('width')||250)));
        }else{
          const clone=one.cloneNode(true);clone.querySelectorAll('img').forEach(i=>{const w=+i.getAttribute('width')||0;if(w>60)i.remove();});
          clone.querySelectorAll('figcaption').forEach(f=>{if(!f.textContent.trim())f.remove();});
          const capText=caps.map(x=>C.inline(x,false)).find(Boolean)||C.inline(clone,false);
          rows.push(R.i(C.mediaName(big[0]),capText,Math.min(400,+big[0].getAttribute('width')||250)));
        }
        continue;
      }
      const st=one.getAttribute('style')||'';
      if(/text-align:\s*left/i.test(st)&&/font-weight:\s*bold/i.test(st)){const v=C.inline(one,false);if(v)rows.push(R.f('='+v,''));continue;}
      const v=C.inline(one,true);if(v)rows.push(R.t(v));continue;
    }
    if(th.length===1&&td.length>=2&&cells[0]===th[0]){
      const label=C.inline(th[0],false).replace(/\u00ad/g,'');let cr=rows[rows.length-1];
      if(!cr||cr.t!=='cands'||!cr._open){cr={t:'cands',per:td.length,cands:[],stats:[],wiki:true,_open:true,_base:0};rows.push(cr);}
      const big=td.map(c=>[...c.querySelectorAll('img')].find(i=>(+i.getAttribute('width')||0)>60||(+i.getAttribute('height')||0)>60));
      const colorOf=c=>{for(const e of [c,...c.querySelectorAll('[style]')]){const m=(e.getAttribute('style')||'').match(/(?:border-bottom|border-top|background(?:-color)?)\s*:[^;]*?(#[0-9a-f]{3,8}\b|rgb\([^)]*\))/i);if(m)return m[1];}return '';};
      const ensure=n=>{while(cr.cands.length<n)cr.cands.push({name:'',src:'',color:'#a2a9b1'});};
      // несколько кандидатов рядами (ru.wiki: по двое) — каждая новая строка фото или имён начинает следующий ряд
      const group=()=>cr.cands.slice(cr._base);
      const isPhoto=big.some(Boolean)&&C.opts.images;
      const isName=/^(кандидат|candidate|nominee|лидер|leader)$/i.test(label.trim());
      if((isPhoto&&group().some(x=>x.src||x.name))||(isName&&group().some(x=>x.name)))cr._base=cr.cands.length;
      const b0=cr._base;
      if(isPhoto){ensure(b0+td.length);td.forEach((c,k)=>{if(big[k])cr.cands[b0+k].src=C.mediaName(big[k]);const col=colorOf(c);if(col)cr.cands[b0+k].color=col;});cr.photoLabel=label;continue;}
      if(td.every(c=>!c.textContent.trim())&&td.some(c=>colorOf(c))){ensure(b0+td.length);td.forEach((c,k)=>{const col=colorOf(c);if(col)cr.cands[b0+k].color=col;});continue;}
      const vals=td.map(c=>C.inline(c,true));
      if(isName){ensure(b0+vals.length);vals.forEach((v,k)=>cr.cands[b0+k].name=v);cr.nameLabel=label;continue;}
      // строка данных: та же подпись во втором ряду дополняет уже начатую строку
      let st=cr.stats.find(x=>x.label===label&&vals.every((v,k)=>!String(x.values[b0+k]||'').trim()));
      if(!st){st={label,values:[]};cr.stats.push(st);}
      vals.forEach((v,k)=>st.values[b0+k]=v);continue;
    }
    {const last=rows[rows.length-1];if(last&&last._open)delete last._open;}
    if(th.length===1&&td.length===1){const label=C.inline(th[0],false),v=C.inline(td[0],true);if(v)rows.push(R.f(label,v));continue;}
    if(td.length>=2&&!th.length){
      const vals=td.map(c=>C.inline(c,true));
      const prev=rows[rows.length-1];
      if(prev&&prev.t==='header'&&!prev.l&&!prev.r){rows.pop();rows.push(R.c(prev.text,vals));}
      else if(prev&&prev.t==='cols'&&prev.cells.length===vals.length&&!prev.label){prev.cells=prev.cells.map((c,i)=>c+(vals[i]?'\n'+vals[i]:''));}
      else rows.push(R.c('',vals));
      continue;
    }
    const v=C.inline(tr,true);if(v)rows.push(R.t(v));
  }
  // кандидаты: убираем пустые колонки (в ru.wiki их всегда на одну больше)
  for(const r of rows){if(r.t!=='cands')continue;delete r._open;delete r._base;
    const W=Math.max(1,r.per||2);let n=Math.max(r.cands.length,...r.stats.map(s=>s.values.length));
    for(const st of r.stats)for(let k=0;k<n;k++)if(st.values[k]==null)st.values[k]='';
    const used=j=>(r.cands[j]&&(r.cands[j].name||r.cands[j].src))||r.stats.some(s=>String(s.values[j]||'').trim());
    while(r.cands.length<n)r.cands.push({name:'',src:'',color:'#a2a9b1'});
    // в каждом ряду ширины W убираем пустые хвостовые колонки, если они пусты во всех рядах
    let w=W;while(w>1){let empty=true;for(let g=0;g<n;g+=W)if(used(g+w-1))empty=false;if(!empty)break;w--;}
    const keep=[...Array(n).keys()].filter(j=>j%W<w&&(j<n));
    const last=keep.filter(used).pop();const keep2=keep.filter(j=>last==null||j<=last);
    r.cands=keep2.map(j=>r.cands[j]);r.stats.forEach(s=>s.values=keep2.map(j=>s.values[j]||''));r.per=Math.max(1,Math.min(4,w));}
  return {title,rows};
}

function wiBody(root,C,opts){
  const out=[];let skipLevel=0;let hatnote='';
  const push=s=>{s=String(s).trim();if(s)out.push(s);};
  const tableMarkup=tbl=>{
    let s='{| class="wikitable"\n';const cap=tbl.querySelector(':scope > caption');if(cap)s+='|+ '+C.inline(cap,false)+'\n';
    let first=true;
    for(const tr of tbl.rows){if(!first)s+='|-\n';first=false;
      for(const c of tr.cells){
        const at=['colspan','rowspan'].filter(a=>+c.getAttribute(a)>1).map(a=>`${a}="${c.getAttribute(a)}"`).join(' ');
        const st=(c.getAttribute('style')||'').match(/background(?:-color)?\s*:\s*#[0-9a-f]{3,6}/i);
        const attrs=[at,st?`style="${st[0]}"`:''].filter(Boolean).join(' ');
        s+=(c.tagName==='TH'?'! ':'| ')+(attrs?attrs+' | ':'')+C.inline(c,false).replace(/\|\|/g,'| |')+'\n';}
    }
    return s+'|}';
  };
  const listMarkup=(el,prefix)=>{
    const lines=[];
    for(const li of el.children){if(li.tagName!=='LI')continue;
      const clone=li.cloneNode(true);const subs=[...clone.querySelectorAll(':scope > ul,:scope > ol')];subs.forEach(x=>x.remove());
      lines.push(prefix+' '+C.inline(clone,false));
      for(const sub of li.querySelectorAll(':scope > ul,:scope > ol'))lines.push(listMarkup(sub,prefix+(sub.tagName==='OL'?'#':'*')));
    }
    return lines.join('\n');
  };
  const figure=el=>{
    if(!opts.images)return;
    const img=el.querySelector('img');if(!img)return;
    const nm=C.mediaName(img);if(!nm)return;
    const cap=el.querySelector('figcaption,.thumbcaption');
    const w=Math.min(300,+img.getAttribute('width')||220);
    push(`[[Файл:${nm}|${w}px|${cap?C.inline(cap,false).replace(/\|/g,'/'):''}]]`);
  };
  const walk=parent=>{
    for(const el of parent.children){
      const tag=el.tagName.toLowerCase();
      // заголовки
      const h=tag.match(/^h([2-4])$/)?el:(el.classList.contains('mw-heading')?el.querySelector('h2,h3,h4'):null);
      if(h){
        const lv=+h.tagName[1];const t=C.inline(h,false).replace(/<ref[\s\S]*?(\/>|<\/ref>)/g,'').replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g,'$1');
        if(skipLevel&&lv>skipLevel)continue;
        skipLevel=0;
        if(WI_STOP.test(t.replace(/[.:]$/,'').trim())){skipLevel=lv;continue;}
        push('='.repeat(lv)+' '+t+' '+'='.repeat(lv));continue;
      }
      if(skipLevel)continue;
      if(el.matches('style,link,meta,.infobox,.navbox,.navbox-styles,.vertical-navbox,.sidebar,.metadata,.ambox,.ombox,.tmbox,.toc,#toc,.mw-references-wrap,.reflist,.references,.noprint,.sistersitebox,.side-box,.shortdescription,.mw-empty-elt,.mw-editsection,.gallery,.mw-kartographer-maplink,.thumb.tright .navbox,.printfooter,.catlinks'))continue;
      if(el.matches('.hatnote,.dablink,.rellink')){
        const t=C.inline(el,false);
        if(/перенаправля|redirects? here|weitergeleitet|redirige/i.test(t))continue;
        if(!out.length)hatnote=hatnote?hatnote+' '+t:t;
        else{const m=t.match(/^(основная статья|основные статьи|main article|main articles)\s*:\s*(.+)$/i);if(m)push('{{основная статья|'+m[2].replace(/\[\[(?:([^\]|]*)\|)?([^\]]*)\]\]/g,(x,a,b)=>a||b).split(/,\s*| и | and /).join('|')+'}}');}
        continue;
      }
      if(tag==='p'){const t=C.inline(el,false);if(t)push(t);continue;}
      if(tag==='ul'||tag==='ol'){push(listMarkup(el,tag==='ol'?'#':'*'));continue;}
      if(tag==='dl'){for(const d of el.children)push((d.tagName==='DT'?"'''":': ')+C.inline(d,false)+(d.tagName==='DT'?"'''":''));continue;}
      if(tag==='blockquote'){push(': '+C.inline(el,false));continue;}
      if(tag==='table'){if(el.classList.contains('wikitable')||el.classList.contains('standard'))push(tableMarkup(el));continue;}
      if(tag==='figure'||el.classList.contains('thumb')){figure(el);continue;}
      if(tag==='div'||tag==='section'){walk(el);continue;}
    }
  };
  walk(root);
  return {body:out.join('\n\n'),hatnote};
}

async function wikiImport(q,lang,opts){
  const {lang:L,title}=wiParseInput(q,lang);if(!title)throw new Error('Введите название статьи или ссылку на неё');
  const parse=await wiFetch(L,title);
  const doc=new DOMParser().parseFromString(parse.text,'text/html');
  const root=doc.querySelector('.mw-parser-output')||doc.body;
  const C=makeConverter(L,opts);
  C.collectRefs(root);
  const ibEl=root.querySelector('table.infobox');
  const disp=(new DOMParser().parseFromString(parse.displaytitle||parse.title,'text/html').body.textContent||parse.title).trim();
  let type='blank';
  if(ibEl){const key=(ibEl.getAttribute('data-name')||'')+' '+ibEl.className.replace(/\b(vevent|vcard|geography|hproduct|infobox)\b/g,'');for(const [re,t] of WI_TYPES)if(re.test(key)){type=t;break;}}
  const ib=ibEl?wiInfobox(ibEl,C):{title:'',rows:[]};
  if(ib.rows.some(r=>r.t==='cols')&&!['battle','war'].includes(type))type='battle';
  const {body,hatnote}=opts.body?wiBody(root,C,opts):{body:'',hatnote:''};
  let pageTitle=disp,k=2;while(pageFind(pageTitle))pageTitle=`${disp} (${k++})`;
  const cats=(parse.categories||[]).filter(c=>!c.hidden).map(c=>c.category.replace(/_/g,' '));
  const pg=newPage(type,pageTitle);
  if(L==='en')pg.lang='en';else if(L==='ru'&&(P.wiki.lang||'ru')!=='ru')pg.lang='ru';
  Object.assign(pg,{hatnote:opts.body?hatnote:'',body:body||`'''${pageTitle}''' — …`,cats:cats.join(', '),
    source:{lang:L,title:parse.title,url:`https://${L}.wikipedia.org/wiki/${encodeURIComponent(parse.title.replace(/ /g,'_'))}`}});
  pg.ib={title:ib.title||pageTitle,custom:false,theme:'#3366cc',w:23,rows:ib.rows.length?ib.rows:pg.ib.rows};
  P.media.push(...C.media);P.pages.push(pg);save();
  return {pg,images:C.media.length,refs:C.refCount};
}

/* ---------- интерфейс ---------- */
function wiImportHTML(q=''){
  return `<section class="wi-box" id="wi"><h2 class="wi-h">Импорт из Википедии</h2>
  <p>Вставьте ссылку на статью или введите её название. Карточка, текст, таблицы, сноски и категории перенесутся в редактор, и статью можно будет переделать под свою альтернативную историю.</p>
  <form class="wi-row" data-form="wi"><select id="wi-lang" aria-label="Язык Википедии">${Object.entries(WI_LANGS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select><input id="wi-q" list="wi-sugg" value="${esc(q)}" placeholder="Например: Бородинское сражение или https://en.wikipedia.org/wiki/…" autocomplete="off" aria-label="Статья Википедии"><datalist id="wi-sugg"></datalist><button class="btn pri" id="wi-go">Импортировать</button></form>
  <div class="line"><label class="inl"><input type="checkbox" id="wi-body" checked> текст статьи</label><label class="inl"><input type="checkbox" id="wi-imgs" checked> картинки и флаги</label></div>
  <div id="wi-msg" class="cnt" role="status"></div></section>`;
}
let wiT;
document.addEventListener('input',e=>{
  if(e.target.id!=='wi-q')return;clearTimeout(wiT);
  const v=e.target.value.trim();if(v.length<2||/^https?:/.test(v))return;
  wiT=setTimeout(async()=>{
    const lang=$('#wi-lang').value;
    try{const r=await fetch(`https://${lang}.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(v)}&limit=8&namespace=0&format=json&origin=*`);const j=await r.json();
      const dl=$('#wi-sugg');if(dl)dl.innerHTML=(j[1]||[]).map(t=>`<option value="${esc(t)}">`).join('');}catch(err){}
  },250);
});
document.addEventListener('submit',async e=>{
  if(e.target.dataset.form!=='wi')return;e.preventDefault();e.stopImmediatePropagation();
  const q=$('#wi-q').value,lang=$('#wi-lang').value,btn=$('#wi-go'),msg=$('#wi-msg');
  btn.disabled=true;msg.className='cnt';msg.textContent='Загружаю статью из Википедии…';
  try{
    const r=await wikiImport(q,lang,{body:$('#wi-body').checked,images:$('#wi-imgs').checked});
    toast(`Статья «${r.pg.title}» импортирована: ${r.images} ${plural(r.images,'картинка','картинки','картинок')}, ${r.refs} ${plural(r.refs,'сноска','сноски','сносок')}`);
    location.hash='#/wiki/'+slug(r.pg.title);
  }catch(err){msg.className='cnt err';msg.textContent='Не получилось: '+(err.message||err);}
  finally{btn.disabled=false;}
},true);
