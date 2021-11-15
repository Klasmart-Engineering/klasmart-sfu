import newrelic from 'newrelic';

export const withTransaction = async (path: string, f: () => any): Promise<any> => 
    newrelic.startWebTransaction(path, async _handle => 
        f()
    );