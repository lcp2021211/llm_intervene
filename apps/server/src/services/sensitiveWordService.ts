import type {
  FilteredTextResult,
  SensitiveWordConfig,
  SensitiveWordEntry,
  SensitiveWordMatch,
  TextFilterStage
} from "@llm-intervene/shared";

interface TrieNode {
  children: Map<string, TrieNode>;
  entry?: SensitiveWordEntry;
}

const createNode = (): TrieNode => ({ children: new Map() });

export class SensitiveWordService {
  private buildTrie(words: SensitiveWordEntry[], caseSensitive: boolean): TrieNode {
    const root = createNode();

    for (const entry of words) {
      const normalizedTerm = this.normalize(entry.term, caseSensitive);
      if (!normalizedTerm) {
        continue;
      }

      let node = root;
      for (const char of normalizedTerm) {
        if (!node.children.has(char)) {
          node.children.set(char, createNode());
        }
        node = node.children.get(char)!;
      }
      node.entry = entry;
    }

    return root;
  }

  private normalize(value: string, caseSensitive: boolean): string {
    return caseSensitive ? value.trim() : value.trim().toLocaleLowerCase();
  }

  private findMatches(text: string, config: SensitiveWordConfig): SensitiveWordMatch[] {
    if (!config.enabled || config.customWords.length === 0 || !text.trim()) {
      return [];
    }

    const normalizedText = this.normalize(text, config.caseSensitive);
    const trie = this.buildTrie(config.customWords, config.caseSensitive);
    const matches: SensitiveWordMatch[] = [];

    for (let start = 0; start < normalizedText.length; start += 1) {
      let node = trie;
      let bestMatch: SensitiveWordMatch | undefined;

      for (let end = start; end < normalizedText.length; end += 1) {
        const next = node.children.get(normalizedText[end]);
        if (!next) {
          break;
        }

        node = next;
        if (node.entry) {
          const replacement =
            node.entry.replacement ?? (config.action === "replace" ? config.replacementText : "");
          bestMatch = {
            term: text.slice(start, end + 1),
            start,
            end: end + 1,
            replacement
          };
        }
      }

      if (bestMatch) {
        matches.push(bestMatch);
        start = bestMatch.end - 1;
      }
    }

    return matches;
  }

  filterText(text: string, stage: TextFilterStage, config: SensitiveWordConfig): FilteredTextResult {
    const matches = this.findMatches(text, config);

    if (matches.length === 0) {
      return {
        originalText: text,
        filteredText: text,
        changed: false,
        blocked: false,
        stage,
        matches,
        messages: ["未命中敏感词。"]
      };
    }

    if (config.action === "notify") {
      return {
        originalText: text,
        filteredText: text,
        changed: false,
        blocked: true,
        stage,
        matches,
        messages: [
          `${stage === "input" ? "输入" : "输出"}包含敏感词，请调用方提示用户校正后重试。`
        ]
      };
    }

    let cursor = 0;
    let filteredText = "";

    for (const match of matches) {
      filteredText += text.slice(cursor, match.start);
      filteredText += config.action === "remove" ? "" : match.replacement;
      cursor = match.end;
    }
    filteredText += text.slice(cursor);

    return {
      originalText: text,
      filteredText,
      changed: filteredText !== text,
      blocked: false,
      stage,
      matches,
      messages: [
        `${stage === "input" ? "输入" : "输出"}已命中 ${matches.length} 个敏感词，并按策略完成处理。`
      ]
    };
  }
}
