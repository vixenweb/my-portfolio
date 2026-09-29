const notice = document.getElementById("notice");
const pane = document.getElementById("notice-pane");

/* ---------- Glass edge refraction ----------
   Draws a displacement map that matches the pane's size and corner radius.
   Pixels deeper than BEZEL px from the edge are neutral (no distortion).
   Inside the band, light is pulled smoothly from the interior, strongest
   at the very edge and fading to zero, following the rounded contour. */
const BEZEL = 26;    // width of the bending band, in px
const STRENGTH = 14; // max shift at the edge, in px

const filter = document.getElementById("lg");
const map = document.getElementById("lg-map");
const disp = document.getElementById("lg-disp");

function buildMap() {
  const w = pane.offsetWidth;
  const h = pane.offsetHeight;
  if (!w || !h) return;
  const r = Math.min(parseFloat(getComputedStyle(pane).borderTopLeftRadius) || 0, w / 2, h / 2);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(w, h);
  const px = img.data;

  const hw = w / 2 - r;
  const hh = h / 2 - r;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x + 0.5 - w / 2;
      const dy = y + 0.5 - h / 2;
      const qx = Math.abs(dx) - hw;
      const qy = Math.abs(dy) - hh;
      const ox = Math.max(qx, 0);
      const oy = Math.max(qy, 0);
      const out = Math.hypot(ox, oy);
      const depth = r - (out + Math.min(Math.max(qx, qy), 0)); // distance inside the edge

      let vx = 0;
      let vy = 0;
      if (depth >= 0 && depth < BEZEL) {
        // outward normal of the rounded rectangle
        let nx, ny;
        if (out > 0) { nx = Math.sign(dx) * ox / out; ny = Math.sign(dy) * oy / out; }
        else if (qx > qy) { nx = Math.sign(dx); ny = 0; }
        else { nx = 0; ny = Math.sign(dy); }

        const t = 1 - depth / BEZEL;          // 1 at the edge, 0 at the inner border of the band
        const m = t * t * (3 - 2 * t);        // smoothstep: no visible seam where the band ends
        vx = -nx * m;                         // sample from further inside
        vy = -ny * m;
      }

      const i = (y * w + x) * 4;
      px[i] = 128 + vx * 127;
      px[i + 1] = 128 + vy * 127;
      px[i + 2] = 128;
      px[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  filter.setAttribute("width", w);
  filter.setAttribute("height", h);
  map.setAttribute("width", w);
  map.setAttribute("height", h);
  map.setAttribute("href", canvas.toDataURL());
  disp.setAttribute("scale", STRENGTH * 2);
}

buildMap();
new ResizeObserver(() => { buildMap(); buildRing(); }).observe(pane);
if (document.fonts) document.fonts.ready.then(() => { buildMap(); buildRing(); });

/* ---------- Continuous light around the border ----------
   A conic gradient's angle does not move evenly along a wide rectangle
   (the light would race along the long sides). So instead, the colour
   stops are placed at points spaced evenly along the perimeter, and the
   colours slide along them: constant speed everywhere, including corners. */
const LOOP_SECONDS = 8; // time for the light to travel once around the box
const SAMPLES = 96;     // colour stops around the border
const PALETTE = ["#1f4d73", "#3f88ad", "#9fd4e6", "#e6f6fb", "#7cbcd8", "#34739f", "#234b86", "#2f6f8f"].map(hexToRgb);

const ringEls = [...document.querySelectorAll(".notice__ring, .notice__aura")];
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let ringAngles = [];
let startTime = performance.now();

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}

// colour at position f (0..1) around a seamless loop of the palette
function paletteAt(f) {
  const p = f * PALETTE.length;
  const i = Math.floor(p);
  const k = p - i;
  const a = PALETTE[i % PALETTE.length];
  const b = PALETTE[(i + 1) % PALETTE.length];
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * k)} ${Math.round(a[1] + (b[1] - a[1]) * k)} ${Math.round(a[2] + (b[2] - a[2]) * k)})`;
}

// For evenly spaced points along the perimeter, find each point's angle
// around the box centre (that is what a conic gradient uses).
function buildRing() {
  const w = notice.offsetWidth;
  const h = notice.offsetHeight;
  if (!w || !h) return;
  const r = Math.min(parseFloat(getComputedStyle(notice).borderTopLeftRadius) || 0, w / 2, h / 2);
  const a = w / 2 - r;
  const b = h / 2 - r;
  const H = h / 2;
  const q = (Math.PI * r) / 2;
  const arc = (cx, cy, startDeg, d) => {
    const phi = (startDeg * Math.PI) / 180 + d / r;
    return [cx + r * Math.cos(phi), cy + r * Math.sin(phi)];
  };

  // Clockwise from the top centre: [length, point at distance t]
  const segs = [
    [a,     (t) => [t, -H]],
    [q,     (t) => arc(a, -b, -90, t)],
    [2 * b, (t) => [w / 2, -b + t]],
    [q,     (t) => arc(a, b, 0, t)],
    [2 * a, (t) => [a - t, H]],
    [q,     (t) => arc(-a, b, 90, t)],
    [2 * b, (t) => [-w / 2, b - t]],
    [q,     (t) => arc(-a, -b, 180, t)],
    [a,     (t) => [-a + t, -H]],
  ];
  const perimeter = segs.reduce((sum, s) => sum + s[0], 0);

  ringAngles = [];
  for (let i = 0; i <= SAMPLES; i++) {
    let s = (i / SAMPLES) * perimeter;
    let angle = 360;
    if (i < SAMPLES) {
      for (const [len, at] of segs) {
        if (s <= len) {
          const [x, y] = at(Math.max(s, 0));
          angle = (Math.atan2(x, -y) * 180 / Math.PI + 360) % 360;
          break;
        }
        s -= len;
      }
    }
    ringAngles.push(i === 0 ? 0 : Math.max(angle, ringAngles[i - 1]));
  }
  paintRing(((performance.now() - startTime) / 1000 / LOOP_SECONDS) % 1);
}

// u (0..1) is how far the colours have slid around the border
function paintRing(u) {
  if (!ringAngles.length) return;
  const stops = ringAngles.map((deg, i) => {
    const f = (((i / SAMPLES - u) % 1) + 1) % 1;
    return `${paletteAt(f)} ${deg.toFixed(2)}deg`;
  });
  const value = `conic-gradient(from 0deg, ${stops.join(", ")})`;
  ringEls.forEach((el) => el.style.setProperty("--ring", value));
}

function tick(now) {
  paintRing(((now - startTime) / 1000 / LOOP_SECONDS) % 1);
  if (!reduceMotion.matches) requestAnimationFrame(tick);
}

/* ---------- Focus and pointer light ---------- */
// Put focus inside the notice; everything behind it is `inert`.
notice.focus({ preventScroll: true });

notice.addEventListener("pointermove", (e) => {
  const r = notice.getBoundingClientRect();
  notice.style.setProperty("--mx", `${e.clientX - r.left}px`);
  notice.style.setProperty("--my", `${e.clientY - r.top}px`);
});
notice.addEventListener("pointerleave", () => {
  notice.style.setProperty("--mx", "50%");
  notice.style.setProperty("--my", "0%");
});

buildRing();
requestAnimationFrame(tick);

// The notice can't be dismissed right now. When the site launches,
// call closeNotice() (or delete the notice, veil and `inert` attributes).
function closeNotice() {
  document.body.classList.remove("is-locked");
  document.querySelectorAll("[inert]").forEach((el) => el.removeAttribute("inert"));
  document.querySelectorAll(".veil, .notice").forEach((el) => (el.hidden = true));
}