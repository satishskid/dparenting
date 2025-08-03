// Simple test file to check basic functionality
console.log('Test app.js loading...');

function openAuthModal() {
    console.log('openAuthModal called');
    alert('openAuthModal works!');
}

// Expose to global scope
window.openAuthModal = openAuthModal;

console.log('Test app.js loaded successfully');
console.log('openAuthModal type:', typeof openAuthModal);
console.log('window.openAuthModal type:', typeof window.openAuthModal);
