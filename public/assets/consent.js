(function () {
  'use strict';
  var PIXEL_ID = '1082304004580005';
  var KEY = 'cu_consent';
  var VERSION = 1;
  var MAX_AGE = 183 * 24 * 60 * 60 * 1000; // about 6 months
  var pixelLoaded = false;

  function readChoice() {
    try {
      var raw = window.localStorage.getItem(KEY);
      if (!raw) return null;
      var c = JSON.parse(raw);
      if (!c || typeof c.marketing !== 'boolean' || c.version !== VERSION) return null;
      if (typeof c.ts !== 'number' || Date.now() - c.ts > MAX_AGE) return null;
      return c;
    } catch (e) { return null; }
  }

  function writeChoice(marketing) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ marketing: marketing, version: VERSION, ts: Date.now() }));
      return true;
    } catch (e) { return false; }
  }

  function hasConsent() {
    var c = readChoice();
    return !!(c && c.marketing === true);
  }

  function loadPixel() {
    if (pixelLoaded) return;
    pixelLoaded = true;
    /* Standard Meta Pixel base code (no noscript image). Runs only after consent. */
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
      t = b.createElement(e); t.async = !0; t.src = v;
      s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    // Pages that show personal results (the /tools pages) set window.cuPixelNoAutoConfig
    // before this script. Then the pixel does not send automatic button-click events or
    // text it reads from the page; only the events the page sends on purpose.
    if (window.cuPixelNoAutoConfig === true) window.fbq('set', 'autoConfig', false, PIXEL_ID);
    window.fbq('init', PIXEL_ID);
    window.fbq('track', 'PageView');
  }

  function deleteCookie(name) {
    var past = 'Thu, 01 Jan 1970 00:00:00 GMT';
    var host = window.location.hostname;
    var domains = ['', host, '.' + host, '.cosmicuniversum.com'];
    for (var i = 0; i < domains.length; i++) {
      document.cookie = name + '=; expires=' + past + '; path=/' + (domains[i] ? '; domain=' + domains[i] : '');
    }
  }

  function dropPixelCookies() {
    deleteCookie('_fbp');
    deleteCookie('_fbc');
  }

  var banner = null;
  var lastFocus = null;

  function closeBanner() {
    if (banner && banner.parentNode) banner.parentNode.removeChild(banner);
    banner = null;
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} }
    lastFocus = null;
  }

  function choose(accept) {
    var wasOn = hasConsent();
    writeChoice(accept);
    if (accept) {
      if (hasConsent()) loadPixel(); // only if storage really worked
      closeBanner();
    } else {
      if (wasOn || pixelLoaded || window.fbq) {
        if (window.fbq) { try { window.fbq('consent', 'revoke'); } catch (e) {} }
        dropPixelCookies();
        window.location.reload();
        return;
      }
      dropPixelCookies();
      closeBanner();
    }
  }

  function showBanner() {
    if (banner) return;
    lastFocus = document.activeElement;
    banner = document.createElement('div');
    banner.className = 'cu-consent';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Cookie consent');
    banner.innerHTML =
      '<p class="cu-consent-text">We’d like to use the Meta Pixel to measure our ads and show them to people who may be interested. It only runs if you accept. <a href="/privacy">Privacy policy</a></p>' +
      '<div class="cu-consent-buttons">' +
      '<button type="button" class="cu-consent-btn" data-cu="accept">Accept</button>' +
      '<button type="button" class="cu-consent-btn" data-cu="reject">Reject</button>' +
      '</div>';
    banner.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t || !t.getAttribute) return;
      var a = t.getAttribute('data-cu');
      if (a === 'accept') choose(true);
      else if (a === 'reject') choose(false);
    });
    document.body.insertBefore(banner, document.body.firstChild);
    var first = banner.querySelector('button');
    if (first && lastFocus && lastFocus !== document.body) first.focus();
  }

  window.cuHasMarketingConsent = hasConsent;

  window.cuTrack = function (eventName, params, isCustom) {
    if (!hasConsent() || typeof window.fbq !== 'function') return;
    try {
      if (isCustom) window.fbq('trackCustom', eventName, params || {});
      else window.fbq('track', eventName, params || {});
    } catch (e) {}
  };

  document.addEventListener('click', function (ev) {
    var el = ev.target;
    while (el && el !== document) {
      if (el.getAttribute && el.hasAttribute('data-cu-cookie-settings')) { ev.preventDefault(); showBanner(); return; }
      el = el.parentNode;
    }
  });

  function init() {
    var c = readChoice();
    if (c && c.marketing) loadPixel();
    else if (!c) showBanner();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
