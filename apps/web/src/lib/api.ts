import type {
  DemoConfiguration,
  FilteredTextResult,
  OutputProcessResponse,
  PromptTransformRequest,
  PromptTransformResponse
} from "@llm-intervene/shared";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json"
    },
    ...init
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const api = {
  getDefaultConfig() {
    return request<DemoConfiguration>("/api/config/default");
  },
  previewFilter(payload: { text: string; stage: "input" | "output"; filter: PromptTransformRequest["filter"] }) {
    return request<FilteredTextResult>("/api/filter/preview", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  transformPrompt(payload: PromptTransformRequest) {
    return request<PromptTransformResponse>("/api/prompt/transform", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  processOutput(payload: { output: string; filter: PromptTransformRequest["filter"]; rules: PromptTransformRequest["rules"] }) {
    return request<OutputProcessResponse>("/api/output/process", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }
};
