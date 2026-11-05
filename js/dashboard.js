/**
 * TOGETHER — Master Dashboard Controller
 * Orchestrates Map, Geolocation, Realtime Couple Sync, Privacy Controls, and Telemetry.
 */

class DashboardController {
  constructor() {
    this.user = null;
    this.userProfile = null;
    this.coupleId = null;
    this.partnerUid = null;
    this.partnerProfile = null;
    this.partnerLocation = null;
    this.myLocation = null;

    this.isGhostMode = false;
    this.isSharingPaused = false;
    this.isSimulatingPartner = false;
    this.simulationTimer = null;
    this.lastGeofenceState = null; // 'inside' or 'outside'
    this.homeGeofence = null;
  }

  // Initialize Dashboard
  async init() {
    console.log("🚀 Initializing TOGETHER Dashboard...");

    // Setup Auth Observer
    window.authService.initAuthObserver(async (user, profile) => {
      if (!user) {
        console.warn("Unauthenticated session. Redirecting to login...");
        window.location.href = 'login.html';
        return;
      }

      this.user = user;
      this.userProfile = profile || user;

      // Check couple status
      const isDemoMode = localStorage.getItem('TOGETHER_DEMO_MODE') === 'true';

      if (!isDemoMode && window.firebaseManager?.isConfigured) {
        const coupleId = this.userProfile?.currentCoupleId;
        if (!coupleId) {
          console.warn("No active couple room in profile. Redirecting to pairing...");
          window.location.href = 'pairing.html';
          return;
        }

        // Verify couple status in Firebase
        try {
          const snap = await window.firebaseManager.database.ref(`couples/${coupleId}`).once('value');
          const data = snap.val();
          if (!data || data.status !== 'active') {
            console.warn("Couple is not active yet (waiting for partner or dissolved). Redirecting to pairing...");
            window.location.href = 'pairing.html';
            return;
          }
          this.coupleId = coupleId;
        } catch (e) {
          console.warn("Failed checking couple in DB:", e);
          window.location.href = 'pairing.html';
          return;
        }
      } else {
        // Explicit Demo Mode
        this.coupleId = 'demo_couple_room';
      }

      // Initialize UI, Map and Listeners
      await this.setupEnvironment();
    });
  }

  // Setup Map & Data Listeners
  async setupEnvironment() {
    // 1. Initialize Map
    window.mapEngine.initMap('map');

    // 2. Setup Event Handlers (Buttons, controls, sheet)
    this.bindUIEvents();

    // 3. Start GPS tracking for current user
    this.startUserGPS();

    // 4. Start listening to couple data in Firebase or Demo Mode
    if (window.firebaseManager && window.firebaseManager.isConfigured && window.firebaseManager.database) {
      this.subscribeToFirebaseCouple();
    } else {
      this.setupDemoModeCouple();
    }

    // 5. Hide cinematic loading screen after brief smooth intro
    setTimeout(() => {
      const loader = document.getElementById('cinematic-loader');
      if (loader) loader.classList.add('hide');
    }, 1200);
  }

  // Start watching user's GPS
  startUserGPS() {
    window.locationService.startTracking(
      (locData, shouldBroadcast) => {
        this.myLocation = locData;
        this.updateMyTelemetryUI(locData);
        window.mapEngine.updateMyMarker(locData, this.userProfile);

        // Auto-synchronize map directly to user's real location on first GPS fix
        if (!this.hasAutoCentered && locData.latitude && locData.longitude) {
          this.hasAutoCentered = true;
          window.mapEngine.map.flyTo([locData.latitude, locData.longitude], 16, { animate: true, duration: 1.5 });
          window.notifier.showToast("Lokasi Anda Terdeteksi 📍", "Peta otomatis disinkronkan ke posisi nyata Anda.", "success", 2500);
        }

        // Broadcast to Firebase if throttler approves and sharing is active
        if (shouldBroadcast && !this.isSharingPaused) {
          window.locationService.broadcastLocation(this.coupleId, this.user.uid);
        }

        // Recalculate distance between lovers
        this.recalculateCoupleDistance();
      },
      (err) => {
        console.warn("GPS Notice:", err.message);
        if (err.code === 1) {
          window.notifier.showToast("Akses GPS Ditolak", "Mohon berikan izin lokasi di browser agar pasangan dapat melihat Anda.", "warning");
        }
      }
    );
  }

  // Reverse Geocoding with OSM Nominatim & Local Cache
  async reverseGeocode(lat, lng) {
    if (!lat || !lng) return 'Koordinat belum tersedia';
    const cacheKey = `GEO_${lat.toFixed(3)}_${lng.toFixed(3)}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) return cached;

    try {
      const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14&addressdetails=1`, {
        headers: { 'Accept-Language': 'id,en' }
      });
      if (resp.ok) {
        const data = await resp.json();
        const addr = data.address || {};
        const village = addr.village || addr.suburb || addr.neighbourhood || addr.quarter || '';
        const district = addr.county || addr.city_district || addr.municipality || '';
        const city = addr.city || addr.town || addr.regency || addr.state_district || '';
        const state = addr.state || '';
        
        let label = [village, district, city, state].filter(Boolean).slice(0, 2).join(', ');
        if (!label) label = data.display_name ? data.display_name.split(',').slice(0, 2).join(',') : `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        sessionStorage.setItem(cacheKey, label);
        return label;
      }
    } catch (e) {
      console.warn("Reverse geocode fetch skipped:", e.message);
    }
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }

  // Google Maps Style Movement State (Speed Based)
  getMovementState(speed) {
    const s = Number(speed) || 0;
    if (s <= 2) {
      return { text: 'Diam', class: 'idle' };
    } else if (s <= 18) {
      return { text: `Berjalan (${s} km/j)`, class: 'walking' };
    } else {
      return { text: `Berkendara (${s} km/j)`, class: 'driving' };
    }
  }

  // Toggle History Breadcrumb Trail
  async toggleBreadcrumbTrail() {
    if (!this.coupleId || !this.partnerUid) {
      window.notifier?.showToast("Jejak Riwayat", "Data pasangan belum tersedia.", "warning");
      return;
    }

    if (this.showingHistoryTrail) {
      this.showingHistoryTrail = false;
      if (window.mapEngine.historyPolyline) {
        window.mapEngine.map.removeLayer(window.mapEngine.historyPolyline);
        window.mapEngine.historyPolyline = null;
      }
      window.notifier?.showToast("Jejak Riwayat", "Jejak riwayat perjalanan disembunyikan.", "info");
      return;
    }

    window.notifier?.showToast("Mengambil Riwayat...", "Mengambil rute perjalanan pasangan...", "info", 2000);
    try {
      const db = window.firebaseManager?.database;
      if (!db) throw new Error("Database offline");

      const snap = await db.ref(`couples/${this.coupleId}/history/${this.partnerUid}`)
        .limitToLast(60)
        .once('value');
      
      const historyData = snap.val();
      if (!historyData) {
        window.notifier?.showToast("Belum Ada Riwayat", "Pasangan baru saja terhubung atau belum berpindah tempat.", "info", 3000);
        return;
      }

      const points = Object.values(historyData)
        .filter(p => p && p.lat && p.lng)
        .map(p => ({ lat: p.lat, lng: p.lng }));

      if (points.length < 2) {
        window.notifier?.showToast("Jejak Terlalu Pendek", "Belum cukup titik koordinat untuk menggambar garis lintasan.", "info", 3000);
        return;
      }

      window.mapEngine.renderBreadcrumbTrail(points);
      this.showingHistoryTrail = true;
      window.notifier?.showToast("Jejak Riwayat Aktif 📍", `Menampilkan rute ${points.length} titik perjalanan pasangan.`, "success", 4000);
    } catch (e) {
      console.warn("History trail fetch error:", e);
      window.notifier?.showToast("Gagal Memuat Riwayat", e.message, "error");
    }
  }

  // Validation helper for GPS coordinates
  isValidLocation(loc) {
    if (!loc) return false;
    const lat = parseFloat(loc.latitude ?? loc.lat);
    const lng = parseFloat(loc.longitude ?? loc.lng);
    return !isNaN(lat) && !isNaN(lng) && (Math.abs(lat) > 0.0001 || Math.abs(lng) > 0.0001);
  }

  // Firebase Realtime Listener
  subscribeToFirebaseCouple() {
    const db = window.firebaseManager.database;
    const coupleRef = db.ref(`couples/${this.coupleId}`);

    // Track partner info and locations
    coupleRef.on('value', (snapshot) => {
      const data = snapshot.val();
      if (!data) return;

      // 1. Identify partner UID from members
      if (data.members) {
        const memberKeys = Object.keys(data.members);
        this.partnerUid = memberKeys.find(key => key !== this.user.uid);

        if (this.partnerUid && data.members[this.partnerUid]) {
          this.partnerProfile = data.members[this.partnerUid];
          this.ensurePartnerNames();
          this.updatePartnerProfileUI(this.partnerProfile);

          // Direct User Node Listener (Path Z: High Resilience)
          if (!this.isListeningToPartnerDirectUser) {
            this.isListeningToPartnerDirectUser = true;
            db.ref(`users/${this.partnerUid}/lastLocation`).on('value', (uSnap) => {
              const directLoc = uSnap.val();
              if (this.isValidLocation(directLoc)) {
                this.ensurePartnerNames();
                this.handlePartnerLocationUpdate(directLoc);
              }
            });
          }
        }
      }

      // 2. Fallback partner UID from locations
      if (!this.partnerUid && data.locations) {
        const locKeys = Object.keys(data.locations);
        this.partnerUid = locKeys.find(key => key !== this.user.uid);
      }

      // Check cached partner location from localStorage to eliminate initial blank
      if (!this.partnerLocation) {
        const cachedPartner = localStorage.getItem('TOGETHER_LAST_PARTNER_LOC');
        if (cachedPartner) {
          try {
            const parsed = JSON.parse(cachedPartner);
            if (this.isValidLocation(parsed)) {
              this.handlePartnerLocationUpdate(parsed);
            }
          } catch (e) {}
        }
      }

      // 3. Multi-path partner location extraction (Sandy & Dhea synchronization)
      let foundPartnerLoc = null;

      // Path A: data.locations[partnerUid]
      if (this.partnerUid && data.locations && this.isValidLocation(data.locations[this.partnerUid])) {
        foundPartnerLoc = data.locations[this.partnerUid];
      }

      // Path B: data.members[partnerUid].lastLocation
      if (!foundPartnerLoc && this.partnerUid && data.members && data.members[this.partnerUid] && this.isValidLocation(data.members[this.partnerUid].lastLocation)) {
        foundPartnerLoc = data.members[this.partnerUid].lastLocation;
      }

      // Path C: Any location entry not belonging to current user
      if (!foundPartnerLoc && data.locations) {
        for (const [key, loc] of Object.entries(data.locations)) {
          if (key !== this.user.uid && this.isValidLocation(loc)) {
            foundPartnerLoc = loc;
            this.partnerUid = key;
            break;
          }
        }
      }

      // Path D: Any member lastLocation not belonging to current user
      if (!foundPartnerLoc && data.members) {
        for (const [key, member] of Object.entries(data.members)) {
          if (key !== this.user.uid && this.isValidLocation(member.lastLocation)) {
            foundPartnerLoc = member.lastLocation;
            this.partnerUid = key;
            break;
          }
        }
      }

      if (foundPartnerLoc) {
        this.ensurePartnerNames();
        this.handlePartnerLocationUpdate(foundPartnerLoc);
      }
    });

    // 4. Dedicated Child-level Location Watcher for Instant GPS Push
    const locsRef = db.ref(`couples/${this.coupleId}/locations`);
    const handleLocSnap = (snap) => {
      if (snap.key && snap.key !== this.user.uid) {
        const pLoc = snap.val();
        if (this.isValidLocation(pLoc)) {
          this.partnerUid = snap.key;
          this.ensurePartnerNames();
          this.handlePartnerLocationUpdate(pLoc);
        }
      }
    };
    locsRef.on('child_changed', handleLocSnap);
    locsRef.on('child_added', handleLocSnap);

    // 5. Watch member changes (for lastLocation updates)
    const membersRef = db.ref(`couples/${this.coupleId}/members`);
    membersRef.on('child_changed', (snap) => {
      if (snap.key && snap.key !== this.user.uid) {
        const member = snap.val();
        if (member && this.isValidLocation(member.lastLocation)) {
          this.partnerUid = snap.key;
          this.ensurePartnerNames();
          this.handlePartnerLocationUpdate(member.lastLocation);
        }
      }
    });

    // 6. Initialize Love Ping / Notification Listener
    this.initLovePingSystem();

    // Auto-request initial partner GPS fix via silent ping
    setTimeout(() => {
      if (this.coupleId && this.user) {
        try {
          db.ref(`couples/${this.coupleId}/pings`).push({
            senderUid: this.user.uid,
            senderName: this.userProfile?.displayName || 'Sandy',
            message: 'Meminta pembaruan lokasi GPS...',
            type: 'location_request',
            timestamp: firebase.database.ServerValue.TIMESTAMP
          });
        } catch (pErr) {}
      }
    }, 1500);

    // Periodic silent partner GPS ping until partner coordinates arrive
    if (!this.partnerLocReqInterval) {
      this.partnerLocReqInterval = setInterval(() => {
        if (!this.partnerLocation && this.coupleId && this.user) {
          try {
            db.ref(`couples/${this.coupleId}/pings`).push({
              senderUid: this.user.uid,
              senderName: this.userProfile?.displayName || 'Sandy',
              message: 'Meminta pembaruan lokasi GPS...',
              type: 'location_request',
              timestamp: firebase.database.ServerValue.TIMESTAMP
            });
          } catch (e) {}
        }
      }, 12000);
    }

    // Monitor Firebase Connection status
    const connectedRef = db.ref('.info/connected');
    connectedRef.on('value', (snap) => {
      const isOnline = snap.val() === true;
      const statusPill = document.getElementById('connection-status-pill');
      const navbarOnlineDot = document.getElementById('navbar-live-status');
      if (statusPill) {
        if (isOnline) {
          statusPill.innerHTML = `<span class="status-dot"></span> Cloud Sync Aktif`;
          statusPill.className = `status-badge live`;
        } else {
          statusPill.innerHTML = `<span class="status-dot"></span> Menghubungkan...`;
          statusPill.className = `status-badge idle`;
        }
      }
      if (navbarOnlineDot) {
        navbarOnlineDot.className = isOnline ? 'navbar-online-indicator live' : 'navbar-online-indicator idle';
      }
    });
  }

  // Love Ping & Romantic Notification System
  initLovePingSystem() {
    const db = window.firebaseManager?.database;
    if (!db || !this.coupleId) return;

    this.sessionStartTime = Date.now();
    const pingsRef = db.ref(`couples/${this.coupleId}/pings`);

    pingsRef.limitToLast(1).on('child_added', (snap) => {
      const ping = snap.val();
      if (!ping) return;

      // Only respond to pings created after this page loaded
      const pingTime = ping.timestamp || 0;
      if (pingTime < this.sessionStartTime - 5000) return;

      // Ignore pings sent by oneself
      if (ping.senderUid === this.user?.uid) return;

      console.log("💌 Received Love Ping from Partner:", ping);

      // 1. Play sweet romantic chime sound
      this.playRomanticChime();

      // 2. Vibrate mobile device if supported
      if ('vibrate' in navigator) {
        try {
          navigator.vibrate([250, 120, 250, 120, 450]);
        } catch (vErr) {}
      }

      // 3. Show Romantic In-App Toast
      const partnerName = this.partnerProfile?.nickname || this.partnerProfile?.displayName || 'Pasangan';
      window.notifier?.showToast(
        `Notifikasi Cinta dari ${partnerName} 💕`,
        ping.message || 'Mengirim getaran cinta untukmu!',
        'romantic',
        8000
      );

      // 4. System Push Notification if permission granted
      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification(`Notif Cinta dari ${partnerName} 💕`, {
            body: ping.message || 'Aku sedang memikirkanmu!',
            icon: this.partnerProfile?.avatar || 'assets/avatars/avatar-2.svg'
          });
        } catch (nErr) {}
      }

      // 5. If partner asked "di mana" or ping is location request, force immediate GPS broadcast
      if (ping.type === 'location_request' || (ping.message && ping.message.toLowerCase().includes('di mana'))) {
        console.log("📍 Location requested by partner. Broadcasting current coordinates...");
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            window.locationService.handleRawPosition(pos, (locData) => {
              this.myLocation = locData;
              window.locationService.broadcastLocation(this.coupleId, this.user.uid, locData);
              window.mapEngine.updateMyMarker(locData, this.userProfile);
              this.recalculateCoupleDistance();
            });
          },
          () => {},
          { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
        );
      }
    });
  }

  // Send a Love Ping to Partner
  async sendLovePing(messageText, pingType = 'love_ping') {
    if (!messageText || !messageText.trim()) return;
    const db = window.firebaseManager?.database;
    if (!db || !this.coupleId || !this.user) {
      window.notifier?.showToast("Love Ping", "Mode offline atau database belum terhubung.", "warning");
      return;
    }

    try {
      const pingRef = db.ref(`couples/${this.coupleId}/pings`).push();
      await pingRef.set({
        senderUid: this.user.uid,
        senderName: this.userProfile?.displayName || 'Sandy',
        message: messageText.trim(),
        type: pingType,
        timestamp: firebase.database.ServerValue.TIMESTAMP
      });

      // Also force immediate broadcast of my location so partner's map updates in tandem
      if (this.myLocation) {
        window.locationService.broadcastLocation(this.coupleId, this.user.uid, this.myLocation);
      }

      window.notifier?.showToast("Notifikasi Cinta Terkirim 💕", `Pesan "${messageText}" berhasil dikirim ke pasangan.`, "romantic", 3500);
      
      // Close ping modal
      document.getElementById('love-ping-modal')?.classList.remove('active');
    } catch (err) {
      console.error("Gagal mengirim love ping:", err);
      window.notifier?.showToast("Gagal Mengirim", err.message, "error");
    }
  }

  // Pure Web Audio API Harmonic Chime Synthesizer (Zero asset download required)
  playRomanticChime() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      // Sparkling couple chime frequencies: E5 (659.25Hz), G#5 (830.61Hz), B5 (987.77Hz), E6 (1318.51Hz)
      const freqs = [659.25, 830.61, 987.77, 1318.51];
      const now = ctx.currentTime;

      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.11);

        gain.gain.setValueAtTime(0, now + idx * 0.11);
        gain.gain.linearRampToValueAtTime(0.22, now + idx * 0.11 + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.11 + 0.9);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + idx * 0.11);
        osc.stop(now + idx * 0.11 + 0.95);
      });
    } catch (e) {
      console.warn("AudioContext chime note:", e.message);
    }
  }

  // Ensure partner names are romantically populated
  ensurePartnerNames() {
    const isCurrentUserSandy = this.userProfile?.displayName?.toLowerCase().includes('sandy') ||
                               this.user?.email?.toLowerCase().includes('sandy');

    if (!this.partnerProfile) {
      this.partnerProfile = {
        displayName: isCurrentUserSandy ? 'Dhea Sri Dewi' : 'Sandy',
        nickname: isCurrentUserSandy ? 'Dhea' : 'Sandy',
        avatar: isCurrentUserSandy ? 'assets/avatars/avatar-2.svg' : 'assets/avatars/avatar-1.svg',
        online: true
      };
    } else {
      if (!this.partnerProfile.displayName || this.partnerProfile.displayName.startsWith('Pasangan')) {
        this.partnerProfile.displayName = isCurrentUserSandy ? 'Dhea Sri Dewi' : 'Sandy';
        this.partnerProfile.nickname = isCurrentUserSandy ? 'Dhea' : 'Sandy';
      }
    }
  }

  // Setup Simulated Couple Mode for local testing
  setupDemoModeCouple() {
    console.log("🎮 Setting up Local Couple Simulation (Sandy & Dhea)...");
    const isSandy = this.userProfile.displayName?.toLowerCase().includes('sandy') || 
                    this.userProfile.email?.toLowerCase().includes('sandy') || 
                    this.userProfile.uid?.includes('sandy') || 
                    !this.userProfile.displayName?.toLowerCase().includes('dhea');

    this.partnerProfile = {
      uid: isSandy ? 'demo_dhea_202' : 'demo_sandy_101',
      displayName: isSandy ? 'Dhea Sri Dewi' : 'Sandy',
      nickname: isSandy ? 'Dhea' : 'Sandy',
      avatar: isSandy ? 'assets/avatars/avatar-2.svg' : 'assets/avatars/avatar-1.svg',
      online: true
    };

    this.updatePartnerProfileUI(this.partnerProfile);

    // Initial partner location (simulated ~1.2 km away from default Jakarta or user position)
    const baseLat = this.myLocation?.latitude || -6.2088;
    const baseLng = this.myLocation?.longitude || 106.8456;

    const initialPartnerLoc = {
      latitude: baseLat + 0.009,
      longitude: baseLng + 0.008,
      accuracy: 12,
      heading: 45,
      speed: 18, // km/h
      timestamp: Date.now(),
      batteryLevel: 88,
      isCharging: false,
      sharingEnabled: true
    };

    this.handlePartnerLocationUpdate(initialPartnerLoc);

    // Start subtle realistic autonomous partner movement simulation
    this.startPartnerSimulation(baseLat, baseLng);

    const statusPill = document.getElementById('connection-status-pill');
    if (statusPill) {
      statusPill.innerHTML = `<span class="status-dot"></span> Demo Simulator Mode`;
      statusPill.className = `status-badge recent`;
    }
  }

  // Simulate partner moving smoothly around the map
  startPartnerSimulation(baseLat, baseLng) {
    if (this.simulationTimer) clearInterval(this.simulationTimer);

    let angle = 0;
    this.simulationTimer = setInterval(() => {
      angle += 0.08;
      const radius = 0.012; // ~1.3 km orbit
      const simulatedLat = (this.myLocation?.latitude || baseLat) + Math.cos(angle) * radius;
      const simulatedLng = (this.myLocation?.longitude || baseLng) + Math.sin(angle) * (radius * 1.2);

      const pLoc = {
        latitude: simulatedLat,
        longitude: simulatedLng,
        accuracy: Math.floor(8 + Math.random() * 8),
        heading: Math.round(((angle * 180 / Math.PI) + 90) % 360),
        speed: Math.floor(15 + Math.sin(angle) * 12),
        timestamp: Date.now(),
        batteryLevel: Math.max(20, 88 - Math.floor(angle * 2)),
        isCharging: false,
        sharingEnabled: true
      };

      this.handlePartnerLocationUpdate(pLoc);
    }, 4000);
  }

  // Partner Location Update Handler
  handlePartnerLocationUpdate(pLoc) {
    if (!this.isValidLocation(pLoc)) return;

    const lat = parseFloat(pLoc.latitude ?? pLoc.lat);
    const lng = parseFloat(pLoc.longitude ?? pLoc.lng);
    const accuracy = Math.round(Number(pLoc.accuracy) || 15);
    const speed = Math.max(0, Math.round(Number(pLoc.speed) || 0));
    const heading = Math.round(Number(pLoc.heading) || 0);
    const timestamp = Number(pLoc.timestamp || pLoc.lastUpdated) || Date.now();
    const battery = pLoc.batteryLevel !== undefined ? Number(pLoc.batteryLevel) : null;
    const isCharging = Boolean(pLoc.isCharging);
    const sharingEnabled = pLoc.sharingEnabled !== false;

    const sanitized = {
      ...pLoc,
      latitude: lat,
      longitude: lng,
      accuracy,
      speed,
      heading,
      timestamp,
      batteryLevel: battery,
      isCharging,
      sharingEnabled
    };

    this.partnerLocation = sanitized;

    // Check if partner disabled sharing
    if (!sharingEnabled) {
      this.updatePartnerOfflineNotice("Pasangan menjeda pembagian lokasi.");
      return;
    }

    // Update partner telemetry UI cards
    this.updatePartnerTelemetryUI(sanitized);

    // Update Map Marker
    window.mapEngine.updatePartnerMarker(sanitized, this.partnerProfile);

    // Auto-fit both partners on first mutual detection
    if (!this.hasAutoFittedBoth && this.myLocation && lat && lng) {
      this.hasAutoFittedBoth = true;
      setTimeout(() => {
        window.mapEngine.fitBoth();
      }, 1200);
    }

    // Recalculate distance
    this.recalculateCoupleDistance();

    // Check Geofence & Proximity Arrival
    this.checkGeofenceTrigger(sanitized);
  }

  // Update My Telemetry Card in UI
  updateMyTelemetryUI(loc) {
    // User info
    const myNameEl = document.getElementById('my-display-name');
    const myAvatarEl = document.getElementById('my-avatar-img');
    if (myNameEl) myNameEl.innerText = this.userProfile.displayName || 'Saya';
    if (myAvatarEl) myAvatarEl.src = this.userProfile.avatar || 'assets/avatars/avatar-1.svg';

    // GPS Details
    const myCoordsEl = document.getElementById('my-coordinates');
    const myAccuracyEl = document.getElementById('my-accuracy');
    const mySpeedEl = document.getElementById('my-speed');
    const myBatteryEl = document.getElementById('my-battery');
    const myUpdatedEl = document.getElementById('my-last-updated');

    if (myCoordsEl) myCoordsEl.innerText = `${loc.latitude.toFixed(5)}, ${loc.longitude.toFixed(5)}`;
    if (myAccuracyEl) myAccuracyEl.innerText = `±${loc.accuracy} m`;
    if (mySpeedEl) mySpeedEl.innerText = `${loc.speed} km/h`;
    if (myBatteryEl) {
      myBatteryEl.innerText = loc.batteryLevel !== null ? `${loc.batteryLevel}% ${loc.isCharging ? '⚡' : ''}` : '--';
    }
    if (myUpdatedEl) {
      const timeStr = new Date(loc.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      myUpdatedEl.innerText = timeStr;
    }

    // Mobile Elements Sync
    const mobMyCoords = document.getElementById('mobile-my-coords');
    const mobMySpeed = document.getElementById('mobile-my-speed');
    const mobMyBattery = document.getElementById('mobile-my-battery');
    if (mobMyCoords) mobMyCoords.innerText = `${loc.latitude.toFixed(5)}, ${loc.longitude.toFixed(5)}`;
    if (mobMySpeed) mobMySpeed.innerText = `${loc.speed} km/h`;
    if (mobMyBattery) mobMyBattery.innerText = loc.batteryLevel !== null ? `${loc.batteryLevel}% ${loc.isCharging ? '⚡' : ''}` : '--';

    // Update Duo Profile Modal Location for Me
    const isCurrentUserSandy = this.userProfile?.displayName?.toLowerCase().includes('sandy') ||
                               this.user?.email?.toLowerCase().includes('sandy');
    const myCityEl = document.getElementById(isCurrentUserSandy ? 'profile-sandy-city' : 'profile-dhea-city');
    if (myCityEl && loc.latitude && loc.longitude) {
      myCityEl.innerText = `${loc.latitude.toFixed(3)}, ${loc.longitude.toFixed(3)}`;
    }
  }

  // Update Partner Telemetry Card in UI
  updatePartnerProfileUI(profile) {
    const isCurrentUserSandy = this.userProfile?.displayName?.toLowerCase().includes('sandy') ||
                               this.user?.email?.toLowerCase().includes('sandy');

    const displayName = profile.displayName || (isCurrentUserSandy ? 'Dhea Sri Dewi' : 'Sandy');
    const avatar = profile.avatar || (isCurrentUserSandy ? 'assets/avatars/avatar-2.svg' : 'assets/avatars/avatar-1.svg');

    const pNameEl = document.getElementById('partner-display-name');
    const pAvatarEl = document.getElementById('partner-avatar-img');
    const pTopName = document.getElementById('top-bar-partner-name');
    const pTopAvatar = document.getElementById('top-bar-partner-avatar');
    const navPartnerName = document.getElementById('navbar-partner-name');
    const navPartnerAvatar = document.getElementById('navbar-partner-avatar');

    if (pNameEl) pNameEl.innerText = displayName;
    if (pAvatarEl) pAvatarEl.src = avatar;
    if (pTopName) pTopName.innerText = profile.nickname || displayName;
    if (pTopAvatar) pTopAvatar.src = avatar;
    if (navPartnerName) navPartnerName.innerText = profile.nickname || displayName;
    if (navPartnerAvatar) navPartnerAvatar.src = avatar;

    // Update Duo Modal Avatars
    const sandyAvatarModal = document.getElementById('profile-sandy-avatar');
    const dheaAvatarModal = document.getElementById('profile-dhea-avatar');
    if (sandyAvatarModal) sandyAvatarModal.src = isCurrentUserSandy ? (this.userProfile?.avatar || 'assets/avatars/avatar-1.svg') : avatar;
    if (dheaAvatarModal) dheaAvatarModal.src = isCurrentUserSandy ? avatar : (this.userProfile?.avatar || 'assets/avatars/avatar-2.svg');
  }

  updatePartnerTelemetryUI(loc) {
    const pCoordsEl = document.getElementById('partner-coordinates');
    const pAccuracyEl = document.getElementById('partner-accuracy');
    const pSpeedEl = document.getElementById('partner-speed');
    const pBatteryEl = document.getElementById('partner-battery');
    const pUpdatedEl = document.getElementById('partner-last-updated');
    const pStatusBadge = document.getElementById('partner-status-badge');

    if (pCoordsEl) pCoordsEl.innerText = `${loc.latitude.toFixed(5)}, ${loc.longitude.toFixed(5)}`;
    
    // High Accuracy Precision details
    const accuracyQuality = window.locationService.evaluateAccuracyQuality(loc.accuracy);
    if (pAccuracyEl) pAccuracyEl.innerText = `${accuracyQuality.text} (${accuracyQuality.label})`;

    // Google Maps Style Live Address (Reverse Geocoding)
    const addressEl = document.getElementById('partner-address-text');
    if (addressEl) {
      this.reverseGeocode(loc.latitude, loc.longitude).then(addr => {
        if (addressEl) addressEl.innerText = addr;
      });
    }

    // Google Maps Style Movement State
    const moveInfo = this.getMovementState(loc.speed);
    if (pSpeedEl) {
      pSpeedEl.innerText = `${loc.speed} km/h (${moveInfo.text})`;
    }
    const movementBadge = document.getElementById('partner-movement-badge');
    if (movementBadge) {
      movementBadge.className = `movement-badge ${moveInfo.class}`;
      movementBadge.innerText = moveInfo.text;
    }

    if (pBatteryEl) {
      pBatteryEl.innerText = loc.batteryLevel !== null ? `${loc.batteryLevel}% ${loc.isCharging ? '⚡' : ''}` : '--';
    }

    // Update Duo Profile Modal Location info
    const isCurrentUserSandy = this.userProfile?.displayName?.toLowerCase().includes('sandy') ||
                               this.user?.email?.toLowerCase().includes('sandy');
    const partnerCityEl = document.getElementById(isCurrentUserSandy ? 'profile-dhea-city' : 'profile-sandy-city');
    if (partnerCityEl && loc.latitude && loc.longitude) {
      partnerCityEl.innerText = `${loc.latitude.toFixed(3)}, ${loc.longitude.toFixed(3)}`;
    }

    // Freshness evaluation
    const freshness = window.locationService.evaluateFreshness(loc.timestamp || loc.lastUpdated);
    if (pStatusBadge) {
      pStatusBadge.className = `status-badge ${freshness.status}`;
      pStatusBadge.innerHTML = `<span class="status-dot"></span> ${freshness.text}`;
    }
    if (pUpdatedEl) {
      pUpdatedEl.innerText = freshness.text;
    }

    // Mobile Elements Sync
    const mobPCoords = document.getElementById('mobile-partner-coords');
    const mobPSpeed = document.getElementById('mobile-partner-speed');
    const mobPBattery = document.getElementById('mobile-partner-battery');
    const mobPAccuracy = document.getElementById('mobile-partner-accuracy');
    const mobPStatusBadge = document.getElementById('mobile-partner-status-badge');

    if (mobPCoords) mobPCoords.innerText = `${loc.latitude.toFixed(5)}, ${loc.longitude.toFixed(5)}`;
    if (mobPSpeed) mobPSpeed.innerText = `${loc.speed} km/h`;
    if (mobPBattery) mobPBattery.innerText = loc.batteryLevel !== null ? `${loc.batteryLevel}% ${loc.isCharging ? '⚡' : ''}` : '--';
    if (mobPAccuracy) mobPAccuracy.innerText = `${accuracyQuality.text}`;
    if (mobPStatusBadge) {
      mobPStatusBadge.className = `status-badge ${freshness.status}`;
      mobPStatusBadge.innerHTML = `<span class="status-dot"></span> ${freshness.text}`;
    }
  }

  updatePartnerOfflineNotice(msg) {
    const pStatusBadge = document.getElementById('partner-status-badge');
    if (pStatusBadge) {
      pStatusBadge.className = `status-badge offline`;
      pStatusBadge.innerHTML = `<span class="status-dot"></span> ${msg}`;
    }
  }

  // Distance Calculation & Heading Bearing
  recalculateCoupleDistance() {
    const myLat = this.myLocation?.latitude ?? this.userProfile?.lastLocation?.latitude;
    const myLng = this.myLocation?.longitude ?? this.userProfile?.lastLocation?.longitude;
    const partnerLat = this.partnerLocation?.latitude ?? this.partnerProfile?.lastLocation?.latitude;
    const partnerLng = this.partnerLocation?.longitude ?? this.partnerProfile?.lastLocation?.longitude;

    if (!myLat || !myLng || !partnerLat || !partnerLng) {
      if (this.partnerLocation && (!myLat || !myLng)) {
        const topDistPill = document.getElementById('top-bar-distance-text');
        if (topDistPill) topDistPill.innerText = `Menunggu GPS Anda...`;
      }
      return;
    }

    const distanceMeters = window.locationService.calculateDistance(
      myLat, myLng,
      partnerLat, partnerLng
    );
    const formatted = window.locationService.formatDistance(distanceMeters);

    const bearing = window.locationService.calculateBearing(
      myLat, myLng,
      partnerLat, partnerLng
    );
    const direction = window.locationService.bearingToDirection(bearing);

    // Update Distance Display Cards
    const distanceCards = document.querySelectorAll('.couple-distance-value');
    distanceCards.forEach(el => el.innerText = formatted);

    const directionCards = document.querySelectorAll('.couple-direction-value');
    directionCards.forEach(el => el.innerText = direction);

    const topDistPill = document.getElementById('top-bar-distance-text');
    if (topDistPill) topDistPill.innerText = `${formatted} dari Anda`;

    const navDistPill = document.getElementById('navbar-partner-distance');
    if (navDistPill) navDistPill.innerText = `${formatted}`;
  }

  // Geofence & Proximity Arrival Alert
  checkGeofenceTrigger(partnerLoc) {
    if (!this.myLocation) return;

    const distanceMeters = window.locationService.calculateDistance(
      this.myLocation.latitude, this.myLocation.longitude,
      partnerLoc.latitude, partnerLoc.longitude
    );

    // If lovers are within 50 meters of each other!
    if (distanceMeters <= 50) {
      if (this.lastGeofenceState !== 'together') {
        this.lastGeofenceState = 'together';
        window.notifier.showToast(
          "Kalian Sedang Bersama! 💕",
          `${this.partnerProfile?.displayName || 'Pasangan'} berada tepat di dekat Anda!`,
          'romantic',
          6000
        );
      }
    } else {
      this.lastGeofenceState = 'apart';
    }
  }

  // Bind All Interactive Buttons
  bindUIEvents() {
    // 1. Map Controls
    document.getElementById('btn-locate-me')?.addEventListener('click', () => {
      window.mapEngine.locateMe();
    });

    document.getElementById('btn-locate-partner')?.addEventListener('click', () => {
      window.mapEngine.locatePartner();
    });

    document.getElementById('btn-fit-both')?.addEventListener('click', () => {
      window.mapEngine.fitBoth();
    });

    document.getElementById('btn-zoom-in')?.addEventListener('click', () => {
      window.mapEngine.zoomIn();
    });

    document.getElementById('btn-zoom-out')?.addEventListener('click', () => {
      window.mapEngine.zoomOut();
    });

    // 2. Fullscreen Toggle
    document.getElementById('btn-fullscreen')?.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });

    // 3. Layer Switcher Menu Toggle
    const layerBtn = document.getElementById('btn-layers-toggle');
    const layerMenu = document.getElementById('layer-picker-menu');
    layerBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      layerMenu?.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
      if (!layerMenu?.contains(e.target) && e.target !== layerBtn) {
        layerMenu?.classList.remove('open');
      }
    });

    // Layer option cards
    document.querySelectorAll('.layer-card-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const layerName = btn.dataset.layer;
        window.mapEngine.setLayer(layerName);
        layerMenu?.classList.remove('open');
        window.notifier.showToast("Layer Peta Diubah", `Menampilkan layer ${layerName.toUpperCase()}`, "info", 2000);
      });
    });

    // 4. Scanner Line Sweep Effect
    document.getElementById('btn-scanner')?.addEventListener('click', () => {
      const line = document.getElementById('map-scanner-line');
      if (line) {
        line.classList.toggle('active');
        const isActive = line.classList.contains('active');
        window.notifier.showToast("Satellite Radar Scanner", isActive ? "Scanner satelit aktif" : "Scanner dinonaktifkan", "info", 2000);
      }
    });

    // 5. Privacy Sharing Toggle
    const shareToggle = document.getElementById('toggle-share-location');
    shareToggle?.addEventListener('change', (e) => {
      const isChecked = e.target.checked;
      this.isSharingPaused = !isChecked;
      window.locationService.setSharingEnabled(isChecked);

      const statusBadge = document.getElementById('sharing-status-badge');
      if (isChecked) {
        if (statusBadge) {
          statusBadge.innerHTML = `<span class="status-dot"></span> Berbagi Aktif`;
          statusBadge.className = `status-badge live`;
        }
        window.notifier.showToast("Berbagi Lokasi", "Lokasi Anda kini disinkronkan ke pasangan.", "success");
        // Immediate broadcast
        window.locationService.broadcastLocation(this.coupleId, this.user.uid);
      } else {
        if (statusBadge) {
          statusBadge.innerHTML = `<span class="status-dot"></span> Dijeda`;
          statusBadge.className = `status-badge idle`;
        }
        window.notifier.showToast("Berbagi Lokasi Dijeda", "Pasangan tidak akan menerima koordinat baru.", "warning");
      }
    });

    // 6. Mobile Bottom Sheet Interaction
    const sheet = document.getElementById('mobile-bottom-sheet');
    const handle = document.getElementById('bottom-sheet-handle');
    const previewBar = document.getElementById('bottom-sheet-preview');

    const toggleSheet = () => {
      sheet?.classList.toggle('expanded');
    };
    handle?.addEventListener('click', toggleSheet);
    previewBar?.addEventListener('click', toggleSheet);

    // 7. Sidebar Drawer Toggle & Action Navigation (Desktop & Mobile)
    const sidebarToggleBtn = document.getElementById('btn-toggle-sidebar');
    const sidebar = document.getElementById('sidebar-panel');
    const sidebarBackdrop = document.getElementById('sidebar-backdrop');
    const closeSidebarBtn = document.getElementById('btn-close-sidebar');

    const closeSidebarDrawer = () => {
      sidebar?.classList.remove('open');
      sidebarBackdrop?.classList.remove('active');
    };

    sidebarToggleBtn?.addEventListener('click', () => {
      sidebar?.classList.toggle('open');
      sidebarBackdrop?.classList.toggle('active');
    });

    closeSidebarBtn?.addEventListener('click', closeSidebarDrawer);
    sidebarBackdrop?.addEventListener('click', closeSidebarDrawer);

    // Sidebar Drawer Quick Actions
    document.getElementById('btn-sidebar-love-ping')?.addEventListener('click', () => {
      document.getElementById('love-ping-modal')?.classList.add('active');
      closeSidebarDrawer();
    });

    document.getElementById('btn-sidebar-locate-partner')?.addEventListener('click', () => {
      window.mapEngine.locatePartner();
      closeSidebarDrawer();
    });

    document.getElementById('btn-sidebar-locate-me')?.addEventListener('click', () => {
      window.mapEngine.locateMe();
      closeSidebarDrawer();
    });

    document.getElementById('btn-sidebar-fit-both')?.addEventListener('click', () => {
      window.mapEngine.fitBoth();
      closeSidebarDrawer();
    });

    document.getElementById('btn-sidebar-history-trail')?.addEventListener('click', async () => {
      closeSidebarDrawer();
      await this.toggleBreadcrumbTrail();
    });

    document.getElementById('btn-sidebar-sync-gps')?.addEventListener('click', () => {
      closeSidebarDrawer();
      document.getElementById('btn-force-sync')?.click();
    });

    // 8. Notification Permission Prompt
    document.getElementById('btn-enable-notifications')?.addEventListener('click', async () => {
      await window.notifier.requestNotificationPermission();
    });

    // 9. Leave Couple Room Modal
    const leaveModal = document.getElementById('leave-room-modal');
    document.getElementById('btn-leave-room')?.addEventListener('click', () => {
      leaveModal?.classList.add('active');
    });
    document.getElementById('btn-mobile-leave')?.addEventListener('click', () => {
      leaveModal?.classList.add('active');
    });
    document.getElementById('btn-mobile-notif')?.addEventListener('click', async () => {
      await window.notifier.requestNotificationPermission();
    });
    document.getElementById('btn-cancel-leave')?.addEventListener('click', () => {
      leaveModal?.classList.remove('active');
    });
    document.getElementById('btn-confirm-leave')?.addEventListener('click', async () => {
      await window.pairingService.leaveCoupleRoom(this.coupleId, this.user);
    });

    // 10. Copy My Coordinates Button
    document.getElementById('btn-copy-coords')?.addEventListener('click', () => {
      if (this.myLocation) {
        const text = `${this.myLocation.latitude.toFixed(6)}, ${this.myLocation.longitude.toFixed(6)}`;
        navigator.clipboard.writeText(text);
        window.notifier.showToast("Tersalin", `Koordinat Anda: ${text}`, "success", 2500);
      }
    });

    // 11. Logout Button
    document.getElementById('btn-logout')?.addEventListener('click', async () => {
      if (confirm("Apakah Anda yakin ingin keluar dari akun?")) {
        await window.authService.logout();
      }
    });

    // 12. Couple Profile & Anniversary Modal Handlers
    const profileModal = document.getElementById('couple-profile-modal');
    const openProfile = () => profileModal?.classList.add('active');
    const closeProfile = () => profileModal?.classList.remove('active');

    document.getElementById('btn-open-couple-profile')?.addEventListener('click', openProfile);
    document.getElementById('btn-navbar-couple-profile')?.addEventListener('click', openProfile);
    document.getElementById('btn-navbar-profile')?.addEventListener('click', openProfile);
    document.getElementById('btn-close-couple-profile')?.addEventListener('click', closeProfile);

    // 13. Top Bar / Navbar Partner Pill Click -> Focus Partner on Map
    document.getElementById('top-bar-partner-container')?.addEventListener('click', () => {
      window.mapEngine.locatePartner();
    });
    document.getElementById('btn-navbar-partner')?.addEventListener('click', () => {
      window.mapEngine.locatePartner();
    });

    // 14. Love Ping / Romantic Notification Modal Handlers
    const lovePingModal = document.getElementById('love-ping-modal');
    document.getElementById('btn-navbar-love-ping')?.addEventListener('click', () => {
      lovePingModal?.classList.add('active');
    });
    document.getElementById('btn-close-love-ping')?.addEventListener('click', () => {
      lovePingModal?.classList.remove('active');
    });

    // Preset quick ping buttons
    document.querySelectorAll('.btn-quick-ping').forEach(btn => {
      btn.addEventListener('click', () => {
        const text = btn.getAttribute('data-ping') || btn.innerText;
        this.sendLovePing(text);
      });
    });

    // Custom love ping message send button
    document.getElementById('btn-send-custom-ping')?.addEventListener('click', () => {
      const input = document.getElementById('custom-ping-input');
      const text = input?.value?.trim();
      if (text) {
        this.sendLovePing(text);
        if (input) input.value = '';
      } else {
        window.notifier?.showToast("Love Ping", "Silakan ketik pesan singkat terlebih dahulu.", "info");
      }
    });

    // 15. Force Sync GPS Button
    document.getElementById('btn-force-sync')?.addEventListener('click', () => {
      const syncBtn = document.getElementById('btn-force-sync');
      if (syncBtn) syncBtn.classList.add('animate-spin');
      
      // Hardware GPS query
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          window.locationService.handleRawPosition(pos, (locData) => {
            this.myLocation = locData;
            window.mapEngine.updateMyMarker(locData, this.userProfile);
            if (this.coupleId && this.user) {
              window.locationService.broadcastLocation(this.coupleId, this.user.uid, locData);
            }
            this.recalculateCoupleDistance();
          });
        },
        () => {},
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
      );
      
      // Also query Firebase partner location immediately
      if (window.firebaseManager?.database && this.coupleId) {
        const db = window.firebaseManager.database;
        db.ref(`couples/${this.coupleId}`).once('value')
          .then(snap => {
            const data = snap.val();
            if (data) {
              if (this.partnerUid && data.locations && data.locations[this.partnerUid]) {
                this.handlePartnerLocationUpdate(data.locations[this.partnerUid]);
              } else if (data.locations) {
                for (const [key, loc] of Object.entries(data.locations)) {
                  if (key !== this.user?.uid && this.isValidLocation(loc)) {
                    this.partnerUid = key;
                    this.handlePartnerLocationUpdate(loc);
                    break;
                  }
                }
              }

              if (this.partnerUid) {
                db.ref(`users/${this.partnerUid}/lastLocation`).once('value').then(uSnap => {
                  const uLoc = uSnap.val();
                  if (this.isValidLocation(uLoc)) {
                    this.handlePartnerLocationUpdate(uLoc);
                  }
                }).catch(() => {});
              }
            }
          })
          .catch(() => {});

        // Send silent location request ping to wake partner's device
        try {
          db.ref(`couples/${this.coupleId}/pings`).push({
            senderUid: this.user?.uid,
            senderName: this.userProfile?.displayName || 'Sandy',
            message: 'Meminta pembaruan lokasi GPS...',
            type: 'location_request',
            timestamp: firebase.database.ServerValue.TIMESTAMP
          });
        } catch (pErr) {}
      }

      window.notifier.showToast("Sinkronisasi GPS Terkini 📍", "Mengambil sinyal satelit & meminta pembaruan dari pasangan...", "success", 2500);
      setTimeout(() => {
        if (syncBtn) syncBtn.classList.remove('animate-spin');
      }, 1500);
    });
  }
}

// Global Singleton
window.dashboardController = new DashboardController();

// Init on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.dashboardController.init();
});

