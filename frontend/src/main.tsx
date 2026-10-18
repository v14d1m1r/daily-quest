import { ThemeToggle } from "./ThemeToggle";
import { Tasks } from "./Tasks";
import { api, ApiError } from "./api";
import { Meals } from "./Meals";
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Droplets,
  LayoutDashboard,
  Settings,
  LogOut,
  Plus,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  Pencil,
  Trash2,
  Leaf,
  CircleCheck,
  CalendarDays,
  GlassWater,
  LoaderCircle,
} from "lucide-react";
import "./style.css";
import { dateInZone, timeInZone, zonedISO, shiftDate } from "./dates";

type User = {
  id: string;
  name: string;
  email: string;
  timezone: string;
  water_goal_ml: number;
};
type Entry = { id: string; amount_ml: number; consumed_at: string };
type Summary = {
  date: string;
  total_ml: number;
  goal_ml: number;
  entries: Entry[];
  week: { date: string; total_ml: number }[];
};
const client = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 15000 } },
});
const friendlyDate = (date: string, options: Intl.DateTimeFormatOptions) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("sr-Latn-RS", {
    ...options,
    timeZone: "UTC",
  });
const liters = (ml: number) =>
  (ml / 1000).toLocaleString("sr-Latn-RS", { maximumFractionDigits: 2 });
function Brand() {
  return (
    <div className="brand">
      <span className="brand-icon">
        <Check size={23} />
      </span>
      daily<span>quest</span>
      <span className="brand-dot">.</span>
    </div>
  );
}
function ErrorMessage({ error }: { error: Error | null }) {
  return error ? (
    <div role="alert" className="error">
      {error.message}
    </div>
  ) : null;
}
function Auth() {
  const [register, setRegister] = useState(false);
  const config = useQuery({
    queryKey: ["config"],
    queryFn: () => api<{ registration_enabled: boolean }>("/config"),
  });
  const cache = useQueryClient();
  const auth = useMutation({
    mutationFn: (body: object) =>
      api<User>(register ? "/auth/register" : "/auth/login", "POST", body),
    onSuccess: (user) => cache.setQueryData(["me"], user),
  });
  return (
    <main className="auth">
      <div className="auth-theme">
        <ThemeToggle />
      </div>
      <div className="auth-story">
        <Brand />
        <div>
          <span className="eyebrow">MALO PO MALO, SVAKOG DANA</span>
          <h1>
            Dobar dan počinje
            <br />
            malim navikama.
          </h1>
          <p>
            Tvoj prostor za više ravnoteže.
            <br />
            Počni čašom vode. Nastavi svojim tempom.
          </p>
          <div className="auth-art">
            <Droplets size={100} />
            <span>Jedna dobra navika za danas.</span>
          </div>
        </div>
        <span className="auth-foot">DAILY QUEST · TVOJ DAN, TVOJ RITAM</span>
      </div>
      <div className="auth-form">
        <div className="auth-card">
          <span className="eyebrow">DOBRO DOŠAO</span>
          <h2>{register ? "Napravi svoj prostor." : "Vreme je za tebe."}</h2>
          <p>
            {register
              ? "Prvi korak ka tvojoj novoj rutini."
              : "Prijavi se i nastavi gde si stao."}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              auth.mutate(Object.fromEntries(f));
            }}
          >
            {register && (
              <label>
                Ime
                <input
                  name="name"
                  autoComplete="given-name"
                  required
                  maxLength={80}
                  placeholder="Kako da te zovemo?"
                />
              </label>
            )}
            <label>
              Email
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                placeholder="ti@primer.com"
              />
            </label>
            <label>
              Lozinka
              <input
                name="password"
                type="password"
                autoComplete={register ? "new-password" : "current-password"}
                required
                minLength={register ? 10 : 1}
                maxLength={128}
                placeholder={register ? "Najmanje 10 znakova" : "Tvoja lozinka"}
              />
            </label>
            <ErrorMessage error={auth.error} />
            <button className="primary" disabled={auth.isPending}>
              {auth.isPending
                ? "Samo trenutak…"
                : register
                  ? "Napravi nalog"
                  : "Prijavi se"}
              <ArrowUpRight size={18} />
            </button>
          </form>
          {config.data?.registration_enabled && (
            <button
              className="text-button auth-switch"
              onClick={() => {
                setRegister(!register);
                auth.reset();
              }}
            >
              {register
                ? "Već imaš nalog? Prijavi se"
                : "Prvi put ovde? Napravi nalog"}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
function App() {
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<User>("/me") });
  if (me.isPending)
    return (
      <div className="loading">
        <LoaderCircle className="spin" /> Učitavanje tvog dana…
      </div>
    );
  if (me.error)
    return me.error instanceof ApiError && me.error.status === 401 ? (
      <Auth />
    ) : (
      <div className="loading">
        <div>
          <h2>Ne možemo da se povežemo.</h2>
          <p>Proveri da li je server pokrenut.</p>
          <ErrorMessage error={me.error} />
          <button className="primary" onClick={() => me.refetch()}>
            Pokušaj ponovo
          </button>
        </div>
      </div>
    );
  return <Dashboard user={me.data} />;
}
function Dashboard({ user }: { user: User }) {
  const cache = useQueryClient();
  const today = dateInZone(new Date(), user.timezone);
  const [date, setDate] = useState(today);
  const [view, setView] = useState<"today" | "water" | "meals" | "tasks">(
    "today",
  );
  const [modal, setModal] = useState<"water" | "settings" | null>(null);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [notice, setNotice] = useState("");
  const summary = useQuery({
    queryKey: ["water", date, user.timezone],
    queryFn: () => api<Summary>(`/water/summary?date=${date}`),
  });
  function refresh(message: string) {
    cache.invalidateQueries({ queryKey: ["water"] });
    cache.invalidateQueries({ queryKey: ["meals"] });
    setNotice(message);
  }
  const add = useMutation({
    mutationFn: (amount: number) =>
      api("/water", "POST", {
        amount_ml: amount,
        consumed_at: new Date().toISOString(),
      }),
    onSuccess: () => refresh("Voda je dodata. Još jedan mali korak!"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/water/${id}`, "DELETE"),
    onSuccess: () => refresh("Unos je obrisan."),
  });
  const logout = useMutation({
    mutationFn: () => api("/auth/logout", "POST"),
    onSuccess: () => {
      cache.clear();
      window.location.reload();
    },
  });
  const data = summary.data;
  const total = data?.total_ml || 0;
  const goal = data?.goal_ml || user.water_goal_ml;
  const progress = Math.round((total / goal) * 100);
  const remaining = Math.max(goal - total, 0);
  function openWater(entry: Entry | null = null) {
    setEditing(entry);
    setModal("water");
  }
  return (
    <div className="shell">
      <aside className="sidebar">
        <Brand />
        <div className="workspace-label">MOJ PROSTOR</div>
        <nav>
          <button
            className={view === "today" ? "nav-item active" : "nav-item"}
            onClick={() => setView("today")}
          >
            <LayoutDashboard size={19} />
            Moj dan
          </button>
          <button
            className={view === "water" ? "nav-item active" : "nav-item"}
            onClick={() => setView("water")}
          >
            <Droplets size={19} />
            Voda
          </button>
          <button
            className={view === "meals" ? "nav-item active" : "nav-item"}
            onClick={() => setView("meals")}
          >
            <Leaf size={19} />
            Ishrana
          </button>
          <button
            className={view === "tasks" ? "nav-item active" : "nav-item"}
            onClick={() => setView("tasks")}
          >
            <CircleCheck size={19} />
            Zadaci
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="small-note">
            <span>
              Male navike.
              <br />
              Velika razlika.
            </span>
            <Leaf size={27} />
          </div>
          <button className="nav-item" onClick={() => setModal("settings")}>
            <Settings size={18} />
            Podešavanja
          </button>
          <div className="profile">
            <span className="avatar">
              {user.name.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <strong>{user.name}</strong>
              <small>Lični prostor</small>
            </div>
            <button
              className="icon-button"
              aria-label="Odjavi se"
              title="Odjavi se"
              onClick={() => logout.mutate()}
              disabled={logout.isPending}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <span>
            Moj prostor <span className="slash">/</span>{" "}
            <strong>
              {view === "today"
                ? "Moj dan"
                : view === "meals"
                  ? "Ishrana"
                  : view === "tasks"
                    ? "Zadaci"
                    : "Voda"}
            </strong>
          </span>
          <div className="topbar-actions">
            <span className="top-date">
              <CalendarDays size={16} />
              {friendlyDate(today, {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </span>
            <ThemeToggle />
            <button
              className="mobile-settings icon-button"
              aria-label="Podešavanja"
              onClick={() => setModal("settings")}
            >
              <Settings size={19} />
            </button>
          </div>
        </header>
        <div className="content">
          <section className="page-heading">
            <div>
              <span className="eyebrow">SVAKI MALI KORAK SE RAČUNA</span>
              <h1>
                {view === "today"
                  ? `Zdravo, ${user.name.split(" ")[0]}.`
                  : view === "meals"
                    ? "Šta je danas na meniju?"
                    : view === "tasks"
                      ? "Jedna obaveza manje."
                      : "Tvoja dnevna doza ravnoteže."}
                <span className="greeting-dot">✳</span>
              </h1>
              <p>
                {view === "today"
                  ? "Napravi malo prostora za dobre navike."
                  : view === "meals"
                    ? "Tvoj dnevnik obroka, u tvom ritmu."
                    : view === "tasks"
                      ? "Napravi plan i ostavi prostor za sebe."
                      : "Čaša po čaša, kroz ceo dan."}
              </p>
            </div>
            <div className="date-picker">
              <button
                className="icon-button"
                aria-label="Prethodni dan"
                onClick={() => setDate(shiftDate(date, -1))}
              >
                <ChevronLeft size={18} />
              </button>
              <label>
                <span>
                  {date === today
                    ? "Danas"
                    : friendlyDate(date, { day: "numeric", month: "short" })}
                </span>
                <input
                  aria-label="Izaberi datum"
                  type="date"
                  value={date}
                  max={view === "tasks" ? "9999-12-31" : today}
                  onChange={(e) => e.target.value && setDate(e.target.value)}
                />
              </label>
              <button
                className="icon-button"
                aria-label="Sledeći dan"
                disabled={view !== "tasks" && date >= today}
                onClick={() => setDate(shiftDate(date, 1))}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </section>
          {(view === "today" || view === "tasks") && (
            <Tasks
              key={view}
              date={date}
              today={today}
              compact={view === "today"}
            />
          )}
          <ErrorMessage
            error={summary.error || add.error || remove.error || logout.error}
          />
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
          {(view === "today" || view === "water") &&
            (summary.isPending ? (
              <div className="loading panel">
                <LoaderCircle className="spin" />
                Učitavanje unosa…
              </div>
            ) : summary.isError ? (
              <button className="secondary" onClick={() => summary.refetch()}>
                Učitaj ponovo
              </button>
            ) : (
              <>
                <div className="overview-grid">
                  <section className="water-card">
                    <div className="card-top">
                      <div className="card-title">
                        <span className="icon-tile">
                          <Droplets size={21} />
                        </span>
                        <div>
                          <h2>Voda</h2>
                          <span>Tvoja dnevna hidratacija</span>
                        </div>
                      </div>
                      <span className="pill">
                        {progress >= 100 ? "Cilj ispunjen" : "Dnevni cilj"}
                      </span>
                    </div>
                    <div className="water-center">
                      <div className="water-stat">
                        <span className="eyebrow">
                          {date === today
                            ? "DANAS POPIJENO"
                            : "UKUPNO POPIJENO"}
                        </span>
                        <div className="big-number">
                          {liters(total)}
                          <span> / {liters(goal)} l</span>
                        </div>
                        <p>
                          {remaining > 0
                            ? `Još ${liters(remaining)} l do tvog cilja.`
                            : "Bravo! Ostvario si svoj dnevni cilj."}
                        </p>
                      </div>
                      <div
                        className="water-orb"
                        style={
                          {
                            "--fill": `${Math.min(progress, 100)}%`,
                          } as React.CSSProperties
                        }
                      >
                        <div className="orb-water" />
                        <div className="orb-content">
                          <Droplets size={25} />
                          <strong>{progress}%</strong>
                          <span>tvog cilja</span>
                        </div>
                      </div>
                    </div>
                    <div className="quick-label">
                      BRZI UNOS <span>jedna čaša bliže cilju</span>
                    </div>
                    <div className="quick-actions">
                      {[150, 250, 500].map((amount) => (
                        <button
                          key={amount}
                          disabled={date !== today || add.isPending}
                          onClick={() => add.mutate(amount)}
                        >
                          <Plus size={16} />
                          {amount} ml
                        </button>
                      ))}
                    </div>
                    <button
                      className="water-custom"
                      onClick={() => openWater()}
                    >
                      <Plus size={17} />
                      Unesi količinu i vreme
                      <ArrowUpRight size={17} />
                    </button>
                    {date !== today && (
                      <small className="past-hint">
                        Za prethodni dan koristi unos količine i vremena.
                      </small>
                    )}
                  </section>
                  <section className="panel week-card">
                    <div className="card-top">
                      <div>
                        <h2>Korak po korak</h2>
                        <p>Unos vode · poslednjih 7 dana</p>
                      </div>
                      <span className="trend-icon">
                        <Droplets size={20} />
                      </span>
                    </div>
                    <div className="week-summary">
                      <strong>
                        {liters(
                          (data?.week.reduce((n, d) => n + d.total_ml, 0) ||
                            0) / 7,
                        )}{" "}
                        <span>l / dan</span>
                      </strong>
                      <span>prosečan unos</span>
                    </div>
                    <div
                      className="chart"
                      aria-label="Unos vode u poslednjih sedam dana"
                    >
                      {data?.week.map((day) => (
                        <button
                          className={
                            day.date === date
                              ? "chart-column selected"
                              : "chart-column"
                          }
                          key={day.date}
                          onClick={() => setDate(day.date)}
                          aria-label={`${day.date}: ${day.total_ml} ml`}
                        >
                          <span className="bar-value">
                            {liters(day.total_ml)}
                          </span>
                          <div className="bar-track">
                            <div
                              className="bar"
                              style={{
                                height: `${Math.max(3, (day.total_ml / Math.max(goal, ...data.week.map((d) => d.total_ml))) * 100)}%`,
                              }}
                            />
                          </div>
                          <span className="bar-day">
                            {friendlyDate(day.date, {
                              weekday: "short",
                            }).replace(".", "")}
                          </span>
                        </button>
                      ))}
                    </div>
                    <div className="chart-footer">
                      <span>
                        <i />
                        Dnevni unos u litrima
                      </span>
                      <button
                        className="text-button"
                        onClick={() => setModal("settings")}
                      >
                        Cilj: {liters(goal)} l <Pencil size={12} />
                      </button>
                    </div>
                  </section>
                </div>
                <section className="panel entries-card">
                  <div className="card-top">
                    <div>
                      <h2>
                        Mali koraci, zabeleženi{" "}
                        <span className="count">{data?.entries.length}</span>
                      </h2>
                      <p>
                        {date === today
                          ? "Tvoji današnji unosi vode."
                          : "Unosi vode za izabrani dan."}
                      </p>
                    </div>
                    <button className="secondary" onClick={() => openWater()}>
                      <Plus size={16} />
                      Dodaj unos
                    </button>
                  </div>
                  {data?.entries.length ? (
                    <div className="entries">
                      <div className="table-heading">
                        <span>AKTIVNOST</span>
                        <span>VREME</span>
                        <span>KOLIČINA</span>
                        <span />
                      </div>
                      {data.entries.map((entry) => (
                        <div className="entry-row" key={entry.id}>
                          <div className="entry-name">
                            <span className="entry-icon">
                              <GlassWater size={18} />
                            </span>
                            <div>
                              <strong>Čaša vode</strong>
                              <small>Ručni unos</small>
                            </div>
                          </div>
                          <span className="entry-time">
                            {timeInZone(
                              new Date(entry.consumed_at),
                              user.timezone,
                            )}
                          </span>
                          <strong className="entry-amount">
                            + {entry.amount_ml} <span>ml</span>
                          </strong>
                          <div className="entry-actions">
                            <button
                              className="icon-button"
                              aria-label={`Izmeni unos od ${entry.amount_ml} ml`}
                              onClick={() => openWater(entry)}
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              className="icon-button delete"
                              aria-label={`Obriši unos od ${entry.amount_ml} ml`}
                              disabled={remove.isPending}
                              onClick={() => {
                                if (window.confirm("Obrisati ovaj unos vode?"))
                                  remove.mutate(entry.id);
                              }}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="empty">
                      <span className="empty-icon">
                        <GlassWater size={28} />
                      </span>
                      <h3>Prva čaša je dobar početak.</h3>
                      <p>
                        Još nema unosa za ovaj dan. Dodaj vodu i prati svoj
                        napredak.
                      </p>
                      <button
                        className="text-button"
                        onClick={() => openWater()}
                      >
                        Dodaj prvi unos <ArrowUpRight size={16} />
                      </button>
                    </div>
                  )}
                </section>
                <div className="bottom-note">
                  <Leaf size={18} />
                  <span>
                    Ne mora sve odjednom. Dovoljna je jedna dobra navika danas.
                  </span>
                  <span className="version">DAILY QUEST / 01</span>
                </div>
              </>
            ))}
          {(view === "today" || view === "meals") && (
            <Meals date={date} timezone={user.timezone} />
          )}
        </div>
      </main>
      {modal && (
        <Modal
          title={
            modal === "settings"
              ? "Tvoja podešavanja"
              : editing
                ? "Izmeni unos"
                : "Dodaj čašu vode"
          }
          onClose={() => setModal(null)}
        >
          {modal === "settings" ? (
            <SettingsForm
              user={user}
              onSaved={() => {
                setModal(null);
                refresh("Podešavanja su sačuvana.");
              }}
              onLogout={() => logout.mutate()}
            />
          ) : (
            <WaterForm
              date={date}
              user={user}
              entry={editing}
              onSaved={() => {
                setModal(null);
                refresh(
                  editing
                    ? "Unos je izmenjen."
                    : "Voda je dodata. Još jedan mali korak!",
                );
              }}
            />
          )}
        </Modal>
      )}
    </div>
  );
}
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLDialogElement>(null);
  React.useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-inner">
        <div className="modal-heading">
          <h2>{title}</h2>
          <button
            className="icon-button"
            aria-label="Zatvori"
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
function WaterForm({
  date,
  user,
  entry,
  onSaved,
}: {
  date: string;
  user: User;
  entry: Entry | null;
  onSaved: () => void;
}) {
  const [error, setError] = useState<Error | null>(null);
  const save = useMutation({
    mutationFn: (body: object) =>
      api(
        entry ? `/water/${entry.id}` : "/water",
        entry ? "PUT" : "POST",
        body,
      ),
    onSuccess: onSaved,
  });
  const entryDate = entry ? new Date(entry.consumed_at) : new Date();
  const initialTime =
    entry || date === dateInZone(new Date(), user.timezone)
      ? timeInZone(entryDate, user.timezone)
      : "12:00";
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        const f = new FormData(e.currentTarget);
        try {
          save.mutate({
            amount_ml: Number(f.get("amount")),
            consumed_at: zonedISO(
              String(f.get("date")),
              String(f.get("time")),
              user.timezone,
            ),
          });
        } catch (e) {
          setError(e as Error);
        }
      }}
    >
      <p className="form-description">
        Svaka čaša se računa. Unesi količinu koju si popio.
      </p>
      <label>
        Količina (ml)
        <input
          autoFocus
          name="amount"
          type="number"
          min="1"
          max="10000"
          step="1"
          required
          defaultValue={entry?.amount_ml || 250}
        />
      </label>
      <div className="form-row">
        <label>
          Datum
          <input
            name="date"
            type="date"
            min="1970-01-01"
            max={dateInZone(new Date(), user.timezone)}
            required
            defaultValue={entry ? dateInZone(entryDate, user.timezone) : date}
          />
        </label>
        <label>
          Vreme
          <input name="time" type="time" required defaultValue={initialTime} />
        </label>
      </div>
      <small className="timezone">Vreme u zoni {user.timezone}</small>
      <ErrorMessage error={error || save.error} />
      <button className="primary" disabled={save.isPending}>
        {save.isPending ? "Čuvanje…" : entry ? "Sačuvaj izmene" : "Dodaj vodu"}
        <Check size={18} />
      </button>
    </form>
  );
}
function SettingsForm({
  user,
  onSaved,
  onLogout,
}: {
  user: User;
  onSaved: () => void;
  onLogout: () => void;
}) {
  const cache = useQueryClient();
  const save = useMutation({
    mutationFn: (body: object) => api<User>("/settings", "PUT", body),
    onSuccess: (user) => {
      cache.setQueryData(["me"], user);
      onSaved();
    },
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        save.mutate({
          water_goal_ml: Number(f.get("goal")),
          timezone: f.get("timezone"),
        });
      }}
    >
      <p className="form-description">
        Postavi cilj koji odgovara tvojoj rutini.
      </p>
      <label>
        Dnevni cilj vode (ml)
        <input
          autoFocus
          name="goal"
          type="number"
          min="100"
          max="20000"
          step="1"
          defaultValue={user.water_goal_ml}
          required
        />
      </label>
      <label>
        Vremenska zona
        <input
          name="timezone"
          defaultValue={user.timezone}
          required
          list="timezones"
        />
        <datalist id="timezones">
          {[
            "Europe/Belgrade",
            "Europe/London",
            "Europe/Berlin",
            "America/New_York",
            "America/Los_Angeles",
            "Asia/Tokyo",
            "UTC",
          ].map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </label>
      <small className="timezone">
        Promena zone menja raspored unosa po danima. Cilj važi i u istorijskom
        pregledu.
      </small>
      <ErrorMessage error={save.error} />
      <button className="primary" disabled={save.isPending}>
        {save.isPending ? "Čuvanje…" : "Sačuvaj podešavanja"}
        <Check size={18} />
      </button>
      <button
        type="button"
        className="text-button logout-link"
        onClick={onLogout}
      >
        Odjavi se <LogOut size={15} />
      </button>
    </form>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
