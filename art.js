// 主页的刷毛笔触（D8 第二轮 R5）：把一幅画一笔一笔画出来。和 App 的 apps/desktop/src/renderer/src/art.ts 是同一套算法，
// 来自动效试验页 docs/design/motion-lab/art.js；主页不经过打包，所以这里是一份不带类型的副本，改算法时三处一起改。
// 只用浏览器自带的 Canvas。site.js 通过 window.GleanerBrush 使用
(() => {
  const rng = (seed) => { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; };

  // ---------- 刷毛笔触 ----------
  const imgs = {};
  const load = (src) => (imgs[src] ??= new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = src; }));

  // 画本身的纹理走向：结构张量，取边缘的切线方向；纹理弱的地方用平缓的横向
  function flowField(off, W, H) {
    const fw = 200, fh = Math.round((200 * H) / W);
    const c = document.createElement('canvas'); c.width = fw; c.height = fh;
    const x = c.getContext('2d'); x.drawImage(off, 0, 0, fw, fh);
    const px = x.getImageData(0, 0, fw, fh).data;
    const L = new Float32Array(fw * fh);
    for (let i = 0; i < fw * fh; i++) L[i] = px[i * 4] * 0.3 + px[i * 4 + 1] * 0.59 + px[i * 4 + 2] * 0.11;
    const at = (i, j) => L[Math.min(fh - 1, Math.max(0, j)) * fw + Math.min(fw - 1, Math.max(0, i))];
    let xx = new Float32Array(fw * fh), yy = new Float32Array(fw * fh), xy = new Float32Array(fw * fh);
    for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) {
      const gx = at(i + 1, j - 1) + 2 * at(i + 1, j) + at(i + 1, j + 1) - at(i - 1, j - 1) - 2 * at(i - 1, j) - at(i - 1, j + 1);
      const gy = at(i - 1, j + 1) + 2 * at(i, j + 1) + at(i + 1, j + 1) - at(i - 1, j - 1) - 2 * at(i, j - 1) - at(i + 1, j - 1);
      const k = j * fw + i; xx[k] = gx * gx; yy[k] = gy * gy; xy[k] = gx * gy;
    }
    const blur = (a, r) => {
      const o = new Float32Array(a.length);
      for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) {
        let s = 0, n = 0;
        for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
          const ii = i + di, jj = j + dj;
          if (ii >= 0 && jj >= 0 && ii < fw && jj < fh) { s += a[jj * fw + ii]; n++; }
        }
        o[j * fw + i] = s / n;
      }
      return o;
    };
    xx = blur(xx, 4); yy = blur(yy, 4); xy = blur(xy, 4);
    const ang = new Float32Array(fw * fh), str = new Float32Array(fw * fh);
    for (let k = 0; k < fw * fh; k++) {
      ang[k] = 0.5 * Math.atan2(2 * xy[k], xx[k] - yy[k]) + Math.PI / 2;
      str[k] = Math.sqrt((xx[k] - yy[k]) ** 2 + 4 * xy[k] ** 2) / (xx[k] + yy[k] + 1e-3);
    }
    const idx = (X, Y) => Math.min(fh - 1, Math.max(0, Math.floor((Y / H) * fh))) * fw + Math.min(fw - 1, Math.max(0, Math.floor((X / W) * fw)));
    return {
      angle(X, Y) { const k = idx(X, Y); return str[k] > 0.15 ? ang[k] : 0.25 * Math.sin(X * 0.01 + Y * 0.013); },
      color(X, Y) { const k = idx(X, Y) * 4; return [px[k], px[k + 1], px[k + 2]]; },
    };
  }

  function makeStroke(R, F, W, H, u, w, L, nb) {
    let x = R() * W, y = R() * H;
    const pts = [[x, y]];
    let a = F.angle(x, y);
    let dx = Math.cos(a), dy = Math.sin(a);
    if (R() < 0.5) { dx = -dx; dy = -dy; }
    const step = 5 * u, n = Math.max(3, Math.round(L / step));
    for (let i = 0; i < n; i++) {
      a = F.angle(x, y);
      let ndx = Math.cos(a), ndy = Math.sin(a);
      if (ndx * dx + ndy * dy < 0) { ndx = -ndx; ndy = -ndy; }
      dx = dx * 0.6 + ndx * 0.4; dy = dy * 0.6 + ndy * 0.4;
      const m = Math.hypot(dx, dy); dx /= m; dy /= m;
      x += dx * step; y += dy * step; pts.push([x, y]);
    }
    const nrm = pts.map((_, i) => {
      const [x0, y0] = pts[Math.max(0, i - 1)], [x1, y1] = pts[Math.min(pts.length - 1, i + 1)];
      const m = Math.hypot(x1 - x0, y1 - y0) || 1; return [-(y1 - y0) / m, (x1 - x0) / m];
    });
    // 刷毛：两边的起笔晚、收笔早，笔尖就自然收细；dry 越大越容易飞白
    const bristles = Array.from({ length: nb }, (_, j) => {
      const e = nb === 1 ? 0 : j / (nb - 1) - 0.5;
      const edge = Math.abs(e) * 2;
      return { o: e * w + (R() - 0.5) * (w / nb), bw: (w / nb) * (1.1 + R() * 1.6), alpha: 0.5 + R() * 0.5, from: edge * 0.18 * R(), to: 1 - R() * 0.22 - edge * 0.2 * R(), dry: 0.25 + R() * 0.5, seed: R() * 100 };
    });
    return { pts, nrm, bristles, mid: pts[pts.length >> 1] };
  }

  /**
   * 在 canvas 上把一幅画刷出来。way：reveal 笔刷直接刷出画 / paint 先铺底色再细化 / fade 交叉淡入。
   * keep：不清空，在原来的画上刷（用于换画）。shade：画面下部压暗，好放白字。返回刷完的 Promise
   */
  function brushPaint(canvas, src, way, { calm = false, keep = false, shade = false, seed = 5 } = {}) {
    const my = (canvas._token = (canvas._token || 0) + 1);
    return new Promise(async (done) => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, devicePixelRatio || 1);
      const W = Math.round(rect.width * dpr), H = Math.round(rect.height * dpr);
      if (!keep || canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; keep = false; }
      const ctx = canvas.getContext('2d');
      const img = await load(src);
      if (my !== canvas._token) return done(false);
      const off = document.createElement('canvas'); off.width = W; off.height = H;
      const o = off.getContext('2d');
      const s = Math.max(W / img.width, H / img.height);
      o.drawImage(img, (W - img.width * s) / 2, (H - img.height * s) / 2, img.width * s, img.height * s);
      if (shade) {
        const g = o.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0.45, 'rgba(28,24,19,0)'); g.addColorStop(1, 'rgba(28,24,19,0.72)');
        o.fillStyle = g; o.fillRect(0, 0, W, H);
      }
      if (!keep) { ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--mat').trim() || '#EAE3D8'; ctx.fillRect(0, 0, W, H); }
      if (calm) { ctx.drawImage(off, 0, 0); return done(true); }
      const t0 = performance.now();
      if (way === 'fade') {
        const prev = document.createElement('canvas'); prev.width = W; prev.height = H; prev.getContext('2d').drawImage(canvas, 0, 0);
        const step = (now) => {
          if (my !== canvas._token) return done(false);
          const k = Math.min(1, (now - t0) / 1200), e = 1 - (1 - k) ** 3;
          ctx.globalAlpha = 1; ctx.drawImage(prev, 0, 0); ctx.globalAlpha = e; ctx.drawImage(off, 0, 0); ctx.globalAlpha = 1;
          k < 1 ? requestAnimationFrame(step) : done(true);
        };
        return requestAnimationFrame(step);
      }
      const F = flowField(off, W, H);
      const pat = ctx.createPattern(off, 'no-repeat');
      const u = W / 1600, R = rng(seed);
      // 每一遍：数量、笔宽、笔长、刷毛数、时间段（占总时长）、用画还是用底色
      const passes = way === 'reveal'
        ? [[70, [80, 120], [180, 280], 34, [0, 0.42], 'img'], [240, [34, 60], [90, 160], 22, [0.28, 0.72], 'img'], [900, [10, 22], [30, 70], 9, [0.55, 0.96], 'img']]
        : [[90, [90, 130], [160, 260], 34, [0, 0.36], 'col'], [260, [40, 64], [80, 150], 22, [0.22, 0.58], 'col'], [320, [24, 40], [60, 110], 16, [0.48, 0.8], 'img'], [1000, [8, 18], [24, 60], 8, [0.66, 0.97], 'img']];
      const T = way === 'reveal' ? 2600 : 3400;
      const all = [];
      for (const [n, [w0, w1], [l0, l1], nb, [a0, a1], kind] of passes) {
        const list = Array.from({ length: n }, () => makeStroke(R, F, W, H, u, (w0 + R() * (w1 - w0)) * u, (l0 + R() * (l1 - l0)) * u, nb));
        // 先上后下，带一点乱序，像先画天再画地
        list.forEach((st) => { st.key = st.mid[1] / H + R() * 0.35; });
        list.sort((a, b) => a.key - b.key);
        const dur = 220 + (w0 / 130) * 260;
        list.forEach((st, i) => {
          st.start = (a0 + ((a1 - a0) * i) / n) * T - dur * 0.3 * R();
          st.dur = dur; st.kind = kind; st.done = 0;
          // 底色：每根刷毛在自己的位置取色，再带一点深浅，像一支蘸了几种颜色的笔
          if (kind === 'col') {
            const [mx, my2] = st.mid, [nx, ny] = st.nrm[st.pts.length >> 1];
            for (const b of st.bristles) {
              const [r, g, bl] = F.color(mx + nx * b.o, my2 + ny * b.o); const j = (R() - 0.5) * 34;
              b.style = `rgb(${r + j},${g + j},${bl + j})`;
            }
          } else st.style = pat;
        });
        all.push(...list);
      }
      const ease = (k) => 1 - (1 - k) ** 3;
      const frame = (now) => {
        if (my !== canvas._token) return done(false);
        const t = now - t0;
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        for (const st of all) {
          if (t < st.start || st.done >= 1) continue;
          const k = ease(Math.min(1, (t - st.start) / st.dur));
          const n = st.pts.length - 1;
          if (st.style) ctx.strokeStyle = st.style;
          for (const b of st.bristles) {
            if (b.style) ctx.strokeStyle = b.style;
            const p0 = Math.max(st.done, b.from), p1 = Math.min(k, b.to);
            if (p1 <= p0) continue;
            const i0 = Math.floor(p0 * n), i1 = Math.ceil(p1 * n);
            // 越往后颜料越少：变淡，偶尔断开（飞白）
            const sMid = (p0 + p1) / 2;
            const press = Math.sin(Math.PI * Math.min(1, 0.25 + sMid * 0.9));
            if (sMid > 0.55 && Math.sin(b.seed + sMid * 40) > 1 - b.dry * (sMid - 0.4)) continue;
            ctx.globalAlpha = b.alpha * (1 - b.dry * Math.max(0, sMid - 0.5)) * (st.kind === 'col' ? 0.9 : 1);
            ctx.lineWidth = b.bw * (0.6 + 0.4 * press);
            ctx.beginPath();
            for (let i = i0; i <= i1; i++) {
              const [x, y] = st.pts[i], [nx, ny] = st.nrm[i];
              const oo = b.o * (0.75 + 0.25 * press);
              i === i0 ? ctx.moveTo(x + nx * oo, y + ny * oo) : ctx.lineTo(x + nx * oo, y + ny * oo);
            }
            ctx.stroke();
          }
          st.done = k;
        }
        // 最后把缝补满，慢慢合成原画
        if (t > T) { ctx.globalAlpha = Math.min(1, (t - T) / 700) * 0.18; ctx.drawImage(off, 0, 0); }
        ctx.globalAlpha = 1;
        if (t < T + 900) requestAnimationFrame(frame); else { ctx.drawImage(off, 0, 0); done(true); }
      };
      requestAnimationFrame(frame);
    });
  }

  window.GleanerBrush = { brushPaint };
})();
