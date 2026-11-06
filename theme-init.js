// Applies the visitor's theme choice before first paint (dashboard DESIGN.md
// §5.11): localStorage "ohauthcat.theme" is "light" or "dark"; anything else,
// or storage that throws, means System and leaves the OS setting in charge.
/* global localStorage, document */
(function () {
  try {
    var value = localStorage.getItem("ohauthcat.theme");
    if (value === "light" || value === "dark") {
      document.documentElement.setAttribute("data-theme", value);
      // A forced theme gets one browser-bar colour instead of the two
      // OS-qualified tags.
      var tags = document.querySelectorAll('meta[name="theme-color"]');
      for (var i = 0; i < tags.length; i++) {
        tags[i].setAttribute("content", value === "dark" ? "#0f0f1d" : "#f7f7fd");
        tags[i].removeAttribute("media");
      }
    }
  } catch {
    // Blocked storage means System.
  }
})();
