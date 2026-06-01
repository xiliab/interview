import "./styles/app.css";

type Episode = {
  id: string;
  title: string;
  collection: string;
  role: "UI/UX" | "PM" | "AI-CROSS";
  module: string;
  type: "Deep-dive" | "Lite";
  level: string;
  essence: string;
  framework: string;
  followUps: string[];
  references: string[];
  tags: string[];
  isAi: boolean;
  durationSeconds: number;
  coverVariant: "ux" | "pm" | "cross";
  searchBlob: string;
};

type Dialogue = {
  episodeId: string;
  estimatedSeconds: number;
  turns: Array<{ speaker: "男声" | "女声"; line: string }>;
};

type AudioEntry = {
  src: string;
  format: string;
  file: string;
};

type FilterTag = {
  key: string;
  label: string;
  match: (episode: Episode) => boolean;
};

let typedEpisodes: Episode[] = [];
let typedDialogues: Record<string, Dialogue> = {};
let typedAudio: Record<string, AudioEntry> = {};

const state = {
  query: "",
  activeTag: "all",
  selectedId: "",
  nowPlayingId: "",
  view: "list" as "list" | "detail",
};

let audioBound = false;

const coverThemes = {
  ux: { label: "UX", sub: "Design Review", className: "cover-ux" },
  pm: { label: "PM", sub: "Product Sense", className: "cover-pm" },
  cross: { label: "AI", sub: "Human + Model", className: "cover-cross" },
};

function episodeText(episode: Episode) {
  return [episode.id, episode.title, episode.collection, episode.module, episode.level, episode.essence, episode.framework, episode.followUps.join(" "), episode.tags.join(" "), episode.searchBlob]
    .join(" ")
    .toLowerCase();
}

function hasAny(episode: Episode, patterns: Array<string | RegExp>) {
  const text = episodeText(episode);
  return patterns.some((pattern) => (typeof pattern === "string" ? text.includes(pattern.toLowerCase()) : pattern.test(text)));
}

const filterTags: FilterTag[] = [
  { key: "all", label: "全部", match: () => true },
  { key: "ux", label: "UI/UX", match: (episode) => episode.role === "UI/UX" },
  { key: "pm", label: "产品经理", match: (episode) => episode.role === "PM" },
  { key: "ai", label: "AI 专题", match: (episode) => episode.isAi },
  { key: "cross", label: "人机协同", match: (episode) => episode.role === "AI-CROSS" || hasAny(episode, ["Human-in-the-loop", "人机协同", "人工兜底", "用户控制权"]) },
  { key: "senior", label: "中高级", match: (episode) => episode.tags.includes("中高级") },
  { key: "audio", label: "有音频", match: (episode) => Boolean(audioFor(episode.id)) },
  { key: "portfolio", label: "作品集", match: (episode) => hasAny(episode, ["作品集", "设计项目", "案例"]) },
  { key: "review", label: "项目复盘", match: (episode) => hasAny(episode, ["项目复盘", "复盘", "失败", "结果不好", "业务价值"]) },
  { key: "research", label: "用户研究", match: (episode) => hasAny(episode, ["用户研究", "用户访谈", "调研", "可用性", "用户反馈", "定性", "定量"]) },
  { key: "interaction", label: "交互体验", match: (episode) => hasAny(episode, ["交互", "体验", "流程", "表单", "确认流程", "多模态"]) },
  { key: "ia", label: "信息架构", match: (episode) => hasAny(episode, ["信息架构", "架构重构", "导航", "信息优先级", "结构"]) },
  { key: "design-system", label: "设计系统", match: (episode) => hasAny(episode, ["设计系统", "组件", "规范", "tokens", "一致性"]) },
  { key: "b2b", label: "B端系统", match: (episode) => hasAny(episode, ["b 端", "B 端", "后台", "中后台", "SaaS", "表格", "权限"]) },
  { key: "growth", label: "增长转化", match: (episode) => hasAny(episode, ["增长", "转化", "留存", "激活", "漏斗", "付费转化"]) },
  { key: "requirements", label: "需求分析", match: (episode) => hasAny(episode, ["需求", "PRD", "MVP", "伪需求", "需求池"]) },
  { key: "planning", label: "产品规划", match: (episode) => hasAny(episode, ["规划", "Roadmap", "优先级", "排序", "路线图"]) },
  { key: "data", label: "数据分析", match: (episode) => hasAny(episode, ["数据", "指标", "A/B", "实验", "北极星", "监控", "评估"]) },
  { key: "business", label: "商业化", match: (episode) => hasAny(episode, ["商业化", "会员", "付费", "收入", "定价", "商业模式"]) },
  { key: "competitor", label: "竞品行业", match: (episode) => hasAny(episode, ["竞品", "行业", "市场", "差异化"]) },
  { key: "skills", label: "专业技能", match: (episode) => hasAny(episode, ["技能", "方法", "框架", "工具", "工作流", "Prompt", "Figma", "PRD"]) },
  { key: "delivery", label: "项目推进", match: (episode) => hasAny(episode, ["推进", "落地", "排期", "资源", "风险", "上线", "节奏"]) },
  { key: "management", label: "团队管理", match: (episode) => hasAny(episode, ["管理", "团队", "绩效", "招聘", "向上", "老板"]) },
  { key: "collaboration", label: "跨团队协作", match: (episode) => hasAny(episode, ["协作", "跨部门", "沟通", "研发", "算法", "工程", "业务方", "评审"]) },
  { key: "tech", label: "技术理解", match: (episode) => hasAny(episode, ["技术", "架构", "接口", "性能", "延迟", "成本", "工程"]) },
  { key: "model-eval", label: "模型评估", match: (episode) => episode.isAi && hasAny(episode, ["模型评估", "模型评测", "评测", "准确率", "召回", "幻觉", "置信度"]) },
  { key: "rag", label: "RAG", match: (episode) => hasAny(episode, ["RAG", "检索增强", "知识库问答", "外部知识"]) },
  { key: "agent", label: "Agent", match: (episode) => hasAny(episode, ["Agent", "自动化", "执行计划"]) },
  { key: "security", label: "安全合规", match: (episode) => hasAny(episode, ["安全", "合规", "隐私", "权限", "风控"]) },
  { key: "cost-latency", label: "成本延迟", match: (episode) => hasAny(episode, ["成本", "延迟", "性能", "SLA"]) },
  { key: "hitl", label: "人工兜底", match: (episode) => hasAny(episode, ["人工兜底", "人工审核", "人工复核", "Human-in-the-loop"]) },
  { key: "trust", label: "信任机制", match: (episode) => hasAny(episode, ["信任", "可解释", "可追溯", "可撤销", "恢复", "透明"]) },
];

function formatDuration(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${minutes} 分钟`;
}

function getEpisode(id: string) {
  return typedEpisodes.find((episode) => episode.id === id) || typedEpisodes[0];
}

function audioFor(id: string) {
  return typedAudio[id];
}

function getFilteredEpisodes() {
  const query = state.query.trim().toLowerCase();
  const activeTag = filterTags.find((tag) => tag.key === state.activeTag) || filterTags[0];
  return typedEpisodes.filter((episode) => {
    if (!activeTag.match(episode)) return false;
    if (!query) return true;
    return episode.searchBlob.toLowerCase().includes(query);
  });
}

function icon(name: string) {
  const icons: Record<string, string> = {
    home: `<svg viewBox="0 0 24 24"><path d="M3 10.8 12 3l9 7.8V21h-6v-6H9v6H3z"/></svg>`,
    grid: `<svg viewBox="0 0 24 24"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/></svg>`,
    list: `<svg viewBox="0 0 24 24"><path d="M7 6h14M7 12h14M7 18h14"/><path d="M3 6h.01M3 12h.01M3 18h.01"/></svg>`,
    search: `<svg viewBox="0 0 24 24"><path d="m21 21-4.35-4.35"/><circle cx="11" cy="11" r="7"/></svg>`,
    play: `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`,
    pause: `<svg viewBox="0 0 24 24"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>`,
    back: `<svg viewBox="0 0 24 24"><path d="M11 19 3 12l8-7v14zM21 19l-8-7 8-7v14z"/></svg>`,
    forward: `<svg viewBox="0 0 24 24"><path d="m13 5 8 7-8 7V5zM3 5l8 7-8 7V5z"/></svg>`,
    plus: `<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>`,
    radio: `<svg viewBox="0 0 24 24"><path d="M5 12a7 7 0 0 1 14 0"/><path d="M8.5 12a3.5 3.5 0 0 1 7 0"/><path d="M12 12v8"/></svg>`,
    info: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 10v6M12 7h.01"/></svg>`,
    bookmark: `<svg viewBox="0 0 24 24"><path d="M6 4h12v17l-6-4-6 4z"/></svg>`,
    check: `<svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg>`,
    download: `<svg viewBox="0 0 24 24"><path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M4 20h16"/></svg>`,
  };
  return icons[name] || "";
}

function renderCover(episode: Episode, size: "hero" | "small" = "small") {
  const theme = coverThemes[episode.coverVariant];
  return `
    <div class="cover ${theme.className} ${size === "hero" ? "cover-hero" : ""}" aria-hidden="true">
      <div class="cover-noise"></div>
      <div class="cover-rings"></div>
      <div class="cover-kicker">${theme.sub}</div>
      <div class="cover-title">${episode.id}</div>
      <div class="cover-caption">${theme.label}</div>
    </div>
  `;
}

function renderLibraryControls() {
  return `
    <section class="library-controls">
      <label class="search-box">
        ${icon("search")}
        <input id="searchInput" type="search" placeholder="搜索题目、ID 或关键词" value="${escapeHtml(state.query)}" />
      </label>
      <div class="tag-filter-panel" aria-label="题目标签筛选">
        ${filterTags.map((tag) => tagButton(tag)).join("")}
      </div>
    </section>
  `;
}

function tagButton(tag: FilterTag) {
  const active = state.activeTag === tag.key;
  return `<button class="filter-chip ${active ? "is-active" : ""}" data-tag-filter="${tag.key}" aria-pressed="${active}">${tag.label}</button>`;
}

function renderTopbar(selected: Episode) {
  const playing = state.nowPlayingId === selected.id;
  const audio = audioFor(selected.id);
  return `
    <header class="topbar">
      <div class="transport">
        <button class="circle-button" data-player-action="prev" aria-label="上一集">${icon("back")}</button>
        <button class="play-button" data-player-action="toggle" aria-label="${playing ? "暂停" : "播放"}" ${audio ? "" : "disabled"}>${icon(playing ? "pause" : "play")}</button>
        <button class="circle-button" data-player-action="next" aria-label="下一集">${icon("forward")}</button>
      </div>
      <div class="now-card ${playing ? "is-playing" : ""}">
        ${renderCover(selected)}
        <div class="now-card-info">
          <strong>${escapeHtml(selected.title)}</strong>
          <span>${selected.id} · ${selected.collection} · ${audio ? "音频已就绪" : "音频待添加"}</span>
        </div>
        ${playing ? `<div class="wave-animation" aria-hidden="true"><span></span><span></span><span></span><span></span></div>` : ""}
      </div>
    </header>
  `;
}

function renderEpisodeGrid(episodesToShow: Episode[]) {
  if (!episodesToShow.length) {
    return `
      <section class="empty-state">
        <h2>没有匹配的节目</h2>
        <p>换一个关键词，或减少标签条件后再试。</p>
      </section>
    `;
  }
  return `
    <section class="section">
      <div class="episode-grid">
        ${episodesToShow.map((episode) => renderEpisodeTile(episode)).join("")}
      </div>
    </section>
  `;
}

function renderLibraryResults(episodesToShow: Episode[]) {
  return `
    ${renderEpisodeGrid(episodesToShow)}
  `;
}

function renderEpisodeTile(episode: Episode) {
  const active = state.selectedId === episode.id;
  const audio = audioFor(episode.id);
  const playing = state.nowPlayingId === episode.id;
  return `
    <article class="episode-tile ${active ? "is-selected" : ""} ${playing ? "is-playing" : ""}" data-select="${episode.id}" role="button" tabindex="0" aria-label="打开节目详情：${escapeHtml(episode.title)}">
      <div class="episode-cover-card compact card-${episode.coverVariant}">
        <h3>${escapeHtml(episode.title)}</h3>
        <small>${formatDuration(episode.durationSeconds)}</small>
      </div>
      <div class="tile-body">
        <p>${escapeHtml(episode.essence)}</p>
        <button class="pill-play ${playing ? "is-playing" : ""}" data-play="${episode.id}" ${audio ? "" : "disabled"}>
          ${playing ? `<div class="wave-animation mini" aria-hidden="true"><span></span><span></span><span></span></div>` : icon("play")}
          <span>${audio ? (playing ? "播放中" : "播放") : "待添加"}</span>
        </button>
      </div>
    </article>
  `;
}

function renderDetail(episode: Episode) {
  const dialogue = typedDialogues[episode.id];
  const audio = audioFor(episode.id);
  const playing = state.nowPlayingId === episode.id;
  return `
    <aside class="detail-panel">
      <button class="back-to-list" data-back-to-list>
        <span>‹</span>
        返回节目列表
      </button>
      ${renderCover(episode, "hero")}
      <div class="detail-heading">
        <p>${episode.id} · ${episode.collection}</p>
        <h1>${escapeHtml(episode.title)}</h1>
        <div class="chips">
          <span>${escapeHtml(episode.level || "社招通用")}</span>
          <span>${audio ? "音频已就绪" : "音频待添加"}</span>
        </div>
      </div>
      <button class="primary-listen ${playing ? "is-playing" : ""}" data-play="${episode.id}" ${audio ? "" : "disabled"}>
        ${playing ? `<div class="wave-animation mini white" aria-hidden="true"><span></span><span></span><span></span></div>` : icon("play")}
        <span>${audio ? (playing ? "暂停播放" : "播放这一集") : "把音频放入 public/audio 后可播放"}</span>
      </button>
      <section class="detail-section">
        <h2>考察本质</h2>
        <p>${escapeHtml(episode.essence)}</p>
      </section>
      <section class="detail-section">
        <h2>核心框架</h2>
        <p>${escapeHtml(episode.framework)}</p>
      </section>
      ${episode.followUps.length ? `<section class="detail-section"><h2>可能追问</h2><ul>${episode.followUps.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>` : ""}
      <section class="detail-section">
        <h2>对话脚本</h2>
        <div class="dialogue-list">
          ${(dialogue?.turns || []).map((turn) => `<div class="dialogue-turn ${turn.speaker === "男声" ? "host" : "guest"}"><strong>${turn.speaker}</strong><p>${escapeHtml(turn.line)}</p></div>`).join("")}
        </div>
      </section>
      <section class="detail-section refs">
        <h2>参考来源</h2>
        <p>${episode.references.map((ref) => `<code>${ref}</code>`).join(" ")}</p>
      </section>
    </aside>
  `;
}

function renderMain() {
  const filtered = getFilteredEpisodes();
  if (!filtered.some((episode) => episode.id === state.selectedId)) {
    state.selectedId = filtered[0]?.id || typedEpisodes[0]?.id || "";
  }
  const selected = getEpisode(state.selectedId);
  if (!selected) {
    renderError("没有读取到节目数据。请先运行 npm run generate:data。");
    return;
  }
  const topbarEpisode = state.nowPlayingId ? getEpisode(state.nowPlayingId) : selected;
  const viewClass = state.view === "detail" ? "is-detail-view" : "is-list-view";
  const main = `
      ${renderTopbar(topbarEpisode)}
      <div class="content-shell ${viewClass}">
        <div class="library-view">
          ${renderLibraryControls()}
          <div class="results-shell">
            ${renderLibraryResults(filtered)}
          </div>
        </div>
        ${renderDetail(selected)}
      </div>
  `;
  document.querySelector<HTMLElement>(".main-shell")!.innerHTML = main;
  bindControlsEvents();
  bindMainEvents();
  syncProgressUi();
}

function renderApp() {
  document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
    <main class="main-shell"></main>
  `;
  bindAudioEvents();
  renderMain();
}

function renderLoading() {
  document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
    <main class="main-shell">
      <section class="app-state">
        <h1>正在读取本地题库</h1>
        <p>从 public/data 加载节目、脚本和音频清单。</p>
      </section>
    </main>
  `;
}

function renderError(message: string) {
  document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
    <main class="main-shell">
      <section class="app-state is-error">
        <h1>题库加载失败</h1>
        <p>${escapeHtml(message)}</p>
      </section>
    </main>
  `;
}

function rerenderMain() {
  renderMain();
}

function rerenderLibraryResults() {
  const filtered = getFilteredEpisodes();
  if (!filtered.some((episode) => episode.id === state.selectedId)) {
    state.selectedId = filtered[0]?.id || typedEpisodes[0]?.id || "";
  }
  document.querySelector<HTMLElement>(".results-shell")!.innerHTML = renderLibraryResults(filtered);
  updateFilterStates();
  bindMainEvents();
}

function bindControlsEvents() {
  document.querySelector<HTMLInputElement>("#searchInput")?.addEventListener("input", (event) => {
    state.query = (event.target as HTMLInputElement).value;
    state.view = "list";
    rerenderLibraryResults();
  });

  document.querySelectorAll<HTMLElement>("[data-tag-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeTag = button.dataset.tagFilter || "all";
      state.view = "list";
      rerenderLibraryResults();
    });
  });
}

function updateFilterStates() {
  document.querySelectorAll<HTMLElement>("[data-tag-filter]").forEach((button) => {
    const active = button.dataset.tagFilter === state.activeTag;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function bindMainEvents() {
  document.querySelectorAll<HTMLElement>("[data-select]").forEach((card) => {
    const openDetail = () => {
      state.selectedId = card.dataset.select || state.selectedId;
      state.view = "detail";
      rerenderMain();
    };
    card.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      if (target.closest("[data-play]")) return;
      openDetail();
    });
    card.addEventListener("keydown", (event) => {
      if (event.target !== card || (event.key !== "Enter" && event.key !== " ")) return;
      event.preventDefault();
      openDetail();
    });
  });

  document.querySelector<HTMLElement>("[data-back-to-list]")?.addEventListener("click", () => {
    state.view = "list";
    rerenderMain();
  });

  document.querySelectorAll<HTMLElement>("[data-play]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const id = button.dataset.play || state.selectedId;
      const player = getAudioPlayer();
      if (player?.dataset.episodeId === id && !player.paused) {
        player.pause();
        return;
      }
      state.selectedId = id;
      state.nowPlayingId = id;
      rerenderMain();
      playSelected(id);
    });
  });

  document.querySelectorAll<HTMLElement>("[data-player-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.playerAction;
      if (action === "prev") selectRelative(-1);
      if (action === "next") selectRelative(1);
      if (action === "toggle") togglePlay();
    });
  });

}

function bindAudioEvents() {
  if (audioBound) return;
  const player = getAudioPlayer();
  if (!player) return;
  audioBound = true;
  player.addEventListener("timeupdate", syncProgressUi);
  player.addEventListener("ended", () => {
    state.nowPlayingId = "";
    rerenderMain();
  });
  player.addEventListener("play", () => {
    if (player.dataset.episodeId) state.nowPlayingId = player.dataset.episodeId;
    rerenderMain();
  });
  player.addEventListener("pause", () => {
    if (!player.ended) state.nowPlayingId = "";
    rerenderMain();
  });
}

function getAudioPlayer() {
  return document.querySelector<HTMLAudioElement>("#audioPlayer");
}

function syncProgressUi() {
  return;
}

function currentList() {
  const list = getFilteredEpisodes();
  return list.length ? list : typedEpisodes;
}

function selectRelative(delta: number) {
  const list = currentList();
  const baseId = state.nowPlayingId || state.selectedId;
  const index = Math.max(0, list.findIndex((episode) => episode.id === baseId));
  const next = list[(index + delta + list.length) % list.length];
  state.selectedId = next.id;
  if (!audioFor(next.id)) {
    const player = getAudioPlayer();
    if (player && !player.paused) player.pause();
    state.nowPlayingId = "";
    rerenderMain();
    return;
  }
  state.nowPlayingId = next.id;
  rerenderMain();
  playSelected(next.id);
}

function togglePlay() {
  const player = getAudioPlayer();
  if (!player) return;
  if (state.nowPlayingId && !player.paused) {
    player.pause();
    return;
  }
  const targetId = state.nowPlayingId || state.selectedId;
  if (!audioFor(targetId)) return;
  state.selectedId = targetId;
  state.nowPlayingId = targetId;
  rerenderMain();
  playSelected(targetId);
}

function playSelected(id = state.selectedId) {
  const player = getAudioPlayer();
  if (!player) return;
  const audio = audioFor(id);
  if (!audio) return;
  if (player.dataset.episodeId !== id) {
    player.src = audio.src;
    player.dataset.episodeId = id;
  }
  player.play().catch(() => {
    state.nowPlayingId = "";
    rerenderMain();
  });
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function loadJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} ${response.status}`);
  return response.json() as Promise<T>;
}

async function initApp() {
  renderLoading();
  try {
    const [episodes, dialogues, audioManifest] = await Promise.all([
      loadJson<Episode[]>("/data/episodes.json"),
      loadJson<Record<string, Dialogue>>("/data/dialogues.json"),
      loadJson<Record<string, AudioEntry>>("/data/audio-manifest.json"),
    ]);

    typedEpisodes = episodes;
    typedDialogues = dialogues;
    typedAudio = audioManifest;
    state.selectedId = typedEpisodes[0]?.id || "";
    renderApp();
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    renderError(`无法读取 /data 下的 JSON 文件：${message}`);
  }
}

initApp();
