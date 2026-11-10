/*
 * Age pyramid controls (src/components/AgePyramid.astro, src/lib/age-pyramid.ts).
 *
 * The page already holds the latest year's picture, figures and table. This script
 * shows the controls and redraws the same marks for another year, as people or as a
 * share of the population, with another year or England and Wales as an outline.
 * Every value comes from the JSON block in the page, which is ONS table MYEB1 as
 * published: nothing is interpolated between years.
 */
(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";
  var fmt = function (n) { return Math.round(n).toLocaleString("en-GB"); };
  var sum = function (row) { var t = 0; for (var i = 0; i < row.length; i++) t += row[i]; return t; };

  /* Kept in step with medianAge in src/lib/age-pyramid.ts. */
  function medianOf(persons) {
    var half = sum(persons) / 2, run = 0;
    for (var age = 0; age < persons.length; age++) {
      if (persons[age] > 0 && run + persons[age] >= half) return age + (half - run) / persons[age];
      run += persons[age];
    }
    return NaN;
  }

  function init(root) {
    var holder = root.querySelector('[data-ap="data"]');
    var svg = root.querySelector("svg.ap-svg");
    if (!holder || !svg) return;
    var d;
    try { d = JSON.parse(holder.textContent); } catch (e) { return; }
    var G = d.geometry, OPEN = d.openAge, AGES = OPEN + 1;
    var years = d.years, base = years[0], last = years.length - 1;
    var q = function (name) { return root.querySelector('[data-ap="' + name + '"]'); };
    var leftEdge = G.centre - G.gutter / 2, rightEdge = G.centre + G.gutter / 2;
    var r1 = function (v) { return Math.round(v * 10) / 10; };
    var rowY = function (age) { return age === OPEN ? G.top : G.top + G.rowHeight + G.openGap + (OPEN - 1 - age) * G.rowHeight; };

    var bars = { M: [], F: [] };
    svg.querySelectorAll("[data-ap-bar]").forEach(function (el) {
      bars[el.getAttribute("data-ap-bar")][Number(el.getAttribute("data-age"))] = el;
    });

    var state = { yi: last, measure: "people", ci: 0, ew: false, age: 30, reading: false };
    var ewData = null, ewLoading = false, timer = null;
    var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function persons(src, yi) { return src.M[yi].map(function (v, a) { return v + src.F[yi][a]; }); }
    function total(src, yi) { return sum(src.M[yi]) + sum(src.F[yi]); }
    /* The values one side draws: people, or each cell as a percentage of all residents that year. */
    function side(src, sex, yi) {
      if (state.measure === "people") return src[sex][yi];
      var t = total(src, yi);
      return src[sex][yi].map(function (v) { return (v / t) * 100; });
    }
    function tick(v) { return state.measure === "share" ? Number(v.toFixed(2)) + "%" : fmt(v); }

    function outline(values, max, dir) {
      var edge = dir < 0 ? leftEdge : rightEdge, path = "";
      for (var age = 0; age < OPEN; age++) {
        var x = r1(edge + dir * (values[age] / max) * G.side);
        path += (age === 0 ? "M" : "L") + x + " " + r1(rowY(age) + G.rowHeight) + "L" + x + " " + r1(rowY(age));
      }
      var xo = r1(edge + dir * (values[OPEN] / max) * G.side);
      return path + "M" + xo + " " + r1(rowY(OPEN) + G.rowHeight) + "L" + xo + " " + r1(rowY(OPEN));
    }

    function el(name, attrs, text) {
      var node = document.createElementNS(NS, name);
      for (var k in attrs) node.setAttribute(k, attrs[k]);
      if (text !== undefined) node.textContent = text;
      return node;
    }

    function drawGrid(scale) {
      var g = q("grid");
      while (g.firstChild) g.removeChild(g.firstChild);
      for (var t = 0; t <= scale.max + 1e-9; t += scale.step) {
        [-1, 1].forEach(function (dir) {
          var x = r1((dir < 0 ? leftEdge : rightEdge) + dir * (t / scale.max) * G.side);
          g.appendChild(el("line", { "class": "ap-grid", x1: x, x2: x, y1: G.top, y2: d.plotBottom, stroke: "#dbdfe3", "stroke-width": 0.6 }));
          g.appendChild(el("text", { "class": "ap-t ap-tick", x: x, y: d.plotBottom + 12, "font-size": 10.5, "text-anchor": "middle", fill: "#545c63" }, tick(t)));
        });
      }
    }

    function words(now, then, more, fewer) {
      var diff = now - then;
      if (diff === 0) return "no change";
      return fmt(Math.abs(diff)) + " " + (diff > 0 ? more : fewer);
    }

    function setText(name, text) { var node = q(name); if (node) node.textContent = text; }

    function readAge() {
      var y = years[state.yi], a = state.age;
      var label = a === OPEN ? "Aged 90 and over" : "Age " + a;
      var m = d.M[state.yi][a], f = d.F[state.yi][a];
      var text = label + " at mid-" + y + ": " + fmt(m) + " males, " + fmt(f) + " females";
      if (state.measure === "share") {
        var t = total(d, state.yi);
        text += " (" + ((m / t) * 100).toFixed(2) + "% and " + ((f / t) * 100).toFixed(2) + "% of residents)";
      }
      setText("age-out", text);
      var input = q("age");
      if (input) input.setAttribute("aria-valuetext", text);
      var cursor = q("cursor");
      /* The marker shows only once the reader has chosen an age. */
      if (cursor && state.reading) { cursor.setAttribute("y", r1(rowY(a))); cursor.removeAttribute("display"); }
    }

    var drawnMeasure = null;
    function draw() {
      var yi = state.yi, y = years[yi];
      var scale = d.scales[state.measure];
      var hasCompare = state.ci >= 0 && state.ci !== yi;
      var w = function (v) { return r1((v / scale.max) * G.side); };
      var m = side(d, "M", yi), f = side(d, "F", yi);
      for (var age = 0; age < AGES; age++) {
        bars.M[age].setAttribute("x", r1(leftEdge - w(m[age])));
        bars.M[age].setAttribute("width", w(m[age]));
        bars.F[age].setAttribute("width", w(f[age]));
      }
      if (drawnMeasure !== state.measure) { drawGrid(scale); drawnMeasure = state.measure; }

      q("outline-M").setAttribute("d", hasCompare ? outline(side(d, "M", state.ci), scale.max, -1) : "");
      q("outline-F").setAttribute("d", hasCompare ? outline(side(d, "F", state.ci), scale.max, 1) : "");
      var showEw = state.ew && state.measure === "share" && ewData;
      q("ew-M").setAttribute("d", showEw ? outline(side(ewData, "M", yi), scale.max, -1) : "");
      q("ew-F").setAttribute("d", showEw ? outline(side(ewData, "F", yi), scale.max, 1) : "");

      var pop = total(d, yi), people = persons(d, yi), med = medianOf(people);
      var shareWord = state.measure === "share" ? "share of " : "";
      setText("head", d.name + ", mid-" + y);
      setText("sub-now", "Bars: mid-" + y + ", " + shareWord + fmt(pop) + " residents");
      var thenGroup = q("sub-then-group");
      if (hasCompare) {
        thenGroup.removeAttribute("display");
        setText("sub-then", "Outline: mid-" + years[state.ci] + ", " + shareWord + fmt(total(d, state.ci)) + " residents");
      } else thenGroup.setAttribute("display", "none");
      var ewGroup = q("sub-ew-group");
      if (showEw) {
        ewGroup.removeAttribute("display");
        setText("sub-ew", "Dashed: England and Wales, mid-" + y + ", share of residents");
      } else ewGroup.setAttribute("display", "none");
      setText("axis-label", state.measure === "share"
        ? "Share of all residents at each single year of age (90+ is 90 and over)"
        : "People at each single year of age (90+ is 90 and over)");
      setText("svg-title", d.name + ": population by single year of age and sex, mid-" + y + (hasCompare ? " against mid-" + years[state.ci] : ""));
      setText("svg-desc", "Back-to-back bars, males on the left and females on the right, with age rising upwards from 0. Mid-" + y + ": " + fmt(pop) + " residents, median age " + med.toFixed(1) + ". Source: ONS population estimates, detailed time series, table MYEB1.");

      /* Figures panel. The comparison follows the outline; with none chosen it is the first year. */
      var ri = hasCompare ? state.ci : (yi === 0 ? -1 : 0);
      var than = ri >= 0 ? " than mid-" + years[ri] : "";
      setText("r-heading", "Mid-" + y + " in figures");
      setText("r-pop", fmt(pop));
      setText("r-median", med.toFixed(1));
      var bands = { "0-17": [0, 17], "18-64": [18, 64], "65+": [65, OPEN] };
      var range = function (list, from, to) { var t = 0; for (var a = from; a <= to; a++) t += list[a]; return t; };
      var thenPeople = ri >= 0 ? persons(d, ri) : null;
      setText("r-pop-d", ri >= 0 ? words(pop, total(d, ri), "more", "fewer") + than : "the first year in the series");
      if (ri >= 0) {
        var md = Number(med.toFixed(1)) - Number(medianOf(thenPeople).toFixed(1));
        setText("r-median-d", md === 0 ? "the same as mid-" + years[ri] : Math.abs(md).toFixed(1) + " years " + (md > 0 ? "higher" : "lower") + than);
      } else setText("r-median-d", "the first year in the series");
      Object.keys(bands).forEach(function (key) {
        var v = range(people, bands[key][0], bands[key][1]);
        setText("r-band-" + key, fmt(v));
        setText("r-share-" + key, ((v / pop) * 100).toFixed(1) + "% of residents");
        setText("r-band-d-" + key, ri >= 0 ? words(v, range(thenPeople, bands[key][0], bands[key][1]), "more", "fewer") + than : "the first year in the series");
      });

      /* Table. */
      var body = q("t-body");
      if (body) {
        var rows = "";
        for (var a2 = 0; a2 < AGES; a2++) {
          rows += '<tr><th scope="row">' + (a2 === OPEN ? "90 and over" : a2) + "</th><td>" + fmt(d.M[yi][a2]) + "</td><td>" + fmt(d.F[yi][a2]) + "</td><td>" + fmt(people[a2]) + "</td></tr>";
        }
        body.innerHTML = rows;
      }
      setText("t-year", "mid-" + y);
      setText("t-caption-year", "mid-" + y);

      var yearInput = q("year");
      yearInput.value = y;
      yearInput.setAttribute("aria-valuetext", "Mid-" + y + ", ONS estimate");
      setText("year-out", "Mid-" + y);
      readAge();
    }

    function stop() {
      if (timer) { clearInterval(timer); timer = null; }
      var play = q("play");
      play.textContent = "Play";
      play.setAttribute("aria-pressed", "false");
    }

    q("year").addEventListener("input", function (e) {
      stop();
      state.yi = years.indexOf(Number(e.target.value));
      draw();
    });

    q("play").addEventListener("click", function () {
      if (timer) { stop(); return; }
      if (state.yi === last) state.yi = 0; else state.yi += 1;
      draw();
      var play = q("play");
      play.textContent = "Pause";
      play.setAttribute("aria-pressed", "true");
      timer = setInterval(function () {
        if (state.yi >= last) { stop(); return; }
        state.yi += 1;
        draw();
        if (state.yi >= last) stop();
      }, reduced ? 1400 : 900);
    });

    root.querySelectorAll('[data-ap="measure"]').forEach(function (input) {
      input.addEventListener("change", function () {
        if (!input.checked) return;
        state.measure = input.value;
        var wrap = q("ew-wrap");
        if (wrap && d.englandAndWalesUrl) wrap.hidden = state.measure !== "share";
        draw();
      });
    });

    q("compare").addEventListener("change", function (e) {
      state.ci = e.target.value === "" ? -1 : years.indexOf(Number(e.target.value));
      draw();
    });

    var ewInput = q("ew");
    if (ewInput && d.englandAndWalesUrl) {
      ewInput.addEventListener("change", function () {
        state.ew = ewInput.checked;
        if (state.ew && !ewData && !ewLoading) {
          ewLoading = true;
          fetch(d.englandAndWalesUrl)
            .then(function (res) { if (!res.ok) throw new Error(String(res.status)); return res.json(); })
            .then(function (json) { ewData = json; draw(); })
            .catch(function () { ewInput.checked = false; state.ew = false; })
            .then(function () { ewLoading = false; });
        } else draw();
      });
    }

    q("age").addEventListener("input", function (e) { state.age = Number(e.target.value); state.reading = true; readAge(); });

    /* Pointing at a row reads that age; the slider does the same from the keyboard. */
    function ageAt(clientY) {
      var box = svg.getBoundingClientRect();
      var y = ((clientY - box.top) / box.height) * G.height;
      if (y < G.top || y > d.plotBottom) return null;
      if (y < G.top + G.rowHeight + G.openGap / 2) return OPEN;
      var age = OPEN - 1 - Math.floor((y - (G.top + G.rowHeight + G.openGap)) / G.rowHeight);
      return Math.max(0, Math.min(OPEN - 1, age));
    }
    function point(e) {
      var age = ageAt(e.clientY);
      if (age === null) return;
      state.age = age;
      state.reading = true;
      q("age").value = age;
      readAge();
    }
    svg.addEventListener("pointermove", point);
    svg.addEventListener("pointerdown", point);

    root.classList.add("ap-js");
    draw();
  }

  function start() { document.querySelectorAll("[data-age-pyramid]").forEach(init); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
