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

  // Firebase Realtime Listener
  subscribeToFirebaseCouple() {
    const db = window.firebaseManager.database;
    const coupleRef = db.ref(`couples/${this.coupleId}`);

    // Track partner info and locations
    coupleRef.on('value', (snapshot) => {
      const data = snapshot.val();
      if (!data) return;

      // Identify partner UID
      if (data.members) {
        const memberKeys = Object.keys(data.members);
        this.partnerUid = memberKeys.find(key => key !== this.user.uid);

        if (this.partnerUid && data.members[this.partnerUid]) {
          this.partnerProfile = data.members[this.partnerUid];
          this.updatePartnerProfileUI(this.partnerProfile);
        }
      }

      // Check partner location updates
      if (this.partnerUid && data.locations && data.locations[this.partnerUid]) {
        const pLoc = data.locations[this.partnerUid];
        this.handlePartnerLocationUpdate(pLoc);
      }
    });

    // Monitor Firebase Connection status
    const connectedRef = db.ref('.info/connected');
    connectedRef.on('value', (snap) => {
      const isOnline = snap.val() === true;
      const statusPill = document.getElementById('connection-status-pill');
      if (statusPill) {
        if (isOnline) {
          statusPill.innerHTML = `<span class="status-dot"></span> Cloud Sync Aktif`;
          statusPill.className = `status-badge live`;
        } else {
          statusPill.innerHTML = `<span class="status-dot"></span> Reconnecting...`;
          statusPill.className = `status-badge idle`;
        }
      }
    });
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
    if (!pLoc || !pLoc.latitude || !pLoc.longitude) return;

    this.partnerLocation = pLoc;

    // Check if partner disabled sharing
    if (pLoc.sharingEnabled === false) {
      this.updatePartnerOfflineNotice("Pasangan menjeda pembagian lokasi.");
      return;
    }

    // Update partner telemetry UI cards
    this.updatePartnerTelemetryUI(pLoc);

    // Update Map Marker
    window.mapEngine.updatePartnerMarker(pLoc, this.partnerProfile);

    // Auto-fit both partners on first mutual detection
    if (!this.hasAutoFittedBoth && this.myLocation && pLoc.latitude && pLoc.longitude) {
      this.hasAutoFittedBoth = true;
      setTimeout(() => {
        window.mapEngine.fitBoth();
      }, 1200);
    }

    // Recalculate distance
    this.recalculateCoupleDistance();

    // Check Geofence & Arrival
    this.checkGeofenceTrigger(pLoc);
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
  }

  // Update Partner Telemetry Card in UI
  updatePartnerProfileUI(profile) {
    const pNameEl = document.getElementById('partner-display-name');
    const pAvatarEl = document.getElementById('partner-avatar-img');
    const pTopName = document.getElementById('top-bar-partner-name');
    const pTopAvatar = document.getElementById('top-bar-partner-avatar');

    if (pNameEl) pNameEl.innerText = profile.displayName || 'Pasangan';
    if (pAvatarEl) pAvatarEl.src = profile.avatar || 'assets/avatars/avatar-2.svg';
    if (pTopName) pTopName.innerText = profile.displayName || 'Pasangan';
    if (pTopAvatar) pTopAvatar.src = profile.avatar || 'assets/avatars/avatar-2.svg';
  }

  updatePartnerTelemetryUI(loc) {
    const pCoordsEl = document.getElementById('partner-coordinates');
    const pAccuracyEl = document.getElementById('partner-accuracy');
    const pSpeedEl = document.getElementById('partner-speed');
    const pBatteryEl = document.getElementById('partner-battery');
    const pUpdatedEl = document.getElementById('partner-last-updated');
    const pStatusBadge = document.getElementById('partner-status-badge');

    if (pCoordsEl) pCoordsEl.innerText = `${loc.latitude.toFixed(5)}, ${loc.longitude.toFixed(5)}`;
    if (pAccuracyEl) pAccuracyEl.innerText = `±${loc.accuracy} m`;
    if (pSpeedEl) {
      let state = 'Diam';
      if (loc.speed > 20) state = 'Berkendara';
      else if (loc.speed > 3) state = 'Berjalan';
      pSpeedEl.innerText = `${loc.speed} km/h (${state})`;
    }
    if (pBatteryEl) {
      pBatteryEl.innerText = loc.batteryLevel !== null ? `${loc.batteryLevel}% ${loc.isCharging ? '⚡' : ''}` : '--';
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
    if (mobPAccuracy) mobPAccuracy.innerText = `±${loc.accuracy} m`;
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
    if (!this.myLocation || !this.partnerLocation) return;

    const distanceMeters = window.locationService.calculateDistance(
      this.myLocation.latitude, this.myLocation.longitude,
      this.partnerLocation.latitude, this.partnerLocation.longitude
    );
    const formatted = window.locationService.formatDistance(distanceMeters);

    const bearing = window.locationService.calculateBearing(
      this.myLocation.latitude, this.myLocation.longitude,
      this.partnerLocation.latitude, this.partnerLocation.longitude
    );
    const direction = window.locationService.bearingToDirection(bearing);

    // Update Distance Display Cards
    const distanceCards = document.querySelectorAll('.couple-distance-value');
    distanceCards.forEach(el => el.innerText = formatted);

    const directionCards = document.querySelectorAll('.couple-direction-value');
    directionCards.forEach(el => el.innerText = direction);

    const topDistPill = document.getElementById('top-bar-distance-text');
    if (topDistPill) topDistPill.innerText = `${formatted} dari Anda`;
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

    // 7. Sidebar Toggle for Tablet / Mobile
    const sidebarToggleBtn = document.getElementById('btn-toggle-sidebar');
    const sidebar = document.getElementById('sidebar-panel');
    const sidebarBackdrop = document.getElementById('sidebar-backdrop');

    sidebarToggleBtn?.addEventListener('click', () => {
      sidebar?.classList.toggle('open');
      sidebarBackdrop?.classList.toggle('active');
    });

    sidebarBackdrop?.addEventListener('click', () => {
      sidebar?.classList.remove('open');
      sidebarBackdrop?.classList.remove('active');
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
  }
}

// Global Singleton
window.dashboardController = new DashboardController();

// Init on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.dashboardController.init();
});

