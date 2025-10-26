/**
 * Wraps a jayson RPC client request with a timeout using Promise.race
 * @param client - The jayson client instance
 * @param method - The RPC method name
 * @param params - The RPC method parameters
 * @param timeoutMs - Timeout in milliseconds (default: 30000ms)
 * @returns Promise that resolves with the RPC response or rejects on timeout
 */
export async function requestWithTimeout(
	client: any,
	method: string,
	params: any[],
	timeoutMs = 30_000,
): Promise<any> {
	return Promise.race([
		client.request(method, params),
		new Promise((_, reject) =>
			setTimeout(
				() => reject(new Error(`RPC request timeout: ${method}`)),
				timeoutMs,
			),
		),
	]);
}
