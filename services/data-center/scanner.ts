import { createConnection } from "node:net";
import type { DataCenterScanner } from "./contracts";

/** Server-configured ClamAV INSTREAM transport. No upload can supply or override its host. */
export function configuredDataCenterScanner(): DataCenterScanner | undefined {
  const host = process.env.DATA_CENTER_CLAMAV_HOST?.trim();
  const port = Number(process.env.DATA_CENTER_CLAMAV_PORT ?? 3310);
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) return undefined;
  return {
    name: "clamav-instream",
    async scan(bytes) {
      return new Promise((resolve) => {
        let settled = false, response = "";
        const socket = createConnection({ host, port });
        const finish = (verdict: "CLEAN" | "INFECTED" | "UNAVAILABLE") => {
          if (settled) return;
          settled = true; socket.destroy(); resolve(verdict);
        };
        socket.setTimeout(10_000, () => finish("UNAVAILABLE"));
        socket.once("error", () => finish("UNAVAILABLE"));
        socket.once("end", () => finish("UNAVAILABLE"));
        socket.once("close", () => finish("UNAVAILABLE"));
        socket.on("data", (chunk: Buffer) => {
          response += chunk.toString("utf8");
          if (response.length > 4096) return finish("UNAVAILABLE");
          if (!response.includes("\0") && !response.includes("\n")) return;
          if (/^stream: OK[\0\n]/.test(response)) finish("CLEAN");
          else if (/^stream: .+ FOUND[\0\n]/.test(response)) finish("INFECTED");
          else finish("UNAVAILABLE");
        });
        socket.once("connect", () => {
          socket.write("zINSTREAM\0");
          let offset = 0;
          const write = () => {
            while (!settled && offset < bytes.length) {
              const chunk = bytes.subarray(offset, offset + 64 * 1024);
              const size = Buffer.alloc(4); size.writeUInt32BE(chunk.length);
              offset += chunk.length;
              socket.write(size);
              if (!socket.write(chunk)) { socket.once("drain", write); return; }
            }
            if (!settled) socket.write(Buffer.alloc(4));
          };
          write();
        });
      });
    },
  };
}
