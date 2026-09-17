import process from "node:process";
import { computeOpinionLandscape } from "../../shared/opinion-analysis.mjs";

let input = "";
for await (const chunk of process.stdin) input += chunk;

try {
  const request = JSON.parse(input);
  process.stdout.write(JSON.stringify(computeOpinionLandscape(request.source)));
} catch (error) {
  process.stderr.write(String(error?.stack || error));
  process.exitCode = 1;
}
