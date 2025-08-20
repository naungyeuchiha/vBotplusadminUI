import express from "express";
import axios from "axios";
import crypto from "crypto";
import cookieParser from "cookie-parser";
import fs from "fs";
import path from "path";

// ========== ENV ==========
const VIBER_TOKEN   = process.env.VIBER_TOKEN;             // required
const SENDER_NAME   = process.env.SENDER_NAME || "Announcements";
const PORT          = process.env.PORT || 10000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";   // required for admin login
const SESSION_SECRET = process.env.SESSION_SECRET || "change-me"; // required for signed cookies

// Render provides this automatically in production
const EXTERNAL_URL  = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || "";

// Persist subscribers to a file; use /data if a Render Disk is attached
const SUBSCRIBERS_PATH = process.env.SUBSCRIBERS_PATH || (fs.existsSync("/data") ? "/data/subscribers.json" : "./subscribers.json");

if (!VIBER_TOKEN) {
  console.error("Missing VIBER_TOKEN env var.");
  process.exit(1);
}
if (!ADMIN_PASSWORD) {
  console.error("Missing ADMIN_PASSWORD env var.");
  process.exit(1);
}
if (SESSION_SECRET === "change-me") {
  console.warn("WARNING: Using default SESSION_SECRET. Set SESSION_SECRET env var for production.");
}

// ========== STORAGE ==========
function readSubscribers() {
  try {
    const raw = fs.readFileSync(SUBSCRIBERS_PATH, "utf-8");
    const ids = JSON.parse(raw);
    return new Set(Array.isArray(ids) ? ids : []);
  } catch (_) {
    return new Set();
  }
}
function writeSubscribers(set) {
  const arr = Array.from(set);
  fs.mkdirSync(path.dirname(SUBSCRIBERS_PATH), { recursive: true });
  fs.writeFileSync(SUBSCRIBERS_PATH, JSON.stringify(arr, null, 2));
}
const subscribers = readSubscribers();

// ========== VIBER HELPERS ==========
const viber = axios.create({
  baseURL: "https://chatapi.viber.com/pa",
  headers: { "X-Viber-Auth-Token": VIBER_TOKEN }
});

const READ_ONLY_KEYBOARD = {
  Type: "keyboard",
  DefaultHeight: true,
  InputFieldState: "hidden",
  Buttons: [
    {
      Columns: 6,
      Rows: 1,
      ActionType: "reply",
      ActionBody: "noop",
      Text: "🔔 Announcements only",
      TextHAlign: "center",
      TextVAlign: "middle"
    }
  ]
};

async function sendText(receiver, text) {
  return viber.post("/send_message", {
    receiver,
    type: "text",
    text,
    sender: { name: SENDER_NAME },
    keyboard: READ_ONLY_KEYBOARD
  });
}

async function broadcastText(text) {
  const all = Array.from(subscribers);
  const chunkSize = 300; // Viber broadcast limit per request
  for (let i = 0; i < all.length; i += chunkSize) {
    const chunk = all.slice(i, i + chunkSize);
    await viber.post("/broadcast_message", {
      broadcast_list: chunk,
      type: "text",
      text,
      sender: { name: SENDER_NAME },
      keyboard: READ_ONLY_KEYBOARD
    });
  }
}

async function setWebhook(url) {
  return viber.post("/set_webhook", {
    url,
    event_types: ["message", "subscribed", "unsubscribed", "conversation_started"]
  });
}
async function unsetWebhook() {
  return viber.post("/set_webhook", { url: "" });
}

// ========== APP ==========
const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf; }
}));
app.use(cookieParser(SESSION_SECRET));
app.use("/static", express.static("public"));

// Optional Viber request signature verification
function verifySignature(req) {
  const signature = req.get("X-Viber-Content-Signature");
  if (!signature) return false;
  const h = crypto.createHmac("sha256", VIBER_TOKEN).update(req.rawBody).digest("hex");
  return h === signature;
}

// ---------- Basic routes ----------
app.get("/", (_req, res) => res.send("ok"));

// ---------- Admin auth helpers ----------
function isAuthed(req) {
  return req.signedCookies && req.signedCookies.admin_auth === "1";
}
function requireAdmin(req, res, next) {
  if (!isAuthed(req)) return res.redirect("/admin/login");
  next();
}

// ---------- Admin UI ----------
app.get("/admin/login", (req, res) => {
  if (isAuthed(req)) return res.redirect("/admin");
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Viber Bot Admin – Login</title>
  <link rel="stylesheet" href="/static/admin.css" />
</head>
<body class="bg">
  <div class="card">
    <div class="brand">
      <div class="logo">V</div>
      <div class="title">
        <h1>Viber Bot Admin</h1>
        <p class="subtitle">Secure access</p>
      </div>
    </div>
    <form method="POST" action="/admin/login" class="form">
      <label>Password</label>
      <input type="password" name="password" placeholder="Enter admin password" required />
      <button type="submit" class="btn">Sign in</button>
    </form>
  </div>
</body>
</html>`);
});

app.post("/admin/login", (req, res) => {
  const { password } = req.body || {};
  if (typeof password === "string" && password === ADMIN_PASSWORD) {
    // 7 days
    res.cookie("admin_auth", "1", {
      signed: true,
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000
    });
    return res.redirect("/admin");
  }
  return res.status(401).send(`<!DOCTYPE html>
<html><head>
  <meta charset="utf-8"><title>Login failed</title>
  <link rel="stylesheet" href="/static/admin.css" />
</head>
<body class="bg">
  <div class="card">
    <h2 style="color:#fff;margin-top:0">Login failed</h2>
    <p style="color:#eee">Wrong password.</p>
    <a href="/admin/login" class="btn">Try again</a>
  </div>
</body></html>`);
});

app.post("/admin/logout", (req, res) => {
  res.clearCookie("admin_auth");
  res.redirect("/admin/login");
});

app.get("/admin", requireAdmin, (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Viber Bot Admin</title>
  <link rel="stylesheet" href="/static/admin.css" />
</head>
<body class="bg">
  <div class="nav">
    <div class="brand-mini">
      <div class="logo">V</div>
      <span>Viber Bot Admin</span>
    </div>
    <form method="POST" action="/admin/logout">
      <button type="submit" class="link">Logout</button>
    </form>
  </div>

  <div class="wrap">
    <div class="panel">
      <h2>Broadcast Message</h2>
      <p class="muted">Send an announcement to all subscribers. The input field is hidden for users; this is one-way only.</p>
      <textarea id="msg" placeholder="Type your announcement..."></textarea>
      <div class="actions">
        <button id="send" class="btn">Send Broadcast</button>
        <span id="status" class="status"></span>
      </div>
    </div>

    <div class="stats">
      <div class="stat-card">
        <div class="stat-number" id="subCount">–</div>
        <div class="stat-label">Subscribers</div>
      </div>
      <div class="stat-card">
        <div class="stat-number" id="webhookState">–</div>
        <div class="stat-label">Webhook</div>
      </div>
    </div>

    <div class="panel">
      <h3>Webhook Tools</h3>
      <p class="muted">If your external URL changed, you can re-set the webhook from here.</p>
      <div class="row">
        <button id="setWebhook" class="btn secondary">Set Webhook</button>
        <button id="unsetWebhook" class="btn danger">Unset Webhook</button>
      </div>
    </div>
  </div>

  <script>
    async function fetchJSON(url, opts) {
      const res = await fetch(url, opts);
      return res.json();
    }
    async function refreshStats() {
      const stats = await fetchJSON("/admin/stats");
      document.getElementById("subCount").innerText = stats.subscribers ?? "0";
      document.getElementById("webhookState").innerText = stats.webhook?.url ? "Active" : "Not set";
    }
    document.getElementById("send").addEventListener("click", async () => {
      const text = document.getElementById("msg").value.trim();
      if (!text) { alert("Message cannot be empty"); return; }
      const res = await fetch("/admin/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });
      const data = await res.json();
      const status = document.getElementById("status");
      if (data.ok) {
        status.textContent = "✅ Sent to " + data.sent_to + " subscribers";
        document.getElementById("msg").value = "";
        refreshStats();
      } else {
        status.textContent = "❌ " + (data.error || "Unknown error");
      }
      setTimeout(() => status.textContent = "", 6000);
    });

    document.getElementById("setWebhook").addEventListener("click", async () => {
      const res = await fetch("/admin/set-webhook");
      const data = await res.json();
      alert(data.ok ? ("Webhook set to: " + data.set_to) : ("Failed: " + (data.error || "unknown")));
      refreshStats();
    });
    document.getElementById("unsetWebhook").addEventListener("click", async () => {
      const res = await fetch("/admin/unset-webhook", { method: "POST" });
      const data = await res.json();
      alert(data.ok ? "Webhook removed" : ("Failed: " + (data.error || "unknown")));
      refreshStats();
    });

    refreshStats();
  </script>
</body>
</html>`);
});

// ---------- Admin APIs (session protected) ----------
app.get("/admin/stats", requireAdmin, async (req, res) => {
  try {
    // Query current webhook state
    let webhook = {};
    try {
      const r = await viber.post("/get_account_info", {});
      webhook = { url: r?.data?.status_message?.includes("ok") ? (EXTERNAL_URL ? EXTERNAL_URL + "/webhook" : "") : "" };
    } catch (_) {}
    res.json({ subscribers: subscribers.size, webhook });
  } catch (e) {
    res.status(500).json({ error: e?.response?.data || e.message });
  }
});

app.post("/admin/broadcast", requireAdmin, async (req, res) => {
  const text = (req.body && req.body.text || "").toString().trim();
  if (!text) return res.status(400).json({ ok: false, error: "missing text" });
  try {
    await broadcastText(text);
    res.json({ ok: true, sent_to: subscribers.size });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.response?.data || e.message });
  }
});

// Secure webhook management
app.get("/admin/set-webhook", requireAdmin, async (_req, res) => {
  try {
    const base = EXTERNAL_URL;
    if (!base) return res.status(400).json({ ok: false, error: "PUBLIC_URL/RENDER_EXTERNAL_URL not set" });
    const url = base.replace(/\/+$/, "") + "/webhook";
    const r = await setWebhook(url);
    res.json({ ok: true, set_to: url, viber: r.data });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.response?.data || e.message });
  }
});
app.post("/admin/unset-webhook", requireAdmin, async (_req, res) => {
  try {
    const r = await unsetWebhook();
    res.json({ ok: true, viber: r.data });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.response?.data || e.message });
  }
});

// ---------- Viber Webhook ----------
app.post("/webhook", async (req, res) => {
  // To enforce, uncomment:
  // if (!verifySignature(req)) return res.sendStatus(403);

  const { event } = req.body || {};
  res.status(200).json({ status: 0 }); // Acknowledge quickly

  try {
    if (event === "webhook") return;

    if (event === "conversation_started") {
      const { user, subscribed } = req.body;
      if (subscribed) {
        subscribers.add(user.id);
        writeSubscribers(subscribers);
      }
      await sendText(user.id, "Hi! This channel sends announcements only. You can't type here.");
      return;
    }

    if (event === "subscribed") {
      const { user } = req.body;
      subscribers.add(user.id);
      writeSubscribers(subscribers);
      await sendText(user.id, "Thanks for subscribing! You'll get announcements here.");
      return;
    }

    if (event === "unsubscribed") {
      const { user_id } = req.body;
      if (subscribers.delete(user_id)) writeSubscribers(subscribers);
      return;
    }

    if (event === "message") {
      const { sender } = req.body;
      if (sender?.id) {
        subscribers.add(sender.id);
        writeSubscribers(subscribers);
        await sendText(sender.id, "This chat is read-only. You'll receive announcements only.");
      }
      return;
    }
  } catch (err) {
    console.error("Webhook handler error:", err?.response?.data || err);
  }
});

// ---------- Start ----------
app.listen(PORT, () => {
  console.log(`Server on :${PORT}`);
  if (EXTERNAL_URL) {
    const url = EXTERNAL_URL.replace(/\/+$/, "") + "/webhook";
    setWebhook(url).then(() => console.log("Webhook set to", url))
      .catch(err => console.warn("Set webhook failed:", err?.response?.data || err.message));
  } else {
    console.log("Set PUBLIC_URL to auto-configure webhook on boot (Render sets RENDER_EXTERNAL_URL).");
  }
});
