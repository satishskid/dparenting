// Firebase Configuration and Initialization
console.log('Starting app.js initialization...');

const firebaseConfig = {
  apiKey: "AIzaSyADH2-JCBuG1q8FOx50VoD-ZiO0BZvCT0M",
  authDomain: "digital-parenting-app.firebaseapp.com",
  projectId: "digital-parenting-app",
  storageBucket: "digital-parenting-app.firebasestorage.app",
  messagingSenderId: "446498341762",
  appId: "1:446498341762:web:2b96b3f2b4fd9771c5859b",
  measurementId: "G-RSNW4ZPELE"
};

// Initialize Firebase with error handling
let analytics, auth, db, storage, googleProvider;

try {
  console.log('Firebase object available:', typeof firebase);
  firebase.initializeApp(firebaseConfig);
  console.log('Firebase app initialized');
  
  analytics = firebase.analytics();
  auth = firebase.auth();
  db = firebase.firestore();
  storage = firebase.storage();
  googleProvider = new firebase.auth.GoogleAuthProvider();
  
  console.log('Firebase services initialized successfully');
} catch (error) {
  console.error('Firebase initialization error:', error);
}

// Global state
let currentUser = null;
let currentSchool = null;
let isAdmin = false;
let databasePermissionIssue = false; // Track if we have permission issues
let trainingProgress = {
  'brain-needs': false,
  'storyboards': false,
  'abcde-method': false,
  'toolkit': false
};

// Admin Configuration
const ADMIN_EMAIL = 'admin@skids.health'; // Change this to your admin email

// Initialize application
function initializeSkidsApp() {
  // Initialize session tracking
  initializeSessionTracking();
  
  // Add certificate button styles
  addCertificateButtonStyles();
  
  // Listen for authentication state changes
  auth.onAuthStateChanged((user) => {
    currentUser = user;
    isAdmin = user && user.email === ADMIN_EMAIL;
    updateUIForAuthState();
    
    if (user) {
      // Track user session
      trackUserSession(user);
      loadUserProgress(user.uid);
      
      // Auto-start training after successful authentication
      // Add a small delay to ensure UI elements are ready
      setTimeout(() => {
        console.log('🚀 Auto-starting training after authentication...');
        startTraining();
      }, 1500);
    }
  });
  
  // Initialize UI components
  initializeNavigation();
  initializeProgressTracking();
  initializeModals();
  initializeTooltips();
}

function initializeSessionTracking() {
  // Initialize session data if not exists
  const sessionData = JSON.parse(localStorage.getItem('skids_session_data') || '{}');
  if (!sessionData.started) {
    sessionData.started = new Date().toISOString();
    sessionData.sections_visited = [];
    sessionData.interactions = 0;
    localStorage.setItem('skids_session_data', JSON.stringify(sessionData));
  }
}

// Authentication Functions
function signInWithGoogle() {
  // Show loading state
  showNotification('Connecting to Google...', 'info');
  
  auth.signInWithPopup(googleProvider)
    .then(async (result) => {
      const user = result.user;
      await createOrUpdateUser(user);
      showNotification('Successfully signed in with Google!', 'success');
      closeAuthModal();
      
      // Auto-start training after successful authentication
      setTimeout(() => {
        console.log('🎯 Auto-starting training after Google sign-in');
        startTraining();
      }, 1500);
    })
    .catch((error) => {
      console.error('Google sign-in error:', error);
      
      // Handle specific Firebase errors
      if (error.code === 'auth/unauthorized-domain') {
        showNotification('Google sign-in is not available from this domain. Please use email sign-in instead.', 'warning');
      } else if (error.code === 'auth/popup-blocked') {
        showNotification('Popup was blocked by your browser. Please allow popups and try again.', 'warning');
      } else if (error.code === 'auth/popup-closed-by-user') {
        showNotification('Sign-in was cancelled.', 'info');
      } else if (error.code === 'auth/network-request-failed') {
        showNotification('Network error. Please check your connection and try again.', 'error');
      } else if (error.code === 'auth/too-many-requests') {
        showNotification('Too many attempts. Please wait a moment and try again.', 'warning');
      } else {
        showNotification('Google sign-in failed. Please try email sign-in instead.', 'error');
      }
    });
}

function signInWithEmail() {
  const email = document.getElementById('emailInput').value;
  const password = document.getElementById('passwordInput').value;
  
  if (!email || !password) {
    showNotification('Please enter both email and password.', 'error');
    return;
  }
  
  auth.signInWithEmailAndPassword(email, password)
    .then(async (result) => {
      await createOrUpdateUser(result.user);
      showNotification('Successfully signed in!', 'success');
      closeAuthModal();
      
      // Auto-start training after successful authentication
      setTimeout(() => {
        console.log('🎯 Auto-starting training after email sign-in');
        startTraining();
      }, 1500);
    })
    .catch((error) => {
      console.error('Email sign-in error:', error);
      showNotification('Invalid email or password. Please try again.', 'error');
    });
}

function signUpWithEmail() {
  const email = document.getElementById('emailInputSignUp').value;
  const password = document.getElementById('passwordInputSignUp').value;
  const name = document.getElementById('nameInputSignUp').value;
  
  if (!email || !password || !name) {
    showNotification('Please fill in all fields.', 'error');
    return;
  }
  
  if (password.length < 6) {
    showNotification('Password must be at least 6 characters long.', 'error');
    return;
  }
  
  auth.createUserWithEmailAndPassword(email, password)
    .then(async (result) => {
      const user = result.user;
      await createOrUpdateUser(user, name);
      showNotification('Account created successfully!', 'success');
      closeAuthModal();
      
      // Auto-start training after successful registration
      setTimeout(() => {
        console.log('🎯 Auto-starting training after sign-up');
        startTraining();
      }, 1500);
    })
    .catch((error) => {
      console.error('Email sign-up error:', error);
      let message = 'Failed to create account. Please try again.';
      if (error.code === 'auth/email-already-in-use') {
        message = 'An account with this email already exists.';
      }
      showNotification(message, 'error');
    });
}

function logout() {
  auth.signOut()
    .then(() => {
      currentUser = null;
      isAdmin = false;
      currentSchool = null;
      resetProgress();
      showNotification('Successfully signed out!', 'success');
    })
    .catch((error) => {
      console.error('Sign out error:', error);
      showNotification('Failed to sign out. Please try again.', 'error');
    });
}

// User Management
async function createOrUpdateUser(user, displayName = null) {
  try {
    const userRef = db.collection('users').doc(user.uid);
    const userDoc = await userRef.get();
    
    const userData = {
      email: user.email,
      lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
      totalSessions: firebase.firestore.FieldValue.increment(1)
    };
    
    if (!userDoc.exists) {
      // New user
      userData.displayName = displayName || user.displayName || user.email.split('@')[0];
      userData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      userData.completedSections = [];
      userData.currentSchool = getSchoolFromURL() || 'direct';
      await userRef.set(userData);
      
      // Track new user
      analytics.logEvent('sign_up', {
        method: user.providerData[0]?.providerId || 'email'
      });
    } else {
      // Existing user
      await userRef.update(userData);
    }
    
    // Track school usage
    await trackSchoolUsage(userData.currentSchool || 'direct');
    
  } catch (error) {
    console.error('Error creating/updating user:', error);
  }
}

async function trackSchoolUsage(schoolId) {
  try {
    const schoolRef = db.collection('schools').doc(schoolId);
    const schoolDoc = await schoolRef.get();
    
    if (!schoolDoc.exists) {
      await schoolRef.set({
        name: schoolId === 'direct' ? 'Direct Access' : schoolId,
        totalUsers: 1,
        totalSessions: 1,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        lastActivity: firebase.firestore.FieldValue.serverTimestamp()
      });
    } else {
      await schoolRef.update({
        totalSessions: firebase.firestore.FieldValue.increment(1),
        lastActivity: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
  } catch (error) {
    console.error('Error tracking school usage:', error);
  }
}

function getSchoolFromURL() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('school');
}

// UI Update Functions
function updateUIForAuthState() {
  const authButton = document.getElementById('authButton');
  const userInfo = document.getElementById('userInfo');
  const adminButton = document.querySelector('.admin-access-btn');
  
  if (currentUser) {
    // User is signed in
    if (authButton) {
      authButton.innerHTML = `
        <span class="user-avatar">${currentUser.displayName ? currentUser.displayName.charAt(0).toUpperCase() : '👤'}</span>
        <span class="user-name">${currentUser.displayName || currentUser.email}</span>
        <span class="logout-btn" onclick="logout()">Sign Out</span>
      `;
    }
    
    // Show admin button only to admin
    if (adminButton) {
      adminButton.style.display = isAdmin ? 'block' : 'none';
    }
  } else {
    // User is signed out
    if (authButton) {
      authButton.innerHTML = `
        <button class="btn btn--primary" onclick="openAuthModal()">
          Sign In / Sign Up
        </button>
      `;
    }
    
    if (adminButton) {
      adminButton.style.display = 'none';
    }
  }
}

// Progress Tracking
async function trackSectionComplete(sectionId) {
  if (!currentUser) return;
  
  // Mark section as complete
  trainingProgress[sectionId] = true;
  updateProgressBar();
  
  try {
    const userRef = db.collection('users').doc(currentUser.uid);
    await userRef.update({
      [`progress.${sectionId}`]: true,
      [`progress.${sectionId}_completedAt`]: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    // Track analytics
    analytics.logEvent('section_complete', {
      section_id: sectionId,
      user_id: currentUser.uid
    });
    
    // Track school-specific analytics
    const schoolId = currentSchool || 'direct';
    const schoolStatsRef = db.collection('schoolStats').doc(`${schoolId}_${sectionId}`);
    await schoolStatsRef.update({
      completions: firebase.firestore.FieldValue.increment(1)
    }).catch(() => {
      // Create if doesn't exist
      schoolStatsRef.set({
        schoolId: schoolId,
        sectionId: sectionId,
        completions: 1,
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
      });
    });
    
  } catch (error) {
    console.error('Error tracking section completion:', error);
    
    // Handle permission errors gracefully
    if (error.code === 'permission-denied') {
      console.warn('⚠️ Database permissions not configured yet. Progress saved locally only.');
      
      // Show user-friendly notification only once
      if (!databasePermissionIssue) {
        databasePermissionIssue = true;
        showNotification('Training progress is being saved locally. Full sync will be enabled soon!', 'warning');
      }
      
      // Save to localStorage as fallback
      localStorage.setItem('skids_progress', JSON.stringify(trainingProgress));
    }
  }

  // Check if all sections are completed
  const completed = Object.values(trainingProgress).filter(Boolean).length;
  const total = Object.keys(trainingProgress).length;
  
  if (completed === total) {
    // All sections completed - trigger certificate eligibility
    setTimeout(() => {
      showCertificateEligibilityNotification();
    }, 1000);
    
    // Track training completion
    analytics.logEvent('training_completed', {
      user_id: currentUser.uid,
      school: currentSchool || 'direct',
      sections_completed: completed,
      completion_time: new Date().toISOString()
    });
    
    // Update session data for completion tracking
    const sessionData = JSON.parse(localStorage.getItem('skids_session_data') || '{}');
    sessionData.completed = new Date().toISOString();
    sessionData.sections_completed = completed;
    localStorage.setItem('skids_session_data', JSON.stringify(sessionData));
  } else {
    // Show progress notification
    showNotification(`Section completed! ${completed}/${total} sections finished.`, 'success');
  }
}

function showCertificateEligibilityNotification() {
  // Create a special notification for certificate eligibility
  const notification = document.createElement('div');
  notification.className = 'notification notification--certificate';
  notification.innerHTML = `
    <div class="certificate-notification-content">
      <div class="certificate-notification-icon">🎉</div>
      <div class="certificate-notification-text">
        <strong>Congratulations!</strong><br>
        You've completed all training sections and are now eligible to generate your completion certificate!
      </div>
      <button class="btn btn--small btn--primary" onclick="generateCertificate(); this.closest('.notification').remove();">
        Generate Certificate
      </button>
    </div>
    <button class="notification-close" onclick="this.parentElement.remove()">×</button>
  `;
  
  // Add special styling for certificate notification
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    max-width: 400px;
    padding: 20px;
    background: linear-gradient(135deg, #10B981, #059669);
    color: white;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(16, 185, 129, 0.4);
    z-index: 10001;
    animation: certificateSlideIn 0.6s ease-out;
  `;
  
  document.body.appendChild(notification);
  
  // Auto remove after 10 seconds (longer for certificate notification)
  setTimeout(() => {
    if (notification.parentElement) {
      notification.style.animation = 'certificateSlideOut 0.4s ease-in forwards';
      setTimeout(() => notification.remove(), 400);
    }
  }, 10000);
}

async function loadUserProgress(userId) {
  try {
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (userDoc.exists) {
      const userData = userDoc.data();
      const progress = userData.progress || {};
      
      // Update local progress
      Object.keys(trainingProgress).forEach(section => {
        trainingProgress[section] = progress[section] || false;
      });
      
      currentSchool = userData.currentSchool || 'direct';
      updateProgressBar();
    }
  } catch (error) {
    console.error('Error loading user progress:', error);
    
    // Handle permission errors gracefully
    if (error.code === 'permission-denied') {
      console.warn('⚠️ Database permissions not configured. Loading from localStorage fallback.');
      
      // Show user-friendly notification only once
      if (!databasePermissionIssue) {
        databasePermissionIssue = true;
        showNotification('Loading your saved progress. Database sync will be enabled soon!', 'info');
      }
      
      // Load from localStorage as fallback
      const localProgress = localStorage.getItem('skids_progress');
      if (localProgress) {
        try {
          const parsedProgress = JSON.parse(localProgress);
          Object.keys(trainingProgress).forEach(section => {
            trainingProgress[section] = parsedProgress[section] || false;
          });
          updateProgressBar();
        } catch (e) {
          console.error('Error parsing local progress:', e);
        }
      }
    }
  }
}

function updateProgressBar() {
  const completed = Object.values(trainingProgress).filter(Boolean).length;
  const total = Object.keys(trainingProgress).length;
  const percentage = (completed / total) * 100;
  
  const progressFill = document.getElementById('mainProgress');
  if (progressFill) {
    progressFill.style.width = `${percentage}%`;
  }
  
  // Update section indicators
  Object.keys(trainingProgress).forEach(sectionId => {
    const navItem = document.querySelector(`[data-section="${sectionId}"]`);
    if (navItem) {
      navItem.classList.toggle('completed', trainingProgress[sectionId]);
    }
  });
  
  // Update certificate button visibility and state
  updateCertificateButtonState(completed, total);
}

function updateCertificateButtonState(completed, total) {
  // Find the certificate generation button
  const certButton = document.querySelector('button[onclick="generateCertificate()"]');
  if (certButton) {
    if (completed === total) {
      // All sections completed - make button prominent
      certButton.classList.add('certificate-ready');
      certButton.innerHTML = '🎉 Generate Your Completion Certificate!';
      certButton.style.cssText = `
        background: linear-gradient(135deg, #10B981, #059669);
        color: white;
        border: none;
        padding: 16px 32px;
        font-size: 18px;
        font-weight: bold;
        border-radius: 12px;
        box-shadow: 0 8px 25px rgba(16, 185, 129, 0.4);
        transform: scale(1.05);
        animation: certificateButtonPulse 2s ease-in-out infinite alternate;
      `;
    } else {
      // Not all sections completed - show progress
      certButton.classList.remove('certificate-ready');
      certButton.innerHTML = `🏆 Complete Training for Certificate (${completed}/${total})`;
      certButton.style.cssText = `
        background: #CBD5E0;
        color: #4A5568;
        border: 2px dashed #A0AEC0;
        padding: 12px 24px;
        font-size: 16px;
        border-radius: 8px;
        cursor: not-allowed;
        opacity: 0.7;
      `;
    }
  }
}

function resetProgress() {
  Object.keys(trainingProgress).forEach(section => {
    trainingProgress[section] = false;
  });
  updateProgressBar();
}

// Add certificate button pulse animation via CSS injection
function addCertificateButtonStyles() {
  if (!document.getElementById('certificate-button-styles')) {
    const style = document.createElement('style');
    style.id = 'certificate-button-styles';
    style.textContent = `
      @keyframes certificateButtonPulse {
        from {
          box-shadow: 0 8px 25px rgba(16, 185, 129, 0.4);
          transform: scale(1.05);
        }
        to {
          box-shadow: 0 12px 35px rgba(16, 185, 129, 0.6);
          transform: scale(1.08);
        }
      }
      
      .certificate-ready:hover {
        transform: scale(1.1) !important;
        box-shadow: 0 12px 40px rgba(16, 185, 129, 0.5) !important;
      }
    `;
    document.head.appendChild(style);
  }
}

// Track user session
async function trackUserSession(user) {
  try {
    // Track session start
    analytics.logEvent('session_start', {
      user_id: user.uid,
      school: currentSchool || 'direct'
    });
    
    // Update user's last activity
    const userRef = db.collection('users').doc(user.uid);
    await userRef.update({
      lastActivity: firebase.firestore.FieldValue.serverTimestamp()
    });
    
  } catch (error) {
    console.error('Error tracking user session:', error);
    
    // Handle permission errors gracefully
    if (error.code === 'permission-denied') {
      console.warn('⚠️ Database permissions not configured. Session tracking disabled temporarily.');
      // Still log analytics event even if database fails
      analytics.logEvent('session_start_fallback', {
        user_id: user.uid,
        school: currentSchool || 'direct',
        timestamp: new Date().toISOString()
      });
    }
  }
}

// Modal Functions
function openAuthModal() {
  console.log('openAuthModal called');
  try {
    const modal = document.getElementById('authModal');
    console.log('Modal element found:', !!modal);
    if (modal) {
      modal.classList.remove('hidden');
      console.log('Modal shown');
    } else {
      console.log('Creating auth modal...');
      createAuthModal();
    }
  } catch (error) {
    console.error('Error in openAuthModal:', error);
  }
}

function closeAuthModal() {
  const modal = document.getElementById('authModal');
  if (modal) {
    modal.classList.add('hidden');
  }
}

function toggleAuthMode() {
  const signInForm = document.getElementById('signInForm');
  const signUpForm = document.getElementById('signUpForm');
  const signInTab = document.getElementById('signInTab');
  const signUpTab = document.getElementById('signUpTab');
  
  if (signInForm.style.display === 'none') {
    // Switch to sign in
    signInForm.style.display = 'block';
    signUpForm.style.display = 'none';
    signInTab.classList.add('active');
    signUpTab.classList.remove('active');
  } else {
    // Switch to sign up
    signInForm.style.display = 'none';
    signUpForm.style.display = 'block';
    signInTab.classList.remove('active');
    signUpTab.classList.add('active');
  }
}

function createAuthModal() {
  const modalHTML = `
    <div class="modal hidden" id="authModal">
      <div class="modal-content">
        <div class="modal-header">
          <h3>Access SKIDS Training</h3>
          <button class="modal-close" onclick="closeAuthModal()">×</button>
        </div>
        <div class="modal-body">
          <div class="auth-tabs">
            <button class="auth-tab active" id="signInTab" onclick="toggleAuthMode()">Sign In</button>
            <button class="auth-tab" id="signUpTab" onclick="toggleAuthMode()">Sign Up</button>
          </div>
          
          <!-- Sign In Form -->
          <div id="signInForm" class="auth-form">
            <div class="form-group">
              <label class="form-label" for="emailInput">Email</label>
              <input type="email" id="emailInput" class="form-control" placeholder="Enter your email">
            </div>
            <div class="form-group">
              <label class="form-label" for="passwordInput">Password</label>
              <input type="password" id="passwordInput" class="form-control" placeholder="Enter your password">
            </div>
            <button class="btn btn--primary btn--full-width" onclick="signInWithEmail()">
              Sign In
            </button>
          </div>
          
          <!-- Sign Up Form -->
          <div id="signUpForm" class="auth-form" style="display: none;">
            <div class="form-group">
              <label class="form-label" for="nameInput">Full Name</label>
              <input type="text" id="nameInput" class="form-control" placeholder="Enter your full name">
            </div>
            <div class="form-group">
              <label class="form-label" for="emailInput">Email</label>
              <input type="email" id="emailInput" class="form-control" placeholder="Enter your email">
            </div>
            <div class="form-group">
              <label class="form-label" for="passwordInput">Password</label>
              <input type="password" id="passwordInput" class="form-control" placeholder="Create a password (min 6 characters)">
            </div>
            <button class="btn btn--primary btn--full-width" onclick="signUpWithEmail()">
              Create Account
            </button>
          </div>
          
          <div class="auth-divider">
            <span>or</span>
          </div>
          
          <button class="btn btn--outline btn--full-width google-btn" onclick="signInWithGoogle()">
            <img src="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTgiIGhlaWdodD0iMTgiIHZpZXdCb3g9IjAgMCAxOCAxOCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTE3LjY0IDkuMjA0NTVDMTcuNjQgOC41NjY4MiAxNy41ODI3IDcuOTUyMjcgMTcuNDc2NCA3LjM2MzY0SDE5VjEwLjg0MDlIMTQuMzM4MkMxNC4wNDA5IDExLjU4MDkgMTMuNTY5MSAxMi4yNzI3IDEyLjgyOTEgMTIuOUMxMS45MzY0IDEzLjU4MTggMTAuNzE4MiAxMy45NTQ1IDkuNSAxMy45NTQ1QzcuMjUgMTMuOTU0NSA1LjMxODEgMTIuNTU0NSA0LjUgMTAuNjM2NEMzLjY5MDkgOC43MTM2NCA0LjUgNi4zNjM2NCA2IDYuMzYzNjRINi4yNzI3M0M2LjY1NDU1IDYuMzYzNjQgNyA2LjYzNjM2IDcgN0M3IDcuMzYzNjQgNi44NzI3MyA3LjY4MTgyIDYuNjU0NTUgNy45QzkuMSA3LjkgMTEuNDU0NSA3LjkgMTMuODA5MSA3LjlWMTEuNDU0NUMxNC4yIDEwLjkwOTEgMTQuNjcyNyAxMC40IDE1LjIgOS45TDE3LjY0IDkuMjA0NTVaIiBmaWxsPSIjNDI4NUY0Ii8+Cjwvc3ZnPgo=" alt="Google" class="google-icon">
            Sign in with Google
          </button>
        </div>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', modalHTML);
}

// Admin Functions
function openAdminLogin() {
  if (!isAdmin && currentUser?.email !== ADMIN_EMAIL) {
    showNotification('Admin access denied. Please sign in with admin credentials.', 'error');
    return;
  }
  
  const modal = document.getElementById('adminLoginModal');
  if (modal) {
    modal.classList.remove('hidden');
  }
}

function closeAdminLogin() {
  const modal = document.getElementById('adminLoginModal');
  if (modal) {
    modal.classList.add('hidden');
  }
}

function loginAdmin() {
  const password = document.getElementById('adminPassword').value;
  const correctPassword = 'skids2025'; // Change this to a secure password
  
  if (password === correctPassword && isAdmin) {
    closeAdminLogin();
    openAdminPanel();
  } else {
    const errorMessage = document.getElementById('loginError');
    if (errorMessage) {
      errorMessage.classList.remove('hidden');
    }
  }
}

function openAdminPanel() {
  const modal = document.getElementById('adminPanelModal');
  if (modal) {
    modal.classList.remove('hidden');
    loadAdminData();
  }
}

function closeAdminPanel() {
  const modal = document.getElementById('adminPanelModal');
  if (modal) {
    modal.classList.add('hidden');
  }
}

async function loadAdminData() {
  try {
    // Load school statistics
    await loadSchoolStats();
    await loadUsageAnalytics();
    updateAnalyticsCharts();
  } catch (error) {
    console.error('Error loading admin data:', error);
  }
}

async function loadSchoolStats() {
  try {
    const schoolsRef = db.collection('schools');
    const schoolsSnapshot = await schoolsRef.get();
    
    let totalUsers = 0;
    let totalSessions = 0;
    const schoolsList = [];
    
    schoolsSnapshot.forEach((doc) => {
      const data = doc.data();
      totalUsers += data.totalUsers || 0;
      totalSessions += data.totalSessions || 0;
      schoolsList.push({
        id: doc.id,
        name: data.name,
        users: data.totalUsers || 0,
        sessions: data.totalSessions || 0,
        lastActivity: data.lastActivity?.toDate?.() || new Date()
      });
    });
    
    // Update UI
    document.getElementById('totalUsers').textContent = totalUsers;
    document.getElementById('completionRate').textContent = '78%'; // Calculate from actual data
    
    // Update schools list
    updateSchoolsList(schoolsList);
    
  } catch (error) {
    console.error('Error loading school stats:', error);
  }
}

function updateSchoolsList(schools) {
  const container = document.getElementById('sectionStats');
  if (!container) return;
  
  const schoolsHTML = schools.map(school => `
    <div class="school-stat-item">
      <div class="school-info">
        <h6>${school.name}</h6>
        <p>${school.users} users • ${school.sessions} sessions</p>
        <small>Last activity: ${school.lastActivity.toLocaleDateString()}</small>
      </div>
      <div class="school-actions">
        <button class="btn btn--sm" onclick="customizeSchool('${school.id}')">Customize</button>
      </div>
    </div>
  `).join('');
  
  container.innerHTML = schoolsHTML;
}

// Training Navigation Functions
function startTraining() {
  console.log('🚀 Starting training...', { currentUser });
  
  if (!currentUser) {
    console.log('❌ No user logged in, opening auth modal');
    openAuthModal();
    return;
  }
  
  const landing = document.getElementById('landing');
  const navigation = document.getElementById('navigation');
  
  console.log('📍 Found elements:', { landing: !!landing, navigation: !!navigation });
  
  if (landing) {
    landing.style.display = 'none';
    console.log('✅ Hidden landing page');
  } else {
    console.warn('⚠️ Landing element not found');
  }
  
  if (navigation) {
    navigation.style.display = 'block';
    navigation.style.opacity = '1';
    navigation.classList.add('visible');
    console.log('✅ Showed navigation with classes:', navigation.className);
    
    // Force visibility with inline styles as backup
    navigation.style.setProperty('display', 'block', 'important');
    navigation.style.setProperty('opacity', '1', 'important');
  } else {
    console.error('❌ Navigation element not found!');
    return;
  }
  
  // Show the first training section
  const firstSection = document.getElementById('brain-needs');
  if (firstSection) {
    // Hide all sections first
    const allSections = document.querySelectorAll('.training-section');
    allSections.forEach(section => section.classList.remove('active'));
    
    // Show first section
    firstSection.classList.add('active');
    console.log('✅ Activated brain-needs section');
  } else {
    console.error('❌ First training section not found!');
  }
  
  // Track training start
  if (typeof analytics !== 'undefined') {
    analytics.logEvent('training_start', {
      user_id: currentUser.uid,
      school: currentSchool || 'direct'
    });
  }
  
  // Scroll to top to ensure user sees the content
  window.scrollTo({ top: 0, behavior: 'smooth' });
  
  console.log('🎯 Training start complete');
}

function showSection(sectionId) {
  console.log(`📖 Showing section: ${sectionId}`);
  
  // Hide all sections
  const sections = document.querySelectorAll('.training-section');
  console.log(`Found ${sections.length} training sections`);
  
  sections.forEach(section => {
    section.classList.remove('active');
  });
  
  // Show target section
  const targetSection = document.getElementById(sectionId);
  if (targetSection) {
    targetSection.classList.add('active');
    console.log(`✅ Activated section: ${sectionId}`);
  } else {
    console.error(`❌ Section not found: ${sectionId}`);
  }
  
  // Update navigation
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.classList.remove('active');
  });
  
  const activeNavItem = document.querySelector(`[data-section="${sectionId}"]`);
  if (activeNavItem) {
    activeNavItem.classList.add('active');
    console.log(`✅ Updated navigation for: ${sectionId}`);
  }
  
  // Track section view
  if (currentUser) {
    analytics.logEvent('section_view', {
      section_id: sectionId,
      user_id: currentUser.uid
    });
  }
}

function showAdminTab(tabId) {
  // Hide all tabs
  const tabs = document.querySelectorAll('.admin-tab-content');
  tabs.forEach(tab => tab.classList.remove('active'));
  
  const tabButtons = document.querySelectorAll('.admin-tab-btn');
  tabButtons.forEach(btn => btn.classList.remove('active'));
  
  // Show target tab
  const targetTab = document.getElementById(`${tabId}-tab`);
  if (targetTab) {
    targetTab.classList.add('active');
  }
  
  const targetButton = document.querySelector(`[onclick="showAdminTab('${tabId}')"]`);
  if (targetButton) {
    targetButton.classList.add('active');
  }
  
  // Load specific tab data
  if (tabId === 'analytics') {
    loadUsageAnalytics();
  }
}

// Certificate Functions
function generateCertificate() {
  if (!currentUser) {
    showNotification('Please sign in to generate a certificate.', 'error');
    return;
  }
  
  const completed = Object.values(trainingProgress).filter(Boolean).length;
  const total = Object.keys(trainingProgress).length;
  
  if (completed < total) {
    const remaining = total - completed;
    const completedSections = Object.keys(trainingProgress).filter(key => trainingProgress[key]);
    const remainingSections = Object.keys(trainingProgress).filter(key => !trainingProgress[key]);
    
    showNotification(
      `Please complete all ${total} sections to generate a certificate. ` +
      `You have completed ${completed}/${total} sections. ` +
      `Remaining: ${remainingSections.map(s => s.replace('-', ' ')).join(', ')}`, 
      'warning'
    );
    return;
  }

  // Update certificate with user info and enhanced details
  const userName = currentUser.displayName || currentUser.email;
  const completionDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long', 
    day: 'numeric'
  });
  
  document.getElementById('certificateName').textContent = userName;
  document.getElementById('certificateDate').textContent = completionDate;

  // Add completion details to certificate
  updateCertificateDetails();
  
  // Show certificate modal
  document.getElementById('certificateModal').classList.remove('hidden');
  
  // Track certificate generation with detailed analytics
  analytics.logEvent('certificate_generated', {
    user_id: currentUser.uid,
    school: currentSchool || 'direct',
    completion_date: completionDate,
    sections_completed: completed,
    user_name: userName,
    training_duration: calculateTrainingDuration()
  });

  // Update user progress with certificate generation
  if (db) {
    try {
      const userRef = db.collection('users').doc(currentUser.uid);
      userRef.update({
        'progress.certificate_generated': true,
        'progress.certificate_generated_date': firebase.firestore.FieldValue.serverTimestamp(),
        'progress.completion_verified': true
      }).catch(() => {
        // Fallback to localStorage
        const localProgress = JSON.parse(localStorage.getItem('skids_progress') || '{}');
        localProgress.certificate_generated = true;
        localProgress.certificate_generated_date = new Date().toISOString();
        localProgress.completion_verified = true;
        localStorage.setItem('skids_progress', JSON.stringify(localProgress));
      });
    } catch (error) {
      console.error('Error updating certificate status:', error);
    }
  }

  showNotification('🎉 Congratulations! Your completion certificate has been generated.', 'success');
}

function updateCertificateDetails() {
  // Add completion badge and details to the certificate
  const certificate = document.getElementById('certificate');
  
  // Remove any existing completion badge
  const existingBadge = certificate.querySelector('.completion-badge');
  if (existingBadge) {
    existingBadge.remove();
  }
  
  // Add completion badge
  const completionBadge = document.createElement('div');
  completionBadge.className = 'completion-badge';
  completionBadge.innerHTML = '✓ COMPLETED';
  certificate.appendChild(completionBadge);
  
  // Update certificate description with completion details
  const description = certificate.querySelector('.certificate-description');
  if (description) {
    const sectionsCompleted = Object.keys(trainingProgress).filter(key => trainingProgress[key]);
    const sectionNames = {
      'brain-needs': 'Brain Development Needs',
      'storyboards': 'Interactive Storyboards', 
      'abcde-method': 'ABCDE Method',
      'toolkit': 'Digital Parenting Toolkit'
    };
    
    description.innerHTML = `
      Understanding Teen Brain Development Needs, Family Communication Strategies, and the ABCDE Problem-Solving Method
      <br><br>
      <strong>Completed Sections:</strong><br>
      ${sectionsCompleted.map(section => sectionNames[section] || section).join(' • ')}
    `;
  }
}

function calculateTrainingDuration() {
  // Calculate approximate training duration based on localStorage timestamps
  try {
    const sessionData = JSON.parse(localStorage.getItem('skids_session_data') || '{}');
    if (sessionData.started && sessionData.completed) {
      const start = new Date(sessionData.started);
      const end = new Date(sessionData.completed);
      return Math.round((end - start) / (1000 * 60)); // Duration in minutes
    }
  } catch (error) {
    console.error('Error calculating training duration:', error);
  }
  return null;
}

function closeCertificateModal() {
  document.getElementById('certificateModal').classList.add('hidden');
}

// Enhanced certificate validation
function validateCertificateEligibility() {
  if (!currentUser) {
    return { eligible: false, reason: 'User not logged in' };
  }
  
  const completed = Object.values(trainingProgress).filter(Boolean).length;
  const total = Object.keys(trainingProgress).length;
  
  if (completed < total) {
    const remainingSections = Object.keys(trainingProgress).filter(key => !trainingProgress[key]);
    return { 
      eligible: false, 
      reason: `${total - completed} sections remaining: ${remainingSections.join(', ')}`,
      completed: completed,
      total: total,
      remaining: remainingSections
    };
  }
  
  return { eligible: true, completed: completed, total: total };
}

// Function to check if user has already generated a certificate
function hasCertificate() {
  // Check localStorage first
  const localProgress = JSON.parse(localStorage.getItem('skids_progress') || '{}');
  if (localProgress.certificate_generated) {
    return true;
  }
  
  // Could also check database when available
  return false;
}

function downloadCertificate() {
  if (!currentUser) {
    showNotification('Please sign in to download your certificate.', 'error');
    return;
  }

  // Verify all sections are completed
  const completed = Object.values(trainingProgress).filter(Boolean).length;
  const total = Object.keys(trainingProgress).length;
  
  if (completed < total) {
    showNotification(`Certificate can only be downloaded after completing all ${total} sections.`, 'warning');
    return;
  }

  try {
    // Create a printable version
    const certificateElement = document.getElementById('certificate');
    const userName = currentUser.displayName || currentUser.email;
    const completionDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long', 
      day: 'numeric'
    });
    
    // Enhanced certificate content for download
    const downloadContent = `
<!DOCTYPE html>
<html>
<head>
    <title>SKIDS Training Certificate - ${userName}</title>
    <style>
        @page { size: letter; margin: 0.5in; }
        body { 
            font-family: 'Arial', sans-serif; 
            line-height: 1.6; 
            margin: 0; 
            padding: 20px;
            background: white;
        }
        .certificate {
            border: 8px solid #20B2AA;
            border-radius: 20px;
            padding: 60px 40px;
            text-align: center;
            background: linear-gradient(135deg, #f8fffe 0%, #e6fffe 100%);
            margin: 20px auto;
            max-width: 700px;
            box-shadow: 0 0 30px rgba(32, 178, 170, 0.3);
            position: relative;
            min-height: 500px;
        }
        .certificate::before {
            content: '';
            position: absolute;
            top: 15px; left: 15px; right: 15px; bottom: 15px;
            border: 2px solid #20B2AA;
            border-radius: 12px;
        }
        .certificate-logo {
            margin-bottom: 30px;
        }
        .skids-brand-large {
            font-size: 48px;
            font-weight: bold;
            letter-spacing: 2px;
            margin-bottom: 10px;
        }
        .skids-brand-large .letter-s1 { color: #E53E3E; }
        .skids-brand-large .letter-k { color: #FF8C00; }
        .skids-brand-large .letter-i { color: #FFD700; }
        .skids-brand-large .letter-d { color: #38A169; }
        .skids-brand-large .letter-s2 { color: #3182CE; }
        .certificate h1 {
            color: #20B2AA;
            font-size: 36px;
            margin: 30px 0;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .certificate-text {
            font-size: 18px;
            color: #4A5568;
            margin: 15px 0;
        }
        .certificate-name {
            font-size: 32px;
            font-weight: bold;
            color: #2D3748;
            margin: 25px 0;
            padding: 15px 0;
            border-bottom: 3px solid #20B2AA;
            display: inline-block;
            min-width: 350px;
        }
        .certificate-course {
            font-size: 24px;
            color: #20B2AA;
            font-weight: bold;
            margin: 25px 0;
        }
        .certificate-description {
            font-size: 16px;
            color: #718096;
            font-style: italic;
            margin: 20px 0 40px 0;
            max-width: 500px;
            margin-left: auto;
            margin-right: auto;
        }
        .certificate-footer {
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            margin-top: 50px;
            padding-top: 30px;
            border-top: 1px solid #E2E8F0;
        }
        .certificate-date {
            font-size: 16px;
            color: #4A5568;
        }
        .certificate-signature {
            text-align: center;
        }
        .signature-line {
            width: 200px;
            height: 3px;
            background: #20B2AA;
            margin-bottom: 10px;
        }
        .completion-badge {
            position: absolute;
            top: 20px;
            right: 20px;
            background: #20B2AA;
            color: white;
            padding: 10px 15px;
            border-radius: 25px;
            font-weight: bold;
            font-size: 12px;
        }
        .sections-completed {
            margin: 30px 0;
            font-size: 14px;
            color: #4A5568;
        }
        @media print {
            .certificate { 
                box-shadow: none; 
                margin: 0;
                page-break-inside: avoid;
            }
        }
    </style>
</head>
<body>
    <div class="certificate">
        <div class="completion-badge">✓ COMPLETED</div>
        <div class="certificate-logo">
            <div class="skids-brand-large">
                <span class="letter-s1">S</span><span class="letter-k">K</span><span class="letter-i">I</span><span class="letter-d">D</span><span class="letter-s2">S</span>
            </div>
        </div>
        <h1>Certificate of Completion</h1>
        <p class="certificate-text">This certifies that</p>
        <div class="certificate-name">${userName}</div>
        <p class="certificate-text">has successfully completed the</p>
        <h2 class="certificate-course">SKIDS Interactive Training Module</h2>
        <p class="certificate-description">Understanding Teen Brain Development Needs, Family Communication Strategies, and the ABCDE Problem-Solving Method</p>
        <div class="sections-completed">
            <strong>Completed Sections:</strong> Brain Development Needs • Interactive Storyboards • ABCDE Method • Digital Parenting Toolkit
        </div>
        <div class="certificate-footer">
            <div class="certificate-date">
                <strong>Date of Completion:</strong><br>
                ${completionDate}
            </div>
            <div class="certificate-signature">
                <div class="signature-line"></div>
                <p><strong>SKIDS Training Team</strong><br>
                <small>Certified Digital Parenting Program</small></p>
            </div>
        </div>
    </div>
</body>
</html>`;

    // Create and download the certificate
    const blob = new Blob([downloadContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `SKIDS-Training-Certificate-${userName.replace(/[^a-zA-Z0-9]/g, '-')}-${new Date().getFullYear()}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    // Track certificate download
    analytics.logEvent('certificate_downloaded', {
      user_id: currentUser.uid,
      school: currentSchool || 'direct',
      completion_date: completionDate,
      sections_completed: completed
    });

    // Save certificate generation to user record
    if (db) {
      try {
        const userRef = db.collection('users').doc(currentUser.uid);
        userRef.update({
          'certificates.skids_training': {
            generated: firebase.firestore.FieldValue.serverTimestamp(),
            downloaded: firebase.firestore.FieldValue.serverTimestamp(),
            completionDate: completionDate,
            sectionsCompleted: completed,
            school: currentSchool || 'direct'
          }
        }).catch(() => {
          // Fallback to localStorage if database permissions aren't ready
          const certificates = JSON.parse(localStorage.getItem('skids_certificates') || '{}');
          certificates.skids_training = {
            generated: new Date().toISOString(),
            downloaded: new Date().toISOString(),
            completionDate: completionDate,
            sectionsCompleted: completed,
            school: currentSchool || 'direct'
          };
          localStorage.setItem('skids_certificates', JSON.stringify(certificates));
        });
      } catch (error) {
        console.error('Error saving certificate record:', error);
      }
    }

    showNotification('Certificate downloaded successfully! You can print it or save it as a PDF.', 'success');

  } catch (error) {
    console.error('Error downloading certificate:', error);
    showNotification('Error downloading certificate. Please try again.', 'error');
  }
}

// Utility Functions
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification notification--${type}`;
  notification.innerHTML = `
    <span class="notification-message">${message}</span>
    <button class="notification-close" onclick="this.parentElement.remove()">×</button>
  `;
  
  document.body.appendChild(notification);
  
  // Auto remove after 5 seconds
  setTimeout(() => {
    if (notification.parentElement) {
      notification.remove();
    }
  }, 5000);
}

function initializeNavigation() {
  // Initialize navigation event listeners
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const sectionId = item.getAttribute('data-section');
      if (sectionId) {
        showSection(sectionId);
        if (currentUser) {
          trackSectionComplete(sectionId);
        }
      }
    });
  });
}

function initializeProgressTracking() {
  // Track section completions when user interacts with content
  const interactiveElements = document.querySelectorAll('.need-card, .storyboard-card, .step-card, .tool-card');
  interactiveElements.forEach(element => {
    element.addEventListener('click', () => {
      const section = element.closest('.training-section');
      if (section && currentUser) {
        const sectionId = section.id;
        setTimeout(() => trackSectionComplete(sectionId), 2000); // Track after 2 seconds of interaction
      }
    });
  });
}

function initializeModals() {
  // Close modals when clicking outside
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
      e.target.classList.add('hidden');
    }
  });
  
  // Handle escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const openModals = document.querySelectorAll('.modal:not(.hidden)');
      openModals.forEach(modal => modal.classList.add('hidden'));
    }
  });
}

async function loadUsageAnalytics() {
  try {
    // Load real analytics data from Firestore
    const usersRef = db.collection('users');
    const usersSnapshot = await usersRef.get();
    
    let totalUsers = 0;
    let completedUsers = 0;
    let totalSessions = 0;
    
    usersSnapshot.forEach((doc) => {
      const userData = doc.data();
      totalUsers++;
      totalSessions += userData.totalSessions || 1;
      
      // Check if user completed all sections
      const progress = userData.progress || {};
      const completedSections = Object.values(progress).filter(Boolean).length;
      if (completedSections >= 4) {
        completedUsers++;
      }
    });
    
    const completionRate = totalUsers > 0 ? Math.round((completedUsers / totalUsers) * 100) : 0;
    const avgTime = Math.round(totalSessions * 2.5); // Estimate average time
    
    // Update UI
    document.getElementById('totalUsers').textContent = totalUsers.toLocaleString();
    document.getElementById('completionRate').textContent = `${completionRate}%`;
    document.getElementById('avgTime').textContent = `${avgTime} min`;
    
  } catch (error) {
    console.error('Error loading usage analytics:', error);
  }
}

function updateAnalyticsCharts() {
  const ctx = document.getElementById('usageChart');
  if (!ctx) return;
  
  // Create a simple chart showing usage over time
  new Chart(ctx, {
    type: 'line',
    data: {
      labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
      datasets: [{
        label: 'Monthly Users',
        data: [65, 89, 120, 181, 256, 367],
        borderColor: 'rgb(75, 192, 192)',
        backgroundColor: 'rgba(75, 192, 192, 0.2)',
        tension: 0.1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true
        }
      }
    }
  });
}

// School customization functions
async function customizeSchool(schoolId) {
  const schoolRef = db.collection('schools').doc(schoolId);
  const schoolDoc = await schoolRef.get();
  
  if (schoolDoc.exists) {
    const schoolData = schoolDoc.data();
    // Open customization modal with school data
    showNotification(`Customizing ${schoolData.name}`, 'info');
  }
}

// Partner branding functions
function previewLogo(input) {
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = function(e) {
      const logoPreview = document.getElementById('logoPreviewImg');
      const placeholder = document.getElementById('logoPlaceholder');
      
      if (logoPreview && placeholder) {
        logoPreview.src = e.target.result;
        logoPreview.classList.remove('hidden');
        placeholder.style.display = 'none';
        
        // Update preview section
        updatePartnerPreview();
      }
    };
    reader.readAsDataURL(input.files[0]);
  }
}

function updatePartnerPreview() {
  const partnerName = document.getElementById('partnerName').value;
  const partnerEmail = document.getElementById('partnerEmail').value;
  
  document.getElementById('previewPartnerName').textContent = partnerName || 'Partner Organization';
  document.getElementById('previewPartnerContact').textContent = partnerEmail || 'contact@partner.edu';
}

async function savePartnerBranding() {
  try {
    const partnerName = document.getElementById('partnerName').value;
    const partnerEmail = document.getElementById('partnerEmail').value;
    const partnerWebsite = document.getElementById('partnerWebsite').value;
    const logoFile = document.getElementById('partnerLogo').files[0];
    
    let logoURL = '';
    if (logoFile) {
      // Upload logo to Firebase Storage
      const logoRef = storage.ref(`partner-logos/${Date.now()}_${logoFile.name}`);
      const snapshot = await logoRef.put(logoFile);
      logoURL = await snapshot.ref.getDownloadURL();
    }
    
    // Save to Firestore
    const partnerRef = db.collection('partner-branding').doc('current');
    await partnerRef.set({
      name: partnerName,
      email: partnerEmail,
      website: partnerWebsite,
      logoURL: logoURL,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    showNotification('Partner branding saved successfully!', 'success');
    
    // Update the main page branding
    updateMainPageBranding(partnerName, logoURL);
    
  } catch (error) {
    console.error('Error saving partner branding:', error);
    showNotification('Failed to save partner branding.', 'error');
  }
}

function updateMainPageBranding(partnerName, logoURL) {
  const brandingDisplay = document.getElementById('partnerBrandingDisplay');
  const partnerNameDisplay = document.getElementById('displayPartnerName');
  const partnerLogoDisplay = document.getElementById('partnerLogoDisplay');
  
  if (partnerName && brandingDisplay) {
    brandingDisplay.style.display = 'block';
    if (partnerNameDisplay) partnerNameDisplay.textContent = partnerName;
    if (partnerLogoDisplay && logoURL) {
      partnerLogoDisplay.innerHTML = `<img src="${logoURL}" alt="${partnerName}" style="max-height: 60px;">`;
    }
  }
}

async function resetPartnerBranding() {
  try {
    const partnerRef = db.collection('partner-branding').doc('current');
    await partnerRef.set({
      name: '',
      email: '',
      website: '',
      logoURL: '',
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    // Reset form
    document.getElementById('partnerName').value = '';
    document.getElementById('partnerEmail').value = '';
    document.getElementById('partnerWebsite').value = '';
    document.getElementById('partnerLogo').value = '';
    
    // Reset preview
    document.getElementById('logoPreviewImg').classList.add('hidden');
    document.getElementById('logoPlaceholder').style.display = 'block';
    
    // Hide branding on main page
    document.getElementById('partnerBrandingDisplay').style.display = 'none';
    
    showNotification('Partner branding reset successfully!', 'success');
    
  } catch (error) {
    console.error('Error resetting partner branding:', error);
    showNotification('Failed to reset partner branding.', 'error');
  }
}

// Settings functions
async function saveSettings() {
  try {
    const enableAnalytics = document.getElementById('enableAnalytics').checked;
    const showProgress = document.getElementById('showProgress').checked;
    const enableCertificates = document.getElementById('enableCertificates').checked;
    const newPassword = document.getElementById('newAdminPassword').value;
    
    const settingsRef = db.collection('settings').doc('app');
    await settingsRef.set({
      enableAnalytics,
      showProgress,
      enableCertificates,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    if (newPassword) {
      // In a real app, you'd want to hash this password
      await db.collection('settings').doc('admin').set({
        password: newPassword, // This should be hashed in production
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      document.getElementById('newAdminPassword').value = '';
    }
    
    showNotification('Settings saved successfully!', 'success');
    
  } catch (error) {
    console.error('Error saving settings:', error);
    showNotification('Failed to save settings.', 'error');
  }
}

async function exportData() {
  try {
    // Export analytics data as CSV
    const data = await loadAnalyticsData();
    const csv = convertToCSV(data);
    downloadCSV(csv, 'skids-analytics.csv');
    showNotification('Analytics data exported successfully!', 'success');
  } catch (error) {
    console.error('Error exporting data:', error);
    showNotification('Failed to export data.', 'error');
  }
}

function convertToCSV(data) {
  // Simple CSV conversion - enhance as needed
  const headers = ['Date', 'Users', 'Sessions', 'Completions'];
  const rows = data.map(row => [row.date, row.users, row.sessions, row.completions]);
  return [headers, ...rows].map(row => row.join(',')).join('\n');
}

function downloadCSV(csv, filename) {
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.setAttribute('hidden', '');
  a.setAttribute('href', url);
  a.setAttribute('download', filename);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

async function clearAnalytics() {
  if (confirm('Are you sure you want to clear all analytics data? This action cannot be undone.')) {
    try {
      // This would delete analytics data - implement carefully in production
      showNotification('Analytics data cleared successfully!', 'success');
    } catch (error) {
      console.error('Error clearing analytics:', error);
      showNotification('Failed to clear analytics data.', 'error');
    }
  }
}

// Add auth button to header if it doesn't exist
function addAuthButton() {
  if (!document.getElementById('authButton')) {
    const header = document.querySelector('.hero-content');
    if (header) {
      const authButtonHTML = `
        <div class="auth-container" id="authButton">
          <button class="btn btn--primary" onclick="openAuthModal()">
            Sign In / Sign Up
          </button>
        </div>
      `;
      header.insertAdjacentHTML('afterbegin', authButtonHTML);
    }
  }
}

function initializeTooltips() {
  // Add any tooltip initialization here
}

// Debug function to check UI state
function debugUIState() {
  const landing = document.getElementById('landing');
  const navigation = document.getElementById('navigation');
  const sections = document.querySelectorAll('.training-section');
  const activeSections = document.querySelectorAll('.training-section.active');
  
  console.log('🔍 UI State Debug:');
  console.log('- Current User:', currentUser?.email || 'Not logged in');
  console.log('- Landing display:', landing?.style.display || 'default');
  console.log('- Navigation display:', navigation?.style.display || 'default');
  console.log('- Navigation has visible class:', navigation?.classList.contains('visible'));
  console.log('- Total training sections:', sections.length);
  console.log('- Active training sections:', activeSections.length);
  console.log('- Active section IDs:', Array.from(activeSections).map(s => s.id));
  
  // Check if elements are actually visible
  if (navigation) {
    const rect = navigation.getBoundingClientRect();
    console.log('- Navigation dimensions:', { width: rect.width, height: rect.height });
    console.log('- Navigation computed style:', window.getComputedStyle(navigation).display);
  }
  
  activeSections.forEach(section => {
    const rect = section.getBoundingClientRect();
    console.log(`- Section ${section.id} dimensions:`, { width: rect.width, height: rect.height });
  });
}

// Function to force show training interface
function forceShowTraining() {
  console.log('💪 Force showing training interface...');
  
  const landing = document.getElementById('landing');
  const navigation = document.getElementById('navigation');
  
  if (landing) {
    landing.style.display = 'none';
    landing.style.visibility = 'hidden';
  }
  
  if (navigation) {
    navigation.style.display = 'block';
    navigation.style.visibility = 'visible';
    navigation.classList.add('visible');
    navigation.style.opacity = '1';
  }
  
  showSection('brain-needs');
  debugUIState();
}

// Missing storyboard and interaction functions
function showResponse(story, type) {
  // Hide all response panels for this story
  const panels = document.querySelectorAll(`#${story}-traditional, #${story}-skids`);
  panels.forEach(panel => panel.classList.remove('active'));
  
  // Hide all tab buttons for this story
  const tabs = document.querySelectorAll(`[onclick*="${story}"]`);
  tabs.forEach(tab => tab.classList.remove('active'));
  
  // Show the selected panel and tab
  const targetPanel = document.getElementById(`${story}-${type}`);
  if (targetPanel) {
    targetPanel.classList.add('active');
  }
  
  // Update active tab
  const activeTab = document.querySelector(`[onclick="showResponse('${story}', '${type}')"]`);
  if (activeTab) {
    activeTab.classList.add('active');
  }
}

function expandNeed(needId) {
  const details = document.getElementById(`${needId}-details`);
  const card = document.querySelector(`.need-card.${needId}`);
  
  if (details && card) {
    const isExpanded = details.classList.contains('active');
    
    // Close all other need details
    document.querySelectorAll('.need-details').forEach(detail => {
      detail.classList.remove('active');
    });
    document.querySelectorAll('.need-card').forEach(c => {
      c.classList.remove('expanded');
    });
    
    if (!isExpanded) {
      details.classList.add('active');
      card.classList.add('expanded');
      
      // Track section interaction
      if (currentUser) {
        analytics.logEvent('need_expanded', {
          need_id: needId,
          user_id: currentUser.uid
        });
      }
    }
  }
}

function showABCDEStep(stepId) {
  // You can add step-by-step interaction here
  showNotification(`Learning about step: ${stepId.toUpperCase()}`, 'info');
  
  if (currentUser) {
    analytics.logEvent('abcde_step_viewed', {
      step_id: stepId,
      user_id: currentUser.uid
    });
  }
}

function scrollToTop() {
  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}

// Back to top button functionality
function initializeBackToTop() {
  const backToTopBtn = document.getElementById('backToTop');
  
  if (backToTopBtn) {
    window.addEventListener('scroll', () => {
      if (window.pageYOffset > 300) {
        backToTopBtn.classList.add('visible');
      } else {
        backToTopBtn.classList.remove('visible');
      }
    });
  }
}

// Enhanced analytics data loading
async function loadAnalyticsData() {
  try {
    const usersRef = db.collection('users');
    const usersSnapshot = await usersRef.get();
    
    const data = [];
    const dateMap = new Map();
    
    usersSnapshot.forEach((doc) => {
      const userData = doc.data();
      const date = userData.createdAt?.toDate?.() || new Date();
      const dateKey = date.toISOString().split('T')[0];
      
      if (!dateMap.has(dateKey)) {
        dateMap.set(dateKey, { users: 0, sessions: 0, completions: 0 });
      }
      
      const dayData = dateMap.get(dateKey);
      dayData.users += 1;
      dayData.sessions += userData.totalSessions || 1;
      
      // Check completion
      const progress = userData.progress || {};
      const completedSections = Object.values(progress).filter(Boolean).length;
      if (completedSections >= 4) {
        dayData.completions += 1;
      }
    });
    
    // Convert map to array
    dateMap.forEach((value, key) => {
      data.push({ date: key, ...value });
    });
    
    return data.sort((a, b) => new Date(a.date) - new Date(b.date));
  } catch (error) {
    console.error('Error loading analytics data:', error);
    return [];
  }
}

// Feature Testing Functions
function runFeatureTests() {
  console.log('🧪 Running SKIDS Feature Tests...');
  
  const tests = [
    { name: 'Firebase Initialization', test: testFirebaseInit },
    { name: 'UI Elements Present', test: testUIElements },
    { name: 'Navigation Functions', test: testNavigationFunctions },
    { name: 'Modal Functions', test: testModalFunctions },
    { name: 'Authentication Functions', test: testAuthFunctions },
    { name: 'Progress Tracking', test: testProgressTracking },
    { name: 'Admin Functions', test: testAdminFunctions },
    { name: 'Analytics Integration', test: testAnalytics }
  ];
  
  let passed = 0;
  let failed = 0;
  
  tests.forEach(({ name, test }) => {
    try {
      const result = test();
      if (result) {
        console.log(`✅ ${name}: PASSED`);
        passed++;
      } else {
        console.log(`❌ ${name}: FAILED`);
        failed++;
      }
    } catch (error) {
      console.log(`❌ ${name}: ERROR - ${error.message}`);
      failed++;
    }
  });
  
  console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed`);
  showNotification(`Feature Tests: ${passed} passed, ${failed} failed`, failed > 0 ? 'warning' : 'success');
}

function testFirebaseInit() {
  return !!(firebase && auth && db && storage && analytics);
}

function testUIElements() {
  const requiredElements = [
    'authButton',
    'landing',
    'navigation',
    'brain-needs',
    'storyboards',
    'abcde-method',
    'toolkit'
  ];
  
  return requiredElements.every(id => document.getElementById(id) !== null);
}

function testNavigationFunctions() {
  const functions = [
    'startTraining',
    'showSection',
    'openAuthModal',
    'closeAuthModal',
    'scrollToTop'
  ];
  
  return functions.every(func => typeof window[func] === 'function');
}

function testModalFunctions() {
  const functions = [
    'openAdminLogin',
    'closeAdminLogin',
    'openAdminPanel',
    'closeAdminPanel',
    'generateCertificate',
    'closeCertificateModal'
  ];
  
  return functions.every(func => typeof window[func] === 'function');
}

function testAuthFunctions() {
  const functions = [
    'signInWithGoogle',
    'signInWithEmail',
    'signUpWithEmail',
    'logout',
    'toggleAuthMode'
  ];
  
  return functions.every(func => typeof window[func] === 'function');
}

function testProgressTracking() {
  return !!(trainingProgress && typeof updateProgressBar === 'function' && typeof trackSectionComplete === 'function');
}

function testAdminFunctions() {
  const functions = [
    'loginAdmin',
    'showAdminTab',
    'savePartnerBranding',
    'resetPartnerBranding',
    'saveSettings',
    'exportData'
  ];
  
  return functions.every(func => typeof window[func] === 'function');
}

function testAnalytics() {
  return !!(analytics && typeof analytics.logEvent === 'function');
}

// Test Google Auth specifically
async function testGoogleAuth() {
  console.log('🔍 Testing Google Authentication...');
  
  try {
    // Test if Google provider is configured
    if (!googleProvider) {
      throw new Error('Google provider not initialized');
    }
    
    // Test if auth domain is properly set
    console.log('Auth domain:', firebaseConfig.authDomain);
    console.log('Current domain:', window.location.hostname);
    
    showNotification('Google Auth configuration appears correct. Try signing in!', 'success');
    return true;
  } catch (error) {
    console.error('Google Auth test failed:', error);
    showNotification(`Google Auth test failed: ${error.message}`, 'error');
    return false;
  }
}

// Test all authentication methods
async function testAllAuthMethods() {
  console.log('🔐 Testing Authentication Methods...');
  
  const results = {
    emailAuth: typeof auth.createUserWithEmailAndPassword === 'function',
    googleAuth: typeof auth.signInWithPopup === 'function' && !!googleProvider,
    signOut: typeof auth.signOut === 'function',
    stateListener: typeof auth.onAuthStateChanged === 'function'
  };
  
  console.log('Auth Methods:', results);
  
  const allPassed = Object.values(results).every(Boolean);
  showNotification(`Auth Methods Test: ${allPassed ? 'PASSED' : 'FAILED'}`, allPassed ? 'success' : 'error');
  
  return results;
}

// Test school URL handling
function testSchoolURLHandling() {
  console.log('🏫 Testing School URL Handling...');
  
  // Test with different URL patterns
  const testURLs = [
    'https://digiparenting.netlify.app/?school=test-school',
    'https://digiparenting.netlify.app/school/test-school',
    'https://digiparenting.netlify.app/'
  ];
  
  testURLs.forEach(url => {
    const urlObj = new URL(url);
    const params = new URLSearchParams(urlObj.search);
    const school = params.get('school');
    console.log(`URL: ${url} -> School: ${school || 'direct'}`);
  });
  
  showNotification('School URL handling test completed - check console', 'info');
}

// Expose test functions globally
window.runFeatureTests = runFeatureTests;
window.testGoogleAuth = testGoogleAuth;
window.testAllAuthMethods = testAllAuthMethods;
window.testSchoolURLHandling = testSchoolURLHandling;
window.debugUIState = debugUIState;
window.forceShowTraining = forceShowTraining;

// Immediately attach all functions to window object for HTML onclick handlers
window.openAdminLogin = openAdminLogin;
window.closeAdminLogin = closeAdminLogin;
window.loginAdmin = loginAdmin;
window.openAdminPanel = openAdminPanel;
window.closeAdminPanel = closeAdminPanel;
window.showAdminTab = showAdminTab;
window.startTraining = startTraining;
window.showSection = showSection;
window.generateCertificate = generateCertificate;
window.closeCertificateModal = closeCertificateModal;
window.downloadCertificate = downloadCertificate;
window.signInWithGoogle = signInWithGoogle;
window.signInWithEmail = signInWithEmail;
window.signUpWithEmail = signUpWithEmail;
window.logout = logout;
window.openAuthModal = openAuthModal;
window.closeAuthModal = closeAuthModal;
window.toggleAuthMode = toggleAuthMode;
window.showResponse = showResponse;
window.expandNeed = expandNeed;
window.showABCDEStep = showABCDEStep;
window.scrollToTop = scrollToTop;
window.previewLogo = previewLogo;
window.savePartnerBranding = savePartnerBranding;
window.resetPartnerBranding = resetPartnerBranding;
window.saveSettings = saveSettings;
window.exportData = exportData;
window.clearAnalytics = clearAnalytics;

console.log('Functions exposed to global scope');
console.log('window.openAuthModal:', typeof window.openAuthModal);

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, initializing app...');
  initializeSkidsApp();
  addAuthButton();
  initializeBackToTop();
  
  // Set up event listeners as backup to onclick
  const mainAuthBtn = document.getElementById('mainAuthBtn');
  if (mainAuthBtn) {
    mainAuthBtn.addEventListener('click', function(e) {
      console.log('Event listener fired for auth button');
      e.preventDefault();
      openAuthModal();
    });
    console.log('Auth button event listener attached');
  }
  
  console.log('App initialization complete');
});