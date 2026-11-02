/**
 * TOGETHER — Geospatial Location & Telemetry Engine
 * Manages W3C Geolocation API, Throttling, Distance Math (Haversine), Battery, and Synchronization.
 */

class LocationService {
  constructor() {
    this.watchId = null;
    this.currentPosition = null;
    this.lastSentPosition = null;
    this.lastSentTimestamp = 0;
    this.sharingEnabled = true;
    this.isGhostMode = false;
    this.batteryLevel = null;
    this.isCharging = false;
    this.partnerLocation = null;

    // Minimum constraints for updates
    this.MIN_UPDATE_INTERVAL_MS = 5000; // 5 seconds
    this.MIN_DISTANCE_METERS = 5;       // 5 meters

    this.initBatteryMonitoring();
  }

  // Battery Status API (if supported by modern browser)
  async initBatteryMonitoring() {
    if ('getBattery' in navigator) {
      try {
        const battery = await navigator.getBattery();
        this.updateBattery(battery);
        battery.addEventListener('levelchange', () => this.updateBattery(battery));
        battery.addEventListener('chargingchange', () => this.updateBattery(battery));
      } catch (e) {
        console.log("Battery API not accessible.");
      }
    }
  }

  updateBattery(battery) {
    this.batteryLevel = Math.round(battery.level * 100);
    this.isCharging = battery.charging;
  }

  // Start watching GPS position
  startTracking(onPositionUpdate, onError) {
    if (!('geolocation' in navigator)) {
      if (onError) onError(new Error("Perangkat atau browser Anda tidak mendukung Geolocation GPS API."));
      return false;
    }

    const options = {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 4000
    };

    // Immediate initial fix
    navigator.geolocation.getCurrentPosition(
      (pos) => this.handleRawPosition(pos, onPositionUpdate),
      (err) => {
        console.warn("Initial GPS fix warning:", err);
        // Fallback default coordinates (e.g. Jakarta Pusat / Monas) if user denies during initial test
        if (err.code === 1) { // PERMISSION_DENIED
          if (onError) onError(err);
        }
      },
      options
    );

    // Continuous watch
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this.handleRawPosition(pos, onPositionUpdate),
      (err) => {
        console.warn("GPS watch update error:", err);
        if (onError) onError(err);
      },
      options
    );

    return true;
  }

  // Process raw GPS position with throttling and sanity validation
  handleRawPosition(position, callback) {
    const coords = position.coords;
    const now = Date.now();

    const locationData = {
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracy: Math.round(coords.accuracy || 10),
      heading: coords.heading !== null && !isNaN(coords.heading) ? Math.round(coords.heading) : 0,
      speed: coords.speed !== null && !isNaN(coords.speed) ? Math.max(0, Math.round(coords.speed * 3.6)) : 0, // km/h
      timestamp: position.timestamp || now,
      batteryLevel: this.batteryLevel,
      isCharging: this.isCharging,
      sharingEnabled: this.sharingEnabled,
      isGhostMode: this.isGhostMode
    };

    this.currentPosition = locationData;

    // Check throttling
    const shouldSend = this.shouldBroadcastUpdate(locationData, now);

    if (callback) {
      callback(locationData, shouldSend);
    }

    if (shouldSend) {
      this.lastSentPosition = locationData;
      this.lastSentTimestamp = now;
    }
  }

  // Smart throttling algorithm: evaluates elapsed time, distance moved, and speed
  shouldBroadcastUpdate(newPos, currentTime) {
    if (!this.lastSentPosition) return true;

    const timeDiff = currentTime - this.lastSentTimestamp;
    const distanceMoved = this.calculateDistance(
      this.lastSentPosition.latitude,
      this.lastSentPosition.longitude,
      newPos.latitude,
      newPos.longitude
    );

    // If moving fast (> 25 km/h driving), update every 3-4s or every 20m
    if (newPos.speed > 25) {
      return timeDiff > 3500 || distanceMoved > 20;
    }

    // Normal pedestrian/stationary: at least 5 seconds AND at least 5 meters moved, or every 20s heartbeat
    return (timeDiff >= this.MIN_UPDATE_INTERVAL_MS && distanceMoved >= this.MIN_DISTANCE_METERS) || timeDiff >= 20000;
  }

  // Push location to Firebase
  async broadcastLocation(coupleId, uid) {
    if (!coupleId || !uid || !this.currentPosition) return;
    if (!this.sharingEnabled) return;

    const payload = {
      ...this.currentPosition,
      lastUpdated: firebase.database.ServerValue.TIMESTAMP
    };

    if (window.firebaseManager && window.firebaseManager.isConfigured && window.firebaseManager.database) {
      try {
        const db = window.firebaseManager.database;
        await db.ref(`couples/${coupleId}/locations/${uid}`).set(payload);

        // Also record location history breadcrumb point if history is enabled
        const historyRef = db.ref(`couples/${coupleId}/history/${uid}`).push();
        await historyRef.set({
          lat: payload.latitude,
          lng: payload.longitude,
          timestamp: firebase.database.ServerValue.TIMESTAMP
        });

        // Set onDisconnect handler for connection status
        db.ref(`couples/${coupleId}/members/${uid}/online`).onDisconnect().set(false);
        db.ref(`couples/${coupleId}/members/${uid}/lastSeen`).onDisconnect().set(firebase.database.ServerValue.TIMESTAMP);
      } catch (err) {
        console.error("Firebase location broadcast error:", err);
      }
    }
  }

  // Stop GPS watching
  stopTracking() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  // Toggle Sharing
  setSharingEnabled(enabled) {
    this.sharingEnabled = enabled;
  }

  // Toggle Ghost Mode (Freeze coordinates)
  setGhostMode(ghost) {
    this.isGhostMode = ghost;
  }

  // Haversine Formula: calculates great-circle distance between two GPS coordinates in meters
  calculateDistance(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
    const R = 6371e3; // Earth radius in meters
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
              Math.cos(phi1) * Math.cos(phi2) *
              Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in meters
  }

  // Format distance into clean human-friendly string (e.g. "450 m" or "14.2 km")
  formatDistance(meters) {
    if (!meters && meters !== 0) return '--';
    if (meters < 1000) {
      return `${Math.round(meters)} m`;
    }
    const km = meters / 1000;
    return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
  }

  // Calculate compass bearing from point A to point B in degrees (0 - 360)
  calculateBearing(lat1, lon1, lat2, lon2) {
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const y = Math.sin(deltaLambda) * Math.cos(phi2);
    const x = Math.cos(phi1) * Math.sin(phi2) -
              Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);

    const theta = Math.atan2(y, x);
    return (theta * 180 / Math.PI + 360) % 360;
  }

  // Compass Bearing to Cardinal Direction
  bearingToDirection(degrees) {
    const directions = ['Utara (N)', 'Timur Laut (NE)', 'Timur (E)', 'Tenggara (SE)', 'Selatan (S)', 'Barat Daya (SW)', 'Barat (W)', 'Barat Laut (NW)'];
    const index = Math.round(degrees / 45) % 8;
    return directions[index];
  }

  // Freshness Evaluator
  evaluateFreshness(timestamp) {
    if (!timestamp) return { status: 'offline', text: 'Offline', color: '#EF4444' };
    const ageSeconds = Math.round((Date.now() - timestamp) / 1000);

    if (ageSeconds < 25) {
      return { status: 'live', text: 'Live Now', color: '#10B981' };
    } else if (ageSeconds < 120) {
      return { status: 'recent', text: `Baru saja (${ageSeconds}d lalu)`, color: '#36D9FF' };
    } else if (ageSeconds < 600) {
      const mins = Math.round(ageSeconds / 60);
      return { status: 'idle', text: `${mins} mnt yang lalu`, color: '#F59E0B' };
    } else {
      const mins = Math.round(ageSeconds / 60);
      return { status: 'offline', text: mins > 60 ? `Last known (${Math.round(mins / 60)}j lalu)` : `Last known (${mins}m lalu)`, color: '#EF4444' };
    }
  }
}

// Global Singleton
window.locationService = new LocationService();

