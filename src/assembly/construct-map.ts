import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expectRecord, expectString, isRecord } from '../util/json.js';

const TREE_LOGICAL_ID_ATTRIBUTE = 'aws:cdk:cloudformation:logicalId';
const METADATA_LOGICAL_ID_TYPE = 'aws:cdk:logicalId';
const TREE_ARTIFACT_TYPE = 'cdk:tree';

/**
 * Map logical IDs to construct paths by walking tree.json (tree-0.1): leaf
 * CloudFormation resource nodes carry the logical ID in their attributes.
 */
export function constructPathsFromTree(treeFile: Record<string, unknown>): Map<string, string> {
  const paths = new Map<string, string>();
  const rootNode = expectRecord(treeFile['tree'], 'tree.json root node');
  walkTreeNode(rootNode, paths);
  return paths;
}

function walkTreeNode(node: Record<string, unknown>, paths: Map<string, string>): void {
  const attributes = node['attributes'];
  if (isRecord(attributes)) {
    const logicalId = attributes[TREE_LOGICAL_ID_ATTRIBUTE];
    if (typeof logicalId === 'string') {
      paths.set(logicalId, expectString(node['path'], 'tree node path'));
    }
  }
  const children = node['children'];
  if (isRecord(children)) {
    for (const child of Object.values(children)) {
      walkTreeNode(expectRecord(child, 'tree node child'), paths);
    }
  }
}

/**
 * Map logical IDs to construct paths from stack metadata entries — either the
 * standalone <Stack>.metadata.json file (current CDK) or the inline
 * artifacts.<stack>.metadata object (older CDK). Both share the same shape:
 * construct path → list of { type, data } entries.
 */
export function constructPathsFromStackMetadata(
  metadataEntries: Record<string, unknown>,
): Map<string, string> {
  const paths = new Map<string, string>();
  for (const [constructPath, entries] of Object.entries(metadataEntries)) {
    if (!Array.isArray(entries)) {
      continue;
    }
    for (const entry of entries) {
      if (isRecord(entry) && entry['type'] === METADATA_LOGICAL_ID_TYPE && typeof entry['data'] === 'string') {
        paths.set(entry['data'], constructPath.replace(/^\//, ''));
      }
    }
  }
  return paths;
}

/**
 * Build the logical ID → construct path map for one stack from a cloud
 * assembly directory. Metadata entries are loaded first, then tree.json paths
 * overlay them (the tree is authoritative when both know a logical ID).
 */
export function loadConstructPathMap(
  assemblyDirectory: string,
  stackName: string,
): ReadonlyMap<string, string> {
  const manifest = expectRecord(readJsonFile(join(assemblyDirectory, 'manifest.json')), 'manifest.json');
  const artifacts = expectRecord(manifest['artifacts'], 'manifest.json artifacts');
  const stackArtifactValue = artifacts[stackName];
  if (stackArtifactValue === undefined) {
    throw new Error(
      `Stack "${stackName}" not found in ${assemblyDirectory}/manifest.json; ` +
        `available artifacts: ${Object.keys(artifacts).join(', ')}`,
    );
  }
  const stackArtifact = expectRecord(stackArtifactValue, `artifact ${stackName}`);

  const paths = new Map<string, string>();

  const additionalMetadataFile = stackArtifact['additionalMetadataFile'];
  if (typeof additionalMetadataFile === 'string') {
    const metadataEntries = expectRecord(
      readJsonFile(join(assemblyDirectory, additionalMetadataFile)),
      additionalMetadataFile,
    );
    mergeInto(paths, constructPathsFromStackMetadata(metadataEntries));
  } else if (isRecord(stackArtifact['metadata'])) {
    mergeInto(paths, constructPathsFromStackMetadata(stackArtifact['metadata']));
  }

  const treePaths = loadTreePaths(assemblyDirectory, artifacts);
  for (const [logicalId, constructPath] of treePaths) {
    // The tree spans every stack in the app; keep only this stack's subtree so
    // identical logical IDs in sibling stacks cannot collide.
    if (constructPath === stackName || constructPath.startsWith(`${stackName}/`)) {
      paths.set(logicalId, constructPath);
    }
  }

  return paths;
}

function loadTreePaths(
  assemblyDirectory: string,
  artifacts: Record<string, unknown>,
): Map<string, string> {
  for (const artifactValue of Object.values(artifacts)) {
    if (!isRecord(artifactValue) || artifactValue['type'] !== TREE_ARTIFACT_TYPE) {
      continue;
    }
    const properties = expectRecord(artifactValue['properties'], 'cdk:tree artifact properties');
    const treeFileName = expectString(properties['file'], 'cdk:tree artifact file');
    const treeFile = expectRecord(readJsonFile(join(assemblyDirectory, treeFileName)), treeFileName);
    return constructPathsFromTree(treeFile);
  }
  return new Map();
}

function mergeInto(target: Map<string, string>, source: Map<string, string>): void {
  for (const [logicalId, constructPath] of source) {
    target.set(logicalId, constructPath);
  }
}

function readJsonFile(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

/**
 * The path a user recognizes: CDK L2 constructs synthesize their L1 under a
 * child named "Resource" (custom resources often use "Default"), so the map
 * yields "DemoStack/OrdersTable/Resource" for the construct the user wrote as
 * "DemoStack/OrdersTable". Trim that synthesis detail for display.
 */
export function toDisplayConstructPath(constructPath: string): string {
  const withoutLeadingSlash = constructPath.replace(/^\//, '');
  return withoutLeadingSlash.replace(/\/(Resource|Default)$/, '');
}
