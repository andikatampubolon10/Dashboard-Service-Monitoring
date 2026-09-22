const axios = require('axios');

async function test() {
  const hosts = ['34.101.207.115', '34.101.122.171'];
  for (const host of hosts) {
    try {
      const res = await axios.get(`http://${host}:9100/metrics`, { timeout: 4000 });
      console.log(`=== HOST ${host} ===`);
      const lines = res.data.split('\n');
      const sample = lines.filter(l => 
        l.startsWith('node_load') || 
        (l.startsWith('node_network_receive_bytes_total') && !l.includes('lo')) ||
        (l.startsWith('node_network_transmit_bytes_total') && !l.includes('lo')) ||
        l.startsWith('node_disk_read_bytes_total') ||
        l.startsWith('node_disk_written_bytes_total') ||
        l.startsWith('node_memory_Cached_bytes') ||
        l.startsWith('node_memory_Buffers_bytes')
      );
      console.log(sample.slice(0, 15).join('\n'));
    } catch (e) {
      console.error(`Failed to scrape ${host}:`, e.message);
    }
  }
}
test();
