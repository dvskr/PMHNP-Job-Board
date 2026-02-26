import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client for storage operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Use service role for server-side operations
);

const RESUME_BUCKET = 'resumes'; // Private bucket for resumes
const AVATAR_BUCKET = 'avatars'; // Public bucket for avatars
const UPLOAD_PREFIX = process.env.STORAGE_UPLOAD_PREFIX || 'local'; // local, dev, or prod

// Allowed file types
const ALLOWED_RESUME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
];

const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
];

// Max file sizes (in bytes)
const MAX_RESUME_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_IMAGE_SIZE = 2 * 1024 * 1024;  // 2MB

/**
 * Upload a resume file to Supabase Storage
 */
export async function uploadResume(
  file: Buffer,
  fileName: string,
  fileType: string,
  userId: string
): Promise<{ path: string; url: string }> {
  // Validate file type
  if (!ALLOWED_RESUME_TYPES.includes(fileType)) {
    throw new Error('Invalid file type. Only PDF and DOC/DOCX files are allowed.');
  }

  // Validate file size
  if (file.length > MAX_RESUME_SIZE) {
    throw new Error(`File size exceeds maximum of ${MAX_RESUME_SIZE / 1024 / 1024}MB`);
  }

  // Generate unique path
  const timestamp = Date.now();
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
  const path = `${UPLOAD_PREFIX}/${userId}/${timestamp}-${sanitizedFileName}`;

  // Upload to Supabase Storage (private bucket)
  const { data, error } = await supabase.storage
    .from(RESUME_BUCKET)
    .upload(path, file, {
      contentType: fileType,
      upsert: false,
    });

  if (error) {
    console.error('Supabase upload error:', error);
    throw new Error(`Failed to upload resume: ${error.message}`);
  }

  // Get signed URL (valid for 1 hour for resumes — short-lived to protect PII)
  const { data: urlData, error: urlError } = await supabase.storage
    .from(RESUME_BUCKET)
    .createSignedUrl(data.path, 3600); // 1 hour in seconds

  if (urlError) {
    throw new Error(`Failed to generate URL: ${urlError.message}`);
  }

  return {
    path: data.path,
    url: urlData.signedUrl,
  };
}

/**
 * Upload an avatar/profile image to Supabase Storage
 */
export async function uploadAvatar(
  file: Buffer,
  fileName: string,
  fileType: string,
  userId: string
): Promise<{ path: string; url: string }> {
  // Validate file type
  if (!ALLOWED_IMAGE_TYPES.includes(fileType)) {
    throw new Error('Invalid file type. Only JPEG, PNG, and WebP images are allowed.');
  }

  // Validate file size
  if (file.length > MAX_IMAGE_SIZE) {
    throw new Error(`File size exceeds maximum of ${MAX_IMAGE_SIZE / 1024 / 1024}MB`);
  }

  // Generate unique path
  const timestamp = Date.now();
  const extension = fileName.split('.').pop();
  const path = `${UPLOAD_PREFIX}/${userId}/${timestamp}.${extension}`;

  // Upload to Supabase Storage (public bucket)
  const { data, error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, file, {
      contentType: fileType,
      upsert: false,
    });

  if (error) {
    console.error('Supabase upload error:', error);
    throw new Error(`Failed to upload avatar: ${error.message}`);
  }

  // Get public URL (avatars are public)
  const { data: urlData } = supabase.storage
    .from(AVATAR_BUCKET)
    .getPublicUrl(data.path);

  return {
    path: data.path,
    url: urlData.publicUrl,
  };
}

/**
 * Delete a file from Supabase Storage
 */
export async function deleteFile(path: string, fileType: 'resume' | 'avatar'): Promise<void> {
  const bucket = fileType === 'resume' ? RESUME_BUCKET : AVATAR_BUCKET;

  const { error } = await supabase.storage
    .from(bucket)
    .remove([path]);

  if (error) {
    console.error('Supabase delete error:', error);
    throw new Error(`Failed to delete file: ${error.message}`);
  }
}

/**
 * Get a signed URL for a resume file (valid for 1 hour)
 */
export async function getResumeUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(RESUME_BUCKET)
    .createSignedUrl(path, 3600); // 1 hour in seconds

  if (error) {
    throw new Error(`Failed to generate URL: ${error.message}`);
  }

  return data.signedUrl;
}

/**
 * Get a public URL for an avatar file
 */
export function getAvatarUrl(path: string): string {
  const { data } = supabase.storage
    .from(AVATAR_BUCKET)
    .getPublicUrl(path);

  return data.publicUrl;
}

/**
 * Extract the storage path from a full URL
 */
export function getPathFromUrl(url: string): string | null {
  try {
    // For signed URLs (resumes): https://xxx.supabase.co/storage/v1/object/sign/resumes/path?token=...
    const signMatch = url.match(/\/storage\/v1\/object\/sign\/[^/]+\/(.+?)(?:\?|$)/);
    if (signMatch) return signMatch[1];

    // For public URLs (avatars): https://xxx.supabase.co/storage/v1/object/public/avatars/path
    const publicMatch = url.match(/\/storage\/v1\/object\/public\/[^/]+\/(.+)$/);
    return publicMatch ? publicMatch[1] : null;
  } catch {
    return null;
  }
}

/**
 * Magic byte signatures for file type verification.
 * Prevents attackers from uploading malicious files with spoofed MIME types.
 */
const MAGIC_BYTES: Record<string, { offset: number; bytes: number[] }[]> = {
  // PDF: starts with %PDF
  'application/pdf': [{ offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] }],
  // DOCX/XLSX/PPTX (ZIP-based): starts with PK
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
    { offset: 0, bytes: [0x50, 0x4B, 0x03, 0x04] },
    { offset: 0, bytes: [0x50, 0x4B, 0x05, 0x06] },
  ],
  // Legacy DOC: starts with D0 CF 11 E0
  'application/msword': [
    { offset: 0, bytes: [0xD0, 0xCF, 0x11, 0xE0] },
    // Some .doc files are actually DOCX (PK signature)
    { offset: 0, bytes: [0x50, 0x4B, 0x03, 0x04] },
  ],
  // JPEG: starts with FF D8 FF
  'image/jpeg': [{ offset: 0, bytes: [0xFF, 0xD8, 0xFF] }],
  'image/jpg': [{ offset: 0, bytes: [0xFF, 0xD8, 0xFF] }],
  // PNG: starts with 89 50 4E 47
  'image/png': [{ offset: 0, bytes: [0x89, 0x50, 0x4E, 0x47] }],
  // WebP: starts with RIFF....WEBP
  'image/webp': [{ offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] }],
};

function verifyMagicBytes(buffer: Buffer, fileType: string): boolean {
  const signatures = MAGIC_BYTES[fileType];
  if (!signatures) return true; // Unknown type — skip magic byte check

  return signatures.some(sig => {
    if (buffer.length < sig.offset + sig.bytes.length) return false;
    return sig.bytes.every((byte, i) => buffer[sig.offset + i] === byte);
  });
}

/**
 * Validate file before upload
 */
export function validateFile(
  buffer: Buffer,
  fileName: string,
  fileType: string,
  uploadType: 'resume' | 'avatar'
): { valid: boolean; error?: string } {
  const maxSize = uploadType === 'resume' ? MAX_RESUME_SIZE : MAX_IMAGE_SIZE;
  const allowedTypes = uploadType === 'resume' ? ALLOWED_RESUME_TYPES : ALLOWED_IMAGE_TYPES;

  if (buffer.length > maxSize) {
    return {
      valid: false,
      error: `File size exceeds maximum of ${maxSize / 1024 / 1024}MB`,
    };
  }

  if (!allowedTypes.includes(fileType)) {
    return {
      valid: false,
      error: `Invalid file type. Allowed types: ${allowedTypes.join(', ')}`,
    };
  }

  // Verify magic bytes to prevent MIME type spoofing
  if (!verifyMagicBytes(buffer, fileType)) {
    return {
      valid: false,
      error: 'File content does not match declared file type',
    };
  }

  return { valid: true };
}

