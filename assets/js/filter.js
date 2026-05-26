(function () {
  const input = document.getElementById("filter");
  if (!input) return;

  const main = document.querySelector("main.content");
  if (!main) return;

  // Persist filter across navigation via the URL hash.
  const initial = decodeURIComponent(location.hash.replace(/^#q=/, ""));
  if (initial) input.value = initial;

  // Each "section" is an <h2> or <h3> followed by a <ul>. Cache them once.
  const sections = [];
  for (const heading of main.querySelectorAll("h2, h3")) {
    let el = heading.nextElementSibling;
    while (el && el.tagName !== "UL" && el.tagName !== "H2" && el.tagName !== "H3") {
      el = el.nextElementSibling;
    }
    if (el && el.tagName === "UL") {
      const items = Array.from(el.querySelectorAll(":scope > li"));
      const baseLabel = heading.firstChild ? heading.firstChild.textContent.trim() : "";
      sections.push({ heading, list: el, items, baseLabel, totalCount: items.length });
    }
  }

  // Insert a "no matches" placeholder.
  const noMatches = document.createElement("p");
  noMatches.id = "no-matches";
  noMatches.textContent = "No jobs match that filter.";
  main.appendChild(noMatches);

  function apply() {
    const q = input.value.trim().toLowerCase();
    let totalShown = 0;
    for (const sec of sections) {
      let shown = 0;
      for (const li of sec.items) {
        const haystack = li.textContent.toLowerCase();
        const match = !q || haystack.includes(q);
        li.classList.toggle("is-hidden", !match);
        if (match) shown++;
      }
      totalShown += shown;
      sec.heading.classList.toggle("is-empty", shown === 0);
      // Update count label: "AI safety & policy (12 / 435)" when filtering, "(435)" when not.
      let label = sec.baseLabel;
      if (q) label += ` (${shown} / ${sec.totalCount})`;
      else label += ` (${sec.totalCount})`;
      sec.heading.textContent = label;
    }
    noMatches.classList.toggle("is-shown", totalShown === 0 && q.length > 0);

    // Persist in URL so the filter survives page refresh / share.
    if (q) {
      history.replaceState(null, "", "#q=" + encodeURIComponent(q));
    } else if (location.hash) {
      history.replaceState(null, "", location.pathname + location.search);
    }
  }

  input.addEventListener("input", apply);
  // Picks up navigation to /#q=foo while already on the index.
  window.addEventListener("hashchange", () => {
    const v = decodeURIComponent(location.hash.replace(/^#q=/, ""));
    if (v !== input.value) {
      input.value = v;
      apply();
    }
  });
  // Run once on load (initial filter from URL, plus the "()" count suffix on every heading).
  apply();
})();
