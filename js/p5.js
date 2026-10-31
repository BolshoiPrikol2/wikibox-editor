'use strict';
/* Оформление в духе меню Persona 5 Royal: буквы-вырезки из разных шрифтов, рваные панели, клинья, полутон, звёзды.
   Случайность везде из хэша текста или адреса: у разных заголовков разные буквы и фигуры, но при перерисовке ничего не прыгает.
   Буквы — отдельные span с той же буквой внутри, поэтому textContent заголовков не меняется, и якоря, оглавление и правка работают как обычно. */
const P5=(()=>{
  const FONT_URL='https://fonts.googleapis.com/css2?family=Oswald:wght@700&family=Russo+One&family=Rubik+One&family=Playfair+Display:wght@900&family=Old+Standard+TT:wght@700&family=Podkova:wght@800&family=Dela+Gothic+One&family=Fira+Sans+Extra+Condensed:wght@800;900&family=Cousine:wght@400;700&family=Fira+Sans+Condensed:ital,wght@0,400;0,500;0,700;0,800;1,500&display=swap';
  const NF=9;                                     // шрифтов у букв, классы .f0–.f8 в p5.css
  const hash=s=>{let h=2166136261;for(const c of String(s)){h^=c.codePointAt(0);h=Math.imul(h,16777619);}return h>>>0;};
  const rng=seed=>{let a=seed>>>0;return ()=>{a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};};
  const rr=(R,a,b)=>a+(b-a)*R();
  const pick=(R,a)=>a[Math.floor(R()*a.length)];
  const on=()=>document.documentElement.dataset.ui==='p5';

  /* ---------- буквы-вырезки ---------- */
  // lv: 2 — крупные заголовки, 1 — разделы, 0 — пункты меню: чем мельче текст, тем меньше коробочек, чтобы он оставался читаемым
  const BOX=[.34,.26,.15];
  function letter(ch,R,first,lv,prevBox){
    const isL=/\p{L}/u.test(ch),box=isL&&!prevBox&&R()<(first?.55:BOX[2-lv]);
    const kind=!box?(isL&&R()<.12?'k4':'k0'):pick(R,['k1','k1','k2','k2','k3']);
    const s=(first?rr(R,1.16,1.42):rr(R,.86,1.08))*(lv?1:.94);
    const low=isL&&!first&&R()<.3;
    const el=document.createElement('span');
    el.className=`p5l f${Math.floor(R()*NF)} ${kind}${low?' lo':''}`;
    el.style.cssText=`--r:${rr(R,-6.5,6.5).toFixed(1)}deg;--s:${s.toFixed(2)};--y:${rr(R,-.05,.05).toFixed(3)}em`;
    el.textContent=ch;return {el,box};
  }
  function ransomText(node,lv){
    const frag=document.createDocumentFragment();
    node.nodeValue.split(/(\s+)/).forEach(part=>{
      if(!part)return;if(/^\s+$/.test(part)){frag.appendChild(document.createTextNode(part));return;}
      const R=rng(hash(part+lv)),w=document.createElement('span');w.className='p5w';let prevBox=false;
      Array.from(part).forEach((ch,i)=>{const l=letter(ch,R,i===0,lv,prevBox);prevBox=l.box;w.appendChild(l.el);});
      frag.appendChild(w);});
    node.parentNode.replaceChild(frag,node);
  }
  const done=new WeakMap();
  function ransom(el,lv){
    const t=el.textContent;if(done.get(el)===t&&el.querySelector('.p5w'))return;
    if(!t.trim()||el.closest('.ie-rich,[contenteditable="true"]'))return;
    const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT,{acceptNode:n=>n.parentElement.closest('button:not(.tcard),input,textarea,select,.mw-editsection,.p5w,sup')?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT});
    const nodes=[];while(w.nextNode())nodes.push(w.currentNode);
    nodes.forEach(n=>{if(n.nodeValue.trim())ransomText(n,lv);});
    done.set(el,t);
  }

  /* ---------- рваные фигуры ---------- */
  // Четыре угла со сдвигом и пара зазубрин на длинных сторонах. Значения в px от краёв, поэтому фигура не плывёт на длинных страницах
  function poly(R,d){
    const j=()=>rr(R,0,d).toFixed(1),p=[];
    const L=x=>`${x}px`,Rt=x=>`calc(100% - ${x}px)`;
    p.push(`${L(j())} ${L(j())}`);
    if(R()<.7){const x=rr(R,20,70).toFixed(1);p.push(`${x}% ${L(j())}`,`${(+x+rr(R,1,3)).toFixed(1)}% ${L(rr(R,d*.8,d*1.7).toFixed(1))}`,`${(+x+rr(R,3,6)).toFixed(1)}% ${L(j())}`);}
    p.push(`${Rt(j())} ${L(j())}`,`${Rt(j())} ${Rt(j())}`);
    if(R()<.7){const x=rr(R,25,75).toFixed(1);p.push(`${x}% ${Rt(j())}`,`${(x-rr(R,1,3)).toFixed(1)}% ${Rt(rr(R,d*.8,d*1.7).toFixed(1))}`,`${(x-rr(R,3,6)).toFixed(1)}% ${Rt(j())}`);}
    p.push(`${L(j())} ${Rt(j())}`);
    return `polygon(${p.join(',')})`;
  }
  function shape(el,d,key,tilt){
    const k=key||(el.textContent||'').slice(0,60)+(el.className||'');
    if(el.dataset.p5s===k)return;el.dataset.p5s=k;
    const R=rng(hash(k));el.style.setProperty('--p5c',poly(R,d));
    if(tilt)el.style.setProperty('--p5t',rr(R,-tilt,tilt).toFixed(2)+'deg');
    el.style.setProperty('--p5x',Math.round(rr(R,0,1)*100)/100);
  }
  // Пункты меню стоят лесенкой разной длины, как в главном меню игры
  // Прямоугольник с мелкими случайными неровностями: шаг и отступ точек разные на каждой стороне
  function rough(R,x0,y0,x1,y1,d){
    const pts=[],side=(ax,ay,bx,by,nx,ny)=>{const L=Math.hypot(bx-ax,by-ay);let t=0;while(t<L){const k=t/L,o=rr(R,-d,d)*(R()<.14?1.7:1);pts.push((ax+(bx-ax)*k+nx*o).toFixed(1)+','+(ay+(by-ay)*k+ny*o).toFixed(1));t+=rr(R,26,84);}};
    side(x0,y0,x1,y0,0,1);side(x1,y0,x1,y1,1,0);side(x1,y1,x0,y1,0,1);side(x0,y1,x0,y0,1,0);
    return pts.join(' ');
  }
  function frames(){
    document.querySelectorAll('.infobox').forEach(e=>{
      const W=e.offsetWidth,H=e.offsetHeight,key=W+'x'+H;if(!W||e._p5f===key)return;e._p5f=key;e.dataset.p5f='1';
      const R=rng(hash('card'+(e.querySelector('.infobox-above')?.textContent||''))),FW=W+24,FH=H+26;
      const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${FW} ${FH}" preserveAspectRatio="none"><polygon points="${rough(R,10,12,W+21,H+23,2.4)}" fill="#e60012"/><polygon points="${rough(R,1.5,1.5,W+10.5,H+10.5,1.8)}" fill="#f2f2f0"/><polygon points="${rough(R,6,6,W+6,H+6,2)}" fill="#0a0a0a"/></svg>`;
      e.style.setProperty('--p5frame','url("data:image/svg+xml,'+encodeURIComponent(svg)+'")');});
  }
  // Те же неровности для блоков заглавной: точки в процентах, отступы в пикселях
  function roughClip(R,d){
    const p=[],j=()=>rr(R,0,d).toFixed(1),n=9,m=5;
    for(let i=0;i<n;i++)p.push(`${(i/n*100+rr(R,0,6)).toFixed(1)}% ${j()}px`);
    for(let i=0;i<m;i++)p.push(`calc(100% - ${j()}px) ${(i/m*100+rr(R,0,8)).toFixed(1)}%`);
    for(let i=n;i>0;i--)p.push(`${(i/n*100-rr(R,0,6)).toFixed(1)}% calc(100% - ${j()}px)`);
    for(let i=m;i>0;i--)p.push(`${j()}px ${(i/m*100-rr(R,0,8)).toFixed(1)}%`);
    return `polygon(${p.join(',')})`;
  }
  function roughen(list){list.forEach(e=>{if(e.dataset.p5r)return;e.dataset.p5r='1';e.style.setProperty('--p5c',roughClip(rng(hash('rough'+(e.textContent||'').slice(0,50))),3.5));});}
  function stagger(list){[...list.children].forEach((li,i)=>{const R=rng(hash(li.textContent+i));li.style.setProperty('--p5m',Math.round(rr(R,0,26))+'px');const a=li.querySelector('a');const long=Math.max(1,...(a?a.textContent:li.textContent).split(/\s+/).map(w=>w.length));li.style.setProperty('--p5z',Math.min(rr(R,.94,1.14),11/long).toFixed(2));});}

  // Цвета текста из Википедии рассчитаны на белый фон: на чёрной панели тёмные осветляем, оттенок оставляем
  const lum=c=>{const m=c.match(/[\d.]+/g).map(Number);const f=v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4;};return .2126*f(m[0])+.7152*f(m[1])+.0722*f(m[2]);};
  function liftDark(){
    document.querySelectorAll('.mw-content [style*="color"]').forEach(e=>{
      if(!e.style.color||e.style.background||e.style.backgroundColor||e.closest('.wikitable,.thumb,figure,.infobox-image,.infobox-header,.p5tag,.mp-welcome'))return;
      e.classList.remove('p5lift');const c=getComputedStyle(e).color;
      if(lum(c)<.2){e.style.setProperty('--p5lc',c);e.classList.add('p5lift');}});
  }
  /* Узор как справа в меню игры: зигзаги и звёзды из вложенных контуров, чёрное на сером. Вариантов несколько, у блока свой вариант и свой срез */
  const NP=6,pats=[];
  function pattern(i){
    if(pats[i])return pats[i];
    const R=rng(hash('pat'+i)),W=520,H=520;let s='<rect width="520" height="520" fill="#cfcfcd"/>';
    for(let k=0;k<7;k++){const a=rr(R,-.5,.5),st=rr(R,34,60),w=rr(R,7,15),x0=rr(R,-120,120),y0=rr(R,0,H);let p='';
      for(let t=0;t<16;t++){const x=x0+t*st,y=y0+(t%2?st*.8:0)+x*Math.tan(a);p+=x.toFixed(0)+','+y.toFixed(0)+' ';}
      s+='<polyline points="'+p+'" fill="none" stroke="#0a0a0a" stroke-width="'+w.toFixed(1)+'" stroke-linejoin="miter"/>';}
    for(let k=0;k<5;k++){const cx=rr(R,0,W),cy=rr(R,0,H),q=rr(R,90,210),n=Math.round(rr(R,5,8));let rot=rr(R,0,1.2);
      for(let c=0;c<n;c++){const r=q*(1-c/n);rot+=rr(R,.01,.06);s+='<polygon points="'+starPts(cx,cy,r,r*.47,rot)+'" fill="'+(c%2?'#cfcfcd':'#0a0a0a')+'"/>';}}
    return pats[i]='url("data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 520">'+s+'</svg>')+'")';
  }
  // Граница узора считается по настоящим координатам символов и картинок: узор обрезан косым краем и до них не доходит
  let gen=0;
  function boxOf(el,imgs){
    const o=el.getBoundingClientRect(),r=document.createRange(),w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let b=null;
    const add=q=>{if(!q.width||!q.height)return;b=b?{l:Math.min(b.l,q.left),t:Math.min(b.t,q.top),r:Math.max(b.r,q.right),b:Math.max(b.b,q.bottom)}:{l:q.left,t:q.top,r:q.right,b:q.bottom};};
    while(w.nextNode()){if(!w.currentNode.nodeValue.trim())continue;r.selectNodeContents(w.currentNode);[...r.getClientRects()].forEach(add);}
    if(imgs)el.querySelectorAll('img,svg').forEach(i=>add(i.getBoundingClientRect()));
    return b&&{l:b.l-o.left,t:b.t-o.top,r:b.r-o.left,b:b.b-o.top};
  }
  const along=(deg,W,H)=>{const a=deg*Math.PI/180,s=Math.sin(a),c=-Math.cos(a),L=W*s+Math.abs(H*c);return {L,p:(x,y)=>(x-W/2)*s+(y-H/2)*c+L/2};};
  function sideCut(W,H,b,pad,lead,min){
    const {L,p}=along(100,W,H);let B=p(b.l-pad-lead,b.t),E=p(b.r+pad,b.b);if(B<min)B=-1;if(L-E<min)E=L+1;
    return `linear-gradient(100deg,#0000 ${B.toFixed(1)}px,var(--p5g) ${(B+.5).toFixed(1)}px ${E.toFixed(1)}px,#0000 ${(E+.5).toFixed(1)}px)`;
  }
  function belowCut(W,H,b,pad){
    const {p}=along(176,W,H),Y=Math.min(p(b.l,b.t),p(b.r,b.t))-pad;
    return `linear-gradient(176deg,#0000 ${Y.toFixed(1)}px,var(--p5g) ${(Y+.5).toFixed(1)}px)`;
  }
  function patterned(){
    document.querySelectorAll('.mw-content h2:not(.mp-h),.infobox-image,.infobox-header,.mw-content .thumbinner,.mw-content figure,.mp-welcome').forEach((e,i)=>{
      if(!e.dataset.p5p){e.dataset.p5p='1';const h=hash((e.textContent||'').slice(0,40)+i+location.hash);
        e.style.setProperty('--p5pat',pattern(h%NP));e.style.setProperty('--p5py',(h>>>8)%101+'%');}
      const full=e.dataset.pat==='full',plain=e.dataset.cap==='plain',W=e.offsetWidth,H=e.offsetHeight,key=[gen,W,H,full,plain,e.textContent.length].join();
      if(e._p5k===key)return;e._p5k=key;
      const b=(!full||plain)&&boxOf(e,!full);
      if(full&&!b||full&&!plain)e.style.setProperty('--p5cut','none');
      else if(full)e.style.setProperty('--p5cut',belowCut(W,H,b,8));
      else if(!b)e.style.setProperty('--p5cut','linear-gradient(var(--p5g),var(--p5g))');
      else{const img=e.matches('.infobox-image,.thumbinner,figure'),head=e.matches('.infobox-header');
        e.style.setProperty('--p5cut',sideCut(W,H,b,img?5:14,head?26:0,img?6:9));}
    });
  }
  const remeasure=()=>{gen++;if(on()&&mo)queue();};
  const onLoad=e=>{if(e.target.tagName==='IMG'&&e.target.closest('[data-p5p]'))remeasure();};
  function decorate(){
    if(!on())return;
    patterned();
    liftDark();
    const lv=(sel,n)=>document.querySelectorAll(sel).forEach(e=>ransom(e,n));
    lv('#logo-name,.titlebar h1,.mp-w-t',2);
    lv('.mw-content h2:not(.mp-h),.mw-content>h2,.mp-h,.infobox-above,.side-h>:not(button),.grp>legend,.wi-h',1);
    lv('.mw-content h3,.mp-cols h3,.tcard b',0);
    lv('#side .menu-list:not(.tools-list) a,.side-h2',0);
    document.querySelectorAll('.side-h').forEach(e=>{if(!e.querySelector(':scope>:not(button)'))ransom(e,1);});
    document.querySelectorAll('#side .menu-list').forEach(stagger);
    document.querySelectorAll('.snap-area').forEach(e=>shape(e,16,'panel'+location.hash));
    document.querySelectorAll('.btn,.tabs a,.tabs .sel,.tabs .off,.tab-btn').forEach(e=>shape(e,4,'',1.3));
    document.querySelectorAll('.mp-box,.mp-welcome,.tcard,.mitem,.mw-content .thumb,.mw-content figure,.hatnote,.mw-content blockquote').forEach(e=>shape(e,6,'',.9));
    roughen(document.querySelectorAll('.mp-box,.tcard,.mitem'));
    document.querySelectorAll('.mw-content h2:not(.mp-h),.mw-content h3,.side-h,.infobox-above').forEach(e=>shape(e,5,'',.8));
    frames();
    // ярлык строки — отдельная плашка по размеру текста, иначе рядом с длинным значением она вытягивается на всю высоту строки
    document.querySelectorAll('.infobox>tbody>tr>th[scope=row]:not(.ib-l2)').forEach(th=>{if(th.querySelector(':scope>.p5tag')||th.closest('.ie-rich'))return;const s=document.createElement('span');s.className='p5tag';s.append(...th.childNodes);th.appendChild(s);});
    document.querySelectorAll('.infobox-header,.p5tag').forEach(e=>shape(e,3,'',.8));
    document.querySelectorAll('.infobox-image').forEach((e,i)=>shape(e,5,'im'+i+location.hash,.7));
    const v=$('#tools');if(v)shape(v,8,'tools');
  }

  /* ---------- фон ---------- */
  const starPts=(cx,cy,R0,r0,rot,n=5)=>{let s='';for(let i=0;i<n*2;i++){const a=rot+i*Math.PI/n,q=i%2?r0:R0;s+=`${(cx+q*Math.sin(a)).toFixed(1)},${(cy-q*Math.cos(a)).toFixed(1)} `;}return s;};
  function burst(R,cx,cy,size){let s='',rot=rr(R,-.3,.3);const n=9;
    for(let k=0;k<n;k++){const q=size*(1-k/n);rot+=rr(R,.02,.09);s+=`<polygon points="${starPts(cx,cy,q,q*.47,rot)}" fill="${k%2?'#cfcfcd':'#0a0a0a'}"/>`;}
    return s;}
  function background(seed){
    const R=rng(hash(seed));const W=1600,H=1000;let s='';
    s+=`<defs><linearGradient id="p5g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7c0010"/><stop offset=".55" stop-color="#c5001a"/><stop offset="1" stop-color="#6a000c"/></linearGradient>
      <pattern id="p5d" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(${rr(R,20,50).toFixed(0)})"><circle cx="7" cy="7" r="4.2" fill="#cfcfcd"/></pattern>
      <pattern id="p5c" width="150" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(90)"><rect width="150" height="5" fill="#000" opacity=".09"/></pattern></defs>`;
    s+=`<rect width="${W}" height="${H}" fill="url(#p5g)"/><rect width="${W}" height="${H}" fill="url(#p5c)"/>`;
    // широкая серая лента через весь экран и чёрная тень под ней
    const y0=rr(R,300,520),y1=rr(R,560,840),b=rr(R,90,170);
    s+=`<polygon points="-20,${(y0+36).toFixed(0)} ${W+20},${(y1+46).toFixed(0)} ${W+20},${(y1+b+78).toFixed(0)} -20,${(y0+b+40).toFixed(0)}" fill="#0a0a0a"/>`;
    s+=`<polygon points="-20,${y0.toFixed(0)} ${W*.52},${((y0+y1)/2+rr(R,-14,14)).toFixed(0)} ${W+20},${y1.toFixed(0)} ${W+20},${(y1+b).toFixed(0)} ${W*.46},${((y0+y1)/2+b+rr(R,-16,16)).toFixed(0)} -20,${(y0+b).toFixed(0)}" fill="#c9c6c0"/>`;
    // звезда из чёрных и белых контуров в углу
    s+=burst(R,rr(R,1270,1500),rr(R,60,220),rr(R,520,660));
    // чёрный клин снизу слева и полутон на нём
    const wx=rr(R,380,560);
    s+=`<polygon points="-10,${H+10} -10,${(H-rr(R,330,430)).toFixed(0)} ${(wx*.45).toFixed(0)},${(H-rr(R,240,300)).toFixed(0)} ${(wx*.3).toFixed(0)},${(H-rr(R,190,230)).toFixed(0)} ${wx.toFixed(0)},${H+10}" fill="#0a0a0a"/>`;
    const hx=rr(R,40,140),hy=H-rr(R,190,260);
    s+=`<polygon points="${hx},${hy} ${hx+rr(R,170,250)},${hy+rr(R,10,50)} ${hx+rr(R,120,200)},${hy+rr(R,130,170)} ${hx-rr(R,10,30)},${hy+rr(R,110,160)}" fill="url(#p5d)"/>`;
    // осколки и маленькие звёзды
    for(let i=0;i<16;i++){const x=rr(R,0,W),y=rr(R,0,H),q=rr(R,18,70),a=rr(R,0,6.3),c=pick(R,['#0a0a0a','#cfcfcd','#e60012','#0a0a0a']);
      s+=`<polygon points="${x.toFixed(0)},${y.toFixed(0)} ${(x+q*Math.cos(a)).toFixed(0)},${(y+q*Math.sin(a)).toFixed(0)} ${(x+q*.5*Math.cos(a+1.9)).toFixed(0)},${(y+q*.5*Math.sin(a+1.9)).toFixed(0)}" fill="${c}"/>`;}
    for(let i=0;i<9;i++){const x=rr(R,0,W),y=rr(R,0,H),q=rr(R,8,24);s+=`<polygon points="${starPts(x,y,q,q*.45,rr(R,0,1))}" fill="#0a0a0a" stroke="#cfcfcd" stroke-width="2"/>`;}
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${s}</svg>`;
  }
  function setBg(){let b=$('#p5-bg');if(!b){b=document.createElement('div');b.id='p5-bg';document.body.prepend(b);}
    const k=location.hash||'#/';if(b.dataset.k!==k){b.dataset.k=k;b.innerHTML=background(k);}}
  function wipe(){if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    const R=rng(hash(location.hash)),w=document.createElement('div');w.id='p5-wipe';w.setAttribute('aria-hidden','true');
    w.innerHTML=`<i style="--a:${rr(R,-14,14).toFixed(1)}deg"></i><b style="--a:${rr(R,-14,14).toFixed(1)}deg"></b>`;
    document.body.appendChild(w);setTimeout(()=>w.remove(),620);}

  /* ---------- включение ---------- */
  let mo=null,raf=0,wasOn=false;
  const queue=()=>{if(!raf)raf=requestAnimationFrame(()=>{raf=0;mo.takeRecords();decorate();mo.takeRecords();});};
  function loadFonts(){if($('#p5-fonts'))return;const l=document.createElement('link');l.id='p5-fonts';l.rel='stylesheet';l.href=FONT_URL;document.head.appendChild(l);}
  const onHash=()=>{if(on()){wipe();setBg();}};
  function sync(){
    const now=on();if(now===wasOn&&now===false)return;
    if(now){loadFonts();setBg();decorate();
      if(!mo){mo=new MutationObserver(queue);mo.observe(document.body,{childList:true,subtree:true,characterData:true});addEventListener('hashchange',onHash);addEventListener('resize',remeasure);document.addEventListener('load',onLoad,true);document.fonts.ready.then(remeasure);}
    }else if(mo){mo.disconnect();mo=null;removeEventListener('hashchange',onHash);removeEventListener('resize',remeasure);document.removeEventListener('load',onLoad,true);$('#p5-bg')?.remove();
      document.querySelectorAll('.p5w').forEach(w=>w.replaceWith(w.textContent));
      document.querySelectorAll('.p5tag').forEach(s=>s.replaceWith(...s.childNodes));
      document.querySelectorAll('[data-p5f]').forEach(e=>{delete e.dataset.p5f;delete e._p5f;e.style.removeProperty('--p5frame');});
      document.querySelectorAll('[data-p5r]').forEach(e=>delete e.dataset.p5r);
      document.querySelectorAll('[data-p5p]').forEach(e=>{delete e.dataset.p5p;delete e._p5k;['--p5pat','--p5py','--p5cut'].forEach(v=>e.style.removeProperty(v));});
      document.querySelectorAll('.p5lift').forEach(e=>e.classList.remove('p5lift'));
      document.querySelectorAll('[data-p5s]').forEach(e=>{delete e.dataset.p5s;['--p5c','--p5t','--p5x'].forEach(v=>e.style.removeProperty(v));});
      document.querySelectorAll('#side li').forEach(e=>{e.style.removeProperty('--p5m');e.style.removeProperty('--p5z');});}
    wasOn=now;
  }
  return {sync};
})();
