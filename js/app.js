/* ============ INDSTILLINGER ============ */
const KONTAKT_EMAIL = "";   // fx "glemtebutikker@example.dk" – tom = knappen vises ikke
const PR_SIDE = 60;         // antal butikker der vises ad gangen i listen

// Stavevarianter i "vej" samles til én gade (nøgle skrives med små bogstaver)
const GADE_RETTELSER = {
  "clemontgade":"Clermontgade", "heligkorsvej":"Helligkorsvej", "skomagegade":"Skomagergade",
  "sankt hansgade":"Sankt Hans Gade", "bager sankt hans gade":"Sankt Hans Gade",
  "sankt. mortensvej":"Sankt Mortens Vej", "sct. mortens vej":"Sankt Mortens Vej", "sankt mortens vej":"Sankt Mortens Vej",
  "sct. olsgade":"Sankt Ols Gade", "borgerddiget":"Borgerdiget",
  "knud den storesvej":"Knud den Stores Vej", "knud den stores vej":"Knud den Stores Vej",
  "#købmand, #østergade,":"Østergade"
};
// Stavefejl i tags samles
const BRANCHE_RETTELSER = {
  "legetøn":"Legetøj", "køvmand":"Købmand", "købamand":"Købmand", "\"købmand":"Købmand", "restaution":"Restauration"
};
// Tags der er områder/centre og ikke brancher (de kan stadig søges frem)
const OMRAADER = ["bakkegården","bakkegårdens butikker","svalegården","ringparken","ringparkens butikker",
  "bymarken","rødeport","hestetorvet","bycenter","butikscenter"];
/* ====================================== */

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const norm = s => String(s ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu," ").trim();
// Kun almindelige web-adresser (http/https) godtages – ikke fx "javascript:"
const sikkerUrl = u => { const t = String(u ?? "").trim(); if (!t) return "";
  try { const x = new URL(t, location.href); return /^https?:$/.test(x.protocol) ? x.href : ""; } catch { return ""; } };
const gadeLigner = t => /(vej|gade|stræde|sti|vang|vænget|torvet|alle|allé)$/i.test(t);

let BUTIKKER = [], markers = new Map(), map = null, layer = null, vist = PR_SIDE;
const F = { q:"", gade:"", branche:"", aarti:"", foto:false, kort:false, todo:false, sort:"navn" };

function forbered(raw){
  const gadeNavne = new Set();
  return raw.map((b,i) => {
    let vej = String(b.vej||"").trim();
    vej = GADE_RETTELSER[vej.toLowerCase()] || vej;
    if (vej) vej = vej.charAt(0).toUpperCase() + vej.slice(1);
    const tagsRaa = String(b.tags||"").split(",").map(t => t.trim().replace(/^#+/,"").trim()).filter(Boolean);
    let todo = false; const brancher = [], ovrige = [];
    for (let t of tagsRaa){
      const lt = t.toLowerCase();
      if (lt === "todo"){ todo = true; continue; }
      t = BRANCHE_RETTELSER[lt] || t;
      if (lt === vej.toLowerCase() || gadeLigner(t) || GADE_RETTELSER[lt]) { ovrige.push(t); continue; }
      if (OMRAADER.includes(lt)) { ovrige.push(t); continue; }
      t = t.charAt(0).toUpperCase() + t.slice(1);
      if (!brancher.includes(t)) brancher.push(t);
    }
    let lat=null, lng=null;
    const k = String(b.koordinater||"").split(",").map(Number);
    if (k.length===2 && isFinite(k[0]) && isFinite(k[1]) && k[0]>50 && k[0]<60) { lat=k[0]; lng=k[1]; }
    const s = parseInt(b.periode_start,10), e = parseInt(b.periode_slut,10);
    const aartier = [];
    if (s && e && e>=s) for (let d=Math.floor(s/10)*10; d<=Math.floor(e/10)*10 && aartier.length<15; d+=10) aartier.push(d);
    else if (s) aartier.push(Math.floor(s/10)*10);
    else if (e) aartier.push(Math.floor(e/10)*10);
    const periode = s && e ? `${s}–${e}` : s ? `fra ${s}` : e ? `til ${e}` : "";
    const navn = String(b.navn||"").trim() || "Uden navn";
    const beskr = String(b.beskrivelse||"").replace(/\r\n/g,"\n").trim();
    return {
      id: String(b.id ?? ("x"+i)), navn, beskr, vej, husnr:String(b.husnr||"").trim(),
      postnr:String(b.postnr_by||"").trim(), brancher, ovrige, todo, lat, lng, ca:!!b.koordinat_ca,
      start:s||null, slut:e||null, aartier, periode,
      billede:sikkerUrl(b.billede_url), mere:sikkerUrl(b.mere_info_url), lyd:sikkerUrl(b.lyd_url),
      soeg: norm([navn,beskr,vej,b.husnr,tagsRaa.join(" "),s||"",e||""].join(" "))
    };
  });
}

/* ---------- filtrering ---------- */
function passer(b, undtagen){
  if (F.q){ for (const ord of norm(F.q).split(" ")) if (ord && !b.soeg.includes(ord)) return false; }
  if (undtagen!=="gade" && F.gade && b.vej!==F.gade) return false;
  if (undtagen!=="branche" && F.branche && !b.brancher.includes(F.branche)) return false;
  if (undtagen!=="aarti" && F.aarti && !b.aartier.includes(+F.aarti)) return false;
  if (F.foto && !b.billede) return false;
  if (F.kort && b.lat===null) return false;
  if (F.todo && !b.todo) return false;
  return true;
}
function taelling(facet, noegle){
  const m = new Map();
  for (const b of BUTIKKER) if (passer(b, facet)) for (const v of noegle(b)) m.set(v,(m.get(v)||0)+1);
  return m;
}
const adresse = b => [b.vej, b.husnr].filter(Boolean).join(" ");
function sorter(a,b){
  if (F.sort==="gade") return (a.vej||"~").localeCompare(b.vej||"~","da") || (parseInt(a.husnr)||9999)-(parseInt(b.husnr)||9999) || a.navn.localeCompare(b.navn,"da");
  if (F.sort==="aar") return (a.start||a.slut||9999)-(b.start||b.slut||9999) || a.navn.localeCompare(b.navn,"da");
  return a.navn.localeCompare(b.navn,"da");
}

/* ---------- visning ---------- */
function fyldSelect(el, facet, noegle, tomTekst, etiket = v => v){
  const t = taelling(facet, noegle);
  const vals = [...t.keys()].map(String).sort((a,b)=>a.localeCompare(b,"da"));
  if (F[facet] && !vals.includes(F[facet])) vals.unshift(F[facet]);
  el.innerHTML = `<option value="">${tomTekst}</option>` + vals.map(v =>
    `<option value="${esc(v)}"${v===F[facet]?" selected":""}>${esc(etiket(v))} (${t.get(v)||t.get(+v)||0})</option>`).join("");
}
function tegnChips(){
  const tb = taelling("branche", b=>b.brancher);
  const faste = [...new Map(BUTIKKER.flatMap(b=>b.brancher).reduce((m,v)=>m.set(v,(m.get(v)||0)+1),new Map()))]
    .sort((a,b)=>b[1]-a[1]).slice(0,10).map(x=>x[0]);
  if (F.branche && !faste.includes(F.branche)) faste.push(F.branche);
  $("#brancheChips").innerHTML = "<h2>Brancher</h2>" + faste.map(v => {
    const n = tb.get(v)||0;
    return `<button type="button" class="chip" data-branche="${esc(v)}" aria-pressed="${v===F.branche}" ${n||v===F.branche?"":"disabled"}>${esc(v)}<span class="n">${n}</span></button>`;
  }).join("");
}

function uddrag(b){
  if (!b.beskr) return "";
  const t = b.beskr.replace(/\s+/g," ");
  if (norm(t).length < norm(b.navn).length + 25) return ""; // beskrivelsen gentager bare navnet
  return t.length>160 ? t.slice(0,157).replace(/\s\S*$/,"")+" …" : t;
}
function tegnListe(res){
  const ul = $("#list");
  if (!res.length){
    ul.innerHTML = `<li class="empty">Ingen butikker passer på søgningen. Prøv færre ord, eller tryk <b>Nulstil</b>.</li>`;
    $("#more").hidden = true; return;
  }
  ul.innerHTML = res.slice(0,vist).map(b => {
    const meta = [adresse(b), b.periode].filter(Boolean).join(", ");
    const u = uddrag(b);
    return `<li class="item"><button type="button" data-id="${esc(b.id)}">
      <div class="name">${esc(b.navn)}</div>
      ${meta?`<div class="meta">${esc(meta)}</div>`:""}
      ${u?`<div class="excerpt">${esc(u)}</div>`:""}
      <div class="tags">${b.brancher.map(t=>`<span class="tag">${esc(t)}</span>`).join("")}
        ${b.billede?'<span class="tag photo">Foto</span>':""}${b.todo?'<span class="tag todo">Mangler oplysninger</span>':""}</div>
    </button></li>`;
  }).join("");
  $("#more").hidden = res.length <= vist;
  $("#more").textContent = `Vis flere (${res.length - Math.min(vist,res.length)} mere)`;
}

function tegnKort(res){
  if (!map) return;
  layer.clearLayers(); markers.clear();
  const pts = [], nye = [];
  for (const b of res){
    if (b.lat===null) continue;
    const m = L.circleMarker([b.lat,b.lng], {
      radius:8, weight:2, color:"#1b3a2d", fillColor: b.ca ? "#e9d7a8" : "#c79a3a", fillOpacity:.95, dashArray: b.ca?"3 3":null
    }).bindTooltip(esc(b.navn)).on("click", ()=>aabn(b.id));
    nye.push(m); markers.set(b.id,m); pts.push([b.lat,b.lng]);
  }
  layer.addLayers ? layer.addLayers(nye) : nye.forEach(m=>m.addTo(layer));
  const uden = res.filter(b=>b.lat===null).length;
  $("#mapnote").textContent = `${pts.length} på kortet` + (uden?`, ${uden} mangler placering`:"");
  kortGraenser = kerneOmraade(pts);
  tilpasKort();
}
// Ved mange butikker zoomes til området med de fleste (5 % yderst i hver
// retning udelades), så enkelte butikker langt ude ikke giver et kort over
// hele kommunen. De yderste kan stadig ses ved at zoome ud.
function kerneOmraade(pts){
  if (!pts.length) return null;
  if (pts.length < 20) return L.latLngBounds(pts);
  const kvantil = (arr, q) => arr[Math.min(arr.length-1, Math.max(0, Math.round(q*(arr.length-1))))];
  const lats = pts.map(p=>p[0]).sort((a,b)=>a-b), lngs = pts.map(p=>p[1]).sort((a,b)=>a-b);
  return L.latLngBounds([kvantil(lats,.05), kvantil(lngs,.05)], [kvantil(lats,.95), kvantil(lngs,.95)]);
}
// Zoom så alle viste markører er med. Er kortet skjult (fx Liste-visning på
// telefon), gemmes det til kortet bliver vist – ellers bliver zoomen forkert.
let kortGraenser = null, skalTilpasse = false;
function tilpasKort(){
  if (!map || !kortGraenser) return;
  if (!map.getContainer().offsetWidth){ skalTilpasse = true; return; }
  map.fitBounds(kortGraenser, {padding:[30,30], maxZoom:17, animate:false});
  skalTilpasse = false;
}

function opdater(nulstilSide=true){
  if (nulstilSide) vist = PR_SIDE;
  const res = BUTIKKER.filter(b=>passer(b)).sort(sorter);
  fyldSelect($("#gade"), "gade", b=>b.vej?[b.vej]:[], "Alle gader");
  fyldSelect($("#branche"), "branche", b=>b.brancher, "Alle brancher");
  fyldSelect($("#aarti"), "aarti", b=>b.aartier, "Alle årtier", v => v+"'erne");
  tegnChips();
  $("#count").textContent = res.length===BUTIKKER.length ? `Alle ${res.length} butikker` : `${res.length} af ${BUTIKKER.length} butikker`;
  const aktive = ["gade","branche","aarti","foto","kort","todo"].filter(k=>F[k]).length;
  $("#filterBtn").textContent = aktive ? `Filtre (${aktive})` : "Filtre";
  tegnListe(res); tegnKort(res); gemHash();
}

/* ---------- butikskort ---------- */
function aabn(id){
  const b = BUTIKKER.find(x=>x.id===id); if (!b) return;
  $("#dTitle").textContent = b.navn;
  $("#dSub").textContent = [adresse(b), b.postnr].filter(Boolean).join(", ");
  const mangler = t => `<span class="missing">${t}</span>`;
  const mail = KONTAKT_EMAIL ? `mailto:${KONTAKT_EMAIL}?subject=${encodeURIComponent("Erindring: "+b.navn+" ("+b.id+")")}&body=${encodeURIComponent("Butik: "+b.navn+"\nAdresse: "+adresse(b)+"\n\nDet husker jeg:\n\n\nMit navn:\n")}` : "";
  $("#dBody").innerHTML = `
    ${b.billede?`<figure><img src="${esc(b.billede)}" alt="Foto af ${esc(b.navn)}" loading="lazy"></figure>`:""}
    ${b.lyd?`<audio controls preload="none" src="${esc(b.lyd)}"></audio>`:""}
    ${b.todo?`<div class="memory"><strong>Vi mangler oplysninger om denne butik.</strong>Ved du noget om ejere, årstal eller har du et billede?</div>`:""}
    <div class="d-text">${esc(b.beskr)}</div>
    <dl class="facts">
      <dt>Adresse</dt><dd>${adresse(b)?esc(adresse(b)):mangler("Ukendt")}</dd>
      <dt>Branche</dt><dd>${b.brancher.length?esc(b.brancher.join(", ")):mangler("Ikke angivet")}</dd>
      <dt>Periode</dt><dd>${b.periode?esc(b.periode):mangler("Ukendt")}</dd>
      <dt>Placering</dt><dd>${b.lat===null?mangler("Ikke på kortet endnu"):(b.ca?"Omtrentlig":"Kendt")}</dd>
      ${b.ovrige.length?`<dt>Se også</dt><dd>${esc(b.ovrige.join(", "))}</dd>`:""}
    </dl>
    <div class="d-actions">
      ${b.lat!==null?`<button class="btn primary" type="button" id="dVis">Vis på kortet</button>`:""}
      ${b.mere?`<a class="btn" href="${esc(b.mere)}" target="_blank" rel="noopener">Læs mere</a>`:""}
      ${mail?`<a class="btn" href="${mail}">Kan du huske butikken? Skriv til os</a>`:""}
      <button class="btn" type="button" id="dLink">Kopiér link til butikken</button>
    </div>`;
  const vis = $("#dVis");
  if (vis) vis.onclick = () => {
    $("#dlg").close();
    saetVisning("map", () => {
      const m = markers.get(b.id);
      map.setView([b.lat,b.lng], 18, {animate:false});
      if (!m) return;
      if (map.hasLayer(m)) { m.openTooltip(); return; }
      // Flere butikker på samme adresse: fold klyngen ud og vis butikken
      const p = layer.getVisibleParent && layer.getVisibleParent(m);
      if (p && p.spiderfy){ p.spiderfy(); setTimeout(() => m.openTooltip(), 350); }
    });
  };
  $("#dLink").onclick = async (ev) => {
    const url = location.href.split("#")[0] + "#butik=" + encodeURIComponent(b.id);
    try { await navigator.clipboard.writeText(url); ev.target.textContent = "Link kopieret"; }
    catch { prompt("Kopiér linket:", url); }
  };
  aabenId = b.id; gemHash();
  if (!$("#dlg").open) $("#dlg").showModal();
  $("#dlg").scrollTop = 0;
}
let aabenId = "";
$("#dClose").onclick = () => $("#dlg").close();
$("#dlg").addEventListener("close", () => { aabenId = ""; gemHash(); });
$("#dlg").addEventListener("click", e => { if (e.target === $("#dlg")) $("#dlg").close(); });

/* ---------- link-tilstand (#gade=Algade&branche=Bager ...) ---------- */
function gemHash(){
  const p = new URLSearchParams();
  for (const k of ["q","gade","branche","aarti"]) if (F[k]) p.set(k,F[k]);
  for (const k of ["foto","kort","todo"]) if (F[k]) p.set(k,"1");
  if (F.sort!=="navn") p.set("sort",F.sort);
  if (aabenId) p.set("butik",aabenId);
  const h = p.toString();
  history.replaceState(null,"", h ? "#"+h : location.pathname+location.search);
}
function laesHash(){
  const p = new URLSearchParams(location.hash.slice(1));
  for (const k of ["q","gade","branche","aarti"]) F[k] = p.get(k)||"";
  for (const k of ["foto","kort","todo"]) F[k] = p.get(k)==="1";
  F.sort = p.get("sort")||"navn";
  $("#q").value = F.q; $("#sort").value = F.sort;
  for (const k of ["foto","kort","todo"]) $("#"+k).checked = F[k];
  return p.get("butik");
}

/* ---------- betjening ---------- */
let timer;
$("#q").addEventListener("input", e => { clearTimeout(timer); timer = setTimeout(()=>{ F.q = e.target.value; opdater(); }, 180); });
$("#gade").onchange = e => { F.gade = e.target.value; opdater(); };
$("#branche").onchange = e => { F.branche = e.target.value; opdater(); };
$("#sort").onchange = e => { F.sort = e.target.value; opdater(); };
for (const k of ["foto","kort","todo"]) $("#"+k).onchange = e => { F[k] = e.target.checked; opdater(); };
$("#brancheChips").onclick = e => { const c = e.target.closest("[data-branche]"); if(!c) return; F.branche = F.branche===c.dataset.branche ? "" : c.dataset.branche; opdater(); };
$("#aarti").onchange = e => { F.aarti = e.target.value; opdater(); };
$("#list").onclick = e => { const b = e.target.closest("[data-id]"); if (b) aabn(b.dataset.id); };
$("#more").onclick = () => { vist += PR_SIDE; opdater(false); };
$("#nulstil").onclick = () => { Object.assign(F,{q:"",gade:"",branche:"",aarti:"",foto:false,kort:false,todo:false,sort:"navn"}); $("#q").value=""; $("#sort").value="navn"; for (const k of ["foto","kort","todo"]) $("#"+k).checked=false; opdater(); };
$("#tilfaeldig").onclick = () => { const res = BUTIKKER.filter(b=>passer(b)); const pool = res.length?res:BUTIKKER; aabn(pool[Math.floor(Math.random()*pool.length)].id); };
function saetVisning(v, derefter){
  $("#layout").dataset.view = v;
  $("#visListe").setAttribute("aria-pressed", v==="list"); $("#visKort").setAttribute("aria-pressed", v==="map");
  if (map && v==="map") setTimeout(() => {
    map.invalidateSize({pan:false});
    if (derefter) derefter(); else if (skalTilpasse) tilpasKort();
  }, 50);
}
$("#filterBtn").onclick = () => {
  const aaben = $("#filterpanel").classList.toggle("open");
  $("#filterBtn").setAttribute("aria-expanded", aaben);
};
$("#visListe").onclick = () => saetVisning("list");
$("#visKort").onclick = () => saetVisning("map");

/* ---------- start ---------- */
function startKort(){
  if (typeof L === "undefined"){ $("#map").innerHTML = '<p class="nomap">Kortet kan ikke vises uden internetforbindelse.</p>'; return; }
  map = L.map("map", { scrollWheelZoom:true }).setView([55.6415,12.0803], 14);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom:19,
    attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map);
  // Klynger samler markører, der ligger tæt; antallet står i cirklen.
  layer = (L.markerClusterGroup ? L.markerClusterGroup({
    showCoverageOnHover:false, maxClusterRadius:45, spiderfyOnMaxZoom:true,
    iconCreateFunction: c => {
      const n = c.getChildCount(), str = n < 10 ? "s" : n < 50 ? "m" : "l";
      return L.divIcon({ html:`<span>${n}</span>`, className:`klynge klynge-${str}`, iconSize:null });
    }
  }) : L.layerGroup()).addTo(map);
}
async function hentData(){
  const r = await fetch("data.json", {cache:"no-cache"});
  if (!r.ok) throw new Error("data.json: HTTP " + r.status);
  return r.json();
}
(async () => {
  startKort();
  try { BUTIKKER = forbered(await hentData()); }
  catch (err) {
    console.error(err);
    $("#count").textContent = "Butikkerne kunne ikke hentes. Prøv at genindlæse siden.";
    return;
  }
  $("#undertitel").textContent = `${BUTIKKER.length} købmænd, bagere, radioforretninger og andre butikker fra Roskildes gader`;
  const butik = laesHash();
  opdater();
  if (butik) aabn(butik);
})();
