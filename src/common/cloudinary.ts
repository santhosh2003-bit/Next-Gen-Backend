import {v2 as cloudinary} from 'cloudinary';
import {env} from '../config/env.js';

cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
})

export async function deleteFromCloudinary(publicId?: string | null) {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
  } catch (err) {
    // Log but don't throw — a failed remote delete shouldn't block the DB op.
    console.error('Cloudinary destroy failed for', publicId, err);
  }
}
export {cloudinary};