'use strict';
/* Свой мир из картинки: картинка карты превращается в основу для редактора карт —
   суша и море, государства (по цветам заливки или острова по береговой линии), провинции и регионы.
   Результат устроен как данные карт Земли: топология стран и топологии провинций каждой страны.
   Два способа разбора:
   — «по контуру» для рисованных карт (Inkarnate, Wonderdraft): суша — всё, что внутри тёмной береговой линии;
   — «по цветам» для политических карт с ровной заливкой: каждый цвет — государство. */
(function(root){
const WorldImg={};

/* ---------- мелочи ---------- */
function rng(seed){let s=seed>>>0||1;return ()=>{s^=s<<13;s>>>=0;s^=s>>>17;s^=s<<5;s>>>=0;return s/4294967296;};}
function lumOf(d,n){const L=new Uint8Array(n);for(let i=0;i<n;i++){const a=d[i*4+3]/255;L[i]=Math.round((.299*d[i*4]+.587*d[i*4+1]+.114*d[i*4+2])*a+255*(1-a));}return L;}
/* связные области (4 соседа) пикселей с одинаковым ключом; key<0 — не входит ни в одну область */
function components(key,W,H){
  const n=W*H,comp=new Int32Array(n).fill(-1),stack=new Int32Array(n);const area=[],border=[],keyOf=[];let nc=0;
  for(let s=0;s<n;s++){
    if(comp[s]!==-1||key[s]<0)continue;const k=key[s];let sp=0,a=0,b=false;stack[sp++]=s;comp[s]=nc;
    while(sp){const i=stack[--sp];a++;const x=i%W,y=(i-x)/W;if(x===0||y===0||x===W-1||y===H-1)b=true;
      if(x>0&&comp[i-1]===-1&&key[i-1]===k){comp[i-1]=nc;stack[sp++]=i-1;}
      if(x<W-1&&comp[i+1]===-1&&key[i+1]===k){comp[i+1]=nc;stack[sp++]=i+1;}
      if(y>0&&comp[i-W]===-1&&key[i-W]===k){comp[i-W]=nc;stack[sp++]=i-W;}
      if(y<H-1&&comp[i+W]===-1&&key[i+W]===k){comp[i+W]=nc;stack[sp++]=i+W;}}
    area.push(a);border.push(b);keyOf.push(k);nc++;
  }
  return {comp,n:nc,area,border,keyOf};
}
/* расстояние в шагах (4 соседа) от пикселей-источников; дальше max не идём */
function bfsDist(src,W,H,max,pass){
  const n=W*H,dist=new Uint16Array(n).fill(65535);let q=new Int32Array(n),qh=0,qt=0;
  for(let i=0;i<n;i++)if(src(i)){dist[i]=0;q[qt++]=i;}
  while(qh<qt){const i=q[qh++];const d=dist[i]+1;if(d>max)continue;const x=i%W;
    const nb=[x>0?i-1:-1,x<W-1?i+1:-1,i-W,i+W];
    for(const j of nb){if(j<0||j>=n||dist[j]<=d)continue;if(pass&&!pass(j))continue;dist[j]=d;q[qt++]=j;}}
  return dist;
}
/* заливка дыр: пиксели с lab<0 получают метку ближайшего соседа с меткой (только где allow) */
function fillFromNeighbors(lab,W,H,allow){
  const n=W*H;let q=new Int32Array(n),qt=0;
  for(let i=0;i<n;i++)if(lab[i]>=0){const x=i%W;if((x>0&&lab[i-1]<0)||(x<W-1&&lab[i+1]<0)||(i>=W&&lab[i-W]<0)||(i<n-W&&lab[i+W]<0))q[qt++]=i;}
  let qh=0;
  while(qh<qt){const i=q[qh++];const x=i%W;const nb=[x>0?i-1:-1,x<W-1?i+1:-1,i-W,i+W];
    for(const j of nb){if(j<0||j>=n||lab[j]>=0)continue;if(allow&&!allow(j))continue;lab[j]=lab[i];q[qt++]=j;}}
}

/* ---------- 1. разбор картинки ---------- */
/* Какой способ подходит: у политической карты соседние пиксели почти всегда одного цвета */
WorldImg.guessMode=function(d,W,H){
  let same=0,tot=0;
  for(let y=0;y<H;y+=3)for(let x=0;x<W-1;x+=3){const i=(y*W+x)*4,j=i+4;tot++;
    if(Math.abs(d[i]-d[j])+Math.abs(d[i+1]-d[j+1])+Math.abs(d[i+2]-d[j+2])<=6)same++;}
  return same/tot>.6?'color':'outline';
};
/* Разбор: области (comp) и их класс (0 — вода, 1 — суша; для цветов — номер цвета) */
WorldImg.segment=function(d,W,H,opt={}){
  const n=W*H;const mode=opt.mode&&opt.mode!=='auto'?opt.mode:WorldImg.guessMode(d,W,H);
  const L=lumOf(d,n);
  if(mode==='outline'){
    const thr=+opt.thr||70,close=Math.max(0,Math.min(3,opt.close==null?1:+opt.close));
    // береговая линия — тёмные пиксели; немного утолщаем, чтобы заделать разрывы
    const dark=new Uint8Array(n);for(let i=0;i<n;i++)dark[i]=L[i]<thr?1:0;
    let bar=dark;
    if(close>0){bar=new Uint8Array(n);const dist=bfsDist(i=>dark[i]===1,W,H,close);for(let i=0;i<n;i++)bar[i]=dist[i]<=close?1:0;}
    const key=new Int32Array(n);for(let i=0;i<n;i++)key[i]=bar[i]?-1:0;
    const C=components(key,W,H);
    // море — области у края картинки; если карта в рамке — ещё и самая большая область
    const cls=new Uint8Array(C.n).fill(1);let big=-1,bordA=0;
    for(let c=0;c<C.n;c++){if(C.border[c]){cls[c]=0;bordA+=C.area[c];}if(big<0||C.area[c]>C.area[big])big=c;}
    if(big>=0&&!C.border[big]&&bordA<n*.05)cls[big]=0;
    // озёра: светлые замкнутые области вдали от моря
    const sumL=new Float64Array(C.n);for(let i=0;i<n;i++){const c=C.comp[i];if(c>=0)sumL[c]+=L[i];}
    let seaL=0,seaA=0;for(let c=0;c<C.n;c++)if(cls[c]===0){seaL+=sumL[c];seaA+=C.area[c];}seaL=seaA?seaL/seaA:255;
    let landL=0,landA=0;for(let c=0;c<C.n;c++)if(cls[c]===1){landL+=sumL[c];landA+=C.area[c];}landL=landA?landL/landA:200;
    const near=bfsDist(i=>C.comp[i]>=0&&cls[C.comp[i]]===0,W,H,10+close);
    const minNear=new Uint16Array(C.n).fill(65535);for(let i=0;i<n;i++){const c=C.comp[i];if(c>=0&&near[i]<minNear[c])minNear[c]=near[i];}
    for(let c=0;c<C.n;c++){if(cls[c]!==1||C.area[c]<25)continue;const m=sumL[c]/C.area[c];
      if(minNear[c]>8+close&&m>=seaL-6&&m>landL+(seaL-landL)*.5)cls[c]=0;}
    return {mode,W,H,comp:C.comp,n:C.n,area:C.area,cls,close,lumSea:seaL};
  }
  // по цветам: палитра из частых цветов
  const hist=new Map();
  for(let i=0;i<n;i++){const q=((d[i*4]>>3)<<10)|((d[i*4+1]>>3)<<5)|(d[i*4+2]>>3);hist.set(q,(hist.get(q)||0)+1);}
  const minCnt=Math.max(12,n*.0004);let pal=[];
  for(const [q,c] of [...hist].sort((a,b)=>b[1]-a[1])){if(c<minCnt||pal.length>=96)break;
    const rgb=[((q>>10)&31)*8+4,((q>>5)&31)*8+4,(q&31)*8+4];
    if(pal.some(p=>Math.abs(p[0]-rgb[0])+Math.abs(p[1]-rgb[1])+Math.abs(p[2]-rgb[2])<(+opt.tol||24)))continue;pal.push(rgb);}
  const key=new Int32Array(n);const maxD=(+opt.tol||24)*1.6;
  for(let i=0;i<n;i++){let best=-1,bd=1e9;for(let k=0;k<pal.length;k++){const p=pal[k];const dd=Math.abs(d[i*4]-p[0])+Math.abs(d[i*4+1]-p[1])+Math.abs(d[i*4+2]-p[2]);if(dd<bd){bd=dd;best=k;}}key[i]=bd<=maxD?best:-1;}
  // цвета, которые встречаются только тонкими линиями (границы, надписи), — не государства
  {const tot=new Int32Array(pal.length),inn=new Int32Array(pal.length);
    for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){const i=y*W+x,k=key[i];if(k<0)continue;tot[k]++;if(key[i-1]===k&&key[i+1]===k&&key[i-W]===k&&key[i+W]===k)inn[k]++;}
    const thin=pal.map((p,k)=>tot[k]>0&&inn[k]/tot[k]<.45);for(let i=0;i<n;i++)if(key[i]>=0&&thin[key[i]])key[i]=-1;}
  let C=components(key,W,H);
  // мелочь (буквы надписей, сглаживание краёв) — в «границы», потом раздаём соседям
  const minA=Math.max(6,Math.round(n*.00002));let drop=false;
  for(let i=0;i<n;i++){const c=C.comp[i];if(c>=0&&C.area[c]<minA){key[i]=-1;drop=true;}}
  if(drop)C=components(key,W,H);
  // море — цвет, которого больше всего по краю картинки
  const edge=new Map();const addE=i=>{const k=key[i];if(k>=0)edge.set(k,(edge.get(k)||0)+1);};
  for(let x=0;x<W;x++){addE(x);addE((H-1)*W+x);}for(let y=0;y<H;y++){addE(y*W);addE(y*W+W-1);}
  let seaK=-1,best=-1;for(const [k,c] of edge)if(c>best){best=c;seaK=k;}
  const cls=new Uint8Array(C.n);for(let c=0;c<C.n;c++)cls[c]=C.keyOf[c]===seaK?0:1;
  return {mode,W,H,comp:C.comp,n:C.n,area:C.area,cls,keyOf:C.keyOf,pal,seaK};
};
/* Щелчок по области переключает «вода/суша». Для цветов — весь цвет сразу */
WorldImg.toggleAt=function(seg,x,y){
  const i=y*seg.W+x;let c=seg.comp[i];
  if(c<0){// попали в линию — берём ближайшую область
    for(let r=1;r<8&&c<0;r++)for(let dy=-r;dy<=r&&c<0;dy++)for(let dx=-r;dx<=r&&c<0;dx++){const xx=x+dx,yy=y+dy;if(xx>=0&&yy>=0&&xx<seg.W&&yy<seg.H)c=seg.comp[yy*seg.W+xx];}
    if(c<0)return false;}
  const v=seg.cls[c]?0:1;
  if(seg.mode==='color'){const k=seg.keyOf[c];for(let j=0;j<seg.n;j++)if(seg.keyOf[j]===k)seg.cls[j]=v;}
  else seg.cls[c]=v;
  return true;
};
/* ---------- 2. суша и государства ---------- */
/* own[i]: 0 — вода, 1..N — номер государства; countries — их цвета и площади */
WorldImg.finalize=function(seg,opt={}){
  const {W,H}=seg,n=W*H;const own=new Int32Array(n);
  let land=new Int8Array(n);// 1 суша, 0 вода, -1 ещё не ясно (линия)
  for(let i=0;i<n;i++){const c=seg.comp[i];land[i]=c<0?-1:seg.cls[c];}
  if(seg.mode==='outline'){
    // линия у воды — пополам: ближние к воде пиксели линии — вода, остальные — суша
    const edge=1+Math.ceil(seg.close/2);
    const dist=bfsDist(i=>land[i]===0,W,H,edge,j=>land[j]===-1);
    for(let i=0;i<n;i++)if(land[i]===-1)land[i]=dist[i]<=edge?0:1;
  }else{
    // линии и надписи — ближайшей области
    const lab=new Int32Array(n);for(let i=0;i<n;i++)lab[i]=seg.comp[i];
    fillFromNeighbors(lab,W,H);
    for(let i=0;i<n;i++)land[i]=lab[i]>=0?seg.cls[lab[i]]:0;seg._lab=lab;
  }
  // государства
  const key=new Int32Array(n);
  if(seg.mode==='color'&&opt.byColor!==false){const lab=seg._lab;for(let i=0;i<n;i++)key[i]=land[i]?seg.keyOf[lab[i]]:-1;}
  else for(let i=0;i<n;i++)key[i]=land[i]?0:-1;
  const C=components(key,W,H);
  const minIsle=Math.max(1,+opt.minIsle||12);
  // государство = цвет (если так выбрано) или связный кусок суши
  const groups=new Map();const countries=[];
  for(let c=0;c<C.n;c++){if(C.area[c]<minIsle)continue;
    const g=seg.mode==='color'&&opt.byColor!==false?'k'+C.keyOf[c]:'c'+c;
    if(!groups.has(g)){groups.set(g,countries.length+1);countries.push({area:0,color:seg.mode==='color'?seg.pal[C.keyOf[c]]:null,parts:0});}
    const ci=groups.get(g);countries[ci-1].area+=C.area[c];countries[ci-1].parts++;C.keyOf[c]=-1-ci;}
  for(let i=0;i<n;i++){const c=C.comp[i];own[i]=c>=0&&C.keyOf[c]<-1?-1-C.keyOf[c]:0;}
  // сначала крупные
  const order=countries.map((c,i)=>i).sort((a,b)=>countries[b].area-countries[a].area);const re=new Int32Array(countries.length+1);order.forEach((o,k)=>re[o+1]=k+1);
  for(let i=0;i<n;i++)if(own[i])own[i]=re[own[i]];
  return {W,H,own,countries:order.map(o=>countries[o]),mode:seg.mode};
};

/* ---------- 3. провинции ---------- */
function noise2(seed){
  const h=(x,y)=>{let t=(x*374761393+y*668265263+seed*1442695041)|0;t=Math.imul(t^(t>>>13),1274126177);return ((t^(t>>>16))>>>0)/4294967296;};
  const sm=t=>t*t*(3-2*t);
  return (x,y)=>{const xi=Math.floor(x),yi=Math.floor(y),fx=sm(x-xi),fy=sm(y-yi);
    const a=h(xi,yi),b=h(xi+1,yi),c=h(xi,yi+1),d=h(xi+1,yi+1);return a+(b-a)*fx+(c-a)*fy+(a-b-c+d)*fx*fy;};
}
WorldImg.provinces=function(fin,opt={}){
  const {W,H,own}=fin,n=W*H;const R=rng(opt.seed||7);
  // куски суши одного государства
  const C=components(own.map(v=>v?v:-1),W,H);
  let landA=0;for(let i=0;i<n;i++)if(own[i])landA++;
  const N=Math.max(1,+opt.count||120);const s=Math.sqrt(landA/N)*1.12;
  const seeds=[];const partSeeds=Array.from({length:C.n},()=>[]);
  for(let gy=0;gy<H;gy+=s)for(let gx=0;gx<W;gx+=s){
    for(let t=0;t<4;t++){const x=Math.min(W-1,Math.floor(gx+R()*s)),y=Math.min(H-1,Math.floor(gy+R()*s));const i=y*W+x;
      if(own[i]){const p=C.comp[i];partSeeds[p].push(seeds.length);seeds.push({x,y,p});break;}}
  }
  // у каждого куска суши хотя бы одна провинция — в его середине
  const sx=new Float64Array(C.n),sy=new Float64Array(C.n);
  for(let i=0;i<n;i++){const p=C.comp[i];if(p>=0){sx[p]+=i%W;sy[p]+=(i-i%W)/W;}}
  const need=[];for(let p=0;p<C.n;p++)if(!partSeeds[p].length)need.push(p);
  if(need.length){const bd=new Float64Array(C.n).fill(1e18),bi=new Int32Array(C.n).fill(-1);const nd=new Set(need);
    for(let i=0;i<n;i++){const p=C.comp[i];if(p<0||!nd.has(p))continue;const x=i%W,y=(i-x)/W;const dd=(x-sx[p]/C.area[p])**2+(y-sy[p]/C.area[p])**2;if(dd<bd[p]){bd[p]=dd;bi[p]=i;}}
    for(const p of need){const i=bi[p];partSeeds[p].push(seeds.length);seeds.push({x:i%W,y:(i-i%W)/W,p});}}
  // ближайшая точка того же куска; координаты чуть «плывут» — границы получаются извилистыми
  const nz1=noise2(11),nz2=noise2(23);const A=s*.28,f=1/(s*.55);
  const lab=new Int32Array(n).fill(-1);
  for(let i=0;i<n;i++){const p=C.comp[i];if(p<0)continue;const x=i%W,y=(i-x)/W;
    const wx=x+A*(nz1(x*f,y*f)-.5)*2+A*.5*(nz1(x*f*2.3,y*f*2.3)-.5),wy=y+A*(nz2(x*f,y*f)-.5)*2+A*.5*(nz2(x*f*2.3,y*f*2.3)-.5);
    let best=-1,bd=1e18;for(const k of partSeeds[p]){const q=seeds[k];const dd=(q.x-wx)**2+(q.y-wy)**2;if(dd<bd){bd=dd;best=k;}}lab[i]=best;}
  // у провинции один кусок: оторванные клочки отдаём соседям
  const P=components(lab,W,H);const bestPart=new Map();
  for(let c=0;c<P.n;c++){const k=P.keyOf[c];const b=bestPart.get(k);if(b==null||P.area[c]>P.area[b])bestPart.set(k,c);}
  for(let i=0;i<n;i++){const c=P.comp[i];if(c>=0&&bestPart.get(P.keyOf[c])!==c)lab[i]=-1;}
  fillFromNeighbors(lab,W,H,j=>own[j]>0);
  // провинции без пикселей выбрасываем, нумеруем подряд с 1
  const used=new Int32Array(seeds.length).fill(0);for(let i=0;i<n;i++)if(lab[i]>=0)used[lab[i]]=1;
  const idx=new Int32Array(seeds.length);let np=0;for(let k=0;k<seeds.length;k++)if(used[k])idx[k]=++np;
  const prov=new Int32Array(n);const pc=new Int32Array(np+1),cx=new Float64Array(np+1),cy=new Float64Array(np+1),pa=new Int32Array(np+1);
  for(let i=0;i<n;i++){if(lab[i]<0||!own[i])continue;const v=idx[lab[i]];prov[i]=v;pc[v]=own[i];const x=i%W;cx[v]+=x;cy[v]+=(i-x)/W;pa[v]++;}
  for(let v=1;v<=np;v++){cx[v]/=pa[v]||1;cy[v]/=pa[v]||1;}
  // регионы: соседние провинции одного государства, примерно по 6
  const region=new Int32Array(np+1);const per=Math.max(2,+opt.perRegion||6);
  const byC=new Map();for(let v=1;v<=np;v++){if(!byC.has(pc[v]))byC.set(pc[v],[]);byC.get(pc[v]).push(v);}
  for(const [c,list] of byC){const k=Math.max(1,Math.round(list.length/per));
    let cen=[];const step=list.length/k;for(let j=0;j<k;j++){const v=list[Math.floor(j*step)];cen.push([cx[v],cy[v]]);}
    for(let it=0;it<12;it++){const acc=cen.map(()=>[0,0,0]);
      for(const v of list){let b=0,bd=1e18;cen.forEach((q,j)=>{const dd=(q[0]-cx[v])**2+(q[1]-cy[v])**2;if(dd<bd){bd=dd;b=j;}});region[v]=b;acc[b][0]+=cx[v];acc[b][1]+=cy[v];acc[b][2]++;}
      cen=cen.map((q,j)=>acc[j][2]?[acc[j][0]/acc[j][2],acc[j][1]/acc[j][2]]:q);}
  }
  return {prov,np,pc,region,cx,cy,area:pa};
};

/* ---------- 4. контуры ---------- */
/* Обход границ меток по краям пикселей: внешние кольца по часовой стрелке на экране, дыры — против */
WorldImg.trace=function(lab,W,H,nLab){
  const VW=W+1;const es=[],ee=[],el=[];
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=y*W+x,a=lab[i];if(!a)continue;
    if(y===0||lab[i-W]!==a){es.push(y*VW+x);ee.push(y*VW+x+1);el.push(a);}
    if(x===W-1||lab[i+1]!==a){es.push(y*VW+x+1);ee.push((y+1)*VW+x+1);el.push(a);}
    if(y===H-1||lab[i+W]!==a){es.push((y+1)*VW+x+1);ee.push((y+1)*VW+x);el.push(a);}
    if(x===0||lab[i-1]!==a){es.push((y+1)*VW+x);ee.push(y*VW+x);el.push(a);}}
  const E=es.length;const cnt=new Int32Array(nLab+2);for(let e=0;e<E;e++)cnt[el[e]+1]++;for(let k=1;k<cnt.length;k++)cnt[k]+=cnt[k-1];
  const ord=new Int32Array(E);const pos=cnt.slice();for(let e=0;e<E;e++)ord[pos[el[e]]++]=e;
  const used=new Uint8Array(E);const rings=Array.from({length:nLab+1},()=>[]);
  for(let a=1;a<=nLab;a++){
    const out=new Map();for(let k=cnt[a];k<cnt[a+1];k++){const e=ord[k];const v=es[e];const l=out.get(v);if(l)l.push(e);else out.set(v,[e]);}
    for(let k=cnt[a];k<cnt[a+1];k++){const e0=ord[k];if(used[e0])continue;
      const ring=[];let e=e0;
      for(;;){used[e]=1;const v=es[e];ring.push([v%VW,(v-v%VW)/VW]);const w=ee[e];
        const c=(out.get(w)||[]).filter(x=>!used[x]);if(!c.length)break;
        if(c.length===1)e=c[0];else{// два пути из одной точки (касание углами): поворачиваем направо
          const dx=(ee[e]%VW)-(es[e]%VW),dy=Math.floor(ee[e]/VW)-Math.floor(es[e]/VW);const rx=-dy,ry=dx;
          e=c.find(x=>(ee[x]%VW)-(es[x]%VW)===rx&&Math.floor(ee[x]/VW)-Math.floor(es[x]/VW)===ry)??c[0];}}
      if(ring.length>=4){ring.push(ring[0]);rings[a].push(ring);}
    }
  }
  return rings;
};
const sArea=r=>{let s=0;for(let i=0;i<r.length-1;i++)s+=r[i][0]*r[i+1][1]-r[i+1][0]*r[i][1];return s/2;};
function inRing(pt,r){let c=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if((a[1]>pt[1])!==(b[1]>pt[1])&&pt[0]<(b[0]-a[0])*(pt[1]-a[1])/(b[1]-a[1])+a[0])c=!c;}return c;}
/* кольца → MultiPolygon (дыры к своему внешнему кольцу), в градусах */
function polyOf(rings,tf){
  const outer=[],holes=[];for(const r of rings)(sArea(r)>0?outer:holes).push(r);
  const polys=outer.map(r=>[r]);
  for(const h of holes){const pt=[h[0][0]+.5,h[0][1]+.5];let k=polys.findIndex(p=>inRing(pt,p[0]));if(k<0)k=polys.findIndex(p=>inRing(h[0],p[0]));if(k>=0)polys[k].push(h);}
  // по часовой на экране (y вниз) — после переворота широты это и есть внешний обход для d3
  return polys.map(p=>p.map(r=>r.map(tf)));
}
/* сглаживание и упрощение общих дуг топологии — соседи остаются без щелей */
function smoothArcs(t,tol){
  for(let a=0;a<t.arcs.length;a++){let arc=t.arcs[a];const closed=arc.length>3&&arc[0][0]===arc[arc.length-1][0]&&arc[0][1]===arc[arc.length-1][1];
    for(let it=0;it<3;it++){const m=arc.length;if(m<3)break;const nw=arc.map(q=>q.slice());
      if(closed){const k=m-1;for(let i=0;i<k;i++){const p=arc[(i-1+k)%k],q=arc[i],r=arc[(i+1)%k];nw[i]=[(p[0]+2*q[0]+r[0])/4,(p[1]+2*q[1]+r[1])/4];}nw[k]=nw[0].slice();}
      else for(let i=1;i<m-1;i++){nw[i]=[(arc[i-1][0]+2*arc[i][0]+arc[i+1][0])/4,(arc[i-1][1]+2*arc[i][1]+arc[i+1][1])/4];}
      arc=nw;}
    t.arcs[a]=simplify(arc,tol,closed);
  }
}
function dp(pts,tol){
  const keep=new Uint8Array(pts.length);keep[0]=keep[pts.length-1]=1;const st=[[0,pts.length-1]];const t2=tol*tol;
  while(st.length){const [a,b]=st.pop();if(b<=a+1)continue;const [x1,y1]=pts[a],[x2,y2]=pts[b];const dx=x2-x1,dy=y2-y1,L=dx*dx+dy*dy;let bi=-1,bd=t2;
    for(let i=a+1;i<b;i++){const [x,y]=pts[i];let d;if(!L)d=(x-x1)**2+(y-y1)**2;else{let u=((x-x1)*dx+(y-y1)*dy)/L;u=Math.max(0,Math.min(1,u));d=(x-x1-u*dx)**2+(y-y1-u*dy)**2;}if(d>bd){bd=d;bi=i;}}
    if(bi>0){keep[bi]=1;st.push([a,bi],[bi,b]);}}
  return pts.filter((p,i)=>keep[i]);
}
function simplify(arc,tol,closed){
  if(arc.length<=3)return arc;
  if(!closed)return dp(arc,tol);
  // замкнутая дуга: делим самой дальней от начала точкой
  let far=1,fd=-1;for(let i=1;i<arc.length-1;i++){const d=(arc[i][0]-arc[0][0])**2+(arc[i][1]-arc[0][1])**2;if(d>fd){fd=d;far=i;}}
  const a=dp(arc.slice(0,far+1),tol),b=dp(arc.slice(far),tol);const r=a.concat(b.slice(1));
  return r.length>=4?r:arc;
}
const r5=v=>Math.round(v*1e5)/1e5;

/* ---------- 5. мир целиком ---------- */
/* Возвращает объект мира: топология стран (countries/lakes), провинции по странам, названия регионов, рамка в градусах */
WorldImg.build=function(fin,pr,opt={}){
  const {W,H}=fin;
  const span=opt.planet?360:Math.max(5,Math.min(180,+opt.span||40));const k=span/W;
  const tf=([x,y])=>[r5((x-W/2)*k),r5((H/2-y)*k)];
  const rings=WorldImg.trace(pr.prov,W,H,pr.np);
  const names=opt.names||{};const nC=fin.countries.length;
  const cid=c=>'L'+c;
  const feats=[];
  // id провинции как у Земли: «регион.номер»
  const inReg={};
  for(let v=1;v<=pr.np;v++){if(!rings[v].length)continue;const c=pr.pc[v];const r=cid(c)+'-R'+(pr.region[v]+1);inReg[r]=(inReg[r]||0)+1;
    feats.push({type:'Feature',properties:{id:r+'.'+(inReg[r]-1),r,c:cid(c)},geometry:{type:'MultiPolygon',coordinates:polyOf(rings[v],tf)}});}
  const topo=topojson.topology({p:{type:'FeatureCollection',features:feats}});
  smoothArcs(topo,k*(+opt.tol||.8));
  const geoms=topo.objects.p.geometries;
  const provFeats=topojson.feature(topo,topo.objects.p).features;
  // страны: слияние их провинций
  const cf=[];const prov={};const nm={c:{},r:{}};
  for(let c=1;c<=nC;c++){const id=cid(c);const gs=geoms.filter(g=>g.properties.c===id);if(!gs.length)continue;
    const ru=names[id]||(fin.mode==='color'?'Страна '+c:(c===1?(opt.name||'Материк'):'Остров '+(c-1)));
    cf.push({type:'Feature',properties:{id,ru,en:ru},geometry:topojson.merge(topo,gs)});
    const pf=provFeats.filter(f=>f.properties.c===id);
    prov[id]=topojson.quantize(topojson.topology({[id]:{type:'FeatureCollection',features:pf}}),1e5);
    nm.c[id]=1;const regs=[...new Set(pf.map(f=>f.properties.r))].sort((a,b)=>+a.split('-R')[1]-+b.split('-R')[1]);
    regs.forEach((r,j)=>nm.r[r]=[(regs.length>1?'Регион '+(j+1):ru),id]);
  }
  const countries=topojson.quantize(topojson.topology({countries:{type:'FeatureCollection',features:cf},lakes:{type:'FeatureCollection',features:[]}}),1e5);
  const ext=[r5(-W/2*k),r5(-H/2*k),r5(W/2*k),r5(H/2*k)];
  const colors={};fin.countries.forEach((c,i)=>{if(c.color)colors[cid(i+1)]='#'+c.color.map(v=>Math.max(0,Math.min(255,v)).toString(16).padStart(2,'0')).join('');});
  return {countries,prov,names:nm,ext,k,W,H,colors,planet:!!opt.planet};
};

/* Картинка для просмотра: вода, государства и провинции */
WorldImg.preview=function(fin,pr,out){
  const {W,H,own}=fin;const n=W*H;
  const pastel=c=>{const h=(c*137.508)%360;const s=.45,l=.72;const f=(nn)=>{const kk=(nn+h/30)%12;const a=s*Math.min(l,1-l);return Math.round(255*(l-a*Math.max(-1,Math.min(kk-3,9-kk,1))));};return [f(0),f(8),f(4)];};
  const cols=fin.countries.map((c,i)=>c.color||pastel(i+1));
  for(let i=0;i<n;i++){const o=own[i];let r,g,b;
    if(!o){r=200;g=225;b=245;}else{[r,g,b]=cols[o-1];
      if(pr){const x=i%W;const v=pr.prov[i];if((x<W-1&&pr.prov[i+1]!==v)||(i<n-W&&pr.prov[i+W]!==v)){r*=.72;g*=.72;b*=.72;}}}
    out[i*4]=r;out[i*4+1]=g;out[i*4+2]=b;out[i*4+3]=255;}
};

if(typeof module!=='undefined'&&module.exports)module.exports=WorldImg;else root.WorldImg=WorldImg;
})(typeof window!=='undefined'?window:this);
