import { writeFile } from "node:fs/promises";

const username = "yfeng445";
const output = "wakatime-activity.svg";
const endpoint = new URL(`https://wakatime.com/api/v1/users/${username}/insights/days/public`);

const response = await fetch(endpoint, {
  headers: { Accept: "application/json", "User-Agent": "yfeng445-profile-metrics" },
});

if (!response.ok) {
  throw new Error(`WakaTime activity API returned ${response.status}`);
}

const { data } = await response.json();
if (!data || data.status !== "ok" || !Array.isArray(data.days) || data.days.length < 2) {
  throw new Error("WakaTime activity API returned incomplete activity data");
}

const millisecondsPerDay = 24 * 60 * 60 * 1000;
const cellSize = 10;
const cellGap = 3;
const cellPitch = cellSize + cellGap;
const gridX = 30;
const gridY = 81;

const parseDate = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid WakaTime activity date: ${value}`);
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
};

const days = data.days
  .map((day) => ({
    date: day.date,
    parsedDate: parseDate(day.date),
    total: Number(day.total),
  }))
  .filter((day) => Number.isFinite(day.total) && day.total >= 0)
  .sort((a, b) => a.parsedDate - b.parsedDate)
  .slice(-365);

if (days.length < 2) {
  throw new Error("WakaTime activity data did not contain enough valid days");
}

const startDate = days[0].parsedDate;
const endDate = days.at(-1).parsedDate;
const calendarStart = new Date(startDate);
calendarStart.setUTCDate(calendarStart.getUTCDate() - calendarStart.getUTCDay());

const dayDifference = (start, end) => Math.round((end - start) / millisecondsPerDay);
const weekColumn = (date) => Math.floor(dayDifference(calendarStart, date) / 7);

// These are the same public activity ranges used by WakaTime's calendar heatmap.
const activityLevel = (seconds) => {
  if (seconds < 3600) return 0;
  if (seconds <= 10800) return 1;
  if (seconds <= 28800) return 2;
  if (seconds <= 36000) return 3;
  if (seconds <= 43200) return 4;
  return 5;
};

const activityLabel = (seconds) => {
  if (seconds < 3600) return "Under 1 hr";
  if (seconds <= 10800) return "1-3 hrs";
  if (seconds <= 28800) return "4-8 hrs";
  if (seconds <= 36000) return "9-10 hrs";
  if (seconds <= 43200) return "11-12 hrs";
  return "13+ hrs";
};

const monthNames = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const fullMonthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const monthStarts = [];
for (
  let cursor = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1));
  cursor <= endDate;
  cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))
) {
  monthStarts.push(cursor);
}
if (monthStarts.length > 12) monthStarts.shift();

const formatDate = (date) => `${monthNames[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;

const cells = days.map((day) => {
  const x = gridX + weekColumn(day.parsedDate) * cellPitch;
  const y = gridY + day.parsedDate.getUTCDay() * cellPitch;
  const level = activityLevel(day.total);
  return `  <rect class="day level-${level}" x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" rx="2"><title>${activityLabel(day.total)} on ${formatDate(day.parsedDate)}</title></rect>`;
}).join("\n");

const monthLabels = monthStarts.map((date, index) => {
  let column = weekColumn(date);
  if (index > 0 && date.getUTCDay() > 0) column += 1;
  const x = gridX + column * cellPitch;
  const label = monthNames[date.getUTCMonth()];
  const fullLabel = `${fullMonthNames[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
  return `  <text class="axis" x="${x}" y="72">${label}<title>${fullLabel}</title></text>`;
}).join("\n");

const weekdayLabels = [
  ["Mon", 1],
  ["Wed", 3],
  ["Fri", 5],
].map(([label, row]) => `  <text class="axis" x="0" y="${gridY + Number(row) * cellPitch + 9}">${label}</text>`).join("\n");

const rangeLabel = `${formatDate(startDate)} – ${formatDate(endDate)}`;
const legendRects = Array.from({ length: 6 }, (_, level) => {
  const x = 574 + level * 14;
  return `  <rect class="day level-${level}" x="${x}" y="185" width="10" height="10" rx="2"><title>${activityLabel(level === 0 ? 0 : [3600, 10801, 28801, 36001, 43201][level - 1])}</title></rect>`;
}).join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="210" viewBox="0 0 720 210" role="img" aria-labelledby="title desc">
  <title id="title">WakaTime activity last year</title>
  <desc id="desc">Daily coding activity from ${rangeLabel}</desc>
  <style>
    .card { fill: #0d1117; stroke: #30363d; }
    .title { fill: #f0f6fc; font: 600 16px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .source { fill: #58a6ff; font: 600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .axis, .legend { fill: #8b949e; font: 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .day { stroke: rgba(27, 31, 35, 0.06); shape-rendering: geometricPrecision; }
    .level-0 { fill: #161b22; }
    .level-1 { fill: #36526c; }
    .level-2 { fill: #527da4; }
    .level-3 { fill: #8baac5; }
    .level-4 { fill: #b4c7d9; }
    .level-5 { fill: #ebedf0; }
    @media (prefers-color-scheme: light) {
      .card { fill: #ffffff; stroke: #d0d7de; }
      .title { fill: #1f2328; }
      .source { fill: #0969da; }
      .axis, .legend { fill: #57606a; }
      .level-0 { fill: #ebedf0; }
      .level-1 { fill: #b4c7d9; }
      .level-2 { fill: #8baac5; }
      .level-3 { fill: #527da4; }
      .level-4 { fill: #36526c; }
      .level-5 { fill: #000000; }
    }
  </style>
  <rect class="card" x="0.5" y="0.5" width="719" height="209" rx="10"/>
  <text class="title" x="28" y="35">ACTIVITY LAST YEAR</text>
  <text class="source" x="692" y="35" text-anchor="end">WakaTime</text>
  <line x1="28" y1="51" x2="692" y2="51" stroke="#30363d"/>
${monthLabels}
${weekdayLabels}
${cells}
  <text class="legend" x="540" y="194">Less</text>
${legendRects}
  <text class="legend" x="662" y="194">More</text>
</svg>
`;

await writeFile(output, svg, "utf8");
console.log(`Generated ${output} from WakaTime ${data.human_readable_range || "last year"}`);
