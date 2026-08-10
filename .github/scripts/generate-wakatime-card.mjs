import { writeFile } from "node:fs/promises";

const username = "yfeng445";
const output = "wakatime-metrics.svg";
const token = process.env.WAKATIME_API_KEY?.trim();
const range = process.env.WAKATIME_RANGE?.trim() || "last_30_days";
const endpoint = new URL(`https://wakatime.com/api/v1/users/${username}/stats${token ? `/${range}` : ""}`);

if (token) endpoint.searchParams.set("api_key", token);

const response = await fetch(endpoint, {
  headers: { Accept: "application/json", "User-Agent": "yfeng445-profile-metrics" },
});

if (!response.ok) {
  throw new Error(`WakaTime API returned ${response.status}`);
}

const { data } = await response.json();
if (!data || data.status !== "ok") {
  throw new Error("WakaTime API returned incomplete stats");
}

const ignoredLanguages = new Set([
  "other",
  "markdown",
  "text",
  "json",
  "git config",
  "yaml",
  "toml",
  "xml",
  "image (svg)",
  "ssh config",
]);

const secondsFor = (item) => {
  const total = Number(item.total_seconds);
  if (Number.isFinite(total)) return total;
  return Number(item.ai_coding_seconds || 0) + Number(item.manual_coding_seconds || 0);
};

const normalize = (items, { ignored = new Set(), limit = 5 } = {}) => {
  const candidates = (items || [])
    .filter((item) => !ignored.has(item.name.toLowerCase()))
    .map((item) => ({ ...item, seconds: secondsFor(item) }))
    .filter((item) => Number.isFinite(item.seconds) && item.seconds > 0);
  const denominator = candidates.reduce((sum, item) => sum + item.seconds, 0);
  return candidates
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, limit)
    .map((item) => ({
    ...item,
    percent: denominator > 0 ? (item.seconds / denominator) * 100 : 0,
  }));
};

const languages = normalize(data.languages, { ignored: ignoredLanguages, limit: 5 });
const operatingSystems = normalize(data.operating_systems, {
  ignored: new Set(["unknown os"]),
  limit: 3,
}).map((item) => ({ ...item, name: item.name === "Mac" ? "macOS" : item.name }));

if (!languages.length || !operatingSystems.length) {
  throw new Error("WakaTime stats did not contain languages and operating systems");
}

const escapeXml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const formatDuration = (seconds) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (hours >= 100) return `${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

const formatPercent = (percent) => `${percent.toFixed(percent >= 10 ? 0 : 1)}%`;
const rangeLabel = data.human_readable_range || data.range?.replaceAll("_", " ") || "recent activity";
const totalSeconds = (data.operating_systems || []).reduce((sum, item) => sum + secondsFor(item), 0);
const totalLabel = data.human_readable_total_including_other_language
  || data.human_readable_total
  || formatDuration(totalSeconds);
const dailyLabel = data.human_readable_daily_average_including_other_language
  || data.human_readable_daily_average
  || "—";
const colors = ["#58a6ff", "#a371f7", "#3fb950", "#d29922", "#f778ba"];

const renderRows = (items, x, width) => items.map((item, index) => {
  const y = 120 + index * 31;
  const fillWidth = Math.max(2, Math.min(width, width * item.percent / 100));
  const detail = `${formatDuration(item.seconds)} · ${formatPercent(item.percent)}`;
  return `
    <text class="label" x="${x}" y="${y}">${escapeXml(item.name)}</text>
    <text class="value" x="${x + width}" y="${y}" text-anchor="end">${escapeXml(detail)}</text>
    <rect class="track" x="${x}" y="${y + 8}" width="${width}" height="7" rx="3.5"/>
    <rect x="${x}" y="${y + 8}" width="${fillWidth.toFixed(1)}" height="7" rx="3.5" fill="${colors[index]}"/>`;
}).join("");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="286" viewBox="0 0 720 286" role="img" aria-labelledby="title desc">
  <title id="title">WakaTime coding activity</title>
  <desc id="desc">Top programming languages and operating systems for ${escapeXml(rangeLabel)}</desc>
  <style>
    .card { fill: #0d1117; stroke: #30363d; }
    .title { fill: #f0f6fc; font: 600 20px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .subtitle, .value { fill: #8b949e; font: 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .heading { fill: #58a6ff; font: 600 14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .label { fill: #c9d1d9; font: 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .track { fill: #21262d; }
    @media (prefers-color-scheme: light) {
      .card { fill: #ffffff; stroke: #d0d7de; }
      .title { fill: #1f2328; }
      .subtitle, .value { fill: #656d76; }
      .heading { fill: #0969da; }
      .label { fill: #1f2328; }
      .track { fill: #eaeef2; }
    }
  </style>
  <rect class="card" x="0.5" y="0.5" width="719" height="285" rx="10"/>
  <text class="title" x="28" y="38">WakaTime</text>
  <text class="subtitle" x="28" y="61">${escapeXml(rangeLabel)} · ${escapeXml(totalLabel)} total · ${escapeXml(dailyLabel)} daily average</text>
  <line x1="28" y1="78" x2="692" y2="78" stroke="#30363d"/>
  <text class="heading" x="28" y="101">Top languages</text>
  <text class="heading" x="382" y="101">Work on · platforms</text>
${renderRows(languages, 28, 310)}
${renderRows(operatingSystems, 382, 310)}
</svg>
`;

await writeFile(output, svg, "utf8");
console.log(`Generated ${output} from WakaTime ${rangeLabel}`);
