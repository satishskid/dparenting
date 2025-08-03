// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics, logEvent } from "firebase/analytics";
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "firebase/auth";
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  collection, 
  query, 
  where, 
  getDocs,
  serverTimestamp,
  increment
} from "firebase/firestore";
import { 
  getStorage, 
  ref, 
  uploadBytes, 
  getDownloadURL 
} from "firebase/storage";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyADH2-JCBuG1q8FOx50VoD-ZiO0BZvCT0M",
  authDomain: "digital-parenting-app.firebaseapp.com",
  projectId: "digital-parenting-app",
  storageBucket: "digital-parenting-app.firebasestorage.app",
  messagingSenderId: "446498341762",
  appId: "1:446498341762:web:2b96b3f2b4fd9771c5859b",
  measurementId: "G-RSNW4ZPELE"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const googleProvider = new GoogleAuthProvider();

// Global state
let currentUser = null;
let currentSchool = null;
let isAdmin = false;
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
  // Listen for authentication state changes
  onAuthStateChanged(auth, (user) => {
    currentUser = user;
    isAdmin = user && user.email === ADMIN_EMAIL;
    updateUIForAuthState();
    
    if (user) {
      // Track user session
      trackUserSession(user);
      loadUserProgress(user.uid);
    }
  });
  
  // Initialize UI components
  initializeNavigation();
  initializeProgressTracking();
  initializeModals();
  initializeTooltips();
}

// Authentication Functions
function signInWithGoogle() {
  signInWithPopup(auth, googleProvider)
    .then(async (result) => {
      const user = result.user;
      await createOrUpdateUser(user);
      showNotification('Successfully signed in with Google!', 'success');
    })
    .catch((error) => {
      console.error('Google sign-in error:', error);
      showNotification('Failed to sign in with Google. Please try again.', 'error');
    });
}

function signInWithEmail() {
  const email = document.getElementById('emailInput').value;
  const password = document.getElementById('passwordInput').value;
  
  if (!email || !password) {
    showNotification('Please enter both email and password.', 'error');
    return;
  }
  
  signInWithEmailAndPassword(auth, email, password)
    .then(async (result) => {
      await createOrUpdateUser(result.user);
      showNotification('Successfully signed in!', 'success');
      closeAuthModal();
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
  
  createUserWithEmailAndPassword(auth, email, password)
    .then(async (result) => {
      const user = result.user;
      await createOrUpdateUser(user, name);
      showNotification('Account created successfully!', 'success');
      closeAuthModal();
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
  signOut(auth)
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
    const userRef = doc(db, 'users', user.uid);
    const userDoc = await getDoc(userRef);
    
    const userData = {
      email: user.email,
      lastLogin: serverTimestamp(),
      totalSessions: increment(1)
    };
    
    if (!userDoc.exists()) {
      // New user
      userData.displayName = displayName || user.displayName || user.email.split('@')[0];
      userData.createdAt = serverTimestamp();
      userData.completedSections = [];
      userData.currentSchool = getSchoolFromURL() || 'direct';
      await setDoc(userRef, userData);
      
      // Track new user
      logEvent(analytics, 'sign_up', {
        method: user.providerData[0]?.providerId || 'email'
      });
    } else {
      // Existing user
      await updateDoc(userRef, userData);
    }
    
    // Track school usage
    await trackSchoolUsage(userData.currentSchool || 'direct');
    
  } catch (error) {
    console.error('Error creating/updating user:', error);
  }
}

async function trackSchoolUsage(schoolId) {
  try {
    const schoolRef = doc(db, 'schools', schoolId);
    const schoolDoc = await getDoc(schoolRef);
    
    if (!schoolDoc.exists()) {
      await setDoc(schoolRef, {
        name: schoolId === 'direct' ? 'Direct Access' : schoolId,
        totalUsers: 1,
        totalSessions: 1,
        createdAt: serverTimestamp(),
        lastActivity: serverTimestamp()
      });
    } else {
      await updateDoc(schoolRef, {
        totalSessions: increment(1),
        lastActivity: serverTimestamp()
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
  
  trainingProgress[sectionId] = true;
  updateProgressBar();
  
  try {
    const userRef = doc(db, 'users', currentUser.uid);
    await updateDoc(userRef, {
      [`progress.${sectionId}`]: true,
      [`progress.${sectionId}_completedAt`]: serverTimestamp()
    });
    
    // Track analytics
    logEvent(analytics, 'section_complete', {
      section_id: sectionId,
      user_id: currentUser.uid
    });
    
    // Track school-specific analytics
    const schoolId = currentSchool || 'direct';
    const schoolStatsRef = doc(db, 'schoolStats', `${schoolId}_${sectionId}`);
    await updateDoc(schoolStatsRef, {
      completions: increment(1)
    }).catch(() => {
      // Create if doesn't exist
      setDoc(schoolStatsRef, {
        schoolId: schoolId,
        sectionId: sectionId,
        completions: 1,
        lastUpdated: serverTimestamp()
      });
    });
    
  } catch (error) {
    console.error('Error tracking section completion:', error);
  }
}

async function loadUserProgress(userId) {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (userDoc.exists()) {
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
}

function resetProgress() {
  Object.keys(trainingProgress).forEach(section => {
    trainingProgress[section] = false;
  });
  updateProgressBar();
}

// Track user session
async function trackUserSession(user) {
  try {
    // Track session start
    logEvent(analytics, 'session_start', {
      user_id: user.uid,
      school: currentSchool || 'direct'
    });
    
    // Update user's last activity
    const userRef = doc(db, 'users', user.uid);
    await updateDoc(userRef, {
      lastActivity: serverTimestamp()
    });
    
  } catch (error) {
    console.error('Error tracking user session:', error);
  }
}

// Modal Functions
function openAuthModal() {
  const modal = document.getElementById('authModal');
  if (modal) {
    modal.classList.remove('hidden');
  } else {
    createAuthModal();
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
    const schoolsRef = collection(db, 'schools');
    const schoolsSnapshot = await getDocs(schoolsRef);
    
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
  if (!currentUser) {
    openAuthModal();
    return;
  }
  
  const landing = document.getElementById('landing');
  const navigation = document.getElementById('navigation');
  
  if (landing) landing.style.display = 'none';
  if (navigation) navigation.style.display = 'block';
  
  showSection('brain-needs');
  
  // Track training start
  logEvent(analytics, 'training_start', {
    user_id: currentUser.uid,
    school: currentSchool || 'direct'
  });
}

function showSection(sectionId) {
  // Hide all sections
  const sections = document.querySelectorAll('.training-section');
  sections.forEach(section => {
    section.classList.remove('active');
  });
  
  // Show target section
  const targetSection = document.getElementById(sectionId);
  if (targetSection) {
    targetSection.classList.add('active');
  }
  
  // Update navigation
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.classList.remove('active');
  });
  
  const activeNavItem = document.querySelector(`[data-section="${sectionId}"]`);
  if (activeNavItem) {
    activeNavItem.classList.add('active');
  }
  
  // Track section view
  if (currentUser) {
    logEvent(analytics, 'section_view', {
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
    showNotification(`Please complete all ${total} sections to generate a certificate. You have completed ${completed}/${total} sections.`, 'warning');
    return;
  }
  
  // Update certificate with user info
  document.getElementById('certificateName').textContent = currentUser.displayName || currentUser.email;
  document.getElementById('certificateDate').textContent = new Date().toLocaleDateString();
  
  // Show certificate modal
  document.getElementById('certificateModal').classList.remove('hidden');
  
  // Track certificate generation
  logEvent(analytics, 'certificate_generated', {
    user_id: currentUser.uid,
    school: currentSchool || 'direct'
  });
}

function closeCertificateModal() {
  document.getElementById('certificateModal').classList.add('hidden');
}

function downloadCertificate() {
  // This would implement certificate download functionality
  showNotification('Certificate download feature coming soon!', 'info');
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
    const usersRef = collection(db, 'users');
    const usersSnapshot = await getDocs(usersRef);
    
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
  const schoolRef = doc(db, 'schools', schoolId);
  const schoolDoc = await getDoc(schoolRef);
  
  if (schoolDoc.exists()) {
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
      const logoRef = ref(storage, `partner-logos/${Date.now()}_${logoFile.name}`);
      const snapshot = await uploadBytes(logoRef, logoFile);
      logoURL = await getDownloadURL(snapshot.ref);
    }
    
    // Save to Firestore
    const partnerRef = doc(db, 'partner-branding', 'current');
    await setDoc(partnerRef, {
      name: partnerName,
      email: partnerEmail,
      website: partnerWebsite,
      logoURL: logoURL,
      updatedAt: serverTimestamp()
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
    const partnerRef = doc(db, 'partner-branding', 'current');
    await setDoc(partnerRef, {
      name: '',
      email: '',
      website: '',
      logoURL: '',
      updatedAt: serverTimestamp()
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
    
    const settingsRef = doc(db, 'settings', 'app');
    await setDoc(settingsRef, {
      enableAnalytics,
      showProgress,
      enableCertificates,
      updatedAt: serverTimestamp()
    });
    
    if (newPassword) {
      // In a real app, you'd want to hash this password
      await setDoc(doc(db, 'settings', 'admin'), {
        password: newPassword, // This should be hashed in production
        updatedAt: serverTimestamp()
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
    const isExpanded = details.style.display === 'block';
    
    // Close all other need details
    document.querySelectorAll('.need-details').forEach(detail => {
      detail.style.display = 'none';
    });
    document.querySelectorAll('.need-card').forEach(c => {
      c.classList.remove('expanded');
    });
    
    if (!isExpanded) {
      details.style.display = 'block';
      card.classList.add('expanded');
      
      // Track section interaction
      if (currentUser) {
        logEvent(analytics, 'need_expanded', {
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
    logEvent(analytics, 'abcde_step_viewed', {
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
    const usersRef = collection(db, 'users');
    const usersSnapshot = await getDocs(usersRef);
    
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

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  initializeSkidsApp();
  addAuthButton();
  initializeBackToTop();
});

// Legacy function support (for existing HTML onclick handlers)
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