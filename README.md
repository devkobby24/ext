# destructive-diff

A destructive-change gate for AWS CDK deployments. It reads the same information `cdk diff` reads, names the dangerous changes after the constructs you wrote, and exits nonzero so CI blocks the deploy.

This is what it prints for a CDK app where a developer renamed the `OrdersTable` partition key, deleted the payment events queue, and dropped a retained bucket:

```
$ destructive-diff --app cdk.out --deployed-template deployed-template.json
destructive-diff — stack PaymentsStack

✖ data-loss  PaymentsStack/PaymentEventsQueue  [AWS::SQS::Queue]
    Resource is removed from the stack; the queued messages will be deleted. DeletionPolicy: Delete (declared).
    logical ID: PaymentEventsQueueD28497E2
    docs: https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-sqs-queue.html

✖ orphan-on-replacement  PaymentsStack/OrdersTable  [AWS::DynamoDB::Table]
    Change to KeySchema forces replacement; the old resource is detached and kept with its table items and secondary index data while an empty replacement takes over. UpdateReplacePolicy: Retain (declared).
    logical ID: OrdersTable315BB997
    docs: https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-dynamodb-table.html

⚠ orphan-on-removal  PaymentsStack/ReportsBucket  [AWS::S3::Bucket]
    Resource is removed from the stack; the resource keeps running outside the stack with its objects in the bucket (manual cleanup required). DeletionPolicy: Retain (declared).
    logical ID: ReportsBucket4E7C5994
    docs: https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-s3-bucket.html

2 violation(s), 1 warning(s), 0 accepted — BLOCKED (exit 2)
```

This is verbatim tool output against a real synthesized CDK app. The run uses `--deployed-template` (the offline mode that reads the deployed template from a file) because it was produced in an environment with no deployed stack; against a live stack you drop that flag and the deployed template comes from a read-only `GetTemplate` call instead — everything after that point is the same code path.

Note what the second finding says: the table's data is **not** deleted — `UpdateReplacePolicy: Retain` keeps it — and the deploy is still blocked, because after the replacement an **empty** table serves production traffic while the data sits detached in an orphan. `cdk diff` prints this as an ordinary `[~] AWS::DynamoDB::Table ... replace` line among all the others.

## Why

`cdk diff` reports every change with the same weight. Nothing separates "adds a log group" from "replaces the DynamoDB table and drops the data", so engineers skim and approve. destructive-diff computes a structured diff between the synthesized template in `cdk.out/` and the currently deployed template, classifies each change against a data file of stateful resource rules, and:

- names every finding by the **construct path you wrote** (`PaymentsStack/OrdersTable`), not a hashed logical ID;
- distinguishes **actual data loss** from **orphaned data** from **snapshot-recoverable** deletion, by resolving the effective `DeletionPolicy`/`UpdateReplacePolicy` — including CloudFormation's per-type defaults (an RDS instance with no declared policy defaults to `Snapshot`, not `Delete`);
- states whether each policy was **declared in the template or inferred** from a documented default;
- exits `2` on violations so CI blocks, with per-construct accepted-risk overrides that require a written reason.

It never mutates AWS state: the only AWS call is a read-only `GetTemplate`.

## Usage

```
npx destructive-diff                # in a project with a synthesized cdk.out/
destructive-diff --stack PaymentsStack --format markdown   # PR comment body
destdiff -f json                    # short alias, machine-readable output
```

| Exit code | Meaning |
|---|---|
| 0 | no policy violations (warnings may exist) |
| 1 | tool error |
| 2 | policy violation — a destructive change is not accepted in config |

`--format markdown` produces a ready-to-post PR comment:

> ## 🛑 destructive-diff: 2 destructive change(s) block this deploy
>
> **Stack:** `PaymentsStack`
>
> ### Violations
>
> - **`PaymentsStack/PaymentEventsQueue`** (`AWS::SQS::Queue`, logical ID `PaymentEventsQueueD28497E2`) — **data-loss**, certain
>   Resource is removed from the stack; the queued messages will be deleted. DeletionPolicy: Delete (declared). ([docs](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-sqs-queue.html))
> - **`PaymentsStack/OrdersTable`** (`AWS::DynamoDB::Table`, logical ID `OrdersTable315BB997`) — **orphan-on-replacement**, certain
>   Change to KeySchema forces replacement; the old resource is detached and kept with its table items and secondary index data while an empty replacement takes over. UpdateReplacePolicy: Retain (declared). ([docs](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-dynamodb-table.html))

For CI without AWS credentials, `--deployed-template <file>` runs the same analysis against a saved copy of the deployed template.

## What it detects (v0.1)

| Detection | Finding |
|---|---|
| Deletion of a stateful resource | severity by effective `DeletionPolicy`: `Delete` → **data-loss**, `Retain`/`RetainExceptOnCreate` → **orphan-on-removal**, `Snapshot` → **snapshot-recoverable** |
| Replacement of a stateful resource | severity by effective `UpdateReplacePolicy`: `Delete` (also the absent-policy default) → **data-loss**, `Retain` → **orphan-on-replacement**, `Snapshot` → **snapshot-recoverable** |
| Nested stack changed or removed | **notice** — v0.1 does not analyze nested stack templates and says so instead of pretending coverage |

Twenty stateful resource types ship in [the rules data file](src/rules/stateful-resources.ts) — DynamoDB, RDS, S3, EFS, ElastiCache, OpenSearch, Redshift, DocumentDB, Neptune, MemoryDB, FSx, EBS volumes, SQS, Kinesis, Cognito user pools, Secrets Manager, Backup vaults, and more. Every rule cites the AWS documentation that justifies it, and rules are data, not code: add a row (or use `extra_stateful_resources` in config) to extend coverage.

Two classification details worth knowing, both grounded in the [DeletionPolicy](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-attribute-deletionpolicy.html) and [UpdateReplacePolicy](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-attribute-updatereplacepolicy.html) docs:

- A **declared `Snapshot` is not automatically safe.** On replacement, CloudFormation documents that Snapshot on a type that doesn't support snapshots "reverts to the default option, which is Delete" — destructive-diff classifies that as data loss. For deletion, AWS documents no behavior for that combination, so the finding is reported as a warning with the inference stated rather than as a guessed certainty.
- **Uncertain replacements don't cry wolf.** A `MAY_REPLACE` (the property's replacement behavior is *conditional*) blocks only when the worst case is actual data loss; otherwise it downgrades to a warning.

## Configuration — `destructive-diff.yml`

```yaml
version: 1
stack: PaymentsStack            # optional when the assembly has exactly one stack
fail_on:                        # severities that exit 2 (this is the default)
  - data-loss
  - orphan-on-replacement
accepted_risks:                 # per-construct overrides; a reason is mandatory
  - construct_path: PaymentsStack/OrdersTable
    detection: stateful-replacement
    reason: "Key schema migration; data backfilled from S3 export (TICKET-123)"
  - logical_id: LegacyQueueDEADBEEF     # for stacks synthesized without path metadata
    detection: stateful-deletion
    reason: "Queue drained and consumers migrated 2026-08-01"
extra_stateful_resources:       # extend the built-in rules
  - resource_type: AWS::Timestream::Table
    state_description: time-series records
```

Config validation is strict: unknown keys are errors, because a typo like `fail_om` would otherwise silently disable the gate.

## Accuracy: spec-based, not changeset-accurate

v0.1 predicts replacements from the CloudFormation resource specification (via `@aws-cdk/cloudformation-diff`, the same engine behind `cdk diff`), **not** from a real changeset. The reason is the read-only guarantee: CloudFormation's definitive answer requires creating a changeset, which writes state to your account. The cost of that choice is that properties whose replacement behavior is *conditional* surface as `MAY_REPLACE` rather than a definite verdict — destructive-diff reports that uncertainty instead of guessing. An opt-in `--use-changeset` mode is on the [roadmap](ROADMAP.md).

## How it's tested

- **Real fixture templates, no mocks.** Every detection runs through the actual diff engine against committed before/after template pairs — one fixture per detection path, plus false-positive guards (a stateless replacement, CDK metadata churn, a no-op diff) that must produce zero findings. Construct-path mapping is tested against an unmodified synthesized cloud assembly.
- **Mutation-checked.** A green suite only counts if it fails when the code is wrong, so the tests were validated by breaking the code on purpose: collapsing the severity table's orphan distinction and deleting the MAY_REPLACE downgrade rule each cause specific test failures.
- **Upstream behavior is pinned.** `@aws-cdk/cloudformation-diff` is not a stable public API, so it's pinned to an exact version and [test/upstream-behavior-pin.test.ts](test/upstream-behavior-pin.test.ts) asserts every behavior relied upon. One pin fails by design: while building this tool we found that the library misclassifies `RetainExceptOnCreate` and `Snapshot` removals as `WILL_DESTROY` (filed as [aws/aws-cdk-cli#1882](https://github.com/aws/aws-cdk-cli/issues/1882)); destructive-diff resolves policies itself, and the pin turns an upstream fix into a visible test failure instead of silent drift.
- CI runs typecheck, build, the suite, and a CLI self-check that requires exit code 2 on a destructive fixture diff.

## Non-goals for v0.1

No Terraform, no web UI, no LLM anywhere in the pipeline, no mutation of AWS state. Deferred features — IAM/security-group widening detection, construct-rename detection, nested-stack recursion, multi-stack — live in [ROADMAP.md](ROADMAP.md) with the reasoning. Design decisions and their corrections are logged in [NOTES.md](NOTES.md).

## License

MIT
