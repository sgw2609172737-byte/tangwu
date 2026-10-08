/* Rounded-rim displacement adapted from OpenDots (Atai Barkai) and
 * Shu Ding's liquid-glass (2025). MIT licenses in ./licenses/.
 * Generates bounded displacement maps, never reads/copies page pixels. */
(() => {
  'use strict';
  const ns='http://www.w3.org/2000/svg', maps=new Map();
  const smooth=(a,b,v)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};
  function map(w,h,radii) {
    const key=[w,h,...radii].join(':'); if(maps.has(key))return maps.get(key);
    const ratio=Math.min(1,512/Math.max(w,h)), cw=Math.max(1,Math.round(w*ratio)),ch=Math.max(1,Math.round(h*ratio));
    const canvas=document.createElement('canvas');canvas.width=cw;canvas.height=ch;
    const ctx=canvas.getContext('2d');if(!ctx)return null;
    const pixels=ctx.createImageData(cw,ch);
    for(let y=0;y<ch;y++)for(let x=0;x<cw;x++) {
      const px=((x+.5)/cw-.5)*w,py=((y+.5)/ch-.5)*h,corner=py<0?(px<0?0:1):(px<0?3:2);
      const r=Math.min(radii[corner],w/2,h/2),qx=Math.abs(px)-w/2+r,qy=Math.abs(py)-h/2+r;
      const edge=-(Math.min(Math.max(qx,qy),0)+Math.hypot(Math.max(qx,0),Math.max(qy,0))-r);
      const bend=edge>0?(1-smooth(0,Math.max(6,Math.min(r,18)),edge))*smooth(0,1.5,edge):0;
      let nx=Math.max(qx,0),ny=Math.max(qy,0),len=Math.hypot(nx,ny);
      if(len){nx/=len;ny/=len;}else{nx=qx>qy?1:0;ny=qx>qy?0:1;}
      const i=(y*cw+x)*4;
      pixels.data[i]=(0.5+Math.sign(px)*nx*bend*.5)*255;pixels.data[i+1]=(0.5+Math.sign(py)*ny*bend*.5)*255;
      pixels.data[i+2]=128;pixels.data[i+3]=255;
    }
    ctx.putImageData(pixels,0,0);const url=canvas.toDataURL();if(maps.size>=32)maps.delete(maps.keys().next().value);maps.set(key,url);return url;
  }
  function init() {
    if(!/Chrome|Chromium|Edg/.test(navigator.userAgent)||!window.ResizeObserver)return;
    const reduced=matchMedia('(prefers-reduced-transparency: reduce)'),contrast=matchMedia('(forced-colors: active)');
    const svg=document.createElementNS(ns,'svg');svg.classList.add('liquid-glass-filters');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');document.body.append(svg);
    const selector='.studio-glass,.command-panel,.home-launcher,.player-card,.controls,.controls-local,.log-panel,.modal-box,.glass-select-menu,.match-tools';
    const targets=new Map();let frame=0,serial=0;
    const visible=el=>el.isConnected&&el.offsetWidth&&el.offsetHeight&&(!el.hasAttribute('popover')||el.matches(':popover-open'));
    function detach(el){targets.get(el).filter.remove();targets.delete(el);resize.unobserve(el);delete el.dataset.liquidGlass;el.style.removeProperty('--glass-refraction');}
    function update(el) {
      const entry=targets.get(el),w=el.offsetWidth,h=el.offsetHeight,style=getComputedStyle(el);
      const radii=[style.borderTopLeftRadius,style.borderTopRightRadius,style.borderBottomRightRadius,style.borderBottomLeftRadius].map(v=>parseFloat(v)||0);
      const key=[w,h,...radii].join(':');if(entry.key===key)return;
      const data=map(w,h,radii);if(!data)return;
      const image=document.createElementNS(ns,'feImage');image.setAttribute('href',data);image.setAttribute('width',w);image.setAttribute('height',h);image.setAttribute('preserveAspectRatio','none');image.setAttribute('result','displacement');
      const displacement=document.createElementNS(ns,'feDisplacementMap');displacement.setAttribute('in','SourceGraphic');displacement.setAttribute('in2','displacement');displacement.setAttribute('scale','14');displacement.setAttribute('xChannelSelector','R');displacement.setAttribute('yChannelSelector','G');
      entry.filter.setAttribute('width',w+28);entry.filter.setAttribute('height',h+28);entry.filter.replaceChildren(image,displacement);entry.key=key;
      el.dataset.liquidGlass='true';el.style.setProperty('--glass-refraction',`url("#${entry.filter.id}")`);
    }
    function refresh(){frame=0;for(const el of targets.keys())if(!visible(el)||reduced.matches||contrast.matches)detach(el);
      if(reduced.matches||contrast.matches)return;
      for(const el of document.querySelectorAll(selector)) {
        if(!visible(el))continue;
        if(!targets.has(el)){const filter=document.createElementNS(ns,'filter');filter.id=`tangwu-glass-${serial++}`;filter.setAttribute('filterUnits','userSpaceOnUse');filter.setAttribute('color-interpolation-filters','sRGB');filter.setAttribute('x','-14');filter.setAttribute('y','-14');svg.append(filter);targets.set(el,{filter,key:''});resize.observe(el);}
        update(el);
      }
    }
    const schedule=()=>{if(!frame)frame=requestAnimationFrame(refresh);};
    const resize=new ResizeObserver(schedule),mutations=new MutationObserver(records=>{if(records.some(r=>!svg.contains(r.target)))schedule();});
    // Ignore style/data writes made by this engine: no self-triggering render loop.
    mutations.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','hidden','open']});
    document.addEventListener('toggle',schedule,true);reduced.addEventListener('change',schedule);contrast.addEventListener('change',schedule);refresh();
    window.addEventListener('pagehide',()=>{mutations.disconnect();resize.disconnect();cancelAnimationFrame(frame);},{once:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
