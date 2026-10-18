use super::*;
#[derive(Serialize, FromRow)]
pub struct Task {
    id: Uuid,
    list_id: Option<Uuid>,
    title: String,
    notes: String,
    priority: String,
    due_date: Option<NaiveDate>,
    completed: bool,
}
#[derive(Deserialize)]
pub struct Input {
    list_id: Option<Uuid>,
    title: String,
    #[serde(default)]
    notes: String,
    priority: String,
    due_date: Option<NaiveDate>,
}
#[derive(Serialize, FromRow)]
pub struct List {
    id: Uuid,
    name: String,
}
#[derive(Deserialize)]
pub struct ListInput {
    name: String,
}
#[derive(Deserialize)]
pub struct Completion {
    completed: bool,
}
fn missing() -> Error {
    Error(
        StatusCode::NOT_FOUND,
        "Zadatak ili lista nisu pronađeni.".into(),
    )
}
impl Input {
    fn validate(mut self) -> Result<Self> {
        self.title = self.title.trim().into();
        self.notes = self.notes.trim().into();
        if self.title.is_empty()
            || self.title.chars().count() > 200
            || self.notes.chars().count() > 2000
            || !["low", "normal", "high"].contains(&self.priority.as_str())
        {
            return Err(bad(
                "Proveri naziv (1–200 znakova), belešku (do 2000) i prioritet.",
            ));
        }
        if self.due_date.is_some_and(|d| {
            d < NaiveDate::from_ymd_opt(1970, 1, 1).unwrap()
                || d > NaiveDate::from_ymd_opt(9999, 12, 31).unwrap()
        }) {
            return Err(bad("Datum nije podržan."));
        }
        Ok(self)
    }
}
fn db_error(e: sqlx::Error) -> Error {
    if let sqlx::Error::Database(ref db) = e {
        if db.is_foreign_key_violation() {
            return missing();
        }
        if db.is_unique_violation() {
            return Error(
                StatusCode::CONFLICT,
                "Lista sa tim nazivom već postoji.".into(),
            );
        }
    }
    e.into()
}
pub async fn list(State(app): State<App>, h: HeaderMap) -> Result<Json<Vec<Task>>> {
    let u = current(&app, &h).await?;
    Ok(Json(sqlx::query_as::<_,Task>("SELECT id,list_id,title,notes,priority,due_date,completed FROM tasks WHERE user_id=$1 ORDER BY created_at DESC,id").bind(u.id).fetch_all(&app.db).await?))
}
pub async fn add(
    State(app): State<App>,
    h: HeaderMap,
    Json(i): Json<Input>,
) -> Result<(StatusCode, Json<Task>)> {
    let u = current(&app, &h).await?;
    let i = i.validate()?;
    Ok((StatusCode::CREATED,Json(sqlx::query_as::<_,Task>("INSERT INTO tasks(id,user_id,list_id,title,notes,priority,due_date) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,list_id,title,notes,priority,due_date,completed").bind(Uuid::new_v4()).bind(u.id).bind(i.list_id).bind(i.title).bind(i.notes).bind(i.priority).bind(i.due_date).fetch_one(&app.db).await.map_err(db_error)?)))
}
pub async fn edit(
    State(app): State<App>,
    h: HeaderMap,
    Path(id): Path<Uuid>,
    Json(i): Json<Input>,
) -> Result<Json<Task>> {
    let u = current(&app, &h).await?;
    let i = i.validate()?;
    Ok(Json(sqlx::query_as::<_,Task>("UPDATE tasks SET list_id=$1,title=$2,notes=$3,priority=$4,due_date=$5 WHERE id=$6 AND user_id=$7 RETURNING id,list_id,title,notes,priority,due_date,completed").bind(i.list_id).bind(i.title).bind(i.notes).bind(i.priority).bind(i.due_date).bind(id).bind(u.id).fetch_optional(&app.db).await.map_err(db_error)?.ok_or_else(missing)?))
}
pub async fn complete(
    State(app): State<App>,
    h: HeaderMap,
    Path(id): Path<Uuid>,
    Json(i): Json<Completion>,
) -> Result<Json<Task>> {
    let u = current(&app, &h).await?;
    Ok(Json(sqlx::query_as::<_,Task>("UPDATE tasks SET completed=$1 WHERE id=$2 AND user_id=$3 RETURNING id,list_id,title,notes,priority,due_date,completed").bind(i.completed).bind(id).bind(u.id).fetch_optional(&app.db).await?.ok_or_else(missing)?))
}
pub async fn delete(
    State(app): State<App>,
    h: HeaderMap,
    Path(id): Path<Uuid>,
) -> Result<StatusCode> {
    let u = current(&app, &h).await?;
    if sqlx::query("DELETE FROM tasks WHERE id=$1 AND user_id=$2")
        .bind(id)
        .bind(u.id)
        .execute(&app.db)
        .await?
        .rows_affected()
        == 0
    {
        return Err(missing());
    }
    Ok(StatusCode::NO_CONTENT)
}
pub async fn lists(State(app): State<App>, h: HeaderMap) -> Result<Json<Vec<List>>> {
    let u = current(&app, &h).await?;
    Ok(Json(
        sqlx::query_as::<_, List>(
            "SELECT id,name FROM task_lists WHERE user_id=$1 ORDER BY name,id",
        )
        .bind(u.id)
        .fetch_all(&app.db)
        .await?,
    ))
}
fn list_name(name: String) -> Result<String> {
    let name = name.trim().to_string();
    if name.is_empty() || name.chars().count() > 80 {
        return Err(bad("Naziv liste mora imati 1–80 znakova."));
    }
    Ok(name)
}
pub async fn add_list(
    State(app): State<App>,
    h: HeaderMap,
    Json(i): Json<ListInput>,
) -> Result<(StatusCode, Json<List>)> {
    let u = current(&app, &h).await?;
    let name = list_name(i.name)?;
    Ok((
        StatusCode::CREATED,
        Json(
            sqlx::query_as::<_, List>(
                "INSERT INTO task_lists(id,user_id,name) VALUES($1,$2,$3) RETURNING id,name",
            )
            .bind(Uuid::new_v4())
            .bind(u.id)
            .bind(name)
            .fetch_one(&app.db)
            .await
            .map_err(db_error)?,
        ),
    ))
}
pub async fn edit_list(
    State(app): State<App>,
    h: HeaderMap,
    Path(id): Path<Uuid>,
    Json(i): Json<ListInput>,
) -> Result<Json<List>> {
    let u = current(&app, &h).await?;
    let name = list_name(i.name)?;
    Ok(Json(
        sqlx::query_as::<_, List>(
            "UPDATE task_lists SET name=$1 WHERE id=$2 AND user_id=$3 RETURNING id,name",
        )
        .bind(name)
        .bind(id)
        .bind(u.id)
        .fetch_optional(&app.db)
        .await
        .map_err(db_error)?
        .ok_or_else(missing)?,
    ))
}
pub async fn delete_list(
    State(app): State<App>,
    h: HeaderMap,
    Path(id): Path<Uuid>,
) -> Result<StatusCode> {
    let u = current(&app, &h).await?;
    let mut tx = app.db.begin().await?;
    // Lock the list so concurrent task creation cannot race the detach/delete operation.
    sqlx::query_scalar::<_, Uuid>(
        "SELECT id FROM task_lists WHERE id=$1 AND user_id=$2 FOR UPDATE",
    )
    .bind(id)
    .bind(u.id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or_else(missing)?;
    sqlx::query("UPDATE tasks SET list_id=NULL WHERE list_id=$1 AND user_id=$2")
        .bind(id)
        .bind(u.id)
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM task_lists WHERE id=$1 AND user_id=$2")
        .bind(id)
        .bind(u.id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(StatusCode::NO_CONTENT)
}
