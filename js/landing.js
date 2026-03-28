// js/landing.js — Landing page + PWA install logic
// Handles: Android install prompt, iOS banner, smooth scroll, animations

// ── Install prompt (Android / Chrome) ────────────────────────────────────────
let deferredPrompt = null;
const installBtns = document.querySelectorAll('[data-install]');

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  // Show install buttons (they're hidden by default for non-supported browsers)
  installBtns.forEach(btn => btn.classList.remove('hidden'));
});

installBtns.forEach(btn => {
  btn.addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log('[Install]', outcome);
      deferredPrompt = null;
    } else if (isIOS()) {
      showIOSBanner();
    }
  });
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  console.log('[PWA] Installed!');
  // Optionally hide install UI
  installBtns.forEach(btn => {
    btn.textContent = '✓ Installed! Open from your home screen';
    btn.style.background = 'var(--success)';
  });
});

// ── iOS detection + banner ────────────────────────────────────────────────────
function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
}
function isInStandaloneMode() {
  return navigator.standalone === true
    || window.matchMedia('(display-mode: standalone)').matches;
}

function showIOSBanner() {
  const banner = document.getElementById('ios-banner');
  if (!banner) return;
  banner.style.display = 'block';
  setTimeout(() => banner.classList.add('show'), 10);
}

function hideIOSBanner() {
  const banner = document.getElementById('ios-banner');
  if (!banner) return;
  banner.classList.remove('show');
  setTimeout(() => banner.style.display = 'none', 400);
  sessionStorage.setItem('ios-banner-dismissed', '1');
}

// Auto-show iOS banner after 3s if on iOS and not already installed
if (isIOS() && !isInStandaloneMode() && !sessionStorage.getItem('ios-banner-dismissed')) {
  setTimeout(showIOSBanner, 3000);
}

// On iOS, show static instructions in the install button since no prompt available
if (isIOS() && !isInStandaloneMode()) {
  installBtns.forEach(btn => {
    btn.textContent = '  Add to Home Screen';
    btn.classList.remove('hidden');
    btn.addEventListener('click', showIOSBanner);
  });
}

// Show install button immediately if no Android prompt comes in 1s
setTimeout(() => {
  if (!deferredPrompt && !isIOS()) {
    // Desktop or unsupported — show alternative
    installBtns.forEach(btn => {
      btn.textContent = 'Open SpendLog';
      btn.classList.remove('hidden');
      btn.addEventListener('click', () => window.open('/', '_blank'));
    });
  }
}, 1000);

// ── Scroll animations ─────────────────────────────────────────────────────────
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = '1';
      entry.target.style.transform = 'translateY(0)';
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll('.l-feature, .l-step').forEach(el => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(24px)';
  el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
  observer.observe(el);
});

// ── Animated phone mockup ─────────────────────────────────────────────────────
// Cycle through highlighted days to demo the app
const DEMO_DAYS = [5, 8, 12, 15, 19, 22];
let demoIndex = 0;

function animateDemo() {
  const cells = document.querySelectorAll('.l-preview-cell');
  cells.forEach(c => c.classList.remove('selected'));
  const target = cells[DEMO_DAYS[demoIndex % DEMO_DAYS.length]];
  if (target) target.classList.add('selected');
  demoIndex++;
}
setInterval(animateDemo, 2200);
animateDemo();
