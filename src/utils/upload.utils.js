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