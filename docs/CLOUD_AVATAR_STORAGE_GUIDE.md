# Cloud Avatar Storage with Cloudinary

## Why Move Away from Base64?

Currently, our `PUT /users/avatar` route converts the uploaded image to a base64 data URI and stores it directly in MongoDB's `avatarUrl` field. This works, but has serious scalability problems:

| Problem | Impact |
|---|---|
| **Document bloat** | A 1MB image becomes ~1.33MB in base64, stored in every User document |
| **Slow queries** | Every query that returns user data transfers the entire image string |
| **No CDN** | Images are served from your API server, not from edge locations |
| **No transformations** | Can't resize, crop, or optimize on-the-fly |
| **MongoDB 16MB doc limit** | Large images eat into available space for other user data |

The solution: upload images to a **cloud storage service** and store only the URL in MongoDB.

We'll use **Cloudinary** because it's free for small projects (25 credits/month ≈ 25k transformations), has an excellent Node.js SDK, and provides automatic image optimization + CDN.

> **Alternatives**: AWS S3 + CloudFront, Google Cloud Storage, Azure Blob Storage, Supabase Storage. The pattern is the same — upload to cloud, store URL — only the SDK changes.

---

## Step 1: Create a Cloudinary Account

1. Go to [cloudinary.com](https://cloudinary.com) and sign up (free tier is enough)
2. After signing in, go to the **Dashboard**
3. You'll see three values you need:
   - **Cloud Name** (e.g., `dxyz1234abc`)
   - **API Key** (e.g., `123456789012345`)
   - **API Secret** (e.g., `abcDEF-ghiJKL_mnoPQR`)

---

## Step 2: Add Environment Variables

Add these to your `.env` file:

```env
# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

> **Security**: These are already gitignored via `.env`. Never commit them.

---

## Step 3: Install the SDK

```bash
npm install cloudinary
```

This is the official Cloudinary Node.js SDK (v2). It supports upload, transformation, deletion, and more.

---

## Step 4: Create the Cloudinary Config

Create a new file `src/config/cloudinary.js`:

```javascript
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

module.exports = cloudinary;
```

### What's happening here?

- We import `cloudinary.v2` (the current API version)
- `cloudinary.config()` sets the credentials globally for all subsequent calls
- We export the configured instance so any file can use it

---

## Step 5: Create an Upload Utility

Create `src/utils/upload.utils.js`:

```javascript
const cloudinary = require('../config/cloudinary');

/**
 * Uploads a buffer (from multer) to Cloudinary.
 * 
 * @param {Buffer} fileBuffer - The image file buffer
 * @param {string} userId - Used to create a unique public_id
 * @returns {Promise<{url: string, publicId: string}>}
 */
async function uploadAvatar(fileBuffer, userId) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'fin_app/avatars',       // Organized in a folder
        public_id: `user_${userId}`,      // Deterministic name = auto-replaces old avatar
        overwrite: true,                  // Replace if exists
        transformation: [
          { width: 300, height: 300, crop: 'fill', gravity: 'face' },  // Smart crop to face
          { quality: 'auto', fetch_format: 'auto' }                     // Auto-optimize
        ]
      },
      (error, result) => {
        if (error) return reject(error);
        resolve({
          url: result.secure_url,   // HTTPS URL served from Cloudinary CDN
          publicId: result.public_id
        });
      }
    );

    // Pipe the buffer into the upload stream
    uploadStream.end(fileBuffer);
  });
}

/**
 * Deletes an avatar from Cloudinary.
 * 
 * @param {string} userId - The user whose avatar to delete
 */
async function deleteAvatar(userId) {
  try {
    await cloudinary.uploader.destroy(`fin_app/avatars/user_${userId}`);
  } catch (error) {
    console.error('Cloudinary delete error:', error.message);
    // Non-critical — don't throw
  }
}

module.exports = { uploadAvatar, deleteAvatar };
```

### Key concepts explained:

- **`upload_stream`**: Cloudinary accepts streams, not just file paths. Since multer gives us a `Buffer` (we use `memoryStorage`), we pipe it into an upload stream. This avoids writing temp files to disk.

- **`folder`**: Organizes uploads in Cloudinary's media library. Think of it like an S3 prefix.

- **`public_id`**: A deterministic ID based on the user. Because we set `overwrite: true`, uploading a new avatar automatically replaces the old one — no orphaned images.

- **`transformation`**: Cloudinary processes the image server-side:
  - `crop: 'fill'` + `gravity: 'face'` = crops to 300x300 centered on the detected face
  - `quality: 'auto'` = Cloudinary picks optimal quality/size balance
  - `fetch_format: 'auto'` = serves WebP to browsers that support it, JPEG otherwise

- **`secure_url`**: The HTTPS CDN URL (e.g., `https://res.cloudinary.com/dxyz/image/upload/v1234/fin_app/avatars/user_abc123.webp`). This is what we store in MongoDB.

---

## Step 6: Update the Avatar Route

In `src/routes/userData.routes.js`, replace the current avatar handler:

```javascript
// Add at the top
const { uploadAvatar } = require('../utils/upload.utils');

// Replace the PUT /avatar handler:
router.put('/avatar', authenticateToken, avatarUpload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json(createError(400, 'Nenhuma imagem enviada'));
    }

    // Upload to Cloudinary (replaces old avatar automatically)
    const { url } = await uploadAvatar(req.file.buffer, req.user.id);

    // Store only the URL in MongoDB
    const user = await userService.updateUser(req.user.id, { avatarUrl: url });
    res.json({ avatarUrl: user.avatarUrl });
  } catch (error) {
    console.error('Avatar upload error:', error);
    res.status(500).json(createError(500, error.message || 'Erro ao atualizar avatar'));
  }
});
```

### Before vs After:

| Aspect | Before (base64) | After (Cloudinary) |
|---|---|---|
| Stored in MongoDB | ~1.3MB string | ~100 char URL |
| Served from | Your API server | Cloudinary CDN (200+ edge locations) |
| Image optimization | None | Auto quality + format |
| Resizing | None | Auto crop to 300x300 |
| Old avatars | Accumulate in DB | Auto-replaced via `overwrite` |

---

## Step 7: Clean Up on User Deletion

In `src/services/user.service.js`, update `deleteUser`:

```javascript
const { deleteAvatar } = require('../utils/upload.utils');

async deleteUser(id) {
  await transactionService.deleteAllUserTransactions(id);
  await deleteAvatar(id);  // Clean up cloud storage
  return await User.findByIdAndDelete(id);
}

async adminDeleteUser(id) {
  await transactionService.deleteAllUserTransactions(id);
  await deleteAvatar(id);  // Clean up cloud storage
  return await User.findByIdAndDelete(id);
}
```

Same for `adminDeleteUser`.

---

## Step 8: Test It

```bash
# Upload an avatar
curl -X PUT http://localhost:3000/users/avatar \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "avatar=@/path/to/photo.jpg"

# Response:
# { "avatarUrl": "https://res.cloudinary.com/your-cloud/image/upload/v1234/fin_app/avatars/user_abc.webp" }
```

---

## Cost & Limits (Free Tier)

| Resource | Free Limit |
|---|---|
| Storage | 25 credits/month |
| Bandwidth | Included in credits |
| Transformations | Included in credits |
| Max file size | 10MB |

For a finance app with avatar uploads only, the free tier will last a very long time. One avatar upload + transformation ≈ 1 credit.

---

## Recap

1. **Never store binary/base64 data in MongoDB** for production apps
2. Upload to a cloud service → store only the URL
3. Use deterministic `public_id` to auto-replace old files
4. Apply transformations at upload time for consistent sizing
5. Clean up cloud assets when deleting users
6. The CDN handles caching and global delivery automatically
