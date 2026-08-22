# Roadmap

Deferred by the v0.1 scope decision (see NOTES.md for the reasoning trail). Ordered by intended sequence, not certainty.

## v0.2 — IAM and security-group widening

Its own severity class, excluded from the default `fail_on`. Base signal is the diff library's `permissionsBroadened` (any positive statement added or negative statement removed — the same primitive `cdk deploy` uses for its approval prompt), with two severity escalators: wildcards appearing in an added statement, and security-group ingress opening to `0.0.0.0/0` or `::/0`. A wildcard-only detection was rejected because plain broadening (adding `s3:DeleteObject` on one bucket) carries no wildcard. Statements containing unresolved intrinsics arrive as `MaybeParsed` and must be flagged, not dropped.

## Construct rename detection

Same construct renamed → logical ID changes → CloudFormation deletes and recreates. Report it as one rename, not two changes. The diff library offers nothing here (its `mappings` module only formats `cdk refactor` output). Plan: pair removals with additions of the same type and equivalent properties; recover the old construct path from the deployed template's `aws:cdk:path` metadata and the new one from the assembly. Two known hard parts, both to be handled the way `cdk refactor` does: ambiguous pairings are reported as ambiguous rather than guessed, and cascading `Ref`/`Fn::GetAtt` differences require reference normalization (or content digests computed in dependency order) before matching.

## Nested stacks

v0.1 emits a "detected, not analyzed" notice for any changed or removed `AWS::CloudFormation::Stack`. Full support means resolving the nested template from the assembly, fetching the deployed nested template, and recursing — with construct paths joined across the boundary.

## Multiple stacks per assembly

The assembly reader already returns every stack artifact; the orchestrator analyzes one. Multi-stack is a loop plus report aggregation and a per-stack exit-code policy.

## `--use-changeset` (opt-in accuracy)

v0.1 replacement prediction is service-spec based, so conditional replacements surface as MAY_REPLACE rather than a definite answer. CloudFormation's real answer requires creating a changeset — a write to CloudFormation state — which violates the v0.1 read-only guarantee. An explicit opt-in flag can create (and delete) a review-only changeset and feed it to `fullDiff`, which accepts a `DescribeChangeSetOutput`.

## Smaller items

- YAML deployed templates (hand-written stacks; CDK-deployed stacks are always JSON).
- npm publish (name and alias reserved: `destructive-diff`, `destdiff`; deliberately unpublished until validated against real production stacks).
