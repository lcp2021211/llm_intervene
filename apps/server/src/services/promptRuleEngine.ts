import { Ajv } from "ajv";
import type { PromptRuleSet, ValidationResult } from "@llm-intervene/shared";

const ajv = new Ajv();
const toneLabels: Record<PromptRuleSet["tone"], string> = {
  formal: "正式",
  professional: "专业",
  friendly: "友好",
  academic: "学术",
  concise: "简洁"
};
const emotionLabels: Record<PromptRuleSet["emotion"], string> = {
  neutral: "中性",
  calm: "克制",
  positive: "积极",
  serious: "严肃",
  enthusiastic: "热情"
};

export class PromptRuleEngine {
  composePrompt(basePrompt: string, rules: PromptRuleSet): { strengthenedPrompt: string; instructionBlocks: string[] } {
    const blocks = [
      `你是一名严格遵守输出约束的助手。`,
      `回答领域限制：仅围绕“${rules.domain || "未限定领域"}”展开，偏离主题时主动收束。`,
      `语气要求：使用${this.toneLabel(rules.tone)}语气，并保持${this.emotionLabel(rules.emotion)}情感色彩。`,
      `目标受众：${rules.audience || "通用用户"}。`,
      this.formatInstruction(rules),
      this.constraintInstruction(rules)
    ].filter(Boolean) as string[];

    const strengthenedPrompt = [basePrompt.trim(), "", "请严格补充遵循以下生成规则：", ...blocks.map((block, index) => `${index + 1}. ${block}`)]
      .join("\n")
      .trim();

    return { strengthenedPrompt, instructionBlocks: blocks };
  }

  validateOutput(output: string, rules: PromptRuleSet): ValidationResult[] {
    const results: ValidationResult[] = [];

    results.push(this.validateFormat(output, rules));
    results.push(this.validateDomain(output, rules));
    results.push(this.validateTone(output, rules));

    for (const keyword of rules.constraints.requiredKeywords) {
      results.push({
        type: "keyword",
        ok: output.includes(keyword),
        message: output.includes(keyword) ? `已包含关键词“${keyword}”。` : `缺少要求关键词“${keyword}”。`
      });
    }

    for (const topic of rules.constraints.forbiddenTopics) {
      const contains = output.includes(topic);
      results.push({
        type: "topic",
        ok: !contains,
        message: contains ? `命中禁止主题“${topic}”。` : `未命中禁止主题“${topic}”。`
      });
    }

    for (const pattern of rules.constraints.regexRules) {
      try {
        const regex = new RegExp(pattern, "u");
        results.push({
          type: "regex",
          ok: regex.test(output),
          message: regex.test(output) ? `通过正则校验：${pattern}` : `未通过正则校验：${pattern}`
        });
      } catch {
        results.push({
          type: "regex",
          ok: false,
          message: `正则表达式无效：${pattern}`
        });
      }
    }

    if (rules.constraints.lengthLimit) {
      results.push({
        type: "length",
        ok: output.length <= rules.constraints.lengthLimit,
        message:
          output.length <= rules.constraints.lengthLimit
            ? `输出长度 ${output.length}，满足上限 ${rules.constraints.lengthLimit}。`
            : `输出长度 ${output.length}，超过上限 ${rules.constraints.lengthLimit}。`
      });
    }

    if (rules.outputFormat === "json" && rules.constraints.jsonSchema?.trim()) {
      results.push(this.validateSchema(output, rules.constraints.jsonSchema));
    }

    return results;
  }

  private formatInstruction(rules: PromptRuleSet): string {
    switch (rules.outputFormat) {
      case "json":
        return "输出格式：返回合法 JSON，不要附带 JSON 之外的说明。";
      case "markdown":
        return "输出格式：使用 Markdown，包含清晰标题和小节。";
      case "html":
        return "输出格式：返回简洁 HTML 片段。";
      case "bullet-list":
        return "输出格式：使用条目列表，每个要点单独一行。";
      case "custom":
        return `输出格式：${rules.constraints.customInstruction || "按自定义格式输出。"} `;
      default:
        return "输出格式：纯文本。";
    }
  }

  private constraintInstruction(rules: PromptRuleSet): string {
    const instructions: string[] = [];

    if (rules.constraints.requiredKeywords.length > 0) {
      instructions.push(`必须包含关键词：${rules.constraints.requiredKeywords.join("、")}。`);
    }
    if (rules.constraints.forbiddenTopics.length > 0) {
      instructions.push(`不得涉及：${rules.constraints.forbiddenTopics.join("、")}。`);
    }
    if (rules.constraints.lengthLimit) {
      instructions.push(`控制总长度不超过 ${rules.constraints.lengthLimit} 字符。`);
    }
    if (rules.constraints.regexRules.length > 0) {
      instructions.push("输出需满足预设正则规则。");
    }
    if (rules.constraints.jsonSchema?.trim()) {
      instructions.push("JSON 输出还需符合提供的 JSON Schema。");
    }
    if (rules.constraints.customInstruction?.trim()) {
      instructions.push(`附加要求：${rules.constraints.customInstruction.trim()}`);
    }

    return instructions.join("");
  }

  private validateFormat(output: string, rules: PromptRuleSet): ValidationResult {
    if (rules.outputFormat !== "json") {
      return {
        type: "format",
        ok: true,
        message: `当前未启用严格 ${rules.outputFormat} 结构校验。`
      };
    }

    try {
      JSON.parse(output);
      return {
        type: "format",
        ok: true,
        message: "输出是合法 JSON。"
      };
    } catch {
      return {
        type: "format",
        ok: false,
        message: "输出不是合法 JSON。"
      };
    }
  }

  private validateSchema(output: string, rawSchema: string): ValidationResult {
    try {
      const parsedOutput = JSON.parse(output);
      const parsedSchema = JSON.parse(rawSchema);
      const validate = ajv.compile(parsedSchema);
      const ok = validate(parsedOutput);

      return {
        type: "schema",
        ok: Boolean(ok),
        message: ok ? "通过 JSON Schema 校验。" : `未通过 JSON Schema 校验：${ajv.errorsText(validate.errors)}`
      };
    } catch (error) {
      return {
        type: "schema",
        ok: false,
        message: `Schema 校验失败：${error instanceof Error ? error.message : "未知错误"}`
      };
    }
  }

  private validateDomain(output: string, rules: PromptRuleSet): ValidationResult {
    if (!rules.domain.trim()) {
      return { type: "domain", ok: true, message: "未设置领域限制。" };
    }

    const domainMap: Record<string, string[]> = {
      计算机: ["代码", "系统", "接口", "模型", "数据库", "算法", "服务"],
      法务: ["合同", "条款", "合规", "法律"],
      教育: ["课程", "学习", "教学", "学生"],
      金融: ["风控", "投资", "资产", "银行"]
    };

    const keywords = domainMap[rules.domain] ?? [rules.domain];
    const ok = keywords.some((keyword) => output.includes(keyword));
    return {
      type: "domain",
      ok,
      message: ok ? `输出内容与“${rules.domain}”领域相关。` : `输出缺少明显“${rules.domain}”领域特征。`
    };
  }

  private validateTone(output: string, rules: PromptRuleSet): ValidationResult {
    const toneHeuristics: Record<string, RegExp> = {
      formal: /(建议|应当|需要|首先|其次|方案)/,
      professional: /(架构|接口|策略|流程|风险)/,
      friendly: /(可以|我们|一起|建议你)/,
      academic: /(研究|结论|分析|方法)/,
      concise: /^(.|\n){0,500}$/
    };
    const regex = toneHeuristics[rules.tone];

    if (!regex) {
      return { type: "tone", ok: true, message: "未设置语气校验。" };
    }

    return {
      type: "tone",
      ok: regex.test(output),
      message: regex.test(output) ? `输出基本符合${this.toneLabel(rules.tone)}语气。` : `输出未明显体现${this.toneLabel(rules.tone)}语气。`
    };
  }

  private toneLabel(tone: PromptRuleSet["tone"]): string {
    return toneLabels[tone];
  }

  private emotionLabel(emotion: PromptRuleSet["emotion"]): string {
    return emotionLabels[emotion];
  }
}
