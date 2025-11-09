# Part 1: Understanding JWT

## What is JWT?

JWT (JSON Web Token) is an open standard (RFC 7519) for securely transmitting information between parties as a JSON object. It's **digitally signed**, making it verifiable and trustworthy.

## JWT Structure

A JWT has three parts separated by dots:

```
eyJhbGci...header.eyJ1c2Vy...payload.SflKxw...signature
```

### 1. Header
Contains metadata about the token:
```json
{
  "alg": "HS256",
  "typ": "JWT"
}
```

### 2. Payload
Contains claims (your data):
```json
{
  "userId": "123",
  "email": "user@example.com",
  "iat": 1516239022,
  "exp": 1516242622
}
```

### 3. Signature
Ensures the token hasn't been tampered with:
```
HMACSHA256(
  base64UrlEncode(header) + "." + base64UrlEncode(payload),
  secret
)
```

## How JWT Authentication Works

```
┌─────────┐                                    ┌─────────┐
│ Client  │                                    │ Server  │
└────┬────┘                                    └────┬────┘
     │                                              │
     │ 1. Login with credentials                    │
     │─────────────────────────────────────────────>│
     │                                              │
     │                    2. Verify credentials      │
     │                       Generate JWT            │
     │                                              │
     │ 3. Return JWT                                │
     │<─────────────────────────────────────────────│
     │                                              │
     │ 4. Store JWT (memory/storage)                │
     │                                              │
     │ 5. Send JWT in header for protected routes   │
     │ Authorization: Bearer <token>                │
     │─────────────────────────────────────────────>│
     │                                              │
     │                    6. Verify JWT signature    │
     │                       Extract user info       │
     │                                              │
     │ 7. Return protected data                     │
     │<─────────────────────────────────────────────│
```

## Why JWT?

### Advantages ✅
- **Stateless**: No server-side session storage needed
- **Scalable**: Works across multiple servers
- **Mobile-friendly**: Easy to use in any client
- **Self-contained**: Token includes all user info needed
- **Performance**: No database lookup on every request

### Challenges ⚠️
- **Cannot revoke easily**: Token valid until expiration
- **Size**: Larger than session IDs (sent on every request)
- **Token theft**: If stolen, can be used until expiration

## Access Token vs. Refresh Token Strategy

To address JWT challenges, we use **two tokens**:

### Access Token
- **Purpose**: Authenticate API requests
- **Lifetime**: Short (15 minutes)
- **Storage**: Memory or localStorage
- **Contains**: User ID, email, roles
- **Sent in**: Authorization header

### Refresh Token
- **Purpose**: Get new access tokens
- **Lifetime**: Long (7 days)
- **Storage**: HTTP-only cookie
- **Contains**: User ID only
- **Sent in**: Cookie (automatic)

### Why This Strategy?

1. **Short access token**: Limits damage if stolen
2. **Long refresh token**: Better user experience (stay logged in)
3. **HTTP-only cookie**: JavaScript can't access refresh token
4. **Can revoke**: Can invalidate refresh tokens server-side

## Token Lifecycle

```
User Login
   │
   ├─> Generate Access Token (15min)
   │
   └─> Generate Refresh Token (7 days)
       Store in HTTP-only cookie
   
   ┌─────────────────────────────┐
   │  Access Token Still Valid?  │
   └─────────────────────────────┘
              │
       ┌──────┴──────┐
      YES            NO
       │              │
   Use Token      Call /refresh
   for API        with cookie
       │              │
       │        Get New Access Token
       │              │
       └──────┬───────┘
              │
        API Request
```

## Common JWT Claims

### Standard Claims (Optional but Recommended)
- `iss` (issuer): Who issued the token
- `sub` (subject): User ID
- `aud` (audience): Intended recipient
- `exp` (expiration): When token expires (required!)
- `iat` (issued at): When token was created
- `nbf` (not before): Token not valid before this time

### Custom Claims (Your Data)
- `userId`: User's unique identifier
- `email`: User's email
- `role`: User's role (admin, user, etc.)
- Any other non-sensitive data

### ⚠️ Security Note
**Never store sensitive data in JWT:**
- ❌ Passwords
- ❌ Credit card numbers
- ❌ Social security numbers
- ❌ Private keys

**Why?** JWTs are encoded, not encrypted. Anyone can decode them!

## Key Concepts Summary

| Concept | Description |
|---------|-------------|
| **Stateless** | Server doesn't store session data |
| **Signed** | Token can be verified with secret key |
| **Self-contained** | Token includes all necessary user info |
| **Bearer token** | Whoever has the token can use it |
| **Secret key** | Used to sign and verify tokens |
| **Expiration** | Tokens automatically expire |

## Next Steps

Now that you understand JWT theory, you're ready to implement it!

**Continue to [Part 2: Setup & Configuration](./02_setup.md)**
