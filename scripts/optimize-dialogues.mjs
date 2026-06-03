import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(__dirname, "..");
const dataDir = path.join(siteRoot, "public", "data");
const dialoguesDir = path.join(dataDir, "dialogues");

function sanitize(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\band\b/gi, "和")
    .replace(/\bof\b/gi, "的")
    .replace(/情置化/g, "情境化")
    .replace(/卡卡死/g, "卡死")
    .replace(/概率概率/g, "概率模型")
    .replace(/短像/g, "短视频")
    .replace(/倒退药水/g, "撤销与版本回退能力")
    .replace(/这套方案能提供强有力的量化结果/g, "我会用灰度验证、日志监控和用户反馈来判断效果")
    .replace(/职业自杀/g, "沟通风险很高")
    .replace(/杀鸡取卵/g, "透支信任")
    .replace(/涸泽而渔/g, "透支长期价值")
    .replace(/慢性毒药/g, "高风险做法")
    .replace(/毒药/g, "高风险做法")
    .replace(/绝不/g, "我不会")
    .replace(/我坚决/g, "我会明确")
    .replace(/坚决/g, "明确")
    .replace(/并不万能/g, "有适用边界")
    .replace(/万能/g, "通用")
    .replace(/完美/g, "完整")
    .replace(/100%\s*/g, "高度")
    .replace(/？。/g, "？")
    .replace(/。。/g, "。")
    .replace(/；。/g, "。")
    .replace(/：。/g, "：")
    .replace(/如果如果/g, "如果")
    .replace(/“`/g, "“")
    .replace(/`”/g, "”")
    .trim();
}

function shortTitle(title) {
  const clean = sanitize(title);
  return clean.length > 34 ? `${clean.slice(0, 34)}...` : clean;
}

function stripPromptPrefix(value) {
  return sanitize(value).replace(/^(压力测试|边界探索)：/, "");
}

function conditionText(value) {
  return stripPromptPrefix(value)
    .replace(/^(如果|假设|当|在)/, "")
    .replace(/[？?。]$/, "");
}

function splitFragments(value) {
  const clean = sanitize(value);
  const coarse = clean
    .replace(/([。！？；])/g, "$1|")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);

  const fragments = [];
  for (const item of coarse) {
    if (item.length <= 92) {
      fragments.push(item);
      continue;
    }
    const fine = item
      .replace(/([，、：；])/g, "$1|")
      .split("|")
      .map((part) => part.trim())
      .filter(Boolean);
    for (const part of fine) {
      if (part.length <= 92) {
        fragments.push(part);
      } else {
        for (let i = 0; i < part.length; i += 86) {
          fragments.push(part.slice(i, i + 86));
        }
      }
    }
  }
  return fragments;
}

function packFragments(fragments, max = 96) {
  const chunks = [];
  let current = "";
  for (const raw of fragments) {
    const item = sanitize(raw);
    if (!item) continue;
    const next = current ? `${current}${item}` : item;
    if (next.length <= max) {
      current = next;
    } else {
      if (current) chunks.push(current);
      current = item.length <= max ? item : item.slice(0, max - 1);
    }
  }
  if (current) chunks.push(current);
  return chunks.map((chunk) => ensureSentence(limitText(chunk, max)));
}

function limitText(value, max = 96) {
  const clean = sanitize(value);
  if (clean.length <= max) return clean;
  const fragments = splitFragments(clean);
  let result = "";
  for (const fragment of fragments) {
    const next = result ? `${result}${fragment}` : fragment;
    if (next.length > max) break;
    result = next;
  }
  return result || clean.slice(0, max - 1);
}

function ensureSentence(value) {
  const clean = sanitize(value);
  if (!clean) return clean;
  return /[。！？?？]$/.test(clean) ? clean : `${clean}。`;
}

function answerChunks(dialogue, episode, count) {
  const candidateText = (dialogue.turns || [])
    .filter((turn) => turn.speaker === "面试者" || turn.speaker === "女声")
    .map((turn) => turn.line)
    .join(" ");
  const fragments = splitFragments(candidateText);
  const chunks = packFragments(fragments, 96);
  const fallbacks = [
    `这题核心是${episode.essence}。`,
    `我会按${episode.framework}来讲，先说明场景，再讲取舍和验证。`,
    episode.followUps?.[0] ? `面对追问“${stripPromptPrefix(episode.followUps[0])}”，我会先补充证据。` : "我会补充指标、用户反馈和上线后的复盘证据。",
    episode.followUps?.[1] ? `边界上要回答“${stripPromptPrefix(episode.followUps[1])}”，避免把方案讲满。` : "边界上要说明适用范围、风险和兜底策略。",
  ];
  for (const fallback of fallbacks) {
    if (chunks.length >= count) break;
    chunks.push(ensureSentence(limitText(fallback, 96)));
  }
  return chunks.slice(0, count).map((chunk, index) => {
    const clean = sanitize(chunk);
    if (/主要通过优化技术方案和建立上线监控指标|有适用边界|适用范围|人工兜底和降级策略|模型置信度不足/.test(clean)) {
      const title = shortTitle(episode.title);
      const replacements = [
        `在“${title}”里，我会先按风险分级决定是否允许模型继续输出。`,
        `验证上会看灰度日志、人工复核命中率和用户纠错反馈，而不是只看生成成功率。`,
        `边界上，高风险任务必须保留人工确认、可撤销和可追溯记录。`,
        `如果“${title}”里模型置信度不足，我会优先给出拒答、引用依据或转人工入口。`,
      ];
      return ensureSentence(limitText(replacements[index % replacements.length], 96));
    }
    return ensureSentence(limitText(clean, 96));
  });
}

function makeDeepDive(dialogue, episode) {
  const title = shortTitle(episode.title);
  const chunks = answerChunks(dialogue, episode, 4);
  const followOne = conditionText(episode.followUps?.[0] || "缺少完整数据时如何证明效果？");
  const followTwo = stripPromptPrefix(episode.followUps?.[1] || "这个方案的边界和风险是什么？");

  return {
    episodeId: episode.id,
    estimatedSeconds: 210,
    turns: [
      { speaker: "面试官", line: `你好，这题是“${title}”。请用一个真实项目说明你的判断、动作和结果？` },
      { speaker: "面试者", line: chunks[0] },
      { speaker: "面试官", line: `围绕“${title}”，你先把问题定义讲清楚：关键卡点和目标是什么？` },
      { speaker: "面试者", line: chunks[1] },
      { speaker: "面试官", line: `听起来有方向。你怎么验证“${title}”不是巧合，依据是什么？` },
      { speaker: "面试者", line: chunks[2] },
      { speaker: "面试官", line: `我追问一个边界：如果${limitText(followOne, 52)}，你会怎么取舍？` },
      { speaker: "面试者", line: chunks[3] || ensureSentence(limitText(followTwo, 96)) },
      { speaker: "面试官", line: `点评：这版回答能把“${title}”落到问题、动作、证据和边界上，继续用真实数据补强即可。` },
    ].map((turn) => ({ speaker: turn.speaker, line: limitText(turn.line, turn.speaker === "面试官" ? 156 : 96) })),
  };
}

function makeIntermediate(dialogue, episode) {
  const title = shortTitle(episode.title);
  const chunks = answerChunks(dialogue, episode, 3);
  const followOne = conditionText(episode.followUps?.[0] || "面试官要求你补充项目证据时怎么办？");

  return {
    episodeId: episode.id,
    estimatedSeconds: 180,
    turns: [
      { speaker: "面试官", line: `你好，这题是“${title}”。你会怎么回答？` },
      { speaker: "面试者", line: chunks[0] },
      { speaker: "面试官", line: `你把“${title}”的关键框架展开一下。` },
      { speaker: "面试者", line: chunks[1] },
      { speaker: "面试官", line: `如果${limitText(followOne, 52)}，你会补什么证据？` },
      { speaker: "面试者", line: chunks[2] },
      { speaker: "面试官", line: `点评：这题需要比概念题多一步，把框架落到场景、指标和取舍上。` },
    ].map((turn) => ({ speaker: turn.speaker, line: limitText(turn.line, turn.speaker === "面试官" ? 156 : 96) })),
  };
}

function makeBasic(dialogue, episode) {
  const title = shortTitle(episode.title);
  const chunks = [
    ensureSentence(limitText(`这题核心是${episode.essence}`, 96)),
    ensureSentence(limitText(`我会按${episode.framework}来讲，并补充适用场景、取舍和指标`, 96)),
  ];
  return {
    episodeId: episode.id,
    estimatedSeconds: 90,
    turns: [
      { speaker: "面试官", line: `你好，针对“${title}”，你会怎么向面试官简洁回答？` },
      { speaker: "面试者", line: chunks[0] },
      { speaker: "面试官", line: `如果只给一分钟，你会用哪几个步骤展开“${title}”？` },
      { speaker: "面试者", line: chunks[1] },
      { speaker: "面试官", line: `点评：这道“${title}”适合短答，结构清楚即可；遇到追问时再补案例和边界。` },
    ].map((turn) => ({ speaker: turn.speaker, line: limitText(turn.line, turn.speaker === "面试官" ? 156 : 96) })),
  };
}

async function run() {
  const episodes = JSON.parse(await readFile(path.join(dataDir, "episodes.json"), "utf8"));
  const episodeById = new Map(episodes.map((episode) => [episode.id, episode]));
  const files = (await readdir(dialoguesDir)).filter((file) => file.endsWith(".json")).sort();
  let optimized = 0;

  for (const file of files) {
    const id = file.replace(/\.json$/, "");
    const episode = episodeById.get(id);
    if (!episode) continue;
    const filePath = path.join(dialoguesDir, file);
    const dialogue = JSON.parse(await readFile(filePath, "utf8"));
    const next = episode.type === "高级" ? makeDeepDive(dialogue, episode) : episode.type === "中级" ? makeIntermediate(dialogue, episode) : makeBasic(dialogue, episode);
    await writeFile(filePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    optimized += 1;
  }

  console.log(`Optimized ${optimized} dialogue files.`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
