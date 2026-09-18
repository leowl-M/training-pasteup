"use strict";

/* =========================================================
   0. DOM HELPERS
   ========================================================= */
const $  = id => document.getElementById(id);
const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };

let _toastTimer;
function toast(msg){
  const t = $('toast');
  if(!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

/* =========================================================
   1. SEEDED RANDOMNESS
   ========================================================= */
function mulberry32(a){
  return function(){
    a|=0;a=a+0x6D2B79F5|0;
    let t=Math.imul(a^a>>>15,1|a);
    t=t+Math.imul(t^t>>>7,61|t)^t;
    return ((t^t>>>14)>>>0)/4294967296;
  };
}
class Rng{
  constructor(seed){this._=mulberry32(seed>>>0);}
  r(){return this._();}
  range(a,b){return a+this._()*(b-a);}
  int(a,b){return Math.floor(a+this._()*(b-a+1));}
  pick(a){return a[Math.floor(this._()*a.length)];}
  chance(p){return this._()<p;}
  sign(){return this._()<.5?-1:1;}
  /* soft bell curve: values cluster near the middle, extremes are rare */
  bell(){return (this._()+this._()+this._())/3*2-1;}
  weighted(pairs){ // [[value,weight],...]
    let t=0;for(const p of pairs)t+=p[1];
    let x=this._()*t;
    for(const p of pairs){x-=p[1];if(x<=0)return p[0];}
    return pairs[pairs.length-1][0];
  }
}
const SEED_MAX = 2147483646;
function createSeed(){return Math.floor(Math.random()*0xFFFFFF);}
function subSeed(){return Math.floor(Math.random()*SEED_MAX);}
function hashStr(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}

/* =========================================================
   2. COLOUR HELPERS
   ========================================================= */
function hexToRgb(h){h=h.replace('#','');if(h.length===3)h=h.split('').map(c=>c+c).join('');
  return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];}
function rgbToHex(r,g,b){return '#'+[r,g,b].map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');}
function rgbToHsl(r,g,b){
  r/=255;g/=255;b/=255;
  const mx=Math.max(r,g,b),mn=Math.min(r,g,b);let h=0,s=0;const l=(mx+mn)/2;
  if(mx!==mn){const d=mx-mn;s=l>.5?d/(2-mx-mn):d/(mx+mn);
    h=mx===r?(g-b)/d+(g<b?6:0):mx===g?(b-r)/d+2:(r-g)/d+4;h/=6;}
  return [h*360,s,l];
}
function hslToHex(h,s,l){
  h=((h%360)+360)%360/360;s=Math.max(0,Math.min(1,s));l=Math.max(0,Math.min(1,l));
  const q=l<.5?l*(1+s):l+s-l*s,p=2*l-q;
  const f=t=>{t=(t+1)%1;
    if(t<1/6)return p+(q-p)*6*t;
    if(t<1/2)return q;
    if(t<2/3)return p+(q-p)*(2/3-t)*6;
    return p;};
  return rgbToHex(f(h+1/3)*255,f(h)*255,f(h-1/3)*255);
}
function tweak(hex,dh,ds,dl){const[h,s,l]=rgbToHsl(...hexToRgb(hex));return hslToHex(h+dh,s*ds,l+dl);}
function lum(hex){const[r,g,b]=hexToRgb(hex).map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4);});
  return .2126*r+.7152*g+.0722*b;}
function mix(a,b,t){const A=hexToRgb(a),B=hexToRgb(b);return rgbToHex(A[0]+(B[0]-A[0])*t,A[1]+(B[1]-A[1])*t,A[2]+(B[2]-A[2])*t);}
function isValidHex(str){return /^#[0-9a-fA-F]{6}$/.test(str);}

/* =========================================================
   3. TYPE POOL — grouped by voice, always with a system fallback
   ========================================================= */
const FONTS = [
  // heavy display
  {f:'"Anton", Impact, "Arial Narrow", sans-serif',w:400,g:'display'},
  {f:'"Archivo Black","Arial Black",sans-serif',w:400,g:'display'},
  {f:'"Alfa Slab One", Rockwell, Georgia, serif',w:400,g:'display'},
  {f:'"Ultra", Georgia, serif',w:400,g:'display'},
  {f:'"Passion One", Impact, sans-serif',w:900,g:'display'},
  {f:'"Bungee", Impact, sans-serif',w:400,g:'display'},
  {f:'"Rubik Mono One", "Courier New", monospace',w:400,g:'display'},
  {f:'Impact, "Arial Black", sans-serif',w:400,g:'display'},
  {f:'"Arial Black", Impact, sans-serif',w:900,g:'display'},
  // condensed
  {f:'"Bebas Neue", "Arial Narrow", sans-serif',w:400,g:'condensed'},
  {f:'"Oswald", "Arial Narrow", sans-serif',w:700,g:'condensed'},
  {f:'"Fjalla One", "Arial Narrow", sans-serif',w:400,g:'condensed'},
  {f:'"Staatliches", "Arial Narrow", sans-serif',w:400,g:'condensed'},
  {f:'"Archivo Narrow", "Arial Narrow", sans-serif',w:700,g:'condensed'},
  // editorial serif
  {f:'"Playfair Display", Georgia, serif',w:900,g:'serif'},
  {f:'"Bodoni Moda", "Didot", Georgia, serif',w:900,g:'serif'},
  {f:'"DM Serif Display", Georgia, serif',w:400,g:'serif'},
  {f:'"Abril Fatface", Georgia, serif',w:400,g:'serif'},
  {f:'"Instrument Serif", Georgia, serif',w:400,g:'serif'},
  {f:'Georgia, "Times New Roman", serif',w:700,g:'serif'},
  {f:'"Times New Roman", Times, serif',w:700,g:'serif'},
  {f:'Palatino, "Palatino Linotype", Georgia, serif',w:700,g:'serif'},
  // typewriter / mono
  {f:'"Special Elite", "Courier New", monospace',w:400,g:'mono'},
  {f:'"Courier Prime", "Courier New", monospace',w:700,g:'mono'},
  {f:'"Space Mono", "Courier New", monospace',w:700,g:'mono'},
  {f:'"Courier New", Courier, monospace',w:700,g:'mono'},
  // grotesk
  {f:'"Archivo", Helvetica, Arial, sans-serif',w:800,g:'grotesk'},
  {f:'Helvetica, Arial, sans-serif',w:700,g:'grotesk'},
  {f:'"Trebuchet MS", Verdana, sans-serif',w:700,g:'grotesk'},
  {f:'Verdana, Geneva, sans-serif',w:700,g:'grotesk'}
];
const BY_GROUP = FONTS.reduce((m,f)=>((m[f.g]=m[f.g]||[]).push(f),m),{});
const GROUP_LABELS = {display:'Display pesanti', condensed:'Condensati', serif:'Serif editoriali', mono:'Macchina da scrivere', grotesk:'Grotesche'};

/* Picks a face from the user's selection. Always draws twice from the stream
   (group, then face) so enabling/disabling a font never shifts the rest of
   the composition. */
function pickFont(rng, groups){
  const gsel = rng.pick(groups);
  const active = FONTS.filter((f,i)=>state.fonts[i]);
  const pool = active.length ? (active.filter(f=>f.g===gsel).length ? active.filter(f=>f.g===gsel) : active)
                             : BY_GROUP[gsel];
  return rng.pick(pool);
}

/* =========================================================
   4. MATERIAL PRESETS — a cut gets a preset first, variations second
   ========================================================= */
const MATERIALS = {
  newspaper:{
    label:'giornale', groups:['serif','mono','condensed'], weight:16,
    stocks:[['newsprint',6],['neutral',2],['brand',1]],
    sat:.34, screen:[.30,.58], paperDots:[.05,.12], grain:[.55,.85],
    pad:[.025,.095], ink:'dark', bleed:.5, fiber:.9, edge:[.10,.20], crisp:.55
  },
  magazine:{
    label:'patinata', groups:['display','grotesk','condensed','serif'], weight:26,
    stocks:[['brand',3],['bright',4],['neutral',3]],
    sat:1.05, screen:[.10,.32], paperDots:[0,.06], grain:[.12,.3],
    pad:[.02,.10], ink:'auto', bleed:.18, fiber:.15, edge:[.05,.12], crisp:.9
  },
  xerox:{
    label:'fotocopia', groups:['display','condensed','mono'], weight:14,
    stocks:[['xerox',7],['dark',2],['brand',1]],
    sat:.06, screen:[.35,.6], paperDots:[.03,.09], grain:[.8,1.25],
    pad:[.02,.085], ink:'hard', bleed:.7, fiber:.4, edge:[.12,.24], crisp:.35
  },
  fashion:{
    label:'couché', groups:['serif','display'], weight:18,
    stocks:[['brand',3],['bright',4],['dark',3]],
    sat:.95, screen:[.05,.18], paperDots:[0,.04], grain:[.08,.22],
    pad:[.07,.21], ink:'auto', bleed:.1, fiber:.1, edge:[.04,.10], crisp:1
  },
  tabloid:{
    label:'tabloid', groups:['condensed','display'], weight:26,
    stocks:[['brand',5],['accent',2],['neutral',2],['dark',1]],
    sat:1.25, screen:[.22,.48], paperDots:[.04,.11], grain:[.35,.6],
    pad:[.012,.07], ink:'auto', bleed:.35, fiber:.35, edge:[.08,.18], crisp:.7
  }
};
const MAT_KEYS = Object.keys(MATERIALS);
const MAT_WEIGHTS = MAT_KEYS.map(k=>[k,MATERIALS[k].weight]);

const STOCKS = {
  newsprint:['#d9d2c2','#cfc8b6','#e1dbcb','#c8c1af'],
  neutral:['#e9e3d5','#ded7c7','#f1ece0','#d2ccbd','#efe7d3'],
  bright:['#f7f5f0','#ffffff','#f4f1e8','#fbf9f4'],
  xerox:['#f4f3ef','#e8e7e2','#fbfaf7'],
  dark:['#141317','#1d1b20','#0f0e11','#221f24']
};

/* fix B12 — SURFACES declared before the first function that reads it */
const SURFACES = {
  black:   {base:'#131215', hi:'#1f1d22', vig:.55, fib:'#ffffff', fibA:.035},
  offwhite:{base:'#e7e1d3', hi:'#f3eee2', vig:.20, fib:'#6a5c47', fibA:.08},
  grey:    {base:'#bdb7ab', hi:'#cdc7ba', vig:.26, fib:'#5b5348', fibA:.09}
};

/* =========================================================
   5. STATE
   ========================================================= */
const SLIDERS = [
  {id:'chaos',      label:'Disordine',              v:55},
  {id:'sizeVar',    label:'Variazione di corpo',    v:45},
  {id:'rotation',   label:'Rotazione',              v:50},
  {id:'aging',      label:'Invecchiamento carta',   v:40},
  {id:'print',      label:'Imperfezione di stampa', v:52},
  {id:'spacing',    label:'Spaziatura',             v:45},
  {id:'leading',    label:'Interlinea',             v:46},
  {id:'shadow',     label:'Profondità ombra',       v:58},
  {id:'intensity',  label:'Intensità colore',       v:66}
];
const MAX_TEXT = 160;      // hard cap, mirrors the textarea maxlength (fix B4)
const MAX_EXPORT_PX = 16e6; // Safari's canvas area ceiling (fix B1)
const EXPORT_BASE = 1024;   // export size is independent of the window (fix B1)

const state = {
  text:'NEW RANSOM\nCUT-OUTS',
  brand:'WOOZY',
  seed:createSeed(),
  format:1,
  surface:'black',
  palette:['#e0392b','#6e9cc4','#e8873a','#f3d42f'],
  ink:'colour', flat:false, transparent:false,
  layout:'collage',            // 'collage' | 'grid'
  anim:'none',                 // 'none' | 'jitter' | 'boil' | 'wave' | 'paste'
  animFps:8, animAmt:.5,
  fonts:FONTS.map(()=>true),   // which faces the cutter is allowed to use
  s:Object.fromEntries(SLIDERS.map(s=>[s.id,s.v/100])),
  cuts:[], fontsReady:false,
  cutSeeds:{},   // key -> pinned seed (re-roll or lock)
  cutLocks:{}    // key -> true
};
const PAD = 30;           // shadow + backing-card breathing room baked into every cut canvas
const REF = 100;          // metrics reference size

/* =========================================================
   6. MEASURING
   ========================================================= */
const mc = document.createElement('canvas').getContext('2d');
const metricCache = new Map();
function metrics(str,font){
  const key = font.w+'|'+font.f+'|'+str;
  let m = metricCache.get(key);
  if(m) return m;
  mc.font = font.w+' '+REF+'px '+font.f;
  const t = mc.measureText(str);
  const left  = t.actualBoundingBoxLeft  !== undefined ? t.actualBoundingBoxLeft  : 0;
  const right = t.actualBoundingBoxRight !== undefined ? t.actualBoundingBoxRight : t.width;
  const asc   = t.actualBoundingBoxAscent  || REF*.72;
  const desc  = Math.max(0, t.actualBoundingBoxDescent || 0);
  m = {w:(left+right)/REF||t.width/REF, left:left/REF, asc:asc/REF, desc:desc/REF};
  metricCache.set(key,m);
  return m;
}

/* =========================================================
   7. STYLE GENERATION — one cut = one fragment of printed matter
   ========================================================= */
function paletteFor(kind,rng,intensity){
  if(kind==='brand'||kind==='accent'){
    const base = rng.pick(state.palette);
    const [h,s,l] = rgbToHsl(...hexToRgb(base));
    const boost = .55 + intensity*.75;
    if(kind==='accent') return hslToHex(h + rng.range(-16,16), Math.min(1,s*boost*1.05), Math.min(.82,Math.max(.22,l+rng.range(-.12,.12))));
    return hslToHex(h + rng.range(-7,7), Math.min(1,s*boost), Math.max(.18,Math.min(.8,l+rng.range(-.08,.08))));
  }
  return rng.pick(STOCKS[kind]);
}

/* black & white conversion — stocks become distinct paper greys, ink goes hard */
const GREYS=[1,.955,.90,.83,.72,.58,.20,.11,.055];
function toGrey(hex,shift){
  let L=lum(hex);
  L=Math.max(0,Math.min(1,(L-.5)*1.18+.5+(shift||0)));
  let best=GREYS[0],d=9;
  for(const g of GREYS){const k=Math.abs(g-L);if(k<d){d=k;best=g;}}
  return hslToHex(0,0,best);
}
function monoize(c){
  if(state.ink==='pure'){
    // two inks only, no halfway house
    // intensity now steers how many tiles come out light (matters a lot in grid mode)
    const white = (c.fiberSeed%100) < (88 - state.s.intensity*72);
    c.paper = white ? '#ffffff' : '#000000';
    c.ink   = white ? '#000000' : '#ffffff';
    if(c.backing) c.backing.color = white ? '#000000' : '#ffffff';
    c.stroke = null; c.ghost = null;
    return c;
  }
  c.paper=toGrey(c.paper);
  const pale=lum(c.paper)>.45;
  c.ink = pale ? '#0b0a0c' : '#f8f7f4';
  if(c.stroke) c.stroke.c = pale ? '#f8f7f4' : '#0b0a0c';
  if(c.ghost)  c.ghost.c  = c.ink;
  if(c.backing) c.backing.color = toGrey(c.backing.color, pale? -.30 : .34);
  return c;
}

/* shapes only: the cut silhouette and the letterform, nothing else */
const isFlat = () => state.flat || state.ink==='pure';
function flatten(c){
  c.grain=0; c.fiber=0; c.screen=0; c.erode=0; c.blur=0; c.ghost=null;
  c.paperDots.a=0; c.papLight=0; c.papDark=0; c.lift=0; c.inkAlpha=1;
  c.edge = state.ink==='pure' ? 0 : c.edge*0.35;
  return c;
}

/* ---- geometric mode: a cut becomes a square tile with a knocked-out letter ---- */
const SQUARE = [[0,0],[1,0],[1,1],[0,1]];
const TILE_STEPS = [1,1,1,1,1,0.78,1.28];   // occasional taller/shorter tile
function geometrize(c){
  c.poly    = SQUARE;
  c.backing = null;
  c.skew    = 0;
  c.scaleX  = 1;
  c.padL=c.padR=c.padT=c.padB=0;
  c.lift    = 0;
  c.edge    = 0;
  c.stroke  = null;
  // tile sizes quantise: at sizeVar 0 every tile is identical
  const step = TILE_STEPS[c.fiberSeed % TILE_STEPS.length];
  c.sizeMul = 1 + (step-1)*state.s.sizeVar;
  return c;
}
const isGrid = () => state.layout==='grid';

/* the board colour once ink mode has had its say */
function boardBase(){
  if(state.ink==='pure') return state.surface==='black' ? '#000000' : '#ffffff';
  const b=SURFACES[state.surface].base;
  return state.ink==='grey' ? toGrey(b) : b;
}

function pickInk(mat,paper,rng,intensity){
  const L = lum(paper);
  const dark  = ['#14121a','#1a1713','#100f12','#231d1a'];
  const light = ['#f6f2e6','#fffdf6','#ece5d2','#f2ece0'];
  if(mat.ink==='dark')  return L>.4 ? rng.pick(dark) : rng.pick(light);
  if(mat.ink==='hard')  return L>.45 ? '#0c0b0e' : '#f8f7f3';
  // auto: sometimes brand-coloured ink on pale stock
  if(L>.55 && rng.chance(.34)){
    const c = paletteFor(rng.chance(.7)?'brand':'accent',rng,intensity);
    return lum(c) < L-.28 ? c : tweak(c,0,1.05,-.18);
  }
  if(L<.30 && rng.chance(.3)){
    const c = paletteFor('brand',rng,intensity);
    return lum(c) > L+.3 ? c : tweak(c,0,1,.25);
  }
  return L>.42 ? rng.pick(dark) : rng.pick(light);
}

/* hand-cut silhouette: mostly straight edges, tiny wobble, the odd nick */
function createCutoutShape(rng){
  const pts=[];
  const corners=[[0,0],[1,0],[1,1],[0,1]];
  for(let s=0;s<4;s++){
    const a=corners[s], b=corners[(s+1)%4];
    const n=rng.int(3,5);
    const horiz = s===0||s===2;
    for(let i=0;i<n;i++){
      const t=i/n;
      let x=a[0]+(b[0]-a[0])*t, y=a[1]+(b[1]-a[1])*t;
      let j=rng.bell()*0.023;
      if(rng.chance(.12)) j += rng.sign()*rng.range(.022,.05); // scissor nick
      if(horiz) y += (s===0? j : -j); else x += (s===1? -j : j);
      // corners drift a touch more
      if(i===0){ x+= rng.bell()*.012; y+= rng.bell()*.012; }
      pts.push([x,y]);
    }
  }
  return pts;
}

function createCharacterStyle(str,rng,ctxOpts){
  const matKey = ctxOpts.material;
  const mat = MATERIALS[matKey];
  const S = state.s;
  const groups = mat.groups;
  const font = pickFont(rng, groups);
  const m = metrics(str,font);

  const stockKind = rng.weighted(mat.stocks);
  let paper = paletteFor(stockKind,rng,S.intensity);
  // aging pushes paper warm + dull
  const age = S.aging;
  if(lum(paper)>.25) paper = tweak(paper, -2*age, 1-.16*age, -.05*age);
  // global saturation direction per material
  paper = tweak(paper,0,mat.sat*(.7+S.intensity*.55),0);

  const ink = pickInk(mat,paper,rng,S.intensity);

  let sizeMul = 1 + rng.bell()*(.10+S.sizeVar*.34);
  if(ctxOpts.block) sizeMul *= rng.range(.42,.62);  // a small clipping, not a headline
  if(rng.chance(.16+S.sizeVar*.12)) sizeMul *= rng.range(1.14,1.42);   // a headline letter
  else if(rng.chance(.14)) sizeMul *= rng.range(.70,.86);              // a body-copy letter
  const scaleX  = 1 + rng.bell()*(.05+S.chaos*.13);
  const padBase = rng.range(mat.pad[0],mat.pad[1]);

  const pr = S.print;
  const dotsA = rng.range(mat.paperDots[0],mat.paperDots[1])*(.6+pr*.9);
  const screen = rng.range(mat.screen[0],mat.screen[1])*(.45+pr*1.0);

  // asymmetric margins; now and then the scissors bite into the glyph itself
  const pads = {
    padL: padBase*rng.range(.6,1.6), padR: padBase*rng.range(.6,1.6),
    padT: padBase*rng.range(.45,1.4), padB: padBase*rng.range(.45,1.4)
  };
  if(rng.chance(.22)){
    const side = rng.pick(['padL','padR','padT','padB']);
    pads[side] = -rng.range(.008,.045);
  }

  // one cut in six is pasted onto a second, larger card
  const backing = rng.chance(.17)
    ? (()=>{ const bc = rng.chance(.55) ? paletteFor(rng.chance(.6)?'brand':'accent',rng,S.intensity)
                                       : (lum(paper)>.45 ? '#16141a' : rng.pick(STOCKS.neutral));
             return {color:bc, grow:rng.range(.06,.17), dx:rng.bell()*.05, dy:rng.bell()*.05,
                     rot:rng.bell()*.07, poly:createCutoutShape(rng)}; })()
    : null;

  const style = {
    text:str, material:matKey, font, metric:m,
    paper, ink, stockKind, backing,
    sizeMul, scaleX,
    skew: rng.bell()*(1.2+S.chaos*1.6)*Math.PI/180,
    rot:  0, // filled by layout
    padL:pads.padL, padR:pads.padR, padT:pads.padT, padB:pads.padB,
    poly: createCutoutShape(rng),
    // print behaviour
    inkAlpha: 1 - rng.range(0,.10)*pr*(mat.crisp<.6?1.4:.6),
    blur: rng.chance(.45)? rng.range(.05,.42)*pr*(1.4-mat.crisp) : 0,
    ghost: rng.chance(.34*pr+.06)
      ? {dx:rng.bell()*1.9*(1+pr), dy:rng.bell()*1.6*(1+pr), a:rng.range(.10,.34)*pr+.05,
         c: rng.chance(.4)? paletteFor('accent',rng,S.intensity) : ink}
      : null,
    screen: rng.chance(.55)? screen : screen*.25,
    screenSp: rng.range(3.2,6.4),
    screenAng: rng.range(0,Math.PI),
    paperDots:{a:dotsA, sp:rng.range(3.4,7), ang:rng.range(0,Math.PI)},
    erode: rng.range(0,1)*pr*(mat.bleed+.25),
    grain: rng.range(mat.grain[0],mat.grain[1])*(.45+S.aging*.75+pr*.25),
    fiber: mat.fiber*(.5+S.aging),
    edge: rng.range(mat.edge[0],mat.edge[1])*(.6+S.aging*.9),
    lift: rng.range(0,1)<.45 ? rng.range(.05,.16)*(.4+S.shadow) : 0,
    liftSide: rng.int(0,3),
    papLight: rng.range(.02,.10),
    papDark: rng.range(.03,.12)*(.5+S.aging),
    stroke: rng.chance(.13)
      ? {c: lum(ink)>.5 ? '#141218' : (rng.chance(.5)? '#f6f1e4' : paletteFor('brand',rng,S.intensity)),
         w: rng.range(.035,.085), inline: rng.chance(.35)}
      : null,
    sh:{a:0,b:0,x:0,y:0},
    fiberSeed: rng.int(0,99999)
  };
  let out = style;
  if(state.ink!=='colour') out = monoize(out);
  if(isFlat()) out = flatten(out);
  if(isGrid()) out = geometrize(out);
  return out;
}

/* =========================================================
   8. BUILDING THE COMPOSITION
   ========================================================= */
function cutKey(li,wi,ci){ return li+'.'+wi+'.'+ci; }

function buildCuts(){
  const rng = new Rng(state.seed ^ hashStr(state.text));
  const S = state.s;
  const lines = state.text.slice(0,MAX_TEXT).replace(/\r/g,'').split('\n');
  const out = [];
  let wordIndex = 0;

  lines.forEach((line,li)=>{
    const words = line.split(/\s+/).filter(Boolean);
    words.forEach(word=>{
      // a word can occasionally be one single cut — a whole word clipped from a headline
      const material = rng.weighted(MAT_WEIGHTS);
      const asBlock = word.length<=4 && word.length>1 && rng.chance(.13);
      const wi = wordIndex++;
      const tiltR = rng.bell(), scaleR = rng.bell();   // always drawn, so the stream is stable
      const group = {index:wi, line:li, cuts:[], material,
                     tilt:  isGrid()? 0 : tiltR*(2.2+S.chaos*5.5)*Math.PI/180,
                     scale: isGrid()? 1 : 1 + scaleR*(.04+S.sizeVar*.12)};

      // every cut is generated from its OWN sub-stream: one cut can be re-rolled
      // or locked without shifting the randomness of any other cut
      const make = (str,mk,ci,block)=>{
        const key = cutKey(li,wi,ci);
        const drawn = rng.int(0,SEED_MAX);                       // always consumed
        const pinned = state.cutSeeds[key];
        const seed = pinned !== undefined ? pinned : drawn;
        const c = createCharacterStyle(str, new Rng(seed), {material:mk, block});
        c.key = key; c.seedUsed = seed; c.locked = !!state.cutLocks[key];
        c.group = group; group.cuts.push(c); out.push(c);
      };

      if(asBlock){
        make(word, material, 0, true);
      }else{
        let ci = 0;
        for(let ch of word){
          // 70% of a word shares its stock source, the rest is cut from elsewhere
          const mk = rng.chance(.7)? material : rng.weighted(MAT_WEIGHTS);
          // no cutter finds the case they wanted — flip a few
          if(rng.chance(.05+S.chaos*.11)){
            const alt = ch===ch.toUpperCase()? ch.toLowerCase() : ch.toUpperCase();
            if(alt!==ch) ch=alt;
          }
          make(ch, mk, ci++, false);
        }
      }
    });
    if(li<lines.length-1) out.push({br:true,line:li});
  });

  // per-cut randomness that layout needs — same sub-stream trick
  const r2 = new Rng((state.seed*7919 ^ hashStr(state.text))>>>0);
  out.forEach(c=>{
    if(c.br) return;
    const drawn = r2.int(0,SEED_MAX);
    const pinned = state.cutSeeds[c.key];
    const q = new Rng(pinned !== undefined ? ((pinned ^ 0x9E3779B9)>>>0) : drawn);
    const rb = q.bell(), kick = q.chance(.09)? q.sign()*q.range(4,7) : 0;
    const dy = q.bell(), ov1 = q.range(.02,.09), ov2 = q.range(0,.09), ge = q.range(-.05,.035);
    if(isGrid()){
      // a grid has no wobble: tiles sit flat and butt together
      c.rotBase = 0;
      c.dyF = 0;
      c.overlap = 1;
      c.gapExtra = S.spacing*.14;
    }else{
      c.rotBase = rb*(4+S.rotation*9)*Math.PI/180 + kick*Math.PI/180;
      c.dyF = dy*(.03+S.chaos*.19);
      c.overlap = 1 - ov1 - S.chaos*ov2 + S.spacing*.06;
      c.gapExtra = ge + S.spacing*.09;
    }
  });
  return out;
}

/* ---- pure geometry: no drawing, so the fit loop is cheap ---- */
function sizeOf(c,F){
  if(isGrid()){
    const side = F*c.sizeMul;
    return {fs:side, w:side, h:side};      // a tile is square by definition
  }
  const fs = F*c.sizeMul*(c.group?c.group.scale:1);
  const w = (c.metric.w*c.scaleX + c.padL + c.padR)*fs;
  const h = (c.metric.asc + c.metric.desc + c.padT + c.padB)*fs;
  return {fs,w,h};
}

function LEAD(){ return 0.50 + state.s.leading*0.95; }
const GLYPH_FILL = 0.62;   // cap height as a share of the tile side, in grid mode

function layout(cuts,F,availW,availH){
  const S = state.s;
  const wordGap = isGrid()? F*(0.05 + S.spacing*0.5) : F*(0.20 + S.spacing*0.34);
  const lines=[]; let cur=[]; let curW=0; let lastGroup=-1;

  const flush=()=>{ if(cur.length){lines.push(cur);} cur=[]; curW=0; lastGroup=-1; };

  for(const c of cuts){
    if(c.br){ flush(); continue; }
    if(c.group.index!==lastGroup){
      // measure the whole word before committing it to this line
      const word = c.group.cuts;
      let wW=0;
      word.forEach((k,i)=>{
        const s=sizeOf(k,F);
        wW += (i===word.length-1)? s.w : s.w*k.overlap + F*k.gapExtra;
      });
      if(cur.length && curW + wordGap + wW > availW){ flush(); }
      if(cur.length) curW += wordGap;
      c.group._x = curW;
      curW += wW;
      lastGroup = c.group.index;
      cur.push(c.group);
    }
  }
  flush();

  // vertical rhythm
  const lineData = lines.map(groups=>{
    let maxH=0,w=0;
    groups.forEach((g,i)=>{
      let gw=0;
      g.cuts.forEach((k,j)=>{
        const s=sizeOf(k,F);
        maxH=Math.max(maxH,s.h);
        gw += (j===g.cuts.length-1)? s.w : s.w*k.overlap + F*k.gapExtra;
      });
      g._w=gw;
      w += gw + (i? wordGap:0);
    });
    return {groups,maxH,w};
  });

  const leadFactor = LEAD();
  let totalH = 0;
  lineData.forEach((l,i)=> totalH += (i? l.maxH*leadFactor : l.maxH));
  const maxLineW = lineData.reduce((m,l)=>Math.max(m,l.w),0);

  return {lineData,totalH,maxLineW,wordGap};
}

function placeCuts(cuts,F,availW,availH,offX,offY){
  const L = layout(cuts,F,availW,availH);
  let y = offY + (availH - L.totalH)/2;
  L.lineData.forEach((l,li)=>{
    if(li) y += l.maxH*LEAD();
    let x = offX + (availW - l.w)/2;
    l.groups.forEach((g,gi)=>{
      if(gi) x += L.wordGap;
      const startX = x;
      g.cuts.forEach((k,j)=>{
        const s = sizeOf(k,F);
        k.fs = s.fs; k.w = s.w; k.h = s.h;
        const dx = x - startX;
        k.x = x;
        k.y = y + (l.maxH - s.h)/2 + k.dyF*F + Math.tan(g.tilt)*dx;
        k.rot = isGrid()? 0 : k.rotBase + g.tilt*0.75;
        // where the glyph sits inside its own cut — the one place that knows
        if(isGrid()){
          const gfs = s.w*GLYPH_FILL/Math.max(.1,k.metric.asc);
          k.glyphFs = gfs;
          k.glyphX  = (s.w - k.metric.w*gfs)/2;      // optically centred in the tile
          k.glyphY  = (s.h + k.metric.asc*gfs)/2;
        }else{
          k.glyphFs = s.fs;
          k.glyphX  = k.padL*s.fs;
          k.glyphY  = (k.padT + k.metric.asc)*s.fs;
        }
        // depth
        // butted tiles turn a full shadow into dark seams, so the grid damps it
        const d = state.ink==='pure' ? 0 : state.s.shadow*(isGrid()? .35 : 1);
        k.sh = {a:(.10+d*.42)*(1+(k.lift>0?.35:0)), b:(3+d*16), x:(1+d*4)*Math.cos(k.rot+.6), y:(2+d*7)};
        x += (j===g.cuts.length-1)? s.w : s.w*k.overlap + F*k.gapExtra;
      });
    });
  });
  return L;
}

/* real bounds, rotation and skew included, so nothing ever runs off the board */
function bboxOf(cuts){
  let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9,any=false;
  for(const c of cuts){
    if(c.br) continue;
    any=true;
    const cx=c.x+c.w/2, cy=c.y+c.h/2, t=Math.tan(c.skew);
    const co=Math.cos(c.rot), si=Math.sin(c.rot);
    for(const sx of [-1,1]) for(const sy of [-1,1]){
      const lx=sx*c.w/2, ly=sy*c.h/2;
      const kx=lx+t*ly, ky=ly;
      const px=cx+kx*co-ky*si, py=cy+kx*si+ky*co;
      x0=Math.min(x0,px);x1=Math.max(x1,px);
      y0=Math.min(y0,py);y1=Math.max(y1,py);
    }
  }
  if(!any) return {x:0,y:0,w:0,h:0};
  return {x:x0,y:y0,w:x1-x0,h:y1-y0};
}

function fitAndPlace(cuts,boxW,boxH){
  const availW = boxW*0.84, availH = boxH*0.80;
  let F = Math.min(availH*0.7, availW*0.5);
  let L = layout(cuts,F,availW,availH);
  let guard=0;
  while(guard++<120 && (L.maxLineW>availW || L.totalH>availH)){
    const k = Math.min(availW/Math.max(1,L.maxLineW), availH/Math.max(1,L.totalH));
    F = F*Math.max(.55,Math.min(.97,k*0.99));
    if(F<8) break;
    L = layout(cuts,F,availW,availH);
  }
  // grow back if there's slack
  guard=0;
  while(guard++<40){
    const test = F*1.05;
    const T = layout(cuts,test,availW,availH);
    if(T.maxLineW<=availW && T.totalH<=availH){F=test;}
    else break;
  }
  // place, then verify the true rotated bounds and shrink if anything pokes out
  let tries=0, bb;
  do{
    placeCuts(cuts,F,availW,availH,(boxW-availW)/2,(boxH-availH)/2);
    bb = bboxOf(cuts);
    const k = Math.min(boxW*0.93/Math.max(1,bb.w), boxH*0.90/Math.max(1,bb.h), 1);
    if(k>0.99) break;
    F *= Math.max(.6,k);
  }while(tries++<5);

  // optical centring on the real silhouette
  const dx=(boxW-bb.w)/2-bb.x, dy=(boxH-bb.h)/2-bb.y;
  for(const c of cuts){ if(!c.br){ c.x+=dx; c.y+=dy; } }
  return F;
}

/* =========================================================
   9. TEXTURE PRIMITIVES
   ========================================================= */
const patternCache = new Map();
const PATTERN_CACHE_MAX = 400;   // fix B6 — the key space is effectively unbounded
function dotPattern(ctx,sp,r,color){
  const key = sp.toFixed(2)+'|'+r.toFixed(2)+'|'+color;
  let p = patternCache.get(key);
  if(p) return p;
  const t = document.createElement('canvas');
  const size = Math.max(2,Math.round(sp));
  t.width=t.height=size;
  const tc=t.getContext('2d');
  tc.fillStyle=color;tc.beginPath();tc.arc(size/2,size/2,Math.max(.4,r),0,6.2832);tc.fill();
  p = ctx.createPattern(t,'repeat');
  if(patternCache.size >= PATTERN_CACHE_MAX) patternCache.clear();
  patternCache.set(key,p);
  return p;
}
function paintDots(ctx,x,y,w,h,{sp,r,color,alpha,angle,comp}){
  if(alpha<=0.004) return;
  const d = Math.hypot(w,h)*1.2;
  ctx.save();
  ctx.globalAlpha = alpha;
  if(comp) ctx.globalCompositeOperation = comp;
  ctx.translate(x+w/2,y+h/2);
  ctx.rotate(angle);
  ctx.fillStyle = dotPattern(ctx,sp,r,color);
  ctx.fillRect(-d/2,-d/2,d,d);
  ctx.restore();
}
let grainTile=null;
function grainPattern(ctx){
  if(!grainTile){
    const t=document.createElement('canvas');t.width=t.height=140;
    const tc=t.getContext('2d');const im=tc.createImageData(140,140);
    for(let i=0;i<im.data.length;i+=4){
      const v=Math.random();
      const g=v<.5? 0:255;
      im.data[i]=im.data[i+1]=im.data[i+2]=g;
      im.data[i+3]=Math.random()*90;
    }
    tc.putImageData(im,0,0);
    grainTile=t;
  }
  return ctx.createPattern(grainTile,'repeat');
}
function paintGrain(ctx,x,y,w,h,amount,s){
  if(amount<=.02) return;
  ctx.save();
  ctx.globalAlpha=Math.min(.42,amount*.24);
  ctx.globalCompositeOperation='overlay';
  const p=grainPattern(ctx);
  try{ p.setTransform(new DOMMatrix().scale(Math.max(1,s*.8))); }catch(e){}
  ctx.fillStyle=p;
  ctx.fillRect(x,y,w,h);
  ctx.restore();
}

/* =========================================================
   10. DRAWING ONE CUT
   ========================================================= */
function polyPath(poly,x,y,w,h){
  const p=new Path2D();
  poly.forEach((pt,i)=>{
    const X=x+pt[0]*w, Y=y+pt[1]*h;
    i? p.lineTo(X,Y) : p.moveTo(X,Y);
  });
  p.closePath();
  return p;
}
/* Frame 0 is the cut as generated; frames 1..N-1 are the same cut re-scissored,
   which is what gives the boil its hand-animated wobble. */
function variantPoly(c,v){
  if(!v) return c.poly;
  if(isGrid()) return SQUARE;
  return createCutoutShape(new Rng((c.seedUsed + v*7919)>>>0));
}
function cutPath(c,s,v){ return polyPath(variantPoly(c,v), PAD*s, PAD*s, c.w*s, c.h*s); }

/* fix B7 — one scratch canvas for the whole app instead of one per cut per frame.
   ponytail: it only ever grows, so it ends up holding the largest cut of the
   session (a few MB at export scale). Shrink it after export if that ever bites. */
const scratch = document.createElement('canvas');
const sctx = scratch.getContext('2d');

function drawInk(ctx,c,s,v){
  const P=PAD*s, w=c.w*s, h=c.h*s;
  const tw=Math.max(2,Math.ceil(w+P*2)), th=Math.max(2,Math.ceil(h+P*2));
  if(scratch.width<tw)  scratch.width  = tw;
  if(scratch.height<th) scratch.height = th;
  const k = sctx;
  k.setTransform(1,0,0,1,0,0);
  k.globalAlpha=1; k.globalCompositeOperation='source-over'; k.filter='none';
  k.clearRect(0,0,tw,th);

  const fs=c.glyphFs*s;
  // the ink slips by a fraction of a pixel on each boil frame
  const jx = v? ((v*37)%3-1)*0.6*s : 0, jy = v? ((v*53)%3-1)*0.6*s : 0;
  const setup=()=>{
    k.setTransform(1,0,0,1,0,0);
    k.translate(P+c.glyphX*s+jx, P+c.glyphY*s+jy);
    k.scale(c.scaleX,1);
    k.font = c.font.w+' '+fs+'px '+c.font.f;
    k.textBaseline='alphabetic';
  };
  const tx = c.metric.left*fs;

  // misregistered ghost pass
  if(c.ghost){
    setup();
    k.globalAlpha=c.ghost.a; k.fillStyle=c.ghost.c;
    k.fillText(c.text, tx + c.ghost.dx*s, c.ghost.dy*s);
    k.globalAlpha=1;
  }
  // main ink
  setup();
  if(c.stroke && c.stroke.inline){
    k.fillStyle = mix(c.paper,c.ink,.10);
    k.fillText(c.text,tx,0);
    k.lineWidth = c.stroke.w*fs; k.strokeStyle=c.ink; k.lineJoin='round';
    k.strokeText(c.text,tx,0);
  }else{
    if(c.stroke){
      k.lineWidth=c.stroke.w*fs*2; k.strokeStyle=c.stroke.c; k.lineJoin='round';
      k.strokeText(c.text,tx,0);
    }
    k.fillStyle=c.ink;
    k.fillText(c.text,tx,0);
  }

  // halftone screen inside the ink only
  if(c.screen>.04){
    k.setTransform(1,0,0,1,0,0);
    k.globalCompositeOperation='destination-out';
    paintDots(k,P,P,w,h,{sp:c.screenSp*s, r:c.screenSp*s*0.22, color:'#000',
      alpha:Math.min(.55,c.screen*.8), angle:c.screenAng});
    k.globalCompositeOperation='source-over';
  }
  // worn ink: a few bitten-out specks
  if(c.erode>.12){
    k.setTransform(1,0,0,1,0,0);
    k.globalCompositeOperation='destination-out';
    const r=new Rng(c.fiberSeed);
    const n=Math.round(c.erode*26);
    for(let i=0;i<n;i++){
      k.globalAlpha=r.range(.15,.6);
      k.beginPath();
      k.ellipse(P+r.r()*w, P+r.r()*h, r.range(.4,2.2)*s, r.range(.4,1.8)*s, r.r()*3.14,0,6.2832);
      k.fill();
    }
    k.globalAlpha=1;k.globalCompositeOperation='source-over';
  }

  ctx.save();
  ctx.globalAlpha=c.inkAlpha;
  if(c.blur>0.02) ctx.filter='blur('+(c.blur*s).toFixed(2)+'px)';
  ctx.drawImage(scratch, 0,0,tw,th, 0,0,tw,th);
  ctx.restore();
}

function drawCut(ctx,c,s,v){
  v = v||0;
  const P=PAD*s, w=c.w*s, h=c.h*s;
  const path=cutPath(c,s,v);

  // 0 — backing card, pasted down first
  if(c.backing){
    const b=c.backing;
    const bw=w*(1+b.grow), bh=h*(1+b.grow);
    const bx=P+b.dx*w-(bw-w)/2, by=P+b.dy*h-(bh-h)/2;
    ctx.save();
    ctx.translate(P+w/2,P+h/2); ctx.rotate(b.rot); ctx.translate(-(P+w/2),-(P+h/2));
    const bp=polyPath(b.poly,bx,by,bw,bh);
    if(c.sh.a>0.005){
      ctx.shadowColor='rgba(8,6,10,'+(c.sh.a*.8).toFixed(3)+')';
      ctx.shadowBlur=c.sh.b*s*.9; ctx.shadowOffsetX=c.sh.x*s; ctx.shadowOffsetY=c.sh.y*s;
    }
    ctx.fillStyle=b.color; ctx.fill(bp);
    ctx.shadowColor='transparent';
    ctx.save(); ctx.clip(bp);
    paintDots(ctx,bx,by,bw,bh,{sp:c.paperDots.sp*s,r:c.paperDots.sp*s*.24,
      color:lum(b.color)>.4?'#2a2018':'#e6dfd0',alpha:c.paperDots.a*.8,angle:c.paperDots.ang+.4,comp:'multiply'});
    paintGrain(ctx,bx,by,bw,bh,c.grain*.75,s);
    ctx.restore();
    ctx.lineWidth=Math.max(1,1.5*s);
    ctx.strokeStyle='rgba(24,18,12,'+(c.edge*.8).toFixed(3)+')';
    ctx.stroke(bp);
    ctx.restore();
  }

  // 1 — paper body + drop shadow
  ctx.save();
  if(c.sh.a>0.005){
    ctx.shadowColor='rgba(8,6,10,'+c.sh.a.toFixed(3)+')';
    ctx.shadowBlur=c.sh.b*s; ctx.shadowOffsetX=c.sh.x*s; ctx.shadowOffsetY=c.sh.y*s;
  }
  ctx.fillStyle=c.paper; ctx.fill(path);
  ctx.restore();

  ctx.save();
  ctx.clip(path);

  // 2 — stock shading
  const g=ctx.createLinearGradient(P,P,P+w,P+h);
  g.addColorStop(0,'rgba(255,255,255,'+c.papLight.toFixed(3)+')');
  g.addColorStop(.55,'rgba(255,255,255,0)');
  g.addColorStop(1,'rgba(0,0,0,'+c.papDark.toFixed(3)+')');
  ctx.fillStyle=g; ctx.fillRect(P,P,w,h);

  // 3 — fibres
  if(c.fiber>.12){
    const r=new Rng(c.fiberSeed+11);
    ctx.save();
    ctx.globalAlpha=Math.min(.14,c.fiber*.09);
    ctx.strokeStyle= lum(c.paper)>.4 ? '#4a4034' : '#cfc6b4';
    ctx.lineWidth=Math.max(.5,.7*s);
    const n=Math.round(10+c.fiber*22);
    for(let i=0;i<n;i++){
      const y0=P+r.r()*h, x0=P+r.r()*w, len=r.range(.08,.4)*w;
      ctx.beginPath();
      ctx.moveTo(x0,y0);
      ctx.lineTo(x0+len,y0+r.bell()*2.5*s);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 4 — stock printing screen
  paintDots(ctx,P,P,w,h,{
    sp:c.paperDots.sp*s, r:c.paperDots.sp*s*.24,
    color: lum(c.paper)>.4? '#2a2018':'#e6dfd0',
    alpha:c.paperDots.a, angle:c.paperDots.ang, comp:'multiply'
  });

  // 5 — the letter
  drawInk(ctx,c,s,v);

  // 6 — grain over everything
  paintGrain(ctx,P,P,w,h,c.grain,s);

  // 7 — lifted corner shading
  if(c.lift>0){
    const dirs=[[0,-1],[1,0],[0,1],[-1,0]][c.liftSide];
    const gx=ctx.createLinearGradient(
      P+w/2 - dirs[0]*w/2, P+h/2 - dirs[1]*h/2,
      P+w/2 + dirs[0]*w/2, P+h/2 + dirs[1]*h/2);
    gx.addColorStop(0,'rgba(0,0,0,0)');
    gx.addColorStop(.72,'rgba(0,0,0,0)');
    gx.addColorStop(1,'rgba(0,0,0,'+c.lift.toFixed(3)+')');
    ctx.fillStyle=gx; ctx.fillRect(P,P,w,h);
  }

  // 8 — cut edge
  ctx.lineWidth=Math.max(1,1.6*s);
  ctx.strokeStyle='rgba(26,20,14,'+c.edge.toFixed(3)+')';
  ctx.stroke(path);
  ctx.restore();
}

/* =========================================================
   11. BOARD SURFACE
   ========================================================= */
function drawBoard(ctx,W,H,s){
  let sf=SURFACES[state.surface];
  const base=boardBase();
  if(isFlat()){ ctx.fillStyle=base; ctx.fillRect(0,0,W,H); return; }
  if(state.ink==='grey') sf={...sf, base:toGrey(sf.base), hi:toGrey(sf.hi)};
  ctx.fillStyle=sf.base; ctx.fillRect(0,0,W,H);
  const g=ctx.createRadialGradient(W*.42,H*.34,0,W*.5,H*.5,Math.max(W,H)*.78);
  g.addColorStop(0,sf.hi); g.addColorStop(1,sf.base);
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  // creases
  const r=new Rng(hashStr(state.surface)+state.seed);
  ctx.save();
  ctx.globalAlpha=sf.fibA; ctx.strokeStyle=sf.fib; ctx.lineWidth=Math.max(1,1.2*s);
  for(let i=0;i<7;i++){
    const x=r.r()*W, y=r.r()*H;
    ctx.beginPath(); ctx.moveTo(x,y);
    ctx.lineTo(x+r.bell()*W*.6, y+r.bell()*H*.6);
    ctx.stroke();
  }
  ctx.restore();
  paintGrain(ctx,0,0,W,H,.9,s);
  // vignette
  const v=ctx.createRadialGradient(W/2,H/2,Math.min(W,H)*.25,W/2,H/2,Math.max(W,H)*.72);
  v.addColorStop(0,'rgba(0,0,0,0)');
  v.addColorStop(1,'rgba(0,0,0,'+sf.vig+')');
  ctx.fillStyle=v; ctx.fillRect(0,0,W,H);
}

/* =========================================================
   12. RENDER TO THE DOM
   ========================================================= */
function boardBox(){
  const area = $('stageArea');
  if(!area) return {W:600,H:600};
  const pad = window.innerWidth < 768 ? 24 : 48;
  const avW = Math.max(120, area.clientWidth  - pad);
  const avH = Math.max(120, area.clientHeight - pad);
  let W = avW, H = avW/state.format;
  if(H > avH){ H = avH; W = avH*state.format; }
  return {W:Math.floor(W), H:Math.floor(H)};
}

function render(){
  if(!state.fontsReady) return;
  const wrap = $('canvasWrap'), stage = $('stage'), bgCanvas = $('boardBg');
  if(!wrap || !stage || !bgCanvas) return;

  const {W,H}=boardBox();
  wrap.style.width  = W+'px';
  wrap.style.height = H+'px';
  const dpr=Math.min(2,window.devicePixelRatio||1);

  bgCanvas.width=Math.round(W*dpr); bgCanvas.height=Math.round(H*dpr);
  const bctx=bgCanvas.getContext('2d');
  bctx.setTransform(dpr,0,0,dpr,0,0);
  drawBoard(bctx,W,H,dpr);

  state.cuts=buildCuts();
  const F=fitAndPlace(state.cuts,W,H);

  // fix B7/B13 — reuse the existing .cut elements and their canvases
  const frames = state.anim==='boil' ? BOIL_FRAMES : 1;
  const doPaste = state.anim==='paste' && pastePending;
  pastePending = false;
  const stocks=new Set();
  let i=0;
  for(const c of state.cuts){
    if(c.br) continue;
    stocks.add(MATERIALS[c.material].label);
    let el = stage.children[i];
    if(!el){
      el = document.createElement('div');
      el.className='cut';
      stage.appendChild(el);
    }
    const cw=c.w+PAD*2, ch=c.h+PAD*2;
    el.dataset.key = c.key;
    el.classList.toggle('locked', !!c.locked);
    el.classList.toggle('boil', frames>1);
    el.title = c.locked ? 'Bloccato — alt+click per sbloccare' : 'Click: ritaglia di nuovo · Alt+click: blocca';
    el.style.left=(c.x-PAD)+'px';
    el.style.top=(c.y-PAD)+'px';
    el.style.width=cw+'px';
    el.style.height=ch+'px';
    el.style.transformOrigin=(PAD+c.w/2)+'px '+(PAD+c.h/2)+'px';
    el._rot  = c.rot*180/Math.PI;
    el._skew = c.skew*180/Math.PI;

    // one canvas per animation frame, kept and resized rather than recreated
    while(el.children.length < frames) el.appendChild(document.createElement('canvas'));
    while(el.children.length > frames){
      const x=el.lastElementChild; x.width=0; x.height=0; x.remove();
    }
    for(let v=0; v<frames; v++){
      const cv = el.children[v];
      cv.width=Math.ceil(cw*dpr); cv.height=Math.ceil(ch*dpr);   // also clears it
      cv.style.width=cw+'px'; cv.style.height=ch+'px';
      cv.classList.toggle('on', v===0);
      drawCut(cv.getContext('2d'),c,dpr,v);
    }
    el._v = 0;

    if(doPaste){
      el.style.transition='none';
      el.style.opacity='0';
      applyTf(el,(hash2(1,i)-.5)*34,-24,(hash2(2,i)-.5)*16,.85);
    }else{
      el.style.transition='none';
      el.style.opacity='1';
      applyTf(el,0,0,0,1);
    }
    i++;
  }
  while(stage.children.length > i){
    const ex = stage.lastElementChild;
    [...ex.children].forEach(cv=>{ cv.width=0; cv.height=0; });  // release the backing stores
    ex.remove();
  }
  if(doPaste) requestAnimationFrame(()=>{
    for(let j=0;j<stage.children.length;j++){
      const el=stage.children[j], d=j*22;
      el.style.transition='opacity .3s var(--ease-out) '+d+'ms, transform .44s var(--ease-out) '+d+'ms';
      el.style.opacity='1';
      applyTf(el,0,0,0,1);
    }
  });

  const n=i;
  const exp = exportSize();
  const set=(id,txt)=>{const el=$(id); if(el) el.textContent=txt;};
  set('charCount', n+(n===1?' ritaglio':' ritagli'));
  set('dims', W+'×'+H+' · export '+exp.OW+'×'+exp.OH);
  set('valRes', exp.OW+'×'+exp.OH);
  set('stockLine', [...stocks].join(' / ')||'—');
  set('live', 'Composizione di: '+state.text.replace(/\n/g,', '));
  set('seedStamp', String(state.seed).padStart(6,'0'));
  set('brandStamp', state.brand||'—');
  set('lockCount', String(Object.keys(state.cutLocks).length));
}

/* =========================================================
   12b. ANIMATION
   Everything except the boil is a transform on the existing elements, so it
   costs nothing per frame. The boil pre-renders BOIL_FRAMES canvases per cut
   and cycles them — stop-motion cadence, zero drawing while it plays.
   ========================================================= */
const BOIL_FRAMES = 3;
let animRaf=null, animLastFrame=-1, pastePending=false;

function hash2(a,b){
  let h=(Math.imul(a,374761393) + Math.imul(b,668265263))>>>0;
  h=(h^(h>>>13))>>>0; h=Math.imul(h,1274126177)>>>0;
  return ((h^(h>>>16))>>>0)/4294967296;
}
function applyTf(el,dx,dy,dr,sc){
  el.style.transform =
    'translate('+dx.toFixed(2)+'px,'+dy.toFixed(2)+'px) '+
    'rotate('+(el._rot+dr).toFixed(3)+'deg) '+
    'skewX('+el._skew.toFixed(3)+'deg)'+
    (sc!==1 ? ' scale('+sc.toFixed(3)+')' : '');
}

function animTick(ts){
  const mode=state.anim;
  if(mode==='none'||mode==='paste'){ animRaf=null; return; }
  animRaf=requestAnimationFrame(animTick);
  const stage=$('stage'); if(!stage) return;
  const kids=stage.children, amt=state.animAmt;

  if(mode==='wave'){                       // continuous, so no frame gate
    const t=ts/1000;
    for(let i=0;i<kids.length;i++){
      const el=kids[i];
      applyTf(el, 0, Math.sin(t*2.2+i*.55)*amt*12, isGrid()?0:Math.cos(t*2.2+i*.55)*amt*3.5, 1);
    }
    return;
  }

  const frame=Math.floor(ts/1000*state.animFps);
  if(frame===animLastFrame) return;        // hold the frame, stop-motion style
  animLastFrame=frame;

  if(mode==='boil'){
    const v=frame%BOIL_FRAMES;
    for(let i=0;i<kids.length;i++){
      const el=kids[i];
      if(el._v===v) continue;
      el.children[el._v]?.classList.remove('on');
      el.children[v]?.classList.add('on');
      el._v=v;
    }
    return;
  }
  if(mode==='jitter'){
    const snap=isGrid();                   // a grid trembles on whole pixels
    for(let i=0;i<kids.length;i++){
      const el=kids[i];
      let dx=(hash2(frame,i)-.5)*amt*8, dy=(hash2(frame,i+911)-.5)*amt*8;
      const dr=snap? 0 : (hash2(frame,i+4242)-.5)*amt*2.4;
      if(snap){ dx=Math.round(dx); dy=Math.round(dy); }
      applyTf(el,dx,dy,dr,1);
    }
  }
}
function syncAnim(){
  const running = state.anim!=='none' && state.anim!=='paste';
  if(running && !animRaf){ animLastFrame=-1; animRaf=requestAnimationFrame(animTick); }
  if(!running && animRaf){ cancelAnimationFrame(animRaf); animRaf=null; }
}

/* fix B13 — the drag is throttled, the drop is immediate */
let renderTimer=null;
function schedule(){
  if(renderTimer) return;
  renderTimer=setTimeout(()=>{renderTimer=null;requestAnimationFrame(render);},60);
}
function scheduleNow(){
  clearTimeout(renderTimer); renderTimer=null;
  requestAnimationFrame(render);
}

/* =========================================================
   13. EXPORT
   ========================================================= */
/* Export size no longer depends on the window: the long edge is always
   EXPORT_BASE × the chosen multiplier, clamped to what a canvas can hold. */
function exportSize(){
  const mult = parseFloat(($('res')||{}).value)||3;
  const {W,H}=boardBox();
  let s = (EXPORT_BASE/Math.max(1,Math.max(W,H)))*mult;
  let OW=Math.round(W*s), OH=Math.round(H*s);
  if(OW*OH > MAX_EXPORT_PX){
    s *= Math.sqrt(MAX_EXPORT_PX/(OW*OH));
    OW=Math.round(W*s); OH=Math.round(H*s);
  }
  return {W,H,s,OW,OH,clamped:OW*OH >= MAX_EXPORT_PX*0.999};
}

function downloadArtwork(){
  if(!state.cuts.length){ toast('Composizione non ancora pronta'); return; }
  const {s,OW,OH,clamped}=exportSize();
  const out=document.createElement('canvas');
  out.width=OW; out.height=OH;
  const ctx=out.getContext('2d');
  if(!ctx){ toast('Export non riuscito'); return; }
  if(!state.transparent) drawBoard(ctx,OW,OH,s);
  for(const c of state.cuts){
    if(c.br) continue;
    ctx.save();
    ctx.translate((c.x+c.w/2)*s,(c.y+c.h/2)*s);
    ctx.rotate(c.rot);
    ctx.transform(1,0,Math.tan(c.skew),1,0,0);
    ctx.translate(-(c.w/2+PAD)*s,-(c.h/2+PAD)*s);
    drawCut(ctx,c,s);
    ctx.restore();
  }
  // fix B1 — toBlob reports failure; toDataURL returned "data:," in silence
  out.toBlob(blob=>{
    if(!blob){ toast('Export non riuscito: risoluzione troppo alta'); return; }
    saveBlob(URL.createObjectURL(blob),'png',true);
    toast(clamped ? 'PNG '+OW+'×'+OH+' (ridotto al limite del browser)' : 'PNG '+OW+'×'+OH+' salvato');
    out.width=0; out.height=0;
  },'image/png');
}

/* ---- vector export: flat cut shapes + live type, for logo work ---- */
function xmlEsc(t){return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function polyD(poly,x,y,w,h){
  return poly.map((p,i)=>(i?'L':'M')+(x+p[0]*w).toFixed(2)+' '+(y+p[1]*h).toFixed(2)).join(' ')+' Z';
}
const deg = r => (r*180/Math.PI).toFixed(3);

function buildSVG(){
  const {W,H}=boardBox();
  const defs=[], body=[], families=new Set();

  state.cuts.forEach((c,i)=>{
    if(c.br) return;
    families.add(c.font.f.split(',')[0].replace(/["']/g,'').trim());
    const w=c.w, h=c.h, fs=c.glyphFs;
    const d=polyD(c.poly,0,0,w,h);
    defs.push('<clipPath id="k'+i+'"><path d="'+d+'"/></clipPath>');

    let g='<g transform="translate('+(c.x+w/2).toFixed(2)+' '+(c.y+h/2).toFixed(2)+
          ') rotate('+deg(c.rot)+') skewX('+deg(c.skew)+') translate('+(-w/2).toFixed(2)+' '+(-h/2).toFixed(2)+')">';

    if(c.backing){
      const b=c.backing, bw=w*(1+b.grow), bh=h*(1+b.grow);
      const bx=b.dx*w-(bw-w)/2, by=b.dy*h-(bh-h)/2;
      g+='<path d="'+polyD(b.poly,bx,by,bw,bh)+'" fill="'+b.color+'" transform="rotate('+
         deg(b.rot)+' '+(w/2).toFixed(2)+' '+(h/2).toFixed(2)+')"/>';
    }
    g+='<path d="'+d+'" fill="'+c.paper+'"/>';

    // stock screen stays vector: a dot pattern clipped to the cut
    if(c.paperDots.a>0.02){
      const sp=c.paperDots.sp.toFixed(2), r=(c.paperDots.sp*0.24).toFixed(2);
      const col = lum(c.paper)>.4 ? '#2a2018' : '#e6dfd0';
      defs.push('<pattern id="d'+i+'" patternUnits="userSpaceOnUse" width="'+sp+'" height="'+sp+
        '" patternTransform="rotate('+deg(c.paperDots.ang)+')"><circle cx="'+(c.paperDots.sp/2).toFixed(2)+
        '" cy="'+(c.paperDots.sp/2).toFixed(2)+'" r="'+r+'" fill="'+col+'"/></pattern>');
      g+='<path d="'+d+'" fill="url(#d'+i+')" opacity="'+c.paperDots.a.toFixed(3)+'"/>';
    }

    const fam=c.font.f.replace(/"/g,"'");
    let attrs='font-family="'+xmlEsc(fam)+'" font-size="'+fs.toFixed(2)+'" font-weight="'+c.font.w+'" fill="'+c.ink+'"';
    if(c.stroke) attrs+=' stroke="'+c.stroke.c+'" stroke-width="'+(c.stroke.w*fs*2).toFixed(2)+
                        '" stroke-linejoin="round" paint-order="stroke fill"';
    g+='<g clip-path="url(#k'+i+')"><text x="'+(c.metric.left*fs).toFixed(2)+'" y="0" transform="translate('+
       c.glyphX.toFixed(2)+' '+c.glyphY.toFixed(2)+') scale('+c.scaleX.toFixed(4)+' 1)" '+
       attrs+'>'+xmlEsc(c.text)+'</text></g>';
    g+='</g>';
    body.push(g);
  });

  const bg = state.transparent ? '' :
    '<rect width="'+W+'" height="'+H+'" fill="'+boardBase()+'"/>';

  return '<?xml version="1.0" encoding="UTF-8"?>\n'+
    '<!-- '+(state.brand||'PASTE-UP')+' · composizione ritagliata · seed '+state.seed+'\n'+
    '     Le lettere sono testo vivo. In Illustrator: Testo > Crea contorni prima della consegna.\n'+
    '     Caratteri usati: '+[...families].join(', ')+'\n'+
    '     Grana della carta e usura dell\'inchiostro sono effetti raster — per quelli usa il PNG. -->\n'+
    '<svg xmlns="http://www.w3.org/2000/svg" width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'">\n'+
    '<defs>\n'+defs.join('\n')+'\n</defs>\n'+bg+'\n'+body.join('\n')+'\n</svg>\n';
}

function downloadSVG(){
  if(!state.cuts.length){ toast('Composizione non ancora pronta'); return; }
  const blob=new Blob([buildSVG()],{type:'image/svg+xml'});
  saveBlob(URL.createObjectURL(blob),'svg',true);
  toast('SVG salvato');
}

function saveBlob(href,ext,revoke){
  const name=(state.brand||'PASTEUP').replace(/[^A-Za-z0-9]+/g,'-').toUpperCase();
  const a=document.createElement('a');
  a.download=name+'-cutout-'+String(state.seed).padStart(6,'0')+'.'+ext;
  a.href=href;
  document.body.appendChild(a);   // fix B9 — Firefox/WebView need it in the document
  a.click();
  a.remove();
  if(revoke) setTimeout(()=>URL.revokeObjectURL(href),4000);
}

/* =========================================================
   14. UI WIRING
   ========================================================= */
// --- sliders (DS pattern) ---
(function buildSliders(){
  const host = $('sliders');
  if(!host) return;
  SLIDERS.forEach(s=>{
    const wrap=document.createElement('div');
    wrap.className='space-y-1';
    wrap.innerHTML =
      '<div class="flex justify-between items-center">'+
        '<label class="text-[10px] text-neutral-500" for="sl-'+s.id+'">'+s.label+'</label>'+
        '<span id="v-'+s.id+'" class="text-[10px] font-mono tabular-nums text-neutral-400">'+s.v+'</span>'+
      '</div>'+
      '<input id="sl-'+s.id+'" type="range" min="0" max="100" value="'+s.v+'" class="w-full">';
    host.appendChild(wrap);
    const inp = wrap.querySelector('input');
    const val = wrap.querySelector('span');
    inp.addEventListener('input',()=>{
      state.s[s.id]=inp.value/100;
      val.textContent=inp.value;
      schedule();
    });
    inp.addEventListener('change',scheduleNow);
  });
})();

// --- colour swatches (DS .color-input + hex field) ---
const swatchInputs = [];
(function buildSwatches(){
  const host = $('swatches');
  if(!host) return;
  state.palette.forEach((col,i)=>{
    const row=document.createElement('div');
    row.className='swatch-row';
    row.innerHTML =
      '<span class="idx">0'+(i+1)+'</span>'+
      '<input type="color" class="color-input" value="'+col+'" aria-label="Colore di marca '+(i+1)+'">'+
      '<input type="text" value="'+col+'" maxlength="7" aria-label="Codice esadecimale colore '+(i+1)+'">';
    host.appendChild(row);
    const picker=row.querySelector('input[type=color]');
    const text  =row.querySelector('input[type=text]');
    swatchInputs.push(picker,text);
    picker.addEventListener('input',()=>{
      text.value=picker.value; state.palette[i]=picker.value; schedule();
    });
    picker.addEventListener('change',scheduleNow);
    text.addEventListener('change',()=>{
      if(!isValidHex(text.value)){ text.value=picker.value; toast('Esadecimale non valido'); return; }
      picker.value=text.value; state.palette[i]=text.value; scheduleNow();
    });
  });
})();

// --- font picker: which faces the cutter is allowed to use ---
function activeFontCount(){ return state.fonts.reduce((n,v)=>n+(v?1:0),0); }
function syncFontCount(){
  const el=$('fontCount');
  if(el) el.textContent=activeFontCount()+'/'+FONTS.length;
}
const fontBoxes=[];
(function buildFontPicker(){
  const host=$('fontList');
  if(!host) return;
  Object.keys(BY_GROUP).forEach(g=>{
    const head=document.createElement('div');
    head.className='flex justify-between items-center pt-2 first:pt-0';
    head.innerHTML='<span class="text-[10px] text-neutral-500">'+(GROUP_LABELS[g]||g)+'</span>'+
                   '<button type="button" class="text-[10px] text-neutral-500 hover:text-neutral-200 transition-colors" data-g="'+g+'">inverti</button>';
    head.querySelector('button').addEventListener('click',()=>{
      const idx=FONTS.map((f,i)=>f.g===g?i:-1).filter(i=>i>=0);
      const allOn=idx.every(i=>state.fonts[i]);
      idx.forEach(i=>{ state.fonts[i]=!allOn; fontBoxes[i].checked=!allOn; });
      if(!activeFontCount()){ state.fonts[1]=true; fontBoxes[1].checked=true; toast('Serve almeno un carattere'); }
      syncFontCount(); scheduleNow();
    });
    host.appendChild(head);

    FONTS.forEach((f,i)=>{
      if(f.g!==g) return;
      const name=f.f.split(',')[0].replace(/["']/g,'').trim();
      const row=document.createElement('label');
      row.className='font-row';
      row.innerHTML='<input type="checkbox" checked class="w-3.5 h-3.5 accent-neutral-200 flex-shrink-0">'+
                    '<span class="sample"></span>';
      const box=row.querySelector('input'), sample=row.querySelector('.sample');
      sample.textContent=name;
      sample.style.fontFamily=f.f;
      sample.style.fontWeight=f.w;
      host.appendChild(row);
      fontBoxes[i]=box;
      box.addEventListener('change',()=>{
        state.fonts[i]=box.checked;
        if(!activeFontCount()){ state.fonts[i]=true; box.checked=true; toast('Serve almeno un carattere'); return; }
        syncFontCount(); scheduleNow();
      });
    });
  });
  syncFontCount();
})();

on('btnFontsAll','click',()=>{
  state.fonts=FONTS.map(()=>true);
  fontBoxes.forEach(b=>{ if(b) b.checked=true; });
  syncFontCount(); scheduleNow();
});
on('btnFontsNone','click',()=>{
  state.fonts=FONTS.map((f,i)=>i===1);   // keep one, an empty pool has nothing to cut from
  fontBoxes.forEach((b,i)=>{ if(b) b.checked=(i===1); });
  syncFontCount(); scheduleNow();
  toast('Tenuto un carattere: il pool non può essere vuoto');
});

function segment(id,apply){
  const el=$(id);
  if(!el) return;
  el.addEventListener('click',e=>{
    const b=e.target.closest('button');
    if(!b || !el.contains(b)) return;
    [...el.children].forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
    apply(b.dataset.v);
    scheduleNow();
  });
}
segment('formatSeg',v=>{state.format=parseFloat(v)||1;});
segment('surfaceSeg',v=>{state.surface=v;});
segment('inkSeg',v=>{
  state.ink = v;
  const field = $('swatchField');
  if(field) field.classList.toggle('off', v!=='colour');
  // fix B11 — a disabled field must be out of the tab order too
  swatchInputs.forEach(i=>{ i.disabled = v!=='colour'; });
});
segment('finishSeg',v=>{ state.flat = v==='flat'; });
segment('layoutSeg',v=>{ state.layout = v; pastePending = state.anim==='paste'; });
segment('animSeg',v=>{
  state.anim = v;
  pastePending = v==='paste';
  const ctl=$('animCtl');
  if(ctl) ctl.classList.toggle('off', v==='none');
  // a greyed-out control must leave the tab order too
  [$('sl-animFps'),$('sl-animAmt')].forEach(i=>{ if(i) i.disabled = v==='none'; });
  syncAnim();
});

on('sl-animFps','input',e=>{
  state.animFps=Math.max(1,+e.target.value);
  const el=$('v-animFps'); if(el) el.textContent=e.target.value+' fps';
});
on('sl-animAmt','input',e=>{
  state.animAmt=+e.target.value/100;
  const el=$('v-animAmt'); if(el) el.textContent=e.target.value;
});

on('transparent','change',e=>{ state.transparent=e.target.checked; });

on('text','input',e=>{
  const next = e.target.value || ' ';
  if(next !== state.text){
    // the cut keys are positional: once the text moves, they mean nothing
    const had = Object.keys(state.cutLocks).length;
    state.cutSeeds={}; state.cutLocks={};
    if(had) toast('Testo cambiato: ritagli sbloccati');
  }
  state.text = next;
  schedule();
});
on('text','change',scheduleNow);

on('brand','input',e=>{
  state.brand=e.target.value;
  const st=$('brandStamp'); if(st) st.textContent=state.brand||'—';
});

on('res','change',()=>{
  const exp=exportSize();
  const el=$('valRes'); if(el) el.textContent=exp.OW+'×'+exp.OH;
  const d=$('dims'); if(d){ const {W,H}=boardBox(); d.textContent=W+'×'+H+' · export '+exp.OW+'×'+exp.OH; }
});

on('btnReshuffle','click',()=>{
  state.seed=createSeed();
  pastePending = state.anim==='paste';
  // a re-rolled cut goes back in the pot; a locked one does not
  for(const k of Object.keys(state.cutSeeds)) if(!state.cutLocks[k]) delete state.cutSeeds[k];
  scheduleNow();
});
on('btnPng','click',downloadArtwork);
on('btnSvg','click',downloadSVG);

on('btnResetCuts','click',()=>{
  const n=Object.keys(state.cutLocks).length;
  state.cutSeeds={}; state.cutLocks={};
  scheduleNow();
  toast(n? n+' ritagli sbloccati' : 'Nessun ritaglio bloccato');
});

/* --- lock / re-roll a single cut ---
   ponytail: mouse-only, because it is a spatial gesture on an aria-hidden canvas
   layer. The keyboard equivalents are the "Rimescola" and "Sblocca tutti" buttons
   in the sidebar. Add roving-tabindex focus on .cut if keyboard picking is needed. */
on('stage','click',e=>{
  const el=e.target.closest('.cut');
  if(!el) return;
  const key=el.dataset.key;
  if(!key) return;
  if(e.altKey||e.metaKey){
    if(state.cutLocks[key]){
      delete state.cutLocks[key];
      delete state.cutSeeds[key];
      toast('Ritaglio sbloccato');
    }else{
      const c=state.cuts.find(x=>x.key===key);
      if(!c) return;
      state.cutSeeds[key]=c.seedUsed;   // pin whatever it looks like right now
      state.cutLocks[key]=true;
      toast('Ritaglio bloccato');
    }
  }else{
    if(state.cutLocks[key]){ toast('Ritaglio bloccato — alt+click per sbloccare'); return; }
    state.cutSeeds[key]=subSeed();
  }
  scheduleNow();
});

// --- sidebar mobile ---
function toggleMenu(){
  const sidebar=$('sidebar'), overlay=$('sidebarOverlay');
  sidebar?.classList.toggle('open');
  overlay?.classList.toggle('active');
  setTimeout(()=>window.dispatchEvent(new Event('resize')),300);
}
on('menuToggle','click',toggleMenu);
on('menuClose','click',toggleMenu);
$('sidebarOverlay')?.addEventListener('click',toggleMenu);

// --- responsive board ---
let lastW=0,lastH=0;
const stageArea=$('stageArea');
if(stageArea && window.ResizeObserver){
  new ResizeObserver(()=>{
    const {W,H}=boardBox();
    if(W===lastW && H===lastH) return;   // guard against a resize feedback loop
    lastW=W; lastH=H;
    schedule();
  }).observe(stageArea);
}
window.addEventListener('resize',schedule);

/* =========================================================
   15. BOOT — make sure every family is really loaded before measuring
   ========================================================= */
(function boot(){
  if(window.lucide) lucide.createIcons();

  // size the board immediately so the "busy" overlay has somewhere to live
  const wrap0=$('canvasWrap');
  if(wrap0){ const b=boardBox(); wrap0.style.width=b.W+'px'; wrap0.style.height=b.H+'px'; }

  let booted=false;
  const finishBoot=()=>{
    if(booted) return;                       // fix B2 — idempotent
    booted=true;
    metricCache.clear();
    state.fontsReady=true;
    $('canvasWrap')?.classList.remove('busy');
    pastePending = state.anim==='paste';
    render();
    syncAnim();
  };

  // accessibility: never animate against the OS preference
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(reduce){
    state.anim='none';
    const seg=$('animSeg');
    if(seg){
      [...seg.children].forEach(b=>{
        b.disabled = b.dataset.v!=='none';
        b.setAttribute('aria-pressed', String(b.dataset.v==='none'));
      });
    }
    const note=$('animNote');
    if(note) note.textContent='Animazioni disattivate: il sistema richiede movimento ridotto.';
    const ctl=$('animCtl'); if(ctl) ctl.classList.add('off');
  }

  [$('sl-animFps'),$('sl-animAmt')].forEach(i=>{ if(i) i.disabled = state.anim==='none'; });

  const SAMPLE='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  FONTS.forEach(f=>{ try{ document.fonts.load(f.w+' 100px '+f.f, SAMPLE); }catch(e){} });

  document.fonts.ready.then(()=>{
    const late = booted;                     // the 6s fallback already fired
    metricCache.clear();                     // fix B2 — drop fallback-font metrics
    finishBoot();
    if(late) scheduleNow();                  // re-measure with the real faces
  }).catch(finishBoot);

  setTimeout(finishBoot,6000);               // never block on a slow font CDN
})();
