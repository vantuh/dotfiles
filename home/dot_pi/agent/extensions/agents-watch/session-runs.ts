import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

/**
 * pi-subagents publishes an in-process RPC but exports no client for it, so this
 * speaks the documented event-bus protocol directly. Its `status` reply carries
 * `data.asyncSnapshot`, which the owner builds from `state.currentSessionId` and
 * `job.sessionId` — the only authoritative answer to "which runs are mine". It
 * also survives session resume, where the `status.json` session path does not.
 */

const REQUEST_EVENT = 'subagents:rpc:v1:request';
const REPLY_PREFIX = 'subagents:rpc:v1:reply:';
const TIMEOUT_MS = 3_000;

export type SnapshotState =
  | 'queued'
  | 'running'
  | 'complete'
  | 'failed'
  | 'partial'
  | 'paused'
  | 'stopped'
  | 'rejected';

export interface ScopedRun {
  id: string;
  label: string;
  state: SnapshotState;
  startedAt?: number;
  activity?: {
    state?: string;
    currentTool?: string;
    turnCount?: number;
    toolCount?: number;
  };
  children?: ScopedRun[];
}

interface RpcReply {
  success?: boolean;
  data?: { asyncSnapshot?: { runs?: ScopedRun[] } };
}

function collectAgents(run: ScopedRun): string[] {
  const names = [run.label, ...(run.children ?? []).flatMap(collectAgents)];
  return [...new Set(names.filter(Boolean))];
}

function awaitReply(
  bus: ExtensionAPI['events'],
  requestId: string,
): Promise<RpcReply | undefined> {
  return new Promise((resolve) => {
    const event = `${REPLY_PREFIX}${requestId}`;
    const timer = setTimeout(() => {
      bus.off(event, onReply);
      resolve(undefined);
    }, TIMEOUT_MS);
    timer.unref?.();
    const onReply = (reply: RpcReply): void => {
      clearTimeout(timer);
      bus.off(event, onReply);
      resolve(reply);
    };
    bus.on(event, onReply);
  });
}


/**
 * Active runs owned by the calling session, or undefined when the owner is
 * absent. pi-subagents announces itself at extension init, well before a
 * command can run, so a single attempt is enough.
 */
export async function fetchSessionRuns(pi: ExtensionAPI): Promise<ScopedRun[] | undefined> {
  const requestId = crypto.randomUUID();
  const pending = awaitReply(pi.events, requestId);
  pi.events.emit(REQUEST_EVENT, { version: 1, requestId, method: 'status', params: {} });
  const reply = await pending;
  if (!reply?.success) return undefined;

  return (reply.data?.asyncSnapshot?.runs ?? [])
    .filter((run) => run.state === 'running' || run.state === 'queued')
    .map((run) => ({ ...run, label: collectAgents(run).join(',') || run.label }));
}
