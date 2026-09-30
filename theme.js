/* Sets the theme before the page paints (loaded in <head>) and wires the toggle. */
(function () {
  var KEY = "vixenweb-theme";
  var root = document.documentElement;

  var theme = "dark"; // dark is the default look
  try {
    var saved = localStorage.getItem(KEY);
    if (saved === "light" || saved === "dark") theme = saved;
  } catch (e) {}
  root.dataset.theme = theme;

  document.addEventListener("DOMContentLoaded", function () {
    var btn = document.getElementById("theme-toggle");
    if (!btn) return;

    function label() {
      btn.setAttribute(
        "aria-label",
        root.dataset.theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
      );
    }
    label();

    btn.addEventListener("click", function () {
      var next = root.dataset.theme === "dark" ? "light" : "dark";
      root.dataset.theme = next;
      try { localStorage.setItem(KEY, next); } catch (e) {}
      label();
      window.dispatchEvent(new Event("themechange"));
    });
  });
})();