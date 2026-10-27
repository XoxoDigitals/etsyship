# Dropship Ops

A web platform to run dropshipping **Etsy / eBay** stores: per-store environments, listings (with best-effort AliExpress import), orders with supplier-purchase tracking, automatic parcel tracking (Cainiao + customer carriers), multi-currency profit, and analytics.

Built with **Next.js 14 (App Router)**, **TypeScript**, **PostgreSQL + Prisma**, **NextAuth** (credentials), **Tailwind**, and a **Node cron worker** for background tracking sync.

---

## Features

- **Auth** — email/password accounts (bcrypt, 12 rounds), JWT sessions, per-user data isolation, self-registration toggle.
- **Stores (environments)** — each store has its own platform, selling currency (USD/GBP/EUR), and fee %.
- **Listings** — add an AliExpress URL and *try* to auto-fetch title/images/variants/price; always falls back to manual entry. Supplier price **and** your listed price, with margin preview.
- **Orders** — create an order, add products from your listings (with variant + your selling price), capture customer details.
  - Move to **Processing** when you buy from the supplier: record **buying price** (in whatever currency you paid), the **supplier account email** you used (stored encrypted), the supplier order number, and the **Cainiao tracking number**.
  - Add the **customer-facing tracking** (FedEx/USPS/UPS/DHL) you give the buyer.
  - Full order **timeline** + line-item snapshots.
- **Automatic tracking** — a worker refreshes every undelivered parcel **every 6 hours**:
  - **Supplier leg** via Cainiao Global (the AliExpress tracking you asked for).
  - **Customer leg** via a pluggable provider (AfterShip / TrackingMore) or a live deep-link when none is configured.
- **Multi-currency** — stores sell in USD/GBP/EUR; supplier purchases can be in a different currency and are **auto-converted** (ECB rates via Frankfurter, cached) so profit is always shown in the store's currency. The FX rate used is snapshotted on each purchase.
- **Analytics** — revenue, cost, fees, profit, margin, order-status breakdown, revenue/profit over time, top listings, and parcel status.
- **Security extras** — encrypted supplier-email vault (AES-256-GCM), audit log, input validation (Zod) on every endpoint, tenancy checks on every store/order, soft-deletes.

---

## Local development

```bash
# 1. Install deps
npm install

# 2. Configure env
cp .env.example .env
#   - set DATABASE_URL to your Postgres
#   - generate secrets:  openssl rand -base64 32   (NEXTAUTH_SECRET and ENCRYPTION_KEY)

# 3. Create the database schema
npx prisma migrate dev --name init

# 4. (optional) seed a demo admin + store
npm run db:seed          # prints the login it created

# 5. Run the app and the tracking worker (two terminals)
npm run dev              # http://localhost:3000
npm run worker:dev       # background tracking sync
```

> `ENCRYPTION_KEY` must decode (base64) to exactly 32 bytes. If you rotate it, previously stored supplier emails can no longer be decrypted.

---

## Production deploy on a VPS (no Docker)

Assumes Ubuntu + a non-root user. Adjust paths as needed.

### 1. System packages
```bash
sudo apt update
sudo apt install -y postgresql nginx
# Node 20+ (via nodesource or nvm)
```

### 2. PostgreSQL
```bash
sudo -u postgres psql
CREATE DATABASE dropship_ops;
CREATE USER dropship WITH PASSWORD 'a-strong-password';
GRANT ALL PRIVILEGES ON DATABASE dropship_ops TO dropship;
\q
```

### 3. App
```bash
git clone <your repo> /var/www/dropship && cd /var/www/dropship
cp .env.example .env    # fill in real values; set NEXTAUTH_URL=https://yourdomain
#   DATABASE_URL="postgresql://dropship:...@localhost:5432/dropship_ops?schema=public"
#   set ALLOW_REGISTRATION=false after you create your account
npm ci
npx prisma migrate deploy
npm run build
```

### 4. Run with PM2 (app + worker)
```bash
sudo npm i -g pm2
pm2 start "npm run start" --name dropship-web
pm2 start "npm run worker" --name dropship-worker
pm2 save
pm2 startup        # follow the printed command so it survives reboots
```

The worker runs continuously and syncs tracking on the `TRACKING_CRON` schedule (default every 6h).
**Alternatively**, instead of the long-running worker you can hit the secured endpoint from system cron:

```bash
# set CRON_SECRET in .env, then:
# crontab -e
0 */6 * * * curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" https://yourdomain/api/cron/sync-tracking
```

### 5. Nginx reverse proxy + HTTPS
```nginx
server {
  server_name yourdomain.com;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```
Then run `sudo certbot --nginx -d yourdomain.com` for TLS.

---

## Customer-carrier tracking (FedEx / USPS / UPS)

There is no reliable free API for these carriers. Out of the box the app:
- auto-detects the carrier from the tracking number,
- shows a working deep-link to the carrier's own tracking page.

To get real status + events in-app, set in `.env`:
```
CUSTOMER_TRACKING_PROVIDER=aftership        # or trackingmore
CUSTOMER_TRACKING_API_KEY=your_key
```
The supplier (Cainiao/AliExpress) leg needs no key.

---

## Notes & honest limitations

- **AliExpress import is best-effort.** AliExpress aggressively blocks scraping; when it fails the form falls back to manual entry (expected most of the time). Supplier/dropshipping APIs require approval and can be slotted into `src/lib/aliexpress.ts`.
- **Cainiao** is read via its public Global tracking JSON endpoint; if Cainiao changes it, update `src/lib/tracking/cainiao.ts`.
- FX uses ECB daily reference rates (good for accounting, not a live trading rate).
