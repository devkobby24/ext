#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { fetchDeployedTemplate } from './deployed/fetch-deployed-template.js';
import { EXIT_TOOL_ERROR } from './exit-codes.js';
import { OUTPUT_FORMATS, type OutputFormat } from './format/types.js';
import { run } from './run.js';

const HELP_TEXT = `destructive-diff — destructive-change gate for AWS CDK deployments

Compares the synthesized template in cdk.out/ against the currently deployed
template (read-only GetTemplate) and exits nonzero when a change would
destroy or detach stateful resources.

Usage:
  destructive-diff [options]
  destdiff [options]

Options:
  -a, --app <dir>              Cloud assembly directory (default: cdk.out)
  -s, --stack <name>           Stack to analyze (required if the assembly has several)
  -c, --config <file>          Config file (default: ./destructive-diff.yml if present)
  -f, --format <format>        Output format: human | json | markdown (default: human)
      --region <region>        Override the region derived from the stack's environment
      --deployed-template <f>  Offline mode: read the deployed template from a JSON file
                               instead of calling CloudFormation
  -h, --help                   Show this help
  -v, --version                Show the version

Exit codes:
  0  no policy violations
  1  tool error
  2  policy violation (destructive change not accepted in config)`;

function toolVersion(): string {
  const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  return String(packageJson.version);
}

function parseFormat(value: string): OutputFormat {
  if (!(OUTPUT_FORMATS as readonly string[]).includes(value)) {
    throw new Error(`Unknown --format "${value}"; expected one of: ${OUTPUT_FORMATS.join(', ')}`);
  }
  // The includes() check above proves membership in the OutputFormat union.
  return value as OutputFormat;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      app: { type: 'string', short: 'a', default: 'cdk.out' },
      stack: { type: 'string', short: 's' },
      config: { type: 'string', short: 'c' },
      format: { type: 'string', short: 'f', default: 'human' },
      region: { type: 'string' },
      'deployed-template': { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
      version: { type: 'boolean', short: 'v', default: false },
    },
  });

  if (values.help) {
    console.log(HELP_TEXT);
    return;
  }
  if (values.version) {
    console.log(toolVersion());
    return;
  }

  const result = await run(
    {
      assemblyDirectory: values.app,
      stackName: values.stack,
      configPath: values.config,
      configSearchDirectory: process.cwd(),
      format: parseFormat(values.format),
      region: values.region,
      deployedTemplatePath: values['deployed-template'],
    },
    { fetchDeployedTemplate },
  );

  console.log(result.output);
  process.exitCode = result.exitCode;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`destructive-diff: ${message}`);
  process.exitCode = EXIT_TOOL_ERROR;
});
