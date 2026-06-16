/* ==========================================================
   Sippo Brand Site interactions
   ========================================================== */
(() => {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(pointer: fine)').matches;

  const header = document.getElementById('header');
  const onScrollHeader = () => {
    header?.classList.toggle('is-scrolled', window.scrollY > 24);
  };
  window.addEventListener('scroll', onScrollHeader, { passive: true });
  onScrollHeader();

  const navToggle = document.getElementById('navToggle');
  const navMenu = document.getElementById('navMenu');
  if (navToggle && navMenu) {
    const setMenu = (open) => {
      navMenu.classList.toggle('is-open', open);
      navToggle.setAttribute('aria-expanded', String(open));
      navToggle.setAttribute('aria-label', open ? 'メニューを閉じる' : 'メニューを開く');
      document.body.style.overflow = open ? 'hidden' : '';
    };

    navToggle.addEventListener('click', () => {
      setMenu(!navMenu.classList.contains('is-open'));
    });

    // メニュー内リンク → 閉じてから遷移／スクロール
    navMenu.querySelectorAll('a').forEach((a) => {
      a.addEventListener('click', () => setMenu(false));
    });

    // 余白（リンク以外）タップで閉じる
    navMenu.addEventListener('click', (event) => {
      if (event.target === navMenu) setMenu(false);
    });

    // Esc キーで閉じる
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && navMenu.classList.contains('is-open')) {
        setMenu(false);
        navToggle.focus();
      }
    });

    // モバイル幅を抜けたらメニュー状態をリセット（スクロールロック残り防止）
    const mqMobile = window.matchMedia('(max-width: 820px)');
    mqMobile.addEventListener('change', (event) => {
      if (!event.matches) setMenu(false);
    });
  }

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      revealObserver.unobserve(entry.target);
    });
  }, { threshold: 0.18, rootMargin: '0px 0px -40px 0px' });
  document.querySelectorAll('.reveal, .service-card').forEach((el) => revealObserver.observe(el));

  const countObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      countObserver.unobserve(el);
      const target = Number(el.dataset.count);
      if (reduceMotion) {
        el.textContent = target;
        return;
      }

      const duration = 1400;
      const start = performance.now();
      const tick = (now) => {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.round(target * eased);
        if (progress < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }, { threshold: 0.6 });
  document.querySelectorAll('.count').forEach((el) => countObserver.observe(el));

  const glow = document.querySelector('.cursor-glow');
  if (glow && finePointer && !reduceMotion) {
    let mx = -300;
    let my = -300;
    let gx = mx;
    let gy = my;
    let raf = null;

    const loop = () => {
      gx += (mx - gx) * 0.08;
      gy += (my - gy) * 0.08;
      glow.style.transform = `translate(${gx}px, ${gy}px)`;
      if (Math.abs(mx - gx) > 0.5 || Math.abs(my - gy) > 0.5) {
        raf = requestAnimationFrame(loop);
      } else {
        raf = null;
      }
    };

    window.addEventListener('pointermove', (event) => {
      mx = event.clientX;
      my = event.clientY;
      if (!raf) raf = requestAnimationFrame(loop);
    }, { passive: true });
  } else if (glow) {
    glow.remove();
  }

  const hero = document.getElementById('hero');
  const blobs = document.querySelectorAll('.blob');
  if (hero && finePointer && !reduceMotion) {
    let blobRaf = null;
    let pointerX = 0;
    let pointerY = 0;
    const applyParallax = () => {
      blobRaf = null;
      const rect = hero.getBoundingClientRect();
      const nx = (pointerX - rect.left) / rect.width - 0.5;
      const ny = (pointerY - rect.top) / rect.height - 0.5;
      blobs.forEach((blob) => {
        const depth = Number(blob.dataset.depth) || 20;
        blob.style.translate = `${nx * depth}px ${ny * depth}px`;
      });
    };
    hero.addEventListener('pointermove', (event) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
      if (!blobRaf) blobRaf = requestAnimationFrame(applyParallax);
    }, { passive: true });
  }

  const mascot = document.getElementById('mascot');
  const sippoMascot = document.getElementById('sippoMascot');
  const sippoImages = {
    normal: 'assets/sippo/sippo-normal.webp',
    thinking: 'assets/sippo/sippo-thinking.webp',
    happy: 'assets/sippo/sippo-happy.webp',
    worried: 'assets/sippo/sippo-worried.webp',
    surprised: 'assets/sippo/sippo-surprised.webp',
    sleepy: 'assets/sippo/sippo-sleepy.webp'
  };
  const temporarySippoStates = {
    happy: 2600,
    worried: 3600,
    surprised: 1400
  };
  let sippoState = 'normal';
  let sippoReturnTimer = null;
  let sippoChangeTimer = null;
  let sippoIdleTimer = null;
  let sippoInputTimer = null;
  let sippoBusyCount = 0;

  // 感情切替用の画像は初回描画をブロックしないよう、アイドル時に先読みする
  // （表示中の normal は index.html の <img> で既に読み込まれている）
  const preloadSippoImages = () => {
    Object.values(sippoImages).forEach((src) => {
      const img = new Image();
      img.src = src;
    });
  };
  if ('requestIdleCallback' in window) {
    requestIdleCallback(preloadSippoImages, { timeout: 3000 });
  } else {
    window.addEventListener('load', () => setTimeout(preloadSippoImages, 1200));
  }

  function setSippoState(state, options = {}) {
    if (!sippoMascot || !sippoImages[state]) return;

    const { duration, force = false } = options;
    if (!force && state === sippoState) return;

    clearTimeout(sippoReturnTimer);
    clearTimeout(sippoChangeTimer);
    sippoState = state;

    const applyImage = () => {
      sippoMascot.src = sippoImages[state];
      sippoMascot.dataset.state = state;
      sippoMascot.classList.remove('is-changing');
      mascot?.classList.add('has-state-image');
    };

    if (reduceMotion) {
      applyImage();
    } else {
      sippoMascot.classList.add('is-changing');
      sippoChangeTimer = setTimeout(applyImage, 180);
    }

    const returnDelay = duration ?? temporarySippoStates[state];
    if (returnDelay) {
      sippoReturnTimer = setTimeout(() => {
        if (sippoBusyCount === 0 && sippoState === state) setSippoState('normal');
      }, returnDelay);
    }
  }

  function resetSippoIdleTimer() {
    clearTimeout(sippoIdleTimer);
    if (sippoState === 'sleepy') setSippoState('normal');
    sippoIdleTimer = setTimeout(() => {
      if (sippoBusyCount === 0) setSippoState('sleepy');
    }, 30000);
  }

  if (sippoMascot) {
    sippoMascot.addEventListener('load', () => {
      mascot?.classList.add('has-state-image');
      mascot?.classList.remove('has-image-error');
    });
    sippoMascot.addEventListener('error', () => {
      mascot?.classList.add('has-image-error');
    });

    window.setSippoState = setSippoState;
    setSippoState('normal', { force: true });

    ['mousemove', 'keydown', 'click', 'touchstart', 'input'].forEach((eventName) => {
      window.addEventListener(eventName, resetSippoIdleTimer, { passive: true });
    });
    resetSippoIdleTimer();

    document.addEventListener('input', (event) => {
      const target = event.target;
      if (!target || !target.matches?.('input, textarea, [contenteditable="true"]')) return;
      if (sippoBusyCount > 0) return;
      setSippoState('thinking', { duration: 1200 });
      clearTimeout(sippoInputTimer);
      sippoInputTimer = setTimeout(() => {
        if (sippoBusyCount === 0 && sippoState === 'thinking') setSippoState('normal');
      }, 900);
    });

    document.addEventListener('submit', () => {
      sippoBusyCount += 1;
      setSippoState('thinking');
    }, true);

    document.addEventListener('invalid', () => {
      setSippoState('worried');
    }, true);

    const originalFetch = window.fetch;
    if (typeof originalFetch === 'function') {
      window.fetch = async (...args) => {
        sippoBusyCount += 1;
        setSippoState('thinking');
        try {
          const response = await originalFetch(...args);
          setSippoState(response.ok ? 'happy' : 'worried');
          return response;
        } catch (error) {
          setSippoState('worried');
          throw error;
        } finally {
          sippoBusyCount = Math.max(0, sippoBusyCount - 1);
        }
      };
    }
  }

  if (mascot) {
    mascot.addEventListener('click', () => {
      setSippoState('surprised');
      if (reduceMotion || !sippoMascot) return;
      sippoMascot.classList.remove('is-pop');
      void sippoMascot.offsetWidth;
      sippoMascot.classList.add('is-pop');
      clearTimeout(sippoMascot._popTimer);
      sippoMascot._popTimer = setTimeout(() => sippoMascot.classList.remove('is-pop'), 380);
    });
  }

  if (finePointer && !reduceMotion) {
    document.querySelectorAll('.tilt').forEach((card) => {
      let raf = null;
      card.addEventListener('pointermove', (event) => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
          const rect = card.getBoundingClientRect();
          const nx = (event.clientX - rect.left) / rect.width - 0.5;
          const ny = (event.clientY - rect.top) / rect.height - 0.5;
          card.style.transform =
            `perspective(900px) rotateY(${nx * 7}deg) rotateX(${ny * -7}deg) translateY(-6px)`;
          raf = null;
        });
      });
      card.addEventListener('pointerleave', () => {
        card.style.transform = '';
        card.style.transition = 'transform .6s cubic-bezier(.22,1,.36,1), box-shadow .45s ease';
        setTimeout(() => { card.style.transition = ''; }, 600);
      });
    });
  }

  const trailLine = document.getElementById('trailLine');
  if (trailLine && !reduceMotion) {
    const len = trailLine.getTotalLength();
    trailLine.style.strokeDasharray = `${len}`;
    trailLine.style.strokeDashoffset = `${len}`;
    trailLine.style.transition = 'stroke-dashoffset 2.4s cubic-bezier(.22,1,.36,1)';
    const trailObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        trailLine.style.strokeDashoffset = '0';
        trailObserver.disconnect();
      });
    }, { threshold: 0.05 });
    trailObserver.observe(trailLine.closest('.trail'));
  }

  const fab = document.getElementById('consultFab');
  const consultSection = document.getElementById('consult');
  if (fab) {
    let fabRaf = null;
    const updateFab = () => {
      fabRaf = null;
      const pastHero = window.scrollY > window.innerHeight * 0.7;
      let inConsult = false;
      if (consultSection) {
        const rect = consultSection.getBoundingClientRect();
        inConsult = rect.top < window.innerHeight * 0.5 && rect.bottom > window.innerHeight * 0.5;
      }
      fab.classList.toggle('is-shown', pastHero && !inConsult);
    };
    window.addEventListener('scroll', () => {
      if (!fabRaf) fabRaf = requestAnimationFrame(updateFab);
    }, { passive: true });
    updateFab();
  }

  const copyBtn = document.getElementById('copyTemplate');
  if (copyBtn) {
    const original = copyBtn.textContent;
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(copyBtn.dataset.template);
        setSippoState('happy');
        copyBtn.textContent = 'コピーしました';
      } catch {
        setSippoState('worried');
        copyBtn.textContent = 'コピーできませんでした';
      }
      copyBtn.classList.add('is-copied');
      setTimeout(() => {
        copyBtn.textContent = original;
        copyBtn.classList.remove('is-copied');
      }, 2200);
    });
  }

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
})();
