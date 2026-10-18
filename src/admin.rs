use super::*;
use std::io::Read;
// Credentials are read through stdin, never through process arguments or logs.
pub async fn run(db: &PgPool, action: &str) -> std::result::Result<(), Box<dyn std::error::Error>> {
    let mut raw = String::new();
    std::io::stdin().take(16385).read_to_string(&mut raw)?;
    if raw.len() > 16384 {
        return Err("Input too large".into());
    }
    let input: Credentials = serde_json::from_str(&raw)?;
    let email = input.email.trim().to_lowercase();
    if !email.contains('@')
        || email.len() > 254
        || input.password.len() < 10
        || input.password.len() > 128
    {
        return Err("Invalid email or password (10–128 bytes)".into());
    }
    let hash = Argon2::default()
        .hash_password(input.password.as_bytes(), &SaltString::generate(&mut OsRng))
        .map_err(|_| "Password hashing failed")?
        .to_string();
    match action {
        "create-user" => {
            let name = input.name.unwrap_or_default().trim().to_owned();
            if name.is_empty() || name.chars().count() > 80 {
                return Err("Name must have 1–80 characters".into());
            }
            sqlx::query("INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,$3,$4)")
                .bind(Uuid::new_v4())
                .bind(email)
                .bind(name)
                .bind(hash)
                .execute(db)
                .await?;
        }
        "reset-password" => {
            let mut tx = db.begin().await?;
            let id = sqlx::query_scalar::<_, Uuid>(
                "UPDATE users SET password_hash=$1 WHERE email=$2 RETURNING id",
            )
            .bind(hash)
            .bind(email)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or("Account not found")?;
            sqlx::query("DELETE FROM sessions WHERE user_id=$1")
                .bind(id)
                .execute(&mut *tx)
                .await?;
            tx.commit().await?;
        }
        _ => return Err("Unknown admin command".into()),
    }
    println!("Account operation completed.");
    Ok(())
}
