# unsafeWindow 沙箱穿透

## 问题

Tampermonkey 运行时脚本代码在沙箱内执行。直接使用 `window.BX_EXPOSED` 访问的是沙箱内的 `window`，拿不到 Better-xCloud 注入的真实对象。

表现：
- `InputSystem` 初始化时找不到 `inputChannel`
- 按键指令发出去了但游戏无反应

---

## 解决

### 1. 使用 `unsafeWindow`

`@grant unsafeWindow` 后，通过 `unsafeWindow` 访问真实页面环境：

```typescript
const win = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

get channel() {
    return win.BX_EXPOSED?.inputChannel;
}
```

### 2. 对象净化

沙箱内创建的 JS 对象传递给页面脚本时，属性可能无法被读取。

解决方案：用 `JSON.parse(JSON.stringify())` 深拷贝，切断沙箱引用链：

```typescript
private send() {
    if (!this.channel) return;
    // 净化对象
    const cleanState = JSON.parse(JSON.stringify(this.state));
    this.channel.sendGamepadInput(performance.now(), [cleanState]);
}
```

### 3. 容忍延迟加载

Better-xCloud 加载可能比 BetterGI 晚。初始化失败不阻断：

```typescript
if (attempts >= maxAttempts) {
    logger.warn('input', 'InputSystem 超时，稍后可能自动恢复');
    resolve(); // 继续初始化其他模块
}
```

---

## 验证

日志可能显示初始化失败，但实际功能正常。在控制台执行：

```js
window.BetterGiDiag.check()
```

应返回：
```js
{
  hasBXExposed: true,
  hasInputChannel: true,
  usingUnsafeWindow: true
}
```

---

## 构建配置

`build.ts` header 必须包含：

```js
// @grant unsafeWindow
```