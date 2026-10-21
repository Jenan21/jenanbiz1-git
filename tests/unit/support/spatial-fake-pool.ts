import { QUERIES, type QueryName } from "@/services/analysis-engines/spatial/adapters/queries";
import type { SessionClient, SessionPool } from "@/services/analysis-engines/spatial/adapters/read-only-session";

export interface RecordedCall { text: string; values: unknown[] | undefined }
type Answer = unknown[] | Error;
/** What a statement answers: fixed rows, an error, or a function of the parameters. */
export type Script = Partial<Record<QueryName, Answer | ((values: unknown[] | undefined) => Answer)>>;

const nameOf = new Map<string, QueryName>((Object.entries(QUERIES) as Array<[QueryName, string]>).map(([name, text]) => [text, name]));

/** An error shaped like the ones node-postgres raises for a server-reported problem. */
export function pgError(code: string, message = "driver text naming host=db.internal.example user=jenan_reader"): Error {
  return Object.assign(new Error(message), { code });
}

/** A pool that records what is sent to it and answers from a script, so the adapter's behaviour can be tested without a database. */
export class FakePool implements SessionPool {
  readonly calls: RecordedCall[] = [];
  /** One entry per released connection: whether it was destroyed instead of being returned to the pool. */
  readonly released: boolean[] = [];
  connects = 0;
  ended = 0;
  connectError: unknown = null;
  /** Answers for text that is not one of the fixed queries (the opening batch, ROLLBACK). */
  onOther: (text: string) => Answer | undefined = () => undefined;

  constructor(private readonly script: Script = {}) {}

  async connect(): Promise<SessionClient> {
    if (this.connectError !== null) throw this.connectError;
    this.connects += 1;
    return {
      query: async (text, values) => {
        this.calls.push({ text, values });
        const name = nameOf.get(text);
        const scripted = name === undefined ? this.onOther(text) : this.script[name];
        const answer = typeof scripted === "function" ? scripted(values) : scripted;
        if (answer instanceof Error) throw answer;
        return { rows: answer ?? [] };
      },
      release: (destroy) => { this.released.push(destroy === true); },
    };
  }

  async end(): Promise<void> {
    this.ended += 1;
  }

  /** The fixed queries that were sent, in order. */
  queriesSent(): QueryName[] {
    return this.calls.flatMap((call) => { const name = nameOf.get(call.text); return name === undefined ? [] : [name]; });
  }
  callsOf(name: QueryName): RecordedCall[] {
    return this.calls.filter((call) => call.text === QUERIES[name]);
  }
}

export const readerConfig = { connectionString: "postgresql://reader:secret-password@db.internal.example:5432/jenan" } as const;
