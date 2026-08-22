# NOTES

Decision log for destructive-diff (formerly working-named driftguard; entries below the rename keep the old name verbatim). One entry per correction or non-obvious decision, written when the decision is made. Corrections are logged in both directions. This is not a changelog — git has the changelog.

## 2026-08-22 manifest.json no longer inlines logical-ID metadata

**Proposed:** Spec assumed `manifest.json` carries the logical-ID → construct-path metadata inline under `artifacts.<stack>.metadata`.
**Changed to:** Primary source is `tree.json` (leaf nodes carry `attributes["aws:cdk:cloudformation:logicalId"]` in tree-0.1). Metadata now lives in a separate `<Stack>.metadata.json` referenced by `additionalMetadataFile`; driftguard reads that, with inline-manifest fallback for older CDK versions.
**Raised by:** Claude
**Reason:** The current cloud-assembly format (schema 54.0.0, aws-cdk-lib 2.266.0) moved stack metadata out of `manifest.json`; the stack artifact has no `metadata` key at all.
**Evidence:** Synthesized assembly: artifact keys are `[type, environment, properties, dependencies, additionalMetadataFile, displayName]`; `DemoStack.metadata.json` holds the `aws:cdk:logicalId` entries keyed by construct path.

## 2026-08-22 cloudformation-diff misclassifies Snapshot and RetainExceptOnCreate removals

**Proposed:** Rely on the library's `WILL_ORPHAN` / `WILL_DESTROY` distinction for deletion outcomes.
**Changed to:** driftguard resolves removal/replacement outcomes from its own policy table (`Delete` → data loss, `Retain`/`RetainExceptOnCreate` → orphaned, `Snapshot` → snapshot-recoverable) and uses the library only for change detection. Filed upstream as [aws/aws-cdk-cli#1882](https://github.com/aws/aws-cdk-cli/issues/1882) (duplicate search on 2026-08-22 found none).
**Raised by:** Claude
**Reason:** `changeImpact` tests `DeletionPolicy === 'Retain'` literally; `Snapshot` and `RetainExceptOnCreate` both fall through to `WILL_DESTROY`. `RetainExceptOnCreate` on an existing resource retains it, so that classification is wrong, not merely conservative.
**Evidence:** `packages/@aws-cdk/cloudformation-diff/lib/diff/types.ts` L725–727 on upstream main (same code compiled in 2.187.3 at `lib/diff/types.js:514-516`); execution table over all five policy values; `grep` shows neither string appears anywhere in the package.

## 2026-08-22 IAM detection: permissionsBroadened instead of wildcard-gaining

**Proposed:** Spec detection 4: flag policy statements gaining wildcards and security-group ingress opening to 0.0.0.0/0.
**Changed to:** Base signal is the library's `permissionsBroadened` (any positive statement added or negative statement removed), with wildcard-in-added-statement and world-open CIDR (`0.0.0.0/0`, `::/0`) as severity escalators. Per Justice: implemented as its own severity class, excluded from the default `fail_on`. Deferred to post-v0.1 by the scope cut.
**Raised by:** Claude (reframing); Justice (severity class + default exclusion)
**Reason:** A wildcard-only test misses plain broadening — adding `s3:DeleteObject` on a specific bucket widens permissions with no wildcard present. Broadening is the same primitive `cdk deploy` uses for its approval prompt.
**Evidence:** `IamChanges.permissionsBroadened` doc comment in `lib/iam/iam-changes.d.ts`; experiment output showing `permissionsBroadened: true` and structured statement/rule diffs.

## 2026-08-22 MAY_REPLACE severity scoping

**Proposed:** Claude: fail-closed — any `MAY_REPLACE` on a stateful resource is a violation (distinct severity, suppressible per construct).
**Changed to:** `MAY_REPLACE` is a violation only when the resource is stateful AND its effective policy permits data loss; warning otherwise. Encoded in verdict evaluation: `certainty === 'may'` downgrades to warning unless the outcome is data loss.
**Raised by:** Justice
**Reason:** Stated as policy without further elaboration: "violation only when the resource is stateful AND its effective policy permits data loss. Warning otherwise."
**Evidence:** none, judgment call

## 2026-08-22 v0.1 scope cut

**Proposed:** v1 with all four detections (stateful replacement/deletion, data-loss policy check, construct rename, IAM/SG widening).
**Changed to:** v0.1 ships detections 1 and 2 only, single stack, no rename detection, nested stacks reported as "detected, not analyzed" findings only. Deferred to ROADMAP.md: rename detection (Claude's assessment: pairing ambiguity plus cascading `Ref`/`GetAtt` differences require reference normalization or digest matching in dependency order), IAM/SG severity class, nested-stack recursion, multi-stack, `--use-changeset` (deferred because creating a changeset writes CloudFormation state, conflicting with the v1 read-only constraint; spec-based replacement prediction accepted for v0.1 with the accuracy tradeoff documented).
**Raised by:** Justice
**Reason:** No technical argument stated; scope decision. Layout requirement attached: modules must let the deferred detections slot in without a rewrite.
**Evidence:** none, judgment call

## 2026-08-22 severity table keyed on (detection, outcome), orphan severities split

**Proposed:** Claude's step-2 design declared the severity table type as keyed on (detection, outcome) but the proposed `SEVERITY_BY_OUTCOME` collapsed the key to outcome only, making orphan-on-replacement and orphan-on-removal the same severity (`data-orphaned`), with default `fail_on: [data-loss, data-orphaned]`.
**Changed to:** Severity is keyed on (detection, outcome) as the type declares. Orphan-on-replacement outranks orphan-on-removal. Default `fail_on` = data-loss + orphan-on-replacement; orphan-on-removal is a warning.
**Raised by:** Justice
**Reason:** As stated: the table must use the key the type already declares, and the two orphan cases are not the same severity. Consistent with the mechanism noted in the step-2 design: replacement-with-Retain swaps an empty successor into the live stack while the old data detaches; removal-with-Retain leaves the running resource behind deliberately.
**Evidence:** none, judgment call

## 2026-08-22 absent DeletionPolicy resolved per resource type, not blanket Delete

**Proposed:** Claude: treat an absent policy as `Delete` everywhere (CloudFormation's general default), accepting a false data-loss alarm on RDS removals as conservative-in-the-gate's-favor, with the RDS nuance only noted in rule documentation.
**Changed to:** `StatefulResourceRule` gains `defaultDeletionPolicy`, set correctly per resource type with a doc citation (`Snapshot` for `AWS::RDS::DBCluster` and for `AWS::RDS::DBInstance` without `DBClusterIdentifier`; `Delete` otherwise). `Finding.detail` states when the policy was inferred from the default rather than declared in the template.
**Raised by:** Justice
**Reason:** Directive: "Drop absent-as-Delete." Accuracy over blanket conservatism — the defaults are documented facts, and inferred-vs-declared marking in the finding preserves honesty about the derivation.
**Evidence:** [DeletionPolicy attribute documentation](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-attribute-deletionpolicy.html) (default-policy exceptions for RDS)

## 2026-08-22 unverified "same pattern elsewhere" claim removed from issue draft

**Proposed:** The upstream issue draft claimed the `=== 'Retain'` comparison pattern "also decides the diff formatting elsewhere in the package," written from assumption rather than verification.
**Changed to:** Claim replaced with its opposite: the comparison occurs at exactly one site, so the fix is contained.
**Raised by:** Claude
**Reason:** A grep run before showing the draft found `'Retain'` at only one site in the compiled package; the original sentence would have shipped a false statement in a public bug report.
**Evidence:** `grep -rn "'Retain'" lib/` over `@aws-cdk/cloudformation-diff@2.187.3` → single hit at `lib/diff/types.js:514`.

## 2026-08-22 (absent) DeletionPolicy row removed from upstream issue table

**Proposed:** The issue draft's behavior table included an `(absent)` row marked "yes for most types," and the repro script included `undefined` in the policy loop.
**Changed to:** Row and `undefined` repro case removed. The docs confirm the default is `Snapshot` for `AWS::RDS::DBCluster` and for `AWS::RDS::DBInstance` without `DBClusterIdentifier` — and the repro resource is exactly an `AWS::RDS::DBInstance` without that property, so "yes" was wrong for the very resource type in the table, and contradicted the step-2 decision that dropped absent-as-Delete from driftguard's rules.
**Raised by:** Justice
**Reason:** As stated: "Do not ship a table that disagrees with our own design note." Removal preferred over correcting the row to keep the issue focused on declared policies.
**Evidence:** [DeletionPolicy attribute documentation](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-attribute-deletionpolicy.html): "**Exception**: The default policy is `Snapshot` for `AWS::RDS::DBCluster` resources and for `AWS::RDS::DBInstance` resources that don't specify the `DBClusterIdentifier` property."

## 2026-08-22 Snapshot policies on unsupported types classify as data loss

**Proposed:** Step-2 design treated any declared or inferred Snapshot policy as the snapshot-recoverable outcome.
**Changed to:** `StatefulResourceRule` gains `supportsSnapshotPolicy`; a Snapshot policy declared on a type outside CloudFormation's snapshot-capable list resolves to effective Delete (data loss) with a `declared-snapshot-unsupported` source, stated in the finding detail. Additionally encoded while implementing the resolver: UpdateReplacePolicy's absent-value default is always Delete with no RDS exception, and `RetainExceptOnCreate` is not a valid UpdateReplacePolicy value (the resolver rejects it).
**Raised by:** Claude
**Reason:** Both attribute docs state that Snapshot on a resource that doesn't support snapshots "reverts to the default option, which is `Delete`" — so a declared Snapshot is not automatically safe, and treating it as recoverable would understate e.g. a DynamoDB table replacement.
**Evidence:** [UpdateReplacePolicy attribute documentation](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-attribute-updatereplacepolicy.html) (reversion sentence, Delete default, value list) and the snapshot-capable resource lists on both attribute pages.

## 2026-08-22 snapshot-on-unsupported-type split by attribute; earlier "both docs" claim was wrong

**Proposed:** The earlier snapshot-reversion entry claimed "Both attribute docs state" the reversion, and both resolvers reverted a declared Snapshot to Delete (classifying as data loss).
**Changed to:** Only UpdateReplacePolicy documents the reversion; that path keeps data-loss classification with the exact sentence quoted at the classification site. The DeletionPolicy page contains no reversion statement (verified by grepping the raw page text for "revert" and "support snapshot" variants), so that case now resolves to warning-level snapshot recovery with `Finding.detail` stating the outcome is inferred, not guaranteed. Policy sources split into `declared-snapshot-reverted` (documented) and `declared-snapshot-undocumented` (inferred).
**Raised by:** Justice (directed the re-verification and the rule: pin to a specific documented statement or downgrade to a warning marked as inferred)
**Reason:** As stated: "If you can't pin it to a specific documented statement, downgrade that case from data-loss to a warning and say in Finding.detail that the behavior is inferred." The earlier entry's evidence claim over-generalized one page's sentence to both pages.
**Evidence:** UpdateReplacePolicy page: "If you specify the Snapshot option in the UpdateReplacePolicy for a resource that doesn't support snapshots, CloudFormation reverts to the default option, which is Delete." DeletionPolicy page: zero matches for reversion phrasing (checked 2026-08-22).

## 2026-08-22 project rename: "drift" is the wrong word (name pending)

**Proposed:** Keep the working name driftguard and dodge the npm conflict with a scope or suffix.
**Changed to:** Rename entirely before anything bakes the name in (bin name, config filename, README).
**Raised by:** Justice
**Reason:** As stated: "drift" already means deployed-state divergence in IaC (CloudFormation drift detection, cdk drift) and this tool does something else — the npm conflict is a prompt to fix a naming error, not just to dodge it.
**Evidence:** CloudFormation drift detection and the `cdk drift` command are established usages of the term for live-state divergence from the template, which this tool does not measure.

## 2026-08-22 offline mode: --deployed-template

**Proposed:** The deployed template comes only from a live read-only `GetTemplate` call.
**Changed to:** `--deployed-template <file>` reads it from a JSON file instead, sharing every subsequent code path with the live mode. Motivations: CI jobs without AWS credentials can still gate; the full pipeline is testable without AWS (the run tests inject a stub fetcher, the CLI self-check in CI uses the flag); and the README's opening example could be produced honestly — this environment has no deployed stack, so the demo runs a real synthesized CDK app against a saved earlier synthesis, with the flag visible in the shown command rather than edited out.
**Raised by:** Claude
**Reason:** none, judgment call — the README requirement ("real output from running the tool against an actual CDK stack") could not be met against a live stack without deploying to the user's AWS account, which the tool's own read-only promise and common sense both forbid.
**Evidence:** README example reproduced verbatim from `dist/cli.js --app cdk.out --deployed-template deployed-template.json` on 2026-08-22, exit code 2.

## 2026-08-22 renamed to destructive-diff, bin alias destdiff

**Proposed:** Candidates lossgate (Claude's recommendation), destructive-diff, teardown-gate, demolition-diff, razegate — all verified free on npm with no exact-name GitHub or AWS/CDK tool collisions.
**Changed to:** destructive-diff, with short bin alias destdiff (verified free on npm, no GitHub repos). lossgate, teardown-gate, and razegate rejected as a family.
**Raised by:** Justice
**Reason:** As stated: the -gate suffix reads as scandal in English, not as a CI gate; destructive-diff is searchable by the problem it solves, which matters for adoption. (This also resolved the earlier rename decision: "drift" was a naming error, not just an npm conflict — it means deployed-state divergence in IaC, which this tool does not measure.)
**Evidence:** `npm view` 404s for destructive-diff and destdiff on 2026-08-22; `gh search repos` shows no exact-name projects.

## 2026-08-22 npm package name "driftguard" is taken (deferred)

**Proposed:** Publish as `driftguard`, runnable via `npx driftguard`.
**Changed to:** Deferred. `driftguard@0.1.1` already exists on npm (unrelated project: "Deterministic design system compliance engine for AI-generated UI", last modified 2026-02-28). Options when publishing becomes relevant: a scoped name (`@<scope>/driftguard`) or a rename. Code proceeds under the working name.
**Raised by:** Claude
**Reason:** Publishing under the bare name is impossible; the decision affects README, bin name, and CI, so it must be made before step 4's CLI wrapper is finalized.
**Evidence:** `npm view driftguard` on 2026-08-22.

## 2026-08-22 construct paths displayed without the synthesized L1 child

**Proposed:** Report the raw mapped path (e.g. `DemoStack/OrdersTable/Resource`).
**Changed to:** Findings trim a trailing `/Resource` or `/Default` segment (`DemoStack/OrdersTable`), because that child is CDK synthesis detail — the user wrote `OrdersTable`, and the spec's goal is naming "the construct I wrote." Raw paths are preserved in the map; trimming happens only at finding construction.
**Raised by:** Claude
**Reason:** none, judgment call (matches how the CDK CLI itself displays paths in diff output)
**Evidence:** synthesized tree.json: the L1 under `DemoStack/OrdersTable` is the child node `Resource`.

## 2026-08-22 accepted_risks matchable by logical ID

**Proposed:** Claude: `accepted_risks` entries keyed by `construct_path` only.
**Changed to:** Entries accept `construct_path` OR `logical_id`.
**Raised by:** Justice
**Reason:** Construct paths are a best-effort source — with path metadata disabled (`--no-path-metadata`) findings degrade to logical IDs, and a path-only config key could not reference those findings.
**Evidence:** none, judgment call (follows from the path-metadata degradation noted in the step-1 assessment)
