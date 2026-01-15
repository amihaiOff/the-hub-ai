import { chromium } from 'playwright';

async function saveAuthState() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Navigate to the sign-in page
  await page.goto('https://the-hub-ai-git-develop-amihaios-projects.vercel.app/handler/sign-in');

  console.log('\n========================================');
  console.log('Please sign in manually in the browser.');
  console.log('After signing in and seeing the dashboard,');
  console.log('press Enter in this terminal to save the auth state.');
  console.log('========================================\n');

  // Wait for user to press Enter
  await new Promise<void>((resolve) => {
    process.stdin.once('data', () => resolve());
  });

  // Save the storage state (cookies, localStorage)
  await context.storageState({ path: '.playwright-auth.json' });
  console.log('\nAuth state saved to .playwright-auth.json');

  await browser.close();
}

saveAuthState().catch(console.error);
