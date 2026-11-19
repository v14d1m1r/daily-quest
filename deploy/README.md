# Daily Quest na postojećem Linode serveru

Aplikacija je objavljena na **https://dailyquest.v14d1m1r.net**. Korisnik je 19. oktobra 2026. potvrdio da aplikacija i HTTPS rade. Aktivni reverse proxy je **Caddy u Docker-u**, ne host Nginx. Produkcijski Compose je **zaseban** od razvojnog. Sve komande ispod izvršavati iz `/opt/daily-quest` osim gde piše drugačije. Potrebni su Docker Engine/Compose v2, Python 3, OpenSSL, `age` i `flock` (util-linux). Koristi `sudo` gde server zahteva; Docker pristup je privilegovan pristup serveru.

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

Za ovaj server koristi postojeći kontejner `linode-caddy-1` i mrežu `linode_default`. Portove 80/443 već drži Caddy; **ne pokretati host Nginx niti Certbot za Daily Quest**. `nginx.conf.example` i host `Caddyfile.example` ostaju samo primeri za druga okruženja.

| Stavka | Vrednost |
| --- | --- |
| Projekat | `/opt/daily-quest` |
| Caddy kontejner | `linode-caddy-1` |
| Caddy Compose direktorijum | `/opt/trainer-platform/infra/linode` |
| Caddyfile na hostu | `/opt/trainer-platform/infra/linode/Caddyfile` |
| Caddyfile u kontejneru | `/etc/caddy/Caddyfile` |
| Zajednička mreža | `linode_default` |
| Upstream | `dailyquest-app:3000` |
| Lokalni port za dijagnostiku | `127.0.0.1:3080` |

Za prvo povezivanje kopiraj primer u serverski override (ne prepisuj postojeći prilagođeni fajl):

```bash
cp compose.proxy.yaml.example compose.proxy.yaml
bash scripts/production.sh config --quiet
bash scripts/production.sh up -d --no-build --no-deps --wait app
docker exec linode-caddy-1 wget -qO- http://dailyquest-app:3000/api/health
```

`scripts/production.sh` automatski uključuje `compose.proxy.yaml` ako postoji. Zadrži ga na serveru pri svakom ažuriranju; fajl je ignorisan u Git-u. Samo app dobija alias `dailyquest-app` na zajedničkoj mreži. Baza ostaje na internoj mreži projekta. `127.0.0.1:3080` nije upstream za Caddy kontejner: tamo localhost označava sam Caddy kontejner.

Sačuvaj kopiju postojećeg Caddyfile-a pre izmene. Sledeći zaseban blok dodat je uz postojeći trainer blok; **ne dodavati ga ponovo ako već postoji**:

```caddyfile
dailyquest.v14d1m1r.net {
    encode zstd gzip
    reverse_proxy dailyquest-app:3000
}
```

Daily Quest očekuje `/api` prefiks, pa za njega ne kopirati `uri strip_prefix /api` iz trainer konfiguracije. Posle izmene proveri da kontejner vidi novi blok, validiraj i tek onda uradi reload:

```bash
docker exec linode-caddy-1 tail -n 20 /etc/caddy/Caddyfile
docker exec linode-caddy-1 caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
# Samo posle uspešne validacije:
docker exec linode-caddy-1 caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
curl --fail https://dailyquest.v14d1m1r.net/api/health
curl --fail https://dailyquest.v14d1m1r.net/api/config
```

Caddy upravlja HTTPS sertifikatom kroz svoje postojeće trajne volumene. Koristi reload bez restartovanja zajedničkog proxy-ja. Proveri i da postojeći sajtovi i dalje rade.

### Ako HTTPS ne proradi

- `nginx.service is not active` / `Address already in use`: ovaj server koristi Docker Caddy na 80/443; ne pokreći drugi proxy.
- `tlsv1 alert internal error` uz Caddy log `config is unchanged`: proveri da Daily Quest blok zaista postoji u oba fajla. U ovom deploy-u blok je nedostajao; dodavanje i reload rešili su problem. Sama TLS poruka ne dokazuje uzrok.
- Ako host ima novi blok, a kontejner ga nema, moguće je da je editor zamenio inode pojedinačno montiranog fajla. Sačuvaj izmenjeni sadržaj i upiši ga u originalni montirani fajl bez zamene inode-a ili planiraj prelazak na mount direktorijuma.
- Ako interni health zahtev ne radi, proveri override i članstvo app kontejnera u `linode_default` mreži.
- Za grešku sertifikata proveri DNS A/AAAA zapise, dostupnost 80/443 i sveže logove:

```bash
docker logs --since=5m --tail=60 linode-caddy-1
```

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
4. `bash scripts/production.sh up -d --no-build --no-deps --wait app` (ne pokreće niti ponovo kreira db servis). Proveri health i glavne tokove. Ako health ne prolazi, pogledaj `bash scripts/production.sh logs --tail=100 app`.
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

## Status provera

Prošli su Rust testovi i Clippy, frontend build, parsiranje produkcijskog Compose-a i shell sintaksa skripti. Test zatvorene registracije ne zahteva bazu i proverava odbijanje na samom API-ju.

Potvrđeno lokalnim integracionim testom: zatvorena registracija, administratorsko kreiranje naloga, prijava, reset lozinke, poništavanje starih sesija i odjava.

Potvrđeno prema izlazima sa servera i korisnikovoj završnoj potvrdi od 19. oktobra 2026: produkcijski kontejneri su pokrenuti, app je povezan sa postojećim Caddy-jem i aplikacija radi preko HTTPS-a. Nije obavljena nezavisna vizuelna provera browserom.

Još nije potvrđeno: izvršavanje šifrovanog backup-a, automatski raspored, isporuka kopije van servera i stvarni restore. Ove provere ostaju sledeći operativni korak po odeljku 3.

Za lokalnu proveru admin komandi: pokreni razvojnu bazu (`sudo docker compose up -d --wait db`), zatim `BIND_ADDRESS=127.0.0.1:3099 REGISTRATION_ENABLED=false cargo run` i u drugom terminalu `python3 scripts/deployment_smoke.py`. Skripta pravi poseban test nalog u razvojnoj bazi. Za produkcijski image: `sudo docker build -t dailyquest:deployment-test .`. Zatim proveri backup i restore po odeljku 3, pre unošenja pravih podataka.
