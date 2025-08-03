# SKIDS Interactive Training Module

A comprehensive parenting training platform focused on understanding teen brain development and positive parenting strategies.

## Features

### 🎯 Core Training Content
- **Brain Needs**: Understanding 4 core teen developmental needs
- **Family Stories**: Interactive scenarios comparing approaches  
- **ABCDE Method**: Step-by-step problem-solving framework
- **Practical Toolkit**: Worksheets and conversation starters
- **Completion Certificates**: Generated for finished training

### 🔐 Authentication & Analytics
- Firebase Authentication (Email + Google)
- User progress tracking
- School-specific analytics
- Admin dashboard with usage metrics
- Partner branding customization

### 👨‍💼 Admin Features
- Real-time usage analytics per school
- User engagement tracking
- School customization (logos, branding)
- Data export functionality
- Multi-school management

## Tech Stack

- **Frontend**: HTML5, CSS3, Vanilla JavaScript (ES6 modules)
- **Backend**: Firebase (Auth, Firestore, Storage, Analytics)
- **Deployment**: Netlify
- **Charts**: Chart.js

## Setup Instructions

### 1. Firebase Configuration
Your Firebase project is already configured with:
- Project ID: `digital-parenting-app`
- Authentication providers: Email/Password, Google
- Firestore database
- Cloud Storage

### 2. Admin Access
- Admin email: `admin@skids.health` (change in app.js)
- Admin password: `skids2025` (change in app.js)

### 3. Deploy to Netlify

#### Option A: Drag & Drop
1. Zip the project folder
2. Go to [netlify.com](https://netlify.com)
3. Drag the zip file to deploy

#### Option B: Git Integration
1. Push code to GitHub/GitLab
2. Connect repository to Netlify
3. Auto-deploy on commits

### 4. Custom Domain & School Links
- Main site: `https://yoursite.netlify.app`
- School-specific: `https://yoursite.netlify.app/school/school-name`
- Direct access: `https://yoursite.netlify.app` (tracked as 'direct')

## Usage

### For Schools
1. Admin provides school-specific link: `/school/school-name`
2. Teachers share link with parents
3. Parents sign up/sign in to access training
4. Progress automatically tracked per school

### For Parents
1. Access via school link or direct
2. Sign up with email or Google
3. Complete training modules at own pace
4. Generate completion certificate

### For Admins
1. Sign in with admin credentials
2. Access admin panel (⚙️ button)
3. View analytics, manage schools, customize branding
4. Export usage data

## Firestore Database Structure

```
users/
  {userId}/
    - email: string
    - displayName: string
    - currentSchool: string
    - progress: object
    - totalSessions: number
    - createdAt: timestamp

schools/
  {schoolId}/
    - name: string
    - totalUsers: number
    - totalSessions: number
    - lastActivity: timestamp

partner-branding/
  current/
    - name: string
    - logoURL: string
    - email: string
    - website: string

settings/
  app/
    - enableAnalytics: boolean
    - showProgress: boolean
    - enableCertificates: boolean
```

## Customization

### School Branding
- Upload school logos via admin panel
- Customize organization name and contact info
- Changes reflect on main training page

### Analytics Tracking
- User registration and login events
- Section completion tracking  
- Session duration monitoring
- School-specific usage metrics

## Security Considerations

### Production Deployment
1. Change admin password in `app.js`
2. Set up proper Firebase security rules
3. Enable HTTPS only
4. Configure CORS settings
5. Hash admin passwords (currently plain text)

### Firebase Security Rules Example
```javascript
// Firestore rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /schools/{schoolId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }
    match /partner-branding/{document} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.token.email == 'admin@skids.health';
    }
  }
}
```

## Support

For technical support or customization requests:
- Email: hello@skids.health
- Address: Number-518, VV Arcade, 1st Main Road, Block B, AECS Layout, Kundalahalli, Marathahalli, Bangalore

## License

© 2025 SKIDS. All rights reserved.
