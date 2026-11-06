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
| Prove the backup restores | from the laptop: `GNUPGHOME=~/.afrimesh-backup-key deploy/restore-test.sh` |
| Restore for real | see **Backups → Restoring** below |

## Backups

Every night at 02:30 `backup.sh` dumps the database, compresses it, **encrypts
it** and keeps 14 days in `~/backups` - then sends a copy **off the server**
to an Oracle Object Storage bucket. A run that cannot do all of that ends with
a `FAILED:` line in `~/backups/backup.log`.

**Encryption.** The server holds only the backup *public* key, so it can
encrypt a backup but never decrypt one: someone who breaks into the server
cannot read old backups. The private key is on the laptop in
`~/.afrimesh-backup-key` (`afrimesh-backup-PRIVATE.asc`). Keep a second copy
of that file in a password manager. **Without it no backup can ever be
restored.**

**Off-site.** The bucket is written using the VM's own identity (an Oracle
"instance principal"), so no access key is stored on the server. The policy
lets the server *add* backups and nothing else, so a compromised server cannot
delete the off-site copies.

### One-time setup

1. **Bucket** - Oracle console → Storage → Buckets → *Create bucket*:
   name `afrimesh-backups`, Standard tier, in the root compartment. Leave it
   private. Note the **namespace** shown on the bucket page.
2. **Dynamic group** - Identity & Security → Domains → *Default* → Dynamic
   groups → *Create*: name `afrimesh-backup`, rule
   `instance.id = '<the VM's OCID>'`.
3. **Policy** - Identity & Security → Policies (root compartment) → *Create*,
   name `afrimesh-backup`, with these two statements:

   ```
   Allow dynamic-group 'Default'/'afrimesh-backup' to read buckets in tenancy where target.bucket.name = 'afrimesh-backups'
   Allow dynamic-group 'Default'/'afrimesh-backup' to manage objects in tenancy where all {target.bucket.name = 'afrimesh-backups', any {request.permission = 'OBJECT_CREATE', request.permission = 'OBJECT_INSPECT'}}
   ```
4. **rclone** on the server (Ubuntu's package is too old for Oracle's
   instance-principal sign-in). The release is pinned and checked against its
   published checksum:

   ```sh
   V=v1.68.2; cd "$(mktemp -d)"
   curl -fsSLO https://github.com/rclone/rclone/releases/download/$V/rclone-$V-linux-arm64.zip
   curl -fsSLO https://github.com/rclone/rclone/releases/download/$V/SHA256SUMS
   grep " rclone-$V-linux-arm64.zip$" SHA256SUMS | sha256sum -c -
   python3 -m zipfile -e rclone-$V-linux-arm64.zip .
   sudo install -m 0755 rclone-$V-linux-arm64/rclone /usr/local/bin/rclone
   ```
5. **rclone remote** - no secrets in it:

   ```sh
   rclone config create oos oracleobjectstorage provider=instance_principal_auth \
     namespace=<namespace> compartment=<tenancy OCID> region=uk-london-1
   ```
6. **Settings** in `deploy/.env`:

   ```
   BACKUP_GPG_RECIPIENT=<backup key fingerprint>
   BACKUP_REMOTE=oos:afrimesh-backups
   ```

   then run `./backup.sh` once and check its last line says `off-site copy`.

### Restoring

On the laptop, decrypt the backup you want (from `~/backups` on the server, or
from the bucket if the server is gone) and load it into an **empty** database:

```sh
GNUPGHOME=~/.afrimesh-backup-key gpg --decrypt afrimesh-<time>.sql.gz.gpg \
  | ssh -i ~/.ssh/afrimesh.key ubuntu@<server> \
      'cd ~/afrimesh/deploy && gunzip | docker compose exec -T db psql -U afrimesh afrimesh'
```

The database is recoverable to the last nightly backup: up to 24 hours of
activity can be lost (the recovery point). Run `restore-test.sh` after any
change to the backup setup, and monthly otherwise.

## What is on and off

- **Payments:** test mode (`PAYMENT_PROVIDER=mock`). Orders settle instantly
  and no money moves. Paystack is a settings change later.
- **Sign-in codes:** never shown on screen on the live site. Phone codes are off
  until an SMS provider is added; email codes need Resend with this domain
  verified (`EMAIL_TRANSPORT=resend`). Phone + password sign-up and sign-in work
  without either. Sales reps, who only sign in by phone code, cannot sign in
  until one of these is set up.
- **Delivery, ranking, ratings:** off for the MVP, as in the code.
