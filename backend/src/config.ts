import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

export interface ServerConfig {
  port: number;
  allowedOrigins: string[];
}

// Default config
const defaultConfig: ServerConfig = {
  port: 3001,
  allowedOrigins: ['http://localhost:3101']
};

function loadConfig(): ServerConfig {
  let finalConfig = { ...defaultConfig };

  try {
    // Assuming process.cwd() is the 'backend' root directory
    const configPath = path.join(process.cwd(), 'config', 'server-config.json');
    if (fs.existsSync(configPath)) {
      const fileContent = fs.readFileSync(configPath, 'utf-8');
      const loadedConfig = JSON.parse(fileContent);
      finalConfig = { ...finalConfig, ...loadedConfig };
    }
  } catch (error) {
    console.warn('Failed to load config file, using defaults.', error);
  }

  // Environment variables override everything
  if (process.env.PORT) {
    finalConfig.port = parseInt(process.env.PORT, 10);
  }
  if (process.env.ALLOWED_ORIGINS) {
    finalConfig.allowedOrigins = process.env.ALLOWED_ORIGINS.split(',');
  }

  return finalConfig;
}

export const config = loadConfig();
