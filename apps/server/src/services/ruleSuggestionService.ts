import type { PromptRuleSet, RuleSuggestion } from "@llm-intervene/shared";

const domainKeywords: Record<string, string[]> = {
  计算机: ["代码", "接口", "算法", "数据库", "系统", "模型", "前端", "后端"],
  法务: ["合同", "合规", "法规", "法律", "条款"],
  教育: ["课程", "学生", "教学", "培训", "考试"],
  金融: ["风控", "投资", "资产", "银行", "证券"]
};

export class RuleSuggestionService {
  suggest(prompt: string, rules: PromptRuleSet): RuleSuggestion[] {
    const suggestions: RuleSuggestion[] = [];
    const content = prompt.toLocaleLowerCase();
    const customInstruction = rules.constraints.customInstruction?.trim() ?? "";
    const appendInstruction = (instruction: string) =>
      [customInstruction, instruction].filter(Boolean).join(" ");

    if (rules.outputFormat === "plain" && /json|字段|结构化|返回对象/.test(content)) {
      suggestions.push({
        label: "建议切换到 JSON 输出",
        reason: "提示词里有结构化返回意图，使用 JSON 约束更稳。",
        patch: { outputFormat: "json" }
      });
    }

    if (!rules.domain) {
      for (const [domain, keywords] of Object.entries(domainKeywords)) {
        if (keywords.some((keyword) => content.includes(keyword.toLocaleLowerCase()))) {
          suggestions.push({
            label: `建议限定领域为 ${domain}`,
            reason: "检测到明显领域关键词，增加领域限制能降低跑题概率。",
            patch: { domain }
          });
          break;
        }
      }
    }

    if (!rules.constraints.lengthLimit && content.includes("简要")) {
      suggestions.push({
        label: "建议增加长度上限",
        reason: "用户要求简要回答，设置长度限制可以减少冗余。",
        patch: {
          constraints: {
            ...rules.constraints,
            lengthLimit: 400
          }
        }
      });
    }

    if (rules.tone === "friendly" && /报告|方案|评审|制度/.test(prompt)) {
      suggestions.push({
        label: "建议切换为正式语气",
        reason: "当前内容偏业务或制度类文体，正式语气更匹配交付场景。",
        patch: { tone: "formal" }
      });
    }

    if (rules.outputFormat === "json" && /方案|治理|架构|设计/u.test(prompt)) {
      suggestions.push({
        label: "建议固定 JSON 层级结构",
        reason: "当前任务偏方案类，增加层级说明能让模型更稳定地输出 summary / steps / risks 这类结构。",
        patch: {
          constraints: {
            ...rules.constraints,
            customInstruction: appendInstruction("建议 JSON 至少包含 summary、steps、risks 三个层级。")
          }
        }
      });
    }

    if (/安全|风控|合规|治理/u.test(prompt) && !/风险|边界/u.test(customInstruction)) {
      suggestions.push({
        label: "建议补充风险与边界说明",
        reason: "当前主题带有明显治理或安全属性，明确要求输出风险和边界会更贴近真实交付场景。",
        patch: {
          constraints: {
            ...rules.constraints,
            customInstruction: appendInstruction("单独说明适用边界、潜在风险和落地前提。")
          }
        }
      });
    }

    if (rules.outputFormat === "json" && rules.constraints.jsonSchema?.trim()) {
      suggestions.push({
        label: "建议要求只返回 JSON 正文",
        reason: "当已经配置 JSON Schema 时，再强调不要附带解释文本，可以明显降低解析失败率。",
        patch: {
          constraints: {
            ...rules.constraints,
            customInstruction: appendInstruction("不要输出 JSON 之外的解释、前言或代码围栏。")
          }
        }
      });
    }

    if (suggestions.length === 0 && prompt.trim()) {
      suggestions.push({
        label: "建议补充执行步骤要求",
        reason: "当前规则已经较完整，再加一步骤化要求，通常可以让输出更具可执行性。",
        patch: {
          constraints: {
            ...rules.constraints,
            customInstruction: appendInstruction("回答时优先按步骤拆解，不要只给结论。")
          }
        }
      });
    }

    return suggestions;
  }
}
