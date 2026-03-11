/**
 * Application configuration loaded from environment variables
 */

export interface Config {
  server: {
    port: number;
    host: string;
    nodeEnv: 'development' | 'production' | 'test';
  };
  moi: {
    networkUrl: string;
    networkId: string;
    useMockAdapter: boolean;
    intelligenceLogicId: string;
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
      nodeEnv: getEnvString('NODE_ENV', 'development') as Config['server']['nodeEnv'],
    },
    moi: {
      networkUrl: getEnvString('MOI_NETWORK_URL', 'https://voyage-rpc.moi.technology/babylon/'),
      networkId: getEnvString('MOI_NETWORK_ID', 'babylon'),
      useMockAdapter: getEnvBoolean('USE_MOCK_ADAPTER', true),
      intelligenceLogicId: getEnvString('MOI_INTELLIGENCE_LOGIC_ID', ''),
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
