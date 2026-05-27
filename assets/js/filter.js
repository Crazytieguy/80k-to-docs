(function () {
  const input = document.getElementById("filter");
  const main = document.querySelector("main.content");
  if (!main) return;

  const chipsContainer = main.querySelector(".areas-filter");

  // Selected areas state — empty Set means "all areas visible".
  const selected = new Set();

  // Cache (heading, list, items, baseLabel) for each `### Area` section so the JS doesn't have
  // to re-walk the DOM on every keystroke.
  const sections = [];
  for (const heading of main.querySelectorAll("h3")) {
    let el = heading.nextElementSibling;
    while (el && el.tagName !== "UL" && el.tagName !== "H2" && el.tagName !== "H3") {
      el = el.nextElementSibling;
    }
    if (el && el.tagName === "UL") {
      const items = Array.from(el.querySelectorAll(":scope > li"));
      const baseLabel = heading.textContent.trim();
      sections.push({ heading, list: el, items, baseLabel, totalCount: items.length });
    }
  }

  // "No matches" message — appended once, toggled via class.
  const noMatches = document.createElement("p");
  noMatches.id = "no-matches";
  noMatches.textContent = "No jobs match the current filters.";
  main.appendChild(noMatches);

  function apply() {
    const q = input ? input.value.trim().toLowerCase() : "";
    const areaActive = selected.size > 0;
    let totalShown = 0;

    for (const sec of sections) {
      const inArea = !areaActive || selected.has(sec.baseLabel);
      let shown = 0;
      for (const li of sec.items) {
        if (!inArea) {
          li.classList.add("is-hidden");
          continue;
        }
        const haystack = li.textContent.toLowerCase();
        const match = !q || haystack.includes(q);
        li.classList.toggle("is-hidden", !match);
        if (match) shown++;
      }
      totalShown += shown;
      sec.heading.classList.toggle("is-empty", !inArea || shown === 0);
      const suffix =
        q || areaActive ? ` (${shown} / ${sec.totalCount})` : ` (${sec.totalCount})`;
      sec.heading.textContent = sec.baseLabel + suffix;
    }
    noMatches.classList.toggle(
      "is-shown",
      totalShown === 0 && (q.length > 0 || areaActive),
    );

    if (chipsContainer) {
      for (const chip of chipsContainer.querySelectorAll(".chip")) {
        const area = chip.dataset.area;
        if (area === "all") {
          chip.classList.toggle("is-active", !areaActive);
        } else {
          chip.classList.toggle("is-active", selected.has(area));
        }
      }
    }

    persistHash(q, Array.from(selected));
  }

  function persistHash(q, areas) {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (areas.length) p.set("areas", areas.join("|"));
    const str = p.toString();
    history.replaceState(null, "", str ? "#" + str : location.pathname + location.search);
  }

  function readHash() {
    const p = new URLSearchParams(location.hash.replace(/^#/, ""));
    const q = p.get("q") ?? "";
    const areas = (p.get("areas") || "").split("|").filter(Boolean);
    if (input) input.value = q;
    selected.clear();
    for (const a of areas) selected.add(a);
    apply();
  }

  if (input) input.addEventListener("input", apply);

  if (chipsContainer) {
    chipsContainer.addEventListener("click", (e) => {
      const chip = e.target.closest(".chip");
      if (!chip) return;
      const area = chip.dataset.area;
      if (area === "all") {
        selected.clear();
      } else if (selected.has(area)) {
        selected.delete(area);
      } else {
        selected.add(area);
      }
      apply();
    });
  }

  window.addEventListener("hashchange", readHash);
  readHash();
})();
