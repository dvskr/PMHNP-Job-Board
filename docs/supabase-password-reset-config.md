# Supabase Configuration for Password Reset

This document outlines the required Supabase configuration for the password reset functionality to work correctly.

## Authentication URL Configuration

In your Supabase dashboard, navigate to **Authentication > URL Configuration** and set the following:

### Production Environment

- **Site URL**: `https://pmhnphiring.com`
- **Redirect URLs**: Add the following URLs:
  - `https://pmhnphiring.com/auth/callback`
  - `https://pmhnphiring.com/auth/callback*` (wildcard to allow query parameters)

### Development Environment

- **Site URL**: `http://localhost:3000`
- **Redirect URLs**: Add the following URLs:
  - `http://localhost:3000/auth/callback`
  - `http://localhost:3000/auth/callback*` (wildcard to allow query parameters)

## How Password Reset Works

1. User requests password reset via `/forgot-password` or `/settings` page
2. Supabase sends an email with a magic link containing an authentication code
3. User clicks the link → redirected to `/auth/callback?code=xxx&next=/reset-password`
4. The auth callback route exchanges the code for a valid session
5. User is then redirected to `/reset-password` with an active session
6. User can now update their password using the authenticated session

## Testing the Configuration

To verify the configuration is correct:

1. Go to `/forgot-password`
2. Enter your email address
3. Check your email for the reset link
4. The link should look like: `https://pmhnphiring.com/auth/callback?code=...&next=/reset-password`
5. Clicking it should redirect you to the reset password page without errors

## Troubleshooting

**Error: "auth session is missing"**
- ✅ **Fixed**: This was caused by incorrect redirect URLs. The fix ensures all password reset flows go through `/auth/callback` first.

**Error: "redirect URL not allowed"**
- **Solution**: Make sure the redirect URL is added to the allowed list in Supabase dashboard
- **Note**: The URL must match exactly, including the protocol (http vs https)

**Error: "invalid or expired reset link"**
- **Cause**: Reset links expire after 1 hour for security
- **Solution**: Request a new reset link
