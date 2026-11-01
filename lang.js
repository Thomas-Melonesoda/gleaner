// 主页和隐私说明共用：语言按浏览器语言默认，可切换并记住
(() => {
  const root = document.documentElement;
  const read = () => { try { return localStorage.getItem('lang'); } catch { return null; } };
  const save = (v) => { try { localStorage.setItem('lang', v); } catch { /* 隐私模式等：不记也能用 */ } };
  const set = (lang) => {
    root.dataset.lang = lang;
    root.lang = lang === 'zh' ? 'zh-CN' : 'en';
    // 页面标题：<html data-title-zh data-title-en> 写了就用，没写是主页
    document.title = (lang === 'zh' ? root.dataset.titleZh : root.dataset.titleEn) || (lang === 'zh' ? 'Gleaner · 拾穗' : 'Gleaner');
  };
  set(read() || (/^zh\b/i.test(navigator.language) ? 'zh' : 'en'));
  document.querySelector('[data-switch]').addEventListener('click', () => {
    const next = root.dataset.lang === 'zh' ? 'en' : 'zh';
    set(next);
    save(next);
  });
})();
