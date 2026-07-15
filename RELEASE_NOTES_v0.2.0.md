# PaperWall v0.2.0

这次版本的重点不是“堆功能”，而是把论文管理、阅读、标注、导出和整体界面体验做成一个更完整、更稳定的本地工作台。

## ✨ 这版完成了什么

### 1) 本地论文管理更完整
- 本地 PDF 导入与卡片墙浏览
- 搜索 / 筛选 / 排序
- 左侧导航与智能书架
- 分类管理、收藏、阅读状态、详情页编辑

### 2) 阅读与标注链路已可用
- 全文阅读（连续滚动 + 缩放）
- 阅读页右侧辅助栏
- 选中文本浮动工具条（高亮 / 笔记 / 摘录 / 复制）
- 黄色 / 蓝色 / 红色高亮
- 高亮持久化与恢复
- 高亮备注（highlight remark）

### 3) 元数据与导出能力补齐
- DOI / arXiv 优先的标题与元数据补全
- 引用导出：EndNote RIS / 国标
- Markdown / Obsidian 导出
- 标签系统（多标签）

### 4) 阅读进度记忆
- 记录每篇论文最近阅读页码
- 重新打开恢复到上次位置
- 卡片与详情页显示阅读进度
- 与显式跳转逻辑兼容

### 5) 导入策略更合理（节省空间）
- 默认导入改为“引用原文件”
- 保留“复制到应用托管目录”为可选模式
- 两种模式兼容并可并存
- 原文件丢失检测 + 重新定位
- 设置中支持默认导入方式持久化

### 6) 设置与主题
- 轻量设置面板
- 深色模式第一版
- 主题切换与偏好持久化
- “恢复上次阅读位置”开关

## 🎨 UI 与体验打磨
- 整体 UI 风格统一
- 配色从偏冷白调整为更柔和的纸张/米色阅读风格
- 重点色从蓝色调整为更克制的深棕色体系
- 左侧导航、卡片墙、详情页、阅读页、设置面板做了系统化收口
- 边框、间距、层级、组件状态一致性明显提升

---

# PaperWall v0.2.0 (English)

This release focuses on turning PaperWall into a practical local workflow for managing, reading, annotating, and exporting papers.

## Highlights
- Complete local workflow: import → read → annotate → export
- Persistent highlights (yellow/blue/red) with recovery after reopen
- Highlight remarks, notes, excerpts, and copy actions in reader workflow
- DOI/arXiv-prioritized metadata completion
- Export: EndNote RIS, GB/T citation, Markdown/Obsidian
- Reading progress memory and resume
- Tag system (multi-tag)
- Space-friendly import strategy: reference-by-default + managed-copy optional
- Missing-file detection and relink flow
- Lightweight settings panel and first dark mode version
- Broad UI consistency polish across navigation, cards, detail panel, reader, and settings
