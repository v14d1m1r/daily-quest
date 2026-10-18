import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Leaf,
  Plus,
  Pencil,
  Trash2,
  X,
  Check,
  LoaderCircle,
} from "lucide-react";
import { api } from "./api";
import { dateInZone, timeInZone, zonedISO } from "./dates";
const types = {
  breakfast: "Doručak",
  lunch: "Ručak",
  dinner: "Večera",
  snack: "Užina",
};
type Meal = {
  id: string;
  name: string;
  meal_type: keyof typeof types;
  quantity: string;
  notes: string;
  consumed_at: string;
};
export function Meals({ date, timezone }: { date: string; timezone: string }) {
  const cache = useQueryClient();
  const [editing, setEditing] = useState<Meal | null | undefined>(undefined);
  const [notice, setNotice] = useState("");
  const meals = useQuery({
    queryKey: ["meals", date, timezone],
    queryFn: () => api<Meal[]>(`/meals?date=${date}`),
  });
  function refresh(message: string) {
    cache.invalidateQueries({ queryKey: ["meals"] });
    setNotice(message);
  }
  const remove = useMutation({
    mutationFn: (id: string) => api(`/meals/${id}`, "DELETE"),
    onSuccess: () => refresh("Obrok je obrisan."),
  });
  return (
    <section className="panel meals-card">
      <div className="card-top">
        <div className="card-title">
          <span className="meal-icon">
            <Leaf size={21} />
          </span>
          <div>
            <h2>
              Dnevnik ishrane{" "}
              <span className="count">{meals.data?.length ?? "–"}</span>
            </h2>
            <p>Obroci za izabrani dan</p>
          </div>
        </div>
        <button className="secondary" onClick={() => setEditing(null)}>
          <Plus size={16} />
          Dodaj obrok
        </button>
      </div>
      {notice && (
        <div className="notice" role="status">
          <Check size={16} />
          {notice}
          <button
            className="icon-button"
            aria-label="Zatvori obaveštenje"
            onClick={() => setNotice("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {(meals.error || remove.error) && (
        <div className="error" role="alert">
          {(meals.error || remove.error)?.message}
        </div>
      )}
      {meals.isPending ? (
        <div className="meal-loading">
          <LoaderCircle className="spin" size={20} />
          Učitavanje obroka…
        </div>
      ) : meals.isError ? (
        <button className="secondary" onClick={() => meals.refetch()}>
          Pokušaj ponovo
        </button>
      ) : !meals.data.length ? (
        <div className="empty">
          <span className="empty-icon meal-icon">
            <Leaf size={28} />
          </span>
          <h3>Sačuvaj šta je bilo na tvom tanjiru.</h3>
          <p>Dodaj prvi obrok za ovaj dan. Dovoljni su naziv, tip i vreme.</p>
          <button className="text-button" onClick={() => setEditing(null)}>
            <Plus size={16} />
            Dodaj prvi obrok
          </button>
        </div>
      ) : (
        <div className="meal-list">
          {meals.data.map((meal) => (
            <article className="meal-row" key={meal.id}>
              <div className="meal-content">
                <div className="meal-meta">
                  <span className={`meal-type ${meal.meal_type}`}>
                    {types[meal.meal_type]}
                  </span>
                  <time dateTime={meal.consumed_at}>
                    {timeInZone(new Date(meal.consumed_at), timezone)}
                  </time>
                </div>
                <h3>{meal.name}</h3>
                {meal.quantity && (
                  <p className="meal-quantity">{meal.quantity}</p>
                )}
                {meal.notes && <p className="meal-notes">{meal.notes}</p>}
              </div>
              <div className="entry-actions">
                <button
                  className="icon-button"
                  aria-label={`Izmeni obrok: ${meal.name}`}
                  onClick={() => setEditing(meal)}
                >
                  <Pencil size={16} />
                </button>
                <button
                  className="icon-button delete"
                  aria-label={`Obriši obrok: ${meal.name}`}
                  disabled={remove.isPending}
                  onClick={() => {
                    if (window.confirm(`Obrisati obrok „${meal.name}“?`))
                      remove.mutate(meal.id);
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      {editing !== undefined && (
        <MealDialog
          date={date}
          timezone={timezone}
          meal={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            refresh(editing ? "Obrok je izmenjen." : "Obrok je sačuvan.");
          }}
        />
      )}
    </section>
  );
}
function MealDialog({
  date,
  timezone,
  meal,
  onClose,
  onSaved,
}: {
  date: string;
  timezone: string;
  meal: Meal | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState<Error | null>(null);
  const save = useMutation({
    mutationFn: (body: object) =>
      api(meal ? `/meals/${meal.id}` : "/meals", meal ? "PUT" : "POST", body),
    onSuccess: onSaved,
  });
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const now = new Date();
  const instant = meal ? new Date(meal.consumed_at) : now;
  const initialDate = meal ? dateInZone(instant, timezone) : date;
  const initialTime =
    meal || date === dateInZone(now, timezone)
      ? timeInZone(instant, timezone)
      : "12:00";
  return (
    <dialog
      ref={dialog}
      className="modal meal-dialog"
      onCancel={(e) => {
        if (save.isPending) e.preventDefault();
        else onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !save.isPending) onClose();
      }}
    >
      <div className="modal-inner">
        <div className="modal-heading">
          <h2>{meal ? "Izmeni obrok" : "Dodaj obrok"}</h2>
          <button
            className="icon-button"
            aria-label="Zatvori"
            onClick={onClose}
            disabled={save.isPending}
          >
            <X size={20} />
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            const f = new FormData(e.currentTarget);
            try {
              const selectedDate = String(f.get("date"));
              const selectedTime = String(f.get("time"));
              const consumed_at =
                meal &&
                selectedDate === initialDate &&
                selectedTime === initialTime
                  ? meal.consumed_at
                  : zonedISO(selectedDate, selectedTime, timezone);
              save.mutate({
                name: f.get("name"),
                meal_type: f.get("meal_type"),
                quantity: f.get("quantity"),
                notes: f.get("notes"),
                consumed_at,
              });
            } catch (error) {
              setError(error as Error);
            }
          }}
        >
          <p className="form-description">
            Zabeleži obrok i detalje koje želiš da sačuvaš.
          </p>
          <label>
            Naziv obroka
            <input
              autoFocus
              name="name"
              required
              maxLength={120}
              defaultValue={meal?.name || ""}
              placeholder="Npr. ovsena kaša sa bananom"
            />
          </label>
          <label>
            Tip obroka
            <select
              name="meal_type"
              defaultValue={meal?.meal_type || "breakfast"}
            >
              {Object.entries(types).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Količina <span className="optional">opciono</span>
            <input
              name="quantity"
              maxLength={120}
              defaultValue={meal?.quantity || ""}
              placeholder="Npr. 1 činija, 200 g ili 2 kriške"
            />
          </label>
          <div className="form-row">
            <label>
              Datum
              <input
                name="date"
                type="date"
                required
                min="1970-01-01"
                max={dateInZone(now, timezone)}
                defaultValue={initialDate}
              />
            </label>
            <label>
              Vreme
              <input
                name="time"
                type="time"
                required
                defaultValue={initialTime}
              />
            </label>
          </div>
          <small className="timezone">Vreme u zoni {timezone}</small>
          <label>
            Beleška <span className="optional">opciono</span>
            <textarea
              name="notes"
              rows={3}
              maxLength={2000}
              defaultValue={meal?.notes || ""}
              placeholder="Sastojci ili nešto što želiš da zapamtiš…"
            />
          </label>
          {(error || save.error) && (
            <div role="alert" className="error">
              {(error || save.error)?.message}
            </div>
          )}
          <button className="primary" disabled={save.isPending}>
            {save.isPending ? "Čuvanje…" : "Sačuvaj obrok"}
            <Check size={18} />
          </button>
        </form>
      </div>
    </dialog>
  );
}
