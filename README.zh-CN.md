# PaperWall

[English](./README.md) | [简体中文](./README.zh-CN.md)

一个本地离线的论文管理与阅读工作台。

PaperWall 最初只是我为自己做的论文整理工具：从“能导入 PDF 就行”，逐步做成了一个可持续使用的阅读与标注空间。

如果你也有囤论文、读论文、做摘录、记笔记的需求，欢迎试试看。也欢迎直接提 issue 反馈问题或建议。

---

## PaperWall 现在能做什么

目前它主要是一个 **本地离线论文管理 + 阅读 + 笔记工作台**，支持：

- 导入本地 PDF 论文，并可选择引用原文件或复制到托管目录
- 卡片墙浏览论文
- 右侧详情查看与编辑
- 全文阅读（连续滚动、缩放）
- 文本高亮（黄 / 蓝 / 红）
- 结构化笔记 / 摘录
- 元数据补全（DOI / arXiv）
- 引用导出与 Markdown 导出

---

## 当前核心功能

- PDF 导入、托管复制、缩略图生成
- 搜索 / 筛选 / 排序
- 智能书架
- 分类管理
- 标签系统（多标签）
- 收藏与阅读状态管理
- 结构化笔记与摘录
- 全文阅读与高亮持久化
- 阅读进度记忆与恢复
- 引用导出（EndNote RIS / 国标）
- Markdown / Obsidian 导出
- 打开 PDF / 打开文件夹
- 重复检测与删除论文

---

## 技术栈

- Tauri 2 (Rust)
- React + TypeScript + Vite
- Tailwind CSS
- Zustand
- SQLite
- PDF.js / react-pdf

---

## 本地开发

### 环境要求

- Node.js 20+
- npm 10+
- Rust stable
- macOS（目前主要在 macOS 上开发与测试）

### 安装依赖

```bash
npm install
```

### 启动开发环境

```bash
npm run tauri:dev
```

### 构建检查

```bash
npm run build
cd src-tauri && cargo check
```

---

## 打包（macOS）

### 生成 DMG

```bash
npm run tauri:build:mac:dmg
```

该命令会先构建 `.app`，再生成 `.dmg`。

### 产物路径

- App: `src-tauri/target/release/bundle/macos/PaperWall.app`
- DMG: `src-tauri/target/release/bundle/dmg/PaperWall_<version>_<arch>.dmg`

---

## 下载方式

版本发布后，安装包会放在仓库 **Releases** 页面，直接下载 `.dmg` 即可。

---

## macOS 首次打开提示

当前测试版暂未签名 / notarize，首次打开可能出现“未识别开发者”提示。

可通过以下方式放行：

1. Finder 右键 `PaperWall.app` -> `打开`
2. 或前往 **系统设置 -> 隐私与安全性**，点击“仍要打开”

---

## 仓库说明

以下内容不建议提交到 GitHub 仓库：

- `node_modules/`
- `dist/`
- `src-tauri/target/`
- `*.app`
- `*.dmg`
- 本地数据库与缓存文件（例如 `*.db`）

这些内容建议保留在本地，安装包只上传到 GitHub Release。

---

## 版本发布

发布说明模板见：

- [RELEASE_TEMPLATE.md](./RELEASE_TEMPLATE.md)

---

## License

当前仓库暂未附带正式 `LICENSE` 文件，后续确认开源协议后会补充。
