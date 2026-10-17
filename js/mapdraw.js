'use strict';
/* Рисование карт-локаторов в стиле Викисклада: глобус (ортографическая проекция) и плоские карты мира.
   Основа карты — современные страны или шаблон границ по году. Любое государство можно разбить на провинции,
   провинции можно передавать между государствами (spec.owner), резать и объединять (spec.pedit),
   закрашивать цветами групп (spec.groups). Работает в браузере и в Node. */
(function(root){
function makeMapDraw(d3,topojson){
  const PROJ={
    ortho:{name:'Глобус',make:()=>d3.geoOrthographic().clipAngle(90).precision(.3)},
    robinson:{name:'Мир (Робинсон)',make:()=>d3.geoRobinson()},
    equalearth:{name:'Мир (Equal Earth)',make:()=>d3.geoEqualEarth()},
    eqrect:{name:'Равнопромежуточная',make:()=>d3.geoEquirectangular()},
    mercator:{name:'Меркатор',make:()=>d3.geoMercator()},
    laea:{name:'Регион (равновеликая)',make:()=>d3.geoAzimuthalEqualArea().clipAngle(179.9).precision(.3)},
    conic:{name:'Регион (коническая)',make:()=>d3.geoConicConformal().precision(.3)},
  };
  /* обрезка кадра: ширина к высоте */
  const ASPECTS={'':0,'1:1':1,'6:5':1.2,'4:3':4/3,'3:2':1.5,'16:9':16/9,'3:4':.75};
  const SPHERE={type:'Sphere'};
  const r1=n=>Math.round(n*100)/100;

  function defaults(kind){
    const globe=kind!=='flat';
    return {proj:globe?'ortho':'robinson',lon:globe?60:10,lat:globe?45:0,zoom:1,base:'',
      land:'#c0c0c0',border:'#ffffff',ocean:'#ffffff',bw:globe?.5:.6,grat:globe,shade:globe,lakes:true,
      groups:[{name:globe?'Государство':'Члены союза',color:globe?'#346733':'#1f93c0',countries:[],regions:[],prov:[]}],split:[],owner:{},states:{}};
  }
  /* Карта одной страны (например, для выборов): контур страны — по основе карты и по провинциям, которыми она владеет */
  function onlyFC(geo,spec){
    const u=spec.only;if(!u||!geo||!geo.countries)return null;prepare(geo);
    const T=tplOf(geo,spec);const D=splitData(geo,spec);const feats=[];
    if(D)for(const f of D.feats)if(ownerOf(geo,spec,f)===u)feats.push(f);
    if(!D||!D.splitSet.has(u))feats.push(...(T?T.feats.filter(f=>f.properties.u===u):geo._c.filter(f=>f.properties.id===u)));
    return feats.length?{type:'FeatureCollection',features:feats}:null;
  }
  function projection(spec,geo){
    if(spec.only&&geo){const fc=onlyFC(geo,spec);if(fc){
      const p=PROJ[spec.proj]?PROJ[spec.proj].make():PROJ.ortho.make();const c=d3.geoCentroid(fc);
      if(spec.proj==='conic')p.parallels([c[1]-10,c[1]+10]).rotate([-c[0],0]);
      else if(spec.proj==='ortho'||spec.proj==='laea'||!PROJ[spec.proj])p.rotate([-c[0],-c[1]]);
      else p.rotate([-c[0],0]);
      const a=ASPECTS[spec.aspect]||0;const W=1000,pad=14;
      p.fitWidth(W-2*pad,fc);const b=d3.geoPath(p).bounds(fc);const r=(b[1][1]-b[0][1])/Math.max(1,b[1][0]-b[0][0]);
      const H=a?Math.round(W/a):Math.round(Math.min(1.4,Math.max(.4,r))*(W-2*pad)+2*pad);
      p.fitExtent([[pad,pad],[W-pad,H-pad]],fc);
      return {p,W,H,only:true};
    }}
    const p=PROJ[spec.proj]?PROJ[spec.proj].make():PROJ.ortho.make();
    const zoom=Math.max(1,+spec.zoom||1),lon=+spec.lon||0,lat=+spec.lat||0;const a=ASPECTS[spec.aspect]||0;
    if(spec.proj==='ortho'||!PROJ[spec.proj]){
      const W=500,H=a?Math.round(W/a):500;p.rotate([-lon,-lat]).scale(245*zoom).translate([W/2,H/2]);return {p,W,H};
    }
    if(spec.proj==='laea'||spec.proj==='conic'){
      const W=1000,H=Math.round(W/(a||1.25));
      if(spec.proj==='laea')p.rotate([-lon,-lat]).scale(W/4*zoom);
      else p.parallels([lat-12,lat+12]).rotate([-lon,0]).center([0,lat]).scale(W/6*zoom);
      p.translate([W/2,H/2]).clipExtent([[-2,-2],[W+2,H+2]]);
      return {p,W,H};
    }
    const W=1000;let H;
    p.rotate([-lon,0]);
    if(spec.proj==='mercator'){p.scale(W/(2*Math.PI)).translate([0,0]);H=Math.round(W*.72);}
    else{p.fitWidth(W,SPHERE);const b=d3.geoPath(p).bounds(SPHERE);H=Math.ceil(b[1][1]-b[0][1]);}
    if(a)H=Math.round(W/a);
    p.scale(p.scale()*zoom).translate([0,0]);
    const c=p([lon,zoom>1||a||spec.proj==='mercator'?lat:0])||[0,0];
    p.translate([W/2-c[0],H/2-c[1]]);
    if(a||zoom>1)p.clipExtent([[-2,-2],[W+2,H+2]]);
    return {p,W,H};
  }

  /* ---------- данные ----------
     geo = {countries: topology, prov: {КОД: topology}, tpl: {год: topology с units и own}, names} */
  function buildP(t,obj){
    const P={topo:t,obj,feats:topojson.feature(t,obj).features,byId:{},byRegion:{},regions:[]};
    P.feats.forEach(f=>{const {id,r}=f.properties;P.byId[id]=f;(P.byRegion[r]=P.byRegion[r]||(P.regions.push(r),[])).push(id);});
    return P;
  }
  function prepare(geo){
    if(!geo._c){
      const t=geo.countries;
      geo._c=topojson.feature(t,t.objects.countries).features;
      geo._lakes=t.objects.lakes?topojson.feature(t,t.objects.lakes).features:[];
      geo._cById={};geo._c.forEach(f=>geo._cById[f.properties.id]=f);
      geo._p={};geo._t={};
    }
    for(const cid in geo.prov||{}){if(!geo._p[cid]){const t=geo.prov[cid];geo._p[cid]=buildP(t,t.objects[Object.keys(t.objects)[0]]);}}
    for(const y in geo.tpl||{}){if(!geo._t[y]){const t=geo.tpl[y];const T={topo:t,units:t.units,own:t.own,feats:topojson.feature(t,t.objects.states).features,byU:{}};T.feats.forEach(f=>T.byU[f.properties.u]=f);geo._t[y]=T;}}
    return geo;
  }
  /* Провинции файла-страны с учётом правок границ на этой карте (spec.pedit) */
  function provFor(geo,cid,spec){
    prepare(geo);const base=geo._p[cid];if(!base)return null;
    const e=spec&&spec.pedit&&spec.pedit[cid];
    if(!e||(!(e.del||[]).length&&!(e.add||[]).length))return base;
    const key=(e.v||0)+':'+(e.del||[]).length+':'+(e.add||[]).length;
    geo._pe=geo._pe||{};if(geo._pe[cid]&&geo._pe[cid].key===key)return geo._pe[cid].P;
    const del=new Set(e.del||[]);
    const feats=base.feats.filter(f=>!del.has(f.properties.id)).map(f=>({type:'Feature',properties:f.properties,geometry:f.geometry}));
    for(const a of e.add||[])feats.push({type:'Feature',properties:{id:a.id,r:a.r,c:cid},geometry:{type:'MultiPolygon',coordinates:a.g}});
    const t=topojson.topology({p:{type:'FeatureCollection',features:feats}});
    const P=buildP(t,t.objects.p);geo._pe[cid]={key,P};return P;
  }
  const tplOf=(geo,spec)=>spec&&spec.base?(prepare(geo)._t[spec.base]||null):null;
  /* Государство, которому провинция принадлежит в основе карты */
  function baseUnit(geo,spec,pid,r,c){
    const T=tplOf(geo,spec);if(!T)return c;
    const o=T.own[r];if(o==null)return c;
    if(typeof o==='number')return 'u'+o;
    const k=parseInt(pid.slice(pid.lastIndexOf('.')+1),10);
    return 'u'+(isNaN(k)||o[k]==null?o[0]:o[k]);
  }
  const ownerOf=(geo,spec,f)=>(spec.owner&&spec.owner[f.properties.id])||f.properties.u;
  /* Регион провинции: свой (spec.preg) или исходный */
  const regionOf=(spec,f)=>(spec.preg&&spec.preg[f.properties.id])||f.properties.r;
  /* Файлы провинций, нужные для государства основы */
  function filesFor(geo,spec,u){
    const T=tplOf(geo,spec);
    if(!T)return /^[A-Z0-9]{2,4}$/.test(u)?[u]:[];
    const m=/^u(\d+)$/.exec(u);const unit=m&&T.units[+m[1]];return unit?unit.cc:[];
  }
  function unitName(geo,spec,u){
    if(!u)return '';
    if(spec.states&&spec.states[u])return spec.states[u].name;
    const T=tplOf(geo,spec);
    if(T){const m=/^u(\d+)$/.exec(u);if(m&&T.units[+m[1]])return T.units[+m[1]].ru;}
    const f=prepare(geo)._cById[u];return f?f.properties.ru:u;
  }
  /* Все провинции разбитых государств одной топологией: общие дуги между странами */
  function splitData(geo,spec){
    prepare(geo);
    const split=(spec.split||[]).slice().sort();if(!split.length)return null;
    const splitSet=new Set(split);
    const files=[...new Set(split.flatMap(u=>filesFor(geo,spec,u)))].filter(c=>geo._p[c]).sort();
    if(!files.length)return null;
    // провинции, переданные разбитым государствам из неразбитых, тоже входят в топологию
    const ownIn=Object.keys(spec.owner||{}).filter(id=>splitSet.has(spec.owner[id])).sort();
    const key=(spec.base||'')+'|'+split.join(',')+'|'+files.map(c=>{const e=spec.pedit&&spec.pedit[c];return c+':'+(e?(e.v||0)+'.'+e.del.length+'.'+e.add.length:0);}).join(',')+'|'+ownIn.length+':'+(ownIn[0]||'')+':'+(ownIn[ownIn.length-1]||'');
    geo._sd=geo._sd||{};if(geo._sd.key===key)return geo._sd.D;
    const ownSet=new Set(ownIn);const feats=[];
    for(const c of files){const P=provFor(geo,c,spec);
      for(const f of P.feats){const {id,r}=f.properties;const u=baseUnit(geo,spec,id,r,c);if(!splitSet.has(u)&&!ownSet.has(id))continue;
        feats.push({type:'Feature',properties:{id,r,c,u},geometry:f.geometry});}}
    const t=topojson.topology({p:{type:'FeatureCollection',features:feats}});
    const obj=t.objects.p;const fs=topojson.feature(t,obj).features;const byId={};fs.forEach(f=>byId[f.properties.id]=f);
    const D={topo:t,obj,feats:fs,byId,files,splitSet};geo._sd={key,D};return D;
  }
  const has=(a,v)=>!!a&&a.includes(v);
  function owns(g,u,rid,pid){return has(g.countries,u)||(rid&&has(g.regions,rid))||(pid&&has(g.prov,pid));}
  function colorOf(spec,u,rid,pid){let col=null;for(const g of spec.groups||[])if(owns(g,u,rid,pid))col=g.color;return col;}

  function drawMap(spec,geo,opt={}){
    prepare(geo);
    const PR=opt.proj||projection(spec,geo);const {p,W,H}=PR;const path=d3.geoPath(p).digits(spec.proj==='ortho'?1:0);
    // только одна страна: остальной мир, океан и сетка не рисуются
    const one=spec.only&&(PR.only||opt.inner)?spec.only:'';
    const ia=!!opt.interactive,globe=spec.proj==='ortho';
    const T=tplOf(geo,spec);const D=splitData(geo,spec);const splitSet=D?D.splitSet:new Set();
    const bw=+spec.bw||.5,B=spec.border||'#fff';
    let s=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`;
    if(globe)s+=`<defs><radialGradient id="mo" cx="42%" cy="40%" r="62%"><stop offset="0" stop-color="${spec.ocean}"/><stop offset=".72" stop-color="${spec.ocean}"/><stop offset="1" stop-color="#d4d4d4"/></radialGradient><radialGradient id="ms" cx="42%" cy="40%" r="62%"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".16"/></radialGradient></defs>`;
    const sph=path(SPHERE)||'';
    const regional=spec.proj==='laea'||spec.proj==='conic';
    if(regional&&!one)s+=`<rect width="${W}" height="${H}" fill="${spec.ocean}"/>`;
    if(!one)s+=`<path d="${sph}" fill="${globe&&spec.shade?'url(#mo)':spec.ocean}"/>`;
    if(spec.grat&&!one)s+=`<path d="${path(d3.geoGraticule10())}" fill="none" stroke="#000" stroke-opacity=".13" stroke-width=".5"/>`;
    // государства основы, которые не разбиты на провинции
    let land='',under='';
    const baseFeats=T?T.feats.map(f=>[f,f.properties.u]):geo._c.map(f=>[f,f.properties.id]);
    for(const [f,u] of baseFeats){
      if(one&&u!==one)continue;
      if(D&&splitSet.has(u)){
        // в готовой карте под провинциями лежит сплошное государство — микрозазоры между провинциями не видны
        if(!ia){const d=path(f);if(d)under+=`<path d="${d}" fill="${colorOf(spec,u)||spec.land}"/>`;}
        continue;
      }
      const d=path(f);if(!d)continue;
      land+=`<path d="${d}" fill="${colorOf(spec,u)||spec.land}"${ia?` data-u="${u}"`:''}${ia&&opt.hl&&opt.hl===u?' class="tgt"':''}/>`;
    }
    if(under)s+=`<g>${under}</g>`;
    s+=`<g stroke="${B}" stroke-width="${bw}" stroke-linejoin="round">${land}</g>`;
    // провинции разбитых государств
    if(D){
      const own=f=>ownerOf(geo,spec,f);const reg=f=>regionOf(spec,f);
      const colF=f=>colorOf(spec,own(f),reg(f),f.properties.id)||spec.land;
      const geoms=D.obj.geometries;const ownG=g=>(spec.owner&&spec.owner[g.properties.id])||g.properties.u;
      const colG=g=>colorOf(spec,ownG(g),reg(g),g.properties.id)||spec.land;
      const inO=g=>!one||ownG(g)===one;const inF=f=>!one||own(f)===one;
      if(ia){
        let pv='';
        for(const f of D.feats){if(!inF(f))continue;const d=path(f);if(!d)continue;const {id,c}=f.properties;const r=reg(f);
          const hl=opt.hl&&opt.hl===own(f)||opt.hlr&&opt.hlr===r;
          pv+=`<path d="${d}" fill="${colF(f)}" data-p="${id}" data-r="${r}" data-c="${c}" data-u="${own(f)}"${hl?' class="tgt"':''}/>`;}
        s+=`<g stroke="${B}" stroke-width="${r1(bw*.3)}" stroke-opacity=".6">${pv}</g>`;
        const rm=path(topojson.mesh(D.topo,D.obj,(a,b)=>a!==b&&inO(a)&&reg(a)!==reg(b)&&ownG(a)===ownG(b)));
        if(rm)s+=`<path d="${rm}" fill="none" stroke="${B}" stroke-width="${r1(bw*.8)}" stroke-opacity=".85" pointer-events="none"/>`;
        const grp=path(topojson.mesh(D.topo,D.obj,(a,b)=>a!==b&&inO(a)&&ownG(a)===ownG(b)&&colG(a)!==colG(b)));
        if(grp)s+=`<path d="${grp}" fill="none" stroke="${B}" stroke-width="${r1(bw*1.6)}" pointer-events="none"/>`;
        const brd=path(topojson.mesh(D.topo,D.obj,(a,b)=>(inO(a)||inO(b))&&(a===b||ownG(a)!==ownG(b))));
        if(brd)s+=`<path d="${brd}" fill="none" stroke="${B}" stroke-width="${r1(bw*2.2)}" stroke-linejoin="round" pointer-events="none"/>`;
      }else{
        // в готовой карте провинции одного цвета сливаются, рисуются только границы
        const byCol={};for(const g of geoms){if(!inO(g))continue;const c=colG(g);(byCol[c]=byCol[c]||[]).push(g);}
        let fills='';for(const c in byCol){const d=path(topojson.merge(D.topo,byCol[c]));if(d)fills+=`<path d="${d}" fill="${c}" stroke="${c}" stroke-width=".3"/>`;}
        s+=`<g>${fills}</g>`;
        // провинции и регионы видны на готовой карте, только если их включили
        if(spec.showProv){const pm=path(topojson.mesh(D.topo,D.obj,(a,b)=>a!==b&&inO(a)&&reg(a)===reg(b)&&ownG(a)===ownG(b)&&colG(a)===colG(b)));if(pm)s+=`<path d="${pm}" fill="none" stroke="${B}" stroke-width="${r1(bw*.35)}" stroke-opacity=".7"/>`;}
        if(spec.showReg){const rm=path(topojson.mesh(D.topo,D.obj,(a,b)=>a!==b&&inO(a)&&reg(a)!==reg(b)&&ownG(a)===ownG(b)&&colG(a)===colG(b)));if(rm)s+=`<path d="${rm}" fill="none" stroke="${B}" stroke-width="${r1(bw*.7)}"/>`;}
        const brd=path(topojson.mesh(D.topo,D.obj,(a,b)=>one?((inO(a)||inO(b))&&(a===b||ownG(a)!==ownG(b)||colG(a)!==colG(b))):(a===b||ownG(a)!==ownG(b)||colG(a)!==colG(b))));
        if(brd)s+=`<path d="${brd}" fill="none" stroke="${B}" stroke-width="${bw}" stroke-linejoin="round"/>`;
      }
    }
    // озёра на карте одной страны — только внутри её рамки на экране
    if(spec.lakes&&geo._lakes.length){let l='';for(const f of geo._lakes){if(one){const c=p(d3.geoCentroid(f));if(!c||c[0]<0||c[1]<0||c[0]>W||c[1]>H)continue;}const d=path(f);if(d)l+=`<path d="${d}"/>`;}s+=`<g fill="${spec.ocean}"${ia?' pointer-events="none"':''}>${l}</g>`;}
    if(globe&&spec.shade&&!one)s+=`<path d="${sph}" fill="url(#ms)" pointer-events="none"/>`;
    if(!regional&&!one)s+=`<path d="${sph}" fill="none" stroke="#9a9a9a" stroke-width="${globe?1:.8}" pointer-events="none"/>`;
    // кружок вокруг маленьких государств (как на карте Данцига)
    (spec.groups||[]).forEach((g,i)=>{if(!g.circle)return;const c=groupCentroid(spec,i,geo);const xy=c&&p(c);
      if(xy&&isFinite(xy[0]))s+=`<circle cx="${xy[0].toFixed(1)}" cy="${xy[1].toFixed(1)}" r="${regional||globe?11:8}" fill="none" stroke="#333" stroke-width="1.4" pointer-events="none"/>`;});
    if(spec.inset&&!opt.inner)s+=insetSVG(spec,geo,p,W,H);
    if(spec.zoomBox&&!opt.inner)s+=zoomSVG(spec,geo,p,W,H);
    return s+'</svg>';
  }
  /* Выноска с увеличением (как на карте Тайваня): рамка на карте, большая рамка с приближением и «луч» между ними */
  function zoomSVG(spec,geo,p,W,H){
    const z=spec.zoomBox;const lon=+z.lon||0,lat=+z.lat||0;
    const span=Math.max(.2,Math.min(60,+z.span||8)),ratio=Math.max(.4,Math.min(2.5,+z.ratio||1.2));
    const dLon=span/2,dLat=Math.min(85,span/2*ratio*Math.cos(lat*Math.PI/180));
    const c=[[lon-dLon,lat-dLat],[lon+dLon,lat-dLat],[lon+dLon,lat+dLat],[lon-dLon,lat+dLat]];
    const ring=[];for(let i=0;i<4;i++){const a=c[i],b=c[(i+1)%4];for(let k=0;k<12;k++){const t=k/12;ring.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}}
    const vis=spec.proj!=='ortho'||d3.geoDistance([lon,lat],[-p.rotate()[0],-p.rotate()[1]])<1.45;
    const sp=vis?ring.map(q=>p(q)).filter(q=>q&&isFinite(q[0])&&isFinite(q[1])):[];
    const bw=Math.round(W*Math.max(.15,Math.min(.7,+z.size||.42))),bh=Math.round(bw*ratio),pad=Math.round(W*.02);
    const pos=z.pos||'tl';const x0=pos[1]==='r'?W-bw-pad:pad,y0=pos[0]==='b'?Math.max(pad,H-bh-pad):pad;
    const sw=W>600?2:1.3;const f1=v=>v.toFixed(1);
    const smallD=sp.length>3?'M'+sp.map(q=>f1(q[0])+','+f1(q[1])).join('L')+'Z':'';
    let s='<g pointer-events="none">';
    if(smallD){const hull=d3.polygonHull([...sp,[x0,y0],[x0+bw,y0],[x0+bw,y0+bh],[x0,y0+bh]]);
      if(hull)s+=`<path d="M${hull.map(q=>f1(q[0])+','+f1(q[1])).join('L')}Z ${smallD}" fill="#000" fill-opacity=".2" fill-rule="evenodd"/>`;}
    const ip=d3.geoMercator().rotate([-lon,0]).fitExtent([[0,0],[bw,bh]],{type:'MultiPoint',coordinates:c}).clipExtent([[-2,-2],[bw+2,bh+2]]);
    const inner=drawMap(Object.assign({},spec,{proj:'mercator',grat:false,shade:false,inset:false,zoomBox:null}),geo,{inner:true,proj:{p:ip,W:bw,H:bh}});
    s+=`<rect x="${x0}" y="${y0}" width="${bw}" height="${bh}" fill="${spec.only?'#fff':spec.ocean}"/>`;
    s+=inner.replace('<svg xmlns="http://www.w3.org/2000/svg"',`<svg x="${x0}" y="${y0}" overflow="hidden"`);
    s+=`<rect x="${x0}" y="${y0}" width="${bw}" height="${bh}" fill="none" stroke="#555" stroke-width="${sw}"/>`;
    if(smallD)s+=`<path d="${smallD}" fill="none" stroke="#555" stroke-width="${sw}" stroke-linejoin="round"/>`;
    return s+'</g>';
  }
  /* Мини-карта мира в углу с рамкой показанной области (как на карте Чехии) */
  function insetSVG(spec,geo,p,W,H){
    const iw=Math.round(W*.3),ih=Math.round(iw*.51),pad=Math.round(W*.012);
    const pos=spec.insetPos||'tl';const x0=pos[1]==='r'?W-iw-pad:pad,y0=pos[0]==='b'?H-ih-pad:pad;
    const ip=d3.geoRobinson().rotate([-(+spec.lon||0),0]).fitExtent([[x0,y0],[x0+iw,y0+ih]],SPHERE);
    const ipath=d3.geoPath(ip).digits(1);
    let s=`<g pointer-events="none"><path d="${ipath(SPHERE)}" fill="${spec.ocean}" stroke="#8a8a8a" stroke-width="1"/>`;
    s+=`<path d="${ipath({type:'FeatureCollection',features:geo._c})}" fill="${spec.land}"/>`;
    // область основной карты: обходим края кадра и переносим точки на мини-карту
    const pts=[];const N=40;
    const edge=(ax,ay,bx,by)=>{for(let k=0;k<N;k++){const t=k/N;const g=p.invert([ax+(bx-ax)*t,ay+(by-ay)*t]);if(g&&isFinite(g[0])&&isFinite(g[1])){const q=ip(g);if(q)pts.push(q);}}};
    const full=spec.proj==='ortho'&&(+spec.zoom||1)<1.6;
    if(full){const c=d3.geoCircle().center([+spec.lon||0,+spec.lat||0]).radius(89)();const d=ipath(c);if(d)s+=`<path d="${d}" fill="#c00" fill-opacity=".12" stroke="#c00" stroke-width="1.2"/>`;}
    else{edge(0,0,W,0);edge(W,0,W,H);edge(W,H,0,H);edge(0,H,0,0);
      if(pts.length>3)s+=`<path d="M${pts.map(q=>q[0].toFixed(1)+','+q[1].toFixed(1)).join('L')}Z" fill="#c00" fill-opacity=".12" stroke="#c00" stroke-width="1.2" stroke-linejoin="round"/>`;}
    return s+'</g>';
  }
  /* Центр группы — чтобы повернуть глобус к выбранному государству */
  function groupCentroid(spec,gi,geo){
    prepare(geo);const g=spec.groups[gi];if(!g)return null;
    const T=tplOf(geo,spec);const D=splitData(geo,spec);const feats=[];
    for(const u of g.countries||[]){if(D&&D.splitSet.has(u))continue;const f=T?T.byU[u]:geo._cById[u];if(f)feats.push(f);}
    if(D)for(const f of D.feats)if(owns(g,ownerOf(geo,spec,f),regionOf(spec,f),f.properties.id))feats.push(f);
    if(!feats.length)return null;
    const c=d3.geoCentroid({type:'FeatureCollection',features:feats});
    return isFinite(c[0])?c:null;
  }
  return {PROJ,ASPECTS,defaults,projection,onlyFC,prepare,provFor,splitData,baseUnit,ownerOf,regionOf,filesFor,unitName,tplOf,drawMap,groupCentroid,owns,colorOf};
}
if(typeof module!=='undefined'&&module.exports)module.exports=makeMapDraw;
else root.MapDraw=makeMapDraw(root.d3,root.topojson);
})(typeof window!=='undefined'?window:this);
