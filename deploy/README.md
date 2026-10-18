# Daily Quest na postojećem Linode serveru

Ove datoteke su priprema za deploy; ništa nije menjano na Linode-u. Produkcijski Compose je **zaseban** od razvojnog. Sve komande ispod izvršavati iz `/opt/daily-quest` osim gde piše drugačije. Potrebni su Docker Engine/Compose v2, Python 3, OpenSSL, `age` i `flock` (util-linux). Koristi `sudo` gde server zahteva; Docker pristup je privilegovan pristup serveru.

## 1. Pre pokretanja

- Proveri postojeći reverse proxy, slobodan port 3080 (`ss -ltnp`) i raspoloživ RAM/disk. Rust release build može biti zahtevan: bolje image izgraditi u CI ili na računaru iste arhitekture i preneti ga na server. Nemoj pokretati paralelne teške build-ove dok cryptobot radi.
- Kopiraj projekat ili checkout proverene Git revizije u `/opt/daily-quest`. Lokalni `.env`, razvojnu bazu, `node_modules`, `target` i test naloge ne prenositi automatski.
- Postavi DNS A zapis `dailyquest.v14d1m1r.net` na server. AAAA samo ako IPv6 radi. Ne menjaj DNS drugih aplikacija.
- Ne otvaraj port 3080 niti PostgreSQL port u firewall-u. Postojeći proxy koristi 80/443, postojeći SSH pristup ostaje.

```bash
cp .env.production.example .env.production
chmod 600 .env.production
openssl rand -hex 32
```

Upiši generisanu vrednost u `POSTGRES_PASSWORD` u `.env.production`, a `APP_TAG` postavi na jedinstvenu oznaku release-a, npr. `2026-10-15-01`. Nemoj deliti izlaz `docker compose config` ili `docker inspect`: sadrže tajne. `config --quiet` proverava bez ispisa. `.env.production` se ne čita kao shell skripta.

```bash
bash scripts/production.sh config --quiet
bash scripts/production.sh build app
bash scripts/production.sh up -d --no-build --wait
bash scripts/production.sh ps
curl --fail http://127.0.0.1:3080/api/health
python3 scripts/account.py create-user
```

Prilikom kreiranja naloga lozinka je skrivena i prosleđuje se preko stdin, bez argumenta procesa/fajla. Registracija je isključena i na API-ju i u interfejsu. Možeš istom komandom dodati još korisnika; ne moraš otvarati registraciju. `python3 scripts/account.py reset-password` menja lozinku i poništava sve sesije tog naloga.

Migracije se primenjuju automatski pri pokretanju. Baza je u trajnom volume-u projekta `dailyquest`. Ne menjaj project name na slepo i ne koristi `down -v`. Promena POSTGRES_PASSWORD u env fajlu **ne menja** lozinku postojećeg PostgreSQL korisnika; rotaciju koordinisati u bazi i aplikaciji.

## 2. Povezivanje na HTTPS

Izaberi postojeći proxy, **ne pokreći drugi na istim portovima**:

- Host Caddy: uklopi `Caddyfile.example`, proveri `caddy validate --config /etc/caddy/Caddyfile`, pa reload. DNS i 80/443 moraju biti dostupni za automatski sertifikat.
- Host Nginx: primer `nginx.conf.example` očekuje već izdat sertifikat. Koristi postojeći Certbot/ACME postupak; za početno izdavanje koristi privremeni HTTP-only vhost sa ACME webroot-om ili DNS challenge. Tek zatim uključi TLS primer, proveri `nginx -t` i reload. Sačuvaj postojeće vhost-ove. Nginx primer ima dodatno ograničenje auth zahteva po IP-u.
- Ako proxy radi u Docker-u: `127.0.0.1` u njemu nije host. Priključi app na postojeću proxy Docker mrežu preko dodatnog Compose override-a i dodeli jedinstveni alias `dailyquest-app`; upstream je `dailyquest-app:3000`. Bazu ostavi samo na internoj database mreži. Prilagodi sve production.sh komande da uvek uključuju isti override.

`COOKIE_SECURE=true` je obavezan. Za svakodnevnu prijavu koristi samo `https://dailyquest.v14d1m1r.net`, ne direktni HTTP port.

Proveri: health, zatvorenu registraciju (`/api/config`), prijavu/odjavu, upis i izmenu vode/obroka/zadataka, obe teme i telefon. Sačuvaj jedan probni unos pa restartuj app i proveri da je ostao. Postojeći `smoke_test.py` pravi naloge i zato **nije za zatvorenu produkciju**.

## 3. Backup i probno vraćanje

Generiši age ključ **na svom računaru** (`age-keygen -o dailyquest-backup.key`) i sačuvaj privatni ključ u password manager-u/bezbednoj rezervnoj kopiji. Serveru za backup treba samo javni `age1...` recipient.

```bash
AGE_RECIPIENT=age1... bash scripts/backup.sh
```

Backup je konzistentan PostgreSQL custom dump, odmah šifrovan; plaintext dump se ne zapisuje. Fajlovi su u `backups/`, sa ograničenim dozvolama. Backup sadrži lične podatke i hash-eve lozinki. `BACKUP_DIR` opciono menja odredište. Skripta ne briše stare kopije automatski.

Za raspored instaliraj primer service/timer-a u `/etc/systemd/system/`, pa napravi `/etc/dailyquest/backup.env` sa dozvolama 600:

```text
AGE_RECIPIENT=age1...
BACKUP_DIR=/opt/daily-quest/backups
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now dailyquest-backup.timer
sudo systemctl start dailyquest-backup.service
sudo journalctl -u dailyquest-backup.service -n 30
```

**Kopija samo na serveru nije dovoljna.** Pre puštanja podesi isporuku šifrovanih fajlova na drugi računar/storage, npr. `rsync -a /opt/daily-quest/backups/ backup-user@backup-host:/backups/dailyquest/` uz namenski SSH ključ. Ne koristi `--delete`. Preporuka retencije: 14 dnevnih i 8 nedeljnih kopija; tek posle provere off-site kopija uklanjaj starije fajlove. Prati neuspeh backup job-a i zauzeće diska; priloženi timer ne šalje obaveštenja.

Probno vraćanje možeš uraditi na odvojenoj mašini sa istim Compose projektom ili na serveru uz privremeni privatni ključ:

```bash
bash scripts/restore-check.sh /putanja/backup.dump.age /bezbedna/putanja/dailyquest-backup.key
```

Vraća u novu privremenu bazu, proverava dostupnost ključnih tabela i ispisuje broj redova, pa uklanja samo tu privremenu bazu. Ne dira produkcijske podatke. Za potpunu probu oporavka pokreni i aplikaciju nad obnovljenom bazom u izolovanom okruženju. Ne ostavljaj privatni age ključ trajno na produkcijskom serveru.

## 4. Ažuriranje i povratak

1. Sačuvaj stari APP_TAG, Git reviziju, env konfiguraciju i image. Ne prepisuj isti tag za novu verziju.
2. Napravi i kopiraj backup van servera.
3. Preuzmi novu proverenu reviziju i promeni APP_TAG. Izgradi novi image ili učitaj već izgrađen.
4. `bash scripts/production.sh up -d --no-build --wait app` (ne menja db servis). Proveri health i glavne tokove. Ako health ne prolazi, pogledaj `bash scripts/production.sh logs --tail=100 app`.
5. Za kompatibilnu šemu: vrati stari tag i ponovi `up -d --no-build --wait app`.
6. Ako migracije nisu kompatibilne sa starim image-om: zastoj, svež backup trenutnog stanja, stara revizija i image, zatim kontrolisano vraćanje pre-deploy backupa. Time se gube upisi nastali posle backupa; odluka mora biti svesna.

```bash
bash scripts/restore.sh /putanja/backup.dump.age /bezbedna/putanja/dailyquest-backup.key
# Posle potvrde, oporavak ostavlja app zaustavljen.
# Postavi kompatibilni APP_TAG/reviziju, zatim:
bash scripts/production.sh up -d --no-build --wait app
```

Restore prvo proverava arhivu u privremenoj bazi, zahteva eksplicitnu potvrdu, zaustavlja app i izvršava restore u transakciji. Poništava sesije. U slučaju greške app ostaje zaustavljen radi istrage. Arhiva namenjena ovom postupku mora biti kompletan backup Daily Quest baze; nema automatskog downgrade-a migracija.

## Operativne napomene

- Restart politika podiže kontejnere posle restarta Docker-a; unhealthy status sam ne restartuje zaglavljen proces. Podesi spoljašnji uptime monitor, obaveštenja za disk i backup greške.
- Compose ne rezerviše resurse: po merenju opterećenja postavi memory/cpu limite da zaštitiš cryptobot. Build možeš premestiti van servera.
- Login ima ograničenje pokušaja po emailu i ukupni limit auth pokušaja u procesu; resetuju se restartom. Nginx primer dodaje IP limit. Ako koristiš drugi proxy, razmotri ekvivalentan limit; ne veruj proizvoljnom X-Forwarded-For iz javnih zahteva.
- Base image tagovi su fiksirani na seriju, ne digest; za strogo ponovljive release-e pinuj proverene image digest-e. PostgreSQL major upgrade nije automatski: koristi odgovarajući dump/restore ili pg_upgrade postupak.
- Nema email reset-a, verifikacije emaila, javne registracije ili automatske off-site isporuke dok ih posebno ne konfigurišeš.

## Status lokalne provere

Prošli su Rust testovi i Clippy, frontend build, parsiranje produkcijskog Compose-a i shell sintaksa skripti. Test zatvorene registracije ne zahteva bazu i proverava odbijanje na samom API-ju.

Korisnik je prijavio da je izvršio Docker build komandu; image nije nezavisno pregledan jer Docker socket zahteva sudo. Provera nad lokalnom razvojnom bazom je prošla: zatvorena registracija, administratorsko kreiranje naloga, prijava, reset lozinke, poništavanje starih sesija i odjava. Još nisu potvrđeni: pokretanje produkcijskog kontejnera, izvršavanje age backup-a i stvarni restore. `age` nije instaliran u razvojnom okruženju. Ne smatrati ove provere završenim pre deploy-a.

Za lokalnu proveru admin komandi: pokreni razvojnu bazu (`sudo docker compose up -d --wait db`), zatim `BIND_ADDRESS=127.0.0.1:3099 REGISTRATION_ENABLED=false cargo run` i u drugom terminalu `python3 scripts/deployment_smoke.py`. Skripta pravi poseban test nalog u razvojnoj bazi. Za produkcijski image: `sudo docker build -t dailyquest:deployment-test .`. Zatim proveri backup i restore po odeljku 3, pre unošenja pravih podataka.
