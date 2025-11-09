# Part 6: Frontend Integration

## Overview

Your React frontend needs to:
1. Store access tokens in memory
2. Send tokens with API requests
3. Handle token expiration
4. Refresh tokens automatically
5. Redirect to login when needed

---

## Step 1: Update API Service

Update your `fin_app/src/services/api.js` (or wherever you have API calls):

```javascript
const API_URL = 'http://localhost:3000';

// Store access token in memory (not localStorage for better security)
let accessToken = null;

/**
 * Set the access token
 * @param {string} token - JWT access token
 */
export const setAccessToken = (token) => {
    accessToken = token;
};

/**
 * Get the current access token
 * @returns {string|null} Access token
 */
export const getAccessToken = () => {
    return accessToken;
};

/**
 * Clear the access token (on logout)
 */
export const clearAccessToken = () => {
    accessToken = null;
};

/**
 * Check if user is authenticated
 * @returns {boolean}
 */
export const isAuthenticated = () => {
    return accessToken !== null;
};

/**
 * Refresh the access token using refresh token cookie
 * @returns {Promise<string>} New access token
 */
export const refreshAccessToken = async () => {
    const response = await fetch(`${API_URL}/users/refresh`, {
        method: 'POST',
        credentials: 'include', // IMPORTANT: Send cookies
    });
    
    if (!response.ok) {
        throw new Error('Token refresh failed');
    }
    
    const data = await response.json();
    setAccessToken(data.accessToken);
    return data.accessToken;
};

/**
 * Generic API request with automatic token refresh
 * @param {string} endpoint - API endpoint (e.g., '/records')
 * @param {Object} options - Fetch options
 * @returns {Promise<Response>}
 */
export const apiRequest = async (endpoint, options = {}) => {
    const makeRequest = (token) => {
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers,
        };
        
        // Add Authorization header if token exists
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        return fetch(`${API_URL}${endpoint}`, {
            ...options,
            headers,
            credentials: 'include', // IMPORTANT: Always send cookies
        });
    };
    
    // First attempt with current token
    let response = await makeRequest(accessToken);
    
    // If 403 (Forbidden), token might be expired - try refreshing
    if (response.status === 403) {
        try {
            await refreshAccessToken();
            // Retry with new token
            response = await makeRequest(accessToken);
        } catch (error) {
            // Refresh failed - user needs to login again
            clearAccessToken();
            // Redirect to login (or throw error to be handled by component)
            window.location.href = '/login';
            throw new Error('Session expired, please login again');
        }
    }
    
    return response;
};

/**
 * Login user
 * @param {string} email 
 * @param {string} password 
 * @returns {Promise<Object>} User object
 */
export const login = async (email, password) => {
    const response = await fetch(`${API_URL}/users/login`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        credentials: 'include', // IMPORTANT: Receive cookies
        body: JSON.stringify({ email, password }),
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Login failed');
    }
    
    const data = await response.json();
    setAccessToken(data.accessToken); // Store token in memory
    return data.user;
};

/**
 * Register new user
 * @param {string} name 
 * @param {string} email 
 * @param {string} password 
 * @returns {Promise<Object>} User object
 */
export const register = async (name, email, password) => {
    const response = await fetch(`${API_URL}/users/register`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ name, email, password }),
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Registration failed');
    }
    
    const data = await response.json();
    setAccessToken(data.accessToken);
    return data.user;
};

/**
 * Logout user
 */
export const logout = async () => {
    try {
        await apiRequest('/users/logout', {
            method: 'POST',
        });
    } catch (error) {
        // Even if logout fails, clear local token
        console.error('Logout error:', error);
    } finally {
        clearAccessToken();
    }
};

/**
 * Get current user
 * @returns {Promise<Object>} User object
 */
export const getCurrentUser = async () => {
    const response = await apiRequest('/users/me');
    
    if (!response.ok) {
        throw new Error('Failed to get current user');
    }
    
    return response.json();
};

/**
 * Get all transactions for current user
 * @returns {Promise<Array>} Transactions array
 */
export const getTransactions = async () => {
    const response = await apiRequest('/records');
    
    if (!response.ok) {
        throw new Error('Failed to fetch transactions');
    }
    
    return response.json();
};

/**
 * Create a new transaction
 * @param {Object} transaction 
 * @returns {Promise<Object>} Created transaction
 */
export const createTransaction = async (transaction) => {
    const response = await apiRequest('/records', {
        method: 'POST',
        body: JSON.stringify(transaction),
    });
    
    if (!response.ok) {
        throw new Error('Failed to create transaction');
    }
    
    return response.json();
};

/**
 * Get user categories
 * @returns {Promise<Array>} Categories array
 */
export const getCategories = async () => {
    const response = await apiRequest('/categories');
    
    if (!response.ok) {
        throw new Error('Failed to fetch categories');
    }
    
    return response.json();
};
```

---

## Step 2: Create Auth Context

Create `fin_app/src/contexts/AuthContext.js`:

```javascript
import React, { createContext, useState, useContext, useEffect } from 'react';
import { login as apiLogin, register as apiRegister, logout as apiLogout, getCurrentUser, setAccessToken, clearAccessToken } from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Try to restore session on mount
    useEffect(() => {
        const restoreSession = async () => {
            try {
                // Try to get current user (will use refresh token if needed)
                const userData = await getCurrentUser();
                setUser(userData);
            } catch (error) {
                // No valid session
                clearAccessToken();
            } finally {
                setLoading(false);
            }
        };

        restoreSession();
    }, []);

    const login = async (email, password) => {
        try {
            setError(null);
            const userData = await apiLogin(email, password);
            setUser(userData);
            return userData;
        } catch (error) {
            setError(error.message);
            throw error;
        }
    };

    const register = async (name, email, password) => {
        try {
            setError(null);
            const userData = await apiRegister(name, email, password);
            setUser(userData);
            return userData;
        } catch (error) {
            setError(error.message);
            throw error;
        }
    };

    const logout = async () => {
        try {
            await apiLogout();
        } finally {
            setUser(null);
            clearAccessToken();
        }
    };

    const value = {
        user,
        loading,
        error,
        login,
        register,
        logout,
        isAuthenticated: !!user,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return context;
};
```

---

## Step 3: Update App.js

Wrap your app with AuthProvider:

```javascript
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './components/Login';
import Register from './components/Register';
import Dashboard from './components/Dashboard';
import Transactions from './components/Transactions';
import Analytics from './components/Analytics';

// Protected route component
const ProtectedRoute = ({ children }) => {
    const { isAuthenticated, loading } = useAuth();
    
    if (loading) {
        return <div>Loading...</div>;
    }
    
    return isAuthenticated ? children : <Navigate to="/login" />;
};

function App() {
    return (
        <AuthProvider>
            <Router>
                <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route path="/register" element={<Register />} />
                    <Route 
                        path="/dashboard" 
                        element={
                            <ProtectedRoute>
                                <Dashboard />
                            </ProtectedRoute>
                        } 
                    />
                    <Route 
                        path="/transactions" 
                        element={
                            <ProtectedRoute>
                                <Transactions />
                            </ProtectedRoute>
                        } 
                    />
                    <Route 
                        path="/analytics" 
                        element={
                            <ProtectedRoute>
                                <Analytics />
                            </ProtectedRoute>
                        } 
                    />
                    <Route path="/" element={<Navigate to="/dashboard" />} />
                </Routes>
            </Router>
        </AuthProvider>
    );
}

export default App;
```

---

## Step 4: Update Login Component

```javascript
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            await login(email, password);
            navigate('/dashboard');
        } catch (error) {
            setError(error.message || 'Login failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-container">
            <h2>Login</h2>
            {error && <div className="error-message">{error}</div>}
            <form onSubmit={handleSubmit}>
                <div className="form-group">
                    <label>Email:</label>
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        disabled={loading}
                    />
                </div>
                <div className="form-group">
                    <label>Password:</label>
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        disabled={loading}
                    />
                </div>
                <button type="submit" disabled={loading}>
                    {loading ? 'Logging in...' : 'Login'}
                </button>
            </form>
            <p>
                Don't have an account? <Link to="/register">Register</Link>
            </p>
        </div>
    );
}

export default Login;
```

---

## Step 5: Update Dashboard Component

```javascript
import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getTransactions } from '../services/api';

function Dashboard() {
    const { user, logout } = useAuth();
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const data = await getTransactions();
                setTransactions(data);
            } catch (error) {
                setError(error.message);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    if (loading) return <div>Loading...</div>;
    if (error) return <div>Error: {error}</div>;

    return (
        <div className="dashboard">
            <header>
                <h1>Welcome, {user?.name}!</h1>
                <button onClick={logout}>Logout</button>
            </header>
            <div className="transactions-summary">
                <h2>Recent Transactions</h2>
                {transactions.length === 0 ? (
                    <p>No transactions yet</p>
                ) : (
                    <ul>
                        {transactions.slice(0, 5).map(transaction => (
                            <li key={transaction.id}>
                                {transaction.description} - R$ {Math.abs(transaction.value).toFixed(2)}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

export default Dashboard;
```

---

## Step 6: Handle Token Expiration

The `apiRequest` function already handles token refresh automatically. But you can also add a refresh interval:

```javascript
// In AuthContext.js

useEffect(() => {
    if (!user) return;

    // Refresh token every 10 minutes (before 15min expiration)
    const interval = setInterval(async () => {
        try {
            await refreshAccessToken();
            console.log('Token refreshed automatically');
        } catch (error) {
            console.error('Auto-refresh failed:', error);
            // Force logout if refresh fails
            logout();
        }
    }, 10 * 60 * 1000); // 10 minutes

    return () => clearInterval(interval);
}, [user]);
```

---

## Security Best Practices for Frontend

### 1. Token Storage

```javascript
// ✅ BEST: Store in memory (current implementation)
let accessToken = null;

// ⚠️ OK for education: localStorage
// localStorage.setItem('accessToken', token);

// ❌ NEVER: Regular cookies accessible by JavaScript
// document.cookie = `token=${token}`;
```

**Why memory storage?**
- Cleared on page refresh (more secure)
- Not accessible to other scripts
- Protected from XSS attacks

**Trade-off**: User must login again after page refresh. Can be mitigated by:
- Using refresh token to restore session
- Implementing "Remember me" with longer refresh token

### 2. Always Use credentials: 'include'

```javascript
// ✅ Always include
fetch(url, {
    credentials: 'include'
});

// ❌ Never omit
fetch(url);
```

### 3. Handle Errors Gracefully

```javascript
try {
    const response = await apiRequest('/records');
    if (!response.ok) {
        if (response.status === 401) {
            // Redirect to login
            navigate('/login');
        } else if (response.status === 403) {
            // Token expired, apiRequest will try to refresh
        } else {
            // Other errors
            throw new Error('Request failed');
        }
    }
} catch (error) {
    // Handle error
}
```

---

## Testing Frontend Integration

### Manual Test Flow

1. **Start both servers:**
```bash
# Terminal 1 - Backend
cd fin_app_backend
npm run dev

# Terminal 2 - Frontend
cd fin_app
npm start
```

2. **Test Registration:**
   - Visit http://localhost:3001/register
   - Fill form and submit
   - Should redirect to dashboard
   - Check browser DevTools > Application > Cookies
   - Should see `refreshToken` cookie

3. **Test Login:**
   - Logout
   - Visit http://localhost:3001/login
   - Login with credentials
   - Should redirect to dashboard

4. **Test Protected Routes:**
   - Try visiting dashboard without login
   - Should redirect to login

5. **Test Token Refresh:**
   - Login
   - Open DevTools > Network tab
   - Wait 11+ minutes (or change expiration to 1m for testing)
   - Make an API request
   - Should see /refresh call before actual request

6. **Test Logout:**
   - Click logout button
   - `refreshToken` cookie should be cleared
   - Should redirect to login

---

## Common Issues & Solutions

### Issue: CORS Error
```
Access to fetch at 'http://localhost:3000' from origin 'http://localhost:3001' 
has been blocked by CORS policy: The value of the 'Access-Control-Allow-Credentials' 
header in the response is '' which must be 'true'
```

**Solution:**
```javascript
// Backend app.js
app.use(cors({
    origin: 'http://localhost:3001',
    credentials: true // ← Make sure this is true!
}));
```

### Issue: Cookies Not Being Set
**Symptoms:** Login works but refresh fails

**Solution:**
1. Check backend sets cookie correctly
2. Check frontend sends `credentials: 'include'`
3. Verify same domain (both localhost)
4. Check `secure` flag is `false` in development

### Issue: Infinite Redirect Loop
**Symptoms:** Keeps redirecting between login and dashboard

**Solution:**
```javascript
// Make sure ProtectedRoute checks loading state
if (loading) {
    return <div>Loading...</div>;
}
```

### Issue: Token Expired Immediately
**Symptoms:** Always get 403 errors

**Solution:**
1. Check backend and frontend clocks are synced
2. Verify JWT_ACCESS_EXPIRATION is set correctly
3. Check if token is being sent in correct format

---

## Production Deployment Checklist

### Backend
- [ ] Use HTTPS only
- [ ] Set `secure: true` for cookies
- [ ] Set `NODE_ENV=production`
- [ ] Use strong, unique secrets
- [ ] Set appropriate CORS origins
- [ ] Enable rate limiting
- [ ] Implement proper logging

### Frontend
- [ ] Update API_URL to production backend
- [ ] Handle all error cases
- [ ] Show loading states
- [ ] Implement token refresh
- [ ] Add "Remember me" option
- [ ] Test on different browsers

---

## Summary

You now have a complete JWT authentication system with:
- ✅ Secure password hashing
- ✅ Access and refresh tokens
- ✅ HTTP-only cookies for refresh tokens
- ✅ Automatic token refresh
- ✅ Protected routes
- ✅ Error handling
- ✅ Security best practices

## Next Steps

1. **Add more features:**
   - Password reset
   - Email verification
   - Two-factor authentication
   - User roles/permissions

2. **Improve UX:**
   - Better error messages
   - Loading indicators
   - Remember me functionality

3. **Enhance security:**
   - Rate limiting
   - Token blacklisting
   - Session management
   - IP tracking

---

**Congratulations! 🎉** You've implemented production-ready JWT authentication!
