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
- `public/data/dialogues.json`：每集男女对话脚本。
- `public/data/audio-manifest.json`：本地音频索引。
- `public/data/stats.json`：题量统计。

## 说明

当前实现为 Vite + TypeScript 静态单页应用，不接后端、不上传音频、不接云 TTS。题库 JSON 和音频一样放在 `public/` 下作为本地静态资源，前端运行时通过 `/data/*.json` 读取。
