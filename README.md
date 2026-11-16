# De glemte butikker i Roskilde

Statisk side med liste og kort over Roskildes forsvundne butikker. Ingen PHP, ingen database.

## Filer

- `index.html` – siden
- `css/style.css`, `js/app.js` – udseende og funktion
- `data.json` – alle butikker (den eneste datakilde)
- `.htaccess` – sikkerhedsheadere og HTTPS (Apache/webhotel)

## Ret i data

Ret `data.json` (fx direkte på GitHub eller i en teksteditor) og læg filen op på webhotellet.
Hver butik har felterne `id`, `navn`, `beskrivelse`, `tags`, `vej`, `husnr`, `postnr_by`,
`koordinater` ("55.xxxx, 12.xxxx"), `koordinat_ca`, `periode_start`, `periode_slut`,
`billede_url`, `mere_info_url`, `lyd_url`. Links skal starte med `https://`.

## Se siden lokalt

```bash
python3 -m http.server 8000
```

Åbn derefter http://localhost:8000
