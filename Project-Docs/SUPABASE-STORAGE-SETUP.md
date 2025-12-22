# Supabase Storage Setup Guide

## Overview

This project uses **two separate Supabase Storage buckets** for file uploads:
- **`resumes`** - Private bucket (uses signed URLs)
- **`avatars`** - Public bucket (uses public URLs)

Files are organized by environment using prefixes: `local/`, `dev/`, `prod/`

---

## 📁 Bucket Structure

```
resumes/ (PRIVATE)
├── local/
│   └── userId/
│       └── timestamp-filename.pdf
├── dev/
│   └── userId/
└── prod/
    └── userId/

avatars/ (PUBLIC)
├── local/
│   └── userId/
│       └── timestamp.jpg
├── dev/
│   └── userId/
└── prod/
    └── userId/
```

---

## 🔧 Setup Instructions

### Step 1: Create Buckets in Supabase

1. **Go to Supabase Dashboard** → Storage
2. **Create `resumes` bucket:**
   - Name: `resumes`
   - ❌ **UN-check "Public bucket"** (make it private)
   - Click **Create**

3. **Create `avatars` bucket:**
   - Name: `avatars`
   - ✅ **Check "Public bucket"** (make it public)
   - Click **Create**

---

### Step 2: Set Up Bucket Policies

#### For `resumes` (Private Bucket):

```sql
-- Allow authenticated users to upload their own files
CREATE POLICY "Users can upload own resumes"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'resumes' 
  AND (storage.foldername(name))[2] = auth.uid()::text
);

-- Allow users to read their own files
CREATE POLICY "Users can read own resumes"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'resumes' 
  AND (storage.foldername(name))[2] = auth.uid()::text
);

-- Allow users to delete their own files
CREATE POLICY "Users can delete own resumes"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'resumes' 
  AND (storage.foldername(name))[2] = auth.uid()::text
);

-- Allow service role full access (for backend operations)
CREATE POLICY "Service role full access to resumes"
ON storage.objects
FOR ALL
TO service_role
USING (bucket_id = 'resumes')
WITH CHECK (bucket_id = 'resumes');
```

#### For `avatars` (Public Bucket):

```sql
-- Allow anyone to read avatars
CREATE POLICY "Public read access"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'avatars');

-- Allow authenticated users to upload their own avatars
CREATE POLICY "Users can upload own avatars"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars' 
  AND (storage.foldername(name))[2] = auth.uid()::text
);

-- Allow users to delete their own avatars
CREATE POLICY "Users can delete own avatars"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars' 
  AND (storage.foldername(name))[2] = auth.uid()::text
);

-- Allow service role full access
CREATE POLICY "Service role full access to avatars"
ON storage.objects
FOR ALL
TO service_role
USING (bucket_id = 'avatars')
WITH CHECK (bucket_id = 'avatars');
```

---

### Step 3: Environment Variables

Add these to your environment configuration:

#### Local Development (`.env.local`):
```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
STORAGE_UPLOAD_PREFIX=local
```

#### Dev Environment (Vercel):
```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
STORAGE_UPLOAD_PREFIX=dev
```

#### Production Environment (Vercel):
```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
STORAGE_UPLOAD_PREFIX=prod
```

**Where to find these keys:**
1. Go to **Supabase Dashboard** → Project Settings → API
2. **Project URL** = `NEXT_PUBLIC_SUPABASE_URL`
3. **anon/public** key = `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. **service_role** key = `SUPABASE_SERVICE_ROLE_KEY` ⚠️ Keep this secret!

---

## 🔐 Security Model

### Resumes (Private):
- ✅ Stored in **private bucket**
- ✅ Access via **signed URLs** (expire after 1 year)
- ✅ Only the owner can upload/view/delete
- ✅ Service role has full access (for admin operations)

### Avatars (Public):
- ✅ Stored in **public bucket**
- ✅ Access via **public URLs** (no expiration)
- ✅ Anyone can view, only owner can upload/delete
- ✅ Service role has full access

---

## 📝 Usage

### Upload a Resume:
```typescript
import { uploadResume } from '@/lib/supabase-storage';

const result = await uploadResume(buffer, fileName, fileType, userId);
// Returns: { path: 'local/userId/123-resume.pdf', url: 'https://...?token=...' }
```

### Upload an Avatar:
```typescript
import { uploadAvatar } from '@/lib/supabase-storage';

const result = await uploadAvatar(buffer, fileName, fileType, userId);
// Returns: { path: 'local/userId/123.jpg', url: 'https://...' }
```

### API Endpoint:
```typescript
// POST /api/upload
const formData = new FormData();
formData.append('file', file);
formData.append('userId', userId);
formData.append('type', 'resume'); // or 'avatar'

const response = await fetch('/api/upload', {
  method: 'POST',
  body: formData,
});
```

---

## 🚀 File Limits

- **Resumes:** PDF, DOC, DOCX - Max 5MB
- **Avatars:** JPEG, PNG, WebP - Max 2MB

---

## 🔄 Environment Isolation

All environments (local, dev, prod) share the **same buckets** but use different **prefixes**:
- Local files: `local/userId/...`
- Dev files: `dev/userId/...`
- Prod files: `prod/userId/...`

This keeps costs down while maintaining data separation! 🎯
