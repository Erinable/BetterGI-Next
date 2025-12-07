<div align="center">

<img src="./assets/icon.png" alt="BetterGI-Next" width="120">

# BetterGI-Next

Xbox 云游戏自动化引擎

[![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)]()
[![Platform](https://img.shields.io/badge/platform-Xbox%20Cloud%20Gaming-107C10.svg)](https://www.xbox.com/play)

</div>

---

## 这是什么

一个跑在浏览器里的 userscript，用 OpenCV.js 做画面识别，通过 Better-xCloud 模拟手柄操作。

主要功能：
- **宏录制** - 录下你的操作，一键回放
- **自动任务** - 自动拾取、跳剧情
- **实时识别** - 模板匹配找图

## 依赖

- [Better-xCloud](https://github.com/nicenemo/better-xcloud)
- Tampermonkey / Violentmonkey

## 使用

```bash
npm install
npm run build
```

把 `dist/BetterGi-Next.user.js` 导入脚本管理器，打开 Xbox 云游戏即可。

## 结构

```
src/
├── core/
│   ├── engine.ts         # 主引擎
│   ├── vision.ts         # 画面识别
│   ├── input.ts          # 手柄模拟
│   ├── algo.ts           # 匹配算法
│   └── macro-manager.ts  # 宏管理
├── ui/components/        # UI 组件
└── modules/tasks/        # 任务实现
```

## 调试

```js
BetterGi.engine.input.tap('A')  // 测试按键
BetterGiDiag.check()            // 检查状态
```

## 文档

- [功能特性](./docs/FEATURES.md)
- [性能优化](./docs/PERFORMANCE_OPTIMIZATION.md)
- [架构说明](./docs/ARCHITECTURE.md)

## License

ISC
