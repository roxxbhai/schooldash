/**
 * A RECORDING STAND-IN FOR THE SUPABASE QUERY BUILDER, FOR UNIT TESTS ONLY.
 *
 * EVERY `from(table)` / `rpc(name)` CHAIN IS RECORDED (OPERATION, PAYLOAD,
 * FILTERS, ORDERING) AND ANSWERED FROM RESPONSES QUEUED PER `table.operation`
 * (E.G. 'results.insert', 'classes.select', 'createNotice.rpc'). A QUEUE WITH
 * ONE RESPONSE LEFT KEEPS ANSWERING WITH IT. UNQUEUED READS RETURN NO ROWS.
 * IT NEVER STORES DATA — IT ONLY LETS TESTS CHECK WHAT WOULD BE SENT.
 */

export type Operation = 'select' | 'insert' | 'update' | 'delete' | 'rpc';

export interface FakeResponse {
  data?: unknown;
  error?: { code?: string; message?: string; details?: string | null } | null;
  count?: number | null;
}

export interface RecordedCall {
  table: string;
  operation: Operation;
  payload?: unknown;
  columns?: string;
  filters: [method: string, ...args: unknown[]][];
  orders: string[];
  isSingle: boolean;
}

const FILTER_METHODS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'is', 'or', 'ilike', 'like', 'not', 'match', 'contains'];

export function fakeDb() {
  const calls: RecordedCall[] = [];
  const queues = new Map<string, FakeResponse[]>();

  function respondTo(key: string, ...responses: FakeResponse[]) {
    queues.set(key, [...(queues.get(key) ?? []), ...responses]);
  }

  function nextResponse(call: RecordedCall): FakeResponse {
    const queue = queues.get(`${call.table}.${call.operation}`);
    if (queue && queue.length > 0) return queue.length > 1 ? queue.shift()! : queue[0];
    return { data: call.isSingle || call.operation !== 'select' ? null : [], error: null, count: 0 };
  }

  function resolve(call: RecordedCall) {
    const response = nextResponse(call);
    const data = response.data === undefined ? null : response.data;
    return Promise.resolve({ data, error: response.error ?? null, count: response.count ?? null });
  }

  function builder(call: RecordedCall) {
    const chain: Record<string, unknown> = {
      select(columns?: string) {
        if (call.operation === 'select') call.columns = columns;
        return chain;
      },
      insert(payload: unknown) {
        call.operation = 'insert';
        call.payload = payload;
        return chain;
      },
      update(payload: unknown) {
        call.operation = 'update';
        call.payload = payload;
        return chain;
      },
      delete() {
        call.operation = 'delete';
        return chain;
      },
      order(column: string) {
        call.orders.push(column);
        return chain;
      },
      range() {
        return chain;
      },
      limit() {
        return chain;
      },
      overrideTypes() {
        return chain;
      },
      // LIKE THE REAL BUILDER, THESE STAY CHAINABLE (E.G. `.overrideTypes()`) AND RESOLVE WHEN AWAITED.
      maybeSingle() {
        call.isSingle = true;
        return chain;
      },
      single() {
        call.isSingle = true;
        return chain;
      },
      then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
        return resolve(call).then(onFulfilled, onRejected);
      },
    };
    for (const method of FILTER_METHODS) {
      chain[method] = function recordFilter(...args: unknown[]) {
        call.filters.push([method, ...args]);
        return chain;
      };
    }
    return chain;
  }

  function newCall(table: string, operation: Operation, payload?: unknown): RecordedCall {
    const call: RecordedCall = { table, operation, payload, filters: [], orders: [], isSingle: false };
    calls.push(call);
    return call;
  }

  const client = {
    from(table: string) {
      return builder(newCall(table, 'select'));
    },
    rpc(name: string, args: unknown) {
      return builder(newCall(name, 'rpc', args));
    },
  };

  /** RECORDED CALLS ON A TABLE (OR RPC NAME), OPTIONALLY OF ONE OPERATION. */
  function callsTo(table: string, operation?: Operation): RecordedCall[] {
    return calls.filter((call) => call.table === table && (!operation || call.operation === operation));
  }

  return { client: client as never, calls, callsTo, respondTo };
}
