# Remote Deployment Guide

This guide covers deploying notify-service to a remote Linux server with systemd, nginx, and SSL.

## Prerequisites

### SSH Key for Automation

SSH keys with passphrases don't work in non-interactive contexts (CI/CD, Claude Code, cron jobs). Create a dedicated passphrase-less key:

```bash
# Generate passphrase-less key
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519_automation -N ''

# Copy public key to server
cat ~/.ssh/id_ed25519_automation.pub
# Add this to server's ~/.ssh/authorized_keys

# Test connection
ssh -i ~/.ssh/id_ed25519_automation deploy@your-server
```

### Server Requirements

- Linux server (Ubuntu/Debian recommended)
- sudo access for systemd and nginx configuration
- Domain with DNS pointing to server (via Cloudflare or other DNS provider)
- Existing SSL certificate (optional - certbot can create one)

## Deployment Steps

### 1. Install Bun Runtime

```bash
ssh -i ~/.ssh/id_ed25519_automation deploy@your-server

# Install Bun
curl -fsSL https://bun.sh/install | bash

# Note the full path (needed for systemd)
# Usually: ~/.bun/bin/bun or /home/deploy/.bun/bin/bun

# Verify
~/.bun/bin/bun --version
```

### 2. Deploy Service Code

```bash
# Option A: Clone from git
cd /opt
sudo mkdir notify-service
sudo chown deploy:deploy notify-service
git clone https://github.com/your-repo/notify-service.git

# Option B: Copy from local machine
scp -i ~/.ssh/id_ed25519_automation -r ./notify-service deploy@server:/opt/
```

### 3. Install Dependencies

```bash
cd /opt/notify-service
~/.bun/bin/bun install
```

### 4. Create Configuration

Create `~/.claude-notify/config.json` on the server:

```bash
mkdir -p ~/.claude-notify
cat > ~/.claude-notify/config.json << 'EOF'
{
  "version": "1.0.0",
  "server": {
    "port": 7777,
    "host": "0.0.0.0",
    "publicUrl": "https://notify.yourdomain.com"
  },
  "channels": {
    "tts": {
      "enabled": true,
      "apiKey": "your-elevenlabs-api-key",
      "voiceId": "21m00Tcm4TlvDq8ikWAM",
      "model": "eleven_turbo_v2_5"
    },
    "discord": {
      "enabled": true,
      "webhookUrl": "https://discord.com/api/webhooks/...",
      "username": "Claude Code"
    }
  },
  "summarization": {
    "enabled": true,
    "apiKey": "your-openrouter-or-anthropic-key",
    "apiUrl": "https://openrouter.ai/api/v1",
    "model": "anthropic/claude-3-haiku"
  }
}
EOF
```

### 5. Create systemd Service

Create `/etc/systemd/system/notify-service.service`:

```bash
sudo tee /etc/systemd/system/notify-service.service << 'EOF'
[Unit]
Description=Claude Notify Service
After=network.target

[Service]
Type=simple
User=deploy
WorkingDirectory=/opt/notify-service
Environment=REQUIRE_AUTH=true
ExecStart=/home/deploy/.bun/bin/bun run src/server.ts
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable notify-service
sudo systemctl start notify-service

# Check status
sudo systemctl status notify-service

# View logs
sudo journalctl -u notify-service -f
```

### 6. Configure nginx Reverse Proxy

Create `/etc/nginx/sites-available/notify`:

```bash
sudo tee /etc/nginx/sites-available/notify << 'EOF'
server {
    listen 80;
    server_name notify.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name notify.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:7777;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_read_timeout 86400;
    }
}
EOF

# Enable site
sudo ln -s /etc/nginx/sites-available/notify /etc/nginx/sites-enabled/

# Test config
sudo nginx -t

# Reload
sudo nginx -s reload
```

### 7. SSL Certificate

If adding a subdomain to an existing certificate:

```bash
# Expand existing cert to include new subdomain
sudo certbot certonly --expand --nginx \
  -d yourdomain.com \
  -d api.yourdomain.com \
  -d notify.yourdomain.com
```

For a new certificate:

```bash
sudo certbot --nginx -d notify.yourdomain.com
```

### 8. Create SDK Keys (if auth enabled)

Create separate keys for different clients:

```bash
cd /opt/notify-service

# Key for hooks running on this server
~/.bun/bin/bun run src/admin-cli.ts key create --name "server-hooks"
# Output: Created SDK key: sk_live_xxxxxxxxxxxxx (SAVE THIS!)

# Key for remote clients (e.g., your local machine)
~/.bun/bin/bun run src/admin-cli.ts key create --name "macbook-pro"
# Output: Created SDK key: sk_live_yyyyyyyyyyyyy (SAVE THIS!)

# List all keys
~/.bun/bin/bun run src/admin-cli.ts key list
```

### 9. Configure Hooks on Same Server

**IMPORTANT**: If Claude Code runs on the same server as notify-service, the hooks need an SDK key to authenticate with the local server.

Add `sdkKey` to the server's `~/.claude-notify/config.json`:

```bash
# Add sdkKey to existing config
jq '.sdkKey = "sk_live_xxxxxxxxxxxxx"' ~/.claude-notify/config.json > /tmp/config.json \
  && mv /tmp/config.json ~/.claude-notify/config.json
```

The hooks will use `http://127.0.0.1:7777` by default when `remoteUrl` is not set.

### 10. Configure Remote Clients

For machines connecting remotely, update their `~/.claude-notify/config.json`:

```json
{
  "remoteUrl": "https://notify.yourdomain.com",
  "sdkKey": "sk_live_yyyyyyyyyyyyy"
}
```

## Verification

### Health Check

```bash
curl https://notify.yourdomain.com/health
# Expected: {"status":"ok","version":"1.0.0"}
```

### Test Notification (with auth)

```bash
# Write JSON to file (avoids shell quoting issues)
cat > /tmp/test-notify.json << 'EOF'
{
  "project": "test",
  "summary": "Test notification from deployment",
  "channels": ["discord"]
}
EOF

# Send with auth header
curl -X POST \
  -H "Authorization: Bearer sk_live_xxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d @/tmp/test-notify.json \
  https://notify.yourdomain.com/notify
```

## Troubleshooting

### Service won't start

```bash
# Check logs
sudo journalctl -u notify-service -n 50

# Common issues:
# - Wrong bun path in ExecStart
# - Missing config file
# - Port already in use
```

### Auth not working

```bash
# Verify REQUIRE_AUTH is set
sudo systemctl show notify-service | grep Environment

# Check if key exists
~/.bun/bin/bun run src/admin-cli.ts list
```

### SSL certificate issues

```bash
# Check cert status
sudo certbot certificates

# Renew if needed
sudo certbot renew
```

### JSON corruption over SSH

When sending JSON via curl over SSH, shell quoting corrupts the data. Always write JSON to a file first:

```bash
# WRONG - will fail with "Invalid JSON body"
ssh server 'curl -d "{\"key\": \"value\"}" http://localhost/api'

# CORRECT - use temp file
ssh server 'cat > /tmp/data.json << EOF
{"key": "value"}
EOF
curl -d @/tmp/data.json http://localhost/api'
```

## Maintenance

### Restart Service

```bash
sudo systemctl restart notify-service
```

### Update Code

```bash
cd /opt/notify-service
git pull
~/.bun/bin/bun install
sudo systemctl restart notify-service
```

### Rotate SDK Key

```bash
# Create new key
~/.bun/bin/bun run src/admin-cli.ts create new-client

# Update clients with new key

# Revoke old key
~/.bun/bin/bun run src/admin-cli.ts revoke old-key-prefix
```

### View Active Keys

```bash
~/.bun/bin/bun run src/admin-cli.ts list
```
