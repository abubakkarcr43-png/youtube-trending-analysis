/*
  Dashboard (dataset-driven) renderer
  - Fetches protected JSON from /api/dashboard-data
  - Renders KPIs + 5 charts (Chart.js) + searchable preview table
*/

(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const THEME_KEY = "yt-dashboard-theme";
  const restoreTheme = () => {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "mono-ui") {
      document.body.classList.add("mono-ui");
      document.body.classList.remove("vibrant-ui");
    } else if (stored === "vibrant-ui") {
      document.body.classList.add("vibrant-ui");
      document.body.classList.remove("mono-ui");
    }
  };
  restoreTheme();

  const isMono = document.body.classList.contains("mono-ui");
  const isVibrant = document.body.classList.contains("vibrant-ui");

  const fmtInt = (n) => {
    const v = Number(n || 0);
    if (!Number.isFinite(v)) return "—";
    return v.toLocaleString();
  };

  const fmtBig = (n) => {
    const v = Number(n || 0);
    if (!Number.isFinite(v)) return "—";
    if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(2)}B`;
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
    return v.toLocaleString();
  };

  // ------- Charts -------
  const charts = {};
  const destroyCharts = () => {
    Object.values(charts).forEach((c) => {
      try {
        c.destroy();
      } catch {}
    });
    for (const k of Object.keys(charts)) delete charts[k];
  };

  const baseChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { mode: "index", intersect: false },
    },
    scales: {
      x: {
        ticks: {
          color: isMono ? "rgba(20,20,20,0.82)" : isVibrant ? "rgba(236,238,255,0.9)" : "rgba(255,255,255,0.72)",
        },
        grid: { color: isMono ? "rgba(0,0,0,0.10)" : "rgba(255,255,255,0.10)" },
      },
      y: {
        ticks: {
          color: isMono ? "rgba(20,20,20,0.82)" : isVibrant ? "rgba(236,238,255,0.9)" : "rgba(255,255,255,0.72)",
        },
        grid: { color: isMono ? "rgba(0,0,0,0.10)" : "rgba(255,255,255,0.10)" },
      },
    },
  };

  const mkBar = (canvasId, labels, values, label) => {
    const el = document.getElementById(canvasId);
    if (!el) return;
    const ctx = el.getContext("2d");
    charts[canvasId] = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label,
            data: values,
            borderRadius: 12,
            backgroundColor: isMono
              ? "rgba(0,0,0,0.72)"
              : isVibrant
              ? "rgba(0,212,255,0.75)"
              : "rgba(255,0,60,0.70)",
            borderColor: isMono ? "rgba(0,0,0,0.95)" : isVibrant ? "rgba(124,77,255,0.95)" : "rgba(255,0,60,0.95)",
            borderWidth: 1,
          },
        ],
      },
      options: {
        ...baseChartOptions,
        plugins: { ...baseChartOptions.plugins, tooltip: { enabled: true } },
      },
    });
  };

  const mkLine = (canvasId, labels, values, label) => {
    const el = document.getElementById(canvasId);
    if (!el) return;
    const ctx = el.getContext("2d");
    charts[canvasId] = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label,
            data: values,
            borderColor: isMono ? "rgba(0,0,0,0.9)" : isVibrant ? "rgba(255,42,109,0.95)" : "rgba(255,0,60,0.95)",
            backgroundColor: isMono
              ? "rgba(0,0,0,0.14)"
              : isVibrant
              ? "rgba(124,77,255,0.20)"
              : "rgba(255,0,60,0.22)",
            fill: true,
            tension: 0.35,
            pointRadius: 0,
            borderWidth: 2.2,
          },
        ],
      },
      options: baseChartOptions,
    });
  };

  const mkScatter = (canvasId, points, label) => {
    const el = document.getElementById(canvasId);
    if (!el) return;
    const ctx = el.getContext("2d");
    charts[canvasId] = new Chart(ctx, {
      type: "scatter",
      data: {
        datasets: [
          {
            label,
            data: points,
            pointRadius: 3,
            pointHoverRadius: 5,
            backgroundColor: isMono ? "rgba(0,0,0,0.75)" : isVibrant ? "rgba(255,255,255,0.82)" : "rgba(255,255,255,0.75)",
            borderColor: isMono ? "rgba(0,0,0,0.8)" : isVibrant ? "rgba(0,212,255,0.92)" : "rgba(255,0,60,0.55)",
            borderWidth: 1,
          },
        ],
      },
      options: {
        ...baseChartOptions,
        scales: {
          x: {
            ...baseChartOptions.scales.x,
            title: { display: true, text: "Likes", color: isMono ? "rgba(20,20,20,0.8)" : "rgba(255,255,255,0.72)" },
          },
          y: {
            ...baseChartOptions.scales.y,
            title: {
              display: true,
              text: "Comments",
              color: isMono ? "rgba(20,20,20,0.8)" : "rgba(255,255,255,0.72)",
            },
          },
        },
      },
    });
  };

  // ------- Table -------
  let tableState = { columns: [], rows: [] };

  const renderTable = (needle = "", categoryFilter = "", countryFilter = "") => {
    const wrap = $("#dataTableWrap");
    if (!wrap) return;
    const q = (needle || "").trim().toLowerCase();
    const cols = tableState.columns;
    let rows = tableState.rows;
    if (q) {
      rows = rows.filter((r) =>
        cols.some((c) => String(r[c] ?? "").toLowerCase().includes(q))
      );
    }
    if (categoryFilter) {
      rows = rows.filter((r) => String(r.Category ?? "").toLowerCase() === categoryFilter.toLowerCase());
    }
    if (countryFilter) {
      rows = rows.filter((r) => String(r.Country ?? "").toLowerCase() === countryFilter.toLowerCase());
    }

    // Simple, lightweight HTML table (no extra libs)
    const head = cols.map((c) => `<th>${escapeHtml(c)}</th>`).join("");
    const body = rows
      .map((r) => {
        const tds = cols
          .map((c) => `<td>${escapeHtml(String(r[c] ?? ""))}</td>`)
          .join("");
        return `<tr>${tds}</tr>`;
      })
      .join("");

    wrap.innerHTML = `
      <div class="tableMeta">
        <span class="tag">Rows shown: <strong>${rows.length}</strong></span>
        <span class="tag">Columns: <strong>${cols.length}</strong></span>
      </div>
      <div class="tableScroll">
        <table class="dataTable">
          <thead><tr>${head}</tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    `;
  };

  const escapeHtml = (s) =>
    s.replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m]));

  // ------- Data Fetch -------
  const setKpis = (k) => {
    const rows = $("#kpiRows");
    const views = $("#kpiViews");
    const likes = $("#kpiLikes");
    const comments = $("#kpiComments");
    const topCat = $("#kpiTopCategory");
    const topCh = $("#kpiTopChannel");
    if (rows) rows.textContent = fmtInt(k.rows);
    if (views) views.textContent = fmtBig(k.views);
    if (likes) likes.textContent = fmtBig(k.likes);
    if (comments) comments.textContent = fmtBig(k.comments);
    if (topCat) topCat.textContent = k.topCategory || "—";
    if (topCh) topCh.textContent = k.topChannel || "—";
  };

  const renderCharts = (c) => {
    destroyCharts();

    const topCategories = c.topCategories || [];
    mkBar(
      "chartCategories",
      topCategories.map((x) => x.label),
      topCategories.map((x) => x.value),
      "Views"
    );

    const topChannels = c.topChannels || [];
    mkBar(
      "chartChannels",
      topChannels.map((x) => x.label),
      topChannels.map((x) => x.value),
      "Views"
    );

    const growth = c.dailyViewGrowth || [];
    mkLine(
      "chartGrowth",
      growth.map((x) => x.label),
      growth.map((x) => x.value),
      "Views"
    );

    const scatter = c.likeCommentScatter || [];
    mkScatter("chartScatter", scatter, "Engagement");

    const regions = c.regionViews || [];
    mkBar(
      "chartRegions",
      regions.map((x) => x.label),
      regions.map((x) => x.value),
      "Views"
    );
  };

  const showDatasetError = (msg) => {
    const wrap = $("#dataTableWrap");
    if (!wrap) return;
    wrap.innerHTML = `
      <div class="auth__error" role="alert" style="margin:0;">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <span>${escapeHtml(msg || "Failed to load dataset.")}</span>
      </div>
    `;
  };

  const load = async () => {
    try {
      const res = await fetch("/api/dashboard-data", { credentials: "same-origin" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showDatasetError(data.error || `Failed to load dataset (${res.status}).`);
        return;
      }

      setKpis(data.kpis || {});
      renderCharts((data && data.charts) || {});

      tableState = {
        columns: (data.table && data.table.columns) || [],
        rows: (data.table && data.table.rows) || [],
      };

      // Populate filters
      const categories = [...new Set(tableState.rows.map(r => r.Category).filter(Boolean))].sort();
      const categorySelect = $("#categoryFilter");
      if (categorySelect) {
        categorySelect.innerHTML = '<option value="">All Categories</option>' + categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
      }

      const countries = [...new Set(tableState.rows.map(r => r.Country).filter(Boolean))].sort();
      const countrySelect = $("#countryFilter");
      if (countrySelect) {
        countrySelect.innerHTML = '<option value="">All Countries</option>' + countries.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
      }

      renderTable($("#tableSearch")?.value || "", $("#categoryFilter")?.value || "", $("#countryFilter")?.value || "");
    } catch (e) {
      showDatasetError("Network error while loading dataset.");
    }
  };

  // ------- Channel analysis -------
  let channelState = { channel: null, videos: [], analytics: {}, score: {}, insights: [] };
  const channelCharts = {};
  const destroyChannelCharts = () => {
    Object.values(channelCharts).forEach((chart) => {
      try { chart.destroy(); } catch {}
    });
    Object.keys(channelCharts).forEach((key) => delete channelCharts[key]);
  };
  const channelMetric = (value) => value === null || value === undefined || value === "N/A" ? "N/A" : fmtBig(value);
  const dateText = (value) => {
    if (!value) return "N/A";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "N/A" : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  };
  const isoDuration = (value) => {
    if (!value || !String(value).startsWith("PT")) return value || "N/A";
    const match = String(value).match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return "N/A";
    return [match[1] ? `${match[1]}h` : "", match[2] ? `${match[2]}m` : "", match[3] ? `${match[3]}s` : ""].filter(Boolean).join(" ") || "0s";
  };
  const channelChart = (id, type, labels, values, label, options = {}) => {
    const canvas = document.getElementById(id);
    if (!canvas || typeof Chart === "undefined") return;
    const data = type === "scatter" ? { datasets: [{ label, data: values, pointRadius: 4, backgroundColor: "rgba(0,212,255,0.78)" }] } : { labels, datasets: [{ label, data: values, borderRadius: 10, borderWidth: 2, borderColor: "rgba(255,42,109,0.95)", backgroundColor: "rgba(255,42,109,0.58)", fill: type === "line", tension: 0.3 }] };
    channelCharts[id] = new Chart(canvas.getContext("2d"), { type, data, options: { ...baseChartOptions, ...options } });
  };
  const renderChannelCharts = (videos, analytics) => {
    destroyChannelCharts();
    const top = (analytics.top_videos || []).slice(0, 10).reverse();
    channelChart("channelTopViewsChart", "bar", top.map((video) => video.title.slice(0, 22)), top.map((video) => video.views ?? 0), "Views");
    const dated = [...videos].filter((video) => video.published_at).sort((a, b) => a.published_at.localeCompare(b.published_at));
    channelChart("channelTimelineChart", "line", dated.map((video) => dateText(video.published_at)), dated.map((video) => video.views ?? 0), "Views");
    channelChart("channelScatterChart", "scatter", [], videos.filter((video) => video.likes !== null && video.comments !== null).map((video) => ({ x: video.likes, y: video.comments })), "Likes vs comments", { scales: { x: { ...baseChartOptions.scales.x, title: { display: true, text: "Likes" } }, y: { ...baseChartOptions.scales.y, title: { display: true, text: "Comments" } } } });
    const upload = analytics.upload_frequency?.items || [];
    channelChart("channelUploadChart", "bar", upload.map((item) => item.label), upload.map((item) => item.value), "Videos");
    const engagement = [...videos].filter((video) => typeof video.engagement_rate === "number").sort((a, b) => b.engagement_rate - a.engagement_rate).slice(0, 10).reverse();
    channelChart("channelEngagementChart", "bar", engagement.map((video) => video.title.slice(0, 22)), engagement.map((video) => video.engagement_rate), "Engagement %");
  };
  const renderVideoCard = (video) => `<a class="videoCard glass2" href="${escapeHtml(video.url || "#")}" target="_blank" rel="noopener"><img src="${escapeHtml(video.thumbnail || "")}" alt="" loading="lazy" /><div class="videoCard__body"><h3>${escapeHtml(video.title)}</h3><p>${dateText(video.published_at)}</p><div class="videoCard__stats"><span><i class="fa-solid fa-eye"></i> ${channelMetric(video.views)}</span><span><i class="fa-solid fa-thumbs-up"></i> ${channelMetric(video.likes)}</span><span><i class="fa-solid fa-comments"></i> ${channelMetric(video.comments)}</span></div><small>Engagement ${typeof video.engagement_rate === "number" ? video.engagement_rate + "%" : "N/A"}</small></div></a>`;
  const renderVideoTable = () => {
    const wrap = $("#recentVideos");
    if (!wrap) return;
    const query = ($("#videoSearch")?.value || "").toLowerCase().trim();
    const sort = $("#videoSort")?.value || "newest";
    let videos = channelState.videos.filter((video) => !query || video.title.toLowerCase().includes(query));
    videos = [...videos].sort((a, b) => sort === "views" ? (b.views ?? -1) - (a.views ?? -1) : sort === "likes" ? (b.likes ?? -1) - (a.likes ?? -1) : sort === "comments" ? (b.comments ?? -1) - (a.comments ?? -1) : sort === "oldest" ? (a.published_at || "").localeCompare(b.published_at || "") : (b.published_at || "").localeCompare(a.published_at || ""));
    const rows = videos.map((video) => [
      "<tr><td><a class=\"videoTable__title\" href=\"", escapeHtml(video.url || "#"), "\" target=\"_blank\" rel=\"noopener\"><img src=\"", escapeHtml(video.thumbnail || ""), "\" alt=\"\" loading=\"lazy\" />", escapeHtml(video.title), "</a></td><td>", dateText(video.published_at), "</td><td>", channelMetric(video.views), "</td><td>", channelMetric(video.likes), "</td><td>", channelMetric(video.comments), "</td><td>", escapeHtml(isoDuration(video.duration)), "</td><td><a class=\"chipBtn\" href=\"", escapeHtml(video.url || "#"), "\" target=\"_blank\" rel=\"noopener\" aria-label=\"Watch on YouTube\"><i class=\"fa-brands fa-youtube\"></i></a></td></tr>"
    ].join(""));
    wrap.innerHTML = videos.length ? `<div class="tableScroll"><table class="dataTable"><thead><tr><th>Video</th><th>Published</th><th>Views</th><th>Likes</th><th>Comments</th><th>Duration</th><th></th></tr></thead><tbody>${rows.join("")}</tbody></table></div>` : `<div class="channelEmpty">No videos match this search.</div>`;
  };
  const renderChannel = (data) => {
    channelState = data;
    const channel = data.channel || {};
    const analytics = data.analytics || {};
    const setText = (id, value) => { const el = $(id); if (el) el.textContent = value; };
    setText("#channelName", channel.name || "Unknown channel");
    setText("#channelHandle", channel.handle || "N/A");
    setText("#channelDescription", channel.description || "");
    setText("#channelSubscribers", channelMetric(channel.subscribers));
    setText("#channelViews", channelMetric(channel.views));
    setText("#channelVideos", channelMetric(channel.video_count));
    setText("#channelAverageViews", channelMetric(analytics.average_views));
    setText("#channelCreated", dateText(channel.created_at));
    setText("#channelCountry", channel.country || "N/A");
    setText("#channelScoreValue", data.score?.score === null || data.score?.score === undefined ? "N/A" : `${data.score.score} / 100`);
    setText("#channelScoreText", data.score?.explanation || "Based only on available public data.");
    const avatar = $("#channelAvatar"); if (avatar) { avatar.src = channel.thumbnail || ""; avatar.hidden = !channel.thumbnail; }
    const channelUrl = $("#channelUrl"); if (channelUrl) channelUrl.href = channel.url || "#";
    const insights = $("#channelInsightsList"); if (insights) insights.innerHTML = (data.insights || []).map((item) => `<li><i class="fa-solid fa-check"></i><span>${escapeHtml(item)}</span></li>`).join("") || "<li>No evidence-based insights are available for this sample.</li>";
    const top = $("#topVideos"); if (top) top.innerHTML = (analytics.top_videos || []).slice(0, 5).map(renderVideoCard).join("") || `<div class="channelEmpty">No public videos were found.</div>`;
    $("#channelResults").hidden = false;
    renderVideoTable();
    renderChannelCharts(data.videos || [], analytics);
  };
  const setChannelBusy = (busy) => { $("#channelLoading").hidden = !busy; $("#analyzeChannelBtn").disabled = busy; };
  const showChannelError = (message) => { const error = $("#channelError"); if (!error) return; error.querySelector("span").textContent = message; error.hidden = false; };
  const analyzeChannel = async (event) => {
    event.preventDefault();
    const query = $("#channelQuery")?.value.trim();
    $("#channelError").hidden = true;
    if (!query) { showChannelError("Enter a channel name, @handle, or channel ID."); return; }
    setChannelBusy(true);
    try {
      const response = await fetch("/api/analyze-channel", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ channel: query }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(data.message || data.error || "Channel analysis failed.");
        error.errorType = data.error_type || "unknown_error";
        throw error;
      }
      renderChannel(data);
      const updated = $("#channelUpdated"); updated.textContent = `Updated ${new Date((data.updated_at || Date.now() / 1000) * 1000).toLocaleString()}`; updated.hidden = false;
    } catch (error) {
      $("#channelResults").hidden = true;
      showChannelError(error.message || "Could not analyze this channel.");
    }
    finally { setChannelBusy(false); }
  };
  const downloadChannelReport = () => {
    const rows = channelState.videos || [];
    if (!rows.length) return;
    const columns = ["title", "published_at", "views", "likes", "comments", "engagement_rate", "duration", "url"];
    const csv = [columns.join(","), ...rows.map((row) => columns.map((column) => `"${String(row[column] ?? "N/A").replaceAll('"', '""')}"`).join(","))].join("\n");
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); link.download = `${(channelState.channel?.name || "channel").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-analysis.csv`; link.click(); URL.revokeObjectURL(link.href);
  };
  const setupChannelMode = () => {
    $$("[data-analysis-mode]").forEach((button) => button.addEventListener("click", () => {
      const mode = button.dataset.analysisMode;
      $$("[data-analysis-mode]").forEach((item) => { item.classList.toggle("is-active", item === button); item.setAttribute("aria-selected", String(item === button)); });
      $("#datasetContent").hidden = mode !== "dataset";
      $("#channelAnalysis").hidden = mode !== "channel";
    }));
    $("#channelSearchForm")?.addEventListener("submit", analyzeChannel);
    $("#clearChannelBtn")?.addEventListener("click", () => { $("#channelQuery").value = ""; $("#channelResults").hidden = true; $("#channelError").hidden = true; $("#channelUpdated").hidden = true; });
    $("#videoSearch")?.addEventListener("input", renderVideoTable);
    $("#videoSort")?.addEventListener("change", renderVideoTable);
    $("#downloadChannelReport")?.addEventListener("click", downloadChannelReport);
  };
  setupChannelMode();

  // Hooks
  const reloadBtn = $("#reloadDataBtn");
  if (reloadBtn) reloadBtn.addEventListener("click", load);

  const tableSearch = $("#tableSearch");
  if (tableSearch) tableSearch.addEventListener("input", () => renderTable(tableSearch.value, $("#categoryFilter")?.value || "", $("#countryFilter")?.value || ""));

  const categoryFilter = $("#categoryFilter");
  if (categoryFilter) categoryFilter.addEventListener("change", () => renderTable($("#tableSearch")?.value || "", categoryFilter.value, $("#countryFilter")?.value || ""));

  const countryFilter = $("#countryFilter");
  if (countryFilter) countryFilter.addEventListener("change", () => renderTable($("#tableSearch")?.value || "", $("#categoryFilter")?.value || "", countryFilter.value));

  const themeToggle = $("#themeToggle");
  if (themeToggle) themeToggle.addEventListener("click", () => {
    const nextTheme = document.body.classList.contains("mono-ui") ? "vibrant-ui" : "mono-ui";
    localStorage.setItem(THEME_KEY, nextTheme);
    window.location.reload();
  });

  // Load once at start
  load();
})();

