import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { shiftDate } from "./dates";

const periods = [
  ["7", "7 dana"],
  ["30", "30 dana"],
  ["month", "Ovaj mesec"],
  ["3", "3 meseca"],
  ["6", "6 meseci"],
] as const;
const liters = (ml: number) =>
  (ml / 1000).toLocaleString("sr-Latn-RS", { maximumFractionDigits: 2 });
const label = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("sr-Latn-RS", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

export function WaterStats({
  date,
  timezone,
}: {
  date: string;
  timezone: string;
}) {
  const [period, setPeriod] = useState<string>("7");
  let start = shiftDate(date, period === "30" ? -29 : -6);
  if (period === "month") start = `${date.slice(0, 7)}-01`;
  if (period === "3" || period === "6") {
    const first = new Date(`${date.slice(0, 7)}-01T12:00:00Z`);
    first.setUTCMonth(first.getUTCMonth() - Number(period) + 1);
    start = first.toISOString().slice(0, 10);
  }
  const query = useQuery({
    queryKey: ["water", "statistics", start, date, timezone],
    queryFn: () =>
      api<{ goal_ml: number; week: { date: string; total_ml: number }[] }>(
        `/water/summary?date=${date}&start=${start}`,
      ),
  });
  const days = query.data?.week ?? [];
  const total = days.reduce((sum, day) => sum + day.total_ml, 0);
  const goal = query.data?.goal_ml ?? 2000;
  const maximum = Math.max(goal, ...days.map((day) => day.total_ml));
  const achieved = days.filter((day) => day.total_ml >= goal).length;
  return (
    <section className="panel week-card">
      <h2>Statistika vode</h2>
      <div
        className="task-periods water-periods"
        role="group"
        aria-label="Period statistike vode"
      >
        {periods.map(([value, title]) => (
          <button
            key={value}
            className={period === value ? "selected" : ""}
            aria-pressed={period === value}
            onClick={() => setPeriod(value)}
          >
            {title}
          </button>
        ))}
      </div>
      <p className="task-help">
        {label(start)} – {label(date)} · do izabranog dana
      </p>
      {query.isPending ? (
        <p role="status">Učitavanje statistike…</p>
      ) : query.isError ? (
        <div role="alert">
          <p>{query.error.message}</p>
          <button className="secondary" onClick={() => query.refetch()}>
            Pokušaj ponovo
          </button>
        </div>
      ) : (
        <>
          <div className="water-statistics">
            <div>
              <strong>{liters(total)} l</strong>
              <span>Ukupno</span>
            </div>
            <div>
              <strong>{liters(total / days.length)} l</strong>
              <span>Dnevni prosek</span>
            </div>
            <div>
              <strong>
                {achieved} / {days.length}
              </strong>
              <span>Dana sa ostvarenim ciljem</span>
            </div>
            <div>
              <strong>
                {liters(Math.max(0, ...days.map((day) => day.total_ml)))} l
              </strong>
              <span>Najveći dnevni unos</span>
            </div>
          </div>
          {total === 0 && (
            <p className="task-help">
              Nema zabeleženog unosa vode u ovom periodu.
            </p>
          )}
          <div
            className="water-chart-scroll"
            tabIndex={0}
            aria-label="Dnevni unos vode; pomeri grafikon za ostale dane"
          >
            <div
              className="chart water-history-chart"
              style={{ minWidth: `${days.length * 48}px` }}
            >
              {days.map((day) => (
                <div
                  className="chart-column"
                  key={day.date}
                  title={`${label(day.date)}: ${day.total_ml} ml`}
                >
                  <span className="bar-value">{liters(day.total_ml)}</span>
                  <div className="bar-track">
                    <div
                      className="bar"
                      style={{
                        height: `${(day.total_ml / maximum) * 100}%`,
                        minHeight: day.total_ml ? 3 : 0,
                      }}
                    />
                  </div>
                  <span className="bar-day">
                    {day.date.slice(8)}.{day.date.slice(5, 7)}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <p className="task-help">
            Dnevni unos u litrima. Prosek uključuje dane bez unosa. Cilj:{" "}
            {liters(goal)} l dnevno (trenutno podešavanje).
          </p>
        </>
      )}
    </section>
  );
}
