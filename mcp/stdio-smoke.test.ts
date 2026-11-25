import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type JsonRpcResponse = { id: number; result?: { tools?: { name: string }[] }; error?: unknown };

function frame(message: object): string {
  return `${JSON.stringify(message)}\n`;
}

function readResponse(child: ReturnType<typeof spawn>, id: number): Promise<JsonRpcResponse> {
  return new Promise((resolveResponse, reject) => {
    let buffer = '';
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString();
      while (true) {
        const newline = buffer.indexOf('\n');
        if (newline < 0) return;
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        const response = JSON.parse(line) as JsonRpcResponse;
        if (response.id === id) {
          child.stdout?.off('data', onData);
          resolveResponse(response);
          return;
        }
      }
    };
    child.stdout?.on('data', onData);
    child.once('error', reject);
    child.once('exit', (code) => reject(new Error(`MCP server exited before response (${code})`)));
  });
}

describe('MCP stdio registration smoke check', () => {
  it('starts from the repository root and exposes exactly the four tools', async () => {
    const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const child = spawn(command, ['tsx', 'mcp/server.ts'], {
      cwd: resolve(__dirname, '..'),
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
      env: { ...process.env, NECRO_API_URL: '' },
    });

    try {
      child.stdin?.write(frame({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'stdio-smoke', version: '1.0.0' },
      } }));
      const initialized = await readResponse(child, 1);
      expect(initialized.error).toBeUndefined();

      child.stdin?.write(frame({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }));
      child.stdin?.write(frame({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }));
      const listed = await readResponse(child, 2);
      expect(listed.error).toBeUndefined();
      expect(listed.result?.tools?.map((tool) => tool.name).sort()).toEqual([
        'analyze_repo',
        'get_findings',
        'scan_code',
        'synthesize_patch',
      ]);
    } finally {
      child.kill();
    }
  }, 15_000);
});
