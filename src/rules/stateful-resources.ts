import type { StatefulResourceRule } from './types.js';

/**
 * The v0.1 detection rules: resource types whose replacement or deletion puts
 * data at risk. Extending driftguard means adding a row here (or via the
 * extra_stateful_resources config key), not writing code.
 *
 * defaultPolicyJustification cites the attribute documentation that defines
 * both the absent-policy defaults and which types honor a Snapshot policy:
 * - https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-attribute-deletionpolicy.html
 * - https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-attribute-updatereplacepolicy.html
 *
 * supportsSnapshotPolicy mirrors the snapshot-capable list in those docs
 * (EC2 Volume, ElastiCache CacheCluster/ReplicationGroup, Neptune DBCluster,
 * RDS DBCluster/DBInstance, Redshift Cluster, DocDB DBCluster). A Snapshot
 * policy declared on any other type silently reverts to Delete.
 */

const DELETION_POLICY_DOC =
  'https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-attribute-deletionpolicy.html';

const TEMPLATE_REFERENCE_BASE = 'https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference';

const DEFAULT_DELETE = { kind: 'fixed', policy: 'Delete' } as const;
const DEFAULT_SNAPSHOT = { kind: 'fixed', policy: 'Snapshot' } as const;

export const STATEFUL_RESOURCE_RULES: readonly StatefulResourceRule[] = [
  {
    resourceType: 'AWS::DynamoDB::Table',
    stateDescription: 'table items and secondary index data',
    justification: `${TEMPLATE_REFERENCE_BASE}/aws-resource-dynamodb-table.html`,
    defaultDeletionPolicy: DEFAULT_DELETE,
    defaultPolicyJustification: DELETION_POLICY_DOC,
    supportsSnapshotPolicy: false,
  },
  {
    resourceType: 'AWS::RDS::DBInstance',
    stateDescription: 'database contents',
    justification: `${TEMPLATE_REFERENCE_BASE}/aws-resource-rds-dbinstance.html`,
    // Documented exception: default is Snapshot for DBInstance resources that
    // do not specify DBClusterIdentifier (cluster members hold no independent
    // snapshot; their default is Delete).
    defaultDeletionPolicy: { kind: 'snapshot-unless-property-present', propertyName: 'DBClusterIdentifier' },
    defaultPolicyJustification: DELETION_POLICY_DOC,
    supportsSnapshotPolicy: true,
  },
  {
    resourceType: 'AWS::RDS::DBCluster',
    stateDescription: 'database contents',
    justification: `${TEMPLATE_REFERENCE_BASE}/aws-resource-rds-dbcluster.html`,
    defaultDeletionPolicy: DEFAULT_SNAPSHOT,
    defaultPolicyJustification: DELETION_POLICY_DOC,
    supportsSnapshotPolicy: true,
  },
  {
    resourceType: 'AWS::S3::Bucket',
    stateDescription: 'objects in the bucket',
    justification: `${TEMPLATE_REFERENCE_BASE}/aws-resource-s3-bucket.html`,
    defaultDeletionPolicy: DEFAULT_DELETE,
    defaultPolicyJustification: DELETION_POLICY_DOC,
    supportsSnapshotPolicy: false,
  },
  {
    resourceType: 'AWS::EFS::FileSystem',
    stateDescription: 'file system contents',
    justification: `${TEMPLATE_REFERENCE_BASE}/aws-resource-efs-filesystem.html`,
    defaultDeletionPolicy: DEFAULT_DELETE,
    defaultPolicyJustification: DELETION_POLICY_DOC,
    supportsSnapshotPolicy: false,
  },
  {
    resourceType: 'AWS::ElastiCache::CacheCluster',
    stateDescription: 'cached data on the cluster nodes',
    justification: `${TEMPLATE_REFERENCE_BASE}/aws-resource-elasticache-cachecluster.html`,
    defaultDeletionPolicy: DEFAULT_DELETE,
    defaultPolicyJustification: DELETION_POLICY_DOC,
    supportsSnapshotPolicy: true,
  },
  {
    resourceType: 'AWS::ElastiCache::ReplicationGroup',
    stateDescription: 'replicated cache data',
    justification: `${TEMPLATE_REFERENCE_BASE}/aws-resource-elasticache-replicationgroup.html`,
    defaultDeletionPolicy: DEFAULT_DELETE,
    defaultPolicyJustification: DELETION_POLICY_DOC,
    supportsSnapshotPolicy: true,
  },
  {
    resourceType: 'AWS::OpenSearchService::Domain',
    stateDescription: 'indexes and documents',
    justification: `${TEMPLATE_REFERENCE_BASE}/aws-resource-opensearchservice-domain.html`,
    defaultDeletionPolicy: DEFAULT_DELETE,
    defaultPolicyJustification: DELETION_POLICY_DOC,
    supportsSnapshotPolicy: false,
  },
  {
    resourceType: 'AWS::Elasticsearch::Domain',
    stateDescription: 'indexes and documents (legacy Elasticsearch resource)',
    justification: `${TEMPLATE_REFERENCE_BASE}/aws-resource-elasticsearch-domain.html`,
    defaultDeletionPolicy: DEFAULT_DELETE,
    defaultPolicyJustification: DELETION_POLICY_DOC,
    supportsSnapshotPolicy: false,
  },
  {
    resourceType: 'AWS::Redshift::Cluster',
    stateDescription: 'cluster databases',
    justification: `${TEMPLATE_REFERENCE_BASE}/aws-resource-redshift-cluster.html`,
    defaultDeletionPolicy: DEFAULT_DELETE,
    defaultPolicyJustification: DELETION_POLICY_DOC,
    supportsSnapshotPolicy: true,
  },
  {
    resourceType: 'AWS::DocDB::DBCluster',
    stateDescription: 'document database contents',
    justification: `${TEMPLATE_REFERENCE_BASE}/aws-resource-docdb-dbcluster.html`,
    defaultDeletionPolicy: DEFAULT_DELETE,
    defaultPolicyJustification: DELETION_POLICY_DOC,
    supportsSnapshotPolicy: true,
  },
  {
    resourceType: 'AWS::Neptune::DBCluster',
    stateDescription: 'graph database contents',
    justification: `${TEMPLATE_REFERENCE_BASE}/aws-resource-neptune-dbcluster.html`,
    defaultDeletionPolicy: DEFAULT_DELETE,
    defaultPolicyJustification: DELETION_POLICY_DOC,
    supportsSnapshotPolicy: true,
  },
  {
    resourceType: 'AWS::MemoryDB::Cluster',
    stateDescription: 'in-memory data with durability guarantees',
    justification: `${TEMPLATE_REFERENCE_BASE}/aws-resource-memorydb-cluster.html`,
    defaultDeletionPolicy: DEFAULT_DELETE,
    defaultPolicyJustification: DELETION_POLICY_DOC,
    supportsSnapshotPolicy: false,
  },
  {
    resourceType: 'AWS::FSx::FileSystem',
    stateDescription: 'file system contents',
    justification: `${TEMPLATE_REFERENCE_BASE}/aws-resource-fsx-filesystem.html`,
    defaultDeletionPolicy: DEFAULT_DELETE,
    defaultPolicyJustification: DELETION_POLICY_DOC,
    supportsSnapshotPolicy: false,
  },
  {
    resourceType: 'AWS::EC2::Volume',
    stateDescription: 'block storage contents',
    justification: `${TEMPLATE_REFERENCE_BASE}/aws-resource-ec2-volume.html`,
    defaultDeletionPolicy: DEFAULT_DELETE,
    defaultPolicyJustification: DELETION_POLICY_DOC,
    supportsSnapshotPolicy: true,
  },
  {
    resourceType: 'AWS::SQS::Queue',
    stateDescription: 'queued messages',
    justification: `${TEMPLATE_REFERENCE_BASE}/aws-resource-sqs-queue.html`,
    defaultDeletionPolicy: DEFAULT_DELETE,
    defaultPolicyJustification: DELETION_POLICY_DOC,
    supportsSnapshotPolicy: false,
  },
  {
    resourceType: 'AWS::Kinesis::Stream',
    stateDescription: 'buffered stream records within the retention window',
    justification: `${TEMPLATE_REFERENCE_BASE}/aws-resource-kinesis-stream.html`,
    defaultDeletionPolicy: DEFAULT_DELETE,
    defaultPolicyJustification: DELETION_POLICY_DOC,
    supportsSnapshotPolicy: false,
  },
  {
    resourceType: 'AWS::Cognito::UserPool',
    stateDescription: 'user accounts, credentials, and profiles',
    justification: `${TEMPLATE_REFERENCE_BASE}/aws-resource-cognito-userpool.html`,
    defaultDeletionPolicy: DEFAULT_DELETE,
    defaultPolicyJustification: DELETION_POLICY_DOC,
    supportsSnapshotPolicy: false,
  },
  {
    // The DeletionPolicy doc notes CloudFormation deletes secrets with the
    // ForceDeleteWithoutRecovery flag: no recovery window applies.
    resourceType: 'AWS::SecretsManager::Secret',
    stateDescription: 'secret value and versions (deleted without recovery window)',
    justification: `${TEMPLATE_REFERENCE_BASE}/aws-resource-secretsmanager-secret.html`,
    defaultDeletionPolicy: DEFAULT_DELETE,
    defaultPolicyJustification: DELETION_POLICY_DOC,
    supportsSnapshotPolicy: false,
  },
  {
    resourceType: 'AWS::Backup::BackupVault',
    stateDescription: 'stored recovery points',
    justification: `${TEMPLATE_REFERENCE_BASE}/aws-resource-backup-backupvault.html`,
    defaultDeletionPolicy: DEFAULT_DELETE,
    defaultPolicyJustification: DELETION_POLICY_DOC,
    supportsSnapshotPolicy: false,
  },
];

export function findStatefulResourceRule(
  rules: readonly StatefulResourceRule[],
  resourceType: string,
): StatefulResourceRule | undefined {
  return rules.find((rule) => rule.resourceType === resourceType);
}
