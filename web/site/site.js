// Entrance reveals and scene playback for nix.shipapp.pl. Without JavaScript everything is simply
// visible and the scenes loop from the start; with reduced motion nothing animates (site.css).
document.documentElement.classList.add('js');

const reveal = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('in');
      reveal.unobserve(entry.target);
    }
  },
  { rootMargin: '0px 0px -12% 0px', threshold: 0.12 },
);

// Scenes play only while on screen, so each one starts from its first beat when you reach it.
const play = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) entry.target.classList.toggle('is-playing', entry.isIntersecting);
  },
  { threshold: 0.35 },
);

window.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.reveal').forEach((element) => reveal.observe(element));
  document.querySelectorAll('.scene:not(.hero-scene), .tile-art, .check-demo').forEach((element) => play.observe(element));
});
