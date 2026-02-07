import {
  type PowerSyncBackendConnector,
  type AbstractPowerSyncDatabase,
  UpdateType,
} from '@powersync/common';
import { supabase } from './supabase';

// PowerSync Cloud URL - set via env var
const POWERSYNC_URL = process.env.EXPO_PUBLIC_POWERSYNC_URL ?? '';

export class SupabasePowerSyncConnector implements PowerSyncBackendConnector {
  async fetchCredentials() {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.access_token) {
      throw new Error('No Supabase session found');
    }

    return {
      endpoint: POWERSYNC_URL,
      token: session.access_token,
    };
  }

  async uploadData(database: AbstractPowerSyncDatabase) {
    const transaction = await database.getNextCrudTransaction();
    if (!transaction) return;

    try {
      for (const op of transaction.crud) {
        const { table, opData, op: opType, id } = op;

        switch (opType) {
          case UpdateType.PUT:
            await supabase.from(table).upsert({ id, ...opData });
            break;
          case UpdateType.PATCH:
            await supabase.from(table).update(opData).eq('id', id);
            break;
          case UpdateType.DELETE:
            await supabase.from(table).delete().eq('id', id);
            break;
        }
      }

      await transaction.complete();
    } catch (error) {
      console.error('PowerSync upload error:', error);
      throw error;
    }
  }
}
