export class ConcurrencyLimiter {
	private queue: Array<{
		task: () => Promise<any>;
		resolve: (value: any) => void;
		reject: (reason?: any) => void;
	}> = [];
	private runningTasks = 0;
	private maxConcurrency: number;

	constructor(maxConcurrency: number) {
		this.maxConcurrency = maxConcurrency;
	}

	async enqueue<T>(task: () => Promise<T>): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			this.queue.push({ task, resolve, reject });
			this.processQueue();
		});
	}

	setMaxConcurrency(max: number): void {
		this.maxConcurrency = max;
		this.processQueue();
	}

	private processQueue() {
		if (this.runningTasks < this.maxConcurrency && this.queue.length > 0) {
			const { task, resolve, reject } = this.queue.shift()!;
			this.runningTasks++;

			Promise.resolve().then(async () => {
				try {
					const result = await task();
					resolve(result);
				} catch (error) {
					reject(error);
				} finally {
					this.runningTasks--;
					this.processQueue();
				}
			});
		}
	}
}
