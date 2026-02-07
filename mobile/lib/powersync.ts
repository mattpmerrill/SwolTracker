import '@powersync/react-native';
import { PowerSyncDatabase } from '@powersync/react-native';
import { powersyncSchema } from './powersync-schema';
import { SupabasePowerSyncConnector } from './powersync-connector';

let powerSyncInstance: PowerSyncDatabase | null = null;

export function getPowerSync(): PowerSyncDatabase {
  if (!powerSyncInstance) {
    powerSyncInstance = new PowerSyncDatabase({
      schema: powersyncSchema,
      database: {
        dbFilename: 'swoltracker.db',
      },
    });
  }
  return powerSyncInstance;
}

export async function initPowerSync(): Promise<PowerSyncDatabase> {
  const db = getPowerSync();
  const connector = new SupabasePowerSyncConnector();

  try {
    await db.init();
    await db.connect(connector);
    console.log('PowerSync initialized and connected');
  } catch (error) {
    console.warn('PowerSync connection failed, running in local-only mode:', error);
    // App still works with local SQLite even if sync fails
    await db.init();
  }

  return db;
}

export async function disconnectPowerSync() {
  if (powerSyncInstance) {
    await powerSyncInstance.disconnect();
  }
}
