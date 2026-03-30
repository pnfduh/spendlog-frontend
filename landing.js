// landing.js — Install prompt + iOS banner + scroll animations
let deferredPrompt = null;
const installBtns = document.querySelectorAll('[data-install]');

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installBtns.forEach(btn => btn.classList.remove('hidden'));
});

installBtns.forEach(btn => {
  btn.addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      deferredPrompt = null;
    } else if (isIOS()) {
      showIOSBanner();
    }
  });
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  installBtns.forEach(btn => {
    btn.textContent = '✓ Installed! Open from your home screen';
    btn.style.background = '#00C896';
  });
});

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
}
function isInStandaloneMode() {
  return navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
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

if (isIOS() && !isInStandaloneMode() && !sessionStorage.getItem('ios-banner-dismissed')) {
  setTimeout(showIOSBanner, 3000);
}

if (isIOS() && !isInStandaloneMode()) {
  installBtns.forEach(btn => {
    btn.textContent = ' Add to Home Screen';
    btn.classList.remove('hidden');
    btn.addEventListener('click', showIOSBanner);
  });
}

setTimeout(() => {
  if (!deferredPrompt && !isIOS()) {
    installBtns.forEach(btn => btn.classList.remove('hidden'));
  }
}, 1000);

// Scroll animations
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

// Animate demo grid dots
const DEMO_DAYS = [4, 7, 12, 16, 20];
let demoIndex = 0;
function animateDemo() {
  const cells = document.querySelectorAll('.l-preview-cell');
  cells.forEach(c => c.classList.remove('selected'));
  const target = cells[DEMO_DAYS[demoIndex % DEMO_DAYS.length]];
  if (target) target.classList.add('selected');
  demoIndex++;
}
setInterval(animateDemo, 2000);
animateDemo();
