/* Copy buttons on the landing page (overrides/home.html). */
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
