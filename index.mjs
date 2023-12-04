import { Route53Client, ListResourceRecordSetsCommand, ChangeResourceRecordSetsCommand } from "@aws-sdk/client-route-53";
const client = new Route53Client({region: 'us-east-1'});

const ZONE_ID = "Z0914303KWEGX7VEXJFT"
const MAX_CHANGES = 1000;
const MAX_RESULTS = 300;

let recordSets = [];
let isTruncated = true;
let nextRecordName, nextRecordType;

while (isTruncated) {
  const listCommand = new ListResourceRecordSetsCommand({ 
    HostedZoneId: ZONE_ID,
    MaxItems: MAX_RESULTS,
    StartRecordName: nextRecordName,
    StartRecordType: nextRecordType,
  });
  const response = await client.send(listCommand);
  recordSets = recordSets.concat(response.ResourceRecordSets);
  isTruncated = response.IsTruncated;
  if (isTruncated) {
    nextRecordName = response.NextRecordName;
    nextRecordType = response.NextRecordType;
  }
}

const ipCounts = recordSets.reduce((acc, recordSet) => {
  if (recordSet.Type === 'A') {
    recordSet.ResourceRecords.forEach(record => {
      if (!acc[record.Value]) {
        acc[record.Value] = { count: 0, records: [] };
      }
      acc[record.Value].count += 1;
      acc[record.Value].records.push(recordSet);
    });
  }
  return acc;
}, {});

const sortedIPCounts = Object.entries(ipCounts).sort((a, b) => b[1].count - a[1].count);

for (const [ip, data] of sortedIPCounts) {
  if (data.count > 1) {
    console.log(`Processing IP: ${ip}`);
    console.log(`Entries to be deleted: ${data.count}`);
    const changes = data.records.map(recordSet => ({
      Action: "DELETE",
      ResourceRecordSet: {
        Name: recordSet.Name,
        ResourceRecords: [
          {
            Value: ip
          }
        ],
        TTL: recordSet.TTL,
        Type: recordSet.Type
      }
    }));

    for (let i = 0; i < changes.length; i += MAX_CHANGES) {
      console.log(`Processing batch number: ${i / MAX_CHANGES + 1}`);
      const batchChanges = changes.slice(i, i + MAX_CHANGES);
      const input = {
        ChangeBatch: {
          Changes: batchChanges
        },
        HostedZoneId: ZONE_ID,
      };

      const command = new ChangeResourceRecordSetsCommand(input);
      await client.send(command);
    }
  }
}
