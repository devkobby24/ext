import { formatHuman } from './format-human.js';
import { formatJson } from './format-json.js';
import { formatMarkdown } from './format-markdown.js';
import type { OutputFormat, StackReport } from './types.js';

export function formatReport(report: StackReport, format: OutputFormat): string {
  switch (format) {
    case 'human':
      return formatHuman(report);
    case 'json':
      return formatJson(report);
    case 'markdown':
      return formatMarkdown(report);
  }
}
