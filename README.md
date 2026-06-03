# 面试播客资料库网站

一个基于 `interview-question-bank/` 生成的本地静态播客网站。每道面试题是一集节目，可以搜索、筛选、查看详情、阅读男女对话脚本，并播放你自己放入本地目录的音频。

## 启动

```bash
npm run generate:data
npm run dev
```

本地地址：

```text
http://127.0.0.1:5173/
```

## 音频放置规则

把你生成好的音频放到：

```text
public/audio/
```

文件名使用题目 ID，不带方括号：

```text
UX-001.mp3
PM-001.mp3
AI-CROSS-001.mp3
```

支持 `.mp3`、`.m4a`、`.wav`。新增或删除音频后运行：

```bash
npm run scan:audio
```

网站会更新 `public/data/audio-manifest.json`，有音频的节目显示播放按钮；没有音频的节目显示“音频待添加”。

## 数据生成

```bash
npm run generate:data
```

生成内容：

- `public/data/episodes.json`：200 集节目数据。
- `public/data/dialogues/*.json`：每集独立的男女对话脚本。
- `public/data/audio-manifest.json`：本地音频索引。
- `public/data/stats.json`：题量统计。

## 脚本质量检查

批量整理脚本轮次、短答长度、重复模板句和明显错词：

```bash
npm run optimize:dialogues
```

生成质量报告但不中断命令：

```bash
npm run quality:dialogues:report
```

作为验收门执行，未达标会返回非 0：

```bash
npm run quality:dialogues
```

报告输出到：

```text
public/data/dialogue-quality-report.json
```

检查内容包括：200 集文件完整性、JSON 和 ID 匹配、角色名、Deep-dive/Lite 轮次与时长、候选人台词长度、追问/压力问题/点评、重复模板句、明显错词和不自然表达。

## 说明

当前实现为 Vite + TypeScript 静态单页应用，不接后端、不上传音频、不接云 TTS。题库 JSON 和音频一样放在 `public/` 下作为本地静态资源，前端运行时通过 `/data/*.json` 读取。
