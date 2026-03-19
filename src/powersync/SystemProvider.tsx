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
        dbFilename: 'app2.db'
    }),
});

export const connector = new SupabaseConnector();

const logger = createBaseLogger();
logger.useDefaults();
logger.setLevel(LogLevel.DEBUG);

export const SystemProvider = ({ children }: PropsWithChildren) => {
    const [initialized, setInitialized] = useState(false);

    useEffect(() => {
        async function init() {
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