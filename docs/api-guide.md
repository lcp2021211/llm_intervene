# LLM Intervene 对接接口文档

本文档面向需要接入本项目的其他系统研发人员，重点说明：

- 什么时候调用哪个接口
- 每个接口的作用是什么
- 请求参数应该怎么传
- 返回结果应该怎么使用

补充说明：

- OpenAPI 原始描述见 [openapi.yaml](./openapi.yaml)
- 本文更偏“接入说明”和“调用指导”

## 1. 接入目标

本系统用于在大模型调用链路中增加两层控制：

1. 模型调用前：
   对用户输入提示词做敏感词过滤，并根据规则引擎对提示词进行强化
2. 模型调用后：
   对模型输出再次做敏感词过滤，并按规则引擎做格式和内容校验

因此，推荐调用链路如下：

```text
用户输入
  -> 调用 /api/prompt/transform
  -> 将 strengthenedPrompt 发送给大模型
  -> 获得模型原始输出
  -> 调用 /api/output/process
  -> 将 filteredOutput.filteredText 返回给最终用户
```

## 2. 基础说明

### 2.1 服务地址

默认本地地址：

```text
http://localhost:3001
```

### 2.2 请求格式

- 请求头：`Content-Type: application/json`
- 请求体：JSON
- 返回体：JSON

### 2.3 成功响应

成功时返回 HTTP `200`，响应体中包含对应业务结果。

### 2.4 失败响应

当前版本主要返回框架默认错误；建议调用方至少处理：

- `400`：请求体不符合预期
- `500`：服务端异常

后续如果需要，我建议补统一错误码和鉴权机制。

## 3. 核心数据结构

几乎所有核心接口都会用到以下两个配置对象：

### 3.1 `filter`

用于定义敏感词过滤策略。

```json
{
  "enabled": true,
  "action": "replace",
  "replacementText": "[已处理]",
  "caseSensitive": false,
  "customWords": [
    {
      "term": "违规词",
      "replacement": "[敏感内容]"
    },
    {
      "term": "机密数据",
      "replacement": "[保密信息]"
    }
  ]
}
```

字段说明：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `enabled` | `boolean` | 是 | 是否启用敏感词过滤 |
| `action` | `string` | 是 | 处理方式，可选 `remove` / `replace` / `notify` |
| `replacementText` | `string` | 是 | 当 `action=replace` 且单词未配置专属替换词时使用 |
| `caseSensitive` | `boolean` | 是 | 是否区分大小写 |
| `customWords` | `array` | 是 | 敏感词列表 |

`customWords` 元素字段说明：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `term` | `string` | 是 | 敏感词本身 |
| `replacement` | `string` | 否 | 该敏感词命中后的专属替换文本 |
| `severity` | `string` | 否 | 预留字段，可选 `low` / `medium` / `high` |
| `tags` | `string[]` | 否 | 预留字段，用于打标签 |

### 3.2 `rules`

用于定义规则引擎对提示词和输出内容的约束。

```json
{
  "outputFormat": "json",
  "domain": "计算机",
  "tone": "formal",
  "emotion": "neutral",
  "audience": "企业研发团队",
  "constraints": {
    "requiredKeywords": ["接口", "安全"],
    "forbiddenTopics": ["医疗诊断", "政治宣传"],
    "regexRules": ["^(.|\\n){0,2000}$"],
    "lengthLimit": 1200,
    "jsonSchema": "{ \"type\": \"object\" }",
    "customInstruction": "避免无依据的结论，优先给出工程落地建议。"
  }
}
```

字段说明：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `outputFormat` | `string` | 是 | 希望模型输出的格式，可选 `plain` / `markdown` / `json` / `html` / `bullet-list` / `custom` |
| `domain` | `string` | 是 | 限定生成内容所属领域，如“计算机”“法务” |
| `tone` | `string` | 是 | 语气，可选 `formal` / `professional` / `friendly` / `academic` / `concise` |
| `emotion` | `string` | 是 | 情感色彩，可选 `neutral` / `calm` / `positive` / `serious` / `enthusiastic` |
| `audience` | `string` | 是 | 回答面向的目标受众 |
| `constraints` | `object` | 是 | 更细粒度约束 |

`constraints` 字段说明：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `requiredKeywords` | `string[]` | 是 | 要求输出必须包含的关键词 |
| `forbiddenTopics` | `string[]` | 是 | 输出不得涉及的主题 |
| `regexRules` | `string[]` | 是 | 输出需满足的正则表达式列表 |
| `lengthLimit` | `number` | 否 | 输出总长度上限 |
| `jsonSchema` | `string` | 否 | 当 `outputFormat=json` 时可用于做 JSON Schema 校验 |
| `customInstruction` | `string` | 否 | 额外提示词约束 |

## 4. 接口清单

### 4.1 `GET /api/health`

作用：

- 用于健康检查
- 适合被网关、监控或上游系统启动探测调用

请求参数：

- 无

请求示例：

```bash
curl http://localhost:3001/api/health
```

响应示例：

```json
{
  "ok": true,
  "service": "llm-intervene-server",
  "timestamp": "2026-03-17T03:00:00.000Z"
}
```

### 4.2 `GET /api/config/default`

作用：

- 获取系统内置演示配置
- 适合前端初始化配置页，或接入方快速拿一套默认模板

请求参数：

- 无

请求示例：

```bash
curl http://localhost:3001/api/config/default
```

响应说明：

- 返回默认的 `filter` 和 `rules`
- 调用方可直接复用，也可作为模板二次修改

### 4.3 `POST /api/filter/preview`

作用：

- 单独验证某段文本会被如何过滤
- 适合配置页面做“试运行”
- 不做规则强化，只做敏感词识别与处理

适用场景：

- 配置人员录入敏感词后，想立即查看过滤效果
- 上游系统只想单独做一次输入或输出过滤

请求体：

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
      { "term": "违规词", "replacement": "[敏感内容]" },
      { "term": "机密数据", "replacement": "[保密信息]" }
    ]
  }
}
```

字段说明：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `text` | `string` | 是 | 要过滤的原始文本 |
| `stage` | `string` | 是 | 当前文本属于 `input` 还是 `output` |
| `filter` | `object` | 是 | 敏感词过滤配置，结构见上文 |

响应示例：

```json
{
  "originalText": "这里包含违规词和机密数据",
  "filteredText": "这里包含[敏感内容]和[保密信息]",
  "changed": true,
  "blocked": false,
  "stage": "input",
  "matches": [
    {
      "term": "违规词",
      "start": 4,
      "end": 7,
      "replacement": "[敏感内容]"
    }
  ],
  "messages": [
    "输入已命中 2 个敏感词，并按策略完成处理。"
  ]
}
```

返回字段说明：

| 字段 | 说明 |
| --- | --- |
| `originalText` | 原始输入文本 |
| `filteredText` | 过滤后的文本 |
| `changed` | 是否发生了修改 |
| `blocked` | 是否应阻断；当 `action=notify` 且命中敏感词时通常为 `true` |
| `stage` | 本次处理阶段 |
| `matches` | 命中的敏感词列表及位置 |
| `messages` | 可展示给调用方或运营人员的说明信息 |

### 4.4 `POST /api/prompt/transform`

作用：

- 这是模型调用前最重要的接口
- 先对用户原始提示词进行敏感词过滤
- 再将规则引擎中的格式、领域、语气、长度、Schema 等要求拼接进提示词
- 最终返回“可直接发送给大模型”的强化提示词

推荐调用时机：

- 在上游系统真正调用大模型之前必须调用一次

请求体：

```json
{
  "prompt": "请生成一个关于企业 AI 网关安全治理的 JSON 方案，覆盖接口约束和敏感词过滤。",
  "filter": {
    "enabled": true,
    "action": "replace",
    "replacementText": "[已处理]",
    "caseSensitive": false,
    "customWords": [
      { "term": "违规词", "replacement": "[敏感内容]" }
    ]
  },
  "rules": {
    "outputFormat": "json",
    "domain": "计算机",
    "tone": "formal",
    "emotion": "neutral",
    "audience": "企业研发团队",
    "constraints": {
      "requiredKeywords": ["接口", "安全"],
      "forbiddenTopics": ["医疗诊断", "政治宣传"],
      "regexRules": ["^(.|\\n){0,2000}$"],
      "lengthLimit": 1200,
      "jsonSchema": "{ \"type\": \"object\" }",
      "customInstruction": "避免无依据的结论，优先给出工程落地建议。"
    }
  }
}
```

响应示例：

```json
{
  "filteredPrompt": {
    "originalText": "原始提示词",
    "filteredText": "过滤后的提示词",
    "changed": true,
    "blocked": false,
    "stage": "input",
    "matches": [],
    "messages": ["输入已完成过滤。"]
  },
  "strengthenedPrompt": "过滤后的提示词 + 规则强化说明",
  "instructionBlocks": [
    "你是一名严格遵守输出约束的助手。",
    "回答领域限制：仅围绕“计算机”展开，偏离主题时主动收束。",
    "输出格式：返回合法 JSON，不要附带 JSON 之外的说明。"
  ],
  "validationPreview": [
    {
      "type": "format",
      "ok": true,
      "message": "当前未启用严格 plain 结构校验。"
    }
  ],
  "suggestions": [
    {
      "label": "建议切换到 JSON 输出",
      "reason": "提示词里有结构化返回意图，使用 JSON 约束更稳。",
      "patch": {
        "outputFormat": "json"
      }
    }
  ]
}
```

返回字段说明：

| 字段 | 说明 |
| --- | --- |
| `filteredPrompt` | 输入提示词过滤结果 |
| `strengthenedPrompt` | 可直接发给模型的强化后提示词 |
| `instructionBlocks` | 规则引擎实际生效的规则块 |
| `validationPreview` | 基于当前规则生成的预览校验结果 |
| `suggestions` | 系统自动生成的规则建议 |

调用方如何使用：

1. 如果 `filteredPrompt.blocked=true`，说明不应继续调模型，应提示用户修正
2. 如果未阻断，则使用 `strengthenedPrompt` 调用大模型
3. 建议保留 `instructionBlocks` 和 `matches` 用于审计

### 4.5 `POST /api/output/process`

作用：

- 这是模型输出后的关键接口
- 对模型原始输出再做一次敏感词过滤
- 如果传入 `rules`，还会附带做规则校验

推荐调用时机：

- 模型返回内容后、返回给最终用户前调用

请求体：

```json
{
  "output": "{\"summary\":\"接口安全方案\",\"items\":[]}",
  "filter": {
    "enabled": true,
    "action": "replace",
    "replacementText": "[已处理]",
    "caseSensitive": false,
    "customWords": [
      { "term": "内部密码", "replacement": "[安全占位]" }
    ]
  },
  "rules": {
    "outputFormat": "json",
    "domain": "计算机",
    "tone": "formal",
    "emotion": "neutral",
    "audience": "企业研发团队",
    "constraints": {
      "requiredKeywords": ["接口", "安全"],
      "forbiddenTopics": ["医疗诊断", "政治宣传"],
      "regexRules": ["^(.|\\n){0,2000}$"],
      "lengthLimit": 1200,
      "jsonSchema": "{ \"type\": \"object\" }"
    }
  }
}
```

字段说明：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `output` | `string` | 是 | 模型原始输出内容 |
| `filter` | `object` | 是 | 敏感词过滤配置 |
| `rules` | `object` | 否 | 若传入则执行规则校验，不传则只过滤 |

响应示例：

```json
{
  "filteredOutput": {
    "originalText": "{\"summary\":\"接口安全方案\"}",
    "filteredText": "{\"summary\":\"接口安全方案\"}",
    "changed": false,
    "blocked": false,
    "stage": "output",
    "matches": [],
    "messages": ["未命中敏感词。"]
  },
  "validation": [
    {
      "type": "format",
      "ok": true,
      "message": "输出是合法 JSON。"
    },
    {
      "type": "schema",
      "ok": true,
      "message": "通过 JSON Schema 校验。"
    }
  ]
}
```

调用方如何使用：

1. 将 `filteredOutput.filteredText` 作为最终返回结果候选
2. 检查 `validation` 中是否存在 `ok=false`
3. 如果有失败项，可按业务策略：
   - 直接拦截
   - 让模型重试
   - 回退到默认文案
   - 转人工审核

### 4.6 `POST /api/rules/suggest`

作用：

- 根据提示词内容给出规则建议
- 适合前端配置界面做“智能推荐”
- 不直接改写提示词，只返回建议项

请求体：

```json
{
  "prompt": "请返回一个 JSON 结构的系统设计方案",
  "rules": {
    "outputFormat": "plain",
    "domain": "",
    "tone": "friendly",
    "emotion": "neutral",
    "audience": "研发人员",
    "constraints": {
      "requiredKeywords": [],
      "forbiddenTopics": [],
      "regexRules": []
    }
  }
}
```

响应示例：

```json
{
  "suggestions": [
    {
      "label": "建议切换到 JSON 输出",
      "reason": "提示词里有结构化返回意图，使用 JSON 约束更稳。",
      "patch": {
        "outputFormat": "json"
      }
    }
  ]
}
```

适用场景：

- 前端页面做“自动推荐规则”
- 配置中心做人机协同配置

## 5. 推荐接入方式

### 5.1 模型调用前

调用：

```text
POST /api/prompt/transform
```

拿到：

- `filteredPrompt`
- `strengthenedPrompt`

处理建议：

- `blocked=true`：终止调用，提示用户修正
- `blocked=false`：将 `strengthenedPrompt` 发送给大模型

### 5.2 模型调用后

调用：

```text
POST /api/output/process
```

拿到：

- `filteredOutput`
- `validation`

处理建议：

- `validation` 全通过：返回 `filteredOutput.filteredText`
- 存在失败项：按你们业务策略拦截、重试或审核

## 6. JavaScript 调用示例

### 6.1 提示词强化

```ts
const response = await fetch("http://localhost:3001/api/prompt/transform", {
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    prompt: "请生成一个企业 AI 安全方案",
    filter,
    rules
  })
});

const data = await response.json();

if (data.filteredPrompt.blocked) {
  throw new Error("提示词包含敏感词，需要用户修正");
}

const promptForModel = data.strengthenedPrompt;
```

### 6.2 输出处理

```ts
const response = await fetch("http://localhost:3001/api/output/process", {
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    output: modelRawOutput,
    filter,
    rules
  })
});

const data = await response.json();
const finalOutput = data.filteredOutput.filteredText;
const failedRules = data.validation.filter((item: { ok: boolean }) => !item.ok);
```

## 7. 接入建议

1. 上游系统至少接入 `/api/prompt/transform` 和 `/api/output/process` 这两个接口。
2. `filter` 和 `rules` 建议由你们自己的配置中心统一下发，避免每次调用临时拼装。
3. 若你们有多业务线，建议为不同业务维护不同规则模板。
4. 若输出要求严格结构化，建议固定 `outputFormat=json` 并始终传 `jsonSchema`。
5. 若业务要求更严，建议在下一版补充签名鉴权、统一错误码、配置持久化和审计日志。
