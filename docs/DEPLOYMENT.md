# Deployment Guide

Complete deployment instructions for AmarktAI Marketing.

## Prerequisites

### Docker Deployment (Recommended)
- Docker 24.0+
- Docker Compose v2.20+
- Domain name (for production)

### Manual Deployment
- Node.js 20+
- PostgreSQL 16
- Redis 7
- npm 10+
- Nginx (for reverse proxy)

## Quick Start with Docker

### 1. Clone Repository

```bash
git clone https://github.com/amarktai/marketing.git
cd marketing
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```bash
# Required: Generate secure secrets
JWT_SECRET=$(openssl rand -base64 64)
JWT_REFRESH_SECRET=$(openssl rand -base64 64)
ENCRYPTION_KEY=$(openssl rand -hex 32)

# Database
POSTGRES_USER=amarktai
POSTGRES_PASSWORD=your_secure_password
POSTGRES_DB=amarktai_marketing
DATABASE_URL=postgresql://amarktai:your_secure_password@postgres:5432/amarktai_marketing

# Redis
REDIS_PASSWORD=your_redis_password
REDIS_URL=redis://:your_redis_password@redis:6379

# Application
APP_URL=https://marketing.amarktai.co.za
API_URL=https://marketing.amarktai.co.za/api
CORS_ORIGIN=https://marketing.amarktai.co.za
NODE_ENV=production

# AI Providers (at least one required)
GENX_API_KEY=your_genx_api_key
TOGETHER_API_KEY=your_together_api_key
DEEPINFRA_API_KEY=your_deepinfra_api_key

# First Run
FIRST_RUN=true
```

### 3. Build and Start

```bash
docker compose -f docker/docker-compose.yml up -d
```

### 4. Verify Services

```bash
# Check all services are running
docker compose -f docker/docker-compose.yml ps

# Check logs
docker compose -f docker/docker-compose.yml logs -f api
docker compose -f docker/docker-compose.yml logs -f web
```

### 5. Access Application

- **Frontend:** http://localhost:3000
- **API:** http://localhost:4000
- **Nginx:** http://localhost:80

The onboarding wizard will appear on first visit.

## Manual Deployment

### 1. Install Dependencies

#### Node.js 20+

```bash
# Using nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 20
nvm use 20

# Or using apt (Ubuntu)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

#### PostgreSQL 16

```bash
# Ubuntu/Debian
sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -
sudo apt-get update
sudo apt-get install postgresql-16

# Create database and user
sudo -u postgres psql
CREATE USER amarktai WITH PASSWORD 'your_secure_password';
CREATE DATABASE amarktai_marketing OWNER amarktai;
\q
```

#### Redis 7

```bash
# Ubuntu/Debian
sudo apt-get install redis-server

# Configure password
sudo vim /etc/redis/redis.conf
# Add: requirepass your_redis_password
sudo systemctl restart redis
```

### 2. Clone and Configure

```bash
git clone https://github.com/amarktai/marketing.git
cd marketing

npm install

cp .env.example .env
# Edit .env with your configuration
```

### 3. Run Database Migrations

```bash
npm run db:migrate
```

### 4. Seed Initial Data (Optional)

```bash
npm run db:seed
```

### 5. Build Applications

```bash
npm run build
```

### 6. Start Services

#### Development

```bash
npm run dev
```

#### Production

```bash
# Start API
cd apps/api
npm run start &

# Start Web
cd apps/web
npm run start &
```

Or use PM2:

```bash
npm install -g pm2

pm2 start apps/api/dist/server.js --name amarktai-api
pm2 start apps/web --name amarktai-web

pm2 save
pm2 startup
```

## SSL/TLS Configuration with Nginx

### 1. Install Certbot

```bash
sudo apt-get install certbot python3-certbot-nginx
```

### 2. Obtain SSL Certificate

```bash
sudo certbot --nginx -d marketing.amarktai.co.za
```

### 3. Nginx Configuration

Create `/etc/nginx/sites-available/marketing.amarktai.co.za`:

```nginx
server {
    listen 80;
    server_name marketing.amarktai.co.za;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name marketing.amarktai.co.za;

    ssl_certificate /etc/letsencrypt/live/marketing.amarktai.co.za/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/marketing.amarktai.co.za/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    client_max_body_size 20m;

    # Health check
    location /health {
        access_log off;
        return 200 '{"status":"ok"}';
        add_header Content-Type application/json;
    }

    # API
    location /api/ {
        proxy_pass http://localhost:4000/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }

    # Static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # Next.js static
    location /_next/static/ {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # Web
    location / {
        proxy_pass http://localhost:3000;
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

### 4. Enable Site

```bash
sudo ln -s /etc/nginx/sites-available/marketing.amarktai.co.za /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 5. Auto-renewal

```bash
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

## Domain Configuration

### DNS Records

Configure the following DNS records for `marketing.amarktai.co.za`:

```
Type  | Name      | Value
------|-----------|---------------------------
A     | marketing | <your-server-ip>
CNAME | www       | marketing.amarktai.co.za
```

### Environment Variables

Update `.env` with your domain:

```bash
APP_URL=https://marketing.amarktai.co.za
API_URL=https://marketing.amarktai.co.za/api
CORS_ORIGIN=https://marketing.amarktai.co.za
```

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | Yes | `development` | Environment mode |
| `PORT` | No | `4000` | API server port |
| `APP_URL` | Yes | `http://localhost:3000` | Frontend URL |
| `API_URL` | Yes | `http://localhost:4000` | Backend URL |
| `DATABASE_URL` | Yes | - | PostgreSQL connection string |
| `POSTGRES_USER` | Yes | `postgres` | PostgreSQL username |
| `POSTGRES_PASSWORD` | Yes | - | PostgreSQL password |
| `POSTGRES_DB` | Yes | `amarktai_marketing` | Database name |
| `REDIS_URL` | Yes | `redis://localhost:6379` | Redis connection string |
| `REDIS_PASSWORD` | No | `redis` | Redis password |
| `JWT_SECRET` | Yes | - | JWT signing secret (min 32 chars) |
| `JWT_REFRESH_SECRET` | Yes | - | Refresh token secret (min 32 chars) |
| `JWT_EXPIRES_IN` | No | `15m` | Access token expiry |
| `JWT_REFRESH_EXPIRES_IN` | No | `7d` | Refresh token expiry |
| `ENCRYPTION_KEY` | Yes | - | API key encryption key (32 bytes hex) |
| `GENX_API_KEY` | No | - | GenX Router API key |
| `GENX_BASE_URL` | No | `https://api.genxrouter.com/v1` | GenX Router base URL |
| `TOGETHER_API_KEY` | No | - | Together AI API key |
| `TOGETHER_BASE_URL` | No | `https://api.together.xyz/v1` | Together AI base URL |
| `DEEPINFRA_API_KEY` | No | - | DeepInfra API key |
| `DEEPINFRA_BASE_URL` | No | `https://api.deepinfra.com/v1` | DeepInfra base URL |
| `SMTP_HOST` | No | - | SMTP server host |
| `SMTP_PORT` | No | `587` | SMTP server port |
| `SMTP_USER` | No | - | SMTP username |
| `SMTP_PASS` | No | - | SMTP password |
| `SMTP_FROM` | No | `noreply@amarktai.com` | Sender email address |
| `RATE_LIMIT_WINDOW_MS` | No | `900000` | Rate limit window (15 min) |
| `RATE_LIMIT_MAX_REQUESTS` | No | `100` | Max requests per window |
| `FIRST_RUN` | No | `true` | Enable onboarding wizard |

## Backup and Restore

### Automated Backup Script

Create `/opt/amarktai/backup.sh`:

```bash
#!/bin/bash
BACKUP_DIR="/opt/amarktai/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

# Database backup
docker exec amarktai-postgres pg_dump -U amarktai amarktai_marketing | gzip > "$BACKUP_DIR/db_$TIMESTAMP.sql.gz"

# Keep only last 30 days of backups
find $BACKUP_DIR -name "db_*.sql.gz" -mtime +30 -delete

echo "Backup completed: $BACKUP_DIR/db_$TIMESTAMP.sql.gz"
```

### Schedule Backups

```bash
chmod +x /opt/amarktai/backup.sh
crontab -e
# Add: 0 2 * * * /opt/amarktai/backup.sh
```

### Restore from Backup

```bash
gunzip -c /opt/amarktai/backups/db_20240115_020000.sql.gz | docker exec -i amarktai-postgres psql -U amarktai amarktai_marketing
```

## Monitoring and Logging

### Health Checks

```bash
# API health
curl http://localhost:4000/health

# Web health
curl http://localhost:3000

# Database health
docker exec amarktai-postgres pg_isready -U amarktai

# Redis health
docker exec amarktai-redis redis-cli ping
```

### Logs

```bash
# Docker logs
docker compose -f docker/docker-compose.yml logs -f api
docker compose -f docker/docker-compose.yml logs -f web
docker compose -f docker/docker-compose.yml logs -f postgres

# API application logs
docker exec amarktai-api ls /app/logs
docker exec amarktai-api cat /app/logs/combined.log

# Nginx logs
docker exec amarktai-nginx cat /var/log/nginx/access.log
docker exec amarktai-nginx cat /var/log/nginx/error.log
```

### Log Rotation

Add to `/etc/logrotate.d/amarktai`:

```
/var/log/amarktai/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 root root
}
```

## Scaling Considerations

### Horizontal Scaling

For high-traffic deployments:

1. **Load Balancer:** Place Nginx or HAProxy in front of multiple API instances
2. **Database:** Use PostgreSQL replication for read scaling
3. **Redis:** Use Redis Cluster for high availability
4. **Static Assets:** Use CDN for frontend assets

### Docker Compose Scaling

```bash
# Scale API instances
docker compose -f docker/docker-compose.yml up -d --scale api=3
```

Update Nginx upstream configuration to include all API instances.

### Resource Limits

Add resource limits to `docker-compose.yml`:

```yaml
services:
  api:
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M

  web:
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M
```

## Troubleshooting

### Common Issues

**Database connection failed:**
```bash
# Check PostgreSQL is running
docker compose -f docker/docker-compose.yml ps postgres

# Check logs
docker compose -f docker/docker-compose.yml logs postgres

# Test connection
docker exec -it amarktai-postgres psql -U amarktai -d amarktai_marketing
```

**Redis connection failed:**
```bash
# Check Redis is running
docker compose -f docker/docker-compose.yml ps redis

# Test connection
docker exec -it amarktai-redis redis-cli -a your_redis_password ping
```

**API not starting:**
```bash
# Check API logs
docker compose -f docker/docker-compose.yml logs api

# Verify environment variables
docker exec amarktai-api env | grep DATABASE_URL
```

**Permission issues:**
```bash
# Fix file permissions
chmod -R 755 docker/
chmod 600 .env
```

### Reset Everything

```bash
# Stop all services
docker compose -f docker/docker-compose.yml down

# Remove volumes (WARNING: deletes all data)
docker compose -f docker/docker-compose.yml down -v

# Rebuild and start
docker compose -f docker/docker-compose.yml up -d --build
```
