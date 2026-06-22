const nav = document.getElementById('nav');
const navToggle = document.getElementById('navToggle');
const navLinks = document.getElementById('navLinks');

function setMenuOpen(open) {
  if (!navLinks || !navToggle) return;
  navLinks.classList.toggle('open', open);
  navToggle.classList.toggle('open', open);
  navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  navToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  document.body.classList.toggle('menu-open', open);
}

if (navToggle && navLinks) {
  navToggle.addEventListener('click', () => {
    setMenuOpen(!navLinks.classList.contains('open'));
  });

  navLinks.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => setMenuOpen(false));
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && navLinks.classList.contains('open')) setMenuOpen(false);
  });
}

const navAnchors = document.querySelectorAll('[data-nav]');
const sections = [...navAnchors].map(a => document.querySelector(a.getAttribute('href'))).filter(Boolean);

if (sections.length) {
  const sectionObserver = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const id = entry.target.id;
          navAnchors.forEach(a => {
            a.classList.toggle('active', a.getAttribute('href') === `#${id}`);
          });
        }
      });
    },
    { rootMargin: '-40% 0px -55% 0px', threshold: 0 }
  );
  sections.forEach(s => sectionObserver.observe(s));
}

const mobileCallBar = document.getElementById('mobileCallBar');
if (mobileCallBar) {
  const hero = document.querySelector('.hero');
  const callObserver = new IntersectionObserver(
    ([entry]) => mobileCallBar.classList.toggle('visible', !entry.isIntersecting),
    { threshold: 0, rootMargin: '0px 0px -80px 0px' }
  );
  if (hero) callObserver.observe(hero);
}

const revealObserver = new IntersectionObserver(
  entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.08, rootMargin: '0px 0px -40px 0px' }
);

document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));
