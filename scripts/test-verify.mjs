import { verifyChain } from "../lib/verify.js";
console.log(JSON.stringify(await verifyChain("acme"), null, 2));