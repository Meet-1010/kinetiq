/*
 * Kinetiq customizer runtime — injected as the first script of every published demo page
 * (scripts/inject-customizer.mjs). It lets the Customize panel on the Kinetiq site restyle a
 * running demo without touching or exposing its source:
 *   colors (the demo's own CSS custom properties + page background/text), font, inline text
 *   editing, image swapping, and global animation speed.
 *
 * Only messages from the parent window on an allowed origin are accepted. At speed 1x the
 * page clock is the real clock, so the demo behaves exactly as built until someone customizes.
 */
(function () {
  if (window.__kq) return;
  var PARENTS = /*__KQ_PARENTS__*/ [];
  var kq = (window.__kq = { rate: 1 });

  // ---- animation speed: one virtual clock behind performance.now, Date.now and rAF timestamps.
  // GSAP ticks on Date.now, three.js/Lenis on performance.now / rAF, so all of them follow it.
  var perf = window.performance;
  var realPerf = perf && perf.now ? perf.now.bind(perf) : function () { return Date.now(); };
  var realDate = Date.now;
  var base = realPerf();
  var virt = base;
  function now() { return virt + (realPerf() - base) * kq.rate; }
  try { if (perf && perf.now) perf.now = now; } catch (e) {}
  Date.now = function () { return realDate() + Math.round(now() - realPerf()); };
  var raf = window.requestAnimationFrame;
  if (raf) {
    window.requestAnimationFrame = function (cb) {
      return raf.call(window, function () { cb(now()); });
    };
  }
  var animTimer = null;
  function syncAnimations() {
    if (!document.getAnimations) return;
    var list = document.getAnimations();
    for (var i = 0; i < list.length; i++) if (list[i].playbackRate !== kq.rate) list[i].playbackRate = kq.rate;
  }
  function setRate(r) {
    r = Math.max(0, Math.min(4, Number(r) || 0));
    if (r === kq.rate) return;
    virt = now();
    base = realPerf();
    kq.rate = r;
    syncAnimations();
    // CSS/WAAPI animations created later need the rate too.
    if (r !== 1 && !animTimer) animTimer = setInterval(syncAnimations, 400);
    if (r === 1 && animTimer) { clearInterval(animTimer); animTimer = null; }
  }

  // ---- messaging
  var parentOrigin = null;
  function post(type, data) {
    if (!parentOrigin) return;
    var m = data || {};
    m.kq = 1;
    m.type = type;
    window.parent.postMessage(m, parentOrigin);
  }

  function styleTag(id) {
    var el = document.getElementById(id);
    if (!el) {
      el = document.createElement("style");
      el.id = id;
      (document.head || document.documentElement).appendChild(el);
    }
    return el;
  }

  var probe = null;
  function isColor(v) {
    if (!v || /var\(|url\(|gradient/.test(v)) return false;
    probe = probe || document.createElement("i");
    probe.style.color = "";
    probe.style.color = v;
    return probe.style.color !== "";
  }

  function countBackgroundImages() {
    var n = 0;
    var els = document.body ? document.body.getElementsByTagName("*") : [];
    for (var i = 0; i < els.length && i < 1500; i++) if (/url\(/.test(getComputedStyle(els[i]).backgroundImage)) n++;
    return n;
  }

  function capabilities() {
    var names = {};
    var root = getComputedStyle(document.documentElement);
    for (var s = 0; s < document.styleSheets.length; s++) {
      var rules;
      try { rules = document.styleSheets[s].cssRules; } catch (e) { continue; }
      if (!rules) continue;
      for (var r = 0; r < rules.length; r++) {
        var rule = rules[r];
        if (!rule.style || !/(^|,)\s*(:root|html|body)\s*($|,)/.test(rule.selectorText || "")) continue;
        for (var p = 0; p < rule.style.length; p++) {
          var name = rule.style[p];
          if (name.indexOf("--") !== 0 || names[name]) continue;
          var value = root.getPropertyValue(name).trim();
          if (isColor(value)) names[name] = value;
        }
      }
    }
    var vars = [];
    for (var k in names) if (vars.length < 16) vars.push({ name: k, value: names[k] });
    var body = document.body ? getComputedStyle(document.body) : null;
    return {
      vars: vars,
      background: body ? body.backgroundColor : "",
      text: body ? body.color : "",
      images: document.images.length,
      bgImages: countBackgroundImages(),
      canvas: !!document.querySelector("canvas"),
    };
  }

  // ---- text editing
  var originals = new Map();
  var textObserver = null;
  function setEditing(on) {
    document.designMode = on ? "on" : "off";
    if (on && !textObserver) {
      textObserver = new MutationObserver(function (records) {
        records.forEach(function (rec) {
          if (rec.type === "characterData" && !originals.has(rec.target)) originals.set(rec.target, rec.oldValue);
        });
      });
      textObserver.observe(document.body, { characterData: true, characterDataOldValue: true, subtree: true });
    }
    if (!on) reportText();
  }
  function reportText() {
    var changes = [];
    originals.forEach(function (before, node) {
      var after = node.nodeValue;
      if (before !== after && changes.length < 50) changes.push({ before: (before || "").trim().slice(0, 140), after: (after || "").trim().slice(0, 140) });
    });
    post("text-changes", { changes: changes });
  }

  // ---- image swapping
  var picking = false;
  var nextKey = 1;
  function imageTarget(el) {
    for (var i = 0; el && i < 4; i++, el = el.parentElement) {
      if (el.tagName === "IMG") return el;
      if (el.nodeType === 1 && /url\(/.test(getComputedStyle(el).backgroundImage)) return el;
    }
    return null;
  }
  function onPick(e) {
    var el = imageTarget(e.target);
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    if (!el.getAttribute("data-kq-img")) el.setAttribute("data-kq-img", String(nextKey++));
    var box = el.getBoundingClientRect();
    post("image-picked", { key: el.getAttribute("data-kq-img"), width: Math.round(box.width), height: Math.round(box.height) });
  }
  function setPicking(on) {
    picking = on;
    styleTag("kq-pick").textContent = on ? "img,[data-kq-img]{cursor:copy!important}img:hover{outline:2px solid #ff6b35!important;outline-offset:-2px}" : "";
    document[on ? "addEventListener" : "removeEventListener"]("click", onPick, true);
  }
  function setImage(key, src) {
    if (!/^data:image\/(png|jpe?g|webp|gif|avif|svg\+xml);base64,/.test(src)) return;
    var el = document.querySelector('[data-kq-img="' + String(key).replace(/[^0-9]/g, "") + '"]');
    if (!el) return;
    if (el.tagName === "IMG") {
      var pic = el.parentElement && el.parentElement.tagName === "PICTURE" ? el.parentElement : null;
      if (pic) pic.querySelectorAll("source").forEach(function (s) { s.remove(); });
      el.removeAttribute("srcset");
      el.removeAttribute("sizes");
      el.src = src;
    } else el.style.backgroundImage = 'url("' + src + '")';
  }

  // ---- styles
  function apply(state) {
    var rootStyle = document.documentElement.style;
    var vars = state.vars || {};
    for (var name in vars) if (/^--[\w-]+$/.test(name) && isColor(vars[name])) rootStyle.setProperty(name, vars[name]);
    var css = "";
    if (state.background && isColor(state.background)) css += "html,body{background-color:" + state.background + "!important}";
    if (state.text && isColor(state.text)) css += "body{color:" + state.text + "!important}";
    styleTag("kq-base").textContent = css;

    var font = state.font;
    var link = document.getElementById("kq-font-link");
    if (font && /^https:\/\/fonts\.googleapis\.com\/css2\?/.test(font.href || "") && /^[\w ]{2,40}$/.test(font.family || "")) {
      if (!link) {
        link = document.createElement("link");
        link.id = "kq-font-link";
        link.rel = "stylesheet";
        (document.head || document.documentElement).appendChild(link);
      }
      if (link.href !== font.href) link.href = font.href;
      var family = '"' + font.family + '",sans-serif';
      styleTag("kq-font").textContent =
        font.scope === "all"
          ? "body,body *:not(code):not(pre):not(i[class*=icon]){font-family:" + family + "!important}"
          : "h1,h2,h3,h4,h5,h6,[class*=title],[class*=heading],[class*=headline]{font-family:" + family + "!important}";
    } else styleTag("kq-font").textContent = "";

    if (state.rate !== undefined) setRate(state.rate);
  }

  window.addEventListener("message", function (e) {
    if (e.source !== window.parent || window.parent === window) return;
    if (PARENTS.length && PARENTS.indexOf(e.origin) < 0) return;
    var m = e.data;
    if (!m || m.kq !== 1) return;
    parentOrigin = e.origin;
    switch (m.type) {
      case "hello":
        post("ready", capabilities());
        break;
      case "apply":
        apply(m.state || {});
        break;
      case "edit-text":
        setEditing(!!m.on);
        break;
      case "pick-images":
        setPicking(!!m.on);
        break;
      case "set-image":
        setImage(m.key, m.src || "");
        break;
    }
  });
})();
