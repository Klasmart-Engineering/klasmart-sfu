export type Task = {():Promise<unknown>}

export class SemaphoreQueue {
    public static createWithTimeoutProcessor = (
        timeoutMs = 100,
    ) => new SemaphoreQueue(
        queue => processQueueTimeout(queue, timeoutMs),
    );

    public process (task: Task) {
        this.queue.push(task);
        this.processQueue();
    }

    private queue: Task[] = [];
    public constructor(
        private processor: {(queue: SemaphoreQueue["queue"]): Promise<unknown>} = processQueue
    ) {}

    private processorCount = 0;
    private async processQueue(concurrency = 1) {
        if(this.processorCount >= concurrency) { return; }
        try {
            this.processorCount++;
            await this.processor(this.queue);
        } finally {
            this.processorCount--;
        }
    }
}

async function processQueue(queue: SemaphoreQueue["queue"]) {
    let promise: Task | undefined;
    // eslint-disable-next-line no-cond-assign
    while(promise = queue.shift()) {
        try { await promise(); } catch(e) { console.error(e); }
    }
}

async function processQueueTimeout(queue: SemaphoreQueue["queue"], timeoutMs: number) {
    let task: Task | undefined;
    // eslint-disable-next-line no-cond-assign
    while(task = queue.shift()) {
        try {
            let completed = false;
            await Promise.any([
                new Promise<void>((resolve, reject) =>
                    setTimeout(
                        () => completed ? resolve() : reject(`Warning: Task did not complete within ${timeoutMs}ms`),
                        timeoutMs
                    )
                ),
                task().finally(() => completed = true),
            ]);
        } catch(e) { console.error(e); }
    }
}