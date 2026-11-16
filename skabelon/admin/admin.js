/* Lokal admin til skabelonens data.json – kører helt i browseren, intet sendes nogen steder hen.
   Format: { "indstillinger": {...}, "steder": [...] } */
"use strict";

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const norm = s => String(s ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

const STANDARD = { titel:"Mit kort", undertitel:"", intro:"", accentfarve:"#2f6f5e", rute:false, startpunkt:"55.6415, 12.0803", startzoom:13 };
const FELTER = ["titel","beskrivelse","kategori","adresse","periode","koordinater","koordinat_ca",
                "billede_url","billede_tekst","link_url","lyd_url"];
const URL_FELTER = ["billede_url","link_url","lyd_url"];

let ind = { ...STANDARD };     // indstillinger
let steder = [];               // stederne i rækkefølge
let filHandle = null, filNavn = "", ugemt = false;
let valgt = null, formAaben = false;
const status = new Map();      // sted -> "ny" | "aendret"

const formater = () => JSON.stringify({ indstillinger: ind, steder }, null, 2) + "\n";

/* ---------- indlæs ---------- */
function indlaes(tekst, navn){
  let raw;
  try { raw = JSON.parse(tekst); }
  catch (e) { besked("Filen er ikke gyldig JSON: " + e.message, 6000); return false; }
  if (Array.isArray(raw)) raw = { steder: raw };                       // gammelt format: kun en liste
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.steder ?? [])) { besked("Filen ligner ikke en data.json til kortet.", 6000); return false; }
  ind = { ...STANDARD, ...(raw.indstillinger || {}) };
  steder = raw.steder || [];
  filNavn = navn; ugemt = false; status.clear();
  efterIndlaesning();
  besked(`${steder.length} steder indlæst`);
  return true;
}
function efterIndlaesning(){
  lukForm();
  $("#gemFil").disabled = false; $("#ny").disabled = false;
  fyldIndstillinger(); opdaterFilinfo(); tegnListe();
}

$("#nyFil").onclick = () => {
  if (ugemt && !confirm("Du har ændringer, der ikke er gemt. Start forfra alligevel?")) return;
  ind = { ...STANDARD }; steder = []; filHandle = null; filNavn = "ny data.json"; status.clear();
  ugemt = true; efterIndlaesning(); visFane("indst");
  besked("Ny tom fil – start med titel og indstillinger");
};

$("#aabnFil").onclick = async () => {
  if (ugemt && !confirm("Du har ændringer, der ikke er gemt. Åbn en anden fil alligevel?")) return;
  if (window.showOpenFilePicker){
    try {
      const [h] = await showOpenFilePicker({ types:[{ description:"JSON", accept:{"application/json":[".json"]} }] });
      const f = await h.getFile();
      if (indlaes(await f.text(), f.name)) filHandle = h;
    } catch (e) { if (e.name !== "AbortError") besked("Kunne ikke åbne filen: " + e.message, 6000); }
  } else { $("#filvaelger").value = ""; $("#filvaelger").click(); }
};
$("#filvaelger").onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  if (indlaes(await f.text(), f.name)) filHandle = null;
};

// Via en lokal webserver hentes ../data.json automatisk
(async () => {
  if (!location.protocol.startsWith("http")) return;
  try { const r = await fetch("../data.json", { cache:"no-store" }); if (r.ok) indlaes(await r.text(), "data.json (projektmappen)"); } catch {}
})();

/* ---------- gem fil ---------- */
$("#gemFil").onclick = async () => {
  if ((formAaben && formErAendret()) || indstErAendret()){
    if (!confirm("Der er ændringer i en formular, som du ikke har trykket \"Gem\" på. De kommer ikke med. Fortsæt?")) return;
  }
  const tekst = formater();
  try {
    if (filHandle && filHandle.createWritable){
      if ((await filHandle.requestPermission?.({ mode:"readwrite" })) === "denied") throw new Error("Ingen tilladelse til at skrive i filen");
      const w = await filHandle.createWritable(); await w.write(tekst); await w.close();
      gemt(`Gemt i ${filHandle.name}`);
    } else if (window.showSaveFilePicker){
      const h = await showSaveFilePicker({ suggestedName:"data.json", types:[{ description:"JSON", accept:{"application/json":[".json"]} }] });
      const w = await h.createWritable(); await w.write(tekst); await w.close();
      filHandle = h; filNavn = h.name; gemt(`Gemt som ${h.name}`);
    } else {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([tekst], { type:"application/json" }));
      a.download = "data.json"; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      gemt("data.json er hentet ned – se mappen Overførsler", 6000);
    }
  } catch (e) { if (e.name !== "AbortError") besked("Kunne ikke gemme: " + e.message, 6000); }
};
function gemt(tekst, ms){ ugemt = false; status.clear(); opdaterFilinfo(); tegnListe(); besked(tekst, ms); }

window.addEventListener("beforeunload", e => {
  if (ugemt || (formAaben && formErAendret()) || indstErAendret()) { e.preventDefault(); e.returnValue = ""; }
});

/* ---------- faner ---------- */
function visFane(f){
  const indst = f === "indst";
  $("#faneSteder").setAttribute("aria-selected", !indst); $("#faneIndst").setAttribute("aria-selected", indst);
  $("#panelSteder").hidden = indst; $("#panelIndst").hidden = !indst;
}
$("#faneSteder").onclick = () => visFane("steder");
$("#faneIndst").onclick = () => visFane("indst");

/* ---------- indstillinger ---------- */
const I = () => $("#indstForm").elements;
function fyldIndstillinger(){
  const el = I();
  for (const k of Object.keys(STANDARD)){
    if (k === "rute") el[k].checked = !!ind.rute;
    else el[k].value = String(ind[k] ?? "");
  }
  if (!/^#[0-9a-f]{6}$/i.test(el.accentfarve.value)) el.accentfarve.value = STANDARD.accentfarve;
  $("#indstFejl").hidden = true;
}
function laesIndst(){
  const el = I(), v = {};
  for (const k of Object.keys(STANDARD)) v[k] = k === "rute" ? el[k].checked : el[k].value.replace(/\r\n/g, "\n").trim();
  v.startpunkt = normKoord(v.startpunkt);
  v.startzoom = v.startzoom === "" ? STANDARD.startzoom : Number(v.startzoom);
  return v;
}
function indstErAendret(){
  if (!filNavn) return false;
  const v = laesIndst();
  return Object.keys(STANDARD).some(k => String(v[k]) !== String(ind[k] ?? ""));
}
$("#indstForm").addEventListener("submit", e => {
  e.preventDefault();
  const v = laesIndst(), fejl = [], el = I();
  for (const k of Object.keys(STANDARD)) el[k].removeAttribute("aria-invalid");
  const mark = (k, t) => { fejl.push(t); el[k].setAttribute("aria-invalid", "true"); };
  if (!v.titel) mark("titel", "Titel skal udfyldes.");
  if (v.startpunkt && !gyldigKoord(v.startpunkt)) mark("startpunkt", 'Startpunkt skal skrives som "55.641500, 12.080300".');
  if (!Number.isInteger(v.startzoom) || v.startzoom < 3 || v.startzoom > 19) mark("startzoom", "Zoom skal være et helt tal mellem 3 og 19.");
  $("#indstFejl").innerHTML = fejl.map(f => `<li>${esc(f)}</li>`).join(""); $("#indstFejl").hidden = !fejl.length;
  if (fejl.length) return;
  if (!indstErAendret()) { besked("Ingen ændringer"); return; }
  ind = v; ugemt = true; opdaterFilinfo(); tegnListe(); fyldIndstillinger();
  besked("Indstillinger opdateret – husk at gemme data.json");
});

/* ---------- liste ---------- */
const gyldigKoord = s => /^-?\d+(\.\d+)?, -?\d+(\.\d+)?$/.test(s);
const harKoord = s => /^\s*-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?\s*$/.test(String(s.koordinater ?? ""));
function normKoord(t){
  const k = String(t ?? "").trim().match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/);
  return k ? `${k[1]}, ${k[2]}` : String(t ?? "").trim();
}

function tegnListe(){
  const ord = norm($("#q").value).split(" ").filter(Boolean);
  const udenKoord = $("#kunUdenKoord").checked, kunAendret = $("#kunAendret").checked;
  let res = steder.filter(s => {
    if (udenKoord && harKoord(s)) return false;
    if (kunAendret && !status.has(s)) return false;
    if (!ord.length) return true;
    const t = norm([s.titel, s.adresse, s.kategori, s.periode, s.beskrivelse].join(" "));
    return ord.every(o => t.includes(o));
  });
  if ($("#sortering").value === "titel") res = res.slice().sort((a, b) => String(a.titel ?? "").localeCompare(String(b.titel ?? ""), "da"));

  $("#adminTitel").textContent = filNavn ? `Admin – ${ind.titel || "uden titel"}` : "Admin";
  $("#antal").textContent = !filNavn ? "" : res.length === steder.length ? `${steder.length} steder` : `${res.length} af ${steder.length} steder`;
  $("#liste").innerHTML = res.map(s => {
    const i = steder.indexOf(s), st = status.get(s);
    const m = [s.adresse, s.periode, s.kategori].filter(Boolean).join(" · ");
    return `<li><button type="button" data-i="${i}" aria-current="${s === valgt}">
      ${ind.rute ? `<span class="nrm">${i + 1}</span>` : ""}<span class="n">${esc(s.titel || "(uden titel)")}</span>${st === "ny" ? '<span class="maerke ny">ny</span>' : st ? '<span class="maerke aendret">ændret</span>' : ""}${harKoord(s) ? "" : '<span class="maerke koord">ingen koord.</span>'}
      ${m ? `<div class="m">${esc(m)}</div>` : ""}</button></li>`;
  }).join("");
}
$("#q").addEventListener("input", tegnListe);
$("#kunUdenKoord").onchange = tegnListe;
$("#kunAendret").onchange = tegnListe;
$("#sortering").onchange = tegnListe;
$("#liste").onclick = e => {
  const k = e.target.closest("[data-i]"); if (!k) return;
  const s = steder[+k.dataset.i];
  if (s === valgt && formAaben) return;
  if (formAaben && formErAendret() && !confirm("Kassér ændringerne i formularen?")) return;
  aabnForm(s);
};
$("#ny").onclick = () => {
  if (formAaben && formErAendret() && !confirm("Kassér ændringerne i formularen?")) return;
  aabnForm(null);
};

/* ---------- formular ---------- */
const F = () => $("#form").elements;
const sand = v => v === true || v === "true" || v === 1;

function aabnForm(s){
  valgt = s; formAaben = true;
  const el = F();
  for (const k of FELTER){
    if (k === "koordinat_ca") el[k].checked = s ? sand(s[k]) : false;
    else el[k].value = s ? String(s[k] ?? "") : "";
    el[k].removeAttribute("aria-invalid");
  }
  $("#fejl").hidden = true;
  $("#formTitel").textContent = s ? "Redigér sted" : "Nyt sted";
  $("#formId").textContent = s ? `id: ${s.id}` + (ind.rute ? ` · nr. ${steder.indexOf(s) + 1} i ruten` : "") : "Får et id, når du gemmer – og lægges sidst i rækkefølgen";
  $("#slet").hidden = !s; $("#flyt").hidden = !s;
  if (s){ const i = steder.indexOf(s); $("#flytOp").disabled = i === 0; $("#flytNed").disabled = i === steder.length - 1; }
  $("#tom").hidden = true; $("#form").hidden = false;
  visBillede(); tegnListe();
  el.titel.focus();
}
function lukForm(){ formAaben = false; valgt = null; $("#form").hidden = true; $("#tom").hidden = false; }

function laesForm(){
  const el = F(), v = {};
  for (const k of FELTER) v[k] = k === "koordinat_ca" ? el[k].checked : el[k].value.replace(/\r\n/g, "\n").trim();
  v.koordinater = normKoord(v.koordinater);
  return v;
}
function formErAendret(){
  if (!formAaben) return false;
  const v = laesForm();
  if (!valgt) return FELTER.some(k => k === "koordinat_ca" ? v[k] : v[k] !== "");
  return FELTER.some(k => k === "koordinat_ca" ? v[k] !== sand(valgt[k]) : v[k] !== String(valgt[k] ?? "").replace(/\r\n/g, "\n").trim());
}

function valider(v){
  const fejl = [], el = F();
  const mark = (k, t) => { fejl.push(t); el[k].setAttribute("aria-invalid", "true"); };
  for (const k of FELTER) el[k].removeAttribute("aria-invalid");
  if (!v.titel) mark("titel", "Titel skal udfyldes.");
  if (v.koordinater && !gyldigKoord(v.koordinater)) mark("koordinater", 'Koordinater skal skrives som "55.641500, 12.080300".');
  else if (v.koordinater){
    const [a, b] = v.koordinater.split(", ").map(Number);
    if (Math.abs(a) > 90 || Math.abs(b) > 180) mark("koordinater", "Koordinaterne findes ikke.");
    else if (a < b && a < 30) mark("koordinater", "Har du byttet om på de to tal? Det første (breddegraden) er normalt størst i Danmark.");
  }
  for (const k of URL_FELTER)
    if (v[k] && !/^https:\/\/\S+$/i.test(v[k])) mark(k, `${el[k].closest("label").firstChild.textContent.trim()} skal starte med https://`);
  $("#fejl").innerHTML = fejl.map(f => `<li>${esc(f)}</li>`).join(""); $("#fejl").hidden = !fejl.length;
  return !fejl.length;
}

$("#form").addEventListener("submit", e => {
  e.preventDefault();
  const v = laesForm();
  if (!valider(v)) { $("#fejl").scrollIntoView({ block:"nearest", behavior:"smooth" }); return; }
  if (valgt){
    if (!formErAendret()) { besked("Ingen ændringer"); return; }
    for (const k of FELTER) valgt[k] = v[k];
    if (status.get(valgt) !== "ny") status.set(valgt, "aendret");
    besked(`"${valgt.titel}" er opdateret – husk at gemme data.json`);
  } else {
    const ny = { id: nytId() };
    for (const k of FELTER) ny[k] = v[k];
    steder.push(ny); status.set(ny, "ny"); valgt = ny;
    besked(`"${ny.titel}" er tilføjet – husk at gemme data.json`);
  }
  ugemt = true; opdaterFilinfo(); aabnForm(valgt);
  $(`#liste [data-i="${steder.indexOf(valgt)}"]`)?.scrollIntoView({ block:"nearest" });
});

function nytId(){
  const brugt = new Set(steder.map(s => String(s.id)));
  let id = Math.floor(Date.now() / 1000);
  while (brugt.has(String(id))) id++;
  return String(id);
}

function flyt(retning){
  if (!valgt) return;
  if (formErAendret() && !confirm("Formularen har ændringer, der ikke er gemt. Flyt alligevel (ændringerne kasseres)?")) return;
  const i = steder.indexOf(valgt), j = i + retning;
  if (j < 0 || j >= steder.length) return;
  [steder[i], steder[j]] = [steder[j], steder[i]];
  ugemt = true; opdaterFilinfo(); aabnForm(valgt);
  $(`#liste [data-i="${j}"]`)?.scrollIntoView({ block:"nearest" });
}
$("#flytOp").onclick = () => flyt(-1);
$("#flytNed").onclick = () => flyt(1);

$("#fortryd").onclick = () => { if (valgt) aabnForm(valgt); else lukForm(); };
$("#slet").onclick = () => {
  if (!valgt) return;
  if (!confirm(`Slet "${valgt.titel}"?\n\nStedet forsvinder fra data.json, når du gemmer filen.`)) return;
  const t = valgt.titel;
  steder.splice(steder.indexOf(valgt), 1); status.delete(valgt);
  ugemt = true; lukForm(); opdaterFilinfo(); tegnListe();
  besked(`"${t}" er slettet – husk at gemme data.json`);
};

/* ---------- billede ---------- */
function visBillede(){
  const u = F().billede_url.value.trim();
  if (/^https:\/\/\S+$/i.test(u)) { $("#billedeImg").src = u; $("#billede").hidden = false; }
  else { $("#billede").hidden = true; $("#billedeImg").removeAttribute("src"); }
}
F().billede_url.addEventListener("input", visBillede);
$("#billedeImg").onerror = () => { $("#billede").hidden = true; };

/* ---------- hjælpere ---------- */
function opdaterFilinfo(){
  $("#filinfo").innerHTML = filNavn
    ? `${esc(filNavn)} · ${steder.length} steder${ugemt ? '<span class="ugemt">Ikke gemt</span>' : ""}`
    : "Ingen fil åbnet";
  document.title = (ugemt ? "● " : "") + "Admin – " + (ind.titel || "kort");
}
let beskedTimer;
function besked(tekst, ms = 3000){
  const b = $("#besked"); b.textContent = tekst; b.hidden = false;
  clearTimeout(beskedTimer); beskedTimer = setTimeout(() => { b.hidden = true; }, ms);
}
