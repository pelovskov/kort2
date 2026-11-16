# De glemte butikker i Roskilde

Statisk side med liste og kort over Roskildes forsvundne butikker. Ingen PHP, ingen database.

## Filer

- `index.html` – siden
- `css/style.css`, `js/app.js` – udseende og funktion
- `data.json` – alle butikker (den eneste datakilde)
- `.htaccess` – sikkerhedsheadere og HTTPS (Apache/webhotel)
- `admin/` – lokal admin til `data.json` (kun til din computer)

## Ret i data – lokal admin

Mappen `admin/` er et lille redigeringsværktøj, der kun kører på din egen computer.
**Læg den ikke på webhotellet** (`.htaccess` blokerer den, hvis det sker ved et uheld).

1. Dobbeltklik på `admin/index.html` (eller åbn http://localhost:8000/admin/, hvis den lokale server kører – så hentes `data.json` automatisk).
2. Tryk **Åbn data.json** og vælg `data.json` i projektmappen.
3. Vælg en butik i listen for at rette eller slette den, eller tryk **+ Ny butik**. Tryk **Gem ændringer** i formularen.
4. Tryk **Gem data.json**. I Chrome/Edge gemmes direkte i filen; i Safari hentes en ny `data.json` ned i Overførsler – flyt den ind i projektmappen og erstat den gamle.
5. Commit i GitHub Desktop, og læg `data.json` op på webhotellet.

Man kan også rette `data.json` direkte på GitHub eller i en teksteditor.
Hver butik har felterne `id`, `navn`, `beskrivelse`, `tags`, `vej`, `husnr`, `postnr_by`,
`koordinater` ("55.xxxx, 12.xxxx"), `koordinat_ca`, `periode_start`, `periode_slut`,
`billede_url`, `mere_info_url`, `lyd_url`. Links skal starte med `https://`.

## Se siden lokalt

```bash
python3 -m http.server 8000
```

Åbn derefter http://localhost:8000
