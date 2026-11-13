'use strict';
/* Рендер карт: любая карта проекта (медиатека, шаблоны или открытая в редакторе) → PNG без моря.
   Море, озёра и всё вне суши прозрачные. Маршрут #/render, #/render/<имя карты>, #/render/@tpl<N> */

const RX={cur:null,job:0,
  o:{width:2000,coast:true,lakes:true,frames:false,crop:false,bg:'check'}};
try{Object.assign(RX.o,JSON.parse(localStorage.getItem('apokrif-rx')||'{}'));}catch(e){}
function rxSave(){try{localStorage.setItem('apokrif-rx',JSON.stringify(RX.o));}catch(e){}}

/* все карты, которые можно отрисовать */
function rxItems(){
  const out=[];
  for(const m of P.media)if(m.map)out.push({key:m.name,name:m.name,map:m.map,src:m.src});
  (P.mapTpl||[]).forEach((t,i)=>out.push({key:'@tpl'+i,name:t.name,map:t.map,src:t.src,tpl:true}));
  return out;
}
const rxHref=it=>'#/render/'+(it.key[0]==='@'?it.key:slug(it.key));

/* ---------- склейка слоёв на холсте ---------- */
function rxImg(svg,w,h){
  const s=svg.replace(/^<svg([^>]*?) width="[^"]*" height="[^"]*"/,`<svg$1 width="${w}" height="${h}"`);
  const url=URL.createObjectURL(new Blob([s],{type:'image/svg+xml'}));
  const img=new Image();img.src=url;
  return img.decode().then(()=>img,()=>{throw new Error('браузер не смог нарисовать карту');}).finally(()=>setTimeout(()=>URL.revokeObjectURL(url),0));
}
function rxCanvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
/* сузить маску на r пикселей: белая обводка государств у берега уходит вместе с морем.
   За краем кадра считаем сушу, чтобы обрезанные рамкой страны не получали прозрачную кайму */
function rxErode(c,r){
  const w=c.width,h=c.height,ctx=c.getContext('2d');const im=ctx.getImageData(0,0,w,h),d=im.data;
  const a=new Uint8Array(w*h),b=new Uint8Array(w*h);for(let i=0;i<w*h;i++)a[i]=d[i*4+3];
  for(let y=0;y<h;y++){const o=y*w;for(let x=0;x<w;x++){let m=a[o+x];for(let k=1;k<=r&&m;k++){if(x-k>=0&&a[o+x-k]<m)m=a[o+x-k];if(x+k<w&&a[o+x+k]<m)m=a[o+x+k];}b[o+x]=m;}}
  for(let y=0;y<h;y++){const o=y*w;for(let x=0;x<w;x++){let m=b[o+x];for(let k=1;k<=r&&m;k++){if(y-k>=0&&b[o+x-k*w]<m)m=b[o+x-k*w];if(y+k<h&&b[o+x+k*w]<m)m=b[o+x+k*w];}d[(o+x)*4+3]=m;}}
  ctx.putImageData(im,0,0);
}
function rxCrop(c){
  const w=c.width,h=c.height,d=c.getContext('2d').getImageData(0,0,w,h).data;
  let x0=w,y0=h,x1=-1,y1=-1;
  for(let y=0;y<h;y++){const o=y*w*4;for(let x=0;x<w;x++)if(d[o+x*4+3]){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;y1=y;}}
  if(x1<0)return c;
  const out=rxCanvas(x1-x0+1,y1-y0+1);out.getContext('2d').drawImage(c,-x0,-y0);return out;
}
async function rxRender(spec,width,o){
  const sp=normSpec(JSON.parse(JSON.stringify(spec)));
  const geo=await loadFor(sp);
  const L=MapDraw.exportLayers(sp,geo,{lakes:o.lakes,frames:o.frames});
  const sc=width/L.W,w=Math.round(width),h=Math.max(1,Math.round(L.H*sc));
  if(w*h>120e6)throw new Error(`слишком большая картинка (${w}×${h}), уменьшите ширину`);
  const c=rxCanvas(w,h),ctx=c.getContext('2d');
  ctx.drawImage(await rxImg(L.land,w,h),0,0,w,h);
  // маска суши: силуэт три раза поверх себя — швы между соседними странами закрываются
  const m=rxCanvas(w,h),mc=m.getContext('2d');const sil=await rxImg(L.mask,w,h);
  for(let i=0;i<3;i++)mc.drawImage(sil,0,0,w,h);
  const r=o.coast?Math.min(8,Math.round(L.bw/2*sc)):0;if(r>0)rxErode(m,r);
  if(L.lakes){mc.globalCompositeOperation='destination-out';mc.drawImage(await rxImg(L.lakes,w,h),0,0,w,h);}
  ctx.globalCompositeOperation='destination-in';ctx.drawImage(m,0,0);
  ctx.globalCompositeOperation='source-over';
  if(L.overlay)ctx.drawImage(await rxImg(L.overlay,w,h),0,0,w,h);
  return {canvas:o.crop?rxCrop(c):c,W:L.W,H:L.H};
}
function rxFileName(name){return (String(name||'карта').replace(/[\\/:*?"<>|]+/g,' ').trim()||'карта')+'.png';}
async function rxDownload(spec,name,o){
  toast('Рисую PNG…');
  try{const {canvas}=await rxRender(spec,o.width,o);
    const blob=await new Promise(res=>canvas.toBlob(res,'image/png'));if(!blob)throw new Error('не удалось сохранить PNG');
    download(rxFileName(name),blob);toast(`Готово: ${canvas.width}×${canvas.height} px`);
  }catch(e){toast('Не получилось: '+e.message,true);}
}

/* ---------- страница ---------- */
function viewRender(arg){
  $('#main').classList.remove('is-main');
  const items=rxItems();
  const it=arg?items.find(x=>x.key===arg):items.find(x=>!x.tpl)||items[0];
  const list=items.length?`<div class="rx-list">${['','tpl'].map(k=>{const xs=items.filter(x=>!!x.tpl===!!k);if(!xs.length)return '';
    return `<div class="side-h2">${k?'Шаблоны карт':'Карты'}</div>${xs.map(x=>`<a class="rx-item${x===it?' sel':''}" href="${rxHref(x)}"><span class="rx-th">${x.src?`<img src="${x.src}" alt="">`:''}</span><span>${esc(x.name)}</span></a>`).join('')}`;}).join('')}</div>`:'';
  if(!it){setView(mainMenuHTML(),shell({title:'Рендер карт',content:`<p>В проекте пока нет карт. Нарисуйте карту — и здесь её можно будет скачать картинкой PNG без моря.</p><p><a class="btn pri" href="#/map/">Нарисовать карту</a></p>`}),'Рендер карт');return;}
  RX.cur=it;
  const o=RX.o,sp=it.map;const hasFrames=!!(sp.inset||sp.zoomBox);
  const ck=(k,t,dis)=>`<label class="inl"><input type="checkbox" data-rx="${k}"${o[k]?' checked':''}${dis?' disabled':''}> ${t}</label>`;
  const content=`<p>Карта целиком, но без моря: океан, озёра и всё за пределами суши прозрачные. Такую картинку можно положить на любой фон.</p>
  <div class="rx">${list}<div class="rx-main">
    <div class="rx-set">
      <div class="line"><b>${esc(it.name)}</b>${it.key[0]==='@'?'':` <a class="btn sm" href="#/map/${slug(it.key)}">Изменить карту</a>`}</div>
      <div class="line"><label class="inl">Ширина, px <input type="number" id="rx-w" min="200" max="12000" step="100" value="${o.width}"></label>${[1000,2000,4000,8000].map(n=>`<button class="btn sm${+o.width===n?' on':''}" data-act="rx-w" data-w="${n}">${n}</button>`).join('')}<span class="cnt" id="rx-size"></span></div>
      <div class="line">${ck('coast','убрать белую кромку у берега')}${ck('lakes','озёра прозрачные')}${hasFrames?ck('frames','мини-карта и выноска (со своим фоном)'):''}${ck('crop','обрезать пустые края')}</div>
      <div class="line"><span class="cnt">Фон предпросмотра:</span>${[['check','шахматка'],['white','белый'],['black','чёрный'],['blue','синий']].map(([v,l])=>`<button class="btn sm${o.bg===v?' on':''}" data-act="rx-bg" data-v="${v}">${l}</button>`).join('')}</div>
      <div class="line"><button class="btn pri" data-act="rx-dl">Скачать PNG</button></div>
    </div>
    <div class="rx-view rx-bg-${o.bg}" id="rx-view"><p class="cnt">Рисую карту…</p></div>
  </div></div>`;
  setView(mainMenuHTML(),shell({title:'Рендер карт',content}),'Рендер карт');
  rxPreview();
}
async function rxPreview(){
  const it=RX.cur;const el=$('#rx-view');if(!it||!el)return;
  const job=++RX.job;
  try{
    const vw=Math.min(1400,Math.max(400,el.clientWidth||900))*(window.devicePixelRatio>1?1.5:1);
    const {canvas,W,H}=await rxRender(it.map,Math.round(vw),RX.o);
    if(job!==RX.job||!el.isConnected)return;
    el.innerHTML='';canvas.className='rx-cv';el.append(canvas);
    const w=+RX.o.width,h=Math.round(H*w/W);const sz=$('#rx-size');
    if(sz)sz.textContent=`→ ${w} × ${h} px${RX.o.crop?' до обрезки':''}`;
  }catch(e){if(job===RX.job&&el.isConnected)el.innerHTML=`<p class="missing">Не удалось нарисовать: ${esc(e.message)}</p>`;}
}
let rxT=0;function rxSoon(){clearTimeout(rxT);rxT=setTimeout(rxPreview,150);}

document.addEventListener('click',e=>{
  const b=e.target.closest('[data-act]');if(!b)return;
  switch(b.dataset.act){
    case 'rx-w':RX.o.width=+b.dataset.w;rxSave();$('#rx-w').value=RX.o.width;document.querySelectorAll('[data-act="rx-w"]').forEach(x=>x.classList.toggle('on',x===b));rxSoon();break;
    case 'rx-bg':RX.o.bg=b.dataset.v;rxSave();{const v=$('#rx-view');if(v)v.className='rx-view rx-bg-'+RX.o.bg;}document.querySelectorAll('[data-act="rx-bg"]').forEach(x=>x.classList.toggle('on',x===b));break;
    case 'rx-dl':if(RX.cur)rxDownload(RX.cur.map,RX.cur.name,RX.o);break;
    case 'me-png':{const s=typeof S==='function'&&S();if(s)rxDownload(s,(typeof ME!=='undefined'&&ME.name)||'Карта',RX.o);break;}
  }
});
document.addEventListener('change',e=>{
  const t=e.target;
  if(t.dataset&&t.dataset.rx){RX.o[t.dataset.rx]=t.checked;rxSave();rxSoon();}
  else if(t.id==='rx-w'){const v=Math.max(200,Math.min(12000,Math.round(+t.value)||2000));t.value=v;RX.o.width=v;rxSave();document.querySelectorAll('[data-act="rx-w"]').forEach(x=>x.classList.toggle('on',+x.dataset.w===v));rxSoon();}
});
