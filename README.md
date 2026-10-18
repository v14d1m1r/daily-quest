# Daily Quest

Lični dnevnik navika: Rust API + PostgreSQL + React/TypeScript interfejs prilagođen telefonu.

## Trenutna verzija

- Registracija, prijava i odjava; lozinke se čuvaju kao Argon2 hash.
- HttpOnly sesije koje traju 30 dana; podaci su odvojeni po korisniku.
- Voda: brzi unos 150/250/500 ml, proizvoljna količina, datum i vreme, izmena i brisanje.
- Dnevni cilj, istorija po datumima i sedmodnevni grafikon.
- Vremenska zona naloga; lokalni dani se računaju u backend-u, uključujući DST.
- Ishrana: doručak, ručak, večera i užina; naziv, opciona količina i beleška, vreme, izmena i brisanje. Pregled na „Moj dan” i posebnom ekranu „Ishrana”.
- Zadaci: naziv, beleška, prioritet, opcioni rok, završavanje i ponovno otvaranje, izmena i brisanje.
- Liste: kreiranje, preimenovanje i brisanje uz očuvanje zadataka.
- Pregledi zadataka: dan, nedelja (ponedeljak–nedelja), mesec i sve; filteri po listi i statusu. „Moj dan” prikazuje nezavršene zadatke do izabranog datuma.
- Adaptivan interfejs na srpskom. Ponavljajući zadaci još nisu implementirani.

## Produkcija

Pripremljeni su Dockerfile, zasebni produkcijski Compose, zatvorena registracija, administratorske komande i šifrovan backup. Uputstvo: [deploy/README.md](deploy/README.md).

## Lokalno pokretanje

Potrebni su Rust stable, Node.js 22.12+ i Docker Compose. Komande se izvršavaju iz korena projekta, osim gde je drugačije navedeno.

```bash
cp .env.example .env
docker compose up -d --wait db
npm --prefix frontend ci
npm --prefix frontend run build
cargo run
```

Otvori **http://127.0.0.1:3000** i napravi nalog. Nema podrazumevanog korisnika niti demo podataka. SQL migracije se automatski izvršavaju pri pokretanju. Ako Docker traži administratorska prava, pokreni `sudo docker compose up -d --wait db` iz svog terminala.

Baza sluša samo na `127.0.0.1:5438`, a njeni podaci ostaju u Docker volume-u `daily_quest_data`. `docker compose down` ne briše podatke; `down -v` ih briše.

### Razvoj sa automatskim osvežavanjem interfejsa

Prvi terminal:

```bash
cargo run
```

Drugi terminal:

```bash
npm --prefix frontend run dev
```

Otvori **http://127.0.0.1:5173**. Vite prosleđuje `/api` zahteve Rust serveru na portu 3000. Posle izmene Rust koda restartuj `cargo run`.

## Provere

```bash
cargo fmt --check
cargo test
cargo clippy --all-targets -- -D warnings
npm --prefix frontend run build
npm --prefix frontend test
python3 scripts/smoke_test.py
```

Poslednja komanda zahteva pokrenut server i bazu. Kreira dva privremena test naloga i proverava autentikaciju, upis, izmenu, zbir, izolaciju korisnika, brisanje, validaciju i odjavu. Proverava i CRUD obroka, premeštanje na drugi dan i promenu vremenske zone, kao i CRUD zadataka/lista, promenu statusa, izolaciju korisnika i očuvanje zadataka posle brisanja liste. Briše test unose, ali ostavlja test naloge radi ponovljivog, bezbednog testiranja bez direktnog pristupa bazi. Namenjena je lokalnom razvojnom okruženju.

## Struktura

```text
src/main.rs          Rust API, autentikacija i dnevni pregledi
src/meals.rs         Dnevnik ishrane, validacija i pristup obrocima
src/tasks.rs         Zadaci i korisničke liste
migrations/          Verzije šeme PostgreSQL baze
frontend/src/        React interfejs i stilovi
scripts/             Integraciona provera API-ja
compose.yaml         Lokalna PostgreSQL baza
openapi.json         API ugovor za web i budući Android klijent
```

## Pravila podataka

- Rok zadatka je kalendarski datum bez sata. Nezavršeni zadaci pre početka izabranog perioda ostaju u pregledu; završeni se prikazuju samo ako im rok pripada periodu. Zadaci bez roka su u „Sve”.
- U prikazu zadataka moguće je izabrati i budući datum. Oznaka „Kasni” poredi rok sa današnjim datumom u zoni naloga.
- Brisanje liste premešta njene zadatke u „Bez liste”. Baza sprečava dodelu zadatka tuđoj listi.
- Migracija `0003_tasks.sql` dodaje liste i zadatke; postojeći podaci ostaju sačuvani.

- Obrok ima naziv do 120 znakova, tip (`breakfast`, `lunch`, `dinner`, `snack`), opcionu količinu do 120 znakova i belešku do 2000 znakova. Količina je slobodan tekst; kalorije i makronutrijenti se ne računaju.
- Nova migracija `0002_meals.sql` dodaje tabelu za obroke bez promene postojećih podataka. Restartuj Rust server nakon ažuriranja da bi se migracija primenila.

- Voda se čuva u celim mililitrima (1–10000 po unosu), vreme kao UTC `timestamptz`.
- Granice dana određuje IANA zona naloga, podrazumevano `Europe/Belgrade`.
- Ručni unos koristi zonu naloga, nezavisno od zone računara. Nepostojeće vreme tokom prolećnog DST prelaza se odbija; pri dvostrukom jesenjem satu bira se jedna od odgovarajućih instanci.
- Sedmodnevni prosek uključuje sve dane u opsegu, i one bez unosa.
- Dnevni cilj je korisničko podešavanje, ne zdravstvena preporuka. Trenutni cilj prikazuje se i za prethodne dane; istorija promena cilja još nije podržana.
- Sesije su u bazi; ponovno pokretanje servera ne odjavljuje korisnika. Ograničenje pokušaja prijave je u memoriji i resetuje se restartom.
- Mutirajući API zahtevi zahtevaju zaglavlje `X-Daily-Quest: 1`. API nema cross-origin dozvole; web aplikacija i API rade sa istog origin-a.

## Pre javnog postavljanja

Koristi produkcijske datoteke iz `deploy/README.md`: podesi postojeći HTTPS proxy, tajne, off-site backup i monitoring. Istekle sesije se čiste na sat, a administratorski reset lozinke poništava aktivne sesije. Registracija je podrazumevano zatvorena; razvojni `.env.example` uključuje je kroz `REGISTRATION_ENABLED=true`. Lozinke i tokene ne stavljati u Git. Fontovi se učitavaju sa Google Fonts, uz sistemske fallback fontove.

## Naredni koraci

1. Ponavljajući zadaci: zasebna izvršenja dnevnih/nedeljnih/mesečnih zadataka.
2. Proširenje dnevnika ishrane po potrebi: omiljeni obroci i nutritivni podaci.
3. Zajednički pregled „Danas”, izvoz podataka i backup.
4. Capacitor Android klijent, navigacija, bezbedno čuvanje sesije i podsetnici.
5. Lokalno čuvanje i sinhronizacija za rad bez interneta.

Backend ostaje zajednički REST API. Za prvu verziju stilovi su običan CSS sa zajedničkim varijablama; Tailwind nije potreban za trenutni obim.
