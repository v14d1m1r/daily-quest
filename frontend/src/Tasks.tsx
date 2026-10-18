import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Check,
  CircleCheck,
  LoaderCircle,
} from "lucide-react";
import { api } from "./api";
import { filterTasks, type Task, type Period } from "./taskFilters";
type List = { id: string; name: string };
const priorities = { low: "Nizak", normal: "Normalan", high: "Visok" };
const labelDate = (date: string) =>
  new Date(date + "T12:00:00Z").toLocaleDateString("sr-Latn-RS", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
export function Tasks({
  date,
  today,
  compact = false,
}: {
  date: string;
  today: string;
  compact?: boolean;
}) {
  const cache = useQueryClient();
  const [period, setPeriod] = useState<Period>("day");
  const [list, setList] = useState("all");
  const [status, setStatus] = useState("open");
  const [editing, setEditing] = useState<Task | null | undefined>();
  const [listEditing, setListEditing] = useState<List | null | undefined>();
  const [notice, setNotice] = useState("");
  const tasks = useQuery({
    queryKey: ["tasks"],
    queryFn: () => api<Task[]>("/tasks"),
  });
  const lists = useQuery({
    queryKey: ["task-lists"],
    queryFn: () => api<List[]>("/task-lists"),
  });
  function refresh(message: string) {
    cache.invalidateQueries({ queryKey: ["tasks"] });
    cache.invalidateQueries({ queryKey: ["task-lists"] });
    setNotice(message);
  }
  const change = useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: boolean }) =>
      api(`/tasks/${id}/completion`, "PUT", { completed }),
    onSuccess: () => refresh("Status zadatka je sačuvan."),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/tasks/${id}`, "DELETE"),
    onSuccess: () => refresh("Zadatak je obrisan."),
  });
  const removeList = useMutation({
    mutationFn: (id: string) => api(`/task-lists/${id}`, "DELETE"),
    onSuccess: () => {
      setList("all");
      refresh("Lista je obrisana. Zadaci su sačuvani u „Bez liste“.");
    },
  });
  const selected = lists.data?.find((l) => l.id === list);
  const visible = filterTasks(
    tasks.data ?? [],
    date,
    compact ? "day" : period,
    compact ? "all" : list,
    compact ? "open" : status,
  );
  const error =
    tasks.error ||
    lists.error ||
    change.error ||
    remove.error ||
    removeList.error;
  return (
    <section className="panel tasks-card">
      <div className="card-top">
        <div className="card-title">
          <span className="meal-icon">
            <CircleCheck size={21} />
          </span>
          <div>
            <h2>
              {compact ? "Tvoje obaveze" : "Zadaci i liste"}{" "}
              <span className="count">{visible.length}</span>
            </h2>
            <p>
              {compact
                ? "Za izabrani dan i sve ranije nezavršene obaveze."
                : "Organizuj obaveze svojim tempom."}
            </p>
          </div>
        </div>
        <button className="secondary" onClick={() => setEditing(null)}>
          <Plus size={16} />
          Dodaj zadatak
        </button>
      </div>
      {!compact && (
        <>
          <div
            className="task-periods"
            role="group"
            aria-label="Period zadataka"
          >
            {(
              [
                ["day", "Danas"],
                ["week", "Ove nedelje"],
                ["month", "Ovog meseca"],
                ["all", "Sve"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                className={period === key ? "selected" : ""}
                aria-pressed={period === key}
                onClick={() => setPeriod(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="task-filters">
            <label>
              Lista
              <select value={list} onChange={(e) => setList(e.target.value)}>
                <option value="all">Sve liste</option>
                <option value="none">Bez liste</option>
                {lists.data?.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="open">Nezavršeni</option>
                <option value="done">Završeni</option>
                <option value="all">Svi statusi</option>
              </select>
            </label>
            <button className="secondary" onClick={() => setListEditing(null)}>
              <Plus size={15} />
              Nova lista
            </button>
            {selected && (
              <>
                <button
                  className="icon-button"
                  aria-label="Preimenuj listu"
                  onClick={() => setListEditing(selected)}
                >
                  <Pencil size={16} />
                </button>
                <button
                  className="icon-button delete"
                  aria-label="Obriši listu"
                  disabled={removeList.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Obrisati listu „${selected.name}“? Zadaci će ostati sačuvani bez liste.`,
                      )
                    )
                      removeList.mutate(selected.id);
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </>
            )}
          </div>
          <p className="task-help">
            {period === "all"
              ? "Prikazani su i zadaci bez roka."
              : `Period prema datumu ${labelDate(date)}. Uključene su ranije nezavršene obaveze. Zadaci bez roka su u „Sve“.`}
          </p>
        </>
      )}
      {error && (
        <div className="error" role="alert">
          {error.message}
        </div>
      )}
      {notice && (
        <div className="notice" role="status">
          <Check size={15} />
          {notice}
          <button
            className="icon-button"
            aria-label="Zatvori obaveštenje"
            onClick={() => setNotice("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {tasks.isPending || lists.isPending ? (
        <div className="meal-loading">
          <LoaderCircle className="spin" size={20} />
          Učitavanje zadataka…
        </div>
      ) : tasks.isError || lists.isError ? (
        <button
          className="secondary"
          onClick={() => {
            tasks.refetch();
            lists.refetch();
          }}
        >
          Pokušaj ponovo
        </button>
      ) : visible.length === 0 ? (
        <div className="empty">
          <span className="empty-icon meal-icon">
            <CircleCheck size={28} />
          </span>
          <h3>Nema zadataka u ovom pregledu.</h3>
          <p>Dodaj novu obavezu ili promeni filtere.</p>
        </div>
      ) : (
        <div className="task-rows">
          {visible.map((task) => (
            <article
              key={task.id}
              className={`task-row ${task.completed ? "completed" : ""}`}
            >
              <input
                className="task-checkbox"
                type="checkbox"
                checked={task.completed}
                disabled={change.isPending}
                aria-label={`${task.completed ? "Vrati u nezavršene" : "Završi"}: ${task.title}`}
                onChange={(e) =>
                  change.mutate({ id: task.id, completed: e.target.checked })
                }
              />
              <div className="task-body">
                <h3>{task.title}</h3>
                <div className="task-meta">
                  <span className={`task-priority ${task.priority}`}>
                    {priorities[task.priority]} prioritet
                  </span>
                  <span>
                    {lists.data?.find((l) => l.id === task.list_id)?.name ??
                      "Bez liste"}
                  </span>
                  <span
                    className={
                      !task.completed && task.due_date && task.due_date < today
                        ? "overdue"
                        : ""
                    }
                  >
                    {task.due_date
                      ? `${!task.completed && task.due_date < today ? "Kasni · " : ""}${labelDate(task.due_date)}`
                      : "Bez roka"}
                  </span>
                </div>
                {task.notes && <p className="meal-notes">{task.notes}</p>}
              </div>
              <div className="entry-actions">
                <button
                  className="icon-button"
                  aria-label={`Izmeni zadatak: ${task.title}`}
                  onClick={() => setEditing(task)}
                >
                  <Pencil size={16} />
                </button>
                <button
                  className="icon-button delete"
                  aria-label={`Obriši zadatak: ${task.title}`}
                  disabled={remove.isPending}
                  onClick={() => {
                    if (window.confirm(`Obrisati zadatak „${task.title}“?`))
                      remove.mutate(task.id);
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
        <TaskForm
          task={editing}
          date={date}
          lists={lists.data ?? []}
          initialList={selected?.id ?? ""}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            refresh("Zadatak je sačuvan.");
          }}
        />
      )}
      {listEditing !== undefined && (
        <ListForm
          list={listEditing}
          onClose={() => setListEditing(undefined)}
          onSaved={(value) => {
            setListEditing(undefined);
            setList(value.id);
            refresh("Lista je sačuvana.");
          }}
        />
      )}
    </section>
  );
}
function Dialog({
  title,
  busy,
  onClose,
  children,
}: {
  title: string;
  busy: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal meal-dialog"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="modal-inner">
        <div className="modal-heading">
          <h2>{title}</h2>
          <button
            className="icon-button"
            aria-label="Zatvori"
            disabled={busy}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
function TaskForm({
  task,
  date,
  lists,
  initialList,
  onClose,
  onSaved,
}: {
  task: Task | null;
  date: string;
  lists: List[];
  initialList: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const save = useMutation({
    mutationFn: (body: object) =>
      api(task ? `/tasks/${task.id}` : "/tasks", task ? "PUT" : "POST", body),
    onSuccess: onSaved,
  });
  return (
    <Dialog
      title={task ? "Izmeni zadatak" : "Novi zadatak"}
      busy={save.isPending}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          save.mutate({
            title: f.get("title"),
            notes: f.get("notes"),
            priority: f.get("priority"),
            list_id: f.get("list_id") || null,
            due_date: f.get("due_date") || null,
          });
        }}
      >
        <label>
          Naziv
          <input
            autoFocus
            name="title"
            required
            maxLength={200}
            defaultValue={task?.title ?? ""}
            placeholder="Šta želiš da završiš?"
          />
        </label>
        <label>
          Lista
          <select
            name="list_id"
            defaultValue={task ? (task.list_id ?? "") : initialList}
          >
            <option value="">Bez liste</option>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <div className="form-row">
          <label>
            Prioritet
            <select name="priority" defaultValue={task?.priority ?? "normal"}>
              {Object.entries(priorities).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Rok <span className="optional">opciono</span>
            <input
              name="due_date"
              type="date"
              min="1970-01-01"
              max="9999-12-31"
              defaultValue={task ? (task.due_date ?? "") : date}
            />
          </label>
        </div>
        <p className="timezone">
          Obriši datum za zadatak bez roka. Takvi zadaci su u pregledu „Sve“.
        </p>
        <label>
          Beleška <span className="optional">opciono</span>
          <textarea
            name="notes"
            rows={3}
            maxLength={2000}
            defaultValue={task?.notes ?? ""}
          />
        </label>
        {save.error && (
          <div role="alert" className="error">
            {save.error.message}
          </div>
        )}
        <button className="primary" disabled={save.isPending}>
          {save.isPending ? "Čuvanje…" : "Sačuvaj zadatak"}
          <Check size={18} />
        </button>
      </form>
    </Dialog>
  );
}
function ListForm({
  list,
  onClose,
  onSaved,
}: {
  list: List | null;
  onClose: () => void;
  onSaved: (value: List) => void;
}) {
  const save = useMutation({
    mutationFn: (name: string) =>
      api<List>(
        list ? `/task-lists/${list.id}` : "/task-lists",
        list ? "PUT" : "POST",
        { name },
      ),
    onSuccess: onSaved,
  });
  return (
    <Dialog
      title={list ? "Preimenuj listu" : "Nova lista"}
      busy={save.isPending}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(String(new FormData(e.currentTarget).get("name")));
        }}
      >
        <label>
          Naziv liste
          <input
            autoFocus
            name="name"
            required
            maxLength={80}
            defaultValue={list?.name ?? ""}
            placeholder="Npr. Lično, Posao, Kupovina"
          />
        </label>
        {save.error && (
          <div className="error" role="alert">
            {save.error.message}
          </div>
        )}
        <button className="primary" disabled={save.isPending}>
          {save.isPending ? "Čuvanje…" : "Sačuvaj listu"}
        </button>
      </form>
    </Dialog>
  );
}
