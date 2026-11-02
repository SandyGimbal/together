/**
 * TOGETHER — Geospatial Map Engine
 * Powered by Leaflet.js with Valid Satellite & Multi-layer Providers,
 * Dynamic Radar Markers, Animated Laser Polylines, and Camera Choreography.
 */

class MapEngine {
  constructor() {
    this.map = null;
    this.activeBaseLayer = null;
    this.baseLayers = {};
    this.hybridLabelsLayer = null;

    this.myMarker = null;
    this.myAccuracyCircle = null;
    this.partnerMarker = null;
    this.partnerAccuracyCircle = null;
    this.connectingPolyline = null;
    this.distanceBadgeMarker = null;
    this.historyPolyline = null;
    this.geofenceCircles = [];

    this.myCoords = null;
    this.partnerCoords = null;
    this.activeLayerName = 'satellite';
  }

  // Initialize Leaflet Map
  initMap(containerId = 'map', defaultCenter = [-6.2088, 106.8456], defaultZoom = 14) {
    if (this.map) return this.map;

    // Create Leaflet map instance
    this.map = L.map(containerId, {
      center: defaultCenter,
      zoom: defaultZoom,
      zoomControl: false, // We use custom styled controls
      attributionControl: true
    });

    // Custom attribution positioning
    this.map.attributionControl.setPosition('bottomright');

    // Add scale bar
    L.control.scale({
      position: 'bottomleft',
      metric: true,
      imperial: false
    }).addTo(this.map);

    // Setup Authentic Tile Providers
    this.setupTileLayers();

    // Set initial Satellite view
    this.setLayer('satellite');

    return this.map;
  }

  // Setup Real Satellite, Street, Hybrid, and Terrain Layers
  setupTileLayers() {
    // 1. Esri World Imagery (Legitimate High-Resolution Satellite)
    const esriSatellite = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: 19,
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
      }
    );

    // 2. OpenStreetMap (Street View)
    const osmStreet = L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }
    );

    // 3. Esri World Topo Map (Terrain View)
    const esriTerrain = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: 19,
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, USGS, Intermap, iPC, NRCAN, Esri Japan, METI, Esri China (Hong Kong), Esri (Thailand), TomTom, 2012'
      }
    );

    // Esri Reference Labels (Overlay for Hybrid Satellite)
    this.hybridLabelsLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      {
        maxZoom: 19,
        pane: 'overlayPane'
      }
    );

    this.baseLayers = {
      satellite: esriSatellite,
      street: osmStreet,
      terrain: esriTerrain
    };
  }

  // Switch Active Layer
  setLayer(layerName) {
    if (!this.map) return;

    // Remove existing base layers
    Object.values(this.baseLayers).forEach(layer => {
      if (this.map.hasLayer(layer)) this.map.removeLayer(layer);
    });
    if (this.map.hasLayer(this.hybridLabelsLayer)) {
      this.map.removeLayer(this.hybridLabelsLayer);
    }

    if (layerName === 'hybrid') {
      this.baseLayers.satellite.addTo(this.map);
      this.hybridLabelsLayer.addTo(this.map);
      this.activeBaseLayer = this.baseLayers.satellite;
    } else if (this.baseLayers[layerName]) {
      this.baseLayers[layerName].addTo(this.map);
      this.activeBaseLayer = this.baseLayers[layerName];
    }

    this.activeLayerName = layerName;

    // Dispatch event or update UI buttons
    document.querySelectorAll('.layer-card-btn').forEach(btn => {
      if (btn.dataset.layer === layerName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  // Update or Create My Location Marker
  updateMyMarker(data, userProfile) {
    if (!this.map || !data || !data.latitude || !data.longitude) return;

    const latLng = [data.latitude, data.longitude];
    this.myCoords = latLng;

    const avatarUrl = userProfile?.avatar || 'assets/avatars/avatar-1.svg';
    const name = userProfile?.displayName || 'Saya';

    if (!this.myMarker) {
      // Create custom radar divIcon
      const icon = L.divIcon({
        className: 'custom-marker-wrapper',
        html: `
          <div class="custom-radar-marker my-marker">
            <div class="radar-pulse-ring"></div>
            <div class="radar-pulse-ring"></div>
            <div class="radar-avatar-ring">
              <img src="${avatarUrl}" alt="${name}" />
            </div>
            <div class="marker-label-pill">${name} (Saya)</div>
          </div>
        `,
        iconSize: [48, 48],
        iconAnchor: [24, 24]
      });

      this.myMarker = L.marker(latLng, { icon, zIndexOffset: 1000 }).addTo(this.map);

      // Create GPS accuracy circle
      this.myAccuracyCircle = L.circle(latLng, {
        radius: data.accuracy || 15,
        color: '#36D9FF',
        fillColor: '#3887FF',
        fillOpacity: 0.12,
        weight: 1.5,
        dashArray: '3, 5'
      }).addTo(this.map);

      // Popup
      this.bindMarkerPopup(this.myMarker, name, avatarUrl, data, true);
    } else {
      // Smooth update position
      this.myMarker.setLatLng(latLng);
      if (this.myAccuracyCircle) {
        this.myAccuracyCircle.setLatLng(latLng);
        this.myAccuracyCircle.setRadius(data.accuracy || 15);
      }
      this.updateMarkerPopup(this.myMarker, name, avatarUrl, data, true);
    }

    // Refresh couple connecting line
    this.updateCoupleConnection();
  }

  // Update or Create Partner Location Marker
  updatePartnerMarker(data, partnerProfile) {
    if (!this.map || !data || !data.latitude || !data.longitude) return;

    const latLng = [data.latitude, data.longitude];
    this.partnerCoords = latLng;

    const avatarUrl = partnerProfile?.avatar || 'assets/avatars/avatar-2.svg';
    const name = partnerProfile?.displayName || 'Pasangan';

    if (!this.partnerMarker) {
      const icon = L.divIcon({
        className: 'custom-marker-wrapper',
        html: `
          <div class="custom-radar-marker partner-marker">
            <div class="radar-pulse-ring"></div>
            <div class="radar-pulse-ring"></div>
            <div class="radar-avatar-ring">
              <img src="${avatarUrl}" alt="${name}" />
            </div>
            <div class="marker-label-pill">💕 ${name}</div>
          </div>
        `,
        iconSize: [48, 48],
        iconAnchor: [24, 24]
      });

      this.partnerMarker = L.marker(latLng, { icon, zIndexOffset: 999 }).addTo(this.map);

      this.partnerAccuracyCircle = L.circle(latLng, {
        radius: data.accuracy || 20,
        color: '#FF75B8',
        fillColor: '#FF75B8',
        fillOpacity: 0.15,
        weight: 1.5,
        dashArray: '3, 5'
      }).addTo(this.map);

      this.bindMarkerPopup(this.partnerMarker, name, avatarUrl, data, false);
    } else {
      this.partnerMarker.setLatLng(latLng);
      if (this.partnerAccuracyCircle) {
        this.partnerAccuracyCircle.setLatLng(latLng);
        this.partnerAccuracyCircle.setRadius(data.accuracy || 20);
      }
      this.updateMarkerPopup(this.partnerMarker, name, avatarUrl, data, false);
    }

    // Refresh couple connecting line
    this.updateCoupleConnection();
  }

  // Bind Custom Glass Popup
  bindMarkerPopup(marker, name, avatarUrl, data, isMe) {
    const content = this.generatePopupHtml(name, avatarUrl, data, isMe);
    marker.bindPopup(content, {
      className: 'custom-leaflet-glass-popup',
      offset: [0, -22],
      closeButton: false
    });
  }

  updateMarkerPopup(marker, name, avatarUrl, data, isMe) {
    if (marker.getPopup()) {
      marker.getPopup().setContent(this.generatePopupHtml(name, avatarUrl, data, isMe));
    }
  }

  generatePopupHtml(name, avatarUrl, data, isMe) {
    const freshness = window.locationService.evaluateFreshness(data.timestamp || data.lastUpdated);
    const speed = data.speed || 0;
    const accuracy = data.accuracy || 0;
    const battery = data.batteryLevel !== undefined && data.batteryLevel !== null ? `${data.batteryLevel}% ${data.isCharging ? '⚡' : ''}` : '--';

    return `
      <div class="popup-wrapper">
        <div class="popup-header">
          <img class="popup-avatar" src="${avatarUrl}" alt="${name}" />
          <div>
            <div style="font-weight:700; font-size:1.05rem; color:#fff;">${name}</div>
            <div style="font-size:0.75rem; color:${freshness.color}; font-weight:600;">● ${freshness.text}</div>
          </div>
        </div>
        <div class="popup-body">
          <div class="popup-row">
            <span>Koordinat:</span>
            <span class="popup-value">${data.latitude.toFixed(5)}, ${data.longitude.toFixed(5)}</span>
          </div>
          <div class="popup-row">
            <span>Kecepatan:</span>
            <span class="popup-value">${speed} km/jam</span>
          </div>
          <div class="popup-row">
            <span>Akurasi GPS:</span>
            <span class="popup-value">±${accuracy} m</span>
          </div>
          <div class="popup-row">
            <span>Baterai:</span>
            <span class="popup-value">${battery}</span>
          </div>
        </div>
      </div>
    `;
  }

  // Dynamic Neon Laser Polyline & Midpoint Distance Badge connecting two lovers
  updateCoupleConnection() {
    if (!this.map || !this.myCoords || !this.partnerCoords) return;

    const latLngs = [this.myCoords, this.partnerCoords];

    // Distance calculation
    const distanceMeters = window.locationService.calculateDistance(
      this.myCoords[0], this.myCoords[1],
      this.partnerCoords[0], this.partnerCoords[1]
    );
    const distanceText = window.locationService.formatDistance(distanceMeters);

    // Calculate Midpoint
    const midLat = (this.myCoords[0] + this.partnerCoords[0]) / 2;
    const midLng = (this.myCoords[1] + this.partnerCoords[1]) / 2;
    const midPoint = [midLat, midLng];

    if (!this.connectingPolyline) {
      // Glow background line
      this.connectingPolyline = L.polyline(latLngs, {
        color: '#FF75B8',
        weight: 3.5,
        opacity: 0.85,
        className: 'couple-polyline-laser'
      }).addTo(this.map);
    } else {
      this.connectingPolyline.setLatLngs(latLngs);
    }

    // Midpoint Distance Badge Marker
    if (!this.distanceBadgeMarker) {
      const badgeIcon = L.divIcon({
        className: 'midpoint-badge-wrapper',
        html: `
          <div class="distance-midpoint-badge">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="#FF75B8" stroke="#FF75B8"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
            <span id="map-distance-val">${distanceText}</span>
          </div>
        `,
        iconAnchor: [50, 14]
      });

      this.distanceBadgeMarker = L.marker(midPoint, { icon: badgeIcon, interactive: false }).addTo(this.map);
    } else {
      this.distanceBadgeMarker.setLatLng(midPoint);
      const span = document.getElementById('map-distance-val');
      if (span) span.innerText = distanceText;
    }
  }

  // Camera Actions
  locateMe() {
    if (!this.map || !this.myCoords) {
      window.notifier.showToast("GPS Belum Siap", "Menunggu pembacaan titik koordinat Anda...", "warning");
      return;
    }
    this.map.flyTo(this.myCoords, 16, { animate: true, duration: 1.4 });
    if (this.myMarker) this.myMarker.openPopup();
  }

  locatePartner() {
    if (!this.map || !this.partnerCoords) {
      window.notifier.showToast("Pasangan Belum Terdeteksi", "Menunggu data lokasi pasangan Anda terhubung...", "warning");
      return;
    }
    this.map.flyTo(this.partnerCoords, 16, { animate: true, duration: 1.4 });
    if (this.partnerMarker) this.partnerMarker.openPopup();
  }

  fitBoth() {
    if (!this.map) return;
    if (this.myCoords && this.partnerCoords) {
      const bounds = L.latLngBounds([this.myCoords, this.partnerCoords]);
      this.map.fitBounds(bounds, {
        padding: [90, 90],
        maxZoom: 16,
        animate: true,
        duration: 1.6
      });
    } else if (this.myCoords) {
      this.locateMe();
    }
  }

  zoomIn() {
    if (this.map) this.map.zoomIn();
  }

  zoomOut() {
    if (this.map) this.map.zoomOut();
  }

  // Draw History Trail
  renderBreadcrumbTrail(points) {
    if (!this.map || !points || !points.length) return;
    if (this.historyPolyline) {
      this.map.removeLayer(this.historyPolyline);
    }
    const latLngs = points.map(p => [p.lat, p.lng]);
    this.historyPolyline = L.polyline(latLngs, {
      color: '#36D9FF',
      weight: 2.5,
      dashArray: '4, 6',
      opacity: 0.7
    }).addTo(this.map);
  }

  // Geofence Circle
  addGeofenceCircle(latLng, radius = 150, label = 'Home') {
    if (!this.map) return;
    const circle = L.circle(latLng, {
      radius: radius,
      color: '#9277FF',
      fillColor: '#9277FF',
      fillOpacity: 0.15,
      weight: 1.5,
      dashArray: '6, 6'
    }).addTo(this.map);
    this.geofenceCircles.push(circle);
    return circle;
  }
}

// Global Singleton
window.mapEngine = new MapEngine();

