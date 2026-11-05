/* Landing page (overrides/home.html): the copy buttons, and the motion qdbd.dev's home page has. Headings rise word by
 * word, text and cards reveal as they scroll into view, the closing install command types itself. Does nothing off
 * the home page; with reduced motion everything shows at once. The live demo is web/demo.ts. */
(function () {
  "use strict";
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  document.querySelectorAll(".qh-copy").forEach(function (b) {
    b.addEventListener("click", function () {
      if (!navigator.clipboard) return;
      navigator.clipboard.writeText(b.dataset.copy).then(function () {
        b.classList.add("ok");
        b.setAttribute("aria-label", "Copied");
        setTimeout(function () { b.classList.remove("ok"); b.setAttribute("aria-label", "Copy the install command"); }, 1200);
      }, function () {});
    });
  });

  var root = document.querySelector(".qh");
  if (!root || reduce) return;

  /* fn(el) once el scrolls into view, or at once when it is already above the viewport. */
  function onView(el, fn) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting || e.boundingClientRect.bottom < 0) { io.unobserve(e.target); fn(e.target); } });
    }, { rootMargin: "0px 0px -12% 0px" });
    io.observe(el);
  }

  /* Each word of a heading in its own element, numbered for the stagger. <code> stays whole. */
  function splitWords(h) {
    var i = 0;
    (function walk(n) {
      [].slice.call(n.childNodes).forEach(function (c) {
        if (c.nodeType === 3) {
          var frag = document.createDocumentFragment();
          c.textContent.split(/( +|\n+)/).forEach(function (w) {
            if (!w) return;
            if (!w.trim()) { frag.appendChild(document.createTextNode(w)); return; }
            var q = document.createElement("q-w");
            q.style.setProperty("--i", i++);
            q.textContent = w;
            frag.appendChild(q);
          });
          c.replaceWith(frag);
        } else if (c.nodeType === 1 && c.tagName !== "CODE") walk(c);
      });
    })(h);
    h.classList.add("qh-words");
  }

  /* Hide first, then set the stagger, so the hiding itself isn't delayed. */
  function reveal(items, step) {
    items.forEach(function (el) { el.classList.add("qh-rv"); });
    void document.body.offsetWidth;
    items.forEach(function (el, k) {
      el.style.setProperty("--d", (step ? k * step : 0) + "s");
      onView(el, function () { el.classList.add("qh-in"); });
    });
  }

  /* Retypes an element's text with a caret. */
  function type(node, speed) {
    var full = node.textContent;
    node.style.minWidth = node.offsetWidth + "px";
    node.textContent = "";
    var caret = document.createElement("q-caret");
    node.appendChild(caret);
    var k = 0;
    (function tick() {
      if (k < full.length) {
        caret.before(full[k++]);
        setTimeout(tick, speed);
      } else setTimeout(function () { caret.remove(); }, 1600);
    })();
  }

  var h1 = root.querySelector(".qh-hero h1");
  if (h1) splitWords(h1);
  root.querySelectorAll(".qh-section > h2, .qh-final > h2").forEach(function (h) {
    splitWords(h);
    onView(h, function () { h.classList.add("qh-in"); });
  });
  reveal([].slice.call(root.querySelectorAll(".qh-section > .qh-sub, .qh-section > .qh-more, .qh-prose > p, .qh-split > div > p, .qh-split > .qh-code, .qh-section > .qh-fig, .qh-section > .qp, .qh-final > :not(h2)")));
  root.querySelectorAll(".qh-ways, .qh-reqs").forEach(function (g) { reveal([].slice.call(g.children), 0.08); });
  var code = root.querySelector(".qh-final .qh-install code");
  if (code) {
    var text = code.textContent;
    onView(code, function () { setTimeout(function () { code.textContent = text; type(code, 45); }, 400); });
  }
})();
