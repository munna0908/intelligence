/**
 * Application configuration loaded from environment variables
 * Uses dotenv-flow for multi-environment support
 */

import dotenvFlow from 'dotenv-flow';
import path from 'path';

// Load environment files from env/ directory
dotenvFlow.config({
  path: path.resolve(process.cwd(), 'env'),
  node_env: process.env['NODE_ENV'] || 'local',
});

export interface Config {
  server: {
    port: number;
    host: string;
    nodeEnv: 'local' | 'development' | 'production' | 'test';
  };
  moi: {
    networkUrl: string;
    networkId: string;
    useMockAdapter: boolean;
    intelligenceLogicId: string;
    /** Only used by deployment scripts, not by the service (service has no wallet) */
    mnemonic?: string;
  };
  logging: {
    level: string;
  };
  writeRequest: {
    ttlSeconds: number;
  };
}

function getEnvString(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (value !== undefined) return value;
  if (defaultValue !== undefined) return defaultValue;
  throw new Error(`Missing required environment variable: ${key}`);
}

function getEnvNumber(key: string, defaultValue?: number): number {
  const value = process.env[key];
  if (value !== undefined) {
    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) throw new Error(`Invalid number for ${key}: ${value}`);
    return parsed;
  }
  if (defaultValue !== undefined) return defaultValue;
  throw new Error(`Missing required environment variable: ${key}`);
}

function getEnvBoolean(key: string, defaultValue?: boolean): boolean {
  const value = process.env[key];
  if (value !== undefined) {
    return value.toLowerCase() === 'true';
  }
  if (defaultValue !== undefined) return defaultValue;
  throw new Error(`Missing required environment variable: ${key}`);
}

export function loadConfig(): Config {
  return {
    server: {
      port: getEnvNumber('PORT', 3000),
      host: getEnvString('HOST', '0.0.0.0'),
      nodeEnv: getEnvString('NODE_ENV', 'local') as Config['server']['nodeEnv'],
    },
    moi: {
      networkUrl: getEnvString('MOI_NETWORK_URL', 'https://dev.voyage-rpc.moi.technology/devnet'),
      networkId: getEnvString('MOI_NETWORK_ID', 'devnet'),
      useMockAdapter: getEnvBoolean('USE_MOCK_ADAPTER', true),
      intelligenceLogicId: getEnvString('MOI_INTELLIGENCE_LOGIC_ID', ''),
      mnemonic: getEnvString('MOI_MNEMONIC', ''),
    },
    logging: {
      level: getEnvString('LOG_LEVEL', 'info'),
    },
    writeRequest: {
      ttlSeconds: getEnvNumber('WRITE_REQUEST_TTL_SECONDS', 600),
    },
  };
}

// Singleton config instance
let configInstance: Config | null = null;

export function getConfig(): Config {
  if (!configInstance) {
    configInstance = loadConfig();
  }
  return configInstance;
}

export function resetConfig(): void {
  configInstance = null;
}
