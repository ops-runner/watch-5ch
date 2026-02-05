import fs from "fs";
import https from "https";

const THREAD_URL = process.env.THREAD_URL;
const WEBHOOK_URL = process.env.DISCORD_WEBHOOK;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

function fetchText(url, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);

    const req = https.request(
      u,
      {
        method: "GET",
        headers: { "User-Agent": UA },
      },
      (res) => {
        // 301/302/303/307/308 を追従
        const isRedirect = [301, 302, 303, 307, 308].includes(res.statusCode);
        const loc = res.headers.location;

        if (isRedirect && loc) {
          if (redirectsLeft <= 0) {
            return reject(new Error("Too many redirects"));
          }
          const nextUrl = new URL(loc, u).toString();
          res.resume(); // bodyを捨てる
          return resolve({ status: res.statusCode, body: data, finalUrl: u.toString() });
        }

        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve({ status: res.statusCode, body: data, finalUrl: u.toString() });
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
  // パターン1: 5chのread.cgiでよくある <dt>123 ：... 形式
  const dtMatches = [...html.matchAll(/<dt>\s*(\d{1,5})\s*[^0-9]/g)];
  let max = 0;
  for (const m of dtMatches) {
    const n = parseInt(m[1], 10);
    if (!Number.isNaN(n)) max = Math.max(max, n);
  }
  if (max > 0) return max;

  // パターン2: 念のため「レス番号っぽい」数字も広めに拾う
  const generic = [...html.matchAll(/(^|\n)\s*(\d{1,5})\s*[：:]/g)];
  for (const m of generic) {
    const n = parseInt(m[2], 10);
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
  const { status, body, finalUrl } = await fetchText(THREAD_URL);
  console.log("DEBUG finalUrl:", finalUrl);


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

    if (maxNo === 0) {
    console.log("DEBUG status:", status);
    console.log("DEBUG body head:", body.slice(0, 300).replace(/\s+/g, " "));
  }

})();
