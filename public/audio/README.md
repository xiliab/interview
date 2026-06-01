# 音频文件命名规范

把你自己生成的一男一女对话音频放在这个目录。

支持格式：

- `UX-001.mp3`
- `UX-001.m4a`
- `UX-001.wav`
- `PM-001.mp3`
- `AI-CROSS-001.mp3`

文件名必须使用题目 ID，不要带方括号。新增或删除音频后，运行：

```bash
npm run scan:audio
```

网站会读取 `public/data/audio-manifest.json`，有音频的节目会显示播放按钮；没有音频的节目会显示“音频待添加”。
