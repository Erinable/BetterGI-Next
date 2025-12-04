# BetterGI-Next 项目架构分析报告（含性能优化分析）

## 项目概述

BetterGI-Next 是一个基于 Better-xCloud 的新一代自动化引擎，专门为 Xbox 云游戏平台设计。该项目是一个用户脚本（UserScript），版本为 2.0.0，主要用于自动化处理 Xbox 云游戏中的各种任务，如自动跳过剧情等。

## 项目基本信息

- **项目名称**: BetterGI-Next
- **版本**: 2.0.0
- **技术栈**: TypeScript + Preact + OpenCV.js
- **构建工具**: esbuild + tsx
- **目标平台**: Xbox 云游戏 (https://www.xbox.com/*/play*)

## 核心架构

### 1. 入口文件 ([`src/index.ts`](src/index.ts:1))

项目入口点，负责初始化三大核心组件：
- 引擎实例 ([`Engine`](src/core/engine.ts:8))
- UI 管理器 ([`OverlayManager`](src/ui/overlay.tsx:67))
- 示例任务 ([`AutoSkipTask`](src/modules/tasks/demo-task.ts:4))

### 2. 核心引擎系统 ([`src/core/`](src/core/))

#### 引擎核心 ([`engine.ts`](src/core/engine.ts:1))
- **三大核心系统**:
  - [`InputSystem`](src/core/input.ts:3): 处理游戏输入模拟
  - [`VisionSystem`](src/core/vision.ts:3): 负责图像捕获和匹配
  - [`AlgoSystem`](src/core/algo.ts:10): 管理图像素材和匹配算法
- **任务管理**: 注册、启动、停止自动化任务
- **配置管理**: 动态调整匹配参数（阈值、降采样、多尺度等）
- **截图功能**: 支持区域截图和模板匹配预览

#### 输入系统 ([`input.ts`](src/core/input.ts:1))
- 通过 Better-xCloud 的 [`inputChannel`](src/core/input.ts:16) 发送游戏手柄输入
- 实现拟人化点击，包含随机持续时间模拟人类操作
- 支持所有 Xbox 手柄按键和摇杆输入

#### 视觉系统 ([`vision.ts`](src/core/vision.ts:1))
- 自动检测和锁定游戏视频流
- 实现屏幕截图和区域捕获功能
- 提供坐标映射，将识别结果转换回 UI 坐标
- 使用 Web Worker 进行图像匹配，避免阻塞主线程

#### 算法系统 ([`algo.ts`](src/core/algo.ts:1))
- 管理图像素材注册（Base64 → ImageData）
- 提供异步图像匹配接口
- 集成视觉系统进行模板匹配

#### 任务基类 ([`base-task.ts`](src/core/base-task.ts:1))
- 定义任务生命周期和执行框架
- 提供循环执行机制和上下文注入
- 支持任务初始化钩子

#### 流观察器 ([`stream-observer.ts`](src/core/stream-observer.ts:1))
- 监听视频流状态变化
- 自动暂停/恢复任务以适应网络波动

### 3. UI 系统 ([`src/ui/`](src/ui/))

#### 覆盖层管理器 ([`overlay.tsx`](src/ui/overlay.tsx:67))
- 创建 Shadow DOM 隔离 UI 样式
- 管理面板和悬浮球的状态切换
- 处理截图功能的流程控制

#### 主要组件
- [`App`](src/ui/components/App.tsx:13): 主控制面板，提供配置调整和任务控制
- [`FloatBall`](src/ui/components/FloatBall.tsx:10): 悬浮球，支持拖拽和左侧吸附
- [`DebugLayer`](src/ui/components/DebugLayer.tsx:11): 调试层，显示匹配结果和性能信息
- [`CropLayer`](src/ui/components/CropLayer.tsx:9): 截图层，支持区域选择和截图

#### 交互钩子 ([`useDraggable.ts`](src/ui/hooks/useDraggable.ts:9))
- 实现组件拖拽功能
- 支持边缘吸附效果
- 状态提升确保位置持久化

### 4. 图像处理 Worker ([`src/worker/vision.ts`](src/worker/vision.ts:1))

- 使用 OpenCV.js 进行高性能图像匹配
- 支持降采样和多尺度搜索
- 实现模板匹配算法 (TM_CCOEFF_NORMED)
- 通过 Transferable 优化性能

### 5. 工具库

#### 事件总线 ([`event-bus.ts`](src/utils/event-bus.ts:3))
- 实现组件间解耦通信
- 定义标准化事件常量

#### 数学工具 ([`math.ts`](src/utils/math.ts:4))
- 提供正态分布随机数生成
- 实现拟人化延迟计算

## 类型定义

### Better-xCloud 接口 ([`src/types/bx.d.ts`](src/types/bx.d.ts:1))
- [`BxInputChannel`](src/types/bx.d.ts:2): 定义输入通道接口
- [`BxExposedGlobal`](src/types/bx.d.ts:6): 定义 Better-xCloud 全局对象

### 全局类型 ([`src/types/global.d.ts`](src/types/global.d.ts:1))
- 声明 Worker 代码注入变量
- CSS 模块类型声明

## 构建系统 ([`build.ts`](build.ts:1))

- 使用 esbuild 进行代码打包
- 两阶段构建：先构建 Worker，再构建主脚本
- 自动注入 UserScript 元数据和 Worker 代码
- 支持开发模式热重载

## 配置系统 ([`config-manager.ts`](src/core/config-manager.ts:17))

- 使用 GM_setValue/GM_getValue 持久化配置
- 提供类型安全的配置访问接口
- 支持配置变更通知

## 示例任务 ([`demo-task.ts`](src/modules/tasks/demo-task.ts:4))

- 实现自动跳过剧情功能
- 演示任务注册、素材加载和循环处理流程
- 展示输入系统与视觉系统的协同工作

## 性能分析：模板匹配耗时 800ms 问题

### 当前性能瓶颈分析

根据代码分析，800ms 的匹配耗时主要来源于以下几个方面：

1. **多尺度匹配开销** ([`src/worker/vision.ts:31-50`](src/worker/vision.ts:31))
   - 默认配置使用 3 个尺度：[0.9, 1.0, 1.1] ([`src/core/engine.ts:22`](src/core/engine.ts:22))
   - 每个尺度都需要进行完整的模板匹配操作，增加约 3 倍计算量

2. **图像分辨率问题** ([`src/core/vision.ts:80-91`](src/core/vision.ts:80))
   - 获取全分辨率视频帧（videoWidth × videoHeight）
   - 即使有降采样，初始图像数据传输仍占用大量时间和内存

3. **OpenCV.js 加载和初始化** ([`src/worker/vision.ts:4`](src/worker/vision.ts:4))
   - 从 CDN 加载 OpenCV.js 可能存在网络延迟
   - WebAssembly 初始化需要时间

4. **数据传输开销** ([`src/core/vision.ts:166-170`](src/core/vision.ts:166))
   - 虽然使用了 Transferable 对象，但大块 ImageData 传输仍有开销

### 性能优化建议

1. **优化多尺度策略**
   - 减少默认尺度数量，如使用 [1.0] 或 [0.95, 1.0, 1.05]
   - 实现自适应尺度：先使用 1.0 尺度快速匹配，失败后再扩展尺度范围

2. **改进降采样策略**
   - 提高默认降采样率，从 0.5 提高到 0.33 或 0.25
   - 根据模板大小动态调整降采样率

3. **优化图像捕获**
   - 实现感兴趣区域(ROI)捕获，只处理屏幕关键部分
   - 添加帧缓存机制，避免重复处理相同帧

4. **Worker 优化**
   - 预加载和缓存 OpenCV.js
   - 实现模板预编译，减少重复初始化开销

5. **算法优化**
   - 考虑使用更快的匹配算法，如 TM_SQDIFF_NORMED
   - 实现早期终止机制，当找到足够高匹配度的结果时立即返回

6. **并行处理**
   - 将不同尺度的匹配分配到多个 Worker 并行处理
   - 实现模板缓存池，避免重复加载相同模板

### 实施建议

1. **短期优化**（立即可实施）：
   - 调整默认配置：减少尺度数量，提高降采样率
   - 添加性能监控，精确测量各环节耗时

2. **中期优化**（需要代码重构）：
   - 实现自适应匹配策略
   - 添加 ROI 支持

3. **长期优化**（架构改进）：
   - 考虑使用 WebGL 加速的图像处理库
   - 实现更智能的模板匹配算法

## 项目特点

1. **模块化架构**: 清晰的职责分离，易于扩展和维护
2. **高性能图像处理**: 使用 Web Worker 和 OpenCV.js 优化匹配性能
3. **拟人化交互**: 通过随机延迟和正态分布模拟人类操作
4. **灵活配置**: 支持动态调整匹配参数和算法选项
5. **可视化调试**: 提供实时匹配结果和性能指标显示
6. **响应式 UI**: 支持拖拽、吸附等现代交互体验

## 技术亮点

1. **Shadow DOM 隔离**: 避免与页面样式冲突
2. **Transferable 对象**: 优化 Worker 与主线程通信性能
3. **事件驱动架构**: 通过事件总线实现松耦合
4. **多尺度匹配**: 支持不同大小的目标识别
5. **自适应视频流**: 自动检测和适应游戏视频变化

这个项目展现了现代 Web 技术在浏览器自动化领域的创新应用，特别是在游戏辅助和自动化操作方面具有很高的实用价值。通过上述性能优化措施，可以显著降低模板匹配的耗时，提升用户体验。