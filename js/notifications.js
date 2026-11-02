/**
 * TOGETHER — Notification Center
 * Handles In-App Neon Glass Toasts, Browser Web Notifications, and Romantic Audio Chimes.
 */

class NotificationService {
  constructor() {
    this.container = null;
    this.audioCtx = null;
    this.hasBrowserPermission = false;
    this.init();
  }

  init() {
    // Ensure toast container exists
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }
    this.container = container;

    // Check browser notification permission status
    if ('Notification' in window) {
      this.hasBrowserPermission = Notification.permission === 'granted';
    }
  }

  // Synthesize an ambient soft romantic/geospatial chime via Web Audio API
  playChime(type = 'default') {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      if (!this.audioCtx) {
        this.audioCtx = new AudioContext();
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      const now = this.audioCtx.currentTime;

      if (type === 'arrival') {
        // Double sweet ping for arrival
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, now); // D5
        osc.frequency.setValueAtTime(880.00, now + 0.12); // A5
        gain.gain.setValueAtTime(0.01, now);
        gain.gain.exponentialRampToValueAtTime(0.2, now + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
        osc.start(now);
        osc.stop(now + 0.7);
      } else if (type === 'error') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, now);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc.start(now);
        osc.stop(now + 0.4);
      } else {
        // Gentle radar/sync chime
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now); // A4
        osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.15); // E5
        gain.gain.setValueAtTime(0.01, now);
        gain.gain.exponentialRampToValueAtTime(0.15, now + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.start(now);
        osc.stop(now + 0.5);
      }
    } catch (e) {
      // Audio autoplay restrictions might block before user gesture
    }
  }

  // Request Web Browser Notification Permission
  async requestNotificationPermission() {
    if (!('Notification' in window)) {
      this.showToast('Browser Limitation', 'Browser Anda tidak mendukung Web Notifications API.', 'warning');
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      this.hasBrowserPermission = permission === 'granted';
      if (this.hasBrowserPermission) {
        this.showToast('Izin Diberikan', 'Notifikasi kedatangan pasangan telah aktif!', 'romantic');
        return true;
      } else {
        this.showToast('Izin Ditolak', 'Notifikasi browser dinonaktifkan.', 'warning');
        return false;
      }
    } catch (err) {
      console.warn("Notification permission request error:", err);
      return false;
    }
  }

  // Display In-App Glassmorphism Toast
  showToast(title, message, type = 'info', duration = 4000) {
    if (!this.container) this.init();

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let iconSvg = '';
    if (type === 'success') {
      iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
    } else if (type === 'error') {
      iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
    } else if (type === 'romantic') {
      iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="#FF75B8" stroke="#FF75B8" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>`;
    } else if (type === 'warning') {
      iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
    } else {
      iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#36D9FF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
    }

    toast.innerHTML = `
      <div class="toast-icon">${iconSvg}</div>
      <div class="toast-content">
        <div class="toast-title">${title}</div>
        <div class="toast-message">${message}</div>
      </div>
      <button class="toast-close" title="Tutup">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    `;

    toast.querySelector('.toast-close').addEventListener('click', () => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(50px)';
      setTimeout(() => toast.remove(), 300);
    });

    this.container.appendChild(toast);

    // Audio chime
    if (type === 'romantic') {
      this.playChime('arrival');
    } else if (type === 'error') {
      this.playChime('error');
    } else {
      this.playChime('default');
    }

    // Auto dismiss
    setTimeout(() => {
      if (toast.parentElement) {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(50px)';
        setTimeout(() => toast.remove(), 300);
      }
    }, duration);

    // Also send browser notification if allowed and page is hidden
    if (this.hasBrowserPermission && document.hidden) {
      try {
        new Notification(`TOGETHER: ${title}`, {
          body: message,
          icon: 'assets/icons/logo.svg'
        });
      } catch (e) {}
    }
  }
}

// Global Singleton Instance
window.notifier = new NotificationService();

