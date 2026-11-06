// 主页的几件小事（语言切换在 lang.js）：进场浮现、
// 首屏的画"呼吸"时在看不见的时候暂停、正文随滚动逐字变清楚（D8-3，docs/design/motion-spec.md）。
(() => {
  const root = document.documentElement;
  root.classList.add('js');

  // 下载点击记录（docs/design/usage-stats.md 第 2.3 节，只在正式构建里有 data-stats）：
  // 进站时记下推广渠道（?ref=）和来源网站的域名，点下载时顺带发一条；发不出去也照样下载
  const stats = root.dataset.stats;
  if (stats) {
    const keep = (k, v) => { try { if (v && !sessionStorage.getItem(k)) sessionStorage.setItem(k, v); } catch { /* 存不了就不记 */ } };
    const get = (k) => { try { return sessionStorage.getItem(k); } catch { return null; } };
    const ref = new URLSearchParams(location.search).get('ref');
    if (ref && /^[a-z0-9-]{1,24}$/.test(ref)) keep('ref', ref);
    try { const host = document.referrer && new URL(document.referrer).hostname; if (host && host !== location.hostname) keep('src', host); } catch { /* 没有来源 */ }
    document.querySelectorAll('[data-releases]').forEach((a) => a.addEventListener('click', () => {
      try {
        const body = JSON.stringify({ os: 'mac', ref: get('ref'), src: get('src'), lang: root.dataset.lang === 'en' ? 'en' : 'zh' });
        navigator.sendBeacon(stats, new Blob([body], { type: 'text/plain' }));
      } catch { /* 不影响下载 */ }
    }));
  }

  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // 点截图或短片放大看：放大的是当前语言那一个；"减少动态效果"时短片放大也只显示静态图
  const zoom = document.querySelector('.zoom');
  const big = zoom.querySelector('img');
  const bigVideo = zoom.querySelector('video');
  document.querySelectorAll('.shot').forEach((b) => b.addEventListener('click', () => {
    const media = [...b.querySelectorAll('img, video')].find((m) => m.offsetParent);
    if (!media) return;
    const video = media.tagName === 'VIDEO' && !calm;
    big.hidden = video;
    bigVideo.hidden = !video;
    if (video) {
      bigVideo.src = media.querySelector('source').src;
      bigVideo.setAttribute('aria-label', media.getAttribute('aria-label') ?? '');
      void bigVideo.play().catch(() => {});
    } else {
      big.src = media.tagName === 'VIDEO' ? media.poster : media.currentSrc || media.src;
      big.alt = media.getAttribute('aria-label') ?? media.alt ?? '';
    }
    zoom.showModal();
  }));
  zoom.addEventListener('click', () => zoom.close());
  zoom.addEventListener('close', () => bigVideo.pause());

  // 功能短片（试用反馈 C4）：只在看得见时播放，看不见就停；"减少动态效果"时不播放，只显示首帧图
  const clips = [...document.querySelectorAll('.clip video')];
  if (!calm && 'IntersectionObserver' in window) {
    const clipIo = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const v = e.target;
        if (e.isIntersecting && v.offsetParent) void v.play().catch(() => {});
        else v.pause();
      }
    }, { threshold: 0.35 });
    clips.forEach((v) => clipIo.observe(v));
  }
  const items = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) return items.forEach((el) => el.classList.add('seen'));
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('seen'); io.unobserve(e.target); }
  }, { rootMargin: '0px 0px -10% 0px' });
  items.forEach((el) => io.observe(el));

  // D8 第二轮 R5：首屏按访客的当地时间选画，用刷毛笔触画出来，画好后名字浮上来（和 App 的第一次打开一样）
  const brush = window.GleanerBrush;
  const T = (zh, en) => `<span lang="zh-CN">${zh}</span><span lang="en">${en}</span>`;
  // 主页只用米勒和梵高两位（项目负责人 2026-10-31：画太多，不要莫奈）：白天《拾穗者》，晚上《麦田群鸦》
  const PAINT = {
    day: { src: 'img/gleaners.jpg', cap: null },
    night: { src: 'img/vangogh-crows.webp', cap: T('文森特·梵高，《麦田群鸦》，1890 年，布面油画，梵高博物馆', 'Vincent van Gogh, Wheatfield with Crows, 1890, oil on canvas, Van Gogh Museum') },
  };
  const h = new Date().getHours();
  const now = h >= 5 && h < 20 ? 'day' : 'night';
  const heroCanvas = document.querySelector('.plate canvas');
  if (brush && heroCanvas) {
    root.classList.add('painting');
    if (PAINT[now].cap) document.querySelector('[data-caption]').innerHTML = PAINT[now].cap;
    brush.brushPaint(heroCanvas, PAINT[now].src, 'paint', { calm, seed: 3 }).then(() => root.classList.add('painted'));
  } else root.classList.add('painted');

  // 田里的一天：往下滚到哪一段，背后的画就换成一天里的那个时刻，新的一幅刷在旧的上面
  const DAY = {
    noon: { src: 'img/vangogh-reaper.webp', label: T('正午 · 梵高《麦田与收割者》', 'Noon · Van Gogh, Wheatfield with a Reaper') },
    afternoon: { src: 'img/gleaners.jpg', label: T('午后 · 米勒《拾穗者》', 'Afternoon · Millet, The Gleaners') },
    night: { src: 'img/vangogh-crows.webp', label: T('夜 · 梵高《麦田群鸦》', 'Night · Van Gogh, Wheatfield with Crows') },
  };
  const dayCanvas = document.querySelector('.day-sticky canvas');
  const dayTime = document.querySelector('.day-time');
  let shownDay = null;
  const showDay = (key) => {
    if (!brush || key === shownDay || !DAY[key]) return;
    const keep = shownDay !== null;
    shownDay = key;
    dayTime.innerHTML = DAY[key].label;
    brush.brushPaint(dayCanvas, DAY[key].src, 'reveal', { calm, keep, seed: 20 + Object.keys(DAY).indexOf(key) });
  };
  const dayIo = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) showDay(e.target.dataset.day);
  }, { rootMargin: '-45% 0px -45% 0px' });
  document.querySelectorAll('.day-panel').forEach((el) => dayIo.observe(el));

  // 首屏的画：滚出视野或页面在后台时暂停"呼吸"
  let heroVisible = true;
  const idle = () => root.classList.toggle('idle', document.hidden || !heroVisible);
  new IntersectionObserver(([e]) => { heroVisible = e.isIntersecting; idle(); }).observe(document.querySelector('.hero'));
  document.addEventListener('visibilitychange', idle);

  // 正文逐字变清楚："减少动态效果"时不拆字，文字直接是清楚的
  if (calm) return;
  const groups = [...document.querySelectorAll('[data-reveal]')].map((el) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const texts = [];
    while (walker.nextNode()) if (walker.currentNode.textContent.trim()) texts.push(walker.currentNode);
    for (const node of texts) {
      // 中文一个字一份，英文一个词（连同后面的空格）一份
      const parts = node.textContent.match(/[一-鿿　-〿＀-￯]|[^\s一-鿿　-〿＀-￯]+\s*|\s+/g) || [];
      const frag = document.createDocumentFragment();
      for (const p of parts) {
        if (!p.trim()) { frag.append(p); continue; }
        const w = document.createElement('span');
        w.className = 'w';
        w.textContent = p;
        frag.append(w);
      }
      node.replaceWith(frag);
    }
    return { el, words: [...el.querySelectorAll('.w')] };
  });
  // 段落顶部到屏幕 85% 时开始亮，到 40% 时全亮；只算当前语言（另一种语言是隐藏的，没有位置）
  let queued = false;
  const update = () => {
    queued = false;
    const h = innerHeight;
    // 滚到页底时，页底那几段到不了屏幕 40% 的位置，剩下的字全部亮起
    const end = scrollY + h >= document.documentElement.scrollHeight - 2;
    for (const { el, words } of groups) {
      const top = el.getBoundingClientRect().top;
      const p = end && top < h ? 1 : Math.min(1, Math.max(0, (h * 0.85 - top) / (h * 0.45)));
      const shown = words.filter((w) => w.offsetParent);
      const n = Math.round(p * shown.length);
      // 亮过的字一直亮着：往回滚不重新变暗，读过一遍全文都清楚
      shown.forEach((w, i) => { if (i < n) w.classList.add('lit'); });
    }
  };
  const later = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
  addEventListener('scroll', later, { passive: true });
  addEventListener('resize', later);
  document.querySelector('[data-switch]')?.addEventListener('click', later);
  update();
})();
