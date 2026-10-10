# PageMT

**PageMT** — 浏览器整页翻译 Chrome 扩展（Manifest V3），翻译由本地 [LM Studio](https://lmstudio.ai) 服务完成，默认对接 `hy-mt2-1.8b-mlx`（Hunyuan-MT-2 系列）模型。全文不出本机。

## 功能

- ✅ 一键翻译整个网页可见文本（跳过代码块/输入框/脚本）
- ✅ 源语言（含自动检测）＋ 目标语言（20 种）设置
- ✅ `<SEP>` 分隔符批量翻译，速度更快；模型不听话时自动逐段降级
- ✅ 可调并发／批量大小；失败段落自动保留原文，不会挖坑
- ✅ 一键还原原文；可选鼠标悬停显示原文
- ✅ 右下角实时进度条状态

## 安装

### 方式一：从 Releases 安装（推荐）

1. 到 [Releases](https://github.com/wooluo/PageMT/releases) 下载 `PageMT-vX.Y.Z.zip` 并解压
2. 打开 Chrome，访问 `chrome://extensions`
3. 右上角打开「开发者模式」
4. 点「加载已解压的扩展程序」，选择解压后的文件夹

### 方式二：从源码

```bash
git clone https://github.com/wooluo/PageMT.git
# chrome://extensions → 开发者模式 → 加载已解压的扩展程序 → 选 PageMT/
```

## LM Studio 服务端准备

1. 下载并安装 [LM Studio](https://lmstudio.ai)（需支持 MLX 的 macOS 版，或任意可跑 GGUF 的版本）
2. 在 LM Studio 中搜索并加载模型 `hy-mt2-1.8b-mlx`（Hunyuan-MT-2 1.8B）
3. 打开 **Developer → Start Server**（默认 `http://localhost:1234`）

> LM Studio 提供 OpenAI 兼容 API。其他兼容服务（Ollama、vLLM、llama.cpp server 等）也可以，在扩展设置里改地址和模型名即可。

## 使用

1. 点扩展图标打开弹窗
2. 选源语言（或「自动检测」）和目标语言
3. 点 **翻译本页** —— 右下角会显示进度
4. 点 **还原** 恢复原文

### 设置说明

| 设置 | 默认 | 说明 |
|---|---|---|
| 服务地址 | `http://localhost:1234` | LM Studio 本地服务 |
| 模型名 | `hy-mt2-1.8b-mlx` | 按实际加载的模型名填 |
| 并发数 | 4 | 同时进行的请求数 |
| 批量段数 | 12 | 每次 `<SEP>` 打包的文本段数 |
| 悬停显示原文 | 关 | 译文上悬停 title 显示原文 |

## 结构

```
PageMT/
├── manifest.json       # MV3 清单
├── background.js       # service worker: 收集→批量翻译→回写编排
├── content.js          # 页面内文本替换/还原/进度显示
├── content.css
├── lib/config.js       # 语言表 + HY-MT2 官方 prompt 模板
├── popup/              # 设置弹窗
└── icons/
```

## License

MIT
