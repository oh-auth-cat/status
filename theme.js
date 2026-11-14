// The footer theme control (dashboard DESIGN.md §5.11, D185). Only this
// browser keeps the choice; System removes the key so the OS decides.
(function () {
  "use strict";
  var KEY = "ohauthcat.theme";
  var root = document.documentElement;
  var inputs = document.querySelectorAll('.theme-control input[name="theme"]');

  function parse(value) {
    return value === "light" || value === "dark" ? value : "system";
  }

  function load() {
    try {
      return parse(localStorage.getItem(KEY));
    } catch (e) {
      return "system";
    }
  }

  var BAR = { light: "#f7f7fd", dark: "#0f0f1d" };

  // System keeps one tag per OS scheme; a forced theme uses its own colour.
  function applyBar(choice) {
    var tags = document.querySelectorAll('meta[name="theme-color"]');
    var schemes = ["light", "dark"];
    for (var i = 0; i < tags.length && i < 2; i++) {
      var scheme = choice === "system" ? schemes[i] : choice;
      tags[i].setAttribute("content", BAR[scheme]);
      if (choice === "system") tags[i].setAttribute("media", "(prefers-color-scheme: " + scheme + ")");
      else tags[i].removeAttribute("media");
    }
  }

  function apply(choice) {
    if (choice === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", choice);
    applyBar(choice);
    for (var i = 0; i < inputs.length; i++) inputs[i].checked = inputs[i].value === choice;
  }

  function save(choice) {
    try {
      if (choice === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, choice);
    } catch (e) {
      // Blocked storage: the choice lasts for this page only.
    }
  }

  for (var i = 0; i < inputs.length; i++) {
    inputs[i].addEventListener("change", function (event) {
      var choice = parse(event.target.value);
      save(choice);
      apply(choice);
    });
  }

  // Another tab changed the choice.
  window.addEventListener("storage", function (event) {
    if (event.key === KEY || event.key === null) apply(parse(event.newValue));
  });

  apply(load());
})();
