import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(siteRoot, "..");
const bankRoot = path.join(repoRoot, "interview-question-bank");
const outDir = path.join(siteRoot, "public", "data");

const sourceDirs = [
  { dir: path.join(bankRoot, "ui_ux"), role: "UI/UX", collection: "UI/UX 设计师" },
  { dir: path.join(bankRoot, "pm"), role: "PM", collection: "产品经理" },
  { dir: path.join(bankRoot, "ai_cross_domain"), role: "AI-CROSS", collection: "AI 交叉域" },
];

const moduleNames = {
  "01_portfolio_review.md": "作品集、项目复盘与设计决策",
  "02_research_problem_definition.md": "用户研究、问题定义与验证",
  "03_interaction_information_architecture.md": "交互、信息架构与复杂系统",
  "04_design_system_collaboration.md": "设计系统、规范与协作",
  "05_ai_designer_capability.md": "AI 时代设计师能力",
  "06_basic_intermediate_frequent_questions.md": "基础与中级高频题",
  "01_project_review_business_impact.md": "项目复盘、业务结果与个人贡献",
  "02_product_design_data_growth.md": "产品设计、数据与增长",
  "03_ai_pm_llm_product.md": "AI PM 与大模型产品落地",
  "04_basic_intermediate_frequent_questions.md": "基础与中级高频题",
  "01_advanced_cross_domain.md": "高级交叉题",
  "02_basic_intermediate_cross_domain.md": "基础与中级交叉题",
};

const difficultyLevels = ["基础", "中级", "高级"];
const durationRanges = {
  基础: { minSeconds: 60, maxSeconds: 120 },
  中级: { minSeconds: 120, maxSeconds: 240 },
  高级: { minSeconds: 240, maxSeconds: 420 },
};

function stripBold(label) {
  return label.replace(/^\*\*/, "").replace(/\*\*$/, "");
}

function fieldValue(lines, label) {
  const prefix = `**${label}**：`;
  const line = lines.find((item) => item.startsWith(prefix));
  return line ? line.slice(prefix.length).trim() : "";
}

function listAfter(lines, label) {
  const start = lines.findIndex((item) => item.startsWith(`**${label}**：`));
  if (start === -1) return [];
  const result = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    if (lines[i].startsWith("**")) break;
    if (lines[i].startsWith("- ")) result.push(lines[i].slice(2).trim());
  }
  return result;
}

function compactText(value) {
  return value.replace(/\s+/g, " ").trim();
}

function inferQuestionType(rawType, searchBlob) {
  if (difficultyLevels.includes(rawType)) return rawType;

  const advancedSignals = /中高级|AI PM|Agent|RAG|B 端|策略|风险|合规|数据闭环|平台产品|商业化|推荐产品|搜索推荐|复杂|协作|增长|0 到 1/i;

  return advancedSignals.test(searchBlob) ? "中级" : "基础";
}

function durationForType(type) {
  const range = durationRanges[type] || durationRanges.基础;
  const minMinutes = Math.round(range.minSeconds / 60);
  const maxMinutes = Math.round(range.maxSeconds / 60);
  return {
    durationSeconds: Math.round((range.minSeconds + range.maxSeconds) / 2),
    durationRangeSeconds: range,
    durationLabel: `${minMinutes}-${maxMinutes} 分钟`,
  };
}

function parseQuestionBlock(block, meta) {
  const heading = block.match(/^### \[([A-Z-]+-\d{3})\] (.+)$/m);
  if (!heading) return null;
  const [, id, title] = heading;
  const lines = block
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const rawType = fieldValue(lines, "题目类型");
  const level = fieldValue(lines, "适用级别");
  const essence = fieldValue(lines, "考察本质");
  const framework = fieldValue(lines, "核心框架/回答方向");
  const refs = fieldValue(lines, "参考来源").match(/\[REF-[A-Z]+-\d{2}\]/g) || [];
  const followUps = listAfter(lines, "可能遭遇的追问");
  const baseSearchBlob = compactText([id, title, meta.collection, meta.module, rawType, level, essence, framework, followUps.join(" "), refs.join(" ")].join(" "));
  const type = inferQuestionType(rawType, baseSearchBlob);
  const tags = new Set([
    meta.collection,
    meta.module,
    type,
    ...level.split("|").map((item) => item.trim()).filter(Boolean),
  ]);

  const searchBlob = compactText([id, title, meta.collection, meta.module, type, level, essence, framework, followUps.join(" "), refs.join(" ")].join(" "));
  const isAi = /AI|大模型|Agent|RAG|Prompt|模型|幻觉|人工兜底|Human-in-the-loop/i.test(searchBlob);
  if (isAi) tags.add("AI 相关");
  if (/中高级/.test(searchBlob)) tags.add("中高级");
  if (/高频/.test(searchBlob)) tags.add("高频");

  const { durationSeconds, durationRangeSeconds, durationLabel } = durationForType(type);
  const coverVariant = id.startsWith("UX") ? "ux" : id.startsWith("PM") ? "pm" : "cross";

  return {
    id,
    title: title.trim(),
    collection: meta.collection,
    role: meta.role,
    module: meta.module,
    sourceFile: path.relative(bankRoot, meta.file).replaceAll(path.sep, "/"),
    type,
    level,
    essence,
    framework,
    followUps,
    references: refs,
    tags: [...tags],
    isAi,
    durationSeconds,
    durationRangeSeconds,
    durationLabel,
    coverVariant,
    searchBlob,
  };
}

async function parseAll() {
  const episodes = [];
  for (const source of sourceDirs) {
    const files = (await readdir(source.dir)).filter((file) => file.endsWith(".md")).sort();
    for (const fileName of files) {
      const file = path.join(source.dir, fileName);
      const markdown = await readFile(file, "utf8");
      const moduleHeading = markdown.match(/^## (.+)$/m)?.[1] || moduleNames[fileName] || fileName.replace(/\.md$/, "");
      const blocks = markdown.split(/\n(?=### \[[A-Z-]+-\d{3}\] )/g).filter((block) => block.startsWith("### ["));
      for (const block of blocks) {
        const episode = parseQuestionBlock(block, {
          ...source,
          file,
          module: moduleHeading,
        });
        if (episode) episodes.push(episode);
      }
    }
  }

  const ids = new Set();
  for (const episode of episodes) {
    if (ids.has(episode.id)) throw new Error(`Duplicate episode id: ${episode.id}`);
    ids.add(episode.id);
  }
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, "episodes.json"), `${JSON.stringify(episodes, null, 2)}\n`, "utf8");

  const stats = {
    total: episodes.length,
    basic: episodes.filter((episode) => episode.type === "基础").length,
    intermediate: episodes.filter((episode) => episode.type === "中级").length,
    advanced: episodes.filter((episode) => episode.type === "高级").length,
    ux: episodes.filter((episode) => episode.role === "UI/UX").length,
    pm: episodes.filter((episode) => episode.role === "PM").length,
    cross: episodes.filter((episode) => episode.role === "AI-CROSS").length,
  };
  await writeFile(path.join(outDir, "stats.json"), `${JSON.stringify(stats, null, 2)}\n`, "utf8");
  console.log(`Generated ${episodes.length} episodes.`);
}

parseAll().catch((error) => {
  console.error(error);
  process.exit(1);
});
