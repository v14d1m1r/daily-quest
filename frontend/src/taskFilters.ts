export type Task = {
  id: string;
  list_id: string | null;
  title: string;
  notes: string;
  priority: "low" | "normal" | "high";
  due_date: string | null;
  completed: boolean;
};
export type Period = "day" | "week" | "month" | "all";
export function periodEnd(date: string, period: Period) {
  const d = new Date(`${date}T12:00:00Z`);
  if (period === "week")
    d.setUTCDate(d.getUTCDate() + 6 - ((d.getUTCDay() + 6) % 7));
  if (period === "month") d.setUTCMonth(d.getUTCMonth() + 1, 0);
  return d.toISOString().slice(0, 10);
}
export function filterTasks(
  tasks: Task[],
  date: string,
  period: Period,
  list: string,
  status: string,
) {
  const end = periodEnd(date, period);
  const d = new Date(`${date}T12:00:00Z`);
  if (period === "week")
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  if (period === "month") d.setUTCDate(1);
  const start = d.toISOString().slice(0, 10);
  return tasks
    .filter(
      (t) =>
        (list === "all" ||
          (list === "none" ? t.list_id === null : t.list_id === list)) &&
        (status === "all" ||
          (status === "done" ? t.completed : !t.completed)) &&
        (period === "all" ||
          (t.due_date !== null &&
            t.due_date <= end &&
            (!t.completed || t.due_date >= start))),
    )
    .sort(
      (a, b) =>
        Number(a.completed) - Number(b.completed) ||
        (a.due_date ?? "9999-12-31").localeCompare(
          b.due_date ?? "9999-12-31",
        ) ||
        { high: 0, normal: 1, low: 2 }[a.priority] -
          { high: 0, normal: 1, low: 2 }[b.priority] ||
        a.title.localeCompare(b.title),
    );
}
