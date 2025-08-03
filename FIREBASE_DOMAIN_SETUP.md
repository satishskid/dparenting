# Firebase Domain Authorization Setup

## Issue Description
Google OAuth sign-in is currently failing because the domain `digiparenting.netlify.app` is not authorized in your Firebase project settings.

## Error Message
```
Firebase: This domain is not authorized for OAuth operations for your Firebase project. Edit the list of authorized domains from the Firebase console. (auth/unauthorized-domain).
```

## Solution Steps

### Step 1: Access Firebase Console
1. Go to https://console.firebase.google.com
2. Sign in with your Google account
3. Select your project: **digital-parenting-app**

### Step 2: Navigate to Authentication Settings
1. In the left sidebar, click **Authentication**
2. Click on the **Settings** tab
3. Click on the **Authorized domains** tab

### Step 3: Add Authorized Domain
1. Click **Add domain**
2. Enter: `digiparenting.netlify.app`
3. Click **Add**

### Step 4: Verify Other Required Domains
Make sure these domains are also in your authorized list:
- `localhost` (for local development)
- `digiparenting.netlify.app` (production domain)
- Any other custom domains you plan to use

### Step 5: Re-enable Google Sign-in
After adding the domain, you can:
1. Remove the `disabled` attribute from the Google sign-in button
2. Update the button text back to "Sign in with Google"
3. Remove the temporary notice

## Code Changes to Make After Domain Authorization

### In `index.html`, update the Google sign-in button:
```html
<button class="btn btn--outline btn--full-width google-btn" onclick="signInWithGoogle()">
    <!-- SVG icon -->
    Sign in with Google
</button>
```

### Remove the temporary notice:
```html
<!-- Remove this entire div -->
<div class="google-signin-notice">
    <p style="font-size: 12px; color: #666; text-align: center; margin-bottom: 10px;">
        <strong>Note:</strong> Google sign-in is temporarily unavailable. Please use email sign-in above.
    </p>
</div>
```

## Testing
1. After making the changes in Firebase Console
2. Wait 2-3 minutes for changes to propagate
3. Test Google sign-in on the live site
4. Verify no console errors appear

## Alternative Domains
If you plan to use custom domains in the future, make sure to add them to the authorized domains list before deployment.

## Security Note
Only add domains you own and trust to this list, as any domain in this list can initiate OAuth flows for your Firebase project.
