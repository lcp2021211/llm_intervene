export type TextFilterStage = "input" | "output";

export type SensitiveWordAction = "remove" | "replace" | "notify";

export interface SensitiveWordEntry {
  term: string;
  replacement?: string;
  severity?: "low" | "medium" | "high";
  tags?: string[];
}

export interface SensitiveWordConfig {
  enabled: boolean;
  action: SensitiveWordAction;
  replacementText: string;
  caseSensitive: boolean;
  customWords: SensitiveWordEntry[];
}

export interface SensitiveWordMatch {
  term: string;
  start: number;
  end: number;
  replacement: string;
}

export interface FilteredTextResult {
  originalText: string;
  filteredText: string;
  changed: boolean;
  blocked: boolean;
  stage: TextFilterStage;
  matches: SensitiveWordMatch[];
  messages: string[];
}

export type OutputFormat = "plain" | "markdown" | "json" | "html" | "bullet-list" | "custom";
export type ToneStyle = "formal" | "professional" | "friendly" | "academic" | "concise";
export type EmotionStyle = "neutral" | "calm" | "positive" | "serious" | "enthusiastic";

export interface RuleConstraint {
  requiredKeywords: string[];
  forbiddenTopics: string[];
  regexRules: string[];
  lengthLimit?: number;
  jsonSchema?: string;
  customInstruction?: string;
}

export interface PromptRuleSet {
  outputFormat: OutputFormat;
  domain: string;
  tone: ToneStyle;
  emotion: EmotionStyle;
  audience: string;
  constraints: RuleConstraint;
}

export interface PromptTransformRequest {
  prompt: string;
  filter: SensitiveWordConfig;
  rules: PromptRuleSet;
}

export interface PromptTransformResponse {
  filteredPrompt: FilteredTextResult;
  strengthenedPrompt: string;
  instructionBlocks: string[];
  validationPreview: ValidationResult[];
  suggestions: RuleSuggestion[];
}

export interface OutputProcessRequest {
  output: string;
  filter: SensitiveWordConfig;
  rules?: PromptRuleSet;
}

export interface OutputProcessResponse {
  filteredOutput: FilteredTextResult;
  validation: ValidationResult[];
}

export interface ValidationResult {
  type: "format" | "domain" | "tone" | "regex" | "schema" | "keyword" | "topic" | "length";
  ok: boolean;
  message: string;
}

export interface RuleSuggestion {
  label: string;
  reason: string;
  patch: Partial<PromptRuleSet>;
}

export interface DemoConfiguration {
  filter: SensitiveWordConfig;
  rules: PromptRuleSet;
}
