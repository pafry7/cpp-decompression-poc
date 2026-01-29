import { SupabaseConnector } from './SupabaseConnector';
import { OPSqliteOpenFactory } from '@powersync/op-sqlite';
import { createBaseLogger, LogLevel, PowerSyncContext, PowerSyncDatabase, SyncClientImplementation } from '@powersync/react-native';
import { AppSchema } from './AppSchema';

import React, { PropsWithChildren, useEffect, useState } from 'react';

const SupabaseContext = React.createContext<SupabaseConnector | null>(null);
export const useSupabase = () => React.useContext(SupabaseContext);

export const powerSync = new PowerSyncDatabase({
    schema: AppSchema,
    database: new OPSqliteOpenFactory({
        dbFilename: 'app.db'
    }),
});

export const connector = new SupabaseConnector();

const logger = createBaseLogger();
logger.useDefaults();
logger.setLevel(LogLevel.DEBUG);

async function createTables() {
    await powerSync.execute(`
        CREATE TABLE IF NOT EXISTS thoughts (
            id TEXT NOT NULL PRIMARY KEY,
            content TEXT,
            created_at TEXT,
            created_by TEXT
        ) STRICT;
    `);

    await powerSync.execute(`
        CREATE TABLE IF NOT EXISTS reactions (
            id TEXT NOT NULL PRIMARY KEY,
            thought_id TEXT,
            user_id TEXT,
            emoji TEXT,
            created_at TEXT
        ) STRICT;
    `);

    await powerSync.execute(`
        CREATE INDEX IF NOT EXISTS idx_reactions_thought ON reactions(thought_id);
    `);
}

export const SystemProvider = ({ children }: PropsWithChildren) => {
    const [initialized, setInitialized] = useState(false);

    useEffect(() => {
        async function init() {
            await createTables();
            await powerSync.connect(connector, {clientImplementation: SyncClientImplementation.RUST});

            // Debug: log sync status
            const status = powerSync.currentStatus;
            console.log('Sync status:', JSON.stringify(status, null, 2));

            // Debug: check raw tables in schema
            console.log('Raw tables:', powerSync.schema.rawTables);

            // Debug: query the tables directly
            const thoughts = await powerSync.getAll('SELECT * FROM thoughts');
            console.log('Thoughts in DB:', thoughts);

            setInitialized(true);
        }
        init();
    }, []);

    if (!initialized) {
        return null;
    }

    return (
        <PowerSyncContext.Provider value={powerSync as any}>
            <SupabaseContext.Provider value={connector}>{children}</SupabaseContext.Provider>
        </PowerSyncContext.Provider>
    );
};

export default SystemProvider;