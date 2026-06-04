(function () {
  "use strict";

  const ANALYTICS_KEY = "paginationqa_analytics_events";
  const INTENT_KEY = "paginationqa_purchase_intents";
  const GITHUB_ISSUE_URL = "https://github.com/ert93333-ops/pagination-qa-briefs/issues/new";

  const SAMPLE_HTML = [
    '<nav class="pagination" aria-label="Pagination">',
    '  <a href="/blog?page=1">1</a>',
    "  <span>2</span>",
    "  <button>Next</button>",
    "</nav>",
    '<button class="load-more">Load more</button>',
    '<a href="#page-3">Next page</a>',
    '<a href="/products?page=2"></a>',
    '<a href="/docs?page=3">More</a>',
  ].join("\n");

  const SAMPLE_URLS = [
    "https://example.com/blog?page=1",
    "https://example.com/blog?page=2",
    "https://example.com/blog#page-3",
    "https://example.com/products?page=2",
    "https://example.com/docs?page=3",
  ].join("\n");

  const SAMPLE_META_ROWS = [
    "https://example.com/blog?page=2 | canonical=https://example.com/blog | meta=index,follow",
    "https://example.com/products?page=2 | canonical=https://example.com/products?page=2 | meta=noindex,follow",
    "https://example.com/docs?page=3 | canonical=https://example.com/docs?page=3 | meta=index,follow",
  ].join("\n");

  const SAMPLE_UX_NOTES = [
    "Load more button appends products without changing URL.",
    "Infinite scroll uses #page-3 fragments.",
    "Sitemap only includes page 1.",
  ].join("\n");

  const SAMPLE_SITEMAP = [
    "https://example.com/blog?page=1",
    "https://example.com/products",
    "https://example.com/docs?page=3",
  ].join("\n");

  const GENERIC_ANCHORS = ["", "more", "read more", "click here", "view", "details", "load more"];

  const state = {
    latestBrief: null,
    latestBriefText: "",
    lastRemoteBody: "",
    signupStarted: false,
    pricingTracked: false,
  };

  function qs(selector, root) {
    return (root || document).querySelector(selector);
  }

  function qsa(selector, root) {
    return Array.from((root || document).querySelectorAll(selector));
  }

  function setText(selector, value) {
    const element = qs(selector);
    if (element) element.textContent = value;
  }

  function readArray(key) {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    } catch (error) {
      return [];
    }
  }

  function writeArray(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      // Local storage can be unavailable in privacy modes. The workflow still works.
    }
  }

  function getUtm() {
    const params = new URLSearchParams(window.location.search);
    return {
      utm_source: params.get("utm_source") || "",
      utm_medium: params.get("utm_medium") || "",
      utm_campaign: params.get("utm_campaign") || "",
      utm_content: params.get("utm_content") || "",
    };
  }

  function track(eventName, detail) {
    const events = readArray(ANALYTICS_KEY);
    events.push({
      event: eventName,
      detail: detail || {},
      utm: getUtm(),
      path: window.location.pathname,
      createdAt: new Date().toISOString(),
    });
    writeArray(ANALYTICS_KEY, events.slice(-200));
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function listHtml(items, emptyText) {
    if (!items.length) return "<p>" + escapeHtml(emptyText) + "</p>";
    return "<ul>" + items.map(function (item) {
      return "<li>" + escapeHtml(item) + "</li>";
    }).join("") + "</ul>";
  }

  function clean(value) {
    return String(value || "").trim();
  }

  function unique(items) {
    return Array.from(new Set(items.map(clean).filter(Boolean)));
  }

  function extractUrls(raw) {
    const pattern = /https?:\/\/[^\s<>"'|,]+|\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]+|#[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]+/gi;
    return Array.from(clean(raw).matchAll(pattern)).map(function (match) {
      return match[0].replace(/[),.;]+$/, "");
    }).filter(Boolean);
  }

  function absoluteUrl(value) {
    const raw = clean(value);
    if (!raw) return "";
    try {
      return new URL(raw, "https://example.com").toString();
    } catch (error) {
      return raw;
    }
  }

  function parseUrl(value) {
    try {
      return new URL(clean(value), "https://example.com");
    } catch (error) {
      return null;
    }
  }

  function normalizeUrl(value) {
    const url = parseUrl(value);
    if (!url) return clean(value).replace(/\/$/, "");
    url.hostname = url.hostname.toLowerCase();
    return url.toString().replace(/\/$/, "");
  }

  function normalizeWithoutHash(value) {
    const url = parseUrl(value);
    if (!url) return normalizeUrl(value);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    return url.toString().replace(/\/$/, "");
  }

  function sameCollection(a, b) {
    const first = parseUrl(a);
    const second = parseUrl(b);
    if (!first || !second) return false;
    return first.origin === second.origin && first.pathname.replace(/\/$/, "") === second.pathname.replace(/\/$/, "");
  }

  function pageNumberFromUrl(value) {
    const url = parseUrl(value);
    if (!url) return null;
    const params = ["page", "p", "pageNo", "pageNumber", "paged"];
    for (let index = 0; index < params.length; index += 1) {
      const paramValue = url.searchParams.get(params[index]);
      const number = Number(paramValue);
      if (Number.isFinite(number) && number > 0) return number;
    }
    const pathMatch = url.pathname.match(/(?:\/page\/|\/p\/)(\d+)/i);
    if (pathMatch) return Number(pathMatch[1]);
    const hashMatch = url.hash.match(/page[-_/=]?(\d+)/i);
    if (hashMatch) return Number(hashMatch[1]);
    return null;
  }

  function hasPageUrlToken(value) {
    const url = parseUrl(value);
    if (!url) return false;
    return Boolean(
      pageNumberFromUrl(value) ||
      /(?:^|[?&])(page|p|paged|pageNo|pageNumber)=/i.test(url.search) ||
      /\/(?:page|p)\/\d+/i.test(url.pathname)
    );
  }

  function visibleText(value) {
    return clean(String(value || "").replace(/\s+/g, " "));
  }

  function isPaginationLabel(text) {
    return /^(next|previous|prev|older|newer|load more|show more|\d+)$/i.test(visibleText(text));
  }

  function isGenericAnchor(text) {
    const normalized = visibleText(text).toLowerCase();
    if (/^\d+$/.test(normalized)) return false;
    if (/^(next|previous|prev|older|newer)$/i.test(normalized)) return false;
    return GENERIC_ANCHORS.indexOf(normalized) !== -1;
  }

  function parseHtml(raw) {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = clean(raw);
    const anchors = qsa("a", wrapper).map(function (anchor) {
      return {
        href: clean(anchor.getAttribute("href") || ""),
        text: visibleText(anchor.textContent || ""),
        html: anchor.outerHTML,
      };
    });
    const buttonLike = qsa("button, [role='button'], input[type='button'], input[type='submit']", wrapper).map(function (button) {
      return {
        text: visibleText(button.textContent || button.value || ""),
        html: button.outerHTML,
      };
    });
    const textOnlyPaginationControls = qsa("span, li, div", wrapper).filter(function (element) {
      if (element.querySelector("a")) return false;
      const text = visibleText(element.textContent || "");
      return isPaginationLabel(text);
    }).map(function (element) {
      return {
        text: visibleText(element.textContent || ""),
        html: element.outerHTML,
      };
    });
    return { anchors: anchors, buttonLike: buttonLike, textOnlyPaginationControls: textOnlyPaginationControls };
  }

  function parseCanonicalRows(raw) {
    const rows = [];
    clean(raw).split(/\r?\n/).map(clean).filter(Boolean).forEach(function (line) {
      const urls = extractUrls(line).map(absoluteUrl);
      const rowUrl = urls[0] || clean(line.split("|")[0]);
      const canonicalMatch = line.match(/canonical\s*=\s*([^|]+)/i);
      const metaMatch = line.match(/meta\s*=\s*([^|]+)/i);
      rows.push({
        url: rowUrl,
        canonical: canonicalMatch ? absoluteUrl(canonicalMatch[1]) : "",
        meta: metaMatch ? clean(metaMatch[1]).toLowerCase() : "",
        raw: line,
      });
    });
    return rows;
  }

  function parseUrlSamples(raw) {
    return unique(extractUrls(raw).map(absoluteUrl));
  }

  function pageTwoPlusUrls(urls) {
    return urls.filter(function (url) {
      const page = pageNumberFromUrl(url);
      return page && page > 1;
    });
  }

  function anchorHrefPageNumbers(anchors) {
    return anchors.map(function (anchor) {
      return anchor.href ? pageNumberFromUrl(anchor.href) : null;
    }).filter(function (page) {
      return page && page > 0;
    }).sort(function (a, b) {
      return a - b;
    });
  }

  function analyzePagination(input) {
    const html = parseHtml(input.htmlSnippets);
    const pageUrls = parseUrlSamples(input.pageUrls);
    const canonicalRows = parseCanonicalRows(input.canonicalRows);
    const sitemap = parseUrlSamples(input.sitemapUrls).map(normalizeWithoutHash);
    const uxNotes = clean(input.uxNotes);
    const pageTwoUrls = pageTwoPlusUrls(pageUrls);

    const parseSummary = [
      "Parsed " + html.anchors.length + " anchor tags from pagination snippets.",
      "Parsed " + html.buttonLike.length + " button-like controls from pagination snippets.",
      "Parsed " + pageUrls.length + " page URL examples.",
      "Parsed " + canonicalRows.length + " canonical/noindex rows.",
      "Parsed " + sitemap.length + " sitemap sample URLs.",
    ];
    const crawlableLinkWarnings = [];
    const urlCanonicalWarnings = [];
    const loadMoreWarnings = [];
    const sitemapWarnings = [];
    const anchorTextWarnings = [];
    const handoffReminders = [
      "Retest after frontend routing, SSR/CSR hydration, canonical, noindex, sitemap, or template changes ship.",
      "Treat this as launch QA guidance; it does not guarantee crawling, indexing, rankings, or crawl-budget outcomes.",
    ];

    if (!clean(input.htmlSnippets)) {
      parseSummary.push("No pagination HTML snippets were provided.");
    }

    html.textOnlyPaginationControls.forEach(function (control) {
      crawlableLinkWarnings.push("The pagination label `" + control.text + "` is rendered without an `a href`, creating a missing crawlable href risk for next/previous/page numbers.");
    });

    html.buttonLike.forEach(function (button) {
      if (/load more|show more|more results/i.test(button.text)) {
        loadMoreWarnings.push("Detected a button-only load-more control; expose a crawlable URL fallback for deeper paginated content.");
      } else if (/next|previous|prev|older|newer|\d+/i.test(button.text)) {
        crawlableLinkWarnings.push("The pagination control `" + button.text + "` is button-only, so crawlers may see missing crawlable href coverage.");
      }
    });

    html.anchors.forEach(function (anchor) {
      if (!anchor.href && isPaginationLabel(anchor.text)) {
        crawlableLinkWarnings.push("Anchor text `" + anchor.text + "` is missing a crawlable href.");
      }
      if (anchor.href && /^#/i.test(anchor.href)) {
        urlCanonicalWarnings.push("Anchor `" + anchor.text + "` uses a fragment-only page URL `" + anchor.href + "`; crawlers need a unique URL fallback for the page state.");
      }
      if (isGenericAnchor(anchor.text)) {
        anchorTextWarnings.push("Found generic or empty anchor text for pagination link `" + (anchor.href || "missing href") + "`; use clear labels such as page number, next page, or previous page.");
      }
    });

    if (/infinite\s*scroll|intersectionobserver|onscroll|scroll/i.test(uxNotes)) {
      loadMoreWarnings.push("Infinite-scroll risk found in UX notes; confirm crawlers can reach paginated content through crawlable links and unique URLs.");
    }
    if (/without changing url|same url|no url change|does not change url/i.test(uxNotes)) {
      urlCanonicalWarnings.push("UX notes mention content changes without changing URL, creating missing unique page URLs for deeper content.");
    }

    pageUrls.forEach(function (url) {
      const parsed = parseUrl(url);
      if (parsed && parsed.hash && /page|\d+/.test(parsed.hash) && !parsed.search) {
        urlCanonicalWarnings.push(url + " is a fragment-only page URL sample; add a crawlable URL pattern such as ?page=2 or /page/2/.");
      }
      if (!hasPageUrlToken(url)) {
        urlCanonicalWarnings.push(url + " does not expose an obvious unique pagination URL token.");
      }
    });

    if (pageUrls.length && !pageUrls.some(hasPageUrlToken)) {
      urlCanonicalWarnings.push("No page URL examples include a crawlable pagination token, so deeper states may be missing unique page URLs.");
    }

    canonicalRows.forEach(function (row) {
      const page = pageNumberFromUrl(row.url);
      const canonicalPage = row.canonical ? pageNumberFromUrl(row.canonical) : null;
      if (page && page > 1 && row.canonical && sameCollection(row.url, row.canonical) && (!canonicalPage || canonicalPage < page)) {
        urlCanonicalWarnings.push(row.url + " appears canonicalized to page 1 through " + row.canonical + "; page 2+ should not be accidentally collapsed when it contains important content.");
      }
      if (page && page > 1 && /noindex/i.test(row.meta || "")) {
        urlCanonicalWarnings.push(row.url + " has noindex on an important paginated URL; confirm page 2+ should be excluded before launch.");
      }
    });

    const linkedPages = anchorHrefPageNumbers(html.anchors);
    const sampledPages = pageUrls.map(pageNumberFromUrl).filter(function (page) { return page && page > 0; });
    const maxPage = Math.max.apply(null, [0].concat(sampledPages, linkedPages));
    if (maxPage > 1) {
      const linkedSet = new Set(linkedPages);
      for (let page = 1; page <= maxPage; page += 1) {
        if (!linkedSet.has(page)) {
          crawlableLinkWarnings.push("Missing sequential links: page " + page + " is represented in samples but not linked with a crawlable href in the HTML snippet.");
        }
      }
      if (!html.anchors.some(function (anchor) { return /next/i.test(anchor.text) && anchor.href; })) {
        crawlableLinkWarnings.push("Missing sequential links: no crawlable next link was found for deeper pages.");
      }
      if (!html.anchors.some(function (anchor) { return /prev|previous/i.test(anchor.text) && anchor.href; }) && maxPage > 2) {
        crawlableLinkWarnings.push("Missing sequential links: no crawlable previous link was found for page 3+ states.");
      }
    }

    pageTwoUrls.forEach(function (url) {
      if (sitemap.indexOf(normalizeWithoutHash(url)) === -1) {
        sitemapWarnings.push(url + " is missing from sitemap samples; add a sitemap fallback when page 2+ content is important and internal links are fragile.");
      }
    });

    if (!clean(input.sitemapUrls)) {
      sitemapWarnings.push("No sitemap representative URLs were provided, so no sitemap fallback for paginated URLs could be checked.");
    }
    if (/ecommerce|category|listing|archive|documentation|docs/i.test(input.siteType)) {
      handoffReminders.push("For " + clean(input.siteType).toLowerCase() + ", test category/listing, blog archive, docs list, reviews, and search-result templates separately.");
    }

    const issueCount =
      crawlableLinkWarnings.length +
      urlCanonicalWarnings.length +
      loadMoreWarnings.length +
      sitemapWarnings.length +
      anchorTextWarnings.length +
      (clean(input.htmlSnippets) ? 0 : 1);
    const status = crawlableLinkWarnings.length || urlCanonicalWarnings.length || loadMoreWarnings.length || sitemapWarnings.length
      ? "Fix before launch"
      : anchorTextWarnings.length
        ? "Manual review"
        : "Ready for final pagination QA";

    return {
      status: status,
      issueCount: issueCount,
      anchorCount: html.anchors.length,
      buttonCount: html.buttonLike.length,
      pageUrlCount: pageUrls.length,
      canonicalRowCount: canonicalRows.length,
      sitemapUrlCount: sitemap.length,
      siteType: clean(input.siteType),
      parseSummary: unique(parseSummary),
      crawlableLinkWarnings: unique(crawlableLinkWarnings),
      urlCanonicalWarnings: unique(urlCanonicalWarnings),
      loadMoreWarnings: unique(loadMoreWarnings),
      sitemapWarnings: unique(sitemapWarnings),
      anchorTextWarnings: unique(anchorTextWarnings),
      handoffReminders: unique(handoffReminders),
    };
  }

  function briefToText(brief) {
    return [
      "Pagination QA Briefs",
      "Status: " + brief.status,
      "Issue count: " + brief.issueCount,
      "Anchor tags: " + brief.anchorCount,
      "Button-like controls: " + brief.buttonCount,
      "Page URL examples: " + brief.pageUrlCount,
      "Canonical/noindex rows: " + brief.canonicalRowCount,
      "Sitemap sample URLs: " + brief.sitemapUrlCount,
      "Site type: " + brief.siteType,
      "",
      "Parse summary:",
      brief.parseSummary.length ? brief.parseSummary.join("\n") : "None found.",
      "",
      "Crawlable pagination link warnings:",
      brief.crawlableLinkWarnings.length ? brief.crawlableLinkWarnings.join("\n") : "None found.",
      "",
      "URL and canonical warnings:",
      brief.urlCanonicalWarnings.length ? brief.urlCanonicalWarnings.join("\n") : "None found.",
      "",
      "Load-more and infinite-scroll risks:",
      brief.loadMoreWarnings.length ? brief.loadMoreWarnings.join("\n") : "None found.",
      "",
      "Sitemap fallback warnings:",
      brief.sitemapWarnings.length ? brief.sitemapWarnings.join("\n") : "None found.",
      "",
      "Anchor text warnings:",
      brief.anchorTextWarnings.length ? brief.anchorTextWarnings.join("\n") : "None found.",
      "",
      "Handoff reminders:",
      brief.handoffReminders.join("\n"),
      "",
      "Note: This is pagination launch QA guidance, not a guarantee of crawling, indexing, rankings, or crawl-budget outcomes.",
    ].join("\n");
  }

  function renderBrief(brief) {
    const output = qs("#brief-output");
    const copyButton = qs("#copy-brief");
    const outputPanel = qs(".output-panel");
    const statusPill = qs("#status-pill");
    if (!output) return;

    output.classList.remove("empty");
    output.classList.add("is-updated");
    window.setTimeout(function () { output.classList.remove("is-updated"); }, 480);
    output.innerHTML = [
      '<div class="brief-summary">',
      '<strong>' + escapeHtml(brief.status) + '</strong>',
      '<span>' + brief.issueCount + ' checks need attention across ' + brief.pageUrlCount + ' page URL examples</span>',
      "</div>",
      '<section class="brief-section"><h4>Parse summary</h4>' + listHtml(brief.parseSummary, "No parse notes found.") + "</section>",
      '<section class="brief-section"><h4>Crawlable pagination link warnings</h4>' + listHtml(brief.crawlableLinkWarnings, "No crawlable pagination link warnings found.") + "</section>",
      '<section class="brief-section"><h4>URL and canonical warnings</h4>' + listHtml(brief.urlCanonicalWarnings, "No URL or canonical warnings found.") + "</section>",
      '<section class="brief-section"><h4>Load-more and infinite-scroll risks</h4>' + listHtml(brief.loadMoreWarnings, "No load-more or infinite-scroll risks found.") + "</section>",
      '<section class="brief-section"><h4>Sitemap fallback warnings</h4>' + listHtml(brief.sitemapWarnings, "No sitemap fallback warnings found.") + "</section>",
      '<section class="brief-section"><h4>Anchor text warnings</h4>' + listHtml(brief.anchorTextWarnings, "No anchor text warnings found.") + "</section>",
      '<section class="brief-section"><h4>Handoff reminders</h4>' + listHtml(brief.handoffReminders, "No handoff reminders found.") + "</section>",
    ].join("");
    setText("#output-title", "Pagination QA brief ready");
    setText("#status-pill", brief.status);
    if (copyButton) copyButton.disabled = false;
    if (outputPanel) {
      outputPanel.classList.add("has-brief");
      outputPanel.classList.toggle("status-good", brief.status === "Ready for final pagination QA");
      outputPanel.classList.toggle("status-warning", brief.status === "Manual review");
      outputPanel.classList.toggle("status-danger", brief.status === "Fix before launch");
    }
    if (statusPill) {
      statusPill.classList.toggle("status-good", brief.status === "Ready for final pagination QA");
      statusPill.classList.toggle("status-warning", brief.status === "Manual review");
      statusPill.classList.toggle("status-danger", brief.status === "Fix before launch");
    }
    state.latestBrief = brief;
    state.latestBriefText = briefToText(brief);
  }

  function pulseClass(element, className, duration) {
    if (!element) return;
    element.classList.add(className);
    window.setTimeout(function () { element.classList.remove(className); }, duration || 600);
  }

  async function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch (error) {
        // Fall through to textarea fallback for headless browser clipboard blocks.
      }
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }

  function setupAuditor() {
    const form = qs("#auditor-form");
    const htmlInput = qs("#html-input");
    const urlInput = qs("#urls-input");
    const metaInput = qs("#meta-input");
    const uxInput = qs("#ux-input");
    const sitemapInput = qs("#sitemap-input");
    const loadSample = qs("#load-sample");
    const error = qs("#workflow-error");
    const copyButton = qs("#copy-brief");
    if (!form || !htmlInput) return;

    if (loadSample) {
      loadSample.addEventListener("click", function () {
        htmlInput.value = SAMPLE_HTML;
        if (urlInput) urlInput.value = SAMPLE_URLS;
        if (metaInput) metaInput.value = SAMPLE_META_ROWS;
        if (uxInput) uxInput.value = SAMPLE_UX_NOTES;
        if (sitemapInput) sitemapInput.value = SAMPLE_SITEMAP;
        if (qs("#site-type")) qs("#site-type").value = "Ecommerce listings";
        htmlInput.focus();
        pulseClass(loadSample, "is-confirmed", 520);
        track("sample_pagination_rows_loaded");
      });
    }

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      track("core_action_started", { triggerSource: "auditor_form" });
      if (error) error.textContent = "";

      const input = {
        htmlSnippets: htmlInput.value.trim(),
        pageUrls: urlInput ? urlInput.value.trim() : "",
        canonicalRows: metaInput ? metaInput.value.trim() : "",
        uxNotes: uxInput ? uxInput.value.trim() : "",
        sitemapUrls: sitemapInput ? sitemapInput.value.trim() : "",
        siteType: qs("#site-type") ? qs("#site-type").value : "",
      };
      const inputLength = Object.keys(input).reduce(function (total, key) { return total + String(input[key]).length; }, 0);
      if (!input.htmlSnippets) {
        if (error) error.textContent = "Paste pagination HTML snippets or load the sample before generating a pagination QA brief.";
        track("core_action_failed", { reason: "empty_input" });
        return;
      }

      const brief = analyzePagination(input);
      renderBrief(brief);
      track("core_action_completed", {
        issueCount: brief.issueCount,
        status: brief.status,
        anchorCount: brief.anchorCount,
        buttonCount: brief.buttonCount,
        pageUrlCount: brief.pageUrlCount,
        canonicalRowCount: brief.canonicalRowCount,
        sitemapUrlCount: brief.sitemapUrlCount,
        inputLength: inputLength,
      });
    });

    if (copyButton) {
      copyButton.addEventListener("click", function () {
        if (!state.latestBriefText) return;
        copyText(state.latestBriefText).then(function () {
          copyButton.textContent = "Copied brief";
          pulseClass(copyButton, "is-confirmed", 700);
          track("brief_copied", { issueCount: state.latestBrief ? state.latestBrief.issueCount : 0 });
          window.setTimeout(function () { copyButton.textContent = "Copy brief"; }, 1400);
        });
      });
    }
  }

  function buildRemoteIssue(intent) {
    const body = [
      "Pagination QA Briefs early-access request",
      "",
      "Role: " + intent.role,
      "Site type: " + intent.siteType,
      "Pagination templates: " + intent.templateCount,
      "Plan interest: " + intent.plan,
      "Willingness to pay: " + intent.budget,
      "Purchase intent: " + (intent.purchaseIntent ? "yes" : "no"),
      "",
      "Biggest pagination QA pain:",
      intent.pain,
      "",
      "Note: Email is intentionally omitted from this public issue body.",
    ].join("\n");
    state.lastRemoteBody = body;
    const params = new URLSearchParams({
      title: "Pagination QA Briefs early-access request",
      body: body,
      labels: "early-access,purchase-intent,demo-request",
      template: "demo_request.md",
    });
    return GITHUB_ISSUE_URL + "?" + params.toString();
  }

  function setupWaitlist() {
    const form = qs("#waitlist-form");
    const status = qs("#waitlist-status");
    const handoff = qs("#handoff-panel");
    const remoteLink = qs("#remote-intent-link");
    const copyRequest = qs("#copy-request");
    const planSelect = qs("#plan");
    if (!form) return;

    form.addEventListener("focusin", function () {
      if (!state.signupStarted) {
        state.signupStarted = true;
        track("signup_started", { triggerSource: "waitlist_form" });
      }
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!state.signupStarted) {
        state.signupStarted = true;
        track("signup_started", { triggerSource: "waitlist_submit" });
      }
      const intent = {
        email: qs("#email") ? qs("#email").value.trim() : "",
        role: qs("#role") ? qs("#role").value : "",
        siteType: qs("#site-type-intent") ? qs("#site-type-intent").value : "",
        templateCount: qs("#template-count") ? qs("#template-count").value : "",
        plan: planSelect ? planSelect.value : "",
        budget: qs("#budget") ? qs("#budget").value : "",
        pain: qs("#pain") ? qs("#pain").value.trim() : "",
        purchaseIntent: qs("#purchase-intent") ? qs("#purchase-intent").checked : false,
        createdAt: new Date().toISOString(),
        utm: getUtm(),
      };
      const intents = readArray(INTENT_KEY);
      intents.push(intent);
      writeArray(INTENT_KEY, intents.slice(-100));

      const remoteHref = buildRemoteIssue(intent);
      if (remoteLink) remoteLink.href = remoteHref;
      if (handoff) {
        handoff.hidden = false;
        pulseClass(handoff, "is-confirmed", 700);
      }
      if (status) status.textContent = "You are on the early access list. Public-safe request details are ready.";

      track("waitlist_submitted", { role: intent.role, plan: intent.plan, templateCount: intent.templateCount });
      track("feedback_submitted", { triggerSource: "waitlist_form", painLength: intent.pain.length });
      track("remote_intent_ready", { hasRemoteLink: Boolean(remoteHref) });
      if (intent.purchaseIntent) track("checkout_intent", { plan: intent.plan, budget: intent.budget });
    });

    if (copyRequest) {
      copyRequest.addEventListener("click", function () {
        if (!state.lastRemoteBody) return;
        copyText(state.lastRemoteBody).then(function () {
          copyRequest.textContent = "Copied request details";
          pulseClass(copyRequest, "is-confirmed", 700);
          track("remote_intent_copied", { bodyLength: state.lastRemoteBody.length });
          window.setTimeout(function () { copyRequest.textContent = "Copy request details"; }, 1500);
        });
      });
    }
  }

  function setupPlanButtons() {
    const waitlist = qs("#waitlist");
    const planSelect = qs("#plan");
    qsa(".plan-button").forEach(function (button) {
      button.addEventListener("click", function () {
        const plan = button.getAttribute("data-plan") || "";
        if (planSelect && plan) planSelect.value = plan;
        track("pricing_viewed", { triggerSource: "plan_button" });
        state.pricingTracked = true;
        track("checkout_started", { plan: plan, triggerSource: "pricing_button" });
        pulseClass(button, "is-confirmed", 500);
        if (waitlist) waitlist.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  function setupTracking() {
    track("landing_viewed", { product: "Pagination QA Briefs" });
    qsa("[data-track-cta]").forEach(function (element) {
      element.addEventListener("click", function () {
        track("cta_clicked", { cta: element.getAttribute("data-track-cta") || element.textContent.trim() });
      });
    });
    const pricing = qs("#pricing");
    if (pricing && "IntersectionObserver" in window) {
      const observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting && !state.pricingTracked) {
            state.pricingTracked = true;
            track("pricing_viewed", { triggerSource: "scroll" });
            observer.disconnect();
          }
        });
      }, { threshold: 0.35 });
      observer.observe(pricing);
    }
  }

  function setupChrome() {
    const header = qs("[data-header]");
    if (!header) return;
    function updateHeader() {
      header.classList.toggle("is-scrolled", window.scrollY > 8);
    }
    updateHeader();
    window.addEventListener("scroll", updateHeader, { passive: true });
  }

  function setupReveal() {
    const elements = qsa(".reveal");
    if (!("IntersectionObserver" in window)) {
      elements.forEach(function (element) { element.classList.add("is-visible"); });
      return;
    }
    const observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    elements.forEach(function (element) { observer.observe(element); });
  }

  document.addEventListener("DOMContentLoaded", function () {
    setupTracking();
    setupChrome();
    setupReveal();
    setupAuditor();
    setupWaitlist();
    setupPlanButtons();
  });
}());
