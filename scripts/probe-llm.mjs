import fs from "fs";
import path from "path";

function loadEnv(file) {
  const p = path.join(process.cwd(), file);
  if (!fs.existsSync(p)) return {};
  const out = {};
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
  }
  return out;
}

const env = { ...loadEnv(".env.local"), ...process.env };
const key = env.OPENAI_API_KEY?.trim();
const baseUrl = (env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
const model = env.OPENAI_MODEL ?? "gpt-4o-mini";

console.log("key configured:", Boolean(key && key !== "sk-your-key-here"));
console.log("model:", model);
console.log("baseUrl:", baseUrl);

if (!key || key === "sk-your-key-here") {
  console.log("RESULT: LLM would NEVER run (no valid key)");
  process.exit(0);
}

const systemPrompt = `You are Cultra. Respond with JSON only: {"assistantMessage":"ok","action":"show_plans","intent":{"scenario":"solo","groupSize":2,"includeActivities":false,"includeRestaurant":true,"cuisines":["Noodles"],"targetDistrict":null,"wantsReserve":true,"wantsOrder":false,"interactionMode":"show_plans","reserveTime":"Today 6:00 PM","dietFriendly":false,"quietAmbiance":false,"familyFriendly":false,"keywords":[],"wantsPlansExplicit":true}}`;

const userPrompt = `No plans on screen yet.
hasPlans: false

Conversation:
Assistant: Hi! How can I help?
User: Me and a friend of mine wanna go to a noodle place, reserve it for 6pm today near us.`;

const body = {
  model,
  temperature: 0.3,
  response_format: { type: "json_object" },
  messages: [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ],
};

const attempts = 10;
let ok = 0;
let fail = 0;
const errors = [];
const groupSizes = [];

for (let i = 1; i <= attempts; i++) {
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      fail++;
      errors.push(`HTTP ${res.status}: ${text.slice(0, 150)}`);
      continue;
    }
    const data = JSON.parse(text);
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      fail++;
      errors.push("empty content");
      continue;
    }
    const parsed = JSON.parse(content);
    groupSizes.push(parsed?.intent?.groupSize ?? "?");
    ok++;
  } catch (e) {
    fail++;
    errors.push(String(e.message || e).slice(0, 150));
  }
}

console.log("\n--- probe results ---");
console.log("attempts:", attempts);
console.log("success:", ok);
console.log("failed:", fail);
console.log("success rate:", `${Math.round((ok / attempts) * 100)}%`);
if (groupSizes.length) console.log("groupSize returned:", groupSizes.join(", "));
if (errors.length) {
  console.log("unique errors:");
  for (const err of [...new Set(errors)]) console.log(" -", err);
}
