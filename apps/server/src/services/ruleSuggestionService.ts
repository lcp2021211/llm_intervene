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

    return suggestions;
  }
}
