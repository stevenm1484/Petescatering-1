const nav = document.getElementById('nav');
const navToggle = document.getElementById('navToggle');
const navLinks = document.getElementById('navLinks');

window.addEventListener('scroll', () => {
  nav.classList.toggle('scrolled', window.scrollY > 40);
});

function setMenuOpen(open) {
  navLinks.classList.toggle('open', open);
  navToggle.classList.toggle('open', open);
  navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  navToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  document.body.classList.toggle('menu-open', open);
}

navToggle.addEventListener('click', () => {
  setMenuOpen(!navLinks.classList.contains('open'));
});

navLinks.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => setMenuOpen(false));
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && navLinks.classList.contains('open')) setMenuOpen(false);
});

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

const mobileCtaBar = document.getElementById('mobileCtaBar');
if (mobileCtaBar) {
  const hero = document.querySelector('.hero');
  const ctaObserver = new IntersectionObserver(
    ([entry]) => mobileCtaBar.classList.toggle('visible', !entry.isIntersecting),
    { threshold: 0, rootMargin: '0px 0px -80px 0px' }
  );
  if (hero) ctaObserver.observe(hero);
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
  { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
);

document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

const faqList = document.getElementById('faqList');
if (faqList) {
  faqList.querySelectorAll('details').forEach(detail => {
    detail.addEventListener('toggle', () => {
      if (!detail.open) return;
      faqList.querySelectorAll('details').forEach(other => {
        if (other !== detail) other.open = false;
      });
    });
  });
}

const contactForm = document.getElementById('contactForm');
if (contactForm) {
  contactForm.addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    const payload = {
      name: form.name.value.trim(),
      business: form.business.value.trim(),
      phone: form.phone.value.trim(),
      email: form.email.value.trim(),
      type: form.type.value,
      message: (form.message.value || '').trim()
    };

    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending...';

    try {
      const resp = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await resp.json();
      if (!resp.ok || !data.ok) throw new Error('save failed');
      form.hidden = true;
      document.getElementById('formSuccess').hidden = false;
    } catch {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Request my free quote';
      alert('Could not send your request right now. Please call us or try again in a moment.');
    }
  });
}
