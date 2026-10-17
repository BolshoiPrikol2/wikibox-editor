'use strict';
/* Рисование карт-локаторов в стиле Викисклада: глобус (ортографическая проекция) и плоские карты мира.
   Работает в браузере (глобальные d3 и topojson) и в Node (для подготовки примеров). */
(function(root){
function makeMapDraw(d3,topojson){
  const PROJ={
    ortho:{name:'Глобус',make:()=>d3.geoOrthographic().clipAngle(90).precision(.3)},
    robinson:{name:'Мир (Робинсон)',make:()=>d3.geoRobinson()},
    equalearth:{name:'Мир (Equal Earth)',make:()=>d3.geoEqualEarth()},
    eqrect:{name:'Равнопромежуточная',make:()=>d3.geoEquirectangular()},
    mercator:{name:'Меркатор',make:()=>d3.geoMercator()},
  };
  const SPHERE={type:'Sphere'};
  const r1=n=>Math.round(n*10)/10;

  function defaults(kind){
    const globe=kind!=='flat';
    return {proj:globe?'ortho':'robinson',lon:globe?60:10,lat:globe?45:0,zoom:1,
      land:'#c0c0c0',border:'#ffffff',ocean:'#ffffff',bw:globe?.5:.6,grat:globe,shade:globe,lakes:true,
      groups:[{name:globe?'Государство':'Члены союза',color:globe?'#346733':'#1f93c0',countries:[],regions:[]}],split:[]};
  }
  function projection(spec){
    const p=PROJ[spec.proj]?PROJ[spec.proj].make():PROJ.ortho.make();
    const zoom=Math.max(1,+spec.zoom||1),lon=+spec.lon||0,lat=+spec.lat||0;
    if(spec.proj==='ortho'||!PROJ[spec.proj]){
      const W=500,H=500;p.rotate([-lon,-lat]).scale(245*zoom).translate([W/2,H/2]);return {p,W,H};
    }
    const W=1000;let H;
    p.rotate([-lon,0]);
    if(spec.proj==='mercator'){p.scale(W/(2*Math.PI)).translate([0,0]);H=Math.round(W*.72);}
    else{p.fitWidth(W,SPHERE);const b=d3.geoPath(p).bounds(SPHERE);H=Math.ceil(b[1][1]-b[0][1]);}
    p.scale(p.scale()*zoom).translate([0,0]);
    const c=p([lon,zoom>1||spec.proj==='mercator'?lat:0])||[0,0];
    p.translate([W/2-c[0],H/2-c[1]]);
    return {p,W,H};
  }
  /* Подготовка геоданных: geo = {countries: topology, regions: topology|null} */
  function prepare(geo){
    if(!geo._c){
      const t=geo.countries;
      geo._c=topojson.feature(t,t.objects.countries).features;
      geo._lakes=t.objects.lakes?topojson.feature(t,t.objects.lakes).features:[];
      geo._cById={};geo._c.forEach(f=>geo._cById[f.properties.id]=f);
    }
    if(geo.regions&&!geo._r){
      const t=geo.regions;geo._rGeoms={};geo._rByC={};geo._rById={};
      for(const g of t.objects.regions.geometries){geo._rGeoms[g.properties.id]=g;}
      geo._r=topojson.feature(t,t.objects.regions).features;
      geo._r.forEach(f=>{const c=f.properties.c;(geo._rByC[c]=geo._rByC[c]||[]).push(f);geo._rById[f.properties.id]=f;});
    }
    return geo;
  }
  function memberColor(spec,cid,rid){
    let col=null;
    for(const g of spec.groups||[]){
      if((g.countries||[]).includes(cid))col=g.color;
      if(rid&&(g.regions||[]).includes(rid))col=g.color;
    }
    return col;
  }
  function drawMap(spec,geo,opt={}){
    prepare(geo);
    const {p,W,H}=projection(spec);const path=d3.geoPath(p).digits(spec.proj==='ortho'?1:0);
    const ia=!!opt.interactive,globe=spec.proj==='ortho';
    const split=new Set((spec.split||[]).filter(c=>geo._rByC&&geo._rByC[c]));
    const bw=+spec.bw||.5,B=spec.border||'#fff';
    let s=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`;
    if(globe)s+=`<defs><radialGradient id="mo" cx="42%" cy="40%" r="62%"><stop offset="0" stop-color="${spec.ocean}"/><stop offset=".72" stop-color="${spec.ocean}"/><stop offset="1" stop-color="#d4d4d4"/></radialGradient><radialGradient id="ms" cx="42%" cy="40%" r="62%"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".16"/></radialGradient></defs>`;
    const sph=path(SPHERE)||'';
    s+=`<path d="${sph}" fill="${globe&&spec.shade?'url(#mo)':spec.ocean}"/>`;
    if(spec.grat)s+=`<path d="${path(d3.geoGraticule10())}" fill="none" stroke="#000" stroke-opacity=".13" stroke-width=".5"/>`;
    // страны целиком
    let land='';
    for(const f of geo._c){
      const id=f.properties.id;if(split.has(id))continue;
      const d=path(f);if(!d)continue;
      const c=memberColor(spec,id)||spec.land;
      land+=`<path d="${d}" fill="${c}"${ia?` data-c="${id}"`:''}/>`;
    }
    s+=`<g stroke="${B}" stroke-width="${bw}" stroke-linejoin="round">${land}</g>`;
    // страны, разбитые на регионы
    if(split.size){
      let reg='',outl='';
      const merged=g=>{const geoms=(g.regions||[]).filter(id=>geo._rById[id]&&split.has(geo._rById[id].properties.c)).map(id=>geo._rGeoms[id]);return geoms.length?path(topojson.merge(geo.regions,geoms)):'';};
      if(ia){
        for(const cid of split)for(const f of geo._rByC[cid]){
          const d=path(f);if(!d)continue;
          reg+=`<path d="${d}" fill="${memberColor(spec,cid,f.properties.id)||spec.land}" data-r="${f.properties.id}" data-rc="${cid}"/>`;
        }
        s+=`<g stroke="${B}" stroke-width="${r1(bw*.45)}" stroke-opacity=".8">${reg}</g>`;
        for(const g of spec.groups||[]){const d=merged(g);if(d)outl+=`<path d="${d}"/>`;}
        s+=`<g fill="none" stroke="${B}" stroke-width="${bw*1.6}" stroke-linejoin="round" pointer-events="none">${outl}</g>`;
      }else{
        // в готовой карте: страна целиком цветом суши, сверху — слитые области групп
        for(const cid of split){const cf=geo._cById[cid];const d=cf&&path(cf);if(d)reg+=`<path d="${d}" fill="${memberColor(spec,cid)||spec.land}"/>`;}
        for(const g of spec.groups||[]){const d=merged(g);if(d)reg+=`<path d="${d}" fill="${g.color}"/>`;}
        s+=`<g stroke="${B}" stroke-width="${bw}" stroke-linejoin="round">${reg}</g>`;
      }
    }
    if(spec.lakes&&geo._lakes.length){let l='';for(const f of geo._lakes){const d=path(f);if(d)l+=`<path d="${d}"/>`;}s+=`<g fill="${spec.ocean}"${ia?' pointer-events="none"':''}>${l}</g>`;}
    if(globe&&spec.shade)s+=`<path d="${sph}" fill="url(#ms)" pointer-events="none"/>`;
    s+=`<path d="${sph}" fill="none" stroke="#9a9a9a" stroke-width="${globe?1:.8}" pointer-events="none"/>`;
    return s+'</svg>';
  }
  /* Центр группы — чтобы повернуть глобус к выбранному государству */
  function groupCentroid(spec,gi,geo){
    prepare(geo);const g=spec.groups[gi];if(!g)return null;
    const feats=[...(g.countries||[]).map(id=>geo._cById[id]),...(g.regions||[]).map(id=>geo._rById&&geo._rById[id])].filter(Boolean);
    if(!feats.length)return null;
    let best=null,area=-1;
    for(const f of feats){const a=d3.geoArea(f);if(a>area){area=a;best=f;}}
    const all={type:'FeatureCollection',features:feats};
    const c=d3.geoCentroid(all);
    return isFinite(c[0])?c:d3.geoCentroid(best);
  }
  return {PROJ,defaults,projection,prepare,drawMap,groupCentroid,memberColor};
}
if(typeof module!=='undefined'&&module.exports)module.exports=makeMapDraw;
else root.MapDraw=makeMapDraw(root.d3,root.topojson);
})(typeof window!=='undefined'?window:this);
