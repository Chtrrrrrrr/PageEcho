# PageEcho · 页面回声

![version](https://img.shields.io/badge/version-1.1.2-blue)
![manifest](https://img.shields.io/badge/manifest-v3-blue)
![platform](https://img.shields.io/badge/chrome%20%7C%20firefox-115%2B-brightgreen)
![privacy](https://img.shields.io/badge/data-local%20only-lightgrey)
![Vibe%20Coded](https://img.shields.io/badge/vibe--coded-yes-ff69b4.svg)

> 在任意网页留下一句话。当你再次访问并满足条件时，它会在页面里滑出。

> [!NOTE]
> 本项目是 vibecoding 产物，请在安装前自行审阅源码。

## 功能

- 任意网页留话：悬浮按钮、`Ctrl / ⌘ + Shift + E`、右键菜单（可带上选中的文字）
- 四种触发：下次访问 / N 天后 / 第 N 次访问 / 停留超时
- 三种绑定：仅此页面 / 整个站点 / 任意网页
- 悬浮按钮会自己让位：它压住网页自己的按钮（或聊天入口）时先收起，让开了再回来；视频全屏或b站那种「网页全屏」播放时也会收起
- 条件满足时卡片从页面边缘滑出，显示留言与「已经过去多久」
- 多条同时到达就上下叠放；每张卡底部有倒计时条，时长按内容长度给，鼠标移上去会暂停，读完自己收回
- 可回一句、稍后再看、归档、删除；管理页支持筛选搜索、编辑、批量操作、JSON 导出导入
- 设置项：悬浮按钮与位置、按页面关闭悬浮按钮（前缀匹配）、卡片方向与同时显示数量、停留时长、主题、右键菜单、排除指定站点

## 界面风格

GitHub(Primer)：页面内的卡片与弹窗、悬浮按钮、Toast，以及管理页和工具栏弹窗里的每一块面板，
都长在 GitHub 自己的画布上——面板用 canvas、页头与嵌套盒子用 canvas.subtle、输入框用
canvas.inset，全部不透明，所以同一套文字色放在白底文章、黑底应用或彩色照片上都读得一样。
层次只由三样东西说明：一格发丝线边框（`border.default`，浅色 `#d0d7de` / 深色 `#30363d`）、
Primer 的圆角（盒子与控件 6px、浮层 12px、胶囊全圆）、以及 Primer 的阴影阶梯
（列表行只有发丝线，弹层中等，对话框最大）。没有任何 `backdrop-filter`。

颜色分工也是 GitHub 那套：蓝色 `#0969da` / `#1f6feb` 是强调色（链接、选中态、进度条），
主按钮用 GitHub 的绿色 `#1f883d` / `#238636`，危险动作用红色并分三级升级（红字 → 红底泛光
→ 「确认删除」实心）；凡是会变成*文字*的颜色都另取一档更亮/更暗的墨色，保证压在
自己的底色上仍然过 AA——`tools/uitest.js` 会把每个墨色在它可能落到的每种画布上算一遍
对比度，低于门槛就报错。焦点是一圈 2px 的强调色描边，选中行用 Primer 的中性 selection 底色，
开关型 chip 才用强调色浅底。

排版与信息密度没有改：字号、行高、内边距、列数都是原来的，换的只是材质（圆角、边框、
阴影与色彩层次）。

想直接看效果不用装扩展：打开 `tools/preview/index.html`。

## 适配与安装

Chrome / Edge / Brave（Manifest V3）与 Firefox 115+。

**Chrome**：打开 `chrome://extensions` → 开启「开发者模式」→「加载已解压的扩展程序」→ 选择本目录。想在 `file://` 页面使用，再开启「允许访问文件网址」。

**Firefox**：打开 `about:debugging#/runtime/this-firefox` →「临时载入附加组件」→ 选择本目录的 `manifest.json`（重启后失效，长期使用需签名）。

## 代码结构

```
manifest.json          MV3 清单（同时声明 service_worker 与 background.scripts 以兼容 Firefox）
icons/                 由 tools/make-icons.ps1 生成的图标
src/
  core/
    ext.js             跨浏览器 API 适配（browser 的 Promise / chrome 的回调）
    util.js            时间、文本等纯函数，以及「这算不算网页自己的控件」的判断
    schema.js          回声数据模型：默认值、标签、归一化与迁移
    matcher.js         URL 归一化、匹配、触发判定、排期文案、按页面屏蔽
    bg.js              状态引擎：写操作串行化，读写 chrome.storage.local
    store.js           客户端读写入口（读走 storage，写走消息）
  background/
    service-worker.js  徽标、右键菜单、快捷键、消息路由、内容脚本补注入
  content/
    content.js         悬浮按钮（含让位判断）、创作弹窗、停留计时、卡片投递、定时复核
  ui/
    styles.js          GitHub(Primer) 样式表与设计令牌（.pe-root 作用域，Shadow DOM 通用）
    components.js      卡片 / 创作弹窗 / 列表 / Toast 组件
  popup/               工具栏弹窗
  manager/             管理页（也是 options 页面）
tools/                 图标生成、四个测试套件（core / service worker / 端到端 / 管理页与弹窗）
  preview/             样式预览页：用假数据顶替 chrome.storage，双击即可看所有界面
```

## 开发

```bash
npm install     # 仅为测试安装 jsdom
npm test        # core / service worker / 端到端 / 管理页与弹窗，共 435 项检查（含配色对比度审计）
npm run icons   # 重新生成 icons/*.png
```

`selftest.js` 与 `swtest.js` 零依赖，可直接运行。
