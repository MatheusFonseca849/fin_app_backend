# Redis Caching Layer

## Why Add Caching?

Every time a user opens the app, the backend queries MongoDB for their profile, categories, and transactions. For a single user this is fast, but as the app grows:

| Without Cache | With Cache |
|---|---|
| Every request → MongoDB query | First request → MongoDB, subsequent → Redis (in-memory) |
| ~5-20ms per query (network + disk) | ~0.5-1ms from Redis |
| DB load scales linearly with users | DB load reduced by 80-95% for read-heavy data |
| No protection against traffic spikes | Redis absorbs repeated reads |

**What to cache in Fin App:**

| Data | Why | TTL |
|---|---|---|
| User profile (`/users/me`) | Read on every page load, rarely changes | 5 min |
| Categories | Read on every transaction form, rarely change | 10 min |
| Transaction lists | Read often, changes on create/update/delete | 2 min |

> **Rule of thumb**: Cache data that is **read often** and **written infrequently**. Invalidate (delete) the cache when the data changes.

---

## Step 1: Install Redis

### Local Development

**Windows (WSL recommended):**
```bash
# In WSL (Ubuntu)
sudo apt update
sudo apt install redis-server
sudo service redis-server start

# Test it
redis-cli ping
# Should print: PONG
```

**Windows (native via Memurai or Docker):**
```bash
# Using Docker (easiest)
docker run -d --name redis -p 6379:6379 redis:7-alpine
```

**macOS:**
```bash
brew install redis
brew services start redis
```

### Production

Use a managed Redis service:
- **Redis Cloud** (free 30MB tier) — [redis.com/cloud](https://redis.com/try-free/)
- **AWS ElastiCache**
- **Upstash** (serverless, free tier) — [upstash.com](https://upstash.com)

---

## Step 2: Install the Node.js Client

```bash
npm install ioredis
```

We use **ioredis** over the `redis` package because it:
- Has better TypeScript support
- Supports Cluster mode out of the box
- Has built-in reconnection logic
- Is widely used in production (used by Bull, BullMQ, etc.)

---

## Step 3: Add Environment Variables

```env
# Redis
REDIS_URL=redis://127.0.0.1:6379
# For production with auth:
# REDIS_URL=redis://:your_password@your-redis-host:6379
```

---

## Step 4: Create the Redis Config

Create `src/config/redis.js`:

```javascript
const Redis = require('ioredis');

class RedisClient {
  constructor() {
    this.client = null;
    this.isConnected = false;
  }

  connect() {
    if (this.client) return this.client;

    const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

    this.client = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        // Reconnect after increasing delay, max 3 seconds
        const delay = Math.min(times * 200, 3000);
        return delay;
      },
      // Don't throw if Redis is down — app should work without cache
      lazyConnect: false
    });

    this.client.on('connect', () => {
      this.isConnected = true;
      console.log('✅ Redis connected');
    });

    this.client.on('error', (err) => {
      this.isConnected = false;
      console.error('❌ Redis error:', err.message);
    });

    this.client.on('close', () => {
      this.isConnected = false;
    });

    return this.client;
  }

  getClient() {
    if (!this.client) this.connect();
    return this.client;
  }

  async disconnect() {
    if (this.client) {
      await this.client.quit();
      this.isConnected = false;
      console.log('✅ Redis disconnected');
    }
  }
}

module.exports = new RedisClient();
```

### What's happening:

- **`lazyConnect: false`** — Connects immediately when instantiated
- **`retryStrategy`** — If Redis goes down, ioredis retries with exponential backoff (200ms, 400ms, 600ms... up to 3s)
- **Event listeners** — Track connection state so the app knows whether to use cache or fall back to MongoDB
- **Singleton pattern** — One connection shared across the app (Redis connections are multiplexed)

---

## Step 5: Create a Cache Service

Create `src/services/cache.service.js`:

```javascript
const redisClient = require('../config/redis');

class CacheService {
  constructor() {
    this.defaultTTL = 300; // 5 minutes in seconds
  }

  /**
   * Get a cached value. Returns null if not found or Redis is down.
   */
  async get(key) {
    try {
      const client = redisClient.getClient();
      if (!redisClient.isConnected) return null;

      const data = await client.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Cache GET error:', error.message);
      return null; // Fail silently — app works without cache
    }
  }

  /**
   * Set a cached value with optional TTL (in seconds).
   */
  async set(key, value, ttl = this.defaultTTL) {
    try {
      const client = redisClient.getClient();
      if (!redisClient.isConnected) return;

      await client.set(key, JSON.stringify(value), 'EX', ttl);
    } catch (error) {
      console.error('Cache SET error:', error.message);
    }
  }

  /**
   * Delete a specific key.
   */
  async del(key) {
    try {
      const client = redisClient.getClient();
      if (!redisClient.isConnected) return;

      await client.del(key);
    } catch (error) {
      console.error('Cache DEL error:', error.message);
    }
  }

  /**
   * Delete all keys matching a pattern.
   * Example: invalidatePattern('user:abc123:*') deletes all cache for that user.
   * 
   * Uses SCAN instead of KEYS to avoid blocking Redis on large datasets.
   */
  async invalidatePattern(pattern) {
    try {
      const client = redisClient.getClient();
      if (!redisClient.isConnected) return;

      let cursor = '0';
      do {
        const [nextCursor, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = nextCursor;
        if (keys.length > 0) {
          await client.del(...keys);
        }
      } while (cursor !== '0');
    } catch (error) {
      console.error('Cache INVALIDATE error:', error.message);
    }
  }

  // ============================================
  // Domain-Specific Cache Keys
  // ============================================

  // Key builders — centralize key format to avoid typos
  keys = {
    userProfile: (userId) => `user:${userId}:profile`,
    userCategories: (userId) => `user:${userId}:categories`,
    userTransactions: (userId, page = 1) => `user:${userId}:transactions:page:${page}`,
    userRecurrents: (userId) => `user:${userId}:recurrents`,
    allUserKeys: (userId) => `user:${userId}:*`
  };

  // ============================================
  // Domain-Specific Helpers
  // ============================================

  async getCachedUserProfile(userId) {
    return this.get(this.keys.userProfile(userId));
  }

  async cacheUserProfile(userId, profile) {
    await this.set(this.keys.userProfile(userId), profile, 300); // 5 min
  }

  async getCachedCategories(userId) {
    return this.get(this.keys.userCategories(userId));
  }

  async cacheCategories(userId, categories) {
    await this.set(this.keys.userCategories(userId), categories, 600); // 10 min
  }

  async getCachedTransactions(userId, page = 1) {
    return this.get(this.keys.userTransactions(userId, page));
  }

  async cacheTransactions(userId, page, transactions) {
    await this.set(this.keys.userTransactions(userId, page), transactions, 120); // 2 min
  }

  /**
   * Call this whenever user data changes (update profile, upload avatar, etc.)
   */
  async invalidateUser(userId) {
    await this.invalidatePattern(this.keys.allUserKeys(userId));
  }

  /**
   * Call this whenever categories change for a user.
   */
  async invalidateCategories(userId) {
    await this.del(this.keys.userCategories(userId));
  }

  /**
   * Call this whenever transactions change for a user.
   */
  async invalidateTransactions(userId) {
    await this.invalidatePattern(`user:${userId}:transactions:*`);
  }
}

module.exports = new CacheService();
```

### Key Design Decisions:

1. **Fail silently** — Every method catches errors and returns `null` or does nothing. The app must **never break** because Redis is down. MongoDB is the source of truth; Redis is purely a performance boost.

2. **Key namespacing** — All keys follow the pattern `user:{userId}:{resource}`. This makes invalidation easy: when a user's profile changes, delete `user:abc:*`.

3. **SCAN vs KEYS** — `KEYS *` blocks Redis while it iterates every key. `SCAN` does it in batches of 100, non-blocking. Critical for production.

4. **TTL (Time To Live)** — Every cached value auto-expires. Even if we forget to invalidate, stale data is at most 2-10 minutes old.

---

## Step 6: Wire It Into Your Routes

### Example: `GET /users/me` with caching

```javascript
const cacheService = require('../services/cache.service');

router.get('/me', authenticateToken, async (req, res) => {
  try {
    // 1. Check cache first
    const cached = await cacheService.getCachedUserProfile(req.user.id);
    if (cached) return res.json(cached);

    // 2. Cache miss → query MongoDB
    const user = await userService.findById(req.user.id);
    if (!user) {
      return res.status(404).json(createError(404, 'Usuário não encontrado'));
    }

    // 3. Store in cache for next time
    const userData = user.toJSON();
    await cacheService.cacheUserProfile(req.user.id, userData);

    res.json(userData);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json(createError(500, 'Erro ao buscar usuário'));
  }
});
```

### Example: `GET /records` with caching

```javascript
const cacheService = require('../services/cache.service');

router.get("/", authenticateToken, async (req, res) => {
  try {
    const page = req.query.page ? parseInt(req.query.page) : 1;

    // Check cache
    const cached = await cacheService.getCachedTransactions(req.user.id, page);
    if (cached) return res.json(cached);

    // Cache miss
    const transactions = await transactionService.getTransactions(req.user.id, {
      page,
      limit: req.query.limit ? parseInt(req.query.limit) : 50,
      type: req.query.type,
      isRecurrent: false
    });

    // Cache the result
    await cacheService.cacheTransactions(req.user.id, page, transactions);

    res.json(transactions);
  } catch (error) {
    console.error("Get transactions error:", error);
    res.status(500).json(createError(500, "Erro ao buscar transações"));
  }
});
```

---

## Step 7: Invalidate on Write

**This is the most critical part.** Whenever data changes, you MUST invalidate the cache.

### In transaction routes (create/update/delete):

```javascript
// After creating a transaction:
await cacheService.invalidateTransactions(req.user.id);

// After updating/deleting a transaction:
await cacheService.invalidateTransactions(req.user.id);
```

### In user routes (update profile, upload avatar):

```javascript
// After updating user profile or avatar:
await cacheService.invalidateUser(req.user.id);
```

### In category routes:

```javascript
// After creating/updating/deleting a category:
await cacheService.invalidateCategories(req.user.id);
```

> **Pattern**: Write to MongoDB first, then invalidate cache. Never update the cache directly on writes — it's simpler and avoids race conditions.

---

## Step 8: Initialize Redis on Server Start

In `server.js`:

```javascript
const redisClient = require('./src/config/redis');

async function startServer() {
  await database.connect();
  redisClient.connect();  // Initialize Redis
  recurrenceService.start();
  // ...
}
```

And in the SIGINT handler:

```javascript
process.on('SIGINT', async () => {
  await redisClient.disconnect();
  await database.disconnect();
  process.exit(0);
});
```

---

## Step 9: Add to Health Check

In `app.js`:

```javascript
app.get('/health', (req, res) => {
  const dbStatus = require('./config/database').getStatus();
  const redisStatus = require('./config/redis');
  res.json({
    status: 'OK',
    database: {
      connected: dbStatus.isConnected,
      name: dbStatus.name
    },
    redis: {
      connected: redisStatus.isConnected
    },
    timestamp: new Date().toISOString()
  });
});
```

---

## How the Cache Flow Works (Visual)

```
Client Request: GET /users/me
        │
        ▼
  ┌──────────┐     HIT      ┌───────┐
  │  Route    │─────────────▶│ Redis │──▶ Return cached JSON
  │  Handler  │              └───────┘
  │           │     MISS
  │           │──────────────▶┌─────────┐
  │           │               │ MongoDB │──▶ Return from DB
  │           │◀──────────────└─────────┘       │
  │           │                                  │
  │           │───── cache result in Redis ◀─────┘
  └──────────┘
```

On **write** (PUT, POST, DELETE):
```
Client Request: POST /records
        │
        ▼
  ┌──────────┐     1. Write     ┌─────────┐
  │  Route    │────────────────▶│ MongoDB │
  │  Handler  │                 └─────────┘
  │           │     2. Invalidate
  │           │────────────────▶┌───────┐
  │           │                 │ Redis │  (delete stale keys)
  └──────────┘                  └───────┘
```

---

## Common Pitfalls

1. **Forgetting to invalidate** — The #1 caching bug. Always pair writes with invalidation.
2. **Caching errors** — Never cache error responses. Only cache successful data.
3. **Cache stampede** — If the cache expires and 100 users hit the same endpoint simultaneously, all 100 query MongoDB. Solution: use a mutex/lock (advanced — not needed at our scale).
4. **Over-caching** — Don't cache everything. If data changes every second, caching it for 5 minutes shows stale data. Match TTL to your use case.
5. **Serialization** — Always `JSON.stringify` before storing and `JSON.parse` after reading. Redis stores strings.

---

## Recap

1. **Redis is an in-memory key-value store** — sub-millisecond reads
2. **Use it as a read cache**, not a primary database
3. **Fail silently** — the app must work without Redis
4. **Invalidate on write** — never serve stale data after a mutation
5. **Use TTL** as a safety net against forgotten invalidations
6. **Namespace keys** per user and resource for targeted invalidation
