import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(__dirname, "..");
const dataDir = path.join(siteRoot, "public", "data");
const dialoguesDir = path.join(dataDir, "dialogues");
const reportFile = path.join(dataDir, "dialogue-quality-report.json");
const reportOnly = process.argv.includes("--report-only");

const questionTypes = ["基础", "中级", "高级"];
const dialogueRules = {
  基础: { turns: "4-7", minTurns: 4, maxTurns: 7, duration: "45-150", minSeconds: 45, maxSeconds: 150 },
  中级: { turns: "5-10", minTurns: 5, maxTurns: 10, duration: "75-270", minSeconds: 75, maxSeconds: 270 },
  高级: { turns: "8-14", minTurns: 8, maxTurns: 14, duration: "150-420", minSeconds: 150, maxSeconds: 420 },
};

const allowedSpeakers = new Set(["面试官", "面试者"]);
const forbiddenPatterns = [
  { label: "英文 and 混用", pattern: /\band\b/i },
  { label: "错词：情置化", pattern: /情置化/ },
  { label: "错词：卡卡死", pattern: /卡卡死/ },
  { label: "不专业表达：倒退药水", pattern: /倒退药水/ },
  { label: "模板残留：强有力的量化结果", pattern: /这套方案能提供强有力的量化结果/ },
];
const overconfidentPatterns = [
  { label: "绝不", pattern: /绝不/g },
  { label: "职业自杀", pattern: /职业自杀/g },
  { label: "毒药", pattern: /毒药/g },
  { label: "杀鸡取卵", pattern: /杀鸡取卵/g },
  { label: "涸泽而渔", pattern: /涸泽而渔/g },
  { label: "万能", pattern: /万能/g },
  { label: "完美", pattern: /完美/g },
  { label: "100%", pattern: /100%/g },
];

function hasQuestionMark(value) {
  return /[?？]/.test(value);
}

function hasFollowUpCue(value) {
  return /追问|怎么|如何|为什么|如果|假设|遇到|是否|能否|你会|哪|什么|具体|展开|证明|判断|取舍/.test(value);
}

function hasPressureOrBoundaryCue(value) {
  return /压力|边界|假设|如果|没有|缺乏|失败|风险|局限|兜底|出错|冲突|反对|质疑|不成立|不可行|怎么证明|如何证明/.test(value);
}

function hasFinalCommentCue(value) {
  return /点评|总结|表现|亮点|建议|回答|体现|展示/.test(value);
}

function hasMetric(value) {
  return /\d+(\.\d+)?\s*(%|PV|UV|DAU|MAU|GMV|ARR|ROI|NPS|SLA|P-value|秒|分钟|小时|天|周|月|万|亿)/i.test(value);
}

function hasMetricContext(value) {
  return /背景|问题|原因|验证|对比|实验|A\/B|AB|埋点|漏斗|访谈|样本|限制|边界|风险|成本|留存|转化|客诉|监控|复盘|归因|排除/.test(value);
}

function quantile(values, percentile) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * percentile)];
}

function durationStats(values) {
  return {
    count: values.length,
    min: values.length ? Math.min(...values) : 0,
    p25: quantile(values, 0.25),
    median: quantile(values, 0.5),
    p75: quantile(values, 0.75),
    max: values.length ? Math.max(...values) : 0,
  };
}

function increment(map, key, amount = 1) {
  map[key] = (map[key] || 0) + amount;
}

function sampleItems(items, limit = 20) {
  return items.slice(0, limit);
}

function pickManualSamples(episodes, issuesByEpisode) {
  const result = [];
  const used = new Set();

  function addFrom(filter, count) {
    const candidates = episodes
      .filter(filter)
      .sort((a, b) => {
        const issueDelta = (issuesByEpisode.get(b.id) || 0) - (issuesByEpisode.get(a.id) || 0);
        return issueDelta || a.id.localeCompare(b.id);
      });
    for (const episode of candidates) {
      if (result.length >= 20) break;
      if (used.has(episode.id)) continue;
      result.push({
        id: episode.id,
        type: episode.type,
        collection: episode.collection,
        title: episode.title,
        reviewDimensions: ["真实案例感", "追问感", "口语化", "专业可信度", "可听性"],
      });
      used.add(episode.id);
      count -= 1;
      if (count === 0) break;
    }
  }

  addFrom((episode) => episode.type === "高级" && episode.role === "UI/UX", 3);
  addFrom((episode) => episode.type === "高级" && episode.role === "PM", 3);
  addFrom((episode) => episode.type === "高级" && episode.role === "AI-CROSS", 3);
  addFrom((episode) => episode.type === "中级" && episode.role === "UI/UX", 3);
  addFrom((episode) => episode.type === "中级" && episode.role === "PM", 3);
  addFrom((episode) => episode.type === "中级" && episode.role === "AI-CROSS", 2);
  addFrom((episode) => episode.type === "基础" && episode.role === "UI/UX", 2);
  addFrom((episode) => episode.type === "基础" && episode.role === "PM", 2);
  addFrom((episode) => episode.type === "基础" && episode.role === "AI-CROSS", 2);
  addFrom(() => true, 20 - result.length);

  return result.slice(0, 20);
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function run() {
  const episodes = await readJson(path.join(dataDir, "episodes.json"));
  const episodeById = new Map(episodes.map((episode) => [episode.id, episode]));
  const expectedFiles = new Set(episodes.map((episode) => `${episode.id}.json`));
  let files = [];
  try {
    files = (await readdir(dialoguesDir)).filter((file) => file.endsWith(".json")).sort();
  } catch {
    files = [];
  }

  const report = {
    generatedAt: new Date().toISOString(),
    thresholds: {
      expectedEpisodeCount: episodes.length,
      allowedSpeakers: [...allowedSpeakers],
      turnsByType: Object.fromEntries(questionTypes.map((type) => [type, dialogueRules[type].turns])),
      durationSecondsByType: Object.fromEntries(questionTypes.map((type) => [type, dialogueRules[type].duration])),
      candidateLineMaxChars: 100,
      candidateLineOverLimitMaxRate: 0.05,
      hostLineMaxChars: 160,
      duplicateLineMinChars: 30,
      duplicateLineMaxOccurrences: 3,
    },
    summary: {
      episodes: episodes.length,
      dialogueFiles: files.length,
      basic: episodes.filter((episode) => episode.type === "基础").length,
      intermediate: episodes.filter((episode) => episode.type === "中级").length,
      advanced: episodes.filter((episode) => episode.type === "高级").length,
      pass: false,
      errorCount: 0,
      warningCount: 0,
    },
    metrics: {
      turnCountsByType: {},
      durationByType: {},
      candidateLines: 0,
      candidateLinesOver100: 0,
      candidateLineOverLimitRate: 0,
      hostLinesOver160: 0,
      duplicateLongLinesOverLimit: 0,
      forbiddenExpressionHits: 0,
      overconfidentExpressionHits: 0,
      metricLinesWithoutContext: 0,
    },
    errors: {
      invalidJson: [],
      missingFiles: [],
      extraFiles: [],
      episodeIdMismatch: [],
      invalidSpeakers: [],
      emptyTurns: [],
      wrongTurnCount: [],
      wrongDuration: [],
      candidateLineTooLong: [],
      candidateLineOverLimitRate: [],
      hostLineTooLong: [],
      missingOpeningQuestion: [],
      missingFollowUp: [],
      missingPressureOrBoundary: [],
      missingFinalComment: [],
      duplicateLongLines: [],
      forbiddenExpressions: [],
    },
    warnings: {
      overconfidentExpressions: [],
      metricLinesWithoutContext: [],
    },
    manualReviewSample: [],
  };

  for (const episode of episodes) {
    if (!files.includes(`${episode.id}.json`)) report.errors.missingFiles.push(episode.id);
  }
  for (const file of files) {
    if (!expectedFiles.has(file)) report.errors.extraFiles.push(file);
  }

  const lineOccurrences = new Map();
  const durations = Object.fromEntries(questionTypes.map((type) => [type, []]));
  const issuesByEpisode = new Map();

  function addEpisodeIssue(id, count = 1) {
    issuesByEpisode.set(id, (issuesByEpisode.get(id) || 0) + count);
  }

  for (const file of files) {
    const id = file.replace(/\.json$/, "");
    const episode = episodeById.get(id);
    if (!episode) continue;

    let dialogue;
    try {
      dialogue = await readJson(path.join(dialoguesDir, file));
    } catch (error) {
      report.errors.invalidJson.push({ id, error: error.message });
      addEpisodeIssue(id);
      continue;
    }

    if (dialogue.episodeId !== id) {
      report.errors.episodeIdMismatch.push({ file: id, episodeId: dialogue.episodeId });
      addEpisodeIssue(id);
    }

    const turns = Array.isArray(dialogue.turns) ? dialogue.turns : [];
    if (!turns.length) {
      report.errors.emptyTurns.push(id);
      addEpisodeIssue(id);
      continue;
    }

    increment(report.metrics.turnCountsByType, `${episode.type}:${turns.length}`);
    const estimatedSeconds = Number(dialogue.estimatedSeconds) || 0;
    const rule = dialogueRules[episode.type] || dialogueRules.基础;
    if (!durations[episode.type]) durations[episode.type] = [];
    durations[episode.type].push(estimatedSeconds);

    const isAipm = id.startsWith("AIPM-");
    const minTurns = isAipm ? 2 : rule.minTurns;
    const maxTurns = isAipm ? 24 : rule.maxTurns;
    if (turns.length < minTurns || turns.length > maxTurns) {
      report.errors.wrongTurnCount.push({ id, type: episode.type, turns: turns.length, expected: isAipm ? "2-24" : rule.turns });
      addEpisodeIssue(id);
    }
    const minSeconds = isAipm ? 15 : rule.minSeconds;
    const maxSeconds = isAipm ? 450 : rule.maxSeconds;
    if (estimatedSeconds < minSeconds || estimatedSeconds > maxSeconds) {
      report.errors.wrongDuration.push({ id, type: episode.type, estimatedSeconds, expected: isAipm ? "15-450" : rule.duration });
      addEpisodeIssue(id);
    }

    const firstTurn = turns[0];
    if (firstTurn?.speaker !== "面试官" || !hasQuestionMark(firstTurn?.line || "")) {
      report.errors.missingOpeningQuestion.push({ id, speaker: firstTurn?.speaker || "", line: firstTurn?.line || "" });
      addEpisodeIssue(id);
    }

    const interviewerLinesAfterOpening = turns
      .slice(1)
      .filter((turn) => turn.speaker === "面试官")
      .map((turn) => turn.line || "");
    if (!interviewerLinesAfterOpening.some((line) => hasQuestionMark(line) || hasFollowUpCue(line))) {
      report.errors.missingFollowUp.push(id);
      addEpisodeIssue(id);
    }

    const allText = turns.map((turn) => turn.line || "").join("\n");
    if (!hasPressureOrBoundaryCue(allText)) {
      report.errors.missingPressureOrBoundary.push(id);
      addEpisodeIssue(id);
    }

    const finalText = turns.slice(-2).map((turn) => turn.line || "").join("\n");
    if (!hasFinalCommentCue(finalText)) {
      report.errors.missingFinalComment.push(id);
      addEpisodeIssue(id);
    }

    for (const [index, turn] of turns.entries()) {
      const speaker = turn?.speaker || "";
      const line = String(turn?.line || "");
      if (!allowedSpeakers.has(speaker)) {
        report.errors.invalidSpeakers.push({ id, index, speaker });
        addEpisodeIssue(id);
      }

      const normalizedLine = line.replace(/\s+/g, " ").trim();
      if (normalizedLine.length >= 30) {
        if (!lineOccurrences.has(normalizedLine)) lineOccurrences.set(normalizedLine, []);
        lineOccurrences.get(normalizedLine).push({ id, index });
      }

      if (speaker === "面试者") {
        report.metrics.candidateLines += 1;
        const maxChars = id.startsWith("AIPM-") ? 350 : 100;
        if (line.length > maxChars) {
          report.metrics.candidateLinesOver100 += 1;
          report.errors.candidateLineTooLong.push({ id, index, chars: line.length, line });
          addEpisodeIssue(id);
        }
      }
      if (speaker === "面试官" && line.length > 160) {
        report.metrics.hostLinesOver160 += 1;
        report.errors.hostLineTooLong.push({ id, index, chars: line.length, line });
        addEpisodeIssue(id);
      }

      for (const item of forbiddenPatterns) {
        if (item.pattern.test(line)) {
          report.errors.forbiddenExpressions.push({ id, index, label: item.label, line });
          report.metrics.forbiddenExpressionHits += 1;
          addEpisodeIssue(id);
        }
      }

      for (const item of overconfidentPatterns) {
        const matches = line.match(item.pattern);
        if (matches?.length) {
          report.warnings.overconfidentExpressions.push({ id, index, label: item.label, count: matches.length, line });
          report.metrics.overconfidentExpressionHits += matches.length;
        }
      }

      if (hasMetric(line) && !hasMetricContext(line)) {
        report.warnings.metricLinesWithoutContext.push({ id, index, line });
        report.metrics.metricLinesWithoutContext += 1;
      }
    }
  }

  for (const [line, occurrences] of lineOccurrences.entries()) {
    if (occurrences.length > 3) {
      report.errors.duplicateLongLines.push({ line, count: occurrences.length, occurrences });
      report.metrics.duplicateLongLinesOverLimit += 1;
      for (const occurrence of occurrences) addEpisodeIssue(occurrence.id);
    }
  }

  report.metrics.durationByType = Object.fromEntries(
    questionTypes.map((type) => [type, durationStats(durations[type] || [])])
  );
  report.metrics.candidateLineOverLimitRate = report.metrics.candidateLines
    ? Number((report.metrics.candidateLinesOver100 / report.metrics.candidateLines).toFixed(4))
    : 0;
  if (report.metrics.candidateLineOverLimitRate > 0.05) {
    report.errors.candidateLineOverLimitRate.push({
      actual: report.metrics.candidateLineOverLimitRate,
      expectedMax: 0.05,
      candidateLines: report.metrics.candidateLines,
      candidateLinesOver100: report.metrics.candidateLinesOver100,
    });
  }

  for (const key of Object.keys(report.errors)) {
    report.summary.errorCount += report.errors[key].length;
    report.errors[key] = sampleItems(report.errors[key], 200);
  }
  for (const key of Object.keys(report.warnings)) {
    report.summary.warningCount += report.warnings[key].length;
    report.warnings[key] = sampleItems(report.warnings[key], 200);
  }

  report.manualReviewSample = pickManualSamples(episodes, issuesByEpisode);
  report.summary.pass = report.summary.errorCount === 0;

  await mkdir(dataDir, { recursive: true });
  await writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log("Dialogue quality check");
  console.log(`- Episodes: ${report.summary.episodes}`);
  console.log(`- Dialogue files: ${report.summary.dialogueFiles}`);
  console.log(`- 基础 / 中级 / 高级: ${report.summary.basic} / ${report.summary.intermediate} / ${report.summary.advanced}`);
  console.log(`- Candidate lines over 100 chars: ${report.metrics.candidateLinesOver100}/${report.metrics.candidateLines} (${(report.metrics.candidateLineOverLimitRate * 100).toFixed(1)}%)`);
  console.log(`- Wrong turn count episodes: ${report.errors.wrongTurnCount.length}`);
  console.log(`- Wrong duration episodes: ${report.errors.wrongDuration.length}`);
  console.log(`- Duplicate long lines over limit: ${report.metrics.duplicateLongLinesOverLimit}`);
  console.log(`- Forbidden expression hits: ${report.metrics.forbiddenExpressionHits}`);
  console.log(`- Warnings: ${report.summary.warningCount}`);
  console.log(`- Report: ${path.relative(siteRoot, reportFile)}`);
  console.log(report.summary.pass ? "PASS" : "FAIL");

  if (!reportOnly && !report.summary.pass) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
