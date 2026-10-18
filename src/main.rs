mod admin;
mod meals;
mod tasks;
use argon2::{
    Argon2, PasswordHash, PasswordHasher, PasswordVerifier,
    password_hash::{SaltString, rand_core::OsRng},
};
use axum::{
    Json, Router,
    extract::Request,
    extract::{DefaultBodyLimit, Path, Query, State},
    http::{HeaderMap, StatusCode, header},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post, put},
};
use chrono::{DateTime, Duration, NaiveDate, TimeZone, Utc};
use chrono_tz::Tz;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::{FromRow, PgPool, postgres::PgPoolOptions};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::Instant,
};
use tower_http::{
    services::{ServeDir, ServeFile},
    trace::TraceLayer,
};
use uuid::Uuid;

#[derive(Clone)]
struct App {
    db: PgPool,
    secure: bool,
    registration_enabled: bool,
    attempts: Arc<Mutex<HashMap<String, (Instant, u32)>>>,
}
#[derive(Debug)]
struct Error(StatusCode, String);
type Result<T> = std::result::Result<T, Error>;
impl IntoResponse for Error {
    fn into_response(self) -> Response {
        (self.0, Json(serde_json::json!({"error": self.1}))).into_response()
    }
}
impl From<sqlx::Error> for Error {
    fn from(e: sqlx::Error) -> Self {
        tracing::error!(error = %e, "database error");
        Self(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Došlo je do greške pri čuvanju podataka.".into(),
        )
    }
}
fn bad(message: &str) -> Error {
    Error(StatusCode::BAD_REQUEST, message.into())
}
fn unauthorized() -> Error {
    Error(StatusCode::UNAUTHORIZED, "Prijavi se da nastaviš.".into())
}
#[derive(Serialize, FromRow)]
struct User {
    id: Uuid,
    email: String,
    name: String,
    timezone: String,
    water_goal_ml: i32,
}
#[derive(Deserialize)]
struct Credentials {
    email: String,
    password: String,
    name: Option<String>,
}
#[derive(Serialize, Deserialize, FromRow)]
struct Water {
    id: Uuid,
    amount_ml: i32,
    consumed_at: DateTime<Utc>,
}
#[derive(Deserialize)]
struct WaterInput {
    amount_ml: i32,
    consumed_at: DateTime<Utc>,
}
#[derive(Deserialize)]
struct DayQuery {
    date: NaiveDate,
}
#[derive(Deserialize)]
struct Settings {
    water_goal_ml: i32,
    timezone: String,
}
#[derive(Serialize)]
struct Day {
    date: NaiveDate,
    total_ml: i64,
}
#[derive(Serialize)]
struct Summary {
    date: NaiveDate,
    total_ml: i64,
    goal_ml: i32,
    entries: Vec<Water>,
    week: Vec<Day>,
}

fn token_hash(token: &str) -> String {
    hex::encode(Sha256::digest(token.as_bytes()))
}
async fn current(app: &App, headers: &HeaderMap) -> Result<User> {
    let token = headers
        .get(header::COOKIE)
        .and_then(|v| v.to_str().ok())
        .and_then(|s| {
            s.split(';')
                .find_map(|p| p.trim().strip_prefix("dq_session="))
        })
        .ok_or_else(unauthorized)?;
    sqlx::query_as::<_, User>("SELECT u.id,u.email,u.name,u.timezone,u.water_goal_ml FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at>now()")
        .bind(token_hash(token)).fetch_optional(&app.db).await?.ok_or_else(unauthorized)
}
async fn csrf(req: Request, next: Next) -> Response {
    if !matches!(
        *req.method(),
        axum::http::Method::GET | axum::http::Method::HEAD | axum::http::Method::OPTIONS
    ) && req
        .headers()
        .get("x-daily-quest")
        .and_then(|h| h.to_str().ok())
        != Some("1")
    {
        return Error(StatusCode::FORBIDDEN, "Zahtev nije dozvoljen.".into()).into_response();
    }
    let is_api = req.uri().path().starts_with("/api/");
    let mut response = next.run(req).await;
    if is_api {
        response
            .headers_mut()
            .insert(header::CACHE_CONTROL, "no-store".parse().unwrap());
    }
    response
}
fn throttle(app: &App, email: &str) -> Result<()> {
    let mut map = app.attempts.lock().map_err(|_| bad("Pokušaj ponovo."))?;
    map.retain(|_, (time, _)| time.elapsed().as_secs() < 60);
    let global = map.entry(String::new()).or_insert((Instant::now(), 0));
    global.1 += 1;
    if global.1 > 60 {
        return Err(Error(
            StatusCode::TOO_MANY_REQUESTS,
            "Previše pokušaja prijave. Pokušaj ponovo za minut.".into(),
        ));
    }
    if map.len() >= 1000 && !map.contains_key(email) {
        return Err(Error(
            StatusCode::TOO_MANY_REQUESTS,
            "Pokušaj ponovo za minut.".into(),
        ));
    }
    let value = map.entry(email.to_owned()).or_insert((Instant::now(), 0));
    value.1 += 1;
    if value.1 > 10 {
        return Err(Error(
            StatusCode::TOO_MANY_REQUESTS,
            "Previše pokušaja. Pokušaj ponovo za minut.".into(),
        ));
    }
    Ok(())
}
async fn session(app: &App, user: User) -> Result<Response> {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    let token = hex::encode(bytes);
    sqlx::query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '30 days')").bind(token_hash(&token)).bind(user.id).execute(&app.db).await?;
    let secure = if app.secure { "; Secure" } else { "" };
    Ok((
        [(
            header::SET_COOKIE,
            format!("dq_session={token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000{secure}"),
        )],
        Json(user),
    )
        .into_response())
}
async fn register(State(app): State<App>, Json(input): Json<Credentials>) -> Result<Response> {
    if !app.registration_enabled {
        return Err(Error(
            StatusCode::FORBIDDEN,
            "Registracija je zatvorena.".into(),
        ));
    }
    let email = input.email.trim().to_lowercase();
    throttle(&app, &email)?;
    let name = input.name.unwrap_or_default().trim().to_string();
    if !email.contains('@')
        || email.len() > 254
        || name.is_empty()
        || name.chars().count() > 80
        || input.password.len() < 10
        || input.password.len() > 128
    {
        return Err(bad(
            "Unesi ime, validan email i lozinku od 10 do 128 znakova.",
        ));
    }
    let hash = tokio::task::spawn_blocking(move || {
        Argon2::default()
            .hash_password(input.password.as_bytes(), &SaltString::generate(&mut OsRng))
            .map(|h| h.to_string())
    })
    .await
    .map_err(|_| bad("Pokušaj ponovo."))?
    .map_err(|_| bad("Pokušaj ponovo."))?;
    let result = sqlx::query_as::<_,User>("INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,$3,$4) RETURNING id,email,name,timezone,water_goal_ml").bind(Uuid::new_v4()).bind(email).bind(name).bind(hash).fetch_one(&app.db).await;
    match result {
        Ok(user) => session(&app, user).await,
        Err(sqlx::Error::Database(e)) if e.is_unique_violation() => Err(Error(
            StatusCode::CONFLICT,
            "Nalog sa ovim emailom već postoji.".into(),
        )),
        Err(e) => Err(e.into()),
    }
}
async fn login(State(app): State<App>, Json(input): Json<Credentials>) -> Result<Response> {
    let email = input.email.trim().to_lowercase();
    throttle(&app, &email)?;
    if input.password.len() > 128 {
        return Err(unauthorized());
    }
    let row: Option<(Uuid, String)> =
        sqlx::query_as("SELECT id,password_hash FROM users WHERE email=$1")
            .bind(email)
            .fetch_optional(&app.db)
            .await?;
    let (id, hash) = row.ok_or_else(|| {
        Error(
            StatusCode::UNAUTHORIZED,
            "Email ili lozinka nisu ispravni.".into(),
        )
    })?;
    let valid = tokio::task::spawn_blocking(move || {
        PasswordHash::new(&hash)
            .map(|h| {
                Argon2::default()
                    .verify_password(input.password.as_bytes(), &h)
                    .is_ok()
            })
            .unwrap_or(false)
    })
    .await
    .unwrap_or(false);
    if !valid {
        return Err(Error(
            StatusCode::UNAUTHORIZED,
            "Email ili lozinka nisu ispravni.".into(),
        ));
    }
    let user = sqlx::query_as::<_, User>(
        "SELECT id,email,name,timezone,water_goal_ml FROM users WHERE id=$1",
    )
    .bind(id)
    .fetch_one(&app.db)
    .await?;
    session(&app, user).await
}
async fn me(State(app): State<App>, headers: HeaderMap) -> Result<Json<User>> {
    Ok(Json(current(&app, &headers).await?))
}
async fn logout(State(app): State<App>, headers: HeaderMap) -> Result<Response> {
    if let Some(token) = headers
        .get(header::COOKIE)
        .and_then(|v| v.to_str().ok())
        .and_then(|s| {
            s.split(';')
                .find_map(|p| p.trim().strip_prefix("dq_session="))
        })
    {
        sqlx::query("DELETE FROM sessions WHERE token_hash=$1")
            .bind(token_hash(token))
            .execute(&app.db)
            .await?;
    }
    Ok((
        [(
            header::SET_COOKIE,
            "dq_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0",
        )],
        StatusCode::NO_CONTENT,
    )
        .into_response())
}
fn bounds(date: NaiveDate, tz: Tz) -> Result<(DateTime<Utc>, DateTime<Utc>)> {
    let next = date.succ_opt().ok_or_else(|| bad("Datum nije podržan."))?;
    let start = tz
        .from_local_datetime(&date.and_hms_opt(0, 0, 0).unwrap())
        .earliest()
        .ok_or_else(|| bad("Datum nije podržan u ovoj zoni."))?;
    let end = tz
        .from_local_datetime(&next.and_hms_opt(0, 0, 0).unwrap())
        .earliest()
        .ok_or_else(|| bad("Datum nije podržan u ovoj zoni."))?;
    Ok((start.with_timezone(&Utc), end.with_timezone(&Utc)))
}
async fn summary(
    State(app): State<App>,
    headers: HeaderMap,
    Query(q): Query<DayQuery>,
) -> Result<Json<Summary>> {
    let user = current(&app, &headers).await?;
    let tz: Tz = user
        .timezone
        .parse()
        .map_err(|_| bad("Vremenska zona nije ispravna."))?;
    let first = q
        .date
        .checked_sub_signed(Duration::days(6))
        .ok_or_else(|| bad("Datum nije podržan."))?;
    let (start, _) = bounds(first, tz)?;
    let (_, end) = bounds(q.date, tz)?;
    let all=sqlx::query_as::<_,Water>("SELECT id,amount_ml,consumed_at FROM water_entries WHERE user_id=$1 AND consumed_at >= $2 AND consumed_at < $3 ORDER BY consumed_at DESC").bind(user.id).bind(start).bind(end).fetch_all(&app.db).await?;
    let week = (0..7)
        .map(|offset| {
            let date = first + Duration::days(offset);
            let total_ml = all
                .iter()
                .filter(|e| e.consumed_at.with_timezone(&tz).date_naive() == date)
                .map(|e| i64::from(e.amount_ml))
                .sum();
            Day { date, total_ml }
        })
        .collect();
    let entries: Vec<_> = all
        .into_iter()
        .filter(|e| e.consumed_at.with_timezone(&tz).date_naive() == q.date)
        .collect();
    Ok(Json(Summary {
        date: q.date,
        total_ml: entries.iter().map(|e| i64::from(e.amount_ml)).sum(),
        goal_ml: user.water_goal_ml,
        entries,
        week,
    }))
}
fn validate_water(input: &WaterInput) -> Result<()> {
    if !(1..=10000).contains(&input.amount_ml) {
        return Err(bad("Količina mora biti između 1 i 10000 ml."));
    }
    if input.consumed_at > Utc::now() + Duration::minutes(1) {
        return Err(bad("Unos ne može biti u budućnosti."));
    }
    if input.consumed_at.timestamp() < 0 {
        return Err(bad("Datum mora biti posle 1970. godine."));
    }
    Ok(())
}
async fn add_water(
    State(app): State<App>,
    headers: HeaderMap,
    Json(input): Json<WaterInput>,
) -> Result<(StatusCode, Json<Water>)> {
    let user = current(&app, &headers).await?;
    validate_water(&input)?;
    let entry=sqlx::query_as::<_,Water>("INSERT INTO water_entries(id,user_id,amount_ml,consumed_at) VALUES($1,$2,$3,$4) RETURNING id,amount_ml,consumed_at").bind(Uuid::new_v4()).bind(user.id).bind(input.amount_ml).bind(input.consumed_at).fetch_one(&app.db).await?;
    Ok((StatusCode::CREATED, Json(entry)))
}
async fn edit_water(
    State(app): State<App>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    Json(input): Json<WaterInput>,
) -> Result<Json<Water>> {
    let user = current(&app, &headers).await?;
    validate_water(&input)?;
    let entry=sqlx::query_as::<_,Water>("UPDATE water_entries SET amount_ml=$1,consumed_at=$2 WHERE id=$3 AND user_id=$4 RETURNING id,amount_ml,consumed_at").bind(input.amount_ml).bind(input.consumed_at).bind(id).bind(user.id).fetch_optional(&app.db).await?.ok_or_else(|| Error(StatusCode::NOT_FOUND,"Unos nije pronađen.".into()))?;
    Ok(Json(entry))
}
async fn delete_water(
    State(app): State<App>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Result<StatusCode> {
    let user = current(&app, &headers).await?;
    let result = sqlx::query("DELETE FROM water_entries WHERE id=$1 AND user_id=$2")
        .bind(id)
        .bind(user.id)
        .execute(&app.db)
        .await?;
    if result.rows_affected() == 0 {
        return Err(Error(StatusCode::NOT_FOUND, "Unos nije pronađen.".into()));
    }
    Ok(StatusCode::NO_CONTENT)
}
async fn settings(
    State(app): State<App>,
    headers: HeaderMap,
    Json(input): Json<Settings>,
) -> Result<Json<User>> {
    let user = current(&app, &headers).await?;
    if !(100..=20000).contains(&input.water_goal_ml) || input.timezone.parse::<Tz>().is_err() {
        return Err(bad("Proveri cilj (100–20000 ml) i vremensku zonu."));
    }
    Ok(Json(sqlx::query_as::<_,User>("UPDATE users SET water_goal_ml=$1,timezone=$2 WHERE id=$3 RETURNING id,email,name,timezone,water_goal_ml").bind(input.water_goal_ml).bind(input.timezone).bind(user.id).fetch_one(&app.db).await?))
}
async fn health(State(app): State<App>) -> Result<Json<serde_json::Value>> {
    sqlx::query("SELECT 1").execute(&app.db).await?;
    Ok(Json(serde_json::json!({"status":"ok"})))
}
#[tokio::main]
async fn main() -> std::result::Result<(), Box<dyn std::error::Error>> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "daily_quest=info,tower_http=info".into()),
        )
        .init();
    let db = PgPoolOptions::new()
        .max_connections(10)
        .connect(&std::env::var("DATABASE_URL")?)
        .await?;
    sqlx::migrate!().run(&db).await?;
    if let Some(command) = std::env::args().nth(1) {
        return admin::run(&db, &command).await;
    }
    let cleanup_db = db.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(3600));
        loop {
            interval.tick().await;
            if let Err(error) = sqlx::query("DELETE FROM sessions WHERE expires_at < now()")
                .execute(&cleanup_db)
                .await
            {
                tracing::error!(%error, "session cleanup failed");
            }
        }
    });
    let app = App {
        db,
        secure: std::env::var("COOKIE_SECURE").as_deref() == Ok("true"),
        attempts: Default::default(),
        registration_enabled: std::env::var("REGISTRATION_ENABLED").as_deref() == Ok("true"),
    };
    let routes = Router::new()
        .route("/health", get(health))
        .route(
            "/config",
            get(|State(app): State<App>| async move {
                Json(serde_json::json!({"registration_enabled": app.registration_enabled}))
            }),
        )
        .route("/auth/register", post(register))
        .route("/auth/login", post(login))
        .route("/auth/logout", post(logout))
        .route("/me", get(me))
        .route("/settings", put(settings))
        .route("/tasks", get(tasks::list).post(tasks::add))
        .route("/tasks/{id}", put(tasks::edit).delete(tasks::delete))
        .route("/tasks/{id}/completion", put(tasks::complete))
        .route("/task-lists", get(tasks::lists).post(tasks::add_list))
        .route(
            "/task-lists/{id}",
            put(tasks::edit_list).delete(tasks::delete_list),
        )
        .route("/meals", get(meals::list).post(meals::add))
        .route("/meals/{id}", put(meals::edit).delete(meals::delete))
        .route("/water", post(add_water))
        .route("/water/summary", get(summary))
        .route("/water/{id}", put(edit_water).delete(delete_water))
        .fallback(|| async { Error(StatusCode::NOT_FOUND, "API ruta nije pronađena.".into()) });
    let router = Router::new()
        .nest("/api", routes)
        .fallback_service(
            ServeDir::new("frontend/dist")
                .not_found_service(ServeFile::new("frontend/dist/index.html")),
        )
        .layer(DefaultBodyLimit::max(16 * 1024))
        .layer(middleware::from_fn(csrf))
        .layer(TraceLayer::new_for_http())
        .with_state(app);
    let address = std::env::var("BIND_ADDRESS").unwrap_or_else(|_| "127.0.0.1:3000".into());
    tracing::info!(%address,"Daily Quest started");
    axum::serve(tokio::net::TcpListener::bind(address).await?, router)
        .with_graceful_shutdown(async {
            #[cfg(unix)]
            {
                let mut terminate =
                    tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
                        .expect("SIGTERM handler");
                tokio::select! { _ = tokio::signal::ctrl_c() => {}, _ = terminate.recv() => {} }
            }
            #[cfg(not(unix))]
            {
                tokio::signal::ctrl_c().await.ok();
            }
        })
        .await?;
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn closed_registration_rejects_before_database_access() {
        let db = PgPoolOptions::new()
            .connect_lazy("postgres://unused:unused@127.0.0.1:1/unused")
            .unwrap();
        let app = App {
            db,
            secure: true,
            registration_enabled: false,
            attempts: Default::default(),
        };
        let response = register(
            State(app),
            Json(Credentials {
                email: "test@example.test".into(),
                password: "test-password".into(),
                name: Some("Test".into()),
            }),
        )
        .await;
        assert!(matches!(response, Err(Error(StatusCode::FORBIDDEN, _))));
    }
    #[tokio::test]
    async fn auth_limits_cover_rotating_email_addresses() {
        let db = PgPoolOptions::new()
            .connect_lazy("postgres://unused:unused@127.0.0.1:1/unused")
            .unwrap();
        let app = App {
            db,
            secure: true,
            registration_enabled: false,
            attempts: Default::default(),
        };
        for index in 0..60 {
            assert!(throttle(&app, &format!("{index}@example.test")).is_ok());
        }
        assert!(matches!(
            throttle(&app, "next@example.test"),
            Err(Error(StatusCode::TOO_MANY_REQUESTS, _))
        ));
    }
    #[test]
    fn belgrade_dst_days() {
        let tz: Tz = "Europe/Belgrade".parse().unwrap();
        for (date, hours) in [("2026-03-29", 23), ("2026-10-25", 25), ("2026-10-14", 24)] {
            let (start, end) = bounds(date.parse().unwrap(), tz).unwrap();
            assert_eq!((end - start).num_hours(), hours);
        }
    }
    #[test]
    fn rejects_invalid_water() {
        for amount_ml in [0, -1, 10001] {
            assert!(
                validate_water(&WaterInput {
                    amount_ml,
                    consumed_at: Utc::now()
                })
                .is_err()
            );
        }
        assert!(
            validate_water(&WaterInput {
                amount_ml: 250,
                consumed_at: Utc::now() + Duration::days(1)
            })
            .is_err()
        );
        assert!(
            validate_water(&WaterInput {
                amount_ml: 250,
                consumed_at: Utc::now()
            })
            .is_ok()
        );
    }
}
