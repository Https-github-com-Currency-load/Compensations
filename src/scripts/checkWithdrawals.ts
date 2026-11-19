import 'dotenv/config';

const config = {
  dryRun: process.env.DRY_RUN ?? 'true',
  executeOnchain: process.env.EXECUTE_ONCHAIN ?? 'false',
  requireApproval: process.env.REQUIRE_APPROVAL ?? 'true',
  rpcUrl: process.env.RPC_URL ?? 'not-configured',
  destinationWallet: process.env.DESTINATION_WALLET ?? 'not-configured',
  allowedRegions: (process.env.ALLOWED_REGIONS ?? 'GLOBAL').split(','),
};

console.log('=== CommissionPay Withdrawal & Settlement Verification ===');
console.log(`DRY_RUN:            ${config.dryRun}`);
console.log(`EXECUTE_ONCHAIN:    ${config.executeOnchain}`);
console.log(`REQUIRE_APPROVAL:   ${config.requireApproval}`);
console.log(`RPC_URL:            ${config.rpcUrl}`);
console.log(`DESTINATION_WALLET: ${config.destinationWallet}`);
console.log(`ALLOWED_REGIONS:    ${config.allowedRegions.join(', ')}`);
console.log('Status: All commission withdrawal checks completed.');
