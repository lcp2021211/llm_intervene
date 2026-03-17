import { useEffect, useState } from "react";
import type {
  DemoConfiguration,
  FilteredTextResult,
  OutputProcessResponse,
  PromptTransformResponse,
  RuleSuggestion,
  SensitiveWordEntry
} from "@llm-intervene/shared";
import { SectionCard } from "./components/SectionCard";
import { TagEditor } from "./components/TagEditor";
import { api } from "./lib/api";
import "./styles/app.css";

const emptyFilterResult: FilteredTextResult = {
  originalText: "",
  filteredText: "",
  changed: false,
  blocked: false,
  stage: "input",
  matches: [],
  messages: []
};

const emptyOutputResponse: OutputProcessResponse = {
  filteredOutput: {
    ...emptyFilterResult,
    stage: "output"
  },
  validation: []
};

function App() {
  const [config, setConfig] = useState<DemoConfiguration | null>(null);
  const [prompt, setPrompt] = useState("请生成一个关于企业 AI 网关安全治理的 JSON 方案，覆盖接口约束和敏感词过滤。");
  const [modelOutput, setModelOutput] = useState(
    JSON.stringify(
      {
        summary: "该方案围绕接口、模型安全与规则收敛展开。",
        items: [
          { title: "接口过滤", detail: "在模型调用前后进行敏感词清洗和安全审计。" },
          { title: "规则校验", detail: "使用 Schema 与正则保证响应结构和领域边界。" }
        ]
      },
      null,
      2
    )
  );
  const [promptResponse, setPromptResponse] = useState<PromptTransformResponse | null>(null);
  const [outputResponse, setOutputResponse] = useState<OutputProcessResponse>(emptyOutputResponse);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getDefaultConfig()
      .then((payload: DemoConfiguration) => setConfig(payload))
      .catch((requestError: unknown) =>
        setError(requestError instanceof Error ? requestError.message : "加载失败")
      )
      .finally(() => setLoading(false));
  }, []);

  if (loading || !config) {
    return <main className="shell"><p>正在加载演示配置...</p></main>;
  }

  const updateSensitiveWord = (index: number, patch: Partial<SensitiveWordEntry>) => {
    const nextWords = config.filter.customWords.map((word: SensitiveWordEntry, wordIndex: number) =>
      wordIndex === index ? { ...word, ...patch } : word
    );
    setConfig({
      ...config,
      filter: {
        ...config.filter,
        customWords: nextWords
      }
    });
  };

  const runTransform = async () => {
    setError(null);
    try {
      const payload = await api.transformPrompt({
        prompt,
        filter: config.filter,
        rules: config.rules
      });
      setPromptResponse(payload);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "提示词强化失败");
    }
  };

  const runOutputProcess = async () => {
    setError(null);
    try {
      const payload = await api.processOutput({
        output: modelOutput,
        filter: config.filter,
        rules: config.rules
      });
      setOutputResponse(payload);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "输出处理失败");
    }
  };

  return (
    <main className="shell">
      <header className="hero">
        <div>
          <p className="eyebrow">LLM Filter & Guidance Platform</p>
          <h1>大模型过滤与引导控制台</h1>
          <p className="hero-copy">
            在模型调用前后统一执行敏感词过滤、提示词强化与规则校验，帮助上游系统拿到更稳定、可控、可审计的输入输出。
          </p>
        </div>
        <div className="hero-metrics">
          <div>
            <strong>{config.filter.customWords.length}</strong>
            <span>敏感词规则</span>
          </div>
          <div>
            <strong>{config.rules.constraints.requiredKeywords.length + config.rules.constraints.forbiddenTopics.length}</strong>
            <span>内容约束</span>
          </div>
          <div>
            <strong>{config.rules.outputFormat.toUpperCase()}</strong>
            <span>目标输出格式</span>
          </div>
        </div>
      </header>

      {error ? <p className="error-banner">{error}</p> : null}

      <div className="dashboard-grid">
        <SectionCard eyebrow="01 / Filter" title="敏感词策略">
          <div className="grid two-columns">
            <label className="field">
              <span>处理动作</span>
              <select
                value={config.filter.action}
                onChange={(event) =>
                  setConfig({
                    ...config,
                    filter: {
                      ...config.filter,
                      action: event.target.value as DemoConfiguration["filter"]["action"]
                    }
                  })
                }
              >
                <option value="replace">替换敏感词</option>
                <option value="remove">完全去除</option>
                <option value="notify">提示用户校正</option>
              </select>
            </label>

            <label className="field">
              <span>默认替换文本</span>
              <input
                value={config.filter.replacementText}
                onChange={(event) =>
                  setConfig({
                    ...config,
                    filter: {
                      ...config.filter,
                      replacementText: event.target.value
                    }
                  })
                }
              />
            </label>
          </div>

          <div className="word-list">
            {config.filter.customWords.map((word: SensitiveWordEntry, index: number) => (
              <div key={`${word.term}-${index}`} className="word-row">
                <input value={word.term} onChange={(event) => updateSensitiveWord(index, { term: event.target.value })} />
                <input
                  value={word.replacement ?? ""}
                  placeholder="替换文本"
                  onChange={(event) => updateSensitiveWord(index, { replacement: event.target.value })}
                />
              </div>
            ))}
          </div>
          <button
            className="ghost-button"
            type="button"
            onClick={() =>
              setConfig({
                ...config,
                filter: {
                  ...config.filter,
                  customWords: [...config.filter.customWords, { term: "新增敏感词", replacement: config.filter.replacementText }]
                }
              })
            }
          >
            添加敏感词
          </button>
        </SectionCard>

        <SectionCard eyebrow="02 / Rules" title="规则引擎配置">
          <div className="grid three-columns">
            <label className="field">
              <span>输出格式</span>
              <select
                value={config.rules.outputFormat}
                onChange={(event) =>
                  setConfig({
                    ...config,
                    rules: {
                      ...config.rules,
                      outputFormat: event.target.value as DemoConfiguration["rules"]["outputFormat"]
                    }
                  })
                }
              >
                <option value="plain">Plain Text</option>
                <option value="markdown">Markdown</option>
                <option value="json">JSON</option>
                <option value="html">HTML</option>
                <option value="bullet-list">Bullet List</option>
                <option value="custom">Custom</option>
              </select>
            </label>

            <label className="field">
              <span>领域范围</span>
              <input
                value={config.rules.domain}
                onChange={(event) =>
                  setConfig({
                    ...config,
                    rules: {
                      ...config.rules,
                      domain: event.target.value
                    }
                  })
                }
              />
            </label>

            <label className="field">
              <span>目标受众</span>
              <input
                value={config.rules.audience}
                onChange={(event) =>
                  setConfig({
                    ...config,
                    rules: {
                      ...config.rules,
                      audience: event.target.value
                    }
                  })
                }
              />
            </label>

            <label className="field">
              <span>语气</span>
              <select
                value={config.rules.tone}
                onChange={(event) =>
                  setConfig({
                    ...config,
                    rules: {
                      ...config.rules,
                      tone: event.target.value as DemoConfiguration["rules"]["tone"]
                    }
                  })
                }
              >
                <option value="formal">正式</option>
                <option value="professional">专业</option>
                <option value="friendly">友好</option>
                <option value="academic">学术</option>
                <option value="concise">简洁</option>
              </select>
            </label>

            <label className="field">
              <span>情感色彩</span>
              <select
                value={config.rules.emotion}
                onChange={(event) =>
                  setConfig({
                    ...config,
                    rules: {
                      ...config.rules,
                      emotion: event.target.value as DemoConfiguration["rules"]["emotion"]
                    }
                  })
                }
              >
                <option value="neutral">中性</option>
                <option value="calm">克制</option>
                <option value="positive">积极</option>
                <option value="serious">严肃</option>
                <option value="enthusiastic">热情</option>
              </select>
            </label>

            <label className="field">
              <span>长度上限</span>
              <input
                type="number"
                value={config.rules.constraints.lengthLimit ?? ""}
                onChange={(event) =>
                  setConfig({
                    ...config,
                    rules: {
                      ...config.rules,
                      constraints: {
                        ...config.rules.constraints,
                        lengthLimit: event.target.value ? Number(event.target.value) : undefined
                      }
                    }
                  })
                }
              />
            </label>
          </div>

          <TagEditor
            label="必须包含关键词"
            values={config.rules.constraints.requiredKeywords}
            placeholder="回车添加关键词"
            onChange={(values: string[]) =>
              setConfig({
                ...config,
                rules: {
                  ...config.rules,
                  constraints: {
                    ...config.rules.constraints,
                    requiredKeywords: values
                  }
                }
              })
            }
          />

          <TagEditor
            label="禁止主题"
            values={config.rules.constraints.forbiddenTopics}
            placeholder="回车添加禁止主题"
            onChange={(values: string[]) =>
              setConfig({
                ...config,
                rules: {
                  ...config.rules,
                  constraints: {
                    ...config.rules.constraints,
                    forbiddenTopics: values
                  }
                }
              })
            }
          />

          <TagEditor
            label="正则规则"
            values={config.rules.constraints.regexRules}
            placeholder="回车添加正则"
            onChange={(values: string[]) =>
              setConfig({
                ...config,
                rules: {
                  ...config.rules,
                  constraints: {
                    ...config.rules.constraints,
                    regexRules: values
                  }
                }
              })
            }
          />

          <label className="field">
            <span>JSON Schema / 自定义说明</span>
            <textarea
              rows={8}
              value={config.rules.constraints.jsonSchema ?? ""}
              onChange={(event) =>
                setConfig({
                  ...config,
                  rules: {
                    ...config.rules,
                    constraints: {
                      ...config.rules.constraints,
                      jsonSchema: event.target.value
                    }
                  }
                })
              }
            />
          </label>
        </SectionCard>
      </div>

      <div className="playground-grid">
        <SectionCard
          eyebrow="03 / Prompt"
          title="输入过滤与提示词强化"
          actions={
            <button className="primary-button" type="button" onClick={runTransform}>
              生成强化提示词
            </button>
          }
        >
          <label className="field">
            <span>原始提示词</span>
            <textarea rows={8} value={prompt} onChange={(event) => setPrompt(event.target.value)} />
          </label>

          <div className="result-grid">
            <article className="result-panel">
              <h3>过滤结果</h3>
              <pre>{promptResponse?.filteredPrompt.filteredText ?? "点击右上角开始生成。"}</pre>
            </article>
            <article className="result-panel">
              <h3>强化后的提示词</h3>
              <pre>{promptResponse?.strengthenedPrompt ?? "规则引擎会把格式、领域、语气等要求拼装到提示词中。"}</pre>
            </article>
          </div>

          <div className="result-grid">
            <article className="result-panel">
              <h3>应用规则</h3>
              <ul>
                {(promptResponse?.instructionBlocks ?? []).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
            <article className="result-panel">
              <h3>智能建议</h3>
              <ul>
                {(promptResponse?.suggestions ?? []).map((item: RuleSuggestion) => (
                  <li key={item.label}>
                    <strong>{item.label}</strong>：{item.reason}
                  </li>
                ))}
              </ul>
            </article>
          </div>
        </SectionCard>

        <SectionCard
          eyebrow="04 / Output"
          title="模型输出二次过滤与校验"
          actions={
            <button className="primary-button" type="button" onClick={runOutputProcess}>
              处理模型输出
            </button>
          }
        >
          <label className="field">
            <span>模型原始输出</span>
            <textarea rows={10} value={modelOutput} onChange={(event) => setModelOutput(event.target.value)} />
          </label>

          <div className="result-grid">
            <article className="result-panel">
              <h3>输出过滤结果</h3>
              <pre>{outputResponse.filteredOutput.filteredText || "这里会显示经过敏感词过滤后的模型输出。"}</pre>
            </article>
            <article className="result-panel">
              <h3>规则校验结果</h3>
              <ul>
                {outputResponse.validation.map((item) => (
                  <li key={`${item.type}-${item.message}`} className={item.ok ? "ok" : "bad"}>
                    [{item.ok ? "PASS" : "FAIL"}] {item.message}
                  </li>
                ))}
              </ul>
            </article>
          </div>
        </SectionCard>
      </div>
    </main>
  );
}

export default App;
