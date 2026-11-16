/* Generisk kort-skabelon. Alt indhold kommer fra data.json:
   { "indstillinger": {...}, "steder": [...] } – redigeres med admin/index.html. */
"use strict";

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const norm = s => String(s ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
// Kun almindelige web-adresser (http/https) godtages
const sikkerUrl = u => { const t = String(u ?? "").trim(); if (!t) return "";
  try { const x = new URL(t, location.href); return /^https?:$/.test(x.protocol) ? x.href : ""; } catch { return ""; } };
const parseKoord = s => {
  const m = String(s ?? "").match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!m) return null; const a = +m[1], b = +m[2];
  return Math.abs(a) <= 90 && Math.abs(b) <= 180 ? [a, b] : null;
};

const STANDARD = { titel:"Mit kort", undertitel:"", intro:"", accentfarve:"#2f6f5e", rute:false, startpunkt:"55.6415, 12.0803", startzoom:13 };
let IND = { ...STANDARD }, STEDER = [], map = null, lag = null, linje = null;
const markers = new Map(), F = { q:"", kat:"" };
let aabenId = "", kortGraenser = null, skalTilpasse = false;

/* ---------- data ---------- */
function forbered(raw){
  return raw.map((s, i) => {
    const kategorier = String(s.kategori ?? "").split(",").map(t => t.trim()).filter(Boolean);
    const titel = String(s.titel ?? "").trim() || "Uden titel";
    const beskrivelse = String(s.beskrivelse ?? "").replace(/\r\n/g, "\n").trim();
    return {
      id: String(s.id ?? "s" + i), nr: i + 1, titel, beskrivelse, kategorier,
      adresse: String(s.adresse ?? "").trim(), periode: String(s.periode ?? "").trim(),
      pos: parseKoord(s.koordinater), ca: !!s.koordinat_ca,
      billede: sikkerUrl(s.billede_url), billedtekst: String(s.billede_tekst ?? "").trim(),
      link: sikkerUrl(s.link_url), lyd: sikkerUrl(s.lyd_url),
      soeg: norm([titel, beskrivelse, s.adresse, s.periode, kategorier.join(" ")].join(" "))
    };
  });
}

/* ---------- indstillinger ---------- */
function anvendIndstillinger(){
  const t = IND.titel || STANDARD.titel;
  document.title = t; $("#titel").textContent = t;
  $("#undertitel").textContent = IND.undertitel || ""; $("#undertitel").hidden = !IND.undertitel;
  $("#omKnap").hidden = !IND.intro;
  $("#omTitel").textContent = t; $("#omTekst").textContent = IND.intro || "";
  const farve = /^#[0-9a-f]{6}$/i.test(IND.accentfarve) ? IND.accentfarve : STANDARD.accentfarve;
  document.documentElement.style.setProperty("--accent", farve);
  document.documentElement.style.setProperty("--accent-tekst", lysFarve(farve) ? "#16181a" : "#ffffff");
  document.body.classList.toggle("rute", !!IND.rute);
}
// Er farven så lys, at teksten oven på den skal være mørk?
function lysFarve(hex){
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
  return .2126 * r + .7152 * g + .0722 * b > .4;
}

/* ---------- filtrering ---------- */
function passer(s, udenKat){
  if (F.q){ for (const o of norm(F.q).split(" ")) if (o && !s.soeg.includes(o)) return false; }
  if (!udenKat && F.kat && !s.kategorier.includes(F.kat)) return false;
  return true;
}

function tegnChips(){
  const t = new Map();
  for (const s of STEDER) if (passer(s, true)) for (const k of s.kategorier) t.set(k, (t.get(k) || 0) + 1);
  const alle = [...new Set(STEDER.flatMap(s => s.kategorier))].sort((a, b) => a.localeCompare(b, "da"));
  if (alle.length < 2) { $("#chips").innerHTML = ""; return; }
  $("#chips").innerHTML = alle.map(k =>
    `<button type="button" class="chip" data-kat="${esc(k)}" aria-pressed="${k === F.kat}">${esc(k)}<span class="n">${t.get(k) || 0}</span></button>`).join("");
}

function tegnListe(res){
  const ol = $("#liste");
  if (!STEDER.length){
    ol.innerHTML = `<li class="tom">Der er ingen steder endnu.<br>Tilføj dem med admin og læg den nye data.json op.</li>`;
    $("#antal").textContent = ""; return;
  }
  $("#antal").textContent = res.length === STEDER.length ? `${res.length} ${res.length === 1 ? "sted" : "steder"}` : `${res.length} af ${STEDER.length} steder`;
  if (!res.length){ ol.innerHTML = `<li class="tom">Ingen steder passer på søgningen.</li>`; return; }
  ol.innerHTML = res.map(s => {
    const meta = [s.adresse, s.periode].filter(Boolean).join(" · ");
    return `<li><button type="button" data-id="${esc(s.id)}">
      ${IND.rute ? `<span class="nr">${s.nr}</span>` : ""}
      ${s.billede ? `<img class="thumb" src="${esc(s.billede)}" alt="" loading="lazy">` : ""}
      <span class="tekst"><h3>${esc(s.titel)}</h3>
        ${meta ? `<p class="meta">${esc(meta)}</p>` : ""}
        ${s.beskrivelse ? `<p class="uddrag">${esc(s.beskrivelse.replace(/\s+/g, " "))}</p>` : ""}</span>
    </button></li>`;
  }).join("");
}

/* ---------- kort ---------- */
function startKort(){
  if (typeof L === "undefined"){ $("#map").innerHTML = '<p class="tom">Kortet kan ikke vises uden internetforbindelse.</p>'; return; }
  const start = parseKoord(IND.startpunkt) || parseKoord(STANDARD.startpunkt);
  map = L.map("map", { zoomControl:true }).setView(start, +IND.startzoom || 13);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom:19, attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);
  // Rute: alle stop vises med nummer. Ellers samles tætte steder i klynger.
  lag = (!IND.rute && L.markerClusterGroup ? L.markerClusterGroup({
    showCoverageOnHover:false, maxClusterRadius:45,
    iconCreateFunction: c => { const n = c.getChildCount();
      return L.divIcon({ html:`<span>${n}</span>`, className:`klynge klynge-${n < 10 ? "s" : n < 50 ? "m" : "l"}`, iconSize:null }); }
  }) : L.layerGroup()).addTo(map);
}

function tegnKort(res){
  if (!map) return;
  lag.clearLayers(); markers.clear();
  if (linje){ linje.remove(); linje = null; }
  const pts = [], nye = [];
  for (const s of res){
    if (!s.pos) continue;
    const icon = L.divIcon({ className:"", iconSize:null,
      html: IND.rute ? `<div class="pin${s.ca ? " ca" : ""}"><span>${s.nr}</span></div>` : `<div class="pin prik${s.ca ? " ca" : ""}"></div>` });
    const m = L.marker(s.pos, { icon, title:s.titel, keyboard:true }).bindTooltip(esc(s.titel), { offset:[0, -14], direction:"top" })
      .on("click", () => aabn(s.id));
    nye.push(m); markers.set(s.id, m); pts.push(s.pos);
  }
  lag.addLayers ? lag.addLayers(nye) : nye.forEach(m => m.addTo(lag));
  if (IND.rute && pts.length > 1){
    const farve = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
    linje = L.polyline(pts, { color:farve, weight:4, opacity:.7, dashArray:"6 8" }).addTo(map);
    linje.bringToBack();
  }
  kortGraenser = pts.length ? (IND.rute ? L.latLngBounds(pts) : kerneOmraade(pts)) : null;
  tilpasKort();
}
// Ved mange steder zoomes til området med de fleste (5 % yderst udelades)
function kerneOmraade(pts){
  if (pts.length < 20) return L.latLngBounds(pts);
  const kv = (a, q) => a[Math.round(q * (a.length - 1))];
  const la = pts.map(p => p[0]).sort((a, b) => a - b), lo = pts.map(p => p[1]).sort((a, b) => a - b);
  return L.latLngBounds([kv(la, .05), kv(lo, .05)], [kv(la, .95), kv(lo, .95)]);
}
function tilpasKort(){
  if (!map || !kortGraenser) return;
  if (!map.getContainer().offsetWidth){ skalTilpasse = true; return; }   // skjult: vent til kortet vises
  map.fitBounds(kortGraenser, { padding:[40, 40], maxZoom:17, animate:false });
  skalTilpasse = false;
}

/* ---------- opdatering ---------- */
function opdater(){
  const res = STEDER.filter(s => passer(s));
  tegnChips(); tegnListe(res); tegnKort(res); gemHash();
}

/* ---------- detalje ---------- */
function aabn(id){
  const i = STEDER.findIndex(x => x.id === id); if (i < 0) return;
  const s = STEDER[i];
  const meta = [s.adresse, s.periode].filter(Boolean).join(" · ");
  const forrige = STEDER[i - 1], naeste = STEDER[i + 1];
  $("#dIndhold").innerHTML = `
    ${s.billede ? `<figure class="d-billede"><img src="${esc(s.billede)}" alt="${esc(s.billedtekst || s.titel)}">${s.billedtekst ? `<figcaption>${esc(s.billedtekst)}</figcaption>` : ""}</figure>` : ""}
    <div class="d-tekst-wrap">
      ${IND.rute ? `<p class="d-stop">Stop ${s.nr} af ${STEDER.length}</p>` : ""}
      <h2 id="dTitel">${esc(s.titel)}</h2>
      ${meta ? `<p class="d-meta">${esc(meta)}</p>` : ""}
      ${s.beskrivelse ? `<div class="d-tekst">${esc(s.beskrivelse)}</div>` : ""}
      ${s.kategorier.length ? `<div class="d-tags">${s.kategorier.map(k => `<span>${esc(k)}</span>`).join("")}</div>` : ""}
      ${s.lyd ? `<audio controls preload="none" src="${esc(s.lyd)}"></audio>` : ""}
      <div class="d-knapper">
        ${s.pos ? `<button class="knap accent" type="button" id="dVis">Vis på kortet</button>` : ""}
        ${s.link ? `<a class="knap" href="${esc(s.link)}" target="_blank" rel="noopener">Læs mere</a>` : ""}
        <button class="knap" type="button" id="dDel">Kopiér link</button>
      </div>
      ${IND.rute ? `<div class="d-rute">
        <button class="knap" type="button" id="dForrige" ${forrige ? "" : "disabled"}>← Forrige</button>
        <button class="knap accent" type="button" id="dNaeste" ${naeste ? "" : "disabled"}>Næste →</button>
      </div>` : ""}
    </div>`;
  $("#dVis") && ($("#dVis").onclick = () => { $("#dlg").close(); visPaaKort(s); });
  $("#dDel").onclick = async ev => {
    const url = location.href.split("#")[0] + "#sted=" + encodeURIComponent(s.id);
    try { await navigator.clipboard.writeText(url); ev.target.textContent = "Link kopieret"; }
    catch { prompt("Kopiér linket:", url); }
  };
  if (IND.rute){
    if (forrige) $("#dForrige").onclick = () => aabn(forrige.id);
    if (naeste) $("#dNaeste").onclick = () => aabn(naeste.id);
  }
  aabenId = s.id; gemHash();
  if (!$("#dlg").open) $("#dlg").showModal();
  $("#dlg").scrollTop = 0;
}
function visPaaKort(s){
  saetVisning("map", () => {
    const m = markers.get(s.id); if (!m) return;
    map.setView(s.pos, Math.max(map.getZoom(), 17), { animate:false });
    if (map.hasLayer(m)) { m.openTooltip(); return; }
    const p = lag.getVisibleParent && lag.getVisibleParent(m);
    if (p && p.spiderfy){ p.spiderfy(); setTimeout(() => m.openTooltip(), 350); }
  });
}
$("#dLuk").onclick = () => $("#dlg").close();
$("#dlg").addEventListener("close", () => { aabenId = ""; gemHash(); });
$("#omKnap").onclick = () => $("#omDlg").showModal();
$("#omLuk").onclick = () => $("#omDlg").close();
for (const d of ["#dlg", "#omDlg"]) $(d).addEventListener("click", e => { if (e.target === $(d)) $(d).close(); });

/* ---------- link-tilstand (#q=...&kat=...&sted=...) ---------- */
function gemHash(){
  const p = new URLSearchParams();
  if (F.q) p.set("q", F.q); if (F.kat) p.set("kat", F.kat); if (aabenId) p.set("sted", aabenId);
  const h = p.toString();
  history.replaceState(null, "", h ? "#" + h : location.pathname + location.search);
}
function laesHash(){
  const p = new URLSearchParams(location.hash.slice(1));
  F.q = p.get("q") || ""; F.kat = p.get("kat") || ""; $("#q").value = F.q;
  return p.get("sted");
}

/* ---------- betjening ---------- */
let timer;
$("#q").addEventListener("input", e => { clearTimeout(timer); timer = setTimeout(() => { F.q = e.target.value; opdater(); }, 160); });
$("#chips").onclick = e => { const c = e.target.closest("[data-kat]"); if (!c) return; F.kat = F.kat === c.dataset.kat ? "" : c.dataset.kat; opdater(); };
$("#liste").onclick = e => { const b = e.target.closest("[data-id]"); if (b) aabn(b.dataset.id); };
function saetVisning(v, derefter){
  $("#layout").dataset.view = v;
  $("#visListe").setAttribute("aria-pressed", v === "list"); $("#visKort").setAttribute("aria-pressed", v === "map");
  // Telefon: rul op, så kortet fylder skærmen under Liste/Kort-knapperne
  if (v === "map" && matchMedia("(max-width:860px)").matches) $(".visning").scrollIntoView({ block:"start" });
  if (map && v === "map") setTimeout(() => {
    map.invalidateSize({ pan:false });
    if (derefter) derefter(); else if (skalTilpasse) tilpasKort();
  }, 50);
}
$("#visListe").onclick = () => saetVisning("list");
$("#visKort").onclick = () => saetVisning("map");

/* ---------- start ---------- */
(async () => {
  let raw;
  try {
    const r = await fetch("data.json", { cache:"no-cache" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    raw = await r.json();
  } catch (err) {
    console.error(err);
    $("#liste").innerHTML = `<li class="tom">Indholdet kunne ikke hentes. Prøv at genindlæse siden.</li>`;
    return;
  }
  const steder = Array.isArray(raw) ? raw : (raw.steder || []);
  IND = { ...STANDARD, ...(Array.isArray(raw) ? {} : raw.indstillinger || {}) };
  anvendIndstillinger();
  STEDER = forbered(steder);
  startKort();
  const sted = laesHash();
  opdater();
  if (sted) aabn(sted);
})();
