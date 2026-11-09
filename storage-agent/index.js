import dotenv from 'dotenv';
import { AgentClient } from './src/agent-client.js';

dotenv.config();

const config = {
  serverUrl: process.env.NKB_SERVER_URL || 'ws://localhost:5000/ws/agent',
  agentToken: process.env.NKB_AGENT_TOKEN || 'nkb_agent_token_primary_2026',
  agentName: process.env.NKB_AGENT_NAME || 'NKB-STORAGE-PC-01',
  agentSecret: process.env.NKB_AGENT_SECRET || process.env.NKB_AGENT_TOKEN || 'nkb_agent_token_primary_2026'
};

console.log('====================================================');
console.log('  NKB CLOUD - WINDOWS STORAGE AGENT');
console.log(`  Agent Name : ${config.agentName}`);
console.log(`  Server URL : ${config.serverUrl}`);
console.log('  Mode       : Outbound HTTPS/WSS (No open inbound ports)');
console.log('====================================================');

const agent = new AgentClient(config);
agent.start();

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[StorageAgent] Shutting down agent gracefully...');
  agent.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[StorageAgent] SIGTERM received. Stopping agent...');
  agent.stop();
  process.exit(0);
});
