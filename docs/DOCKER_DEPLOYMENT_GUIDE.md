# Docker Deployment Guide for FinApp Backend

This guide walks you through containerizing and deploying the FinApp backend using Docker.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Understanding Docker Concepts](#understanding-docker-concepts)
3. [Creating the Dockerfile](#creating-the-dockerfile)
4. [Creating .dockerignore](#creating-dockerignore)
5. [Building the Docker Image](#building-the-docker-image)
6. [Running Locally with Docker Compose](#running-locally-with-docker-compose)
7. [Free Hosting Options](#free-hosting-options)
8. [Deploying to Render](#deploying-to-render)
9. [Deploying to Railway](#deploying-to-railway)
10. [Environment Variables](#environment-variables)
11. [Troubleshooting](#troubleshooting)

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed
- [Docker Compose](https://docs.docker.com/compose/install/) (included with Docker Desktop)
- A GitHub account (for deployment)
- A MongoDB Atlas account (free tier) for the database

---

## Understanding Docker Concepts

### What is Docker?

Docker packages your application and its dependencies into a **container**—a lightweight, standalone executable that runs consistently across any environment.

### Key Terms

| Term | Description |
|------|-------------|
| **Image** | A read-only template with instructions for creating a container (like a recipe) |
| **Container** | A running instance of an image (like the actual dish made from the recipe) |
| **Dockerfile** | A text file with instructions to build an image |
| **Docker Compose** | A tool for defining multi-container applications (e.g., app + database) |
| **Registry** | A storage for Docker images (Docker Hub, GitHub Container Registry) |

### Why Containerize?

1. **Consistency** — "Works on my machine" becomes "Works everywhere"
2. **Isolation** — Dependencies don't conflict with host system
3. **Portability** — Deploy anywhere Docker runs
4. **Scalability** — Easy to replicate containers

---

## Creating the Dockerfile

Create a file named `Dockerfile` (no extension) in your project root:

```dockerfile
# ============================================
# Stage 1: Build Stage (optional for Node.js)
# ============================================
# We use a multi-stage build to keep the final image small

# Use official Node.js image as base
# Alpine variant is smaller (~50MB vs ~350MB)
FROM node:20-alpine AS builder

# Set working directory inside container
WORKDIR /app

# Copy package files first (for better caching)
# Docker caches layers - if package.json hasn't changed,
# npm install is skipped on rebuild
COPY package*.json ./

# Install ALL dependencies (including devDependencies)
# We need them for potential build steps
RUN npm ci

# Copy the rest of the application code
COPY . .

# ============================================
# Stage 2: Production Stage
# ============================================
FROM node:20-alpine AS production

# Set NODE_ENV to production
# This tells Express to enable optimizations
ENV NODE_ENV=production

# Create non-root user for security
# Running as root inside containers is a security risk
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ONLY production dependencies
# --omit=dev excludes devDependencies
RUN npm ci --omit=dev && npm cache clean --force

# Copy application code from builder stage
COPY --from=builder /app/src ./src
COPY --from=builder /app/server.js ./

# Change ownership to non-root user
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose the port the app runs on
# This is documentation - it doesn't actually publish the port
EXPOSE 3000

# Health check - Docker will periodically check if the container is healthy
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Command to run the application
# Use node directly, not npm, for proper signal handling
CMD ["node", "server.js"]
```

### Dockerfile Explained

| Instruction | Purpose |
|-------------|---------|
| `FROM` | Base image to build upon |
| `WORKDIR` | Sets the working directory for subsequent instructions |
| `COPY` | Copies files from host to container |
| `RUN` | Executes commands during image build |
| `ENV` | Sets environment variables |
| `EXPOSE` | Documents which port the container listens on |
| `USER` | Switches to a non-root user (security best practice) |
| `HEALTHCHECK` | Defines how Docker checks if the container is healthy |
| `CMD` | Default command to run when container starts |

### Multi-Stage Build Benefits

1. **Smaller final image** — Only production dependencies included
2. **Better security** — No build tools or dev dependencies in production
3. **Faster deployments** — Smaller images transfer faster

---

## Creating .dockerignore

Create a `.dockerignore` file to exclude unnecessary files from the image:

```dockerignore
# Dependencies
node_modules
npm-debug.log*

# Environment files (secrets should be injected at runtime)
.env
.env.*

# Git
.git
.gitignore

# Documentation (not needed in production)
*.md
docs/

# IDE
.vscode
.idea

# Testing
coverage/
*.test.js
__tests__/

# OS files
.DS_Store
Thumbs.db

# Build artifacts
dist/
build/

# Logs
logs/
*.log
```

### Why .dockerignore Matters

- **Faster builds** — Less files to copy
- **Smaller images** — No unnecessary files
- **Security** — Prevents accidental inclusion of secrets

---

## Building the Docker Image

### Build Command

```bash
# Basic build
docker build -t finapp-backend .

# Build with version tag
docker build -t finapp-backend:1.0.0 .

# Build with multiple tags
docker build -t finapp-backend:latest -t finapp-backend:1.0.0 .
```

### Understanding the Build Output

```
[+] Building 45.2s (15/15) FINISHED
 => [internal] load build definition from Dockerfile
 => [internal] load .dockerignore
 => [builder 1/5] FROM node:20-alpine
 => [builder 2/5] WORKDIR /app
 => [builder 3/5] COPY package*.json ./
 => [builder 4/5] RUN npm ci                          ← Dependencies installed
 => [builder 5/5] COPY . .
 => [production 1/7] FROM node:20-alpine
 => [production 2/7] ENV NODE_ENV=production
 => ...
 => exporting to image
```

### Verify the Image

```bash
# List images
docker images

# Check image size
docker images finapp-backend

# Inspect image layers
docker history finapp-backend
```

---

## Running Locally with Docker Compose

Docker Compose lets you run the backend + MongoDB together for local development.

### Create `docker-compose.yml`

```yaml
version: '3.8'

services:
  # ============================================
  # Backend API Service
  # ============================================
  api:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: finapp-api
    ports:
      - "3000:3000"        # Map host:container ports
    environment:
      - NODE_ENV=production
      - PORT=3000
      - MONGODB_URI=mongodb://mongo:27017/finapp
      - JWT_ACCESS_SECRET=${JWT_ACCESS_SECRET}
      - JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
      - FRONTEND_URL=${FRONTEND_URL:-http://localhost:3001}
    depends_on:
      mongo:
        condition: service_healthy
    restart: unless-stopped
    networks:
      - finapp-network

  # ============================================
  # MongoDB Service
  # ============================================
  mongo:
    image: mongo:7
    container_name: finapp-mongo
    ports:
      - "27017:27017"      # Expose for local debugging
    volumes:
      - mongo-data:/data/db   # Persist data between restarts
    healthcheck:
      test: echo 'db.runCommand("ping").ok' | mongosh localhost:27017/test --quiet
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s
    restart: unless-stopped
    networks:
      - finapp-network

# ============================================
# Volumes (persistent storage)
# ============================================
volumes:
  mongo-data:
    driver: local

# ============================================
# Networks
# ============================================
networks:
  finapp-network:
    driver: bridge
```

### Create `.env.docker` for Local Testing

```env
JWT_ACCESS_SECRET=your-super-secret-access-key-min-32-chars
JWT_REFRESH_SECRET=your-super-secret-refresh-key-min-32-chars
FRONTEND_URL=http://localhost:3001
```

### Running with Docker Compose

```bash
# Start all services
docker-compose --env-file .env.docker up -d

# View logs
docker-compose logs -f api

# Stop all services
docker-compose down

# Stop and remove volumes (deletes database!)
docker-compose down -v
```

### Useful Commands

```bash
# Rebuild after code changes
docker-compose up -d --build

# Enter container shell for debugging
docker exec -it finapp-api sh

# Check container health
docker inspect --format='{{.State.Health.Status}}' finapp-api

# View resource usage
docker stats
```

---

## Free Hosting Options

### Comparison Table

| Platform | Free Tier | MongoDB Included | Custom Domain | Auto-Deploy |
|----------|-----------|------------------|---------------|-------------|
| **Render** | 750 hrs/month | No (use Atlas) | Yes | Yes |
| **Railway** | $5 credit/month | Yes (limited) | Yes | Yes |
| **Fly.io** | 3 shared VMs | No (use Atlas) | Yes | Yes |
| **Koyeb** | 1 nano instance | No (use Atlas) | Yes | Yes |

### Recommended: Render + MongoDB Atlas

**Why this combination?**
- Render: Simple Docker deployment, generous free tier
- MongoDB Atlas: 512MB free forever, no credit card required

---

## Deploying to Render

### Step 1: Prepare MongoDB Atlas

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a free cluster (M0 tier)
3. Create a database user (Database Access → Add New Database User)
4. Allow access from anywhere (Network Access → Add IP Address → 0.0.0.0/0)
5. Get your connection string (Connect → Drivers → Copy URI)

Connection string format:
```
mongodb+srv://<username>:<password>@<cluster>.mongodb.net/finapp?retryWrites=true&w=majority
```

### Step 2: Push to GitHub

```bash
# Initialize git (if not already)
git init

# Add all files
git add .

# Commit
git commit -m "Prepare for deployment"

# Add remote (create repo on GitHub first)
git remote add origin https://github.com/YOUR_USERNAME/finapp-backend.git

# Push
git push -u origin main
```

### Step 3: Deploy on Render

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click **New → Web Service**
3. Connect your GitHub repository
4. Configure the service:

| Setting | Value |
|---------|-------|
| **Name** | finapp-backend |
| **Region** | Choose closest to your users |
| **Branch** | main |
| **Runtime** | Docker |
| **Instance Type** | Free |

5. Add Environment Variables:

| Key | Value |
|-----|-------|
| `NODE_ENV` | production |
| `PORT` | 3000 |
| `MONGODB_URI` | Your Atlas connection string |
| `JWT_ACCESS_SECRET` | Generate with `openssl rand -hex 32` |
| `JWT_REFRESH_SECRET` | Generate with `openssl rand -hex 32` |
| `FRONTEND_URL` | Your frontend URL (or * for testing) |

6. Click **Create Web Service**

### Step 4: Verify Deployment

Once deployed, test your endpoints:

```bash
# Health check
curl https://your-app.onrender.com/health

# Should return:
# {"status":"OK","database":{"connected":true,"name":"finapp"},"timestamp":"..."}
```

---

## Deploying to Railway

Railway is another excellent free option with a simpler setup.

### Step 1: Connect Repository

1. Go to [Railway](https://railway.app/)
2. Sign in with GitHub
3. Click **New Project → Deploy from GitHub repo**
4. Select your repository

### Step 2: Add MongoDB

1. In your project, click **New → Database → MongoDB**
2. Railway automatically creates `MONGODB_URL` variable

### Step 3: Configure Variables

Click on your service → Variables → Add:

| Key | Value |
|-----|-------|
| `NODE_ENV` | production |
| `PORT` | 3000 |
| `MONGODB_URI` | `${{MongoDB.MONGODB_URL}}` (Railway reference) |
| `JWT_ACCESS_SECRET` | Your secret |
| `JWT_REFRESH_SECRET` | Your secret |
| `FRONTEND_URL` | Your frontend URL |

### Step 4: Configure Dockerfile

Railway auto-detects Dockerfiles. Add a `railway.toml` for custom settings:

```toml
[build]
builder = "dockerfile"
dockerfilePath = "Dockerfile"

[deploy]
healthcheckPath = "/health"
healthcheckTimeout = 100
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3
```

---

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `production` |
| `PORT` | Server port | `3000` |
| `MONGODB_URI` | MongoDB connection string | `mongodb+srv://...` |
| `JWT_ACCESS_SECRET` | Secret for access tokens (min 32 chars) | `openssl rand -hex 32` |
| `JWT_REFRESH_SECRET` | Secret for refresh tokens (min 32 chars) | `openssl rand -hex 32` |
| `FRONTEND_URL` | Allowed CORS origin | `https://myapp.com` |

### Generating Secure Secrets

```bash
# On macOS/Linux
openssl rand -hex 32

# On Windows (PowerShell)
[System.Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))

# Alternative: Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Troubleshooting

### Common Issues

#### Container exits immediately

```bash
# Check logs
docker logs finapp-api

# Common causes:
# - Missing environment variables
# - MongoDB connection failed
# - Port already in use
```

#### MongoDB connection refused

```bash
# If using Docker Compose, ensure:
# 1. mongo service is healthy
# 2. Using correct hostname (mongo, not localhost)
# 3. Network is properly configured

# Check mongo health
docker-compose ps
```

#### Image too large

```bash
# Check image size
docker images finapp-backend

# If >500MB, verify:
# 1. Multi-stage build is working
# 2. .dockerignore excludes node_modules
# 3. Using Alpine base image
```

#### Health check failing

```bash
# Test health endpoint manually
docker exec finapp-api wget -qO- http://localhost:3000/health

# Check if app started correctly
docker logs finapp-api --tail 50
```

### Debug Mode

For debugging, override the CMD:

```bash
# Start with shell access
docker run -it --rm finapp-backend sh

# Start with debug logging
docker run -e DEBUG=* finapp-backend
```

---

## Security Checklist

Before deploying to production:

- [ ] Never commit `.env` files to git
- [ ] Use strong, unique JWT secrets (32+ characters)
- [ ] Enable HTTPS (Render/Railway provide this automatically)
- [ ] Set specific `FRONTEND_URL` (avoid `*` in production)
- [ ] Run container as non-root user (already in Dockerfile)
- [ ] Keep base image updated (`node:20-alpine`)
- [ ] Review and limit MongoDB user permissions

---

## Next Steps

1. **Set up CI/CD** — Auto-deploy on git push
2. **Add monitoring** — Use Render/Railway built-in metrics
3. **Configure custom domain** — Both platforms support free SSL
4. **Set up database backups** — MongoDB Atlas includes automated backups

---

## Quick Reference

```bash
# Build image
docker build -t finapp-backend .

# Run container
docker run -p 3000:3000 --env-file .env finapp-backend

# Docker Compose
docker-compose up -d
docker-compose logs -f
docker-compose down

# Debug
docker exec -it finapp-api sh
docker logs finapp-api
```

---

*Guide created for FinApp Backend v1.0.0*
