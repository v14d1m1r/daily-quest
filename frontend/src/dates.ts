export const dateInZone = (date: Date, zone: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
export const timeInZone = (date: Date, zone: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
// Convert a wall-clock input in the account timezone, independent of the device timezone.
export function zonedISO(date: string, time: string, zone: string) {
  const target = Date.parse(`${date}T${time}:00Z`);
  let guess = target;
  for (let i = 0; i < 4; i++) {
    const actual = new Date(guess);
    const wall = Date.parse(
      `${dateInZone(actual, zone)}T${timeInZone(actual, zone)}:00Z`,
    );
    const delta = target - wall;
    if (delta === 0) return actual.toISOString();
    guess += delta;
  }
  throw new Error(
    "Ovo vreme ne postoji zbog promene računanja vremena. Izaberi drugo vreme.",
  );
}
export const shiftDate = (value: string, amount: number) => {
  const d = new Date(`${value}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + amount);
  return d.toISOString().slice(0, 10);
};
