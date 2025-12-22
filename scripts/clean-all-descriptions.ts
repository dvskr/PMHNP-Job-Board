import 'dotenv/config';
import { cleanAllJobDescriptions } from '../lib/description-cleaner';

async function main() {
  console.log('🧹 Starting description cleanup...\n');
  
  const result = await cleanAllJobDescriptions();
  
  console.log('\n✨ Cleanup complete!');
  console.log(`  ✅ Cleaned: ${result.cleaned} jobs`);
  console.log(`  ⏭️  Skipped: ${result.skipped} jobs (already clean)`);
  console.log(`  ❌ Errors: ${result.errors} jobs`);
}

main()
  .catch((e) => {
    console.error('Fatal error:', e);
    process.exit(1);
  });
