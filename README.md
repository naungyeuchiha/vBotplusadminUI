# Viber One-Way Bot with Password-Protected Admin UI (Render)

This project hosts a Viber announcement bot on Render with a **password-protected admin web UI** to broadcast messages.

## Features
- One-way channel: hides user input and ignores free text.
- Stores subscribers locally (persisted on Render Disk `/data`).
- Admin UI at `/admin` (login required).
- Broadcast to all subscribers (auto-batches by 300).
- Webhook set/unset buttons in the UI.
- Optional HMAC signature verification from Viber (commented code).

## Quick Start (Render)
1. Push this repo to GitHub.
2. Create a **New → Web Service** in Render → connect your repo.
3. **Build Command**: `npm install`
4. **Start Command**: `npm start`
5. Environment Variables:
   - `VIBER_TOKEN` = your Viber bot token
   - `SENDER_NAME` = (optional) display name for messages
   - `ADMIN_PASSWORD` = password for `/admin`
   - `SESSION_SECRET` = any random long string (for signed cookies)
6. (Recommended) **Add a Disk** → name: `bot-data`, size: `1 GB`, **mount path**: `/data`
7. Deploy. Render sets `RENDER_EXTERNAL_URL` automatically.
8. Once live, visit `https://<your-service>.onrender.com/admin` → login.
9. Click **Set Webhook** (or it may auto-set on boot).

## Local dev
```bash
npm install
export VIBER_TOKEN=xxx
export ADMIN_PASSWORD=your-strong-password
export SESSION_SECRET=$(openssl rand -hex 32)
npm start
```

Open: http://localhost:10000/admin
