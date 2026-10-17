'use strict';
/* Рисование карт-локаторов в стиле Викисклада: глобус (ортографическая проекция) и плоские карты мира.
   Страны можно разбить на мелкие провинции (по файлу на страну) и собирать из них новые государства.
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
  const r1=n=>Math.round(n*100)/100;

  function defaults(kind){
    const globe=kind!=='flat';
    return {proj:globe?'ortho':'robinson',lon:globe?60:10,lat:globe?45:0,zoom:1,
      land:'#c0c0c0',border:'#ffffff',ocean:'#ffffff',bw:globe?.5:.6,grat:globe,shade:globe,lakes:true,
      groups:[{name:globe?'Государство':'Члены союза',color:globe?'#346733':'#1f93c0',countries:[],regions:[],prov:[]}],split:[]};
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
  /* geo = {countries: topology, prov: {КОД: topology}, names: {r:{adm1:[имя,страна]}}} */
  function prepare(geo){
    if(!geo._c){
      const t=geo.countries;
      geo._c=topojson.feature(t,t.objects.countries).features;
      geo._lakes=t.objects.lakes?topojson.feature(t,t.objects.lakes).features:[];
      geo._cById={};geo._c.forEach(f=>geo._cById[f.properties.id]=f);
      geo._p={};
    }
    for(const cid in geo.prov||{}){
      if(geo._p[cid])continue;
      const t=geo.prov[cid];geo._p[cid]=buildP(t,t.objects[Object.keys(t.objects)[0]]);
    }
    return geo;
  }
  function buildP(t,obj){
    const P={topo:t,obj,feats:topojson.feature(t,obj).features,byId:{},geom:{},byRegion:{},regions:[]};
    obj.geometries.forEach(g=>P.geom[g.properties.id]=g);
    P.feats.forEach(f=>{const {id,r}=f.properties;P.byId[id]=f;(P.byRegion[r]=P.byRegion[r]||(P.regions.push(r),[])).push(id);});
    P.rmesh=topojson.mesh(t,obj,(a,b)=>a.properties.r!==b.properties.r);
    return P;
  }
  /* Провинции страны с учётом правок границ на этой карте (spec.pedit) */
  function provFor(geo,cid,spec){
    prepare(geo);const base=geo._p[cid];if(!base)return null;
    const e=spec&&spec.pedit&&spec.pedit[cid];
    if(!e||(!(e.del||[]).length&&!(e.add||[]).length))return base;
    const key=cid+':'+(e.v||0)+':'+(e.del||[]).length+':'+(e.add||[]).length;
    geo._pe=geo._pe||{};if(geo._pe[cid]&&geo._pe[cid].key===key)return geo._pe[cid].P;
    const del=new Set(e.del||[]);
    const feats=base.feats.filter(f=>!del.has(f.properties.id)).map(f=>({type:'Feature',properties:f.properties,geometry:f.geometry}));
    for(const a of e.add||[])feats.push({type:'Feature',properties:{id:a.id,r:a.r,c:cid},geometry:{type:'MultiPolygon',coordinates:a.g}});
    const t=topojson.topology({p:{type:'FeatureCollection',features:feats}},1e6);
    const P=buildP(t,t.objects.p);geo._pe[cid]={key,P};return P;
  }
  const has=(a,v)=>!!a&&a.includes(v);
  function owns(g,cid,rid,pid){return has(g.countries,cid)||(rid&&has(g.regions,rid))||(pid&&has(g.prov,pid));}
  function colorOf(spec,cid,rid,pid){let col=null;for(const g of spec.groups||[])if(owns(g,cid,rid,pid))col=g.color;return col;}

  function drawMap(spec,geo,opt={}){
    prepare(geo);
    const {p,W,H}=projection(spec);const path=d3.geoPath(p).digits(spec.proj==='ortho'?1:0);
    const ia=!!opt.interactive,globe=spec.proj==='ortho';
    const split=(spec.split||[]).filter(c=>geo._p[c]);const splitSet=new Set(split);
    const bw=+spec.bw||.5,B=spec.border||'#fff';
    let s=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`;
    if(globe)s+=`<defs><radialGradient id="mo" cx="42%" cy="40%" r="62%"><stop offset="0" stop-color="${spec.ocean}"/><stop offset=".72" stop-color="${spec.ocean}"/><stop offset="1" stop-color="#d4d4d4"/></radialGradient><radialGradient id="ms" cx="42%" cy="40%" r="62%"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".16"/></radialGradient></defs>`;
    const sph=path(SPHERE)||'';
    s+=`<path d="${sph}" fill="${globe&&spec.shade?'url(#mo)':spec.ocean}"/>`;
    if(spec.grat)s+=`<path d="${path(d3.geoGraticule10())}" fill="none" stroke="#000" stroke-opacity=".13" stroke-width=".5"/>`;
    // страны целиком
    let land='';
    for(const f of geo._c){
      const id=f.properties.id;if(ia&&splitSet.has(id))continue;
      const d=path(f);if(!d)continue;
      land+=`<path d="${d}" fill="${colorOf(spec,id)||spec.land}"${ia?` data-c="${id}"`:''}/>`;
    }
    s+=`<g stroke="${B}" stroke-width="${bw}" stroke-linejoin="round">${land}</g>`;
    // страны, разбитые на провинции
    if(split.length){
      if(ia){
        let pv='',mesh='',outl='';
        for(const cid of split){
          const P=provFor(geo,cid,spec);
          for(const f of P.feats){const d=path(f);if(!d)continue;const {id,r}=f.properties;
            pv+=`<path d="${d}" fill="${colorOf(spec,cid,r,id)||spec.land}" data-p="${id}" data-r="${r}" data-c="${cid}"/>`;}
          const dm=path(P.rmesh);if(dm)mesh+=`<path d="${dm}"/>`;
          for(const g of spec.groups||[]){
            const gs=P.feats.filter(f=>owns(g,cid,f.properties.r,f.properties.id)).map(f=>P.geom[f.properties.id]);
            if(gs.length&&gs.length<P.feats.length){const d=path(topojson.merge(P.topo,gs));if(d)outl+=`<path d="${d}"/>`;}
          }
          const cf=geo._cById[cid];const dc=cf&&path(cf);if(dc)outl+=`<path d="${dc}"/>`;
        }
        s+=`<g stroke="${B}" stroke-width="${r1(bw*.3)}" stroke-opacity=".6">${pv}</g>`;
        s+=`<g fill="none" stroke="${B}" stroke-width="${r1(bw*.9)}" stroke-opacity=".9" pointer-events="none">${mesh}</g>`;
        s+=`<g fill="none" stroke="${B}" stroke-width="${r1(bw*2)}" stroke-linejoin="round" pointer-events="none">${outl}</g>`;
      }else{
        // в готовой карте: поверх страны — слитые области каждой группы
        let reg='';
        for(const cid of split){
          const P=provFor(geo,cid,spec);
          for(const g of spec.groups||[]){
            if(has(g.countries,cid))continue;
            const gs=P.feats.filter(f=>owns(g,cid,f.properties.r,f.properties.id)).map(f=>P.geom[f.properties.id]);
            if(!gs.length)continue;const d=path(topojson.merge(P.topo,gs));if(d)reg+=`<path d="${d}" fill="${g.color}"/>`;
          }
        }
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
    const feats=(g.countries||[]).map(id=>geo._cById[id]).filter(Boolean);
    for(const cid of spec.split||[]){const P=provFor(geo,cid,spec);if(!P)continue;if(has(g.countries,cid))continue;for(const f of P.feats)if(owns(g,cid,f.properties.r,f.properties.id))feats.push(f);}
    if(!feats.length)return null;
    const c=d3.geoCentroid({type:'FeatureCollection',features:feats});
    return isFinite(c[0])?c:null;
  }
  return {PROJ,defaults,projection,prepare,provFor,drawMap,groupCentroid,owns,colorOf};
}
if(typeof module!=='undefined'&&module.exports)module.exports=makeMapDraw;
else root.MapDraw=makeMapDraw(root.d3,root.topojson);
})(typeof window!=='undefined'?window:this);
