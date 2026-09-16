# PageEcho · 页面回声

![GitHub stars](https://img.shields.io/github/stars/Chtrrrrrrr/PageEcho?style=social)
![version](https://img.shields.io/badge/version-1.0.0-blue)
![manifest](https://img.shields.io/badge/manifest-v3-blue)
![platform](https://img.shields.io/badge/chrome%20%7C%20firefox-115%2B-brightgreen)
![privacy](https://img.shields.io/badge/data-local%20only-lightgrey)

> 在任意网页留下一句话。当你再次访问并满足条件时，它会在页面里滑出。

> [!NOTE]
> 本项目是 vibecoding 产物，请在安装前自行审阅源码。

## 功能

- 任意网页留话：悬浮按钮、`Ctrl / ⌘ + Shift + E`、右键菜单（可带上选中的文字）
- 四种触发：下次访问 / N 天后 / 第 N 次访问 / 停留超时
- 三种绑定：仅此页面 / 整个站点 / 任意网页
- 条件满足时卡片从页面边缘滑出，显示留言与「已经过去多久」
- 多条同时到达就上下叠放；每张卡底部有倒计时条，时长按内容长度给，鼠标移上去会暂停，读完自己收回
- 可回一句、稍后再看、归档、删除；管理页支持筛选搜索、编辑、批量操作、JSON 导出导入

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
    util.js            时间、文本等纯函数
    schema.js          回声数据模型：默认值、标签、归一化与迁移
    matcher.js         URL 归一化、匹配、触发判定、排期文案
    bg.js              状态引擎：写操作串行化，读写 chrome.storage.local
    store.js           客户端读写入口（读走 storage，写走消息）
  background/
    service-worker.js  徽标、右键菜单、快捷键、消息路由、内容脚本补注入
  content/
    content.js         悬浮按钮、创作弹窗、停留计时、卡片投递、定时复核
  ui/
    styles.js          共享样式表与设计令牌（.pe-root 作用域，Shadow DOM 通用）
    components.js      卡片 / 创作弹窗 / 列表 / Toast 组件
  popup/               工具栏弹窗
  manager/             管理页（也是 options 页面）
tools/                 图标生成与四个测试套件（core / service worker / 端到端 / 管理页）
```

## 开发

```bash
npm install     # 仅为测试安装 jsdom
npm test        # core / service worker / 端到端 / 管理页与弹窗，共 274 项检查
npm run icons   # 重新生成 icons/*.png
```

`selftest.js` 与 `swtest.js` 零依赖，可直接运行。
