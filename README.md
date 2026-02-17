# 竞品巡店地图系统

基于飞书多维表格的竞品门店地图可视化系统，支持实时数据同步、智能筛选和 AI 分析。

## ✨ 主要功能

- 📍 **高德地图集成** - 实时展示竞品门店位置，支持点聚合和交互
- 🔄 **飞书数据同步** - 从飞书多维表格实时拉取巡店记录
- 🔍 **多维度筛选** - 支持省区、品牌、搜索关键词等多重筛选
- 🤖 **AI 智能分析** - 基于火山方舟 Doubao 模型的竞品数据分析
- 📱 **移动端优化** - 响应式设计，完美适配飞书 H5 环境
- 📊 **统计仪表板** - 实时统计记录总数、主要竞品产品分布

## 🛠️ 技术栈

- **前端框架**: Next.js 14 (App Router)
- **开发语言**: TypeScript
- **UI 框架**: Tailwind CSS
- **地图服务**: 高德地图 JS API 2.0
- **数据源**: 飞书开放平台 API
- **AI 服务**: 火山方舟 Doubao API

## 📦 环境变量配置

创建 `.env` 文件并配置以下环境变量：

```bash
# 飞书配置
FEISHU_APP_ID=your_app_id
FEISHU_APP_SECRET=your_app_secret
FEISHU_APP_TOKEN=your_app_token
FEISHU_TABLE_ID=your_table_id

# 高德地图配置
NEXT_PUBLIC_AMAP_KEY=your_amap_key
NEXT_PUBLIC_AMAP_SECURITY_CODE=your_security_code

# AI 配置（火山方舟）
DOUBAO_API_KEY=your_api_key
DOUBAO_Endpoint=your_endpoint_id
```

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env` 并填写相关配置

### 3. 启动开发服务器

```bash
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000) 查看应用

### 4. 构建生产版本

```bash
npm run build
npm start
```

## 📱 在飞书中使用

1. 将应用部署到服务器
2. 在飞书工作台创建自定义应用
3. 配置应用 URL 指向部署地址
4. 在移动端飞书中打开即可使用

## 🎯 核心功能说明

### 地图展示
- 支持省份和城市边界线绘制
- 不同品牌使用不同颜色的标记点
- 鼠标悬停显示品牌 Logo

### 筛选功能
- **省区筛选**: 支持多选省区（长三角、山东、广东等）
- **品牌筛选**: 支持多选竞品品牌
- **搜索功能**: 支持关键词搜索门店名称、产品、地址等

### AI 分析
- 自动统计竞品品牌分布
- 分析主要产品类型
- 总结折扣/价格情况
- 提供地域分布洞察

## 📄 许可证

MIT

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！
