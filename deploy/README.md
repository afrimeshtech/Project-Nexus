# Deploying AfriMesh to afrimeshcommerce.com

One free Oracle Cloud server runs everything: the app, PostgreSQL, and Caddy,
which handles HTTPS. Uploaded photos live on the same server.

| Part | Who | Time |
| --- | --- | --- |
| A. Create the Oracle server | you, in the browser | 20 min |
| B. Point the domain at it | you, on Whogohost | 5 min (plus up to an hour to spread) |
| C. Install and start the site | over SSH | 20 min |

---

## A. Create the Oracle server

1. Sign up at <https://www.oracle.com/cloud/free/>. Pick a **home region** near
   Nigeria: Johannesburg, London or Frankfurt. It cannot be changed later.
2. In the console: **Compute → Instances → Create instance**.
   - **Name:** `afrimesh`
   - **Image:** Canonical **Ubuntu 24.04** (choose the aarch64 build).
   - **Shape:** Ampere, **VM.Standard.A1.Flex**, **2 OCPUs, 12 GB memory**.
     This is inside the Always Free allowance.
   - **Networking:** create a new virtual cloud network with a **public subnet**
     and tick **Assign a public IPv4 address**.
   - **SSH keys:** choose **Generate a key pair for me** and **download the
     private key**. Save it as `C:\Users\<you>\.ssh\afrimesh.key`. Without it you
     cannot get into the server.
   - Click **Create**. If it says **Out of capacity**, pick another
     availability domain or try again later; it is common and temporary.
3. When it is running, copy its **Public IP address**.
4. Open the web ports: on the instance page click the **subnet** → **Security
   Lists** → **Default Security List** → **Add Ingress Rules**:
   - Source CIDR `0.0.0.0/0`, IP protocol **TCP**, destination port **80**
   - Source CIDR `0.0.0.0/0`, IP protocol **TCP**, destination port **443**

Never **terminate** the instance: that deletes the server and its data, and
the public IP changes.

## B. Point the domain at the server (Whogohost)

Client area → **Domains** → `afrimeshcommerce.com` → **Manage DNS** (or DNS
Management). Remove any existing parking `A` records, then add:

| Type | Host | Value |
| --- | --- | --- |
| A | `@` | the server's public IP |
| A | `www` | the server's public IP |

Check it from any computer: `nslookup afrimeshcommerce.com` should print the
server's IP. It can take up to an hour.

## C. Install and start the site

From PowerShell on your laptop:

```sh
ssh -i ~/.ssh/afrimesh.key ubuntu@<public-ip>
```

On the server:

```sh
# 1. Updates, Docker, and the server's own firewall (Oracle's Ubuntu image
#    blocks everything but SSH until told otherwise).
sudo apt update && sudo apt -y upgrade
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
# The ACCEPT rules must sit above the image's catch-all REJECT rule.
n=$(sudo iptables -L INPUT --line-numbers -n | awk '/REJECT/ {print $1; exit}')
sudo iptables -I INPUT $n -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo iptables -I INPUT $n -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo netfilter-persistent save
exit        # log out and back in so the docker group applies
```

```sh
ssh -i ~/.ssh/afrimesh.key ubuntu@<public-ip>

# 2. The code and its settings.
git clone https://github.com/afrimeshtech/Project-Nexus.git afrimesh
cd afrimesh/deploy
cp .env.example .env
openssl rand -hex 24          # copy this: it becomes POSTGRES_PASSWORD
nano .env                     # fill POSTGRES_PASSWORD, save

# 3. Build and start. The first build takes 5-10 minutes.
docker compose up -d --build

# 4. Create the tables, load the demo data, and replace the demo password.
docker compose run --rm tools npm run db:push
docker compose run --rm -e AFRIMESH_ALLOW_REMOTE_DESTRUCTIVE=db tools npm run db:seed
read -rs DEMO_PASSWORD && export DEMO_PASSWORD   # type the new password, 12+ characters
docker compose run --rm -e DEMO_PASSWORD tools npm run db:demo-passwords
unset DEMO_PASSWORD

# 5. Nightly backups at 02:30.
chmod +x backup.sh && mkdir -p ~/backups
(crontab -l 2>/dev/null; echo "30 2 * * * $PWD/backup.sh >> $HOME/backups/backup.log 2>&1") | crontab -
```

Open <https://afrimeshcommerce.com>. The first visit can take a few seconds
while Caddy fetches the certificate.

**Demo sign-ins:** the same emails as on the laptop (`ada@example.ng`,
`grace@gracestores.ng`, `admin@afrimesh.africa`) with the password set in step 4.
The seeded `afrimesh` password no longer works on the live site.

## Day to day

| Task | Command (in `~/afrimesh/deploy`) |
| --- | --- |
| Ship the latest code | `git pull && docker compose up -d --build` |
| Watch the logs | `docker compose logs -f app` |
| Is it healthy? | `curl -s https://afrimeshcommerce.com/api/health?ready` |
| Restart | `docker compose restart app` |
| Restore a backup | `gunzip -c ~/backups/afrimesh-DATE.sql.gz \| docker compose exec -T db psql -U afrimesh afrimesh` (into an empty database) |

Backups stay on the same server. Copy one off now and then (`scp` it to your
laptop) so a lost server is not lost data.

## What is on and off

- **Payments:** test mode (`PAYMENT_PROVIDER=mock`). Orders settle instantly
  and no money moves. Paystack is a settings change later.
- **Sign-in codes:** never shown on screen on the live site. Phone codes are off
  until an SMS provider is added; email codes need Resend with this domain
  verified (`EMAIL_TRANSPORT=resend`). Phone + password sign-up and sign-in work
  without either. Sales reps, who only sign in by phone code, cannot sign in
  until one of these is set up.
- **Delivery, ranking, ratings:** off for the MVP, as in the code.
