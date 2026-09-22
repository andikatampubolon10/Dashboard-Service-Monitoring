const { query, dbType } = require('../src/database/db');

async function getServerUptimeHistoryFromDb(serverId, rangeSec = 3600, targetPoints = 30) {
  const isMysql = dbType === 'mysql';
  const bucketSec = Math.max(15, Math.floor(rangeSec / targetPoints));

  let sql = '';
  let params = [];

  if (isMysql) {
    sql = `
      SELECT
        FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(recorded_at) / ${bucketSec}) * ${bucketSec}) AS time_bucket,
        COUNT(*) AS pings
      FROM server_metrics
      WHERE server_id = ? AND recorded_at >= DATE_SUB(NOW(), INTERVAL ${rangeSec} SECOND)
      GROUP BY time_bucket
      ORDER BY time_bucket ASC
    `;
    params = [serverId];
  } else {
    sql = `
      SELECT
        to_timestamp(floor(extract(epoch from recorded_at) / ${bucketSec}) * ${bucketSec}) AT TIME ZONE 'UTC' AS time_bucket,
        COUNT(*) AS pings
      FROM server_metrics
      WHERE server_id = $1 AND recorded_at >= NOW() - INTERVAL '${rangeSec} seconds'
      GROUP BY time_bucket
      ORDER BY time_bucket ASC
    `;
    params = [serverId];
  }

  const res = await query(sql, params);
  return (res.rows || []).map((r) => {
    const d = new Date(r.time_bucket);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return {
      timestamp: d.toISOString(),
      time: `${hh}:${mm}`,
      displayTime: `${hh}:${mm}`,
      status: 'UP',
      value: 1,
      latencyMs: 25,
      details: `Host menyala (TCP Probe OK, ${r.pings} snapshot)`,
    };
  });
}

async function test() {
  console.log('Testing 1h (3600s):');
  const h1 = await getServerUptimeHistoryFromDb('server-node-34-101-207-115', 3600, 30);
  console.log('1h points:', h1.length, 'first:', h1[0]?.time, 'last:', h1[h1.length - 1]?.time);

  console.log('\nTesting 6h (21600s):');
  const h6 = await getServerUptimeHistoryFromDb('server-node-34-101-207-115', 21600, 36);
  console.log('6h points:', h6.length, 'first:', h6[0]?.time, 'last:', h6[h6.length - 1]?.time);
  process.exit(0);
}

test();
