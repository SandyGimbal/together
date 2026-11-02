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
}

// Global App Initialization
document.addEventListener('DOMContentLoaded', () => {
  window.appMaster = new AppMaster();
  // Re-trigger icons after DOM settle
  setTimeout(() => {
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }, 200);
});

