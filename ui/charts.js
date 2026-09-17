// Minimal hand-rolled canvas charts — no bundler/CDN in this codebase's toolchain,
// so this mirrors orb.js's precedent of hand-rolling what a library would otherwise do.

const COLOR_AXIS = 'rgba(143, 182, 216, 0.3)';
const COLOR_TEXT = 'rgba(143, 182, 216, 0.85)';
const COLOR_BAR = 'rgba(79, 227, 255, 0.5)';
const COLOR_LINE = '#4fe3ff';

function setupCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = rect.width || canvas.width || 300;
  const h = rect.height || canvas.height || 160;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

const PAD = { l: 30, r: 10, t: 10, b: 22 };

function drawAxes(ctx, w, h) {
  ctx.strokeStyle = COLOR_AXIS;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD.l, PAD.t);
  ctx.lineTo(PAD.l, h - PAD.b);
  ctx.lineTo(w - PAD.r, h - PAD.b);
  ctx.stroke();
}

export function drawBarChart(canvas, { labels, values, color = COLOR_BAR }) {
  const { ctx, w, h } = setupCanvas(canvas);
  ctx.clearRect(0, 0, w, h);
  drawAxes(ctx, w, h);

  const plotW = w - PAD.l - PAD.r;
  const plotH = h - PAD.t - PAD.b;
  const max = Math.max(1, ...values);
  const n = values.length;
  if (!n) return;
  const gap = 6;
  const barW = Math.max(2, (plotW - gap * (n - 1)) / n);

  ctx.fillStyle = color;
  values.forEach((v, i) => {
    const barH = (v / max) * plotH;
    const x = PAD.l + i * (barW + gap);
    const y = h - PAD.b - barH;
    ctx.fillRect(x, y, barW, barH);
  });

  ctx.fillStyle = COLOR_TEXT;
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  labels.forEach((l, i) => {
    const x = PAD.l + i * (barW + gap) + barW / 2;
    ctx.fillText(l, x, h - 6);
  });
}

export function drawLineChart(canvas, { labels, values, color = COLOR_LINE }) {
  const { ctx, w, h } = setupCanvas(canvas);
  ctx.clearRect(0, 0, w, h);
  drawAxes(ctx, w, h);

  const plotW = w - PAD.l - PAD.r;
  const plotH = h - PAD.t - PAD.b;
  const max = Math.max(1, ...values);
  const n = values.length;
  if (n < 2) return;
  const stepX = plotW / (n - 1);

  const points = values.map((v, i) => ({
    x: PAD.l + i * stepX,
    y: h - PAD.b - (v / max) * plotH,
  }));

  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  if (points.length === 2) {
    ctx.lineTo(points[1].x, points[1].y);
  } else {
    // Catmull-Rom -> cubic Bezier: smooth curve that passes through every
    // actual data point (not just near them, which a plain quadratic-midpoint
    // smoothing would do — that pulls the curve off the real interior points).
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i - 1] || points[i];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2] || p2;
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
    }
  }
  ctx.stroke();

  ctx.fillStyle = color;
  for (const p of points) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = COLOR_TEXT;
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  const labelEvery = Math.max(1, Math.ceil(n / 6));
  labels.forEach((l, i) => {
    if (i % labelEvery !== 0 && i !== n - 1) return;
    ctx.fillText(l, PAD.l + i * stepX, h - 6);
  });
}
