use super::*;

#[derive(Serialize, FromRow)]
pub struct Meal {
    id: Uuid,
    name: String,
    meal_type: String,
    quantity: String,
    notes: String,
    consumed_at: DateTime<Utc>,
}
#[derive(Deserialize)]
pub struct MealInput {
    name: String,
    meal_type: String,
    #[serde(default)]
    quantity: String,
    #[serde(default)]
    notes: String,
    consumed_at: DateTime<Utc>,
}
impl MealInput {
    fn validate(mut self) -> Result<Self> {
        self.name = self.name.trim().to_owned();
        self.quantity = self.quantity.trim().to_owned();
        self.notes = self.notes.trim().to_owned();
        if self.name.is_empty() || self.name.chars().count() > 120 {
            return Err(bad("Naziv obroka mora imati od 1 do 120 znakova."));
        }
        if !["breakfast", "lunch", "dinner", "snack"].contains(&self.meal_type.as_str()) {
            return Err(bad("Izaberi doručak, ručak, večeru ili užinu."));
        }
        if self.quantity.chars().count() > 120 || self.notes.chars().count() > 2000 {
            return Err(bad(
                "Količina može imati do 120, a beleška do 2000 znakova.",
            ));
        }
        if self.consumed_at.timestamp() < 0 || self.consumed_at > Utc::now() + Duration::minutes(1)
        {
            return Err(bad(
                "Datum obroka mora biti posle 1970. godine i ne može biti u budućnosti.",
            ));
        }
        Ok(self)
    }
}
pub async fn list(
    State(app): State<App>,
    headers: HeaderMap,
    Query(q): Query<DayQuery>,
) -> Result<Json<Vec<Meal>>> {
    let user = current(&app, &headers).await?;
    let tz = user
        .timezone
        .parse::<Tz>()
        .map_err(|_| bad("Vremenska zona nije ispravna."))?;
    let (start, end) = bounds(q.date, tz)?;
    Ok(Json(sqlx::query_as::<_, Meal>("SELECT id,name,meal_type,quantity,notes,consumed_at FROM meals WHERE user_id=$1 AND consumed_at >= $2 AND consumed_at < $3 ORDER BY consumed_at DESC,created_at DESC,id")
        .bind(user.id).bind(start).bind(end).fetch_all(&app.db).await?))
}
pub async fn add(
    State(app): State<App>,
    headers: HeaderMap,
    Json(input): Json<MealInput>,
) -> Result<(StatusCode, Json<Meal>)> {
    let user = current(&app, &headers).await?;
    let input = input.validate()?;
    let entry = sqlx::query_as::<_, Meal>("INSERT INTO meals(id,user_id,name,meal_type,quantity,notes,consumed_at) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,name,meal_type,quantity,notes,consumed_at")
        .bind(Uuid::new_v4()).bind(user.id).bind(input.name).bind(input.meal_type).bind(input.quantity).bind(input.notes).bind(input.consumed_at).fetch_one(&app.db).await?;
    Ok((StatusCode::CREATED, Json(entry)))
}
pub async fn edit(
    State(app): State<App>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    Json(input): Json<MealInput>,
) -> Result<Json<Meal>> {
    let user = current(&app, &headers).await?;
    let input = input.validate()?;
    let entry = sqlx::query_as::<_, Meal>("UPDATE meals SET name=$1,meal_type=$2,quantity=$3,notes=$4,consumed_at=$5 WHERE id=$6 AND user_id=$7 RETURNING id,name,meal_type,quantity,notes,consumed_at")
        .bind(input.name).bind(input.meal_type).bind(input.quantity).bind(input.notes).bind(input.consumed_at).bind(id).bind(user.id).fetch_optional(&app.db).await?.ok_or_else(|| Error(StatusCode::NOT_FOUND, "Obrok nije pronađen.".into()))?;
    Ok(Json(entry))
}
pub async fn delete(
    State(app): State<App>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Result<StatusCode> {
    let user = current(&app, &headers).await?;
    let result = sqlx::query("DELETE FROM meals WHERE id=$1 AND user_id=$2")
        .bind(id)
        .bind(user.id)
        .execute(&app.db)
        .await?;
    if result.rows_affected() == 0 {
        return Err(Error(StatusCode::NOT_FOUND, "Obrok nije pronađen.".into()));
    }
    Ok(StatusCode::NO_CONTENT)
}
#[cfg(test)]
mod tests {
    use super::*;
    fn input() -> MealInput {
        MealInput {
            name: "  Ovsena kaša  ".into(),
            meal_type: "breakfast".into(),
            quantity: "1 činija".into(),
            notes: String::new(),
            consumed_at: Utc::now(),
        }
    }
    #[test]
    fn normalizes_and_validates() {
        assert_eq!(input().validate().unwrap().name, "Ovsena kaša");
        let mut value = input();
        value.name = "  ".into();
        assert!(value.validate().is_err());
        let mut value = input();
        value.meal_type = "other".into();
        assert!(value.validate().is_err());
        let mut value = input();
        value.notes = "č".repeat(2001);
        assert!(value.validate().is_err());
        let mut value = input();
        value.consumed_at = Utc::now() + Duration::days(1);
        assert!(value.validate().is_err());
    }
}
