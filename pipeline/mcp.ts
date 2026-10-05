// Minimal MCP client for the NSE servers (Streamable HTTP, no auth).
// The servers do not send CORS headers for third-party origins, so this only runs server-side.

export const NSE_HISTORY = 'https://mcp.nseindia.in/bhavcopy/cm/mcp'
export const NSE_LIVE = 'https://mcp.nseindia.in/cmmkt/mcp'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// NSE's edge answers 403 once a client has sent too much too quickly (about a thousand
// calls in ninety seconds did it). That is the server saying stop, so we stop: no retry,
// and every later call fails fast until the next run.
export class BlockedError extends Error {
  constructor() {
    super('NSE is refusing requests (HTTP 403). Stopping; try again later at a lower rate.')
  }
}

export class McpClient {
  private session: string | null = null
  private starting: Promise<void> | null = null
  private id = 1
  private nextSlot = 0
  calls = 0
  blocked = false

  // `minGapMs` spaces out request starts across all concurrent callers.
  constructor(private url: string, private minGapMs = 500) {}

  private async post(body: unknown, withSession = true): Promise<Response> {
    if (this.blocked) throw new BlockedError()
    const now = Date.now()
    const at = Math.max(now, this.nextSlot)
    this.nextSlot = at + this.minGapMs
    if (at > now) await sleep(at - now)
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    }
    if (withSession && this.session) headers['Mcp-Session-Id'] = this.session
    return fetch(this.url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(45_000) })
  }

  private async parse(res: Response): Promise<any> {
    const text = await res.text()
    if (res.status === 403) {
      this.blocked = true
      throw new BlockedError()
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`)
    if ((res.headers.get('content-type') ?? '').includes('text/event-stream')) {
      const data = text.split('\n').filter((l) => l.startsWith('data:')).pop()
      if (!data) throw new Error('Empty event stream')
      return JSON.parse(data.slice(5))
    }
    return JSON.parse(text)
  }

  private async start(): Promise<void> {
    const res = await this.post(
      {
        jsonrpc: '2.0',
        id: this.id++,
        method: 'initialize',
        params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'pigeonai', version: '0.1' } },
      },
      false,
    )
    await this.parse(res)
    this.session = res.headers.get('mcp-session-id')
    await (await this.post({ jsonrpc: '2.0', method: 'notifications/initialized' })).text()
  }

  private ensure(): Promise<void> {
    if (!this.starting) this.starting = this.start()
    return this.starting
  }

  // Calls a tool and returns its JSON payload. Retries transient failures with backoff
  // and opens a fresh session if the server has dropped ours.
  async call<T = any>(name: string, args: Record<string, unknown>): Promise<T> {
    let lastErr: unknown
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await this.ensure()
        this.calls++
        const res = await this.post({ jsonrpc: '2.0', id: this.id++, method: 'tools/call', params: { name, arguments: args } })
        const msg = await this.parse(res)
        if (msg.error) throw new Error(msg.error.message ?? JSON.stringify(msg.error))
        const text = msg.result?.content?.[0]?.text
        if (typeof text !== 'string') throw new Error('No content in tool result')
        return JSON.parse(text) as T
      } catch (err) {
        if (err instanceof BlockedError) throw err
        lastErr = err
        this.session = null
        this.starting = null
        await sleep(800 * 2 ** attempt)
      }
    }
    throw lastErr
  }
}

// Runs `fn` over `items` with a fixed number of workers.
export async function pool<T>(items: T[], workers: number, fn: (item: T, index: number) => Promise<void>) {
  let next = 0
  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (next < items.length) {
        const i = next++
        await fn(items[i], i)
      }
    }),
  )
}
