(function(){
'use strict';
/* ===== 設定：改這裡 ===== */
var OWNER = 'mu4540';            // GitHub 帳號
var REPO  = 'shiwananma-shop';   // repo 名稱
var BRANCH = 'main';
var FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSdD7IstFRiLIxHYHOI2Mis7jy6mO5Zu08U5h8P8cF6dGZGGdw/viewform';
/* ======================== */
var API = 'https://api.github.com/repos/' + OWNER + '/' + REPO;
var TOKEN_KEY = 'swnm_gh_token';
var MAX_PHOTOS = 5;
var CATS = ['上衣','褲子','裙子','洋裝','外套','配件','其他'];
var SIZE_PRESETS = [['S M L','S M L'],['S–XL','S M L XL'],['XS–3XL','XS S M L XL 2XL 3XL'],['F（單一尺寸）','F'],['褲 26–32','26 27 28 29 30 31 32']];
var COLOR_MAP = [['米白','#F2EBDD'],['奶油','#F6EBC8'],['酒紅','#7B1E2E'],['桃紅','#FF2D8A'],['深藍','#1F2F5A'],['海軍藍','#1F2F5A'],['淺藍','#9CC8EE'],['牛仔','#4A6E98'],['天藍','#7EC4EA'],['深灰','#55555C'],['淺灰','#CFCFD4'],['軍綠','#5B6B3A'],['墨綠','#2F4A3A'],['橄欖','#6B6B2F'],['卡其','#C3A77A'],['咖啡','#7B5236'],['焦糖','#B5712E'],['駝','#C19A6B'],['杏','#E8D3B9'],['米','#EADFCB'],['奶茶','#C8AD95'],['黑','#1C1C1C'],['白','#FFFFFF'],['灰','#9A9AA0'],['紅','#D7263D'],['粉','#F6A5C0'],['橘','#F28C28'],['黃','#F7D046'],['綠','#3E9B5B'],['藍','#2F6FD0'],['紫','#8A5CC2'],['棕','#8B5A3C'],['銀','#C0C0C8'],['金','#C9A646'],['條紋','#DADCE8'],['花','#F3C6D3']];
var QUICK_COLORS = ['黑','白','米白','灰','卡其','咖啡','深藍','淺藍','粉','綠'];
var DEFAULTS = { tagline:'越南代購 · 精選服飾', intro:'從越南挑選的衣服，每件都是限量現貨。看到喜歡的，點進去選顏色和尺寸，填表單就能下單。', notice:'', ig:'', formUrl:FORM_URL, formEntry:'', shipping:'7-11 店到店取貨，運費 NT$60', currency:'NT$' };

var state = { products:[], settings:Object.assign({}, DEFAULTS), loaded:false, error:'' };
var ui = { filter:'全部', brand:'全部', photoIdx:0, sel:null, draft:null, photos:[], busy:'', msg:'', msgKind:'', confirmId:null, token:'', me:null, canPush:false, authChecked:false,
  batch:{ items:[], mode:'name', n:3, progress:0, uploading:false, msg:'', msgKind:'' } };
var app = document.getElementById('app');
try { ui.token = localStorage.getItem(TOKEN_KEY) || ''; } catch(e){}

/* ---------- helpers ---------- */
function esc(v){ return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
function money(n){ var x = Number(n); if (!isFinite(x)) return esc(n); return esc(state.settings.currency) + ' ' + x.toLocaleString('en-US'); }
function photoUrl(p){ return /^photos\/[A-Za-z0-9._-]+$/.test(p) ? p : ''; }
var idSeq = 0;
function newId(){ return 'p-' + Date.now().toString(36) + (idSeq++).toString(36) + Math.random().toString(36).slice(2,5); }
function route(){ var h = (location.hash||'').replace(/^#/,''); if (h === 'manage' || h === 'batch') return {view:h}; if (/^p-[a-z0-9]+$/.test(h)) return {view:'product', id:h}; return {view:'home'}; }
function allBrands(){ return state.products.map(function(p){ return p.brand; }).filter(function(b, i, a){ return b && a.indexOf(b) === i; }).sort(natCmp); }
function byId(id){ return state.products.filter(function(x){ return x.id === id; })[0]; }
function visible(){ return state.products.filter(function(p){ return p.status !== 'hidden'; }); }
function safeHex(h){ return /^#[0-9a-fA-F]{6}$/.test(h||'') ? h : '#CCCCCC'; }
function colorHex(name){ name = String(name||''); for (var i=0;i<COLOR_MAP.length;i++){ if (name.indexOf(COLOR_MAP[i][0]) !== -1) return COLOR_MAP[i][1]; } return '#CCCCCC'; }
function splitList(s, withSpace){ return String(s||'').split(withSpace ? /[,，、\/;；\s]+/ : /[,，、\/;；]+/).map(function(x){ return x.trim(); }).filter(Boolean).filter(function(x,i,a){ return a.indexOf(x) === i; }); }
function parseSizes(s){ return splitList(s, true).slice(0,20); }
function parseColors(s){ return splitList(s, false).slice(0,12).map(function(n){ return {name:n, hex:colorHex(n), photo:null}; }); }
function natCmp(a,b){ return a.localeCompare(b, undefined, {numeric:true, sensitivity:'base'}); }
function toast(text){ var old = document.getElementById('toast'); if (old) old.remove(); var el = document.createElement('div'); el.className='toast'; el.id='toast'; el.textContent = text; document.body.appendChild(el); setTimeout(function(){ if (el.parentNode) el.remove(); }, 2800); }
function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }

/* product shape: {id,name,price,category,colors:[{name,hex,photo}],sizes:[..],soldOut:["色|尺寸"],sizeNote,desc,status,photos:[path],createdAt,updatedAt} */
function normalize(p){
  p = Object.assign({}, p);
  if (!Array.isArray(p.colors)) p.colors = p.color ? parseColors(p.color) : [];
  if (!Array.isArray(p.sizes)) p.sizes = [];
  if (!Array.isArray(p.soldOut)) p.soldOut = [];
  if (p.sizeNote == null) p.sizeNote = p.size || '';
  if (!Array.isArray(p.photos)) p.photos = [];
  p.brand = String(p.brand||'').trim();
  p.colors = p.colors.map(function(c){ return {name:String(c.name||''), hex:safeHex(c.hex), photo:(c.photo === 0 || c.photo > 0) ? +c.photo : null}; }).filter(function(c){ return c.name; });
  delete p.size; delete p.color;
  return p;
}
function applyData(d){ state.products = (Array.isArray(d.products) ? d.products : []).map(normalize); state.settings = Object.assign({}, DEFAULTS, d.settings||{}); state.loaded = true; }
function serialize(){ return JSON.stringify({ products:state.products, settings:state.settings }, null, 2) + '\n'; }
function combo(c, s){ return (c||'') + '|' + (s||''); }
function avail(p, c, s){ return p.soldOut.indexOf(combo(c, s)) === -1; }
function colorNames(p){ return p.colors.length ? p.colors.map(function(c){ return c.name; }) : ['']; }
function sizeNames(p){ return p.sizes.length ? p.sizes : ['']; }
function sizeAnyAvail(p, s){ return colorNames(p).some(function(c){ return avail(p, c, s); }); }
function colorAnyAvail(p, c){ return sizeNames(p).some(function(s){ return avail(p, c, s); }); }
function allSold(p){ return p.status === 'sold' || ((p.colors.length || p.sizes.length) && !colorNames(p).some(function(c){ return colorAnyAvail(p, c); })); }
function orderUrl(text){
  var s = state.settings, base = s.formUrl || FORM_URL;
  if (!s.formEntry || !text) return base;
  return base.split('?')[0] + '?usp=pp_url&' + s.formEntry + '=' + encodeURIComponent(text);
}

/* ---------- GitHub API ---------- */
function gh(method, path, body, accept){
  var h = { 'Accept': accept || 'application/vnd.github+json', 'X-GitHub-Api-Version':'2022-11-28' };
  if (ui.token) h['Authorization'] = 'Bearer ' + ui.token;
  if (body) h['Content-Type'] = 'application/json';
  return fetch(API + path, { method:method, headers:h, body: body ? JSON.stringify(body) : undefined, cache:'no-store' }).then(function(r){
    return r.text().then(function(t){
      if (accept && accept.indexOf('raw') !== -1 && r.ok) return t;
      var j = {}; try { j = t ? JSON.parse(t) : {}; } catch(e){}
      if (!r.ok){ var e = new Error(j.message || ('HTTP ' + r.status)); e.status = r.status; e.retryAfter = +(r.headers.get('retry-after')||0); throw e; }
      return j;
    });
  });
}
function utf8b64(str){ var bytes = new TextEncoder().encode(str), bin = ''; for (var i=0;i<bytes.length;i+=0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i+0x8000)); return btoa(bin); }
function blobB64(blob){ return new Promise(function(res, rej){ var r = new FileReader(); r.onload = function(){ res(String(r.result).split(',')[1]); }; r.onerror = rej; r.readAsDataURL(blob); }); }
function getHead(){ return gh('GET', '/git/ref/heads/' + BRANCH).then(function(ref){ return gh('GET', '/git/commits/' + ref.object.sha).then(function(c){ return {sha:ref.object.sha, tree:c.tree.sha}; }); }); }
function readData(sha){ return gh('GET', '/contents/products.json?ref=' + sha, null, 'application/vnd.github.raw+json').then(function(t){ return JSON.parse(t); }); }
function loadFromApi(){ return getHead().then(function(h){ return readData(h.sha); }).then(applyData); }
function createBlob(b64, onWait){
  return gh('POST', '/git/blobs', { content:b64, encoding:'base64' }).catch(function(e){
    if (e.status === 403 || e.status === 429){ var wait = (e.retryAfter || 60); if (onWait) onWait(wait); return sleep(wait*1000).then(function(){ return gh('POST', '/git/blobs', { content:b64, encoding:'base64' }); }); }
    throw e;
  });
}
/* One commit: upload photo blobs, re-read latest products.json, apply mutate(data) -> {deletes}, write tree, move branch. */
function commit(opts){
  var files = opts.files || [], uploaded = [], onProgress = opts.onProgress || function(){};
  var slow = files.length > 60;
  var chain = Promise.resolve();
  files.forEach(function(f, i){
    chain = chain.then(function(){
      onProgress('上傳照片 ' + (i+1) + '/' + files.length + '…', i / (files.length + 1));
      return blobB64(f.blob).then(function(b64){ return createBlob(b64, function(w){ onProgress('GitHub 限速中，等待 ' + w + ' 秒後繼續…', i / (files.length + 1)); }); })
        .then(function(b){ uploaded.push({path:f.path, sha:b.sha}); if (slow) return sleep(750); });
    });
  });
  function attempt(n){
    onProgress('寫入商品資料…', files.length / (files.length + 1));
    return getHead().then(function(head){
      return readData(head.sha).then(function(data){
        data.products = (Array.isArray(data.products) ? data.products : []).map(normalize);
        data.settings = Object.assign({}, DEFAULTS, data.settings||{});
        var res = opts.mutate(data) || {};
        var deletes = (res.deletes || []).filter(photoUrl);
        var json = JSON.stringify({ products:data.products, settings:data.settings }, null, 2) + '\n';
        return gh('POST', '/git/blobs', { content:utf8b64(json), encoding:'base64' }).then(function(jb){
          var tree = uploaded.map(function(u){ return {path:u.path, mode:'100644', type:'blob', sha:u.sha}; });
          tree.push({path:'products.json', mode:'100644', type:'blob', sha:jb.sha});
          var withDel = tree.concat(deletes.map(function(p){ return {path:p, mode:'100644', type:'blob', sha:null}; }));
          return gh('POST', '/git/trees', { base_tree:head.tree, tree:withDel }).catch(function(e){
            if (deletes.length && e.status === 422) return gh('POST', '/git/trees', { base_tree:head.tree, tree:tree });
            throw e;
          });
        }).then(function(t){
          return gh('POST', '/git/commits', { message:opts.message, tree:t.sha, parents:[head.sha] });
        }).then(function(c){
          return gh('PATCH', '/git/refs/heads/' + BRANCH, { sha:c.sha, force:false });
        }).then(function(){ applyData(data); onProgress('', 1); });
      });
    }).catch(function(e){
      if (n < 3 && (e.status === 422 || e.status === 409)) return sleep(600).then(function(){ return attempt(n+1); });
      throw e;
    });
  }
  return chain.then(function(){ return attempt(1); });
}
function checkAuth(){
  ui.authChecked = false; ui.me = null; ui.canPush = false;
  if (!ui.token){ ui.authChecked = true; return Promise.resolve(); }
  return gh('GET', '').then(function(repo){
    ui.canPush = !!(repo.permissions && repo.permissions.push);
    return fetch('https://api.github.com/user', { headers:{ 'Authorization':'Bearer ' + ui.token, 'Accept':'application/vnd.github+json' } }).then(function(r){ return r.ok ? r.json() : null; }).then(function(u){ ui.me = u; });
  }).catch(function(){ ui.canPush = false; }).then(function(){ ui.authChecked = true; });
}
function errText(e){ if (!e) return '未知錯誤'; if (e.status === 401) return 'Token 無效或過期，請重新登入。'; if (e.status === 403) return '沒有權限（Token 需要這個 repo 的 Contents 讀寫）。'; if (e.status === 404) return '找不到 repo 或檔案。'; if (e.status === 422) return '資料衝突，請重新整理後再試。'; return e.message || String(e); }

/* ---------- images ---------- */
function compress(file){
  return new Promise(function(res, rej){
    var url = URL.createObjectURL(file), img = new Image();
    img.onload = function(){
      var max = 1200, w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, max/Math.max(w,h));
      var c = document.createElement('canvas'); c.width = Math.round(w*k); c.height = Math.round(h*k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      c.toBlob(function(b){ b ? res(b) : rej(new Error('encode')); }, 'image/jpeg', 0.82);
    };
    img.onerror = function(){ URL.revokeObjectURL(url); rej(new Error('decode')); };
    img.src = url;
  });
}

/* ---------- shared chrome ---------- */
function header(){
  var s = state.settings;
  return '<header class="hdr"><div class="wrap">'
    + '<a class="brand" href="#"><img src="logo.jpg" alt="Shi Wa Nan Ma Shop logo"><b>Shi Wa Nan Ma<small>shop</small></b></a>'
    + '<nav>'
    + (s.ig ? '<a class="btn btn-ghost btn-sm" href="https://www.instagram.com/' + esc(s.ig.replace(/^@/,'')) + '" target="_blank" rel="noopener">IG @' + esc(s.ig.replace(/^@/,'')) + '</a>' : '')
    + '<a class="btn btn-pink btn-sm" href="' + esc(s.formUrl||FORM_URL) + '" target="_blank" rel="noopener">訂購表單 ↗</a>'
    + (ui.canPush ? '<a class="btn btn-ink btn-sm" href="#manage">管理</a>' : '')
    + '</nav></div></header>';
}
function footer(){
  var s = state.settings;
  return '<footer class="ftr"><div class="wrap"><div><b>Shi Wa Nan Ma shop</b> · ' + esc(s.tagline) + '</div><div>' + esc(s.shipping) + (s.ig ? ' · IG @' + esc(s.ig.replace(/^@/,'')) : '') + ' · <a href="#manage">管理</a></div></div></footer>';
}

/* ---------- storefront ---------- */
function cardHtml(p){
  var first = p.photos[0], sold = allSold(p);
  var isNew = p.createdAt && (Date.now() - p.createdAt) < 7*864e5 && !sold;
  var dots = p.colors.slice(0,5).map(function(c){ return '<span class="dot" style="background:' + safeHex(c.hex) + '" title="' + esc(c.name) + '"></span>'; }).join('') + (p.colors.length > 5 ? '<span>+' + (p.colors.length-5) + '</span>' : '');
  var sizes = p.sizes.map(function(s){ return sizeAnyAvail(p, s) ? '<span>' + esc(s) + '</span>' : '<s>' + esc(s) + '</s>'; }).join('');
  return '<a class="card" href="#' + esc(p.id) + '"><div class="ph">'
    + (first ? '<img src="' + photoUrl(first) + '" alt="' + esc(p.name) + '" loading="lazy">' : '<div class="ph-empty">尚無照片</div>')
    + (isNew ? '<span class="tag">NEW</span>' : '')
    + (p.photos.length > 1 ? '<span class="count">' + p.photos.length + ' 張</span>' : '')
    + (sold ? '<div class="sold"><span>售完</span></div>' : '')
    + '</div><div class="meta">' + (dots ? '<div class="dots">' + dots + '</div>' : '') + (p.brand ? '<div class="brand">' + esc(p.brand) + '</div>' : '') + '<div class="name">' + esc(p.name) + '</div><div class="price">' + money(p.price) + '</div>'
    + (sizes ? '<div class="sizes">' + sizes + '</div>' : '') + '</div></a>';
}
function home(){
  var s = state.settings, items = visible();
  var cats = ['全部'].concat(CATS.filter(function(c){ return items.some(function(p){ return p.category === c; }); }));
  var brands = items.map(function(p){ return p.brand; }).filter(function(b, i, a){ return b && a.indexOf(b) === i; }).sort(natCmp);
  if (ui.brand !== '全部' && brands.indexOf(ui.brand) === -1) ui.brand = '全部';
  var list = items.filter(function(p){ return (ui.filter === '全部' || p.category === ui.filter) && (ui.brand === '全部' || p.brand === ui.brand); });
  list = list.slice().sort(function(a,b){ return (allSold(a)?1:0) - (allSold(b)?1:0) || (b.createdAt||0) - (a.createdAt||0); });
  return header()
    + '<section class="hero"><div class="wrap"><div>'
    + '<div class="eyebrow">Vietnam → Taiwan · 代購</div>'
    + '<h1>Shi Wa Nan Ma <em>shop</em></h1>'
    + '<p>' + esc(s.intro) + '</p>'
    + '<div class="cta"><a class="btn btn-pink" href="#list" data-scroll="list">瀏覽商品</a><a class="btn btn-ghost" href="' + esc(s.formUrl||FORM_URL) + '" target="_blank" rel="noopener">填寫訂購表單 ↗</a></div>'
    + (s.notice ? '<div class="notice"><b>公告</b><span>' + esc(s.notice) + '</span></div>' : '')
    + '</div><img class="sign" src="logo.jpg" alt="Shi Wa Nan Ma Shop 霓虹招牌"></div></section>'
    + '<main class="wrap" id="list">'
    + '<div class="chips">' + cats.map(function(c){ return '<button class="chip" data-filter="' + esc(c) + '" aria-pressed="' + (ui.filter===c) + '">' + esc(c) + '</button>'; }).join('') + '</div>'
    + (brands.length > 1 ? '<div class="chips brands"><span class="chips-label">品牌</span>' + ['全部'].concat(brands).map(function(b){ return '<button class="chip" data-brand="' + esc(b) + '" aria-pressed="' + (ui.brand===b) + '">' + esc(b) + '</button>'; }).join('') + '</div>' : '')
    + '<div class="section-head"><h2>' + esc([ui.brand === '全部' ? '' : ui.brand, ui.filter === '全部' ? (ui.brand === '全部' ? '全部商品' : '') : ui.filter].filter(Boolean).join(' · ')) + '</h2><span>' + list.length + ' 件</span></div>'
    + '<div class="grid">' + (state.error ? '<div class="empty">' + esc(state.error) + '</div>' : list.length ? list.map(cardHtml).join('') : '<div class="empty">' + (state.loaded ? '目前還沒有商品，新貨上架後會出現在這裡。' : '載入中…') + '</div>') + '</div>'
    + '</main>' + footer();
}
function selFor(p){
  if (!ui.sel || ui.sel.id !== p.id){
    var c = p.colors.length === 1 ? p.colors[0].name : '', s = '';
    if (p.sizes.length === 1 && avail(p, c, p.sizes[0])) s = p.sizes[0];
    ui.sel = { id:p.id, color:c, size:s, err:false };
  }
  return ui.sel;
}
function selText(p, sel){ return [p.name, sel.color, sel.size].filter(Boolean).join(' / '); }
function selMissing(p, sel){ var m = []; if (p.colors.length && !sel.color) m.push('顏色'); if (p.sizes.length && !sel.size) m.push('尺寸'); return m; }
function product(id){
  var p = byId(id);
  if (!p || p.status === 'hidden') return header() + '<main class="wrap"><a class="back" href="#">← 回商品列表</a><div class="empty" style="margin:20px 0 60px">' + (state.loaded ? '找不到這個商品，可能已經下架。' : '載入中…') + '</div></main>' + footer();
  var s = state.settings, photos = p.photos.filter(photoUrl), sel = selFor(p);
  var idx = Math.min(ui.photoIdx, Math.max(0, photos.length-1));
  var sold = allSold(p), missing = selMissing(p, sel), ready = !sold && !missing.length;
  var colorsHtml = p.colors.length ? '<div class="opt"><div class="opt-label">顏色<b>' + esc(sel.color || '請選擇') + '</b></div><div class="swatches">'
    + p.colors.map(function(c){ var out = !colorAnyAvail(p, c.name); return '<button type="button" class="sw' + (out?' out':'') + '" data-color="' + esc(c.name) + '" aria-pressed="' + (sel.color===c.name) + '" title="' + esc(c.name) + (out?'（缺貨）':'') + '" aria-label="' + esc(c.name) + (out?'，缺貨':'') + '" style="background:' + safeHex(c.hex) + '"' + (out||sold?' disabled':'') + '></button>'; }).join('')
    + '</div></div>' : '';
  var sizesHtml = p.sizes.length ? '<div class="opt"><div class="opt-label">尺寸<b>' + esc(sel.size || '請選擇') + '</b></div><div class="sizebtns">'
    + p.sizes.map(function(z){ var ok = sel.color ? avail(p, sel.color, z) : sizeAnyAvail(p, z); return '<button type="button" class="sz-btn" data-size="' + esc(z) + '" aria-pressed="' + (sel.size===z) + '"' + (ok && !sold ? '' : ' disabled') + '><span>' + esc(z) + '</span>' + (ok ? '' : '<small>缺貨</small>') + '</button>'; }).join('')
    + '</div>' + (p.sizeNote ? '<div class="sizenote">' + esc(p.sizeNote) + '</div>' : '') + '</div>' : (p.sizeNote ? '<div class="opt"><div class="opt-label">尺寸</div><div class="sizenote">' + esc(p.sizeNote) + '</div></div>' : '');
  var picked = sold ? '這件已售完' : missing.length ? (sel.err ? '請先選擇' + missing.join('和') : '請選擇' + missing.join('和')) : '已選：<b>' + esc(selText(p, sel)) + '</b>';
  return header()
    + '<main class="wrap"><a class="back" href="#">← 回商品列表</a><div class="detail">'
    + '<div class="gallery"><div class="main">' + (photos.length ? '<img id="mainPhoto" src="' + photoUrl(photos[idx]) + '" alt="' + esc(p.name) + '">' : '<div class="ph-empty">尚無照片</div>') + '</div>'
    + (photos.length > 1 ? '<div class="thumbs">' + photos.map(function(ph,i){ return '<button type="button" data-thumb="' + i + '" aria-current="' + (i===idx) + '" aria-label="第 ' + (i+1) + ' 張"><img src="' + photoUrl(ph) + '" alt=""></button>'; }).join('') + '</div>' : '')
    + '</div>'
    + '<div class="info"><div class="eyebrow">' + esc([p.brand, p.category||'商品'].filter(Boolean).join(' · ')) + '</div><h2>' + esc(p.name) + '</h2>'
    + '<div class="price">' + money(p.price) + '<small>+ 運費 NT$60</small></div>'
    + '<div style="margin-top:8px">' + (sold ? '<span class="pill sold">已售完</span>' : '<span class="pill">現貨 · 可下單</span>') + '</div>'
    + colorsHtml + sizesHtml
    + '<div class="picked' + (sel.err && missing.length ? ' err' : '') + '" id="picked">' + picked + '</div>'
    + '<div class="order"><a id="orderBtn" class="btn btn-pink btn-block' + (ready ? '' : ' is-off') + '" href="' + esc(orderUrl(ready ? selText(p, sel) : '')) + '" target="_blank" rel="noopener"' + (ready ? '' : ' aria-disabled="true"') + '>' + (sold ? '已售完' : '我要下單 · 填寫表單 ↗') + '</a>'
    + '<ol class="steps"><li><i>1</i><span>選好顏色、尺寸後按「我要下單」，商品資訊會自動複製' + (s.formEntry ? '並帶入表單' : '，貼到表單「購買物品名稱、尺寸」') + '。</span></li><li><i>2</i><span>匯款「商品金額 + 60 元運費」，表單填入銀行代號與帳號後 5 碼。</span></li><li><i>3</i><span>填好 7-11 店名與店號，到貨後店取。</span></li></ol></div>'
    + '<dl class="specs"><dt>取貨</dt><dd>' + esc(s.shipping) + '</dd></dl>'
    + (p.desc ? '<div class="desc">' + esc(p.desc) + '</div>' : '')
    + '</div></div></main>' + footer();
}

/* ---------- manage: login + list ---------- */
function loginHtml(){
  var why = ui.token && ui.authChecked && !ui.canPush ? '<div class="status err">這個 Token 無法寫入 ' + esc(OWNER + '/' + REPO) + '。請確認 Token 有這個 repo 的 Contents 讀寫權限，且帳號是協作者。</div>' : '';
  return '<div class="panel login"><h2>管理登入</h2>'
    + '<div class="hint" style="margin-top:8px">上架會直接寫進 GitHub repo <b>' + esc(OWNER + '/' + REPO) + '</b>，需要一組 GitHub Token（只存在這台裝置的瀏覽器）。</div>'
    + '<form class="form" id="lform"><label>GitHub Token<input id="l-token" type="password" autocomplete="off" placeholder="github_pat_…" value="' + esc(ui.token) + '"></label>'
    + why
    + '<div class="acts"><button class="btn btn-pink" type="submit">登入</button>' + (ui.token ? '<button class="btn btn-ghost" type="button" data-act="logout">清除 Token</button>' : '') + '<span class="status" id="l-msg"></span></div></form>'
    + '<div class="hint"><b>網站擁有者（' + esc(OWNER) + '）</b>：<a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">Fine-grained token</a> → Repository access 只選 <b>' + esc(REPO) + '</b> → Permissions：Contents = <b>Read and write</b> → 產生後貼上。</div>'
    + '<div class="hint"><b>協作管理員</b>（被邀請加入的人）：先接受 repo 邀請，再建立 <a href="https://github.com/settings/tokens/new?scopes=public_repo&description=shiwananma-shop" target="_blank" rel="noopener">Classic token</a> → 勾選 <b>public_repo</b> → Generate token → 複製後貼上。</div>'
    + '</div>';
}
function gate(){
  if (!ui.authChecked) return header() + '<main class="wrap manage"><div class="empty">確認身分中…</div></main>' + footer();
  if (!ui.canPush) return header() + '<main class="wrap manage">' + loginHtml() + '</main>' + footer();
  return '';
}
function manage(){
  var g = gate(); if (g) return g;
  var rows = state.products.slice().sort(function(a,b){ return (b.createdAt||0)-(a.createdAt||0); });
  var d = ui.draft;
  return header() + '<main class="wrap manage">'
    + '<div class="banner">儲存後 GitHub Pages 約 1–2 分鐘才會更新公開網站；管理頁會立即顯示最新資料。</div>'
    + '<div class="panel"><h2>商品 <span class="status">' + rows.length + ' 件</span>' + (d ? '' : '<span class="grow"><a class="btn btn-ink btn-sm" href="#batch">批次上架</a><button class="btn btn-pink btn-sm" data-act="new">＋ 新增商品</button></span>') + '</h2>'
    + (d ? formHtml(d) : '')
    + '<div class="rows">' + (rows.length ? rows.map(function(p){
        var st = p.status === 'hidden' ? '已下架' : allSold(p) ? '售完' : '上架中';
        var meta = (p.brand ? [esc(p.brand)] : []).concat([money(p.price), esc(p.category||'')]).concat(p.colors.length ? [p.colors.length + ' 色'] : []).concat(p.sizes.length ? [esc(p.sizes.join('/'))] : []).concat([st]).join(' · ');
        return '<div class="row-p">' + (p.photos[0] ? '<img src="' + photoUrl(p.photos[0]) + '" alt="">' : '<div style="width:56px;height:56px;border-radius:8px;background:var(--tile)"></div>')
          + '<div class="t"><div>' + esc(p.name) + '</div><small>' + meta + '</small></div>'
          + '<div class="acts">' + (ui.confirmId === p.id
              ? '<span class="confirm">確定刪除？照片也會一起刪除 <button class="btn btn-danger btn-sm" data-act="delete" data-id="' + p.id + '"' + (ui.busy?' disabled':'') + '>確定刪除</button><button class="btn btn-ghost btn-sm" data-act="cancel-del">取消</button></span>'
              : '<a class="btn btn-ghost btn-sm" href="#' + p.id + '">查看</a><button class="btn btn-ghost btn-sm" data-act="edit" data-id="' + p.id + '">編輯</button>'
                + '<button class="btn btn-ghost btn-sm" data-act="status" data-id="' + p.id + '" data-to="' + (p.status==='sold'?'active':'sold') + '"' + (ui.busy?' disabled':'') + '>' + (p.status==='sold'?'改回現貨':'標示售完') + '</button>'
                + '<button class="btn btn-ghost btn-sm" data-act="status" data-id="' + p.id + '" data-to="' + (p.status==='hidden'?'active':'hidden') + '"' + (ui.busy?' disabled':'') + '>' + (p.status==='hidden'?'重新上架':'下架') + '</button>'
                + '<button class="btn btn-danger btn-sm" data-act="ask-del" data-id="' + p.id + '">刪除</button>')
          + '</div></div>';
      }).join('') : '<div class="hint">還沒有商品。按「新增商品」或「批次上架」開始。</div>') + '</div>'
    + '<div class="status" id="list-msg" style="margin-top:10px">' + esc(ui.busy) + '</div></div>'
    + settingsHtml()
    + '<div class="panel"><h2>帳號' + (ui.me ? '<span class="who"><img src="' + esc(ui.me.avatar_url) + '" alt="">' + esc(ui.me.login) + '</span>' : '') + '</h2><div style="margin-top:10px;display:flex;gap:10px"><button class="btn btn-ghost btn-sm" data-act="logout">登出（清除這台裝置的 Token）</button></div><div class="hint">要讓別人也能上架：GitHub repo → Settings → Collaborators 加入對方帳號，對方再用自己的 Token 登入。</div></div>'
    + '</main>' + footer();
}

/* ---------- single product form ---------- */
function formHtml(d){
  return '<form class="form" id="pform" autocomplete="off">'
    + '<label>品牌<input id="f-brand" data-f="brand" maxlength="40" value="' + esc(d.brand) + '" placeholder="例：Insane" list="brand-list"></label><datalist id="brand-list">' + allBrands().map(function(b){ return '<option value="' + esc(b) + '">'; }).join('') + '</datalist>'
    + '<label>商品名稱 *<input id="f-name" data-f="name" required maxlength="80" value="' + esc(d.name) + '" placeholder="例：越南亞麻寬褲"></label>'
    + '<label>價格（' + esc(state.settings.currency) + '）*<input id="f-price" data-f="price" type="number" inputmode="numeric" min="0" step="1" required value="' + esc(d.price) + '"></label>'
    + '<label>分類<select id="f-cat" data-f="category">' + CATS.map(function(c){ return '<option' + (d.category===c?' selected':'') + '>' + c + '</option>'; }).join('') + '</select></label>'
    + '<div class="full"><div class="flabel">照片（最多 5 張，第 1 張是封面）<input id="f-photos" class="fld" type="file" accept="image/*" multiple' + (ui.photos.length>=MAX_PHOTOS?' disabled':'') + '></div>'
    + '<div class="photos" id="photo-strip">' + photosHtml() + '</div><div class="hint">照片會自動縮到 1200px 並壓縮。</div></div>'
    + '<div class="vbox" id="vbox">' + variantHtml(d) + '</div>'
    + '<label class="full">商品說明<textarea id="f-desc" data-f="desc" maxlength="1500" placeholder="材質、版型、注意事項…">' + esc(d.desc) + '</textarea></label>'
    + '<label>狀態<select id="f-status" data-f="status"><option value="active"' + (d.status==='active'?' selected':'') + '>上架中</option><option value="sold"' + (d.status==='sold'?' selected':'') + '>售完（整件）</option><option value="hidden"' + (d.status==='hidden'?' selected':'') + '>下架（不顯示）</option></select></label>'
    + '<div class="acts"><button class="btn btn-pink" type="submit" id="f-save"' + (ui.busy?' disabled':'') + '>' + (d.id ? '儲存變更' : '上架商品') + '</button><button class="btn btn-ghost" type="button" data-act="cancel-edit"' + (ui.busy?' disabled':'') + '>取消</button><span class="status ' + ui.msgKind + '" id="f-status-msg">' + esc(ui.busy || ui.msg) + '</span></div>'
    + '</form>';
}
function variantHtml(d){
  var photoOpts = function(sel){ var o = '<option value=""' + (sel==null?' selected':'') + '>不指定照片</option>'; for (var i=0;i<ui.photos.length;i++) o += '<option value="' + i + '"' + (sel===i?' selected':'') + '>選此色顯示第 ' + (i+1) + ' 張</option>'; return o; };
  var colors = d.colors.map(function(c, i){
    return '<div class="crow"><input type="color" data-ci="' + i + '" data-ck="hex" value="' + safeHex(c.hex) + '" aria-label="顏色色塊"><input class="fld" data-ci="' + i + '" data-ck="name" value="' + esc(c.name) + '" maxlength="20" placeholder="顏色名稱" aria-label="顏色名稱"><select class="fld" data-ci="' + i + '" data-ck="photo" aria-label="對應照片">' + photoOpts(c.photo) + '</select><button type="button" class="x" data-act="c-rm" data-i="' + i + '" aria-label="移除顏色">×</button></div>';
  }).join('');
  var quick = QUICK_COLORS.filter(function(n){ return !d.colors.some(function(c){ return c.name === n; }); }).map(function(n){ return '<button type="button" data-act="c-quick" data-name="' + esc(n) + '"><span class="dot" style="background:' + colorHex(n) + '"></span>' + esc(n) + '</button>'; }).join('');
  return '<h3>顏色</h3>' + (colors || '<div class="hint" style="margin:0">沒有顏色選項就留空（客人不用選顏色）。</div>')
    + '<div class="quick"><button type="button" data-act="c-add"><span class="dot" style="background:#fff"></span>＋ 自訂顏色</button>' + quick + '</div>'
    + '<h3>尺寸</h3><input class="fld" id="f-sizes" value="' + esc(d.sizes.join(' ')) + '" placeholder="用空格或逗號分開，例：S M L XL" aria-label="尺寸">'
    + '<div class="quick">快速填入：' + SIZE_PRESETS.map(function(p){ return '<button type="button" data-act="s-preset" data-v="' + esc(p[1]) + '">' + esc(p[0]) + '</button>'; }).join('') + '</div>'
    + '<label class="flabel">尺寸說明（選填，顯示在尺寸按鈕下方）<input class="fld" data-f="sizeNote" value="' + esc(d.sizeNote) + '" maxlength="200" placeholder="例：M 腰圍 68cm、褲長 95cm；模特兒 160cm 穿 M"></label>'
    + '<div id="matrix">' + matrixHtml(d) + '</div>';
}
function matrixHtml(d){
  if (!d.colors.length && !d.sizes.length) return '';
  var cs = d.colors.length ? d.colors.map(function(c){ return c.name; }).filter(Boolean) : [''], ss = d.sizes.length ? d.sizes : [''];
  return '<h3>庫存（打勾 = 有貨，取消 = 缺貨）</h3><div class="matrix-wrap"><table class="matrix"><thead><tr><th>' + (d.colors.length ? '顏色 \\ 尺寸' : '') + '</th>' + ss.map(function(s){ return '<th>' + esc(s || '有貨') + '</th>'; }).join('') + '</tr></thead><tbody>'
    + cs.map(function(c){ return '<tr><th>' + (c ? esc(c) : '全部') + '</th>' + ss.map(function(s){ var k = combo(c, s); return '<td><input type="checkbox" data-combo="' + esc(k) + '"' + (d.soldOut.indexOf(k) === -1 ? ' checked' : '') + ' aria-label="' + esc((c||'') + ' ' + (s||'')) + ' 有貨"></td>'; }).join('') + '</tr>'; }).join('')
    + '</tbody></table></div>';
}
function photosHtml(){
  var out = '';
  for (var i=0;i<MAX_PHOTOS;i++){
    var ph = ui.photos[i];
    if (ph) out += '<div class="slot"><img src="' + esc(ph.url) + '" alt=""><span class="n">' + (i===0?'封面':i+1) + '</span><button type="button" class="x" data-ph="rm" data-i="' + i + '" aria-label="移除">×</button><div class="mv">' + (i>0?'<button type="button" data-ph="left" data-i="' + i + '" aria-label="往前">‹</button>':'') + (i<ui.photos.length-1?'<button type="button" data-ph="right" data-i="' + i + '" aria-label="往後">›</button>':'') + '</div></div>';
    else out += '<div class="slot">' + (i===ui.photos.length ? '＋ 加照片' : '') + '</div>';
  }
  return out;
}
function refreshVariants(){ var v = document.getElementById('vbox'); if (v) v.innerHTML = variantHtml(ui.draft); }
function refreshMatrix(){ var m = document.getElementById('matrix'); if (m) m.innerHTML = matrixHtml(ui.draft); }
function refreshStrip(){
  var strip = document.getElementById('photo-strip'); if (strip) strip.innerHTML = photosHtml();
  var inp = document.getElementById('f-photos'); if (inp){ inp.value=''; inp.disabled = ui.photos.length>=MAX_PHOTOS; }
  ui.draft.colors.forEach(function(c){ if (c.photo != null && c.photo >= ui.photos.length) c.photo = null; });
  refreshVariants();
}
function addPhotos(files){
  var room = MAX_PHOTOS - ui.photos.length, list = Array.prototype.slice.call(files, 0, Math.max(0, room));
  if (files.length > room) setMsg('最多 5 張，多出的 ' + (files.length - room) + ' 張沒有加入。', 'err');
  var chain = Promise.resolve();
  list.forEach(function(f){ chain = chain.then(function(){ return compress(f).then(function(blob){ ui.photos.push({blob:blob, url:URL.createObjectURL(blob)}); }, function(){ setMsg('「' + f.name + '」無法讀取，請改用 JPG/PNG（iPhone 請先轉成 JPG）。', 'err'); }); }); });
  chain.then(refreshStrip);
}
function cleanVariants(p){
  var seen = {};
  p.colors = p.colors.filter(function(c){ c.name = c.name.trim(); if (!c.name || seen[c.name]) return false; seen[c.name] = 1; return true; });
  var valid = {}; colorNames(p).forEach(function(c){ sizeNames(p).forEach(function(s){ valid[combo(c, s)] = 1; }); });
  p.soldOut = p.soldOut.filter(function(k, i, a){ return valid[k] && a.indexOf(k) === i; });
  return p;
}
function saveProduct(){
  var d = ui.draft; if (!d || ui.busy) return;
  d.sizes = parseSizes(document.getElementById('f-sizes').value);
  var name = String(d.name||'').trim(), price = String(d.price).trim();
  if (!name){ setMsg('請填商品名稱。', 'err'); return; }
  if (price === '' || !(Number(price) >= 0)){ setMsg('請填價格。', 'err'); return; }
  var id = d.id || newId(), stamp = Date.now().toString(36), files = [];
  var paths = ui.photos.map(function(x, i){ if (x.path) return x.path; var path = 'photos/' + id + '-' + stamp + '-' + (i+1) + '.jpg'; files.push({path:path, blob:x.blob}); return path; });
  var p = cleanVariants(normalize({ id:id, brand:String(d.brand||'').trim(), name:name, price:Number(price), category:d.category, colors:d.colors.map(function(c){ return Object.assign({}, c); }), sizes:d.sizes, soldOut:d.soldOut.slice(), sizeNote:String(d.sizeNote||'').trim(), desc:String(d.desc||'').trim(), status:d.status, createdAt:d.createdAt || Date.now(), updatedAt:Date.now(), photos:paths }));
  setBusy('準備中…');
  commit({ files:files, message:(d.id ? '更新商品：' : '上架商品：') + name, onProgress:function(t){ if (t) setBusy(t); },
    mutate:function(data){
      var i = data.products.findIndex(function(x){ return x.id === id; }), deletes = [];
      if (i >= 0){ deletes = data.products[i].photos.filter(function(ph){ return paths.indexOf(ph) === -1; }); data.products[i] = p; }
      else data.products.unshift(p);
      return { deletes:deletes };
    }
  }).then(function(){ setBusy(''); ui.draft = null; ui.photos = []; ui.msg = ''; render(); toast('已儲存，公開網站約 1–2 分鐘後更新'); })
    .catch(function(e){ setBusy(''); setMsg('儲存失敗：' + errText(e), 'err'); });
}
function deleteProduct(id){
  var p = byId(id); if (!p || ui.busy) return;
  ui.confirmId = null; setBusy('刪除中…'); render();
  commit({ message:'刪除商品：' + p.name, mutate:function(data){ var t = data.products.filter(function(x){ return x.id === id; })[0]; data.products = data.products.filter(function(x){ return x.id !== id; }); return { deletes: t ? t.photos : [] }; } })
    .then(function(){ setBusy(''); render(); toast('已刪除'); }, function(e){ setBusy(''); render(); setMsg('刪除失敗：' + errText(e), 'err'); });
}
function setStatus(id, to){
  var p = byId(id); if (!p || ui.busy) return;
  setBusy('儲存中…'); render();
  commit({ message:'狀態：' + p.name + ' → ' + to, mutate:function(data){ data.products.forEach(function(x){ if (x.id === id){ x.status = to; x.updatedAt = Date.now(); } }); } })
    .then(function(){ setBusy(''); render(); toast('已更新'); }, function(e){ setBusy(''); render(); setMsg('更新失敗：' + errText(e), 'err'); });
}

/* ---------- settings ---------- */
function settingsHtml(){
  var s = state.settings;
  return '<div class="panel"><h2>網站設定</h2><form class="form" id="sform" autocomplete="off">'
    + '<label class="full">首頁介紹<textarea id="s-intro" maxlength="300" style="min-height:70px">' + esc(s.intro) + '</textarea></label>'
    + '<label class="full">公告（留空就不顯示）<input id="s-notice" maxlength="200" value="' + esc(s.notice) + '" placeholder="例：本週五截單，下週三出貨"></label>'
    + '<label>Instagram 帳號<input id="s-ig" maxlength="40" value="' + esc(s.ig) + '" placeholder="不含 @"></label>'
    + '<label>幣別顯示<input id="s-cur" maxlength="6" value="' + esc(s.currency) + '"></label>'
    + '<label class="full">取貨／運費說明<input id="s-ship" maxlength="120" value="' + esc(s.shipping) + '"></label>'
    + '<label class="full">Google 表單連結<input id="s-form" type="url" value="' + esc(s.formUrl) + '"></label>'
    + '<label class="full">自動帶入商品到表單（選填）<input id="s-prefill" value="' + esc(s.formEntry) + '" placeholder="貼上表單的「預先填入連結」"></label>'
    + '<div class="hint full" style="margin-top:-6px">設定方式：Google 表單編輯頁 → 右上 ⋮ → <b>取得預先填入的連結</b> → 在「購買物品名稱、尺寸」填 <code>TEST</code> → 取得連結 → 複製後貼到上面。設定後客人按下單，商品／顏色／尺寸會自動填好。目前：' + (s.formEntry ? '<b>已設定 ' + esc(s.formEntry) + '</b>' : '未設定') + '</div>'
    + '<div class="acts"><button class="btn btn-ink" type="submit"' + (ui.busy?' disabled':'') + '>儲存設定</button><span class="status" id="s-msg"></span></div></form></div>';
}
function saveSettings(){
  if (ui.busy) return;
  var form = document.getElementById('s-form').value.trim(), pre = document.getElementById('s-prefill').value.trim();
  if (form && !/^https:\/\//.test(form)){ setMsg('表單連結要以 https:// 開頭。', 'err'); return; }
  var entry = '';
  if (pre){ var m = pre.match(/(entry\.\d+)=TEST/i) || pre.match(/(entry\.\d+)=/) || pre.match(/^(entry\.\d+)$/); if (!m){ setMsg('預先填入連結裡找不到 entry 欄位，請照說明重新複製。', 'err'); return; } entry = m[1]; }
  var next = {
    intro: document.getElementById('s-intro').value.trim() || DEFAULTS.intro,
    notice: document.getElementById('s-notice').value.trim(),
    ig: document.getElementById('s-ig').value.trim().replace(/^@/,''),
    currency: document.getElementById('s-cur').value.trim() || 'NT$',
    shipping: document.getElementById('s-ship').value.trim() || DEFAULTS.shipping,
    formUrl: form || FORM_URL,
    formEntry: entry
  };
  ui.busy = '儲存中…'; setMsg('儲存中…');
  commit({ message:'更新網站設定', mutate:function(data){ Object.assign(data.settings, next); } })
    .then(function(){ ui.busy=''; render(); toast('設定已儲存'); }, function(e){ ui.busy=''; setMsg('儲存失敗：' + errText(e), 'err'); });
}

/* ---------- batch ---------- */
function groupKey(filename){
  // 「亞麻寬褲-1」「亞麻寬褲 (2)」「褲子1」→ 同一組；「IMG_1234」「A01」維持原樣
  var base = String(filename).replace(/\.[^.]+$/, '').trim();
  var m = base.match(/^(.*?)([\s_\-–—.]*)[(（]?(\d{1,2})[)）]?$/);
  if (m && m[1] && (m[2] || /[^\x00-\x7F]$/.test(m[1]))) return m[1].replace(/[\s_\-–—.(（]+$/, '').trim() || base;
  return base;
}
function makeItem(key, photos){ return { key:key, brand:'', name:'', price:'', category:CATS[0], sizes:'', colors:'', sizeNote:'', desc:'', status:'active', photos:photos }; }
function groupPhotos(photos, mode, n){
  var items = [];
  if (mode === 'single') photos.forEach(function(ph){ items.push(makeItem(groupKey(ph.name), [ph])); });
  else if (mode === 'count'){ n = Math.max(1, Math.min(MAX_PHOTOS, n|0 || 1)); for (var i=0;i<photos.length;i+=n) items.push(makeItem(groupKey(photos[i].name), photos.slice(i, i+n))); }
  else {
    var map = {}, order = [];
    photos.forEach(function(ph){ var k = groupKey(ph.name); if (!map[k]){ map[k] = []; order.push(k); } map[k].push(ph); });
    order.forEach(function(k){ items.push(makeItem(k, map[k])); });
  }
  var out = [];
  items.forEach(function(it){
    for (var j=0;j<it.photos.length;j+=MAX_PHOTOS){ var part = makeItem(it.key, it.photos.slice(j, j+MAX_PHOTOS)); if (j) part.key = it.key + '（' + (j/MAX_PHOTOS+1) + '）'; out.push(part); }
  });
  out.forEach(function(it){ if (mode === 'name' && !/^(IMG|DSC|DSCN|PXL|MVIMG|Screenshot|image|photo)[\s_\-]/i.test(it.key) && !/^\d+$/.test(it.key)) it.name = it.key; });
  return out;
}
function allBatchPhotos(){ var all = []; ui.batch.items.forEach(function(it){ all = all.concat(it.photos); }); return all.sort(function(a,b){ return a.seq - b.seq; }); }
var photoSeq = 0;
function addBatchFiles(files){
  var b = ui.batch, list = Array.prototype.slice.call(files).filter(function(f){ return /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|heic)$/i.test(f.name); });
  if (!list.length) return;
  list.sort(function(a,b){ return natCmp(a.name, b.name); });
  var added = [], bad = [], done = 0;
  b.msg = '處理照片 0/' + list.length + '…'; b.msgKind = ''; render();
  var chain = Promise.resolve();
  list.forEach(function(f){
    chain = chain.then(function(){
      return compress(f).then(function(blob){ added.push({ blob:blob, url:URL.createObjectURL(blob), name:f.name, seq:photoSeq++ }); }, function(){ bad.push(f.name); })
        .then(function(){ done++; var el = document.getElementById('b-msg'); if (el) el.textContent = '處理照片 ' + done + '/' + list.length + '…'; });
    });
  });
  chain.then(function(){
    b.items = b.items.concat(groupPhotos(added, b.mode, b.n));
    b.msg = bad.length ? bad.length + ' 張無法讀取（' + bad.slice(0,3).join('、') + (bad.length>3?'…':'') + '），請轉成 JPG/PNG。' : '';
    b.msgKind = bad.length ? 'err' : '';
    render();
  });
}
function batchHtml(){
  var g = gate(); if (g) return g;
  var b = ui.batch, items = b.items, nPhotos = items.reduce(function(s, it){ return s + it.photos.length; }, 0);
  var bad = items.map(batchErrors);
  var nBad = bad.filter(function(e){ return e.length; }).length;
  return header() + '<main class="wrap manage">'
    + '<a class="back" href="#manage" style="margin-top:0">← 回管理</a>'
    + '<div class="panel"><h2>1. 選照片</h2>'
    + '<div class="hint">最省事的方法：照片檔名用「<b>商品名稱-編號</b>」，例如 <code>亞麻寬褲-1.jpg</code>、<code>亞麻寬褲-2.jpg</code>、<code>條紋襯衫-1.jpg</code>，系統會自動分成同一件、名稱也自動帶入。手機拍的 <code>IMG_1234</code> 這類檔名，可改用「每件 N 張」。</div>'
    + '<label class="drop" id="b-drop"><b>＋ 選擇照片（可一次選很多張）</b><span>或把照片拖進這裡 · 依檔名排序 · 每件最多 5 張</span><input id="b-files" type="file" accept="image/*" multiple hidden></label>'
    + '<div class="modes" role="radiogroup" aria-label="分組方式">分組方式：'
    + '<label><input type="radio" name="b-mode" value="name"' + (b.mode==='name'?' checked':'') + '> 依檔名（同名同一件）</label>'
    + '<label><input type="radio" name="b-mode" value="count"' + (b.mode==='count'?' checked':'') + '> 每件 <input class="fld" id="b-n" type="number" min="1" max="5" value="' + b.n + '"> 張</label>'
    + '<label><input type="radio" name="b-mode" value="single"' + (b.mode==='single'?' checked':'') + '> 每張一件</label>'
    + (items.length ? '<button type="button" class="btn btn-ghost btn-sm" data-act="b-regroup">用這個方式重新分組</button>' : '')
    + '</div>'
    + '<div class="status ' + b.msgKind + '" id="b-msg" style="margin-top:10px">' + esc(b.msg) + (items.length ? '' : '') + '</div>'
    + (items.length ? '<div class="hint">目前 ' + nPhotos + ' 張照片 → ' + items.length + ' 件商品。重新分組會清除下方已填的資料。</div>' : '')
    + '</div>'
    + (items.length ? commonHtml() + listHtml(bad) : '')
    + (items.length ? '<div class="sticky"><div class="in"><button class="btn btn-pink" data-act="b-upload"' + (b.uploading || nBad ? ' disabled' : '') + '>' + (b.uploading ? '上架中…' : '全部上架（' + items.length + ' 件、' + nPhotos + ' 張）') + '</button>'
      + (b.uploading ? '<div class="bar"><i id="b-bar" style="width:' + Math.round(b.progress*100) + '%"></i></div>' : '')
      + '<span class="status ' + (nBad ? 'err' : '') + '" id="b-up-msg">' + (b.uploading ? '' : nBad ? nBad + ' 件還缺資料（名稱或價格）' : '確認無誤就按上架') + '</span>'
      + (b.uploading ? '' : '<button class="btn btn-ghost btn-sm" data-act="b-clear" style="margin-left:auto">全部清除</button>') + '</div></div>' : '')
    + '</main>' + footer();
}
function commonHtml(){
  return '<div class="panel"><h2>2. 共同設定（選填）</h2><div class="hint">填了的欄位會套用到下面全部商品；沒填的不會動。</div>'
    + '<div class="form" id="b-common">'
    + '<label>品牌<input id="bc-brand" placeholder="例：Insane" list="brand-list"></label><datalist id="brand-list">' + allBrands().map(function(b){ return '<option value="' + esc(b) + '">'; }).join('') + '</datalist>'
    + '<label>價格<input id="bc-price" type="number" min="0" step="1" inputmode="numeric"></label>'
    + '<label>分類<select id="bc-cat"><option value="">（不改）</option>' + CATS.map(function(c){ return '<option>' + c + '</option>'; }).join('') + '</select></label>'
    + '<label>尺寸<input id="bc-sizes" placeholder="例：S M L"></label>'
    + '<label>顏色<input id="bc-colors" placeholder="例：黑, 白, 卡其"></label>'
    + '<label class="full">尺寸說明<input id="bc-note" placeholder="例：模特兒 160cm 穿 M"></label>'
    + '<div class="acts"><button type="button" class="btn btn-ink btn-sm" data-act="b-apply">套用到全部</button></div></div>'
    + '<details class="more"><summary>從 Excel／Google 試算表貼上</summary>'
    + '<div class="hint">在試算表照順序排好欄位：<b>名稱｜價格｜分類｜尺寸｜顏色｜說明</b>（可以只到價格），一列一件，順序要跟下面商品順序一樣。選取儲存格 → 複製 → 貼到這裡。第一列如果是標題會自動略過。</div>'
    + '<textarea class="fld paste" id="b-paste" placeholder="亞麻寬褲&#9;690&#9;褲子&#9;S M L&#9;米白, 黑&#10;條紋襯衫&#9;520&#9;上衣&#9;F&#9;藍"></textarea>'
    + '<div class="acts-row"><button type="button" class="btn btn-ink btn-sm" data-act="b-paste">套用貼上的資料</button><span class="status" id="b-paste-msg"></span></div></details>'
    + '</div>';
}
function batchErrors(it){
  var e = [];
  if (!String(it.name).trim()) e.push('缺名稱');
  if (String(it.price).trim() === '' || !(Number(it.price) >= 0)) e.push('缺價格');
  if (it.photos.length > MAX_PHOTOS) e.push('照片超過 5 張');
  return e;
}
function listHtml(bad){
  var items = ui.batch.items, last = items.length - 1;
  return '<div class="panel"><h2>3. 確認商品（' + items.length + ' 件）</h2><div class="hint">第 1 張照片是封面。照片下的「↑」「↓」可移到上一件或下一件商品。</div><div class="btable">'
    + items.map(function(it, i){
      var ph = it.photos.map(function(p, j){
        return '<div class="slot"><img src="' + esc(p.url) + '" alt="">' + (j===0 ? '<span class="n">封面</span>' : '')
          + '<button type="button" class="x" data-act="b-ph-rm" data-i="' + i + '" data-j="' + j + '" aria-label="移除照片">×</button>'
          + '<div class="mv">' + (i>0 ? '<button type="button" data-act="b-ph-up" data-i="' + i + '" data-j="' + j + '" title="移到上一件">↑</button>' : '')
          + (j>0 ? '<button type="button" data-act="b-ph-cover" data-i="' + i + '" data-j="' + j + '" title="設為封面">★</button>' : '')
          + (i<last ? '<button type="button" data-act="b-ph-down" data-i="' + i + '" data-j="' + j + '" title="移到下一件">↓</button>' : '') + '</div></div>';
      }).join('');
      var e = bad[i];
      return '<div class="bitem' + (e.length ? ' bad' : '') + '"><div class="bhead"><b>#' + (i+1) + '</b><span>' + esc(it.key) + ' · ' + it.photos.length + ' 張</span><span class="grow">'
        + (i>0 ? '<button type="button" class="btn btn-ghost btn-xs" data-act="b-merge" data-i="' + i + '">合併到上一件</button>' : '')
        + (it.photos.length > 1 ? '<button type="button" class="btn btn-ghost btn-xs" data-act="b-split" data-i="' + i + '">拆成每張一件</button>' : '')
        + '<button type="button" class="btn btn-danger btn-xs" data-act="b-del" data-i="' + i + '">刪除這件</button></span></div>'
        + '<div class="bphotos">' + (ph || '<div class="hint">沒有照片</div>') + '</div>'
        + '<div class="bfields">'
        + '<label>品牌<input class="fld" data-bi="' + i + '" data-bk="brand" value="' + esc(it.brand) + '" maxlength="40" list="brand-list"></label>'
        + '<label>名稱 *<input class="fld" data-bi="' + i + '" data-bk="name" value="' + esc(it.name) + '" maxlength="80"></label>'
        + '<label>價格 *<input class="fld" data-bi="' + i + '" data-bk="price" type="number" min="0" step="1" inputmode="numeric" value="' + esc(it.price) + '"></label>'
        + '<label>分類<select class="fld" data-bi="' + i + '" data-bk="category">' + CATS.map(function(c){ return '<option' + (it.category===c?' selected':'') + '>' + c + '</option>'; }).join('') + '</select></label>'
        + '<label>尺寸<input class="fld" data-bi="' + i + '" data-bk="sizes" value="' + esc(it.sizes) + '" placeholder="S M L"></label>'
        + '<label>顏色<input class="fld" data-bi="' + i + '" data-bk="colors" value="' + esc(it.colors) + '" placeholder="黑, 白"></label>'
        + '<label class="w3">說明<input class="fld" data-bi="' + i + '" data-bk="desc" value="' + esc(it.desc) + '" maxlength="1500" placeholder="材質、版型…"></label>'
        + '</div>' + (e.length ? '<div class="errs">' + e.join('、') + '</div>' : '') + '</div>';
    }).join('') + '</div></div>';
}
function refreshBatchStatus(){
  var items = ui.batch.items, nBad = 0, boxes = app.querySelectorAll('.bitem');
  items.forEach(function(it, i){
    var e = batchErrors(it), box = boxes[i]; if (e.length) nBad++;
    if (!box) return;
    box.classList.toggle('bad', !!e.length);
    var er = box.querySelector('.errs');
    if (e.length){ if (!er){ er = document.createElement('div'); er.className = 'errs'; box.appendChild(er); } er.textContent = e.join('、'); }
    else if (er) er.remove();
  });
  var btn = app.querySelector('[data-act="b-upload"]'), m = document.getElementById('b-up-msg');
  if (btn && !ui.batch.uploading) btn.disabled = !!nBad;
  if (m && !ui.batch.uploading){ m.textContent = nBad ? nBad + ' 件還缺資料（名稱或價格）' : '確認無誤就按上架'; m.className = 'status' + (nBad ? ' err' : ''); }
}
function applyCommon(){
  var v = function(id){ return document.getElementById(id).value.trim(); };
  var brand = v('bc-brand'), price = v('bc-price'), cat = v('bc-cat'), sizes = v('bc-sizes'), colors = v('bc-colors'), note = v('bc-note'), n = 0;
  ui.batch.items.forEach(function(it){ if (brand) it.brand = brand; if (price !== ''){ it.price = price; } if (cat) it.category = cat; if (sizes) it.sizes = sizes; if (colors) it.colors = colors; if (note) it.sizeNote = note; });
  n = [brand, price, cat, sizes, colors, note].filter(Boolean).length;
  render(); toast(n ? '已套用到 ' + ui.batch.items.length + ' 件' : '共同設定都是空的');
}
function applyPaste(){
  var raw = document.getElementById('b-paste').value.replace(/\r/g,'').split('\n');
  while (raw.length && !raw[raw.length-1].trim()) raw.pop();   // 只去掉結尾空行；中間空列保留位置（= 不改那件）
  if (raw.length && /名稱|品名|name/i.test(raw[0])) raw.shift();
  var items = ui.batch.items, used = Math.min(raw.length, items.length);
  for (var i=0;i<used;i++){
    var c = raw[i].split('\t').map(function(x){ return x.trim(); }), it = items[i];
    if (c[0]) it.name = c[0];
    if (c[1]) it.price = String(c[1]).replace(/[^\d.]/g,'');
    if (c[2] && CATS.indexOf(c[2]) !== -1) it.category = c[2];
    if (c[3]) it.sizes = c[3];
    if (c[4]) it.colors = c[4];
    if (c[5]) it.desc = c[5];
  }
  render();
  toast('已套用 ' + used + ' 列' + (raw.length > items.length ? '（多出 ' + (raw.length - items.length) + ' 列沒有對應商品）' : raw.length < items.length ? '（還有 ' + (items.length - raw.length) + ' 件沒填到）' : ''));
}
function uploadBatch(){
  var b = ui.batch; if (b.uploading) return;
  if (b.items.some(function(it){ return batchErrors(it).length; })){ render(); return; }
  var stamp = Date.now().toString(36), now = Date.now(), files = [];
  var prods = b.items.map(function(it, i){
    var id = newId();
    var paths = it.photos.map(function(ph, j){ var path = 'photos/' + id + '-' + stamp + '-' + (j+1) + '.jpg'; files.push({ path:path, blob:ph.blob }); return path; });
    return cleanVariants(normalize({ id:id, brand:String(it.brand||'').trim(), name:String(it.name).trim(), price:Number(it.price), category:it.category, colors:parseColors(it.colors), sizes:parseSizes(it.sizes), soldOut:[], sizeNote:String(it.sizeNote||'').trim(), desc:String(it.desc||'').trim(), status:'active', createdAt:now - i, updatedAt:now, photos:paths }));
  });
  b.uploading = true; b.progress = 0; render();
  commit({ files:files, message:'批次上架 ' + prods.length + ' 件',
    onProgress:function(t, f){ b.progress = f; var bar = document.getElementById('b-bar'); if (bar) bar.style.width = Math.round(f*100) + '%'; var m = document.getElementById('b-up-msg'); if (m && t) m.textContent = t; },
    mutate:function(data){ data.products = prods.concat(data.products); }
  }).then(function(){
    b.items.forEach(function(it){ it.photos.forEach(function(p){ URL.revokeObjectURL(p.url); }); });
    b.items = []; b.uploading = false; b.msg = ''; location.hash = 'manage'; render(); toast('已上架 ' + prods.length + ' 件，公開網站約 1–2 分鐘後更新');
  }).catch(function(e){ b.uploading = false; render(); var m = document.getElementById('b-up-msg'); if (m){ m.textContent = '上架失敗：' + errText(e) + '（照片還在，可以再按一次）'; m.className = 'status err'; } });
}
function batchClick(act, t){
  var b = ui.batch, i = +t.dataset.i, j = +t.dataset.j, items = b.items;
  if (act === 'b-regroup'){ var all = allBatchPhotos(); b.items = groupPhotos(all, b.mode, b.n); }
  else if (act === 'b-clear'){ items.forEach(function(it){ it.photos.forEach(function(p){ URL.revokeObjectURL(p.url); }); }); b.items = []; b.msg = ''; }
  else if (act === 'b-apply') return applyCommon();
  else if (act === 'b-paste') return applyPaste();
  else if (act === 'b-upload') return uploadBatch();
  else if (act === 'b-del'){ items[i].photos.forEach(function(p){ URL.revokeObjectURL(p.url); }); items.splice(i, 1); }
  else if (act === 'b-merge'){ items[i-1].photos = items[i-1].photos.concat(items[i].photos); items.splice(i, 1); if (items[i-1].photos.length > MAX_PHOTOS) toast('第 ' + i + ' 件超過 5 張，請移除或移走部分照片'); }
  else if (act === 'b-split'){ var parts = items[i].photos.map(function(p){ var it = makeItem(items[i].key, [p]); it.name = items[i].name; it.price = items[i].price; it.category = items[i].category; it.sizes = items[i].sizes; it.colors = items[i].colors; return it; }); Array.prototype.splice.apply(items, [i, 1].concat(parts)); }
  else if (act === 'b-ph-rm'){ URL.revokeObjectURL(items[i].photos[j].url); items[i].photos.splice(j, 1); if (!items[i].photos.length) items.splice(i, 1); }
  else if (act === 'b-ph-cover'){ var c = items[i].photos.splice(j, 1)[0]; items[i].photos.unshift(c); }
  else if (act === 'b-ph-up' || act === 'b-ph-down'){
    var to = act === 'b-ph-up' ? i-1 : i+1, ph = items[i].photos.splice(j, 1)[0];
    if (act === 'b-ph-up') items[to].photos.push(ph); else items[to].photos.unshift(ph);
    if (items[to].photos.length > MAX_PHOTOS) toast('第 ' + (to+1) + ' 件超過 5 張');
    if (!items[i].photos.length) items.splice(i, 1);
  }
  render();
}

/* ---------- render ---------- */
function render(){
  var r = route();
  if (r.view !== 'manage' && ui.draft){ ui.draft = null; ui.photos = []; }
  app.innerHTML = r.view === 'product' ? product(r.id) : r.view === 'manage' ? manage() : r.view === 'batch' ? batchHtml() : home();
}
function setMsg(text, kind){
  ui.msg = text; ui.msgKind = kind||'';
  ['f-status-msg','s-msg','list-msg'].forEach(function(id){ var el = document.getElementById(id); if (el){ el.textContent = (id === 's-msg' ? '' : ui.busy) || text; el.className = 'status ' + (kind||''); } });
}
function setBusy(text){ ui.busy = text; setMsg(ui.msg, ui.msgKind); var b = document.getElementById('f-save'); if (b) b.disabled = !!text; }

/* ---------- events ---------- */
app.addEventListener('click', function(ev){
  var t = ev.target.closest('[data-brand],[data-filter],[data-thumb],[data-act],[data-ph],[data-color],[data-size],#orderBtn,[data-scroll]'); if (!t) return;
  if (t.dataset.scroll){ ev.preventDefault(); var el = document.getElementById(t.dataset.scroll); if (el) el.scrollIntoView({behavior:'smooth'}); return; }
  if (t.dataset.filter){ ui.filter = t.dataset.filter; render(); return; }
  if (t.dataset.brand){ ui.brand = t.dataset.brand; render(); return; }
  if (t.dataset.thumb != null){ ui.photoIdx = +t.dataset.thumb; var main = document.getElementById('mainPhoto'); if (main) main.src = t.querySelector('img').src; app.querySelectorAll('[data-thumb]').forEach(function(b){ b.setAttribute('aria-current', b === t); }); return; }
  if (t.dataset.color != null){
    var p = byId(route().id); if (!p) return; var sel = selFor(p);
    sel.color = t.dataset.color; sel.err = false;
    var c = p.colors.filter(function(x){ return x.name === sel.color; })[0];
    if (c && c.photo != null && c.photo < p.photos.length) ui.photoIdx = c.photo;
    if (sel.size && !avail(p, sel.color, sel.size)) sel.size = '';
    if (!sel.size && p.sizes.length === 1 && avail(p, sel.color, p.sizes[0])) sel.size = p.sizes[0];
    render(); return;
  }
  if (t.dataset.size != null){ var p2 = byId(route().id); if (!p2) return; var s2 = selFor(p2); s2.size = t.dataset.size; s2.err = false; render(); return; }
  if (t.id === 'orderBtn'){
    var p3 = byId(route().id); if (!p3) return; var s3 = selFor(p3);
    if (allSold(p3)){ ev.preventDefault(); return; }
    if (selMissing(p3, s3).length){ ev.preventDefault(); s3.err = true; render(); var pk = document.getElementById('picked'); if (pk) pk.scrollIntoView({block:'center', behavior:'smooth'}); return; }
    var text = selText(p3, s3);
    try { navigator.clipboard.writeText(text).then(function(){ toast('已複製：' + text); }, function(){}); } catch(e){}
    return;
  }
  if (t.dataset.ph){
    var i = +t.dataset.i;
    if (t.dataset.ph === 'rm') ui.photos.splice(i,1);
    if (t.dataset.ph === 'left' && i>0){ var a = ui.photos[i]; ui.photos[i] = ui.photos[i-1]; ui.photos[i-1] = a; }
    if (t.dataset.ph === 'right' && i<ui.photos.length-1){ var b = ui.photos[i]; ui.photos[i] = ui.photos[i+1]; ui.photos[i+1] = b; }
    refreshStrip(); return;
  }
  var act = t.dataset.act, id = t.dataset.id;
  if (/^b-/.test(act)) return batchClick(act, t);
  var d = ui.draft;
  if (act === 'new'){ ui.draft = normalize({brand:'',name:'',price:'',category:CATS[0],sizeNote:'',desc:'',status:'active'}); ui.photos = []; ui.msg=''; render(); document.getElementById('f-name').focus(); }
  if (act === 'edit'){ var pe = byId(id); if (!pe) return; ui.draft = JSON.parse(JSON.stringify(pe)); ui.photos = pe.photos.map(function(ph){ return {path:ph, url:photoUrl(ph)}; }); ui.msg=''; render(); window.scrollTo(0,0); }
  if (act === 'cancel-edit'){ ui.draft = null; ui.photos = []; ui.msg=''; render(); }
  if (act === 'ask-del'){ ui.confirmId = id; render(); }
  if (act === 'cancel-del'){ ui.confirmId = null; render(); }
  if (act === 'delete') deleteProduct(id);
  if (act === 'status') setStatus(id, t.dataset.to);
  if (act === 'logout'){ login('').then(function(){ toast('已清除 Token'); }); }
  if (d && act === 'c-add'){ d.colors.push({name:'', hex:'#CCCCCC', photo:null}); refreshVariants(); var ins = app.querySelectorAll('[data-ck="name"]'); if (ins.length) ins[ins.length-1].focus(); }
  if (d && act === 'c-quick'){ d.colors.push({name:t.dataset.name, hex:colorHex(t.dataset.name), photo:null}); refreshVariants(); }
  if (d && act === 'c-rm'){ d.colors.splice(+t.dataset.i, 1); refreshVariants(); }
  if (d && act === 's-preset'){ d.sizes = parseSizes(t.dataset.v); refreshVariants(); }
});
app.addEventListener('input', function(ev){
  var t = ev.target, d = ui.draft;
  if (t.dataset.bi != null){ var it = ui.batch.items[+t.dataset.bi]; if (it){ it[t.dataset.bk] = t.value; if (t.dataset.bk === 'name' || t.dataset.bk === 'price') refreshBatchStatus(); } return; }
  if (!d) return;
  if (t.dataset.f) d[t.dataset.f] = t.value;
  if (t.dataset.ci != null){ var c = d.colors[+t.dataset.ci]; if (!c) return; if (t.dataset.ck === 'name'){ var old = c.name; c.name = t.value; d.soldOut = d.soldOut.map(function(k){ return k.split('|')[0] === old ? combo(c.name, k.split('|')[1]) : k; }); refreshMatrix(); } else if (t.dataset.ck === 'hex') c.hex = t.value; }
  if (t.id === 'f-sizes'){ d.sizes = parseSizes(t.value); refreshMatrix(); }
});
app.addEventListener('change', function(ev){
  var t = ev.target, d = ui.draft;
  if (t.id === 'f-photos' && t.files && t.files.length) return addPhotos(t.files);
  if (t.id === 'b-files' && t.files && t.files.length){ addBatchFiles(t.files); t.value = ''; return; }
  if (t.name === 'b-mode'){ ui.batch.mode = t.value; return; }
  if (t.id === 'b-n'){ ui.batch.n = Math.max(1, Math.min(MAX_PHOTOS, +t.value || 1)); return; }
  if (t.dataset.bi != null){ var it = ui.batch.items[+t.dataset.bi]; if (it){ it[t.dataset.bk] = t.value; refreshBatchStatus(); } return; }
  if (!d) return;
  if (t.dataset.ci != null && t.dataset.ck === 'photo'){ var c = d.colors[+t.dataset.ci]; if (c) c.photo = t.value === '' ? null : +t.value; }
  if (t.dataset.combo != null){ var k = t.dataset.combo; d.soldOut = d.soldOut.filter(function(x){ return x !== k; }); if (!t.checked) d.soldOut.push(k); }
  if (t.dataset.f) d[t.dataset.f] = t.value;
});
app.addEventListener('submit', function(ev){
  ev.preventDefault();
  if (ev.target.id === 'pform') saveProduct();
  if (ev.target.id === 'sform') saveSettings();
  if (ev.target.id === 'lform') login(document.getElementById('l-token').value);
});
['dragover','dragenter'].forEach(function(type){ app.addEventListener(type, function(ev){ var z = ev.target.closest && ev.target.closest('#b-drop'); if (z){ ev.preventDefault(); z.classList.add('over'); } }); });
app.addEventListener('dragleave', function(ev){ var z = ev.target.closest && ev.target.closest('#b-drop'); if (z) z.classList.remove('over'); });
app.addEventListener('drop', function(ev){ var z = ev.target.closest && ev.target.closest('#b-drop'); if (z){ ev.preventDefault(); z.classList.remove('over'); if (ev.dataTransfer && ev.dataTransfer.files.length) addBatchFiles(ev.dataTransfer.files); } });
window.addEventListener('beforeunload', function(ev){ if (ui.batch.items.length || (ui.draft && ui.photos.some(function(p){ return p.blob; }))){ ev.preventDefault(); ev.returnValue = ''; } });
window.addEventListener('hashchange', function(){ ui.photoIdx = 0; ui.confirmId = null; ui.sel = null; render(); if (route().view !== 'home') window.scrollTo(0,0); });

function login(token){
  ui.token = token.trim();
  try { if (ui.token) localStorage.setItem(TOKEN_KEY, ui.token); else localStorage.removeItem(TOKEN_KEY); } catch(e){}
  var m = document.getElementById('l-msg'); if (m) m.textContent = '確認中…';
  return checkAuth().then(function(){ if (ui.canPush) return loadFromApi().catch(function(){}); }).then(render);
}

/* ---------- boot ---------- */
fetch('products.json?v=' + Date.now(), { cache:'no-store' }).then(function(r){ if (!r.ok) throw new Error(r.status); return r.json(); })
  .then(applyData, function(){ state.loaded = true; state.error = '商品資料載入失敗，請重新整理。'; })
  .then(function(){ render(); return checkAuth(); })
  .then(function(){ if (ui.canPush) return loadFromApi().catch(function(){}); })
  .then(function(){ if (ui.canPush || route().view === 'manage' || route().view === 'batch') render(); });
})();
