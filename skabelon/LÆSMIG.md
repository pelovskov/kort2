# Kort-skabelon

En lille, statisk kortside med liste og kort. Titel, tekster og alle steder ligger i `data.json`,
som du redigerer med admin på din egen computer. Skabelonen starter med en tom `data.json`.

Kan bruges til byvandringer, sæsonprojekter, lokalhistorie m.m. Slå **Rute / byvandring** til i
indstillingerne, så nummereres stederne og forbindes med en linje på kortet, og man kan bladre
med *Forrige* og *Næste*.

## Nyt projekt

1. Kopiér hele mappen `skabelon` og giv kopien et navn, fx `byvandring-2027`.
2. Åbn `admin/index.html` i kopien (dobbeltklik).
3. Tryk **Åbn data.json** og vælg `data.json` i kopien.
4. Udfyld **Titel og indstillinger** og tryk **Gem indstillinger**.
5. Tilføj steder under **Steder** med **+ Nyt sted**.
6. Tryk **Gem data.json**. I Safari hentes filen ned i Overførsler – flyt den ind i projektmappen
   og erstat den gamle.

## Læg online

Upload disse filer (ikke `admin/`):

```
index.html
app.js
style.css
data.json
.htaccess      (kun på et webhotel med Apache – ikke nødvendig på pCloud)
```

Når du senere retter indholdet, er det kun `data.json`, der skal uploades igen.

## Se siden på din computer

Siden skal vises gennem en lille webserver (ikke ved at dobbeltklikke på `index.html`):

```bash
cd sti/til/projektmappen && python3 -m http.server 8000
```

Åbn http://localhost:8000 – og http://localhost:8000/admin/ for admin (her hentes `data.json` automatisk).

## Felter

**Indstillinger:** `titel`, `undertitel`, `intro` (teksten bag *Om*-knappen), `accentfarve`,
`rute` (true/false), `startpunkt` og `startzoom` (bruges kun, når der ingen steder er).

**Steder:** `id`, `titel`, `beskrivelse`, `kategori` (kommasepareret), `adresse`, `periode`,
`koordinater` ("55.641500, 12.080300"), `koordinat_ca`, `billede_url`, `billede_tekst`,
`link_url`, `lyd_url`. Links skal starte med `https://`.

Kortet bruger OpenStreetMap (gratis med kildeangivelse, som vises nederst på kortet).
