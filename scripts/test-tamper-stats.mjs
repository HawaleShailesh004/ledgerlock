import {
  tamperSummary,
  tamperGaugeDisplay,
  tamperBannerBody,
  verifyGaugeLabel,
} from "../lib/tamper-stats.js";

let failed = 0;

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    failed += 1;
  }
}

const early = tamperSummary(1, 100_000);
assert(early?.tamperedCount === 1, "tampered count");
assert(early?.invalidated === 99_998, "invalidated downstream of seq 1");
assert(early?.intactBefore === 1, "intact before seq 1");
assert(early?.intactPct === 0, "intact pct rounds to 0");

const earlyGauge = tamperGaugeDisplay(early);
assert(earlyGauge.value === "#0001", "early breach gauge shows seq label");
assert(earlyGauge.label === "breach at", "early breach gauge label");

const mid = tamperSummary(6, 39);
assert(mid?.invalidated === 32, "acme-style breach invalidated count");
const midGauge = tamperGaugeDisplay(mid);
assert(midGauge.value === "15%", "mid breach shows intact pct");
assert(midGauge.label === "before breach", "mid breach label");

assert(
  tamperBannerBody(early).includes("99,998 downstream invalidated"),
  "banner mentions invalidated count",
);
assert(
  tamperBannerBody(early).includes("Chain broken"),
  "banner explains chain broken",
);

assert(verifyGaugeLabel("loading") === "Loading", "short verify label");
assert(verifyGaugeLabel("walk") === "Recompute", "short verify label walk");
assert(
  verifyGaugeLabel("Loading chain from DynamoDB") === "Scanning",
  "unknown phase falls back",
);

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("OK: tamper-stats UI helpers");
