/* Lokal admin til data.json – kører helt i browseren, intet sendes nogen steder hen.
   Åbn data.json, ret/tilføj/slet, og gem en ny data.json, som uploades til webhotellet. */
"use strict";

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const norm = s => String(s ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

// Feltrækkefølge for nye butikker (samme som de fleste eksisterende poster)
const FELTER = ["navn","beskrivelse","tags","vej","husnr","postnr_by","koordinater","koordinat_ca",
                "periode_start","periode_slut","billede_url","mere_info_url","lyd_url"];
const VALGFRI = new Set(["lyd_url"]);   // tilføjes kun til en post, hvis feltet udfyldes
const URL_FELTER = ["billede_url","mere_info_url","lyd_url"];

let data = [];                 // alle butikker (objekterne fra filen)
let filHandle = null;          // når browseren kan gemme direkte i den åbnede fil (Chrome/Edge)
let filNavn = "";
let ugemt = false;             // ændringer der ikke er gemt i data.json endnu
let valgt = null;              // objektet der redigeres (null = ny butik)
let formAaben = false;
const status = new Map();      // objekt -> "ny" | "aendret"

/* ---------- format: præcis som den eksisterende data.json ---------- */
// 4 mellemrum, æøå som de er, "/" skrevet som "\/", ingen linjeskift til sidst
const formater = arr => JSON.stringify(arr, null, 4).replace(/\//g, "\\/");

/* ---------- indlæs ---------- */
function indlaes(tekst, navn){
  let arr;
  try { arr = JSON.parse(tekst); }
  catch (e) { besked("Filen er ikke gyldig JSON: " + e.message, 6000); return false; }
  if (!Array.isArray(arr)) { besked("Filen indeholder ikke en liste af butikker.", 6000); return false; }
  data = arr; filNavn = navn; ugemt = false; status.clear(); valgt = null;
  lukForm();
  $("#gemFil").disabled = false; $("#ny").disabled = false;
  opdaterFilinfo(); tegnListe();
  if (formater(arr) !== tekst) console.info("Bemærk: filens formatering afviger lidt fra standard – den normaliseres ved gem.");
  besked(`${data.length} butikker indlæst`);
  return true;
}

$("#aabnFil").onclick = async () => {
  if (ugemt && !confirm("Du har ændringer, der ikke er gemt i data.json. Åbn en anden fil alligevel?")) return;
  if (window.showOpenFilePicker){
    try {
      const [h] = await showOpenFilePicker({ types:[{ description:"JSON", accept:{"application/json":[".json"]} }] });
      const f = await h.getFile();
      if (indlaes(await f.text(), f.name)) filHandle = h;
    } catch (e) { if (e.name !== "AbortError") besked("Kunne ikke åbne filen: " + e.message, 6000); }
  } else {
    $("#filvaelger").value = ""; $("#filvaelger").click();
  }
};
$("#filvaelger").onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  if (indlaes(await f.text(), f.name)) filHandle = null;
};

// Når siden vises via en lokal webserver, hentes ../data.json automatisk
(async () => {
  if (!location.protocol.startsWith("http")) return;
  try {
    const r = await fetch("../data.json", { cache:"no-store" });
    if (r.ok) indlaes(await r.text(), "data.json (projektmappen)");
  } catch {}
})();

/* ---------- gem fil ---------- */
$("#gemFil").onclick = gemFil;
async function gemFil(){
  if (formAaben && formErAendret() &&
      !confirm("Formularen har ændringer, du ikke har trykket \"Gem ændringer\" på. De kommer ikke med. Fortsæt?")) return;
  const tekst = formater(data);
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
  } catch (e) {
    if (e.name !== "AbortError") besked("Kunne ikke gemme: " + e.message, 6000);
  }
}
function gemt(tekst, ms){
  ugemt = false; status.clear(); opdaterFilinfo(); tegnListe(); besked(tekst, ms);
}

window.addEventListener("beforeunload", e => {
  if (ugemt || (formAaben && formErAendret())) { e.preventDefault(); e.returnValue = ""; }
});

/* ---------- liste ---------- */
const adresse = b => [b.vej, b.husnr].map(x => String(x ?? "").trim()).filter(Boolean).join(" ");
const harKoord = b => /^\s*-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?\s*$/.test(String(b.koordinater ?? ""));

function sorter(a, b){
  const s = $("#sortering").value;
  if (s === "nyeste") return (Number(b.id) || 0) - (Number(a.id) || 0);
  if (s === "gade") return String(a.vej ?? "").localeCompare(String(b.vej ?? ""), "da")
    || (parseInt(a.husnr) || 9999) - (parseInt(b.husnr) || 9999);
  return String(a.navn ?? "").localeCompare(String(b.navn ?? ""), "da");
}

function tegnListe(){
  const ord = norm($("#q").value).split(" ").filter(Boolean);
  const udenKoord = $("#kunUdenKoord").checked, kunAendret = $("#kunAendret").checked;
  const res = data.filter(b => {
    if (udenKoord && harKoord(b)) return false;
    if (kunAendret && !status.has(b)) return false;
    if (!ord.length) return true;
    const t = norm([b.navn, b.vej, b.husnr, b.tags, b.beskrivelse, b.periode_start, b.periode_slut].join(" "));
    return ord.every(o => t.includes(o));
  }).sort(sorter);

  $("#antal").textContent = res.length === data.length ? `${data.length} butikker` : `${res.length} af ${data.length} butikker`;
  $("#liste").innerHTML = res.map(b => {
    const i = data.indexOf(b), st = status.get(b);
    const m = [adresse(b), [b.periode_start, b.periode_slut].filter(Boolean).join("–")].filter(Boolean).join(" · ");
    return `<li><button type="button" data-i="${i}" aria-current="${b === valgt}">
      <span class="n">${esc(b.navn || "(uden navn)")}</span>${st === "ny" ? '<span class="maerke ny">ny</span>' : st ? '<span class="maerke aendret">ændret</span>' : ""}${harKoord(b) ? "" : '<span class="maerke koord">ingen koord.</span>'}
      ${m ? `<div class="m">${esc(m)}</div>` : ""}</button></li>`;
  }).join("");
}
$("#q").addEventListener("input", tegnListe);
$("#kunUdenKoord").onchange = tegnListe;
$("#kunAendret").onchange = tegnListe;
$("#sortering").onchange = tegnListe;
$("#liste").onclick = e => {
  const k = e.target.closest("[data-i]"); if (!k) return;
  const b = data[+k.dataset.i];
  if (b === valgt && formAaben) return;
  if (formAaben && formErAendret() && !confirm("Kassér ændringerne i formularen?")) return;
  aabnForm(b);
};
$("#ny").onclick = () => {
  if (formAaben && formErAendret() && !confirm("Kassér ændringerne i formularen?")) return;
  aabnForm(null);
};

/* ---------- formular ---------- */
const F = () => $("#form").elements;

function aabnForm(b){
  valgt = b; formAaben = true;
  const el = F();
  for (const k of FELTER){
    if (k === "koordinat_ca") el[k].checked = b ? b[k] === true || b[k] === "true" || b[k] === 1 : false;
    else el[k].value = b ? String(b[k] ?? "") : (k === "postnr_by" ? "4000 Roskilde" : "");
  }
  for (const k of FELTER) el[k].removeAttribute?.("aria-invalid");
  $("#fejl").hidden = true;
  $("#formTitel").textContent = b ? "Redigér butik" : "Ny butik";
  $("#formId").textContent = b ? `id: ${b.id}` : "Får et id, når du gemmer";
  $("#slet").hidden = !b;
  $("#tom").hidden = true; $("#form").hidden = false;
  visBillede();
  tegnListe();
  el.navn.focus();
}
function lukForm(){
  formAaben = false; valgt = null;
  $("#form").hidden = true; $("#tom").hidden = false;
}

function laesForm(){
  const el = F(), v = {};
  for (const k of FELTER) v[k] = k === "koordinat_ca" ? el[k].checked : el[k].value.replace(/\r\n/g, "\n").trim();
  // koordinater skrives ens: "55.123456, 12.123456"
  const k = v.koordinater.match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/);
  if (k) v.koordinater = `${k[1]}, ${k[2]}`;
  return v;
}
function formErAendret(){
  if (!formAaben) return false;
  const v = laesForm();
  if (!valgt) return FELTER.some(k => k === "koordinat_ca" ? v[k] : k === "postnr_by" ? v[k] !== "4000 Roskilde" : v[k] !== "");
  return FELTER.some(k => k === "koordinat_ca"
    ? v[k] !== (valgt[k] === true || valgt[k] === "true" || valgt[k] === 1)
    : v[k] !== String(valgt[k] ?? "").replace(/\r\n/g, "\n").trim());
}

function valider(v){
  const fejl = [];
  const marker = (felt, tekst) => { fejl.push(tekst); F()[felt].setAttribute("aria-invalid", "true"); };
  for (const k of FELTER) F()[k].removeAttribute?.("aria-invalid");

  if (!v.navn) marker("navn", "Navn skal udfyldes.");
  if (v.koordinater){
    const m = v.koordinater.match(/^(-?\d+(?:\.\d+)?), (-?\d+(?:\.\d+)?)$/);
    if (!m) marker("koordinater", 'Koordinater skal skrives som "55.641500, 12.080300".');
    else if (+m[1] < 54.5 || +m[1] > 57.8 || +m[2] < 8 || +m[2] > 15.3)
      marker("koordinater", "Koordinaterne ligger ikke i Danmark – har du byttet om på de to tal?");
  }
  for (const k of ["periode_start","periode_slut"])
    if (v[k] && !/^\d{4}$/.test(v[k])) marker(k, `${k === "periode_start" ? "Periode start" : "Periode slut"} skal være et årstal med fire cifre.`);
  if (/^\d{4}$/.test(v.periode_start) && /^\d{4}$/.test(v.periode_slut) && +v.periode_slut < +v.periode_start)
    marker("periode_slut", "Periode slut er før periode start.");
  for (const k of URL_FELTER)
    if (v[k] && !/^https:\/\/[^\s]+$/i.test(v[k])) marker(k, `${F()[k].closest("label").firstChild.textContent.trim()} skal starte med https://`);

  $("#fejl").innerHTML = fejl.map(f => `<li>${esc(f)}</li>`).join("");
  $("#fejl").hidden = !fejl.length;
  return !fejl.length;
}

$("#form").addEventListener("submit", e => {
  e.preventDefault();
  const v = laesForm();
  if (!valider(v)) { $("#fejl").scrollIntoView({ block:"nearest", behavior:"smooth" }); return; }

  if (valgt){
    if (!formErAendret()) { besked("Ingen ændringer"); return; }
    for (const k of FELTER){
      if (!(k in valgt) && (VALGFRI.has(k) ? !v[k] : false)) continue;  // tilføj ikke tomme valgfri felter
      valgt[k] = v[k];
    }
    if (status.get(valgt) !== "ny") status.set(valgt, "aendret");
    besked(`"${valgt.navn}" er opdateret – husk at gemme data.json`);
  } else {
    const ny = {};
    for (const k of FELTER) if (!(VALGFRI.has(k) && !v[k])) ny[k] = v[k];
    ny.id = nytId();
    data.push(ny); status.set(ny, "ny"); valgt = ny;
    besked(`"${ny.navn}" er tilføjet – husk at gemme data.json`);
  }
  ugemt = true; opdaterFilinfo();
  aabnForm(valgt);
  const knap = $(`#liste [data-i="${data.indexOf(valgt)}"]`); knap?.scrollIntoView({ block:"nearest" });
});

function nytId(){
  const brugt = new Set(data.map(b => String(b.id)));
  let id = Math.floor(Date.now() / 1000);
  while (brugt.has(String(id))) id++;
  return id;
}

$("#fortryd").onclick = () => { if (valgt) aabnForm(valgt); else lukForm(); };

$("#slet").onclick = () => {
  if (!valgt) return;
  if (!confirm(`Slet "${valgt.navn}"?\n\nButikken forsvinder fra data.json, når du gemmer filen.`)) return;
  const navn = valgt.navn;
  data.splice(data.indexOf(valgt), 1); status.delete(valgt);
  ugemt = true; lukForm(); opdaterFilinfo(); tegnListe();
  besked(`"${navn}" er slettet – husk at gemme data.json`);
};

/* ---------- billede-forhåndsvisning ---------- */
function visBillede(){
  const u = F().billede_url.value.trim();
  if (/^https:\/\/\S+$/i.test(u)) { $("#billedeImg").src = u; $("#billede").hidden = false; }
  else { $("#billede").hidden = true; $("#billedeImg").removeAttribute("src"); }
}
F().billede_url.addEventListener("input", visBillede);
$("#billedeImg").onerror = () => { $("#billede").hidden = true; };

/* ---------- små hjælpere ---------- */
function opdaterFilinfo(){
  $("#filinfo").innerHTML = filNavn
    ? `${esc(filNavn)} · ${data.length} butikker${ugemt ? '<span class="ugemt">Ikke gemt</span>' : ""}`
    : "Ingen fil åbnet";
  document.title = (ugemt ? "● " : "") + "Admin – De glemte butikker";
}
let beskedTimer;
function besked(tekst, ms = 3000){
  const b = $("#besked"); b.textContent = tekst; b.hidden = false;
  clearTimeout(beskedTimer); beskedTimer = setTimeout(() => { b.hidden = true; }, ms);
}
