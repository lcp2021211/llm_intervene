import type { DemoConfiguration } from "@llm-intervene/shared";

export const defaultDemoConfiguration: DemoConfiguration = {
  filter: {
    enabled: true,
    action: "replace",
    replacementText: "[已处理]",
    caseSensitive: false,
    customWords: [
      { term: "违规词", replacement: "[敏感内容]" },
      { term: "机密数据", replacement: "[保密信息]" },
      { term: "内部密码", replacement: "[安全占位]" }
    ]
  },
  rules: {
    outputFormat: "json",
    domain: "计算机",
    tone: "formal",
    emotion: "neutral",
    audience: "企业研发团队",
    constraints: {
      requiredKeywords: [],
      forbiddenTopics: [],
      regexRules: ["^(.|\\n){0,2000}$"],
      lengthLimit: 1200,
      jsonSchema: JSON.stringify(
        {
          type: "object",
          required: ["summary", "items"],
          properties: {
            summary: { type: "string" },
            items: {
              type: "array",
              items: {
                type: "object",
                required: ["title", "detail"],
                properties: {
                  title: { type: "string" },
                  detail: { type: "string" }
                }
              }
            }
          }
        },
        null,
        2
      ),
      customInstruction: "避免无依据的结论，优先给出工程落地建议。"
    }
  }
};
