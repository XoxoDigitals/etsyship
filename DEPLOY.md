# Isolated deploy (won't touch existing services)

This app runs in its **own folder**, its **own Postgres database/user**, its **own PM2
processes** (`etsyship-web`, `etsyship-worker`), its **own port (3100)**, and its **own nginx
server block**. Nothing here modifies anything you already run on the server.

Prerequisites on the server: Node 18+, npm, PostgreSQL, PM2 (`npm i -g pm2`), and (optional for a
public URL) nginx + certbot. Run as a sudo-capable user.

---

## 1. Pick isolated settings (edit these, then paste the block)

```bash
APP_DIR=/var/www/etsyship        # new folder, nothing else lives here
APP_PORT=3100                    # must be free: run `ss -ltnp | grep ":$APP_PORT"` (no output = free)
DB_NAME=etsyship_db              # new database
DB_USER=etsyship                 # new role
DB_PASS="$(openssl rand -hex 16)"  # random DB password
PUBLIC_URL="https://etsyship.yourdomain.com"   # the domain/subdomain you'll point at this app
```

## 2. Create the database + role (isolated; does not touch other DBs)

```bash
sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
CREATE ROLE $DB_USER LOGIN PASSWORD '$DB_PASS';
CREATE DATABASE $DB_NAME OWNER $DB_USER;
SQL
```

## 3. Clone the repo into its own folder

```bash
sudo mkdir -p "$APP_DIR"
sudo chown "$USER":"$USER" "$APP_DIR"
git clone https://github.com/XoxoDigitals/etsyship.git "$APP_DIR"
cd "$APP_DIR"
```

## 4. Create the environment file

```bash
cat > "$APP_DIR/.env" <<ENV
DATABASE_URL="postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME?schema=public"
NEXTAUTH_SECRET="$(openssl rand -base64 32)"
NEXTAUTH_URL="$PUBLIC_URL"
ENCRYPTION_KEY="$(openssl rand -base64 32)"
FX_API_BASE="https://api.frankfurter.app"
CAINIAO_API_BASE="https://global.cainiao.com/global/detail.json"
TRACKING_CRON="0 */6 * * *"
CUSTOMER_TRACKING_PROVIDER="none"
CUSTOMER_TRACKING_API_KEY=""
ALLOW_REGISTRATION="true"
PORT=$APP_PORT
ENV
chmod 600 "$APP_DIR/.env"
```

## 5. Install, migrate, build

```bash
cd "$APP_DIR"
npm ci
npx prisma migrate deploy      # applies committed migrations (safe, no data loss)
npm run build                  # runs `prisma generate` then builds
# Optional: seed an initial admin login (admin@example.com / changeme123 — change it after)
# npm run db:seed
```

## 6. Start with PM2 (isolated process names)

```bash
cd "$APP_DIR"
pm2 start ecosystem.config.js   # starts etsyship-web (:3100) + etsyship-worker
pm2 save                        # persist across reboots
pm2 startup                     # run the one-line command it prints (first time only)
pm2 status                      # confirm both are "online"
```

The app now answers on `http://127.0.0.1:3100`. If you only need local access, you're done.

## 7. (Optional) Public URL via nginx — a NEW server block, existing vhosts untouched

Point DNS for your subdomain (e.g. `etsyship.yourdomain.com`) at the server first.

```bash
sudo tee /etc/nginx/sites-available/etsyship.conf >/dev/null <<NGINX
server {
    listen 80;
    server_name etsyship.yourdomain.com;   # <-- your subdomain
    client_max_body_size 10m;              # allow image uploads

    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
NGINX

sudo ln -s /etc/nginx/sites-available/etsyship.conf /etc/nginx/sites-enabled/etsyship.conf
sudo nginx -t          # validate (only touches the new file)
sudo systemctl reload nginx
```

## 8. (Optional) HTTPS for just this subdomain

```bash
sudo certbot --nginx -d etsyship.yourdomain.com
```

Certbot edits only this subdomain's block. After it issues the cert, make sure
`NEXTAUTH_URL` in `.env` is the `https://` URL, then `pm2 restart etsyship-web`.

---

## Updating later

```bash
cd /var/www/etsyship
git pull
npm ci
npx prisma migrate deploy
npm run build
pm2 restart etsyship-web etsyship-worker
```

## Rollback / remove (clean, leaves other services alone)

```bash
pm2 delete etsyship-web etsyship-worker && pm2 save
sudo rm /etc/nginx/sites-enabled/etsyship.conf && sudo systemctl reload nginx
# DB: sudo -u postgres psql -c "DROP DATABASE etsyship_db;" -c "DROP ROLE etsyship;"
# Files: sudo rm -rf /var/www/etsyship
```
