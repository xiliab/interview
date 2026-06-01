import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.join(__dirname, "..");
const dataDir = path.join(siteRoot, "public", "data");
const legacyDataDir = path.join(siteRoot, "src", "data");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

const SYSTEM_PROMPT = `你是一个专业的互联网播客主编，擅长将硬核的面试题转化为生动、通俗易懂的男女对话剧本。
每集播客的格式为一个 JSON 数组，包含多个对话回合（turns），角色为“男声”（主持人，语气好奇、引导性强、会追问）和“女声”（分析嘉宾，语气专业、亲和力强、会结合具体互联网项目实例进行回答）。

你必须：
1. 根据题目内容，为“女声”设计并融入一个贴切、逼真的“具体大厂项目实例”（包含具体痛点和指标）。
2. 将“核心框架/回答方向”无缝嵌入到这个实例的讲述中，使其听起来像是在真实回答面试官的追问，而不是生硬地背诵大纲。
3. 让“男声”根据“可能遭遇的追问”进行自然的插话和压力追问，让“女声”进行解答。
4. 保持对话口语化，多使用“其实”、“也就是说”、“举个例子”等过渡词。

格式要求：
只返回一个 JSON 数组，例如：
[
  { "speaker": "男声", "line": "今天聊聊..." },
  { "speaker": "女声", "line": "其实这个地方..." }
]
不要包含 markdown 标记，不要用 \`\`\`json 包装，只返回合法 JSON。`;

function stripPrefix(value) {
  return value.replace(/^(压力测试|边界探索)：/, "");
}

// 降级本地模板生成逻辑
function makeFallbackTurns(episode) {
  const followOne = episode.followUps[0] ? stripPrefix(episode.followUps[0]) : "如果面试官继续追问，你会补充什么证据？";
  const followTwo = episode.followUps[1] ? stripPrefix(episode.followUps[1]) : "这个问题的边界在哪里？";
  if (episode.type === "Deep-dive") {
    return [
      { speaker: "男声", line: `今天这集我们聊 ${episode.id}，题目是：${episode.title}。这类题在${episode.collection}面试里很容易被追问，因为它不是考背诵，而是看你的真实判断。` },
      { speaker: "女声", line: `对，回答时先别急着抛方案。可以先用一句话说明场景和目标，再讲清楚面试官真正想听的是：${episode.essence}` },
      { speaker: "男声", line: `那具体结构怎么搭？如果候选人一上来讲很多细节，面试官可能会听丢重点。` },
      { speaker: "女声", line: `我会按这个框架来讲：${episode.framework} 先给结论，再补关键证据。每一步都最好能落到一个真实项目，而不是只讲方法论。` },
      { speaker: "男声", line: `这里有一个压力追问：${followOne} 这个问题通常会把候选人从“会讲”推到“能证明”。` },
      { speaker: "女声", line: `所以要提前准备数据、用户反馈、方案对比或上线后的变化。在这个例子中，就是通过具体的上线指标来作为强证据。` },
      { speaker: "男声", line: `还有一个边界问题：${followTwo} 这会考你有没有把问题想得过满。` },
      { speaker: "女声", line: `是的。好的回答不是把所有功劳都揽到自己身上，而是讲清楚哪些是产品、设计、技术、运营共同作用，自己的关键贡献在哪里。` },
      { speaker: "男声", line: `最后给一个收尾模板：先讲目标，再讲取舍，再讲结果，最后讲复盘。` },
      { speaker: "女声", line: `如果能把“我做了什么”升级成“我为什么这样判断，以及结果如何被验证”，这道题就比较稳了。` },
    ];
  } else {
    return [
      { speaker: "男声", line: `这集快速过一道高频题：${episode.id}，${episode.title}` },
      { speaker: "女声", line: `这题的考察本质是：${episode.essence}` },
      { speaker: "男声", line: `回答时不要只背概念，最好给一个能在面试里直接展开的框架。` },
      { speaker: "女声", line: `可以按这个思路：${episode.framework}` },
      { speaker: "男声", line: `如果想讲得更像社招候选人，就补一个你做过的场景，说明当时的约束、判断依据和结果。` },
      { speaker: "女声", line: `一句话总结：先讲结构，再讲证据，最后讲取舍。这样比单纯报术语更有说服力。` },
    ];
  }
}

// 调用大模型生成剧本 (Gemini 或 OpenAI)
async function callLLM(episode) {
  const prompt = `请为以下题目生成播客对话剧本：
ID: ${episode.id}
题目: ${episode.title}
岗位系列: ${episode.collection}
考察本质: ${episode.essence}
核心框架/回答方向: ${episode.framework}
可能遭遇的追问: ${episode.followUps.join(" | ")}`;

  let responseText = "";
  if (GEMINI_API_KEY) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${SYSTEM_PROMPT}\n\n${prompt}` }] }]
      })
    });
    if (!res.ok) throw new Error(`Gemini API error: ${res.statusText}`);
    const data = await res.json();
    responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  } else if (OPENAI_API_KEY) {
    const url = "https://api.openai.com/v1/chat/completions";
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt }
        ],
        temperature: 0.7
      })
    });
    if (!res.ok) throw new Error(`OpenAI API error: ${res.statusText}`);
    const data = await res.json();
    responseText = data.choices?.[0]?.message?.content || "";
  } else {
    throw new Error("No API key available");
  }

  // 清洗非 JSON 字符包装 (比如大模型喜欢带 ```json 标记)
  const cleanJson = responseText
    .replace(/^```json\s*/i, "")
    .replace(/```$/, "")
    .trim();
  
  return JSON.parse(cleanJson);
}

function estimate(dialogue, type) {
  const chars = dialogue.reduce((sum, item) => sum + item.line.length, 0);
  const seconds = Math.max(type === "Deep-dive" ? 180 : 75, Math.round(chars / 4.5));
  return seconds;
}

async function run() {
  const episodesFile = path.join(dataDir, "episodes.json");
  const dialoguesFile = path.join(dataDir, "dialogues.json");
  const legacyDialoguesFile = path.join(legacyDataDir, "dialogues.json");
  await mkdir(dataDir, { recursive: true });
  
  const episodes = JSON.parse(await readFile(episodesFile, "utf8"));
  
  // 读取已有的 dialogues.json 以便增量更新
  let dialogues = {};
  try {
    dialogues = JSON.parse(await readFile(dialoguesFile, "utf8"));
  } catch {
    try {
      dialogues = JSON.parse(await readFile(legacyDialoguesFile, "utf8"));
    } catch {
      dialogues = {};
    }
  }

  const isLlmMode = Boolean(GEMINI_API_KEY || OPENAI_API_KEY);
  if (isLlmMode) {
    console.log(`Starting LLM dialogue generation (Gemini: ${Boolean(GEMINI_API_KEY)}, OpenAI: ${Boolean(OPENAI_API_KEY)})`);
  } else {
    console.log("No API key detected. Running in offline fallback mode (Template-based).");
  }

  let successCount = 0;
  let fallbackCount = 0;

  for (let i = 0; i < episodes.length; i += 1) {
    const episode = episodes[i];
    
    // 如果已经在大模型模式下成功生成过非 Fallback 的剧本，且不是强制重写，则跳过
    // 判断标志：如果有 turns 且 turns 的数量不等于 fallback 模板的固定行数，或者根据内容特征
    const hasExisting = dialogues[episode.id] && dialogues[episode.id].turns && dialogues[episode.id].turns.length > 0;
    
    if (hasExisting) {
      // 增量模式：跳过已生成的
      continue;
    }

    console.log(`[${i + 1}/${episodes.length}] Generating dialogue for ${episode.id}...`);

    let turns = [];
    if (isLlmMode) {
      try {
        turns = await callLLM(episode);
        successCount += 1;
        // 适当限流，避免并发过高触发 rate limit
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (err) {
        console.error(`  LLM generation failed for ${episode.id}: ${err.message}. Falling back to template.`);
        turns = makeFallbackTurns(episode);
        fallbackCount += 1;
      }
    } else {
      turns = makeFallbackTurns(episode);
      fallbackCount += 1;
    }

    dialogues[episode.id] = {
      episodeId: episode.id,
      estimatedSeconds: estimate(turns, episode.type),
      turns,
    };

    // 每次生成一题都即时写入文件，实现真正的“断点续传 / 崩溃恢复”
    await writeFile(dialoguesFile, `${JSON.stringify(dialogues, null, 2)}\n`, "utf8");
  }

  console.log(`\nDialogue generation finished.`);
  console.log(`Total episodes: ${episodes.length}`);
  console.log(`LLM generated: ${successCount}`);
  console.log(`Fallback template generated: ${fallbackCount}`);

  // Even when every episode already existed, persist the merged dialogues into
  // the runtime public data folder.
  await writeFile(dialoguesFile, `${JSON.stringify(dialogues, null, 2)}\n`, "utf8");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
