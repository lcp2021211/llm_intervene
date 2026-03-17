# LLM Intervene

面向“大模型过滤与引导”的完整项目，包含：

- 输入/输出敏感词识别与过滤
- 基于规则引擎的提示词强化与输出校验
- 对外 REST API
- 可视化前端控制台

## 项目结构

```text
apps/
  server/   Express + TypeScript API
  web/      React + Vite 控制台
packages/
  shared/   前后端共享类型
```

## 核心能力

### 1. 敏感词过滤

- 支持用户自定义敏感词列表
- 支持 `remove` / `replace` / `notify` 三种处理策略
- 同时支持输入提示词和模型输出的二次过滤
- 采用 Trie 匹配实现，便于后续扩展为更大的词库

### 2. 规则引擎引导

- 支持输出格式约束：`plain` / `markdown` / `json` / `html` / `bullet-list` / `custom`
- 支持领域范围、目标受众、语气、情感色彩等控制项
- 支持关键词、禁止主题、正则、长度限制、JSON Schema 校验
- 支持规则建议能力，用于辅助生成更稳的配置

## 典型调用流程

1. 上游系统调用 `/api/prompt/transform`
2. 服务先做输入敏感词过滤，再把规则引擎约束拼装进提示词
3. 上游系统将强化后的提示词发送给大模型
4. 拿到模型输出后，再调用 `/api/output/process`
5. 服务执行输出过滤与规则校验，并返回过滤结果与校验结果

## 主要接口

### `GET /api/config/default`

返回默认演示配置。

### `POST /api/filter/preview`

请求示例：

```json
{
  "text": "这里包含违规词和机密数据",
  "stage": "input",
  "filter": {
    "enabled": true,
    "action": "replace",
    "replacementText": "[已处理]",
    "caseSensitive": false,
    "customWords": [
      { "term": "违规词", "replacement": "[敏感内容]" }
    ]
  }
}
```

### `POST /api/prompt/transform`

用于输入过滤 + 提示词强化。

### `POST /api/output/process`

用于输出过滤 + 规则校验。

## 本地运行

```bash
npm install
npm run dev:server
npm run dev:web
```

前端默认地址：`http://localhost:5173`

后端默认地址：`http://localhost:3001`

## 文档

- 接入说明文档：`docs/api-guide.md`
- OpenAPI 描述：`docs/openapi.yaml`
