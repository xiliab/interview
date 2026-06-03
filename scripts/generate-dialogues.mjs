import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.join(__dirname, "..");
const dataDir = path.join(siteRoot, "public", "data");
const legacyDataDir = path.join(siteRoot, "src", "data");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

const SYSTEM_PROMPT = `你是一个专业的求职面试专家，擅长将硬核的面试题转化为高度还原、互动感极强的模拟面试剧本。
每集面试格式为一个 JSON 数组，包含多个对话回合（turns），角色为“面试官”（发音人对应“男声”，语气专业、严肃有亲和力、善于根据候选人的回答进行追问和引导、并在最后给予点评） and “面试者”（发音人对应“女声”，语气礼貌、有条理、结合具体互联网项目进行解答，但每次回答要精炼，留给面试官追问空间）。

你必须严格遵守以下剧本设计规则：
1. 【禁止大段回答】：面试者绝不能一次性阐述一大段话。面试者的单次回答必须控制在 3 句以内（不超过 100 字）。如果需要阐述核心框架或大厂项目实例，必须通过面试官的“引导”和“追问”来分段展开。
2. 【面试官的引导与追问】：
   - 面试官开头直接切入主题提问。
   - 候选人给出一个非常精炼的初步回答后，面试官要进行“追问”（例如：“听起来这个方案很标准，但在你实际落地的过程中，是怎么解决具体的痛点/瓶颈的？”）。
   - 面试官在听完一部分后，要使用“理解了”、“那如果遇到...的情况呢？”等过渡句，引导候选人深入展示细节。
3. 【点评与收尾】：在面试结束前，面试官必须对候选人的表现进行一次简短的“点评”（指出回答的亮点，例如：展示了清晰的STAR逻辑，或者有很好的数据意识），然后做简要总结收尾。
4. 【大厂项目实例】：面试者在回答中提到的项目实例必须真实逼真，包含具体的业务指标（如转化率、PV、留存等）和限制条件。
5. 【口语化】：对话保持口语化，像真实的线下大厂面试，避免书面化的条条框框。

格式要求：
只返回一个 JSON 数组，例如：
[
  { "speaker": "面试官", "line": "你好，请介绍一下..." },
  { "speaker": "面试者", "line": "好的，其实在做这个系统时..." }
]
不要包含 markdown 标记，不要用 \`\`\`json 包装，只返回合法 JSON。`;

function stripPrefix(value) {
  return value.replace(/^(压力测试|边界探索)：/, "");
}

function isAdvanced(episode) {
  return episode.type === "高级";
}

function isIntermediate(episode) {
  return episode.type === "中级";
}

// 降级本地模板生成逻辑
function makeFallbackTurns(episode) {
  const followOne = episode.followUps[0] ? stripPrefix(episode.followUps[0]) : "如果这个方案落地遇到技术瓶颈，你怎么处理？";
  const followTwo = episode.followUps[1] ? stripPrefix(episode.followUps[1]) : "这个解决方案的边界和适用范围是什么？";
  
  if (isAdvanced(episode)) {
    return [
      { speaker: "面试官", line: `你好，今天我们来聊聊：${episode.title}。你在实际项目里是怎么看待这个考察本质的？` },
      { speaker: "面试者", line: `面试官好。其实这道题本质是考察：${episode.essence}。回答时我会核心关注场景和目标，做合理的技术/产品取舍。` },
      { speaker: "面试官", line: `明白。那如果要你给出一个系统的解决框架，你会从哪几个核心步骤来拆解？` },
      { speaker: "面试者", line: `我通常会分这几步来做：${episode.framework}。但这只是个框架，实际落地必须针对业务指标做具体优化。` },
      { speaker: "面试官", line: `好，那我们就聊聊实际落地。你刚才提到的框架里，针对“${followOne}”这个常见问题，你在实际项目中是怎么解决的？` },
      { speaker: "面试者", line: `在项目中，我们主要通过优化技术方案和建立上线监控指标来解决。这套方案能提供强有力的量化结果。` },
      { speaker: "面试官", line: `这块解决得不错。那这个方案有没有什么边界或者局限性？比如：“${followTwo}”` },
      { speaker: "面试者", line: `是的，这套方案并不万能。我们在做的时候明确了它的适用范围，并且做了部分的人工兜底和降级策略。` },
      { speaker: "面试官", line: `整体听下来，你的回答条理清晰。不仅有方法论，还结合了具体的数据指标和合理的边界取舍，表现很好。` }
    ];
  }

  if (isIntermediate(episode)) {
    return [
      { speaker: "面试官", line: `你好，今天这道题是：${episode.title}。你会怎么回答？` },
      { speaker: "面试者", line: `我会先说明它的考察本质：${episode.essence}。` },
      { speaker: "面试官", line: `那你把回答框架展开一下，重点步骤是什么？` },
      { speaker: "面试者", line: `我的框架是：${episode.framework}。面试里会尽量补一个项目或数据证据。` },
      { speaker: "面试官", line: `如果追问到“${followOne}”，你会怎么处理？` },
      { speaker: "面试者", line: `我会先明确场景边界，再说明取舍依据，最后用指标或用户反馈证明方案是否有效。` },
      { speaker: "面试官", line: `点评：这题不只考概念，也考你能否把方法落到场景、证据和取舍上。` }
    ];
  }

  return [
    { speaker: "面试官", line: `你好，请简单说一下你对这道高频题的理解：${episode.title}` },
    { speaker: "面试者", line: `好的。这题的考察本质其实是：${episode.essence}。` },
    { speaker: "面试官", line: `如果要在面试中展示你的专业度，你通常会如何组织回答结构？` },
    { speaker: "面试者", line: `我会建议采用这个框架：${episode.framework}。关键是要点清晰、结构化。` },
    { speaker: "面试官", line: `好的，回答很精炼。希望在实际面试中，候选人能继续保持这种结构化的表达。` }
  ];
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
  const minimum = type === "高级" ? 240 : type === "中级" ? 120 : 60;
  const seconds = Math.max(minimum, Math.round(chars / 4.5));
  return seconds;
}

async function run() {
  const episodesFile = path.join(dataDir, "episodes.json");
  const dialoguesDir = path.join(dataDir, "dialogues");
  await mkdir(dialoguesDir, { recursive: true });
  
  const episodes = JSON.parse(await readFile(episodesFile, "utf8"));

  const isLlmMode = Boolean(GEMINI_API_KEY || OPENAI_API_KEY);
  if (isLlmMode) {
    console.log(`Starting LLM dialogue generation (Gemini: ${Boolean(GEMINI_API_KEY)}, OpenAI: ${Boolean(OPENAI_API_KEY)})`);
  } else {
    console.log("No API key detected. Running in offline fallback mode (Template-based).");
  }

  let successCount = 0;
  let fallbackCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < episodes.length; i += 1) {
    const episode = episodes[i];
    const singleDialogueFile = path.join(dialoguesDir, `${episode.id}.json`);
    
    // 检查这个文件是否已经存在
    let hasExisting = false;
    try {
      await readFile(singleDialogueFile, "utf8");
      hasExisting = true;
    } catch {
      hasExisting = false;
    }
    
    if (hasExisting) {
      // 增量模式：跳过已生成的
      skippedCount += 1;
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

    const dialogueData = {
      episodeId: episode.id,
      estimatedSeconds: estimate(turns, episode.type),
      turns,
    };

    // 每次生成一题都即时写入单独的文件
    await writeFile(singleDialogueFile, `${JSON.stringify(dialogueData, null, 2)}\n`, "utf8");
  }

  console.log(`\nDialogue generation finished.`);
  console.log(`Total episodes: ${episodes.length}`);
  console.log(`Skipped (already exists): ${skippedCount}`);
  console.log(`LLM generated: ${successCount}`);
  console.log(`Fallback template generated: ${fallbackCount}`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
