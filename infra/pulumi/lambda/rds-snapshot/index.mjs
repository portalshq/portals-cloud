import {
  CreateDBSnapshotCommand,
  DeleteDBSnapshotCommand,
  DescribeDBSnapshotsCommand,
  RDSClient,
} from "@aws-sdk/client-rds";

const client = new RDSClient({});

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function listManagedSnapshots(databaseId, prefix) {
  const snapshots = [];
  let Marker;
  do {
    const response = await client.send(new DescribeDBSnapshotsCommand({
      DBInstanceIdentifier: databaseId,
      SnapshotType: "manual",
      Marker,
    }));
    snapshots.push(...(response.DBSnapshots ?? []).filter(snapshot =>
      snapshot.DBSnapshotIdentifier?.startsWith(`${prefix}-`),
    ));
    Marker = response.Marker;
  } while (Marker);
  return snapshots.sort((left, right) =>
    (right.SnapshotCreateTime?.getTime() ?? 0) - (left.SnapshotCreateTime?.getTime() ?? 0),
  );
}

export async function handler() {
  const databaseId = required("DATABASE_INSTANCE_ID");
  const prefix = required("SNAPSHOT_PREFIX");
  const retentionCount = Number.parseInt(required("RETENTION_COUNT"), 10);
  if (!Number.isInteger(retentionCount) || retentionCount < 2 || retentionCount > 35) {
    throw new Error("RETENTION_COUNT must be between 2 and 35");
  }

  const day = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const snapshotId = `${prefix}-${day}`;
  try {
    await client.send(new CreateDBSnapshotCommand({
      DBInstanceIdentifier: databaseId,
      DBSnapshotIdentifier: snapshotId,
      Tags: [
        { Key: "Project", Value: "portals" },
        { Key: "Purpose", Value: "low-cost-recovery" },
        { Key: "ManagedBy", Value: "scheduled-rds-snapshot" },
      ],
    }));
    console.log(JSON.stringify({ event: "snapshot-created", snapshotId }));
  } catch (error) {
    if (!["DBSnapshotAlreadyExists", "DBSnapshotAlreadyExistsFault"].includes(error?.name)) {
      throw error;
    }
    console.log(JSON.stringify({ event: "snapshot-already-exists", snapshotId }));
  }

  const snapshots = await listManagedSnapshots(databaseId, prefix);
  const removable = snapshots.slice(retentionCount)
    .filter(snapshot => snapshot.Status === "available" && snapshot.DBSnapshotIdentifier);
  for (const snapshot of removable) {
    await client.send(new DeleteDBSnapshotCommand({
      DBSnapshotIdentifier: snapshot.DBSnapshotIdentifier,
    }));
    console.log(JSON.stringify({
      event: "snapshot-pruned",
      snapshotId: snapshot.DBSnapshotIdentifier,
    }));
  }

  return { snapshotId, retained: Math.min(snapshots.length, retentionCount), pruned: removable.length };
}
