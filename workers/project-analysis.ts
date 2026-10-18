import { db } from "@/lib/db";
import { claimProjectAnalysisJob, executeProjectAnalysisJob, recoverProjectAnalysisJobs } from "@/services/projects/project-analysis";

let stopping = false;
process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });

async function main() {
  await db.$connect();
  console.info("Project analysis consumer ready");
  let nextRecovery = 0;
  while (!stopping) {
    try {
      if (Date.now() >= nextRecovery) {
        await recoverProjectAnalysisJobs();
        nextRecovery = Date.now() + 30_000;
      }
      const job = await claimProjectAnalysisJob();
      if (job) await executeProjectAnalysisJob(job);
      else await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch {
      // Never log database URLs, query parameters or external provider responses.
      console.error("Project analysis consumer cycle failed");
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

main().catch(() => {
  console.error("Project analysis consumer startup failed");
  process.exitCode = 1;
}).finally(() => db.$disconnect());
