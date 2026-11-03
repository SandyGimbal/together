/**
 * TOGETHER — Couple Pairing Engine
 * Manages Unique Pairing Code Generation, Room Creation, Joining, and Two-Way Coupling.
 */

class PairingService {
  constructor() {
    this.activeCoupleListener = null;
    this.activeCodeListener = null;
  }

  // Generate a random 6-character clean alphanumeric code (e.g. TOG-9B7F4K)
  generatePairingCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No ambiguous characters like 0, O, 1, I
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `TOG-${result}`;
  }

  // Create a new Couple Room
  async createCoupleRoom(user, profile) {
    const activeUser = user || (window.firebaseManager?.auth?.currentUser) || window.authService?.currentUser;
    if (!activeUser) throw new Error("Sesi login Anda belum aktif. Silakan masuk terlebih dahulu.");

    const code = this.generatePairingCode();
    const coupleId = 'couple_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);

    const isSandy = (activeUser.displayName?.toLowerCase().includes('sandy') || activeUser.email?.toLowerCase().includes('sandy'));
    const defaultName = isSandy ? 'Sandy' : (activeUser.displayName || 'Sandy');

    const activeProfile = profile || window.authService?.userProfile || {
      displayName: defaultName,
      avatar: activeUser.photoURL || (isSandy ? 'assets/avatars/avatar-1.svg' : 'assets/avatars/avatar-2.svg'),
      email: activeUser.email || ''
    };

    // If Real Firebase mode
    if (window.firebaseManager && window.firebaseManager.isConfigured && window.firebaseManager.database) {
      const db = window.firebaseManager.database;

      const coupleData = {
        coupleId: coupleId,
        code: code,
        status: 'waiting',
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        members: {
          [activeUser.uid]: {
            uid: activeUser.uid,
            displayName: activeProfile.displayName || 'Pasangan A',
            avatar: activeProfile.avatar || 'assets/avatars/avatar-1.svg',
            email: activeUser.email || '',
            joinedAt: firebase.database.ServerValue.TIMESTAMP,
            online: true
          }
        },
        locations: {
          [activeUser.uid]: {
            latitude: 0,
            longitude: 0,
            accuracy: 0,
            heading: 0,
            speed: 0,
            timestamp: firebase.database.ServerValue.TIMESTAMP,
            sharingEnabled: true,
            lastUpdated: firebase.database.ServerValue.TIMESTAMP
          }
        },
        settings: {
          historyEnabled: true,
          geofenceRadius: 150
        }
      };

      const pairingCodeData = {
        code: code,
        coupleId: coupleId,
        createdBy: activeUser.uid,
        creatorName: activeProfile.displayName || 'Pasangan A',
        creatorAvatar: activeProfile.avatar || 'assets/avatars/avatar-1.svg',
        status: 'pending',
        createdAt: firebase.database.ServerValue.TIMESTAMP
      };

      // Write both couple and pairing code in atomic update
      const updates = {};
      updates[`couples/${coupleId}`] = coupleData;
      updates[`pairingCodes/${code}`] = pairingCodeData;
      updates[`users/${activeUser.uid}/currentCoupleId`] = coupleId;

      try {
        const updatePromise = db.ref().update(updates);
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Koneksi timeout. Pastikan tab Rules di Realtime Database sudah diatur ke "auth != null" lalu klik Publikasikan.')), 12000));
        await Promise.race([updatePromise, timeoutPromise]);
        
        // Cache to localStorage for resilience
        localStorage.setItem('TOGETHER_CURRENT_COUPLE_ID', coupleId);
      } catch (err) {
        console.error("Room creation error:", err);
        throw new Error(err.message || "Gagal menyimpan room ke database.");
      }

      return { coupleId, code };
    } else {
      // Demo / Simulator Mode
      const demoCouple = {
        coupleId: coupleId,
        code: code,
        status: 'waiting',
        createdAt: Date.now(),
        members: {
          [activeUser.uid]: {
            uid: activeUser.uid,
            displayName: activeProfile.displayName || 'Sandy',
            avatar: activeProfile.avatar || 'assets/avatars/avatar-1.svg',
            online: true
          }
        }
      };
      localStorage.setItem('TOGETHER_DEMO_COUPLE', JSON.stringify(demoCouple));
      localStorage.setItem('TOGETHER_PENDING_CODE', code);
      return { coupleId, code };
    }
  }

  // Join an existing Couple Room using Pairing Code
  async joinCoupleRoom(codeToJoin, user, profile) {
    const activeUser = user || (window.firebaseManager?.auth?.currentUser) || window.authService?.currentUser;
    if (!activeUser) throw new Error("Sesi login Anda belum aktif. Silakan masuk terlebih dahulu.");
    const formattedCode = codeToJoin.trim().toUpperCase();

    if (!formattedCode || formattedCode.length < 6) {
      throw new Error("Format kode pairing tidak valid.");
    }

    const isDhea = (!activeUser.displayName?.toLowerCase().includes('sandy') && !activeUser.email?.toLowerCase().includes('sandy'));
    const defaultPartnerBName = isDhea ? 'Dhea Sri Dewi' : (activeUser.displayName || 'Pasangan');
    const defaultPartnerBAvatar = isDhea ? 'assets/avatars/avatar-2.svg' : 'assets/avatars/avatar-1.svg';

    const activeProfile = profile || window.authService?.userProfile || {
      displayName: activeUser.displayName || defaultPartnerBName,
      avatar: activeUser.photoURL || defaultPartnerBAvatar,
      email: activeUser.email || ''
    };

    if (window.firebaseManager && window.firebaseManager.isConfigured && window.firebaseManager.database) {
      const db = window.firebaseManager.database;

      // Check pairing code existence with safety timeout
      let codeSnapshot;
      try {
        const fetchPromise = db.ref(`pairingCodes/${formattedCode}`).once('value');
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Koneksi timeout saat mengecek kode pairing.')), 10000));
        codeSnapshot = await Promise.race([fetchPromise, timeoutPromise]);
      } catch (e) {
        throw new Error(e.message || "Gagal menghubungi database.");
      }
      const codeData = codeSnapshot.val();

      if (!codeData) {
        throw new Error("Kode pairing tidak ditemukan. Mohon periksa kembali kodenya.");
      }
      if (codeData.status !== 'pending') {
        throw new Error("Kode pairing ini sudah digunakan atau sudah tidak aktif.");
      }
      if (codeData.createdBy === user.uid) {
        throw new Error("Anda tidak dapat memasangkan kode dengan akun Anda sendiri.");
      }

      const coupleId = codeData.coupleId;

      // Add User B to couple members
      const memberB = {
        uid: user.uid,
        displayName: activeProfile.displayName || defaultPartnerBName,
        avatar: activeProfile.avatar || defaultPartnerBAvatar,
        email: user.email || '',
        joinedAt: firebase.database.ServerValue.TIMESTAMP,
        online: true
      };

      // Check if User B has an existing lastLocation saved in users/${user.uid}/lastLocation
      let knownLoc = null;
      try {
        const uSnap = await db.ref(`users/${user.uid}/lastLocation`).once('value');
        knownLoc = uSnap.val();
      } catch (e) {}

      const locB = (knownLoc && knownLoc.latitude) ? knownLoc : {
        latitude: 0,
        longitude: 0,
        accuracy: 0,
        heading: 0,
        speed: 0,
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        sharingEnabled: true,
        lastUpdated: firebase.database.ServerValue.TIMESTAMP
      };

      const updates = {};
      updates[`couples/${coupleId}/members/${user.uid}`] = memberB;
      updates[`couples/${coupleId}/locations/${user.uid}`] = locB;
      updates[`couples/${coupleId}/status`] = 'active';
      updates[`pairingCodes/${formattedCode}/status`] = 'used';
      updates[`pairingCodes/${formattedCode}/partnerUid`] = user.uid;
      updates[`users/${user.uid}/currentCoupleId`] = coupleId;

      try {
        const updatePromise = db.ref().update(updates);
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Koneksi timeout saat bergabung ke room.')), 10000));
        await Promise.race([updatePromise, timeoutPromise]);
        
        // Cache to localStorage for resilience
        localStorage.setItem('TOGETHER_CURRENT_COUPLE_ID', coupleId);
      } catch (e) {
        throw new Error(e.message || "Gagal menghubungkan ke room.");
      }
      return { coupleId, code: formattedCode };
    } else {
      // Demo simulated join
      const coupleId = 'demo_couple_room';
      return { coupleId, code: formattedCode };
    }
  }

  // Listen for partner joining while room is in 'waiting' state
  listenForPartnerJoin(coupleId, currentUid, onPartnerJoined) {
    if (window.firebaseManager && window.firebaseManager.isConfigured && window.firebaseManager.database) {
      const db = window.firebaseManager.database;
      const ref = db.ref(`couples/${coupleId}`);

      ref.on('value', (snapshot) => {
        const data = snapshot.val();
        if (!data || !data.members) return;

        // Check if there is a second member who is not currentUid
        const memberKeys = Object.keys(data.members);
        const partnerKey = memberKeys.find(key => key !== currentUid);

        if (partnerKey && data.status === 'active') {
          const partner = data.members[partnerKey];
          if (onPartnerJoined) {
            onPartnerJoined(partner);
          }
        }
      });
      this.activeCoupleListener = ref;
    }
  }

  // Stop listening
  stopListening() {
    if (this.activeCoupleListener) {
      this.activeCoupleListener.off();
      this.activeCoupleListener = null;
    }
  }

  // Leave / Unpair Couple Room
  async leaveCoupleRoom(coupleId, user) {
    if (!coupleId || !user) return;

    if (window.firebaseManager && window.firebaseManager.isConfigured && window.firebaseManager.database) {
      const db = window.firebaseManager.database;
      const updates = {};
      updates[`users/${user.uid}/currentCoupleId`] = null;
      updates[`couples/${coupleId}/status`] = 'dissolved';
      await db.ref().update(updates);
    }

    // Reset local state
    if (window.authService && window.authService.userProfile) {
      window.authService.userProfile.currentCoupleId = null;
    }
    localStorage.removeItem('TOGETHER_DEMO_COUPLE');
    localStorage.removeItem('TOGETHER_CURRENT_COUPLE_ID');
    window.location.href = 'pairing.html';
  }
}

// Global Singleton
window.pairingService = new PairingService();

