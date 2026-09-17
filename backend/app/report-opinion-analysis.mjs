import process from "node:process";
import { computeOpinionLandscape, computeSharedOpinionAnalysis } from "../../shared/opinion-analysis.mjs";

let input = "";
for await (const chunk of process.stdin) input += chunk;

try {
  const request = JSON.parse(input);
  const result = request.includeLive ? computeSharedOpinionAnalysis(request.source) : computeOpinionLandscape(request.source);
  process.stdout.write(JSON.stringify(result));
} catch (error) {
  process.stderr.write(String(error?.stack || error));
  process.exitCode = 1;
}
