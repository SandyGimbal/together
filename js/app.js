/**
 * TOGETHER — Global Application Script & Particle Canvas
 * Manages Ambient Celestial Starfield, Lucide Icons initialization, Micro-interactions, and Dialogs.
 */

class AppMaster {
  constructor() {
    this.starCanvas = null;
    this.starCtx = null;
    this.stars = [];
    this.animationFrameId = null;
    this.init();
  }

  init() {
    this.initStarfield();
    this.initLucideIcons();
    this.initRippleEffect();
    this.initFirebaseConfigDialog();
    this.initPWA();
    this.initLoveCounter();
  }

  // Twinkling Space Starfield Canvas
  initStarfield() {
    const canvas = document.getElementById('starfield-canvas');
    if (!canvas) return;

    this.starCanvas = canvas;
    this.starCtx = canvas.getContext('2d');

    const resize = () => {
      this.starCanvas.width = window.innerWidth;
      this.starCanvas.height = window.innerHeight;
      this.generateStars();
    };

    window.addEventListener('resize', resize);
    resize();
    this.animateStars();
  }

  generateStars() {
    this.stars = [];
    const count = Math.floor((this.starCanvas.width * this.starCanvas.height) / 7000);
    for (let i = 0; i < count; i++) {
      this.stars.push({
        x: Math.random() * this.starCanvas.width,
        y: Math.random() * this.starCanvas.height,
        radius: Math.random() * 1.4 + 0.3,
        alpha: Math.random() * 0.8 + 0.2,
        twinkleSpeed: Math.random() * 0.02 + 0.005,
        color: Math.random() > 0.4 ? '#36D9FF' : (Math.random() > 0.5 ? '#FF75B8' : '#FFFFFF')
      });
    }
  }

  animateStars() {
    if (!this.starCtx || !this.starCanvas) return;

    this.starCtx.clearRect(0, 0, this.starCanvas.width, this.starCanvas.height);

    for (let i = 0; i < this.stars.length; i++) {
      const star = this.stars[i];
      star.alpha += star.twinkleSpeed;
      if (star.alpha > 1 || star.alpha < 0.15) {
        star.twinkleSpeed = -star.twinkleSpeed;
      }

      this.starCtx.beginPath();
      this.starCtx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
      this.starCtx.fillStyle = star.color;
      this.starCtx.globalAlpha = Math.max(0, Math.min(1, star.alpha));
      this.starCtx.fill();
    }

    this.starCtx.globalAlpha = 1;
    this.animationFrameId = requestAnimationFrame(() => this.animateStars());
  }

  // Initialize Lucide Icons
  initLucideIcons() {
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }

  // Button Ripple Micro-interaction
  initRippleEffect() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn');
      if (!btn) return;

      const rect = btn.getBoundingClientRect();
      const circle = document.createElement('span');
      const diameter = Math.max(rect.width, rect.height);
      const radius = diameter / 2;

      circle.style.width = circle.style.height = `${diameter}px`;
      circle.style.left = `${e.clientX - rect.left - radius}px`;
      circle.style.top = `${e.clientY - rect.top - radius}px`;
      circle.classList.add('ripple');

      const existingRipple = btn.querySelector('.ripple');
      if (existingRipple) existingRipple.remove();

      btn.appendChild(circle);
      setTimeout(() => circle.remove(), 600);
    });
  }

  // In-App Firebase Config Modal
  initFirebaseConfigDialog() {
    const configBtn = document.getElementById('btn-open-firebase-config');
    const modal = document.getElementById('firebase-config-modal');
    const closeBtn = document.getElementById('btn-close-firebase-config');
    const saveBtn = document.getElementById('btn-save-firebase-config');
    const resetBtn = document.getElementById('btn-reset-firebase-config');
    const jsonInput = document.getElementById('firebase-config-json');

    if (!configBtn || !modal) return;

    configBtn.addEventListener('click', () => {
      const currentConfig = window.firebaseManager.getConfig();
      if (jsonInput) {
        jsonInput.value = JSON.stringify(currentConfig, null, 2);
      }
      modal.classList.add('active');
    });

    closeBtn?.addEventListener('click', () => modal.classList.remove('active'));

    saveBtn?.addEventListener('click', () => {
      try {
        const parsed = JSON.parse(jsonInput.value);
        if (!parsed.apiKey || !parsed.databaseURL) {
          throw new Error("Konfigurasi wajib menyertakan apiKey dan databaseURL.");
        }
        window.firebaseManager.saveConfig(parsed);
      } catch (err) {
        window.notifier.showToast("Format JSON Salah", err.message, "error");
      }
    });

    resetBtn?.addEventListener('click', () => {
      if (confirm("Reset konfigurasi Firebase ke nilai default?")) {
        window.firebaseManager.resetConfig();
      }
    });
  }

  // PWA Service Worker & Install Prompt Registration
  initPWA() {
    // 1. Register Service Worker
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
          .then((reg) => console.log('📱 PWA Service Worker Registered:', reg.scope))
          .catch((err) => console.warn('PWA SW registration skipped:', err.message));
      });
    }

    // 2. Capture beforeinstallprompt for Android Chrome / Brave
    window.deferredPwaPrompt = null;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      window.deferredPwaPrompt = e;
      console.log('📲 PWA: Install Prompt Captured');

      // Unhide all install buttons
      const installBtns = document.querySelectorAll('.btn-install-pwa');
      installBtns.forEach(btn => {
        btn.style.display = 'inline-flex';
      });
    });

    // Handle install button clicks & PWA modal
    const pwaModal = document.getElementById('pwa-install-modal');
    const closePwaModal = () => pwaModal?.classList.remove('active');
    document.getElementById('btn-close-pwa-modal')?.addEventListener('click', closePwaModal);
    document.getElementById('btn-dismiss-pwa-modal')?.addEventListener('click', closePwaModal);

    const triggerNativeBtn = document.getElementById('btn-trigger-native-install');
    triggerNativeBtn?.addEventListener('click', async () => {
      if (window.deferredPwaPrompt) {
        window.deferredPwaPrompt.prompt();
        const { outcome } = await window.deferredPwaPrompt.userChoice;
        console.log(`User response to PWA install: ${outcome}`);
        window.deferredPwaPrompt = null;
        closePwaModal();
      } else {
        window.notifier?.showToast(
          "Gunakan Menu Browser",
          "Ketuk Titik Tiga (⋮) di atas & pilih 'Tambahkan ke Layar Utama'.",
          "info",
          4000
        );
      }
    });

    document.addEventListener('click', async (e) => {
      const btn = e.target.closest('.btn-install-pwa');
      if (!btn) return;

      if (window.deferredPwaPrompt) {
        window.deferredPwaPrompt.prompt();
        const { outcome } = await window.deferredPwaPrompt.userChoice;
        console.log(`User response to PWA install: ${outcome}`);
        window.deferredPwaPrompt = null;
        btn.style.display = 'none';
      } else if (pwaModal) {
        pwaModal.classList.add('active');
      } else {
        // Fallback instructions for Brave / Chrome
        window.notifier?.showToast(
          "Instal Aplikasi TOGETHER",
          "Di Brave/Chrome: ketuk ikon titik tiga (⋮) di kanan atas browser, lalu pilih 'Tambahkan ke Layar Utama' (Add to Home screen) atau 'Instal Aplikasi'.",
          "info",
          7000
        );
      }
    });

    window.addEventListener('appinstalled', () => {
      console.log('🎉 TOGETHER PWA Installed successfully!');
      window.notifier?.showToast("Aplikasi Terpasang! 🎉", "TOGETHER kini tersedia di layar utama perangkat Anda.", "success");
      const installBtns = document.querySelectorAll('.btn-install-pwa');
      installBtns.forEach(btn => btn.style.display = 'none');
    });
  }

  // Romantic Love Counter (Hari Jadian: 31 Oktober 2026)
  initLoveCounter() {
    // Relationship start date: 31 Oktober 2026 00:00:00 WIB
    const startDate = new Date('2026-10-31T00:00:00+07:00').getTime();

    const updateClock = () => {
      const now = Date.now();
      const diff = Math.max(0, now - startDate);

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((diff / (1000 * 60)) % 60);
      const seconds = Math.floor((diff / 1000) % 60);

      const daysElapsed = days + 1; // e.g. Hari ke-3

      // Update Pill
      const pillDays = document.querySelectorAll('.couple-love-days');
      pillDays.forEach(el => el.innerText = `Hari ke-${daysElapsed}`);

      // Update Modal Digits
      const digitDays = document.getElementById('love-digit-days');
      const digitHours = document.getElementById('love-digit-hours');
      const digitMinutes = document.getElementById('love-digit-minutes');
      const digitSeconds = document.getElementById('love-digit-seconds');

      if (digitDays) digitDays.innerText = String(days).padStart(2, '0');
      if (digitHours) digitHours.innerText = String(hours).padStart(2, '0');
      if (digitMinutes) digitMinutes.innerText = String(minutes).padStart(2, '0');
      if (digitSeconds) digitSeconds.innerText = String(seconds).padStart(2, '0');
    };

    updateClock();
    setInterval(updateClock, 1000);
  }
}

// Global App Initialization
document.addEventListener('DOMContentLoaded', () => {
  window.appMaster = new AppMaster();
  // Re-trigger icons after DOM settle
  setTimeout(() => {
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }, 200);
});

