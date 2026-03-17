import { Router } from "express";
import type {
  OutputProcessRequest,
  PromptTransformRequest
} from "@llm-intervene/shared";
import { defaultDemoConfiguration } from "../config/defaults.js";
import { PromptRuleEngine } from "../services/promptRuleEngine.js";
import { RuleSuggestionService } from "../services/ruleSuggestionService.js";
import { SensitiveWordService } from "../services/sensitiveWordService.js";

const router = Router();
const sensitiveWordService = new SensitiveWordService();
const promptRuleEngine = new PromptRuleEngine();
const suggestionService = new RuleSuggestionService();

router.get("/health", (_request, response) => {
  response.json({
    ok: true,
    service: "llm-intervene-server",
    timestamp: new Date().toISOString()
  });
});

router.get("/config/default", (_request, response) => {
  response.json(defaultDemoConfiguration);
});

router.post("/filter/preview", (request, response) => {
  const body = request.body as { text: string; stage: "input" | "output"; filter: PromptTransformRequest["filter"] };
  const result = sensitiveWordService.filterText(body.text ?? "", body.stage ?? "input", body.filter);
  response.json(result);
});

router.post("/prompt/transform", (request, response) => {
  const body = request.body as PromptTransformRequest;
  const filteredPrompt = sensitiveWordService.filterText(body.prompt ?? "", "input", body.filter);
  const { strengthenedPrompt, instructionBlocks } = promptRuleEngine.composePrompt(
    filteredPrompt.filteredText,
    body.rules
  );
  const validationPreview = promptRuleEngine.validateOutput(strengthenedPrompt, {
    ...body.rules,
    outputFormat: "plain"
  });
  const suggestions = suggestionService.suggest(body.prompt ?? "", body.rules);

  response.json({
    filteredPrompt,
    strengthenedPrompt,
    instructionBlocks,
    validationPreview,
    suggestions
  });
});

router.post("/output/process", (request, response) => {
  const body = request.body as OutputProcessRequest;
  const filteredOutput = sensitiveWordService.filterText(body.output ?? "", "output", body.filter);
  const validation = body.rules ? promptRuleEngine.validateOutput(filteredOutput.filteredText, body.rules) : [];
  response.json({ filteredOutput, validation });
});

router.post("/rules/suggest", (request, response) => {
  const body = request.body as Pick<PromptTransformRequest, "prompt" | "rules">;
  response.json({
    suggestions: suggestionService.suggest(body.prompt ?? "", body.rules)
  });
});

export default router;
