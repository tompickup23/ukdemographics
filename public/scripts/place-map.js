/* Place page map block: measure tabs and year sliders for one inline SVG that carries
   both measures as data- attributes (src/lib/map/place.ts). No library. With no script
   the map shows the first measure's latest year and both tables stay visible. */
(function () {
  function each(list, fn) { Array.prototype.forEach.call(list, fn); }

  function init(root) {
    var svg = root.querySelector("svg.ukd-map");
    var tabs = root.querySelectorAll("[role=tab]");
    if (!svg || !tabs.length) return;
    root.classList.add("pm-js");
    var years = {};

    function apply(m, y) {
      years[m] = y;
      svg.setAttribute("data-m", m);
      var h = svg.getAttribute("data-" + m + "-h");
      if (h) svg.setAttribute("viewBox", "0 0 600 " + h);
      each(svg.querySelectorAll("g[data-measure]"), function (g) {
        if (g.getAttribute("data-measure") === m) g.removeAttribute("display");
        else g.setAttribute("display", "none");
      });
      var f = "data-" + m + "-f-" + y, t = "data-" + m + "-t-" + y, a = "data-" + m + "-a-" + y;
      each(svg.querySelectorAll("[" + f + "]"), function (el) { el.setAttribute("fill", el.getAttribute(f)); });
      each(svg.querySelectorAll("[" + t + "]"), function (el) { el.textContent = el.getAttribute(t); });
      each(svg.querySelectorAll("[" + a + "]"), function (el) { el.textContent = el.getAttribute(a); });
      each(svg.querySelectorAll('g[data-measure="' + m + '"] g[data-years]'), function (g) {
        if ((" " + g.getAttribute("data-years") + " ").indexOf(" " + y + " ") >= 0) g.removeAttribute("display");
        else g.setAttribute("display", "none");
      });
      svg.setAttribute("data-" + m + "-year", y);
    }

    function select(tab, focus) {
      var m = tab.getAttribute("data-m");
      each(tabs, function (t) {
        var on = t === tab;
        t.setAttribute("aria-selected", on ? "true" : "false");
        t.tabIndex = on ? 0 : -1;
      });
      each(root.querySelectorAll("[role=tabpanel]"), function (p) {
        p.hidden = p.getAttribute("data-m") !== m;
      });
      root.setAttribute("data-m", m);
      if (focus) tab.focus();
      apply(m, years[m] || svg.getAttribute("data-" + m + "-year"));
    }

    each(tabs, function (tab, i) {
      tab.addEventListener("click", function () { select(tab, false); });
      tab.addEventListener("keydown", function (e) {
        var n = tabs.length, j = null;
        if (e.key === "ArrowRight") j = (i + 1) % n;
        else if (e.key === "ArrowLeft") j = (i + n - 1) % n;
        else if (e.key === "Home") j = 0;
        else if (e.key === "End") j = n - 1;
        if (j === null) return;
        e.preventDefault();
        select(tabs[j], true);
      });
    });

    each(root.querySelectorAll("input[type=range][data-m]"), function (input) {
      var m = input.getAttribute("data-m");
      var ys = input.getAttribute("data-years").split(" ");
      var labels = input.getAttribute("data-labels").split("|");
      var out = root.querySelector('output[data-m="' + m + '"]');
      function update() {
        var i = Number(input.value);
        input.setAttribute("aria-valuetext", labels[i]);
        if (out) out.textContent = labels[i];
        apply(m, ys[i]);
      }
      input.addEventListener("input", update);
      years[m] = ys[Number(input.value)];
    });

    select(tabs[0], false);
  }

  each(document.querySelectorAll("[data-place-map]"), init);
})();
