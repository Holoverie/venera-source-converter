# Venera Source Converter

**Venera Source Converter** 是一个强大的中间件服务，旨在将 **Venera** 漫画阅读器的 JavaScript 漫画源无缝转换为通用的 REST API 格式。通过本项目，您可以轻松地将 Venera 丰富的漫画源生态复用到其他不支持 JS 插件的漫画阅读器或自定义前端中。

本项目不仅实现了核心的转换逻辑，还针对网络稳定性、反爬虫机制和图片代理进行了深度优化，确保在各种网络环境下都能稳定运行。

## ✨ 核心特点

*   **无缝兼容 Venera 源**：直接加载 Venera 的 `.js` 漫画源文件，无需修改源码即可运行。完美模拟 Venera 运行时环境（包括 `Network`, `HtmlDocument`, `Crypto`, `UI` 等 API）。
*   **标准化 REST API**：将复杂的 JS 逻辑转换为统一的 JSON 格式接口，支持：
    *   **搜索** (`/search/:text/:page`)
    *   **详情** (`/comic/:id`)
    *   **章节图片** (`/photo/:id/chapter/:chapter`)
    *   **源配置** (`/config`)
*   **智能图片代理**：
    *   内置强大的图片反向代理 (`/proxy`)，自动处理防盗链（Referer）、Headers 签名等问题。
    *   **并发控制与排队**：内置请求队列，防止高并发导致 IP 被封或服务崩溃。
    *   **格式自动转换**：智能将 WebP 等格式转换为通用的 JPEG/PNG，确保在所有设备上的兼容性。
    *   **自动重试与保活**：针对不稳定网络（如 `socket hang up`）实现了自动重试机制，大幅提高成功率。
*   **动态源管理**：
    *   **自动刷新**：后台定时任务自动刷新源配置，无需手动重启。
    *   **热重载**：支持通过 `/reload` 接口热加载新的源文件。
*   **高度容错**：
    *   智能识别单篇/本子与连载漫画，自动修正页数与章节显示逻辑。
    *   自动处理 URL 协议（HTTP/HTTPS）和端口问题，生成规范的链接。

## 🚀 快速开始

### 1. 安装依赖

确保您已安装 Node.js (推荐 v16+)。

```bash
npm install
```

### 2. 添加漫画源

将 Venera 的 `.js` 漫画源文件放入 `sources` 目录中。

### 3. 启动服务

```bash
# 默认在 3000 端口启动
npm start

# 或者指定端口
npm start -- 8080
```

服务启动后，访问 `http://localhost:3000` 即可查看运行状态。

### 4. API 使用示例

*   **获取源配置**：
    `GET /config`
*   **搜索漫画**：
    `GET /search/<text>/1?source=<source>`
*   **获取漫画详情**：
    `GET /comic/<id>?source=<source>`
*   **获取章节图片**：
    `GET /photo/<id>/chapter/<chapter>?source=<source>`

## ❤️ 致谢 Venera

本项目的诞生离不开 [**Venera**](https://github.com/venera-app) 及其社区的杰出贡献。

特别感谢 **Venera** 项目组：
*   感谢你们设计了如此灵活且强大的漫画源插件系统，让漫画阅读变得如此自由和便捷。
*   感谢你们开源了高质量的漫画源实现，为本项目提供了核心的数据获取逻辑。
*   Venera 对漫画源生态的规范化定义，是本项目能够实现通用转换的基石。

我们深知开源不易，谨以此项目向 Venera 致敬，希望能让更多人享受到 Venera 生态带来的便利！

---
*本项目仅供学习交流使用，请勿用于非法用途。*
