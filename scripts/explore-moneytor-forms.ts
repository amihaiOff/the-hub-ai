// One-off exploratory script: query the Moneytor /assets endpoint and print
// what forms are returned (besides the three we already handle: share/bank/debt)
// so we can decide how to support pension + hishtalmut. Run with:
//   npx tsx --env-file=.env.local scripts/explore-moneytor-forms.ts

import { fetchMoneytorAssets } from '../lib/api/moneytor';

async function main() {
  const assets = await fetchMoneytorAssets();
  console.log(`Total assets: ${assets.length}\n`);

  const byForm = new Map<string, typeof assets>();
  for (const a of assets) {
    const list = byForm.get(a.form) ?? [];
    list.push(a);
    byForm.set(a.form, list);
  }

  console.log('Form counts:');
  for (const [form, list] of byForm) {
    console.log(`  ${form}: ${list.length}`);
  }
  console.log();

  const handled = new Set(['share', 'bank', 'debt']);
  for (const [form, list] of byForm) {
    if (handled.has(form)) continue;
    console.log(`=== form="${form}" — summary of ${list.length} records ===`);
    for (const a of list) {
      type AnyVal = unknown;
      const r = a as Record<string, AnyVal>;
      const getVal = (obj: AnyVal): string => {
        if (obj && typeof obj === 'object' && 'value' in (obj as Record<string, AnyVal>)) {
          return String((obj as Record<string, AnyVal>).value);
        }
        return String(obj);
      };
      console.log(
        `  ${r.name} | productType=${getVal(r.productType)} | sugKupa=${r.sugKupa ?? '-'} | balance=${r.balanceInBaseCurrency} | route=${getVal(r.route)}`
      );
    }
    console.log();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
