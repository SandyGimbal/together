/**
 * TOGETHER — Authentication Service
 * Manages User Registration, Sign-In, Password Reset, Profile updates, and Session state.
 */

class AuthService {
  constructor() {
    this.currentUser = null;
    this.userProfile = null;
  }

  // Check current auth status and listen for changes
  initAuthObserver(onStateChanged) {
    const isDemo = localStorage.getItem('TOGETHER_DEMO_MODE') === 'true';

    if (window.firebaseManager && window.firebaseManager.isConfigured && window.firebaseManager.auth) {
      window.firebaseManager.auth.onAuthStateChanged(async (user) => {
        if (user) {
          this.currentUser = user;
          await this.loadUserProfile(user.uid);
          if (onStateChanged) onStateChanged(this.currentUser, this.userProfile);
        } else {
          this.currentUser = null;
          this.userProfile = null;
          if (onStateChanged) onStateChanged(null, null);
        }
      });
    } else if (isDemo) {
      // Demo simulated user in localStorage
      const demoUserJson = localStorage.getItem('TOGETHER_CURRENT_USER');
      if (demoUserJson) {
        try {
          const user = JSON.parse(demoUserJson);
          this.currentUser = user;
          this.userProfile = user;
          if (onStateChanged) onStateChanged(user, user);
          return;
        } catch (e) {}
      }
      if (onStateChanged) onStateChanged(null, null);
    } else {
      if (onStateChanged) onStateChanged(null, null);
    }
  }

  // Load user profile from Firebase Realtime Database
  async loadUserProfile(uid) {
    if (!window.firebaseManager.database) return null;
    try {
      const snapshot = await window.firebaseManager.database.ref(`users/${uid}`).once('value');
      this.userProfile = snapshot.val();
      return this.userProfile;
    } catch (err) {
      console.error("Failed to load user profile:", err);
      return null;
    }
  }

  // Register New User
  async register({ email, password, displayName, avatar }) {
    if (!email || !password || !displayName) {
      throw new Error("Semua data pendaftaran wajib diisi.");
    }
    if (password.length < 6) {
      throw new Error("Kata sandi minimal 6 karakter.");
    }

    const selectedAvatar = avatar || 'assets/avatars/avatar-1.svg';

    // Real Firebase mode
    if (window.firebaseManager && window.firebaseManager.isConfigured && window.firebaseManager.auth) {
      try {
        const userCred = await window.firebaseManager.auth.createUserWithEmailAndPassword(email, password);
        const user = userCred.user;

        // Update profile in Auth
        await user.updateProfile({
          displayName: displayName,
          photoURL: selectedAvatar
        });

        // Save profile in Realtime Database
        const profileData = {
          uid: user.uid,
          displayName: displayName,
          email: email,
          avatar: selectedAvatar,
          currentCoupleId: null,
          createdAt: firebase.database.ServerValue.TIMESTAMP
        };

        await window.firebaseManager.database.ref(`users/${user.uid}`).set(profileData);
        this.currentUser = user;
        this.userProfile = profileData;
        return profileData;
      } catch (err) {
        throw new Error(this.formatFirebaseError(err));
      }
    } else {
      // Demo/Simulator Mode
      const mockUid = 'demo_user_' + Math.random().toString(36).substring(2, 9);
      const profileData = {
        uid: mockUid,
        displayName: displayName,
        email: email,
        avatar: selectedAvatar,
        currentCoupleId: null,
        createdAt: Date.now()
      };
      localStorage.setItem('TOGETHER_DEMO_MODE', 'true');
      localStorage.setItem('TOGETHER_CURRENT_USER', JSON.stringify(profileData));
      this.currentUser = profileData;
      this.userProfile = profileData;
      return profileData;
    }
  }

  // Sign In with Google
  async signInWithGoogle() {
    if (window.firebaseManager && window.firebaseManager.isConfigured && window.firebaseManager.auth) {
      try {
        const provider = new firebase.auth.GoogleAuthProvider();
        const result = await window.firebaseManager.auth.signInWithPopup(provider);
        const user = result.user;

        let profile = await this.loadUserProfile(user.uid);
        if (!profile) {
          profile = {
            uid: user.uid,
            displayName: user.displayName || user.email.split('@')[0],
            email: user.email,
            avatar: user.photoURL || 'assets/avatars/avatar-1.svg',
            currentCoupleId: null,
            createdAt: firebase.database.ServerValue.TIMESTAMP
          };
          if (window.firebaseManager.database) {
            await window.firebaseManager.database.ref(`users/${user.uid}`).set(profile);
          }
        }
        this.currentUser = user;
        this.userProfile = profile;
        return { user, profile };
      } catch (err) {
        throw new Error(this.formatFirebaseError(err));
      }
    } else {
      return this.loginDemoCouple('romeo');
    }
  }

  // Login User
  async login(email, password) {
    if (!email || !password) {
      throw new Error("Email dan kata sandi wajib diisi.");
    }

    if (window.firebaseManager && window.firebaseManager.isConfigured && window.firebaseManager.auth) {
      try {
        const userCred = await window.firebaseManager.auth.signInWithEmailAndPassword(email, password);
        const user = userCred.user;
        const profile = await this.loadUserProfile(user.uid);
        this.currentUser = user;
        this.userProfile = profile;
        return { user, profile };
      } catch (err) {
        throw new Error(this.formatFirebaseError(err));
      }
    } else {
      // Demo login
      const mockUid = 'demo_' + email.replace(/[^a-zA-Z0-9]/g, '');
      const profileData = {
        uid: mockUid,
        displayName: email.split('@')[0],
        email: email,
        avatar: 'assets/avatars/avatar-1.svg',
        currentCoupleId: 'demo_couple_room',
        createdAt: Date.now()
      };
      localStorage.setItem('TOGETHER_DEMO_MODE', 'true');
      localStorage.setItem('TOGETHER_CURRENT_USER', JSON.stringify(profileData));
      this.currentUser = profileData;
      this.userProfile = profileData;
      return { user: profileData, profile: profileData };
    }
  }

  // Quick Demo Login (Romeo & Juliet Simulation)
  loginDemoCouple(role = 'romeo') {
    const isRomeo = role === 'romeo';
    const profileData = {
      uid: isRomeo ? 'demo_romeo_101' : 'demo_juliet_202',
      displayName: isRomeo ? 'Romeo Alexander' : 'Juliet Rose',
      email: isRomeo ? 'romeo@together.app' : 'juliet@together.app',
      avatar: isRomeo ? 'assets/avatars/avatar-1.svg' : 'assets/avatars/avatar-2.svg',
      currentCoupleId: 'demo_couple_room',
      partnerUid: isRomeo ? 'demo_juliet_202' : 'demo_romeo_101',
      partnerName: isRomeo ? 'Juliet Rose' : 'Romeo Alexander',
      partnerAvatar: isRomeo ? 'assets/avatars/avatar-2.svg' : 'assets/avatars/avatar-1.svg',
      createdAt: Date.now()
    };
    localStorage.setItem('TOGETHER_DEMO_MODE', 'true');
    localStorage.setItem('TOGETHER_CURRENT_USER', JSON.stringify(profileData));
    this.currentUser = profileData;
    this.userProfile = profileData;
    return profileData;
  }

  // Send Password Reset
  async resetPassword(email) {
    if (!email) throw new Error("Silakan masukkan alamat email Anda.");

    if (window.firebaseManager && window.firebaseManager.isConfigured && window.firebaseManager.auth) {
      try {
        await window.firebaseManager.auth.sendPasswordResetEmail(email);
        return true;
      } catch (err) {
        throw new Error(this.formatFirebaseError(err));
      }
    } else {
      // Simulated reset
      return true;
    }
  }

  // Logout
  async logout() {
    if (window.firebaseManager && window.firebaseManager.isConfigured && window.firebaseManager.auth) {
      try {
        await window.firebaseManager.auth.signOut();
      } catch (err) {
        console.error("Signout error:", err);
      }
    }
    localStorage.removeItem('TOGETHER_CURRENT_USER');
    this.currentUser = null;
    this.userProfile = null;
    window.location.href = 'login.html';
  }

  // User Friendly Firebase Error Strings
  formatFirebaseError(error) {
    switch (error.code) {
      case 'auth/email-already-in-use':
        return 'Alamat email ini sudah terdaftar. Silakan login.';
      case 'auth/invalid-email':
        return 'Format alamat email tidak valid.';
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return 'Email atau kata sandi yang Anda masukkan salah.';
      case 'auth/weak-password':
        return 'Kata sandi terlalu lemah (minimal 6 karakter).';
      case 'auth/network-request-failed':
        return 'Gagal terhubung ke jaringan internet. Periksa koneksi Anda.';
      case 'auth/too-many-requests':
        return 'Terlalu banyak percobaan masuk gagal. Coba lagi dalam beberapa saat.';
      default:
        return error.message || 'Terjadi kesalahan pada sistem otentikasi.';
    }
  }
}

// Global Singleton
window.authService = new AuthService();

