import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type {
  DemoConfiguration,
  FilteredTextResult,
  OutputProcessResponse,
  PromptTransformResponse,
  SensitiveWordEntry
} from "@llm-intervene/shared";
import { SectionCard } from "./components/SectionCard.tsx";
import { TagEditor } from "./components/TagEditor.tsx";
import { api } from "./lib/api.ts";
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

const CONFIG_STORAGE_KEY = "llm-intervene.console.config.v1";
const BUILT_IN_LIBRARY_PATH = "/default-sensitive-word-library.csv";

type StoredConfiguration = Partial<DemoConfiguration> & {
  filter?: Partial<DemoConfiguration["filter"]>;
  rules?: Partial<DemoConfiguration["rules"]> & {
    constraints?: Partial<DemoConfiguration["rules"]["constraints"]>;
  };
};

const normalizeLoadedConfig = (payload: DemoConfiguration): DemoConfiguration => ({
  ...payload,
  rules: {
    ...payload.rules,
    audience: "",
    constraints: {
      ...payload.rules.constraints,
      lengthLimit: undefined,
      requiredKeywords: [],
      forbiddenTopics: []
    }
  }
});

const loadStoredConfiguration = (): StoredConfiguration | null => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(CONFIG_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as StoredConfiguration;
  } catch {
    return null;
  }
};

const mergeDemoConfiguration = (
  defaultConfig: DemoConfiguration,
  storedConfig: StoredConfiguration | null
): DemoConfiguration => {
  if (!storedConfig) {
    return normalizeLoadedConfig(defaultConfig);
  }

  return normalizeLoadedConfig({
    filter: {
      ...defaultConfig.filter,
      ...storedConfig.filter,
      customWords: storedConfig.filter?.customWords ?? defaultConfig.filter.customWords
    },
    rules: {
      ...defaultConfig.rules,
      ...storedConfig.rules,
      constraints: {
        ...defaultConfig.rules.constraints,
        ...storedConfig.rules?.constraints,
        regexRules: storedConfig.rules?.constraints?.regexRules ?? defaultConfig.rules.constraints.regexRules
      }
    }
  });
};

const isSensitiveWordEntry = (entry: SensitiveWordEntry | null): entry is SensitiveWordEntry => entry !== null;

const parseJsonWordEntries = (payload: unknown): SensitiveWordEntry[] => {
  const toEntry = (value: unknown): SensitiveWordEntry | null => {
    if (typeof value === "string") {
      const term = value.trim();
      return term ? { term } : null;
    }

    if (!value || typeof value !== "object") {
      return null;
    }

    const record = value as Record<string, unknown>;
    const termSource = record.term ?? record.word ?? record.keyword ?? record.sensitiveWord;
    const replacementSource = record.replacement ?? record.replace ?? record.target;
    const term = typeof termSource === "string" ? termSource.trim() : "";
    const replacement = typeof replacementSource === "string" ? replacementSource.trim() : undefined;

    if (!term) {
      return null;
    }

    return replacement ? { term, replacement } : { term };
  };

  if (Array.isArray(payload)) {
    return payload.map(toEntry).filter(isSensitiveWordEntry);
  }

  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;

    if (Array.isArray(record.words)) {
      return parseJsonWordEntries(record.words);
    }

    return Object.entries(record)
      .map<SensitiveWordEntry | null>(([term, replacement]) => {
        const normalizedTerm = term.trim();
        if (!normalizedTerm) {
          return null;
        }

        return {
          term: normalizedTerm,
          ...(typeof replacement === "string" && replacement.trim()
            ? { replacement: replacement.trim() }
            : {})
        };
      })
      .filter(isSensitiveWordEntry);
  }

  return [];
};

const looksLikeHeader = (term: string, replacement: string) => {
  const joined = `${term}|${replacement}`.toLocaleLowerCase();
  return /term|replacement|敏感词|替换/.test(joined);
};

const parseLineWordEntries = (content: string): SensitiveWordEntry[] => {
  const separators = ["\t", "|", ",", "，", ":", "："];

  return content
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith("//"))
    .map((line) => {
      for (const separator of separators) {
        if (!line.includes(separator)) {
          continue;
        }

        const [rawTerm, ...rawRest] = line.split(separator);
        const term = rawTerm.trim();
        const replacement = rawRest.join(separator).trim();

        if (!term || looksLikeHeader(term, replacement)) {
          return null;
        }

        return {
          term,
          replacement: replacement || undefined
        };
      }

      if (looksLikeHeader(line, "")) {
        return null;
      }

      return { term: line };
    })
    .filter((entry): entry is SensitiveWordEntry => Boolean(entry));
};

const parseSensitiveWordFile = async (file: File): Promise<SensitiveWordEntry[]> => {
  const content = await file.text();
  const extension = file.name.split(".").pop()?.toLocaleLowerCase();

  if (extension === "json") {
    return parseJsonWordEntries(JSON.parse(content));
  }

  return parseLineWordEntries(content);
};

const mergeSensitiveWords = (
  currentWords: SensitiveWordEntry[],
  incomingWords: SensitiveWordEntry[],
  fallbackReplacementText: string
): SensitiveWordEntry[] => {
  const merged = new Map<string, SensitiveWordEntry>();

  for (const word of currentWords) {
    const term = word.term.trim();
    if (!term) {
      continue;
    }

    merged.set(term, {
      ...word,
      term
    });
  }

  for (const word of incomingWords) {
    const term = word.term.trim();
    if (!term) {
      continue;
    }

    const existing = merged.get(term);
    merged.set(term, {
      ...existing,
      ...word,
      term,
      replacement: word.replacement?.trim() || existing?.replacement || fallbackReplacementText
    });
  }

  return Array.from(merged.values());
};

interface NotifyDialogState {
  title: string;
  description: string;
  terms: string[];
}

interface ConfirmDialogState {
  title: string;
  description: string;
  confirmLabel: string;
}

function App() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [sensitiveWordSearch, setSensitiveWordSearch] = useState("");
  const [notifyDialog, setNotifyDialog] = useState<NotifyDialogState | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [selectedSensitiveWordIndexes, setSelectedSensitiveWordIndexes] = useState<number[]>([]);

  useEffect(() => {
    api
      .getDefaultConfig()
      .then((payload: DemoConfiguration) => setConfig(mergeDemoConfiguration(payload, loadStoredConfiguration())))
      .catch((requestError: unknown) =>
        setError(requestError instanceof Error ? requestError.message : "加载失败")
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!config || typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
  }, [config]);

  const updateConfig = (updater: (current: DemoConfiguration) => DemoConfiguration) => {
    setConfig((current) => (current ? updater(current) : current));
  };

  if (loading || !config) {
    return (
      <main className="shell">
        <p>正在加载演示配置...</p>
      </main>
    );
  }

  const searchTerm = sensitiveWordSearch.trim().toLocaleLowerCase();
  const filteredSensitiveWords = config.filter.customWords
    .map((word, index) => ({ word, index }))
    .filter(({ word }) => {
      if (!searchTerm) {
        return true;
      }

      return (
        word.term.toLocaleLowerCase().includes(searchTerm) ||
        (word.replacement ?? "").toLocaleLowerCase().includes(searchTerm)
      );
    });

  const visibleSensitiveWordIndexes = filteredSensitiveWords.map(({ index }) => index);
  const selectedVisibleCount = visibleSensitiveWordIndexes.filter((index) =>
    selectedSensitiveWordIndexes.includes(index)
  ).length;
  const allVisibleSelected =
    visibleSensitiveWordIndexes.length > 0 && selectedVisibleCount === visibleSensitiveWordIndexes.length;

  const activeRuleCount =
    (config.rules.domain.trim() ? 1 : 0) +
    config.rules.constraints.regexRules.length +
    (config.rules.outputFormat === "json" && config.rules.constraints.jsonSchema?.trim() ? 1 : 0) +
    (config.rules.constraints.customInstruction?.trim() ? 1 : 0);

  const updateSensitiveWord = (index: number, patch: Partial<SensitiveWordEntry>) => {
    updateConfig((current) => ({
      ...current,
      filter: {
        ...current.filter,
        customWords: current.filter.customWords.map((word, wordIndex) =>
          wordIndex === index ? { ...word, ...patch } : word
        )
      }
    }));
  };

  const removeSensitiveWord = (index: number) => {
    updateConfig((current) => ({
      ...current,
      filter: {
        ...current.filter,
        customWords: current.filter.customWords.filter((_word, wordIndex) => wordIndex !== index)
      }
    }));
    setSelectedSensitiveWordIndexes((current) =>
      current
        .filter((selectedIndex) => selectedIndex !== index)
        .map((selectedIndex) => (selectedIndex > index ? selectedIndex - 1 : selectedIndex))
    );
  };

  const addSensitiveWord = () => {
    updateConfig((current) => ({
      ...current,
      filter: {
        ...current.filter,
        customWords: [
          ...current.filter.customWords,
          {
            term: "",
            replacement: current.filter.replacementText
          }
        ]
      }
    }));
  };

  const toggleSensitiveWordSelection = (index: number) => {
    setSelectedSensitiveWordIndexes((current) =>
      current.includes(index) ? current.filter((item) => item !== index) : [...current, index]
    );
  };

  const toggleSelectAllVisibleSensitiveWords = () => {
    setSelectedSensitiveWordIndexes((current) => {
      if (allVisibleSelected) {
        return current.filter((index) => !visibleSensitiveWordIndexes.includes(index));
      }

      return Array.from(new Set([...current, ...visibleSensitiveWordIndexes])).sort((left, right) => left - right);
    });
  };

  const removeSelectedSensitiveWords = () => {
    if (selectedSensitiveWordIndexes.length === 0) {
      return;
    }
    setConfirmDialog({
      title: "确认批量删除敏感词",
      description: `当前共选中 ${selectedSensitiveWordIndexes.length} 条敏感词，确认后将立即删除且不可恢复。`,
      confirmLabel: "确认删除"
    });
  };

  const confirmRemoveSelectedSensitiveWords = () => {
    if (selectedSensitiveWordIndexes.length === 0) {
      setConfirmDialog(null);
      return;
    }

    updateConfig((current) => ({
      ...current,
      filter: {
        ...current.filter,
        customWords: current.filter.customWords.filter((_word, wordIndex) => !selectedSensitiveWordIndexes.includes(wordIndex))
      }
    }));
    setSelectedSensitiveWordIndexes([]);
    setConfirmDialog(null);
  };

  const runTransform = async () => {
    setError(null);
    setImportMessage(null);
    setCopySuccess(false);

    try {
      const payload = await api.transformPrompt({
        prompt,
        filter: config.filter,
        rules: config.rules
      });
      setPromptResponse(payload);

      if (payload.filteredPrompt.blocked) {
        const uniqueTerms = Array.from(new Set(payload.filteredPrompt.matches.map((match) => match.term)));
        setNotifyDialog({
          title: "检测到需要校正的敏感词",
          description: "当前策略为“提示用户校正”，请先修改提示词后再继续生成。",
          terms: uniqueTerms
        });
      }
    } catch (requestError: unknown) {
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
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : "输出处理失败");
    }
  };

  const handleSensitiveWordFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setError(null);

    try {
      const importedWords = await parseSensitiveWordFile(file);
      if (importedWords.length === 0) {
        throw new Error("词库文件中没有识别到可导入的敏感词。");
      }

      updateConfig((current) => ({
        ...current,
        filter: {
          ...current.filter,
          customWords: mergeSensitiveWords(
            current.filter.customWords,
            importedWords,
            current.filter.replacementText
          )
        }
      }));

      setImportMessage(`已从 ${file.name} 导入 ${importedWords.length} 条敏感词记录。`);
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : "读取词库文件失败");
    } finally {
      event.target.value = "";
    }
  };

  const loadBuiltInSensitiveWords = async () => {
    setError(null);

    try {
      const response = await fetch(BUILT_IN_LIBRARY_PATH);
      if (!response.ok) {
        throw new Error("读取内置词库失败。");
      }

      const importedWords = parseLineWordEntries(await response.text());
      if (importedWords.length === 0) {
        throw new Error("内置词库为空。");
      }

      updateConfig((current) => ({
        ...current,
        filter: {
          ...current.filter,
          customWords: mergeSensitiveWords(
            current.filter.customWords,
            importedWords,
            current.filter.replacementText
          )
        }
      }));

      setImportMessage(`已加载内置词库，共 ${importedWords.length} 条敏感词记录。`);
    } catch (requestError: unknown) {
      setError(requestError instanceof Error ? requestError.message : "加载内置词库失败");
    }
  };

  const copyStrengthenedPrompt = async () => {
    const content = promptResponse?.strengthenedPrompt?.trim();
    if (!content) {
      return;
    }

    try {
      await navigator.clipboard.writeText(content);
      setCopySuccess(true);
      window.setTimeout(() => setCopySuccess(false), 1800);
    } catch {
      setError("复制失败，请检查浏览器是否允许访问剪贴板。");
    }
  };

  return (
    <main className="shell">
      <header className="hero">
        <div>
          <p className="eyebrow">LLM Filter & Guidance Platform</p>
          <h1>大模型过滤与引导控制台</h1>
          <p className="hero-copy">
            在模型调用前后统一执行敏感词过滤、规则注入与规则校验，帮助上游系统拿到更稳定、可控、可审计的输入输出。
          </p>
        </div>
        <div className="hero-metrics">
          <div>
            <strong>{config.filter.customWords.length}</strong>
            <span>敏感词规则</span>
          </div>
          <div>
            <strong>{activeRuleCount}</strong>
            <span>规则项</span>
          </div>
          <div>
            <strong>{config.rules.outputFormat.toUpperCase()}</strong>
            <span>目标输出格式</span>
          </div>
        </div>
      </header>

      {error ? <p className="error-banner">{error}</p> : null}
      {importMessage ? <p className="info-banner">{importMessage}</p> : null}

      <div className="dashboard-grid">
        <SectionCard eyebrow="01 / Filter" title="敏感词策略">
          <div className="grid two-columns">
            <label className="field">
              <span>处理动作</span>
              <select
                value={config.filter.action}
                onChange={(event) =>
                  updateConfig((current) => ({
                    ...current,
                    filter: {
                      ...current.filter,
                      action: event.target.value as DemoConfiguration["filter"]["action"]
                    }
                  }))
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
                  updateConfig((current) => ({
                    ...current,
                    filter: {
                      ...current.filter,
                      replacementText: event.target.value
                    }
                  }))
                }
              />
            </label>
          </div>

          <div className="filter-toolbar">
            <label className="field compact-field">
              <span>快速查找敏感词</span>
              <input
                value={sensitiveWordSearch}
                placeholder="输入敏感词或替换文本关键字"
                onChange={(event) => setSensitiveWordSearch(event.target.value)}
              />
            </label>

            <div className="filter-toolbar-meta">
              <span className="toolbar-note">当前显示 {filteredSensitiveWords.length} / {config.filter.customWords.length}</span>
            </div>

            <div className="filter-toolbar-actions">
              <input
                ref={fileInputRef}
                className="hidden-file-input"
                type="file"
                accept=".txt,.csv,.tsv,.json"
                onChange={handleSensitiveWordFileChange}
              />
              <button
                className="ghost-button"
                type="button"
                onClick={loadBuiltInSensitiveWords}
              >
                加载内置词库
              </button>
              <button
                className="ghost-button"
                type="button"
                onClick={() => fileInputRef.current?.click()}
              >
                读入词库文件
              </button>
              <button className="primary-button" type="button" onClick={addSensitiveWord}>
                添加敏感词
              </button>
              <button
                className="ghost-button"
                type="button"
                disabled={selectedSensitiveWordIndexes.length === 0}
                onClick={removeSelectedSensitiveWords}
              >
                批量删除
              </button>
            </div>
          </div>

          <p className="helper-copy">支持导入 `txt / csv / tsv / json`。文本格式可使用“敏感词,替换文本”或“敏感词|替换文本”；也可以直接加载内置默认词库。</p>

          <div className="word-table">
            <div className="word-table-head">
              <label className="word-select-all">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleSelectAllVisibleSensitiveWords}
                />
                <span>全选</span>
              </label>
              <span>敏感词</span>
              <span>替换文本</span>
              <span>操作</span>
            </div>
            <div className="word-table-body">
              {filteredSensitiveWords.length > 0 ? (
                filteredSensitiveWords.map(({ word, index }) => (
                  <div key={index} className="word-row">
                    <label className="word-select">
                      <input
                        type="checkbox"
                        checked={selectedSensitiveWordIndexes.includes(index)}
                        onChange={() => toggleSensitiveWordSelection(index)}
                      />
                    </label>
                    <input
                      value={word.term}
                      placeholder="请输入敏感词"
                      onChange={(event) => updateSensitiveWord(index, { term: event.target.value })}
                    />
                    <input
                      value={word.replacement ?? ""}
                      placeholder="替换文本"
                      onChange={(event) => updateSensitiveWord(index, { replacement: event.target.value })}
                    />
                    <button className="row-remove" type="button" onClick={() => removeSensitiveWord(index)}>
                      删除
                    </button>
                  </div>
                ))
              ) : (
                <div className="empty-state">没有匹配到对应的敏感词，请尝试更换关键字。</div>
              )}
            </div>
          </div>
        </SectionCard>

        <SectionCard eyebrow="02 / Rules" title="规则引擎配置">
          <div className="grid two-columns">
            <label className="field">
              <span>输出格式</span>
              <select
                value={config.rules.outputFormat}
                onChange={(event) =>
                  updateConfig((current) => ({
                    ...current,
                    rules: {
                      ...current.rules,
                      outputFormat: event.target.value as DemoConfiguration["rules"]["outputFormat"]
                    }
                  }))
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
                  updateConfig((current) => ({
                    ...current,
                    rules: {
                      ...current.rules,
                      domain: event.target.value
                    }
                  }))
                }
              />
            </label>

            <label className="field">
              <span>语气</span>
              <select
                value={config.rules.tone}
                onChange={(event) =>
                  updateConfig((current) => ({
                    ...current,
                    rules: {
                      ...current.rules,
                      tone: event.target.value as DemoConfiguration["rules"]["tone"]
                    }
                  }))
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
                  updateConfig((current) => ({
                    ...current,
                    rules: {
                      ...current.rules,
                      emotion: event.target.value as DemoConfiguration["rules"]["emotion"]
                    }
                  }))
                }
              >
                <option value="neutral">中性</option>
                <option value="calm">克制</option>
                <option value="positive">积极</option>
                <option value="serious">严肃</option>
                <option value="enthusiastic">热情</option>
              </select>
            </label>

          </div>

          <TagEditor
            label="正则规则"
            values={config.rules.constraints.regexRules}
            placeholder="回车添加正则规则"
            onChange={(values: string[]) =>
              updateConfig((current) => ({
                ...current,
                rules: {
                  ...current.rules,
                  constraints: {
                    ...current.rules.constraints,
                    regexRules: values
                  }
                }
              }))
            }
          />

          <div className="grid two-columns">
            {config.rules.outputFormat === "json" ? (
              <label className="field">
                <span>JSON Schema</span>
                <textarea
                  rows={9}
                  value={config.rules.constraints.jsonSchema ?? ""}
                  onChange={(event) =>
                    updateConfig((current) => ({
                      ...current,
                      rules: {
                        ...current.rules,
                        constraints: {
                          ...current.rules.constraints,
                          jsonSchema: event.target.value
                        }
                      }
                    }))
                  }
                />
              </label>
            ) : null}
            <label className="field">
              <span>补充规则说明</span>
              <textarea
                rows={9}
                value={config.rules.constraints.customInstruction ?? ""}
                placeholder="例如：优先给出落地步骤，不要输出无依据结论。"
                onChange={(event) =>
                  updateConfig((current) => ({
                    ...current,
                    rules: {
                      ...current.rules,
                      constraints: {
                        ...current.rules.constraints,
                        customInstruction: event.target.value
                      }
                    }
                  }))
                }
              />
            </label>
          </div>
        </SectionCard>
      </div>

      <div className="playground-grid">
        <SectionCard
          eyebrow="03 / Prompt"
          title="输入过滤与规则注入"
          actions={
            <button className="primary-button" type="button" onClick={runTransform}>
              过滤及规则注入
            </button>
          }
        >
          <label className="field">
            <span>原始提示词</span>
            <textarea rows={8} value={prompt} onChange={(event) => setPrompt(event.target.value)} />
          </label>

          <div className="result-grid">
            <article className="result-panel">
              <h3>输入过滤后</h3>
              {promptResponse?.filteredPrompt.blocked ? <p className="panel-badge">已触发校正规则</p> : null}
              <pre>{promptResponse?.filteredPrompt.filteredText ?? "点击右上角开始生成。"}</pre>
            </article>
            <article className="result-panel">
              <div className="result-panel-head">
                <h3>规则注入后</h3>
                <button
                  className="ghost-button small-button"
                  type="button"
                  onClick={copyStrengthenedPrompt}
                  disabled={!promptResponse?.strengthenedPrompt}
                >
                  {copySuccess ? "已复制" : "复制文本"}
                </button>
              </div>
              <pre>
                {promptResponse?.strengthenedPrompt ?? "规则引擎会把格式、领域、语气等要求拼装到提示词中。"}
              </pre>
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
                {outputResponse.validation.map((item, index) => (
                  <li key={`${item.type}-${item.message}-${index}`} className={item.ok ? "ok" : "bad"}>
                    [{item.ok ? "PASS" : "FAIL"}] {item.message}
                  </li>
                ))}
              </ul>
            </article>
          </div>
        </SectionCard>
      </div>

      {notifyDialog ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="notify-title">
            <p className="eyebrow">Sensitive Word Notice</p>
            <h2 id="notify-title">{notifyDialog.title}</h2>
            <p className="modal-copy">{notifyDialog.description}</p>
            <div className="modal-tags">
              {notifyDialog.terms.map((term) => (
                <span key={term} className="modal-tag">
                  {term}
                </span>
              ))}
            </div>
            <button className="primary-button" type="button" onClick={() => setNotifyDialog(null)}>
              我知道了
            </button>
          </div>
        </div>
      ) : null}

      {confirmDialog ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
            <p className="eyebrow">Confirm Action</p>
            <h2 id="confirm-title">{confirmDialog.title}</h2>
            <p className="modal-copy">{confirmDialog.description}</p>
            <div className="modal-actions">
              <button className="ghost-button" type="button" onClick={() => setConfirmDialog(null)}>
                取消
              </button>
              <button className="primary-button danger-button" type="button" onClick={confirmRemoveSelectedSensitiveWords}>
                {confirmDialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

export default App;
