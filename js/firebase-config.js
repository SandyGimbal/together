/**
 * TOGETHER — Firebase Configuration & Initialization Service
 * Manages Firebase App, Auth, and Realtime Database connections.
 * Supports both real Firebase credentials and localized simulator mode.
 */

// Default configuration template.
// Replace these with your real Firebase Project credentials from Firebase Console:
const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyD6uUj3Pfn7K4xahZelpCi4nVLNgPTi_rM",
  authDomain: "couple-interface.firebaseapp.com",
  databaseURL: "https://couple-interface-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "couple-interface",
  storageBucket: "couple-interface.firebasestorage.app",
  messagingSenderId: "358371067817",
  appId: "1:358371067817:web:4e6527504362359808e6b8"
};

class FirebaseManager {
  constructor() {
    this.app = null;
    this.auth = null;
    this.database = null;
    this.isConfigured = false;
    this.isDemoMode = false;
  }

  // Get active config (from localStorage if user pasted custom keys, otherwise DEFAULT)
  getConfig() {
    const saved = localStorage.getItem('TOGETHER_FIREBASE_CONFIG');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Invalid saved Firebase config JSON in localStorage", e);
      }
    }
    return DEFAULT_FIREBASE_CONFIG;
  }

  // Save new custom config from UI modal
  saveConfig(newConfig) {
    localStorage.setItem('TOGETHER_FIREBASE_CONFIG', JSON.stringify(newConfig));
    window.location.reload();
  }

  // Reset to default
  resetConfig() {
    localStorage.removeItem('TOGETHER_FIREBASE_CONFIG');
    window.location.reload();
  }

  // Initialize Firebase App
  init() {
    const config = this.getConfig();

    // Check if configuration has been filled in with real credentials
    if (!config.apiKey || config.apiKey === "YOUR_API_KEY_HERE" || config.apiKey.includes("YOUR_")) {
      console.warn("⚠️ TOGETHER: Firebase configuration is not set yet. Running in Demo / Simulated Mode.");
      this.isConfigured = false;
      this.isDemoMode = true;
      return false;
    }

    try {
      if (typeof firebase !== 'undefined') {
        if (!firebase.apps.length) {
          this.app = firebase.initializeApp(config);
        } else {
          this.app = firebase.app();
        }
        this.auth = firebase.auth();
        this.database = firebase.database();
        this.isConfigured = true;
        this.isDemoMode = false;
        console.log("✅ TOGETHER: Connected to Firebase Realtime Cloud Backend.");
        return true;
      } else {
        console.warn("Firebase SDK script not loaded yet.");
        this.isDemoMode = true;
        return false;
      }
    } catch (err) {
      console.error("Failed to initialize Firebase:", err);
      this.isDemoMode = true;
      return false;
    }
  }

  // Enable Demo/Simulator Mode explicitly
  enableDemoMode() {
    this.isDemoMode = true;
    localStorage.setItem('TOGETHER_DEMO_MODE', 'true');
    console.log("🎮 TOGETHER Demo Mode Activated.");
  }
}

// Global Singleton Instance
window.firebaseManager = new FirebaseManager();

// Automatically try initializing when loaded
document.addEventListener('DOMContentLoaded', () => {
  window.firebaseManager.init();
});

