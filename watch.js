import fs from "fs";
import https from "https";

const THREAD_URL = process.env.THREAD_URL;
const WEBHOOK_URL = process.env.DISCORD_WEBHOOK;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === "https:" ? https : null;
    if (!lib) return reject(new Error("Only https supported"));

    const req = lib.request(
      url,
      { headers: { "User-Agent": UA } },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve({ status: res.statusCode, body: data }));
      }
    );
    req.on("error", reject);
    req.end();
  });
}

function postWebhook(webhookUrl, content) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ content });
    const u = new URL(webhookUrl);

    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          "User-Agent": UA,
        },
      },
      (res) => {
        res.on("data", () => {});
        res.on("end", () => resolve(res.statusCode));
      }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

function getLastState() {
  try {
    return JSON.parse(fs.readFileSync("state.json", "utf8")).last ?? 0;
  } catch {
    return 0;
  }
}

function setLastState(n) {
  fs.writeFileSync("state.json", JSON.stringify({ last: n }, null, 2));
}

// HTML全体から「レス番号っぽい数字」を拾って最大値を取る（簡易）
function extractMaxResNo(html) {
  const matches = html.match(/(^|\n)(\d{1,5})\s/g) || [];
  let max = 0;
  for (const m of matches) {
    const n = parseInt(m.trim(), 10);
    if (!Number.isNaN(n)) max = Math.max(max, n);
  }
  return max;
}

(async () => {
  if (!THREAD_URL || !WEBHOOK_URL) {
    console.error("Missing env THREAD_URL or DISCORD_WEBHOOK");
    process.exit(1);
  }

  const last = getLastState();
  const { status, body } = await fetchText(THREAD_URL);

  if (status !== 200 || !body) {
    console.error("Fetch failed:", status);
    process.exit(2);
  }

  const maxNo = extractMaxResNo(body);

  if (maxNo > last) {
    const delta = maxNo - last;
    const msg = `📢 5ch新着レス検知：${delta}件\n現在レス番号：${maxNo}\n${THREAD_URL}`;
    await postWebhook(WEBHOOK_URL, msg);
    setLastState(maxNo);
    console.log("Notified. Updated last to", maxNo);
  } else {
    console.log("No new posts. last =", last, "max =", maxNo);
  }
})();
