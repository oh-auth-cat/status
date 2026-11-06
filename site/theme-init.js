// Applies the visitor's theme choice before first paint (dashboard DESIGN.md
// §5.11): localStorage "ohauthcat.theme" is "light" or "dark"; anything else,
// or storage that throws, means System and leaves the OS setting in charge.
/* global localStorage, document */
(function () {
  try {
    var value = localStorage.getItem("ohauthcat.theme");
    if (value === "light" || value === "dark") {
      document.documentElement.setAttribute("data-theme", value);
    }
  } catch {
    // Blocked storage means System.
  }
})();
