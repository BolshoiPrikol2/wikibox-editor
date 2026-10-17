'use strict';
/* ---------- визуальный редактор таблиц (wikitable) ---------- */

/* разметка {| … |} → модель {attrs, cap, rows:[{attrs, cells:[{h, attrs, c}]}]} */
function tableParse(src){
  const T={attrs:'class="wikitable"',cap:'',rows:[]};let row=null;
  for(const raw of String(src||'').replace(/\r/g,'').split('\n')){
    const l=raw.trim();if(!l)continue;
    if(l.startsWith('{|')){T.attrs=l.slice(2).trim()||'class="wikitable"';continue;}
    if(l.startsWith('|}'))break;
    if(l.startsWith('|+')){T.cap=l.slice(2).replace(/^\s*(?:[a-z-]+\s*=\s*(?:"[^"]*"|[^\s|"]+)\s*)+\|(?!\|)/i,'').trim();continue;}
    if(l.startsWith('|-')){row={attrs:l.slice(2).trim(),cells:[]};T.rows.push(row);continue;}
    if(l[0]==='!'||l[0]==='|'){
      if(!row){row={attrs:'',cells:[]};T.rows.push(row);}
      const h=l[0]==='!';
      for(const part of l.slice(1).split(h?/!!|\|\|/:/\|\|/)){
        const m=part.match(/^\s*((?:[a-z-]+\s*=\s*(?:"[^"]*"|[^\s|"]+)\s*)+)\|(?!\|)(.*)$/i);
        row.cells.push({h,attrs:m?m[1].trim():'',c:(m?m[2]:part).trim()});
      }
    }else if(row&&row.cells.length){const c=row.cells[row.cells.length-1];c.c+=(c.c?'<br>':'')+l;}
  }
  T.rows=T.rows.filter(r=>r.cells.length);
  if(!T.rows.length)T.rows=[{attrs:'',cells:[{h:true,attrs:'',c:'Заголовок'},{h:true,attrs:'',c:'Заголовок'}]},{attrs:'',cells:[{h:false,attrs:'',c:''},{h:false,attrs:'',c:''}]}];
  return T;
}
/* модель → разметка: каждая ячейка на своей строке, переносы внутри ячейки — <br> */
function tableWiki(T){
  let s=`{|${T.attrs?' '+T.attrs:''}\n`;if(T.cap)s+=`|+ ${T.cap}\n`;
  T.rows.forEach((r,i)=>{if(i||r.attrs)s+=`|-${r.attrs?' '+r.attrs:''}\n`;
    for(const c of r.cells){const v=String(c.c||'').replace(/\n/g,'<br>').replace(/\|\|/g,'| |');s+=`${c.h?'!':'|'}${c.attrs?' '+c.attrs+' |':''} ${v}\n`;}});
  return s+'|}';
}
const spanOf=(c,k)=>Math.max(1,+((c.attrs||'').match(new RegExp(k+'\\s*=\\s*"?(\\d+)','i'))||[])[1]||1);
function setSpan(c,k,n){let a=(c.attrs||'').replace(new RegExp('\\s*'+k+'\\s*=\\s*("[^"]*"|[^\\s|"]+)','i'),'').trim();if(n>1)a=(a?a+' ':'')+`${k}="${n}"`;c.attrs=a;}
function setStyle(attrs,prop,val){
  let a=String(attrs||'');const sm=a.match(/style\s*=\s*"([^"]*)"/i);const re=new RegExp('(^|;)\\s*'+prop+'\\s*:[^;]*','gi');
  if(sm){let st=sm[1].replace(re,'$1').split(';').map(x=>x.trim()).filter(Boolean).join(';');if(val)st=(st?st+';':'')+prop+':'+val;a=st?a.replace(sm[0],`style="${st}"`):a.replace(sm[0],'').trim();}
  else if(val)a=(a?a+' ':'')+`style="${prop}:${val}"`;
  return a.replace(/\s+/g,' ').trim();
}
const styleOf=(attrs,prop)=>{const m=String(attrs||'').match(/style\s*=\s*"([^"]*)"/i);const v=m&&m[1].match(new RegExp('(?:^|;)\\s*'+prop+'\\s*:\\s*([^;]+)','i'));return v?v[1].trim():(prop==='background'&&(String(attrs||'').match(/bgcolor\s*=\s*"?([#\w]+)/i)||[])[1])||'';};
/* сетка с учётом объединённых ячеек: M[строка][столбец] = {ri, ci, c0} */
function tableMap(T){
  const M=[];
  T.rows.forEach((r,ri)=>{M[ri]=M[ri]||[];let c=0;
    r.cells.forEach((cell,ci)=>{while(M[ri][c])c++;const cs=spanOf(cell,'colspan'),rs=spanOf(cell,'rowspan');
      for(let dr=0;dr<rs;dr++)for(let dc=0;dc<cs;dc++){(M[ri+dr]=M[ri+dr]||[])[c+dc]={ri,ci,c0:c,r0:ri};}c+=cs;});});
  return M;
}
const tableCols=T=>Math.max(1,...tableMap(T).slice(0,T.rows.length).map(r=>r.length));

let TE=null;
/* открыть редактор: src — разметка таблицы (или пусто для новой), onSave(markup|'') */
function openTableEditor(src,onSave,opts={}){
  closeTableEditor();
  const T=tableParse(src||'');
  TE={T,onSave,cur:{ri:Math.min(1,T.rows.length-1),ci:0},hist:[],dirty:false,isNew:!src,target:'cell',mode:'grid'};
  const ov=document.createElement('div');ov.className='te-ovl';ov.innerHTML=`<div class="te-dlg" role="dialog" aria-modal="true" aria-labelledby="te-h">
    <div class="te-head"><h2 id="te-h">${src?'Редактор таблицы':'Новая таблица'}</h2><button class="ic x" data-te="cancel" aria-label="Закрыть" title="Закрыть (Esc)">✕</button></div>
    <div class="te-bar" id="te-bar"></div>
    <label class="te-cap"><span>Подпись над таблицей</span><input id="te-cap" value="${esc(T.cap)}" placeholder="необязательно"></label>
    <div class="te-body" id="te-body"></div>
    <div class="te-foot"><button class="btn pri" data-te="save">Сохранить</button><button class="btn" data-te="cancel">Отмена</button><button class="btn" data-te="mode" id="te-modebtn">Разметка</button>${src&&!opts.noDelete?'<button class="btn danger" data-te="del">Удалить таблицу</button>':''}<span class="cnt">Tab — следующая ячейка, Enter — новая строка в ячейке, Ctrl+Enter — сохранить, Esc — закрыть. Выделите текст в ячейке — появится меню.</span></div></div>`;
  document.body.appendChild(ov);TE.ov=ov;document.body.classList.add('te-open');
  teBar();teRender();
  return true;
}
function closeTableEditor(){if(!TE)return;TE.ov.remove();document.body.classList.remove('te-open');TE=null;if(typeof selbarHide==='function')selbarHide();}
const TE_COLORS=[['#d1edf2','голубой'],['#cedff2','синий'],['#d4f4d4','зелёный'],['#fff3b0','жёлтый'],['#ffe4c4','оранжевый'],['#ffd6d6','красный'],['#eaecf0','серый'],['','без цвета']];
function teBar(){
  const b=(k,l,t)=>`<button type="button" class="te-b" data-te="${k}" title="${t}" aria-label="${t}">${l}</button>`;
  $('#te-bar').innerHTML=`<div class="te-grp">${b('undo','↶','Отменить последнее действие со строками, столбцами и ячейками')}</div><div class="te-grp"><span class="te-l">Строка</span>${b('row-above','＋ выше','Добавить строку выше')}${b('row-below','＋ ниже','Добавить строку ниже')}${b('row-del','✕','Удалить строку')}${b('row-head','Заголовки','Сделать всю строку заголовками (или обычной)')}</div>
  <div class="te-grp"><span class="te-l">Столбец</span>${b('col-left','＋ слева','Добавить столбец слева')}${b('col-right','＋ справа','Добавить столбец справа')}${b('col-del','✕','Удалить столбец')}</div>
  <div class="te-grp"><span class="te-l">Ячейка</span>${b('cell-head','Заголовок','Заголовок (жирный, серый фон) или обычная ячейка')}${b('al-left','⇤','По левому краю')}${b('al-center','≡','По центру')}${b('al-right','⇥','По правому краю')}${b('merge-r','Объединить →','Объединить с ячейкой справа')}${b('merge-d','Объединить ↓','Объединить с ячейкой снизу')}${b('split','Разделить','Разделить объединённую ячейку')}</div>
  <div class="te-grp"><span class="te-l">Цвет</span><span class="te-seg"><button type="button" class="te-b${TE.target==='cell'?' on':''}" data-te="tg-cell">ячейки</button><button type="button" class="te-b${TE.target==='row'?' on':''}" data-te="tg-row">строки</button></span>${TE_COLORS.map(([c,n])=>`<button type="button" class="te-sw" data-te="col:${c}" title="${n}" aria-label="Цвет: ${n}" style="${c?`background:${c}`:''}">${c?'':'✕'}</button>`).join('')}</div>`;
}
function teRender(){
  const body=$('#te-body');if(!body||!TE)return;const T=TE.T;
  if(TE.mode==='code'){body.innerHTML=`<textarea id="te-code" class="mono" spellcheck="false" aria-label="Разметка таблицы">${esc(tableWiki(T))}</textarea>`;$('#te-bar').classList.add('off');$('#te-modebtn').textContent='Таблица';return;}
  $('#te-bar').classList.remove('off');$('#te-modebtn').textContent='Разметка';
  const cur=TE.cur;
  body.innerHTML=`<table class="wikitable te-grid"${T.attrs.includes('sortable')?'':''}><tbody>${T.rows.map((r,ri)=>`<tr${r.attrs&&styleOf(r.attrs,'background')?` style="background:${esc(styleOf(r.attrs,'background'))}"`:''}>${r.cells.map((c,ci)=>{const tag=c.h?'th':'td';const cs=spanOf(c,'colspan'),rs=spanOf(c,'rowspan');const bg=styleOf(c.attrs,'background'),al=styleOf(c.attrs,'text-align');
    return `<${tag}${cs>1?` colspan="${cs}"`:''}${rs>1?` rowspan="${rs}"`:''} class="te-td${ri===cur.ri&&ci===cur.ci?' cur':''}"${bg||al?` style="${bg?'background:'+esc(bg)+';':''}${al?'text-align:'+esc(al):''}"`:''}><div class="te-cell" contenteditable="true" spellcheck="true" data-ri="${ri}" data-ci="${ci}" aria-label="Строка ${ri+1}, ячейка ${ci+1}">${richHTML(c.c)}</div></${tag}>`;}).join('')}</tr>`).join('')}</tbody></table>`;
}
/* перенести текст из ячеек на экране в модель */
function teSync(){
  if(!TE)return;const T=TE.T;
  if(TE.mode==='code'){const ta=$('#te-code');if(ta){const nt=tableParse(ta.value);TE.T=nt;}return;}
  for(const el of $$('#te-body .te-cell')){const c=T.rows[+el.dataset.ri]?.cells[+el.dataset.ci];if(c)c.c=richWiki(el).replace(/\n+$/,'').replace(/ /g,' ').trim();}
  const cap=$('#te-cap');if(cap)T.cap=cap.value.trim();
}
function teFocus(ri,ci,end){
  const el=$(`#te-body .te-cell[data-ri="${ri}"][data-ci="${ci}"]`);if(!el)return;
  TE.cur={ri,ci};$$('#te-body .te-td.cur').forEach(x=>x.classList.remove('cur'));el.parentElement.classList.add('cur');
  el.focus();const r=document.createRange();r.selectNodeContents(el);if(end!==false)r.collapse(false);const s=getSelection();s.removeAllRanges();s.addRange(r);
}
function teSnap(){TE.hist.push(JSON.stringify(TE.T));if(TE.hist.length>60)TE.hist.shift();TE.dirty=true;}
const newCell=h=>({h:!!h,attrs:'',c:''});
function teAct(k){
  if(!TE)return;
  if(k==='cancel'){if(TE.dirty&&!confirm('Закрыть редактор без сохранения изменений?'))return;closeTableEditor();return;}
  if(k==='save'){teSync();const md=tableWiki(TE.T);const f=TE.onSave;closeTableEditor();f(md);return;}
  if(k==='del'){if(!confirm('Удалить таблицу целиком?'))return;const f=TE.onSave;closeTableEditor();f('');return;}
  if(k==='mode'){teSync();TE.mode=TE.mode==='code'?'grid':'code';teRender();if(TE.mode==='grid')teFocus(TE.cur.ri,TE.cur.ci);else $('#te-code').focus();return;}
  if(k==='tg-cell'||k==='tg-row'){TE.target=k.slice(3);teBar();return;}
  if(TE.mode==='code')return;
  if(k==='undo'){const prev=TE.hist.pop();if(!prev){toast('Отменять нечего');return;}TE.T=JSON.parse(prev);teRender();const R=TE.T.rows[Math.min(TE.cur.ri,TE.T.rows.length-1)];teFocus(Math.min(TE.cur.ri,TE.T.rows.length-1),Math.min(TE.cur.ci,R.cells.length-1));return;}
  teSync();const T=TE.T;let {ri,ci}=TE.cur;if(!T.rows[ri]){ri=0;ci=0;}if(!T.rows[ri].cells[ci])ci=0;
  const M=tableMap(T);const W=tableCols(T);const cell=T.rows[ri].cells[ci];
  const c0=(M[ri].find(x=>x&&x.ri===ri&&x.ci===ci)||{c0:0}).c0;const cs=spanOf(cell,'colspan'),rs=spanOf(cell,'rowspan');
  const idxAt=(r,col)=>{let n=0;const seen=new Set();for(let c=0;c<col;c++){const o=M[r]&&M[r][c];if(o&&o.ri===r&&!seen.has(o.ci)){seen.add(o.ci);n++;}}return n;};
  teSnap();
  const m=k.match(/^col:(.*)$/);
  if(m){const v=m[1];if(TE.target==='row'){T.rows[ri].attrs=setStyle(T.rows[ri].attrs.replace(/\s*bgcolor\s*=\s*("[^"]*"|[^\s"|]+)/i,''),'background',v);}else cell.attrs=setStyle(cell.attrs.replace(/\s*bgcolor\s*=\s*("[^"]*"|[^\s"|]+)/i,''),'background',v);}
  else switch(k){
    case 'row-above':case 'row-below':{
      const at=k==='row-above'?ri:ri+rs;const row={attrs:'',cells:[]};const bumped=new Set();
      for(let c=0;c<W;c++){const o=at<T.rows.length?M[at]&&M[at][c]:null;
        if(o&&o.r0<at){const key=o.ri+':'+o.ci;if(!bumped.has(key)){bumped.add(key);setSpan(T.rows[o.ri].cells[o.ci],'rowspan',spanOf(T.rows[o.ri].cells[o.ci],'rowspan')+1);}c=o.c0+spanOf(T.rows[o.ri].cells[o.ci],'colspan')-1;continue;}
        row.cells.push(newCell(false));}
      T.rows.splice(at,0,row);TE.cur={ri:at,ci:0};break;}
    case 'row-del':{
      if(T.rows.length<2){toast('В таблице должна остаться хотя бы одна строка',true);TE.hist.pop();return;}
      const done=new Set();
      for(let c=0;c<(M[ri]||[]).length;c++){const o=M[ri][c];if(!o)continue;const key=o.ri+':'+o.ci;if(done.has(key))continue;done.add(key);const oc=T.rows[o.ri].cells[o.ci];const ors=spanOf(oc,'rowspan');
        if(o.ri<ri)setSpan(oc,'rowspan',ors-1);
        else if(ors>1&&T.rows[ri+1]){setSpan(oc,'rowspan',ors-1);const at=idxAt(ri+1,o.c0);T.rows[ri+1].cells.splice(at,0,oc);oc._moved=true;}}
      T.rows.splice(ri,1);
      for(const r of T.rows)for(const c of r.cells)delete c._moved;
      TE.cur={ri:Math.min(ri,T.rows.length-1),ci:0};break;}
    case 'row-head':{const all=T.rows[ri].cells.every(c=>c.h);T.rows[ri].cells.forEach(c=>c.h=!all);break;}
    case 'col-left':case 'col-right':{
      const at=k==='col-left'?c0:c0+cs;const bumped=new Set();
      for(let r=0;r<T.rows.length;r++){const o=M[r]&&M[r][at];
        if(o&&o.c0<at&&at<W){const key=o.ri+':'+o.ci;if(!bumped.has(key)){bumped.add(key);setSpan(T.rows[o.ri].cells[o.ci],'colspan',spanOf(T.rows[o.ri].cells[o.ci],'colspan')+1);}continue;}
        const hdr=T.rows[r].cells.length&&T.rows[r].cells.every(c=>c.h);T.rows[r].cells.splice(idxAt(r,at),0,newCell(hdr));}
      TE.cur={ri,ci:k==='col-left'?ci:ci+1};break;}
    case 'col-del':{
      if(W<2){toast('В таблице должен остаться хотя бы один столбец',true);TE.hist.pop();return;}
      const done=new Set();const rm=[];
      for(let r=0;r<T.rows.length;r++){const o=M[r]&&M[r][c0];if(!o)continue;const key=o.ri+':'+o.ci;if(done.has(key))continue;done.add(key);const oc=T.rows[o.ri].cells[o.ci];const ocs=spanOf(oc,'colspan');
        if(ocs>1)setSpan(oc,'colspan',ocs-1);else rm.push([o.ri,oc]);}
      for(const [r,oc] of rm){const i=T.rows[r].cells.indexOf(oc);if(i>=0)T.rows[r].cells.splice(i,1);}
      T.rows=T.rows.filter(r=>r.cells.length||T.rows.length===1);
      TE.cur={ri:Math.min(ri,T.rows.length-1),ci:Math.max(0,Math.min(ci,T.rows[Math.min(ri,T.rows.length-1)].cells.length-1))};break;}
    case 'cell-head':cell.h=!cell.h;break;
    case 'al-left':case 'al-center':case 'al-right':{const v=k.slice(3);cell.attrs=setStyle(cell.attrs,'text-align',styleOf(cell.attrs,'text-align')===v?'':v);break;}
    case 'merge-r':{const o=M[ri][c0+cs];const nc=o&&T.rows[o.ri].cells[o.ci];
      if(!nc||o.ri!==ri||o.c0!==c0+cs||spanOf(nc,'rowspan')!==rs){toast('Справа нет ячейки той же высоты',true);TE.hist.pop();return;}
      cell.c=[cell.c,nc.c].filter(Boolean).join(' ');setSpan(cell,'colspan',cs+spanOf(nc,'colspan'));T.rows[ri].cells.splice(o.ci,1);break;}
    case 'merge-d':{const o=M[ri+rs]&&M[ri+rs][c0];const nc=o&&T.rows[o.ri].cells[o.ci];
      if(!nc||o.c0!==c0||o.r0!==ri+rs||spanOf(nc,'colspan')!==cs){toast('Снизу нет ячейки той же ширины',true);TE.hist.pop();return;}
      cell.c=[cell.c,nc.c].filter(Boolean).join('<br>');setSpan(cell,'rowspan',rs+spanOf(nc,'rowspan'));T.rows[o.ri].cells.splice(o.ci,1);break;}
    case 'split':{
      if(cs<2&&rs<2){toast('Эта ячейка не объединена',true);TE.hist.pop();return;}
      setSpan(cell,'colspan',1);setSpan(cell,'rowspan',1);
      for(let dr=0;dr<rs;dr++){const r=ri+dr;if(!T.rows[r])continue;
        for(let dc=0;dc<cs;dc++){if(!dr&&!dc)continue;const MM=tableMap(T);let n=0;const seen=new Set();for(let c=0;c<c0+dc;c++){const x=MM[r]&&MM[r][c];if(x&&x.ri===r&&!seen.has(x.ci)){seen.add(x.ci);n++;}}T.rows[r].cells.splice(n,0,newCell(cell.h));}}
      break;}
  }
  teRender();const R=TE.T.rows[TE.cur.ri]||TE.T.rows[0];teFocus(TE.cur.ri in TE.T.rows?TE.cur.ri:0,Math.min(TE.cur.ci,R.cells.length-1));
}
document.addEventListener('click',e=>{
  if(!TE)return;const b=e.target.closest('[data-te]');
  if(b){e.preventDefault();teAct(b.dataset.te);return;}
  const td=e.target.closest('#te-body .te-td');if(td&&!e.target.closest('.te-cell')){const c=td.querySelector('.te-cell');teFocus(+c.dataset.ri,+c.dataset.ci);}
});
document.addEventListener('mousedown',e=>{if(TE&&e.target.closest('.te-bar button,.te-foot button'))e.preventDefault();});
document.addEventListener('focusin',e=>{if(!TE)return;const c=e.target.closest&&e.target.closest('#te-body .te-cell');if(c){TE.cur={ri:+c.dataset.ri,ci:+c.dataset.ci};$$('#te-body .te-td.cur').forEach(x=>x.classList.remove('cur'));c.parentElement.classList.add('cur');}});
document.addEventListener('input',e=>{if(TE&&e.target.closest&&e.target.closest('#te-body,#te-cap'))TE.dirty=true;});
document.addEventListener('keydown',e=>{
  if(!TE)return;
  if(e.key==='Escape'&&!(typeof SB!=='undefined'&&SB&&!SB.hidden&&sbMode)){e.preventDefault();teAct('cancel');return;}
  if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();teAct('save');return;}
  const c=e.target.closest&&e.target.closest('#te-body .te-cell');if(!c)return;
  if(e.key==='Enter'){e.preventDefault();document.execCommand('insertLineBreak');return;}
  if(e.key==='Tab'){
    e.preventDefault();teSync();const T=TE.T;let ri=+c.dataset.ri,ci=+c.dataset.ci;
    if(e.shiftKey){if(ci>0)ci--;else if(ri>0){ri--;ci=T.rows[ri].cells.length-1;}}
    else if(ci<T.rows[ri].cells.length-1)ci++;
    else if(ri<T.rows.length-1){ri++;ci=0;}
    else{TE.cur={ri,ci};teAct('row-below');return;}
    teFocus(ri,ci,false);return;
  }
});
document.addEventListener('paste',e=>{if(!TE||!e.target.closest||!e.target.closest('#te-body .te-cell'))return;e.preventDefault();document.execCommand('insertText',false,(e.clipboardData||window.clipboardData).getData('text/plain'));});
