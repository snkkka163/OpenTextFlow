# OpenTextFlow（中文说明）

<img src="./src/assets/logo.png" alt="OpenTextFlow Logo" width="220" />


OpenTextFlow 是一款**基于AI的Word文档优化器**，用于提升文档表达质量、编辑效率与可追踪性。

## 核心功能

- DOCX 文档预览与编辑辅助（基于 `docx-preview`）
- 选中文本后发起 AI 优化建议
- AI 建议的行内差异（Diff）预览
- AI 修改区域黄色高亮标记
- `Ctrl+F` / `Cmd+F` 文档内搜索，`Enter` / `Shift+Enter` 跳转结果
- 编辑历史记录（SQLite）
- 多 Agent 提示词配置
- 中英文界面切换

## 安装与运行

### 环境要求

- Node.js 18+
- npm 10+

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

### 构建

```bash
npm run build
```

### 预览（Web 构建）

```bash
npm run preview
```

## 快捷键

- `Ctrl+F` / `Cmd+F`: 打开文档内搜索
- `Enter`: 跳到下一个命中
- `Shift+Enter`: 跳到上一个命中
- `Esc`（搜索输入框内）: 关闭搜索栏

## 目录结构

```text
OpenTextFlow/
  electron/                 # Electron 主进程
  public/                   # 静态资源（favicon 等）
  src/
    assets/                 # 应用资源（logo、背景图等）
    components/             # 核心界面组件
    i18n/                   # 多语言文案
  index.html
  package.json
```

## 相关链接

- English README: [README.en-US.md](README.en-US.md)
- 主 README 入口: [README.md](README.md)

## 说明

- 运行时用户数据数据库位于用户主目录：`.open-text-flow/opentextflow.db`
- 仓库默认仅包含源码与静态资源
