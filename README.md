# PaperWall

PaperWall 是一个本地离线的论文管理与阅读工作台（桌面端），基于 Tauri 2 + React + TypeScript。

## 项目简介
- 管理本地 PDF 论文（导入到托管目录，不改原文件）
- 海报墙卡片浏览 + 右侧详情面板
- 全文阅读、文本高亮、结构化笔记/摘录
- 本地元数据补全（DOI / arXiv）与引用导出

## 当前核心功能
- PDF 导入、托管复制、缩略图生成
- 搜索/筛选/排序、智能书架、分类管理
- 收藏、阅读状态、笔记与摘录
- 引用导出（EndNote RIS / GB-T）
- 打开 PDF / 打开文件夹
- 重复检测、删除论文

## 技术栈
- Tauri 2 (Rust)
- React + TypeScript + Vite
- Tailwind CSS
- Zustand
- SQLite
- PDF.js / react-pdf

## 本地开发
### 环境要求
- Node.js 20+
- npm 10+
- Rust stable
- macOS（当前打包与测试优先）

### 安装依赖
```bash
npm install
```

### 启动开发
```bash
npm run tauri:dev
```

### 构建检查
```bash
npm run build
cd src-tauri && cargo check
```

## 打包（macOS）
### 生成 DMG
```bash
npm run tauri:build:mac:dmg
```

该命令会先构建 `.app`，再生成 `.dmg`。

### 产物路径
- App: `src-tauri/target/release/bundle/macos/PaperWall.app`
- DMG: `src-tauri/target/release/bundle/dmg/PaperWall_<version>_<arch>.dmg`

## GitHub Release 下载说明
发布后，用户可在仓库的 **Releases** 页面下载 `.dmg` 安装包。

## macOS 未签名应用提示（FAQ）
当前测试版为未签名/未 notarize 版本，首次打开可能出现“未识别开发者”提示。

可用以下方式放行：
1. Finder 中右键 `PaperWall.app` -> `打开`
2. 或到“系统设置 -> 隐私与安全性”点击“仍要打开”

## 仓库建议（重要）
请不要把以下内容提交到 GitHub 仓库：
- `node_modules/`
- `dist/`
- `src-tauri/target/`
- `*.app`, `*.dmg`
- 本地数据库与缓存文件（如 `*.db`）

这些文件应留在本地，或仅在 GitHub Release 里上传安装包。

## 版本发布模板
发布说明模板见：
- [RELEASE_TEMPLATE.md](./RELEASE_TEMPLATE.md)

## 许可证
当前仓库未附带 `LICENSE` 文件。  
建议你确认开源许可证类型（如 MIT / Apache-2.0）后再补充。
