import "./styles/app.css";

type Episode = {
  id: string;
  title: string;
  collection: string;
  role: "UI/UX" | "PM" | "AI-PM" | "AI-CROSS";
  module: string;
  type: "基础" | "中级" | "高级";
  level: string;
  essence: string;
  framework: string;
  followUps: string[];
  references: string[];
  tags: string[];
  isAi: boolean;
  durationSeconds: number;
  durationRangeSeconds?: {
    minSeconds: number;
    maxSeconds: number;
  };
  durationLabel?: string;
  coverVariant: "ux" | "pm" | "cross";
  searchBlob: string;
};

type Dialogue = {
  episodeId: string;
  estimatedSeconds: number;
  turns: Array<{ speaker: string; line: string }>;
};

type AudioEntry = {
  src: string;
  format: string;
  file: string;
  durationSeconds?: number;
};

type FilterTag = {
  key: string;
  label: string;
  icon: string;
  match: (episode: Episode) => boolean;
};

type RoleFilter = {
  key: Episode["role"];
  label: string;
  icon: string;
};

type GlossaryTerm = {
  term: string;
  aliases: string[];
  explanation: string;
};

let typedEpisodes: Episode[] = [];
let typedDialogues: Record<string, Dialogue> = {};
let typedAudio: Record<string, AudioEntry> = {};

const loadingDialogues = new Set<string>();

async function loadSingleDialogue(episodeId: string) {
  if (loadingDialogues.has(episodeId)) return;
  loadingDialogues.add(episodeId);
  try {
    const dialogue = await loadJson<Dialogue>(`/data/dialogues/${episodeId}.json`);
    typedDialogues[episodeId] = dialogue;
  } catch (error) {
    console.error(`加载剧本失败 ${episodeId}:`, error);
    // 缓存空数据防止无限请求
    typedDialogues[episodeId] = { episodeId, estimatedSeconds: 0, turns: [] };
  } finally {
    loadingDialogues.delete(episodeId);
    if (state.view === "detail" && state.selectedId === episodeId) {
      rerenderMain();
    }
  }
}

const state = {
  query: "",
  activeRole: "UI/UX" as Episode["role"],
  activeAbility: "all",
  visibleCount: 12,
  selectedId: "",
  playerEpisodeId: "",
  nowPlayingId: "",
  playerExpanded: false,
  libraryScrollTop: 0,
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

const roleFilters: RoleFilter[] = [
  { key: "UI/UX", label: "UI/UX 设计师", icon: "cursor" },
  { key: "PM", label: "产品经理", icon: "roadmap" },
  { key: "AI-PM", label: "AI 产品经理", icon: "bot" },
  { key: "AI-CROSS", label: "AI 交叉域", icon: "bot" },
];

const allAbilityTag: FilterTag = { key: "all", label: "全部题目", icon: "grid", match: () => true };

const abilityTagsByRole: Record<Episode["role"], FilterTag[]> = {
  "UI/UX": [
    allAbilityTag,
    { key: "portfolio", label: "作品集", icon: "bookmark", match: (episode) => hasAny(episode, ["作品集", "设计项目", "项目复盘", "案例", "核心贡献", "业务价值"]) },
    { key: "research", label: "用户研究", icon: "userSearch", match: (episode) => hasAny(episode, ["用户研究", "用户访谈", "调研", "可用性", "用户反馈", "定性", "定量", "用户洞察", "需求判断"]) },
    { key: "interaction", label: "交互设计", icon: "cursor", match: (episode) => hasAny(episode, ["交互", "体验", "流程", "表单", "信息架构", "导航", "信息优先级", "确认流程"]) },
    { key: "system", label: "设计系统", icon: "grid", match: (episode) => hasAny(episode, ["设计系统", "组件", "规范", "tokens", "一致性", "业务定制"]) },
    { key: "aiUx", label: "AI UX", icon: "bot", match: (episode) => episode.isAi || hasAny(episode, ["AI UX", "生成式 AI", "Agent", "模型", "幻觉", "渐进呈现", "体验指标"]) },
    { key: "collaboration", label: "协作推进", icon: "handshake", match: (episode) => hasAny(episode, ["协作", "产品经理", "研发", "业务方", "评审", "推进", "冲突", "质疑"]) },
  ],
  PM: [
    allAbilityTag,
    { key: "review", label: "项目复盘", icon: "rotate", match: (episode) => hasAny(episode, ["项目复盘", "复盘", "项目", "失败", "0 到 1", "核心贡献", "业务价值"]) },
    { key: "requirement", label: "需求分析", icon: "target", match: (episode) => hasAny(episode, ["需求", "伪需求", "需求池", "用户反馈", "优先级", "排序", "业务方"]) },
    { key: "product", label: "产品设计", icon: "roadmap", match: (episode) => hasAny(episode, ["产品设计", "PRD", "MVP", "流程", "方案设计", "功能", "上线", "验收"]) },
    { key: "growth", label: "数据增长", icon: "chart", match: (episode) => hasAny(episode, ["数据", "指标", "A/B", "实验", "北极星", "增长", "转化", "留存", "激活", "漏斗"]) },
    { key: "commercial", label: "商业化", icon: "target", match: (episode) => hasAny(episode, ["商业化", "会员", "付费", "收入", "定价", "商业模式", "SaaS 定价"]) },
    { key: "aiPm", label: "AI PM", icon: "bot", match: (episode) => episode.isAi || hasAny(episode, ["AI PM", "大模型", "RAG", "Agent", "Prompt", "模型", "知识库问答"]) },
    { key: "collaboration", label: "协作推进", icon: "handshake", match: (episode) => hasAny(episode, ["协作", "跨部门", "研发", "设计师", "算法", "业务方", "推进", "资源"]) },
  ],
  "AI-PM": [
    allAbilityTag,
    { key: "basic", label: "基础概念", icon: "info", match: (episode) => episode.type === "基础" },
    { key: "design", label: "产品设计", icon: "roadmap", match: (episode) => hasAny(episode, ["产品设计", "推荐", "冷启动", "定价", "MVP"]) },
    { key: "tech", label: "技术理解", icon: "bot", match: (episode) => hasAny(episode, ["技术理解", "模型", "参数", "架构", "成本", "RAG", "Agent"]) },
    { key: "project", label: "项目经验", icon: "check", match: (episode) => hasAny(episode, ["项目经验", "复盘", "迭代", "汇报", "协作", "评估"]) },
    { key: "ethics", label: "伦理安全", icon: "info", match: (episode) => hasAny(episode, ["伦理安全", "隐私", "合规", "偏见", "审核", "有害"]) },
  ],
  "AI-CROSS": [
    allAbilityTag,
    { key: "hallucination", label: "幻觉容错", icon: "info", match: (episode) => hasAny(episode, ["幻觉", "出错", "容错", "安全拦截", "投诉", "风险"]) },
    { key: "handoff", label: "人工兜底", icon: "handshake", match: (episode) => hasAny(episode, ["人工兜底", "人工", "转人工", "Human-in-the-loop", "交接", "复核"]) },
    { key: "control", label: "用户控制权", icon: "cursor", match: (episode) => hasAny(episode, ["用户控制权", "控制权", "可撤销", "恢复", "局部编辑", "再生成", "执行者"]) },
    { key: "explainability", label: "可解释性", icon: "info", match: (episode) => hasAny(episode, ["可解释", "来源引用", "证据链", "置信度", "不确定性", "透明"]) },
    { key: "boundary", label: "模型边界", icon: "target", match: (episode) => hasAny(episode, ["模型边界", "边界", "能力边界", "拒答", "安全", "隐私", "上下文记忆"]) },
    { key: "dataLoop", label: "数据闭环", icon: "chart", match: (episode) => hasAny(episode, ["数据闭环", "反馈闭环", "用户反馈", "反馈标签", "纠错", "体验指标", "业务指标"]) },
  ],
};

const pageSize = 12;

const glossaryTerms: GlossaryTerm[] = [
  { term: "STAR", aliases: ["star", "项目复盘", "复盘", "结果"], explanation: "一种项目叙事结构：Situation 背景、Task 任务、Action 行动、Result 结果，适合回答项目经历和复盘题。" },
  { term: "业务价值", aliases: ["业务价值", "业务问题", "商业价值"], explanation: "设计或产品动作对增长、效率、收入、成本、风险等业务指标产生的可说明影响。" },
  { term: "用户研究", aliases: ["用户研究", "用户访谈", "调研", "可用性", "用户反馈"], explanation: "通过访谈、观察、问卷、可用性测试等方式理解用户目标、行为和痛点。" },
  { term: "信息架构", aliases: ["信息架构", "导航", "结构", "信息优先级"], explanation: "组织信息、功能和导航路径的方式，目标是让用户更快理解和完成任务。" },
  { term: "设计系统", aliases: ["设计系统", "组件", "规范", "tokens", "一致性"], explanation: "由组件、样式变量、交互规范和治理机制组成的设计资产体系。" },
  { term: "MVP", aliases: ["mvp", "最小可行", "冷启动"], explanation: "Minimum Viable Product，指用最小范围验证核心假设的产品版本。" },
  { term: "PRD", aliases: ["prd", "需求文档"], explanation: "Product Requirement Document，用于描述目标、范围、流程、规则、验收标准和依赖。" },
  { term: "北极星指标", aliases: ["北极星指标", "北极星"], explanation: "能代表产品长期核心价值的关键指标，用于统一团队目标和优先级。" },
  { term: "A/B 实验", aliases: ["a/b", "ab 实验", "ab实验"], explanation: "将用户分流到不同方案，用数据比较方案对关键指标的影响。" },
  { term: "Roadmap", aliases: ["roadmap", "路线图", "规划"], explanation: "产品在一段时间内的主题、优先级和里程碑安排。" },
  { term: "RAG", aliases: ["rag", "检索增强", "知识库问答", "外部知识"], explanation: "Retrieval-Augmented Generation，通过检索外部知识再生成回答，降低模型胡编和知识过期风险。" },
  { term: "Agent", aliases: ["agent", "自动化", "执行计划"], explanation: "能够理解目标、规划步骤、调用工具并执行任务的 AI 产品形态。" },
  { term: "Human-in-the-loop", aliases: ["human-in-the-loop", "人工兜底", "人工审核", "人工复核"], explanation: "在关键节点引入人工确认、审核或接管，降低 AI 出错带来的业务风险。" },
  { term: "模型幻觉", aliases: ["幻觉", "出错", "不确定", "置信度"], explanation: "模型生成看似合理但事实错误或无依据内容的现象，需要通过提示、检索、校验和界面兜底控制风险。" },
  { term: "可解释性", aliases: ["可解释", "透明", "理由", "依据"], explanation: "让用户理解系统为什么给出某个结果、依据是什么、可信边界在哪里。" },
  { term: "可追溯", aliases: ["可追溯", "日志", "审计"], explanation: "保留关键输入、输出、操作和决策链路，便于复盘、纠错和合规审查。" },
  { term: "可撤销", aliases: ["可撤销", "撤销", "恢复"], explanation: "允许用户撤回、回滚或恢复操作，是高风险自动化场景的重要安全感来源。" },
  { term: "延迟", aliases: ["延迟", "性能", "sla"], explanation: "用户从发起请求到获得结果的等待时间，AI 产品中会直接影响信任和使用意愿。" },
  { term: "成本", aliases: ["成本", "token", "算力"], explanation: "模型调用、检索、存储和人工审核等资源消耗，需要和体验质量及商业模型一起权衡。" },
  { term: "安全合规", aliases: ["安全", "合规", "隐私", "权限", "风控"], explanation: "围绕数据、权限、内容、审计和法律要求建立的产品与技术约束。" },
];

function difficultyClass(type: Episode["type"]) {
  return type === "高级" ? "advanced" : type === "中级" ? "intermediate" : "basic";
}

function difficultyIcon(type: Episode["type"]) {
  if (type === "高级") {
    return `
      <svg class="icon-level" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M4 20h16"></path>
        <path d="M7 17v3"></path>
        <path d="M12 12v8"></path>
        <path d="M17 7v13"></path>
        <path d="m14 7 3-3 3 3"></path>
      </svg>
    `;
  }
  if (type === "中级") {
    return `
      <svg class="icon-level" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M4 20h16"></path>
        <path d="M8 16v4"></path>
        <path d="M14 11v9"></path>
        <path d="m11 11 3-3 3 3"></path>
      </svg>
    `;
  }
  return `
    <svg class="icon-level" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M5 20h14"></path>
      <path d="M8 16v4"></path>
      <path d="M12 16h4"></path>
    </svg>
  `;
}

function renderDifficultyLabel(episode: Episode) {
  return `
    <div class="difficulty-label difficulty-${difficultyClass(episode.type)}">
      ${difficultyIcon(episode.type)}
      <span>${episode.type}</span>
    </div>
  `;
}

function renderAbilityLabel(episode: Episode) {
  const tag = primaryAbilityTag(episode);
  if (!tag) return `<div class="topic-label"><span>综合能力</span></div>`;
  return `
    <div class="topic-label">
      <span class="topic-icon">${icon(tag.icon)}</span>
      <span>${tag.label}</span>
    </div>
  `;
}

function difficultyScore(type: Episode["type"]) {
  if (type === "高级") return 5;
  if (type === "中级") return 3;
  return 1;
}

function formatPlaybackTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const rest = String(total % 60).padStart(2, "0");
  return `${minutes}:${rest}`;
}

function formatAudioDuration(episode: Episode) {
  const audio = audioFor(episode.id);
  return audio?.durationSeconds ? formatPlaybackTime(audio.durationSeconds) : "暂无音频";
}

function getEpisode(id: string) {
  return typedEpisodes.find((episode) => episode.id === id) || typedEpisodes[0];
}

function audioFor(id: string) {
  return typedAudio[id];
}

function colorVariantForEpisode(episode: Episode) {
  const idNum = parseInt(episode.id.replace(/\D/g, ""), 10) || 0;
  return idNum % 6;
}

function matchedGlossaryTerms(episode: Episode) {
  let text = episodeText(episode);
  const dialogue = typedDialogues[episode.id];
  if (dialogue && dialogue.turns) {
    const dialogueText = dialogue.turns.map((turn) => turn.line).join(" ");
    text += " " + dialogueText;
  }
  const matches = glossaryTerms.filter((item) => item.aliases.some((alias) => text.toLowerCase().includes(alias.toLowerCase())));
  return matches.slice(0, 8);
}

function adjacentEpisodes(id: string) {
  const scoped = currentList();
  const list = scoped.some((episode) => episode.id === id) ? scoped : typedEpisodes;
  const index = Math.max(0, list.findIndex((episode) => episode.id === id));
  return {
    previous: list[(index - 1 + list.length) % list.length],
    next: list[(index + 1) % list.length],
  };
}

function nextQueueEpisodes(id: string, count: number) {
  const scoped = currentList();
  const list = scoped.some((episode) => episode.id === id) ? scoped : typedEpisodes;
  if (!list.length) return [];
  const index = Math.max(0, list.findIndex((episode) => episode.id === id));
  const queue: Episode[] = [];
  for (let offset = 1; offset < list.length && queue.length < count; offset += 1) {
    const episode = list[(index + offset) % list.length];
    if (audioFor(episode.id)) queue.push(episode);
  }
  return queue;
}

function activeRoleFilter() {
  return roleFilters.find((role) => role.key === state.activeRole) || roleFilters[0];
}

function currentAbilityTags() {
  return abilityTagsByRole[state.activeRole] || abilityTagsByRole["UI/UX"];
}

function activeAbilityTag() {
  return currentAbilityTags().find((tag) => tag.key === state.activeAbility) || currentAbilityTags()[0];
}

function getFilteredEpisodes() {
  const query = state.query.trim().toLowerCase();
  const activeTag = activeAbilityTag();
  return typedEpisodes.filter((episode) => {
    if (episode.role !== state.activeRole) return false;
    if (!activeTag.match(episode)) return false;
    if (!query) return true;
    return episode.searchBlob.toLowerCase().includes(query);
  });
}

function getAbilityEpisodes() {
  const activeTag = activeAbilityTag();
  return typedEpisodes.filter((episode) => episode.role === state.activeRole && activeTag.match(episode));
}

function recommendedEpisodes() {
  return getAbilityEpisodes()
    .map((episode, index) => ({
      episode,
      score:
        (episode.level.includes("高频") ? 8 : 0) +
        difficultyScore(episode.type) +
        (audioFor(episode.id) ? 3 : 0) +
        (episode.tags.includes("中高级") ? 2 : 0) -
        index / 1000,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((item) => item.episode);
}

function activeRoleLabel() {
  return activeRoleFilter().label;
}

function primaryAbilityTag(episode: Episode) {
  return (abilityTagsByRole[episode.role] || [])
    .filter((tag) => tag.key !== "all")
    .find((tag) => tag.match(episode)) || null;
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
    chevronUp: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"></polyline></svg>`,
    chevronDown: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>`,
    rotate: `<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v6h6"/></svg>`,
    target: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></svg>`,
    userSearch: `<svg viewBox="0 0 24 24"><circle cx="10" cy="8" r="4"/><path d="M3 21a7 7 0 0 1 11-5.7"/><circle cx="17" cy="17" r="3"/><path d="m21 21-2-2"/></svg>`,
    cursor: `<svg viewBox="0 0 24 24"><path d="m4 3 7.5 18 2.4-7.4L21 11z"/></svg>`,
    roadmap: `<svg viewBox="0 0 24 24"><path d="M6 5h11a3 3 0 0 1 0 6H7a3 3 0 0 0 0 6h11"/><circle cx="6" cy="5" r="2"/><circle cx="18" cy="19" r="2"/></svg>`,
    chart: `<svg viewBox="0 0 24 24"><path d="M4 19V5"/><path d="M4 19h16"/><path d="m7 15 4-4 3 3 5-7"/></svg>`,
    bot: `<svg viewBox="0 0 24 24"><rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 4v4"/><path d="M9 13h.01M15 13h.01"/><path d="M9 17h6"/></svg>`,
    handshake: `<svg viewBox="0 0 24 24"><path d="m7 12 3-3 4 4 1.5-1.5a2.1 2.1 0 0 1 3 0L21 14"/><path d="m3 14 3-3 6 6a2 2 0 0 0 3 0l1-1"/><path d="M3 9h4M17 9h4"/></svg>`,
    close: `<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>`,
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

function renderRoleTags(className = "") {
  return `
    <div class="ability-tags ${className}" aria-label="职位筛选">
      ${roleFilters.map((role) => roleButton(role)).join("")}
    </div>
  `;
}

function roleButton(role: RoleFilter) {
  const active = state.activeRole === role.key;
  return `
    <button class="ability-chip ${active ? "is-active" : ""}" data-role-filter="${role.key}" aria-pressed="${active}">
      <span class="ability-icon">${icon(role.icon)}</span>
      <span>${role.label}</span>
    </button>
  `;
}

function renderAbilityTags(className = "") {
  return `
    <div class="ability-tags ${className}" aria-label="能力方向筛选">
      ${currentAbilityTags().map((tag) => tagButton(tag)).join("")}
    </div>
  `;
}

function renderStickyTags(mode: "role" | "ability") {
  return mode === "ability" ? renderAbilityTags("sticky-tags") : renderRoleTags("sticky-tags");
}

function tagButton(tag: FilterTag) {
  const active = state.activeAbility === tag.key;
  return `
    <button class="ability-chip ${active ? "is-active" : ""}" data-ability-filter="${tag.key}" aria-pressed="${active}">
      <span class="ability-icon">${icon(tag.icon)}</span>
      <span>${tag.label}</span>
    </button>
  `;
}

function renderWelcomeHero() {
  return `
    <section class="welcome-hero" aria-label="面试题库介绍">
      <div class="welcome-copy">
        <div class="hero-pill">
          <svg viewBox="0 0 24 24" class="pill-icon"><path d="m12 3 2.1 6.5L21 11l-6.9 1.5L12 19l-2.1-6.5L3 11l6.9-1.5z"/></svg>
          <span>Focus. Practice. Excel.</span>
        </div>
        <h1><span class="text-gradient">把面试题练成</span><br/><span class="text-solid">能说出口的回答</span></h1>
        <p>覆盖 UI/UX、产品经理与 AI 跨域面试，帮你按能力方向找到题目，理解考察重点、回答框架和可能追问。</p>
      </div>
      ${renderRoleTags("hero-tags")}
    </section>
  `;
}

function renderSearchControls() {
  return `
    <section class="library-controls" aria-label="全部内容搜索">
      <label class="search-box">
        ${icon("search")}
        <input id="searchInput" type="search" placeholder="搜索题目、ID 或关键词" value="${escapeHtml(state.query)}" />
      </label>
    </section>
  `;
}

function renderFloatingPlayer(selected: Episode) {
  const playing = state.nowPlayingId === selected.id;
  const audio = audioFor(selected.id);
  const expanded = state.playerExpanded;
  const queue = nextQueueEpisodes(selected.id, 2);
  return `
    <div class="floating-player ${expanded ? "is-expanded" : "is-collapsed"}" data-floating-player>
      <div class="fp-inner">
        <div class="fp-cover">
          ${
            expanded
              ? renderCover(selected)
              : `<div class="fp-time-disc ${playing ? "is-spinning" : ""}">
                  <span data-player-current>0:00</span>
                  <button class="fp-cover-play" data-player-action="toggle" aria-label="${playing ? "暂停" : "播放"}" ${audio ? "" : "disabled"}>${icon(playing ? "pause" : "play")}</button>
                </div>`
          }
        </div>
        <div class="fp-info">
          <strong>${escapeHtml(selected.title)}</strong>
          ${expanded ? `<span>${selected.id} · ${audio ? "音频已就绪" : "音频待添加"}</span>` : ""}
        </div>
        ${
          expanded
            ? `<div class="fp-controls">
                <button class="play-button" data-player-action="toggle" aria-label="${playing ? "暂停" : "播放"}" ${audio ? "" : "disabled"}>${icon(playing ? "pause" : "play")}</button>
              </div>`
            : ""
        }
      </div>
      ${expanded ? `
        <div class="fp-expanded-panel">
          <div class="fp-time-controls">
            <span data-player-current>0:00</span>
            <input
              class="player-progress-range"
              type="range"
              min="0"
              max="1000"
              step="1"
              value="0"
              data-player-seek
              aria-label="播放进度"
              ${audio ? "" : "disabled"}
            />
            <span data-player-duration>0:00</span>
          </div>
          <div class="fp-up-next" aria-label="接下来播放">
            <p>接下来</p>
            ${queue.length ? queue.map((episode) => renderQueueEpisode(episode)).join("") : `<span class="fp-queue-empty">暂无后续可播放音频</span>`}
          </div>
        </div>
      ` : ""}
    </div>
  `;
}

function renderQueueEpisode(episode: Episode) {
  return `
    <button class="fp-queue-item" data-queue-play="${episode.id}" aria-label="播放：${escapeHtml(episode.title)}">
      <div class="fp-queue-cover">
        ${renderCover(episode)}
      </div>
      <span class="fp-queue-title">${escapeHtml(episode.title)}</span>
      <span class="fp-queue-duration">${formatAudioDuration(episode)}</span>
    </button>
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
  const recommended = recommendedEpisodes();
  const visible = episodesToShow.slice(0, state.visibleCount);
  const hasMore = episodesToShow.length > visible.length;
  const roleLabel = activeRoleLabel();
  const ability = activeAbilityTag();
  const abilityLabel = ability.key === "all" ? "" : ability.label;

  return `
    <section class="content-block">
      <div class="section-heading">
        <h2>${abilityLabel ? `${escapeHtml(roleLabel)} · ${escapeHtml(abilityLabel)}热门推荐` : `${escapeHtml(roleLabel)}热门推荐`}</h2>
        <p>优先展示更高频、更适合先练习的面试题。</p>
      </div>
      ${renderEpisodeGrid(recommended)}
    </section>
    <section class="content-block">
      <div class="section-heading section-heading-with-search library-heading-stack">
        <div class="library-title-row">
          <h2>${abilityLabel ? `${escapeHtml(roleLabel)} · ${escapeHtml(abilityLabel)}` : `${escapeHtml(roleLabel)}全部题目`}</h2>
          <div class="library-search-slot">
            ${renderSearchControls()}
          </div>
        </div>
        ${renderAbilityTags("content-tags")}
      </div>
      ${renderEpisodeGrid(visible)}
      ${
        hasMore
          ? `<div class="load-more-wrap"><button class="load-more-button" data-load-more>展开更多</button></div>`
          : episodesToShow.length
            ? `<p class="all-shown">已显示全部内容</p>`
            : ""
      }
    </section>
  `;
}

function renderEpisodeTile(episode: Episode) {
  const active = state.selectedId === episode.id;
  const audio = audioFor(episode.id);
  const playing = state.nowPlayingId === episode.id;
  const colorIndex = colorVariantForEpisode(episode);

  return `
    <article class="episode-tile ${active ? "is-selected" : ""} ${playing ? "is-playing" : ""}" data-select="${episode.id}" role="button" tabindex="0" aria-label="打开节目详情：${escapeHtml(episode.title)}">
      <div class="tile-cover-wrapper color-variant-${colorIndex}">
        <div class="cover-noise"></div>
        <div class="cover-rings"></div>
        <div class="cover-center-title">${escapeHtml(episode.title)}</div>
      </div>
      <div class="tile-content">
        <p class="tile-essence">${escapeHtml(episode.essence)}</p>
        <div class="tile-footer">
          <div class="tile-footer-meta">
            ${renderDifficultyLabel(episode)}
            <span class="meta-separator" aria-hidden="true">｜</span>
            ${renderAbilityLabel(episode)}
          </div>
          <button class="tile-play-btn ${playing ? "is-playing" : ""}" data-play="${episode.id}" ${audio ? "" : "disabled"}>
            ${playing ? `<div class="wave-animation mini" aria-hidden="true"><span></span><span></span><span></span></div>` : ""}
            <span>${audio ? (playing ? "播放中" : "立即学习") : "音频待添加"}</span>
          </button>
        </div>
      </div>
    </article>
  `;
}

function renderDetail(episode: Episode) {
  const dialogue = typedDialogues[episode.id];
  const audio = audioFor(episode.id);
  const playing = state.nowPlayingId === episode.id;
  const glossary = matchedGlossaryTerms(episode);
  const { previous, next } = adjacentEpisodes(episode.id);
  const colorIndex = colorVariantForEpisode(episode);

  if (!dialogue) {
    loadSingleDialogue(episode.id);
  }

  let dialogueHtml = "";
  if (dialogue) {
    if (dialogue.turns && dialogue.turns.length > 0) {
      dialogueHtml = dialogue.turns.map((turn) => {
        const isHost = turn.speaker === "面试官" || turn.speaker === "男声";
        return `<div class="dialogue-turn ${isHost ? "host" : "guest"}"><strong>${turn.speaker}</strong><p>${escapeHtml(turn.line)}</p></div>`;
      }).join("");
    } else {
      dialogueHtml = `<p class="dialogue-empty">暂无情景模拟剧本</p>`;
    }
  } else {
    dialogueHtml = `<div class="dialogue-loading">正在加载情景模拟剧本...</div>`;
  }

  return `
    <aside class="detail-panel">
      <button class="drawer-close" data-close-drawer aria-label="关闭详情">
        ${icon("close")}
      </button>
      <div class="detail-scroll">
        <div class="detail-heading detail-title-card color-variant-${colorIndex}">
          <div class="cover-noise"></div>
          <div class="cover-rings"></div>
          <div class="detail-meta">
            ${renderDifficultyLabel(episode)}
            <span class="meta-separator" aria-hidden="true">｜</span>
            ${renderAbilityLabel(episode)}
          </div>
          <div class="detail-title-copy">
            <h1>${escapeHtml(episode.title)}</h1>
          </div>
        </div>
        <section class="insight-compact" aria-label="面试拆解">
          <article>
            <strong>考察本质</strong>
            <p>${escapeHtml(episode.essence)}</p>
          </article>
          <article>
            <strong>核心框架</strong>
            <p>${escapeHtml(episode.framework)}</p>
          </article>
          ${episode.followUps.length ? `<article><strong>可能追问</strong><ul>${episode.followUps.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></article>` : ""}
        </section>
        ${glossary.length ? `<section class="detail-section glossary-section"><h2>专业术语解释</h2><div class="glossary-list">${glossary.map((item) => `<span class="glossary-term" tabindex="0">${escapeHtml(item.term)}<span class="glossary-tooltip">${escapeHtml(item.explanation)}</span></span>`).join("")}</div></section>` : ""}
        <section class="detail-section">
          <div class="detail-section-header">
            <h2>情景模拟</h2>
            <button class="detail-play-button ${playing ? "is-playing" : ""}" data-play="${episode.id}" ${audio ? "" : "disabled"}>
              ${playing ? `<div class="wave-animation mini white" aria-hidden="true"><span></span><span></span><span></span></div>` : icon("play")}
              <span>${audio ? (playing ? "暂停" : "播放") : "待添加音频"}</span>
            </button>
          </div>
          <div class="dialogue-list">
            ${dialogueHtml}
          </div>
        </section>
        <nav class="detail-nav" aria-label="题目切换">
          <button data-detail-nav="${previous.id}"><span>上一题</span><strong>${escapeHtml(previous.title)}</strong></button>
          <button data-detail-nav="${next.id}"><span>下一题</span><strong>${escapeHtml(next.title)}</strong></button>
        </nav>
      </div>
    </aside>
  `;
}

function renderMain() {
  const existingLibrary = document.querySelector<HTMLElement>(".library-view");
  if (existingLibrary && state.view !== "detail") state.libraryScrollTop = existingLibrary.scrollTop;
  const filtered = getFilteredEpisodes();
  if (!filtered.some((episode) => episode.id === state.selectedId)) {
    state.selectedId = filtered[0]?.id || typedEpisodes[0]?.id || "";
  }
  const selected = getEpisode(state.selectedId);
  if (!selected) {
    renderError("没有读取到节目数据。请先运行 npm run generate:data。");
    return;
  }
  const topbarEpisode = getEpisode(state.playerEpisodeId) || selected;
  const viewClass = state.view === "detail" ? "is-detail-view" : "is-list-view";
  const main = `
      <div class="content-shell ${viewClass}">
        <div class="library-view">
          ${renderWelcomeHero()}
          <section class="content-start" id="contentStart">
            <div class="sticky-ability-bar">
              ${renderStickyTags("role")}
            </div>
            <div class="results-shell">
              ${renderLibraryResults(filtered)}
            </div>
          </section>
        </div>
        <button class="drawer-backdrop" data-close-drawer aria-label="关闭详情蒙版"></button>
        ${renderDetail(selected)}
      </div>
      ${renderFloatingPlayer(topbarEpisode)}
  `;
  document.querySelector<HTMLElement>(".main-shell")!.innerHTML = main;
  const nextLibrary = document.querySelector<HTMLElement>(".library-view");
  if (nextLibrary) {
    nextLibrary.scrollTop = state.libraryScrollTop;
    window.setTimeout(() => {
      nextLibrary.scrollTop = state.libraryScrollTop;
      updateStickyBarMode();
    }, 0);
  }
  bindControlsEvents();
  bindMainEvents();
  syncProgressUi();
}

function renderDetailLayer() {
  const selected = getEpisode(state.selectedId);
  if (!selected) return;
  const shell = document.querySelector<HTMLElement>(".content-shell");
  const currentPanel = document.querySelector<HTMLElement>(".detail-panel");
  if (!shell || !currentPanel) {
    renderMain();
    return;
  }
  shell.classList.toggle("is-detail-view", state.view === "detail");
  shell.classList.toggle("is-list-view", state.view !== "detail");
  currentPanel.outerHTML = renderDetail(selected);
  bindMainEvents();
  syncProgressUi();
}

function renderFloatingPlayerLayer() {
  const selected = getEpisode(state.selectedId) || typedEpisodes[0];
  if (!selected) return;
  const topbarEpisode = getEpisode(state.playerEpisodeId) || selected;
  const currentPlayer = document.querySelector<HTMLElement>("[data-floating-player]");
  if (!currentPlayer) {
    renderMain();
    return;
  }
  currentPlayer.outerHTML = renderFloatingPlayer(topbarEpisode);
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
  if (state.view === "detail") {
    renderDetailLayer();
    renderFloatingPlayerLayer();
    return;
  }
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
  bindControlsEvents();
  updateStickyBarMode();
}

function updateStickyBarMode() {
  const stickyBar = document.querySelector<HTMLElement>(".sticky-ability-bar");
  const contentTags = document.querySelector<HTMLElement>(".content-tags");
  if (!stickyBar || !contentTags) return;

  const stickyHeight = stickyBar.offsetHeight || 58;
  const shouldShowAbility = contentTags.getBoundingClientRect().top <= stickyHeight + 2;
  const nextMode = shouldShowAbility ? "ability" : "role";
  if (stickyBar.dataset.stickyMode === nextMode) return;

  stickyBar.dataset.stickyMode = nextMode;
  stickyBar.innerHTML = renderStickyTags(nextMode);
  bindControlsEvents();
  updateFilterStates();
}

function bindControlsEvents() {
  const floatingPlayer = document.querySelector<HTMLElement>("[data-floating-player]");
  if (floatingPlayer && !floatingPlayer.dataset.controlBound) {
    floatingPlayer.dataset.controlBound = "true";
    floatingPlayer.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("button, input")) return;
      state.playerExpanded = !state.playerExpanded;
      rerenderMain();
    });
  }

  const searchInput = document.querySelector<HTMLInputElement>("#searchInput");
  if (searchInput && !searchInput.dataset.controlBound) {
    searchInput.dataset.controlBound = "true";
    searchInput.addEventListener("input", (event) => {
      const value = (event.target as HTMLInputElement).value;
      state.query = value;
      state.visibleCount = pageSize;
      state.view = "list";
      rerenderLibraryResults();
      const nextInput = document.querySelector<HTMLInputElement>("#searchInput");
      nextInput?.focus();
      nextInput?.setSelectionRange(value.length, value.length);
    });
  }

  document.querySelectorAll<HTMLElement>("[data-role-filter]").forEach((button) => {
    if (button.dataset.controlBound) return;
    button.dataset.controlBound = "true";
    button.addEventListener("click", () => {
      state.activeRole = (button.dataset.roleFilter as Episode["role"]) || "UI/UX";
      state.activeAbility = "all";
      state.visibleCount = pageSize;
      state.view = "list";
      renderMain();
      scrollToContentStart();
    });
  });

  document.querySelectorAll<HTMLElement>("[data-ability-filter]").forEach((button) => {
    if (button.dataset.controlBound) return;
    button.dataset.controlBound = "true";
    button.addEventListener("click", () => {
      state.activeAbility = button.dataset.abilityFilter || "all";
      state.visibleCount = pageSize;
      state.view = "list";
      rerenderLibraryResults();
    });
  });

  const loadMore = document.querySelector<HTMLElement>("[data-load-more]");
  if (loadMore && !loadMore.dataset.controlBound) {
    loadMore.dataset.controlBound = "true";
    loadMore.addEventListener("click", () => {
    state.visibleCount += pageSize;
    rerenderLibraryResults();
    });
  }

  const libraryView = document.querySelector<HTMLElement>(".library-view");
  const stickyBar = document.querySelector<HTMLElement>(".sticky-ability-bar");
  const heroTags = document.querySelector<HTMLElement>(".hero-tags");

  if (libraryView && stickyBar && heroTags && !libraryView.dataset.scrollBound) {
    libraryView.dataset.scrollBound = "true";
    libraryView.addEventListener("scroll", updateStickyBarMode, { passive: true });
    
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (entry.intersectionRatio < 1 && entry.boundingClientRect.top < window.innerHeight / 2) {
        stickyBar.classList.add("is-visible");
      } else {
        stickyBar.classList.remove("is-visible");
      }
    }, {
      root: libraryView,
      threshold: [1.0]
    });
    
    observer.observe(heroTags);
    updateStickyBarMode();
  }
}

function updateFilterStates() {
  document.querySelectorAll<HTMLElement>("[data-role-filter]").forEach((button) => {
    const active = button.dataset.roleFilter === state.activeRole;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  document.querySelectorAll<HTMLElement>("[data-ability-filter]").forEach((button) => {
    const active = button.dataset.abilityFilter === state.activeAbility;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function scrollToContentStart() {
  window.setTimeout(() => {
    const library = document.querySelector<HTMLElement>(".library-view");
    const target = document.querySelector<HTMLElement>("#contentStart");
    if (!library || !target) return;
    library.scrollTo({ top: target.offsetTop - 2, behavior: "smooth" });
  }, 0);
}

function closeDrawer() {
  if (state.view !== "detail") return;
  state.libraryScrollTop = document.querySelector<HTMLElement>(".library-view")?.scrollTop ?? state.libraryScrollTop;
  state.view = "list";
  const shell = document.querySelector<HTMLElement>(".content-shell");
  if (!shell) {
    rerenderMain();
    return;
  }
  shell.classList.remove("is-detail-view");
  shell.classList.add("is-list-view");
}

function bindMainEvents() {
  document.querySelectorAll<HTMLElement>("[data-select]").forEach((card) => {
    if (card.dataset.mainBound) return;
    card.dataset.mainBound = "true";
    const openDetail = () => {
      state.libraryScrollTop = document.querySelector<HTMLElement>(".library-view")?.scrollTop ?? state.libraryScrollTop;
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

  document.querySelectorAll<HTMLElement>(".drawer-close[data-close-drawer]").forEach((button) => {
    if (button.dataset.mainBound) return;
    button.dataset.mainBound = "true";
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeDrawer();
    });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeDrawer();
    });
  });

  document.querySelectorAll<HTMLElement>(".drawer-backdrop[data-close-drawer]").forEach((button) => {
    if (button.dataset.mainBound) return;
    button.dataset.mainBound = "true";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeDrawer();
    });
  });

  document.querySelectorAll<HTMLElement>("[data-detail-nav]").forEach((button) => {
    if (button.dataset.mainBound) return;
    button.dataset.mainBound = "true";
    button.addEventListener("click", () => {
      state.selectedId = button.dataset.detailNav || state.selectedId;
      state.view = "detail";
      rerenderMain();
    });
  });

  document.querySelectorAll<HTMLElement>("[data-play]").forEach((button) => {
    if (button.dataset.mainBound) return;
    button.dataset.mainBound = "true";
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const id = button.dataset.play || state.selectedId;
      const player = getAudioPlayer();
      if (player?.dataset.episodeId === id && !player.paused) {
        player.pause();
        return;
      }
      state.selectedId = id;
      state.playerEpisodeId = id;
      state.nowPlayingId = id;
      rerenderMain();
      playSelected(id);
    });
  });

  document.querySelectorAll<HTMLElement>("[data-player-action]").forEach((button) => {
    if (button.dataset.mainBound) return;
    button.dataset.mainBound = "true";
    button.addEventListener("click", () => {
      const action = button.dataset.playerAction;
      if (action === "prev") selectRelative(-1);
      if (action === "next") selectRelative(1);
      if (action === "toggle") togglePlay();
    });
  });

  document.querySelectorAll<HTMLElement>("[data-queue-play]").forEach((button) => {
    if (button.dataset.mainBound) return;
    button.dataset.mainBound = "true";
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const id = button.dataset.queuePlay;
      if (!id) return;
      state.selectedId = id;
      state.playerEpisodeId = id;
      state.nowPlayingId = id;
      state.playerExpanded = true;
      rerenderMain();
      playSelected(id);
    });
  });

  const seekInput = document.querySelector<HTMLInputElement>("[data-player-seek]");
  if (seekInput && !seekInput.dataset.mainBound) {
    seekInput.dataset.mainBound = "true";
    seekInput.addEventListener("input", (event) => {
    const player = getAudioPlayer();
    if (!player || !Number.isFinite(player.duration) || player.duration <= 0) return;
    const range = event.currentTarget;
    player.currentTime = (Number(range.value) / 1000) * player.duration;
    syncProgressUi();
    });
  }
}

function bindAudioEvents() {
  if (audioBound) return;
  const player = getAudioPlayer();
  if (!player) return;
  audioBound = true;
  player.addEventListener("timeupdate", syncProgressUi);
  player.addEventListener("loadedmetadata", syncProgressUi);
  player.addEventListener("durationchange", syncProgressUi);
  player.addEventListener("seeked", syncProgressUi);
  player.addEventListener("ended", () => {
    state.nowPlayingId = "";
    syncProgressUi();
    rerenderMain();
  });
  player.addEventListener("play", () => {
    if (player.dataset.episodeId) {
      state.playerEpisodeId = player.dataset.episodeId;
      state.nowPlayingId = player.dataset.episodeId;
    }
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
  const player = getAudioPlayer();
  const current = player?.currentTime || 0;
  const duration = player && Number.isFinite(player.duration) && player.duration > 0 ? player.duration : 0;
  const progress = duration > 0 ? Math.min(1000, Math.max(0, Math.round((current / duration) * 1000))) : 0;
  document.querySelectorAll<HTMLInputElement>("[data-player-seek]").forEach((range) => {
    range.value = String(progress);
    range.style.setProperty("--progress", `${progress / 10}%`);
  });
  document.querySelectorAll<HTMLElement>("[data-player-current]").forEach((node) => {
    node.textContent = formatPlaybackTime(current);
  });
  document.querySelectorAll<HTMLElement>("[data-player-duration]").forEach((node) => {
    node.textContent = formatPlaybackTime(duration);
  });
}

function currentList() {
  const list = getFilteredEpisodes();
  return list.length ? list : typedEpisodes;
}

function selectRelative(delta: number) {
  const list = currentList();
  const baseId = state.playerEpisodeId || state.nowPlayingId || state.selectedId;
  const index = Math.max(0, list.findIndex((episode) => episode.id === baseId));
  const next = list[(index + delta + list.length) % list.length];
  state.playerEpisodeId = next.id;
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
  const targetId = state.playerEpisodeId || state.nowPlayingId || state.selectedId;
  if (!audioFor(targetId)) return;
  state.playerEpisodeId = targetId;
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
    const [episodes, audioManifest] = await Promise.all([
      loadJson<Episode[]>("/data/episodes.json"),
      loadJson<Record<string, AudioEntry>>("/data/audio-manifest.json"),
    ]);

    typedEpisodes = episodes;
    typedDialogues = {};
    typedAudio = audioManifest;
    state.selectedId = typedEpisodes[0]?.id || "";
    state.playerEpisodeId = typedEpisodes[0]?.id || "";
    renderApp();
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    renderError(`无法读取 /data 下的 JSON 文件：${message}`);
  }
}

initApp();
