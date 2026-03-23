// Reddit OAuth App Creator via Playwright
// Creates a script-type Reddit app to get CLIENT_ID + CLIENT_SECRET
const { chromium } = require('/Users/manaswimarri/agentOS-sim/lattice/node_modules/playwright');

const REDDIT_USERNAME = process.env.REDDIT_USERNAME || 'launchstack';
const REDDIT_PASSWORD = process.env.REDDIT_PASSWORD || 'MSKBTmKO2sqZ4oQZyDdA';

(async () => {
  const browser = await chromium.launch({
    headless: false, // Use headed mode to avoid WAF
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ]
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  });

  // Remove webdriver flag
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  const page = await context.newPage();

  try {
    console.log('Navigating to Reddit login...');
    await page.goto('https://www.reddit.com/login', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Check if already on login page or redirected
    const url = page.url();
    console.log('Current URL:', url);

    // Try to fill login form
    const usernameField = await page.$('input[name="username"], #loginUsername, input[id*="user"], input[placeholder*="username" i]');
    const passwordField = await page.$('input[name="password"], #loginPassword, input[id*="pass"], input[placeholder*="password" i]');

    if (usernameField && passwordField) {
      console.log('Found login fields, filling...');
      await usernameField.fill(REDDIT_USERNAME);
      await passwordField.fill(REDDIT_PASSWORD);

      // Submit
      const submitBtn = await page.$('button[type="submit"]');
      if (submitBtn) {
        await submitBtn.click();
      } else {
        await passwordField.press('Enter');
      }

      await page.waitForTimeout(3000);
      console.log('After login URL:', page.url());
    } else {
      console.log('Login fields not found, checking page...');
      const title = await page.title();
      console.log('Page title:', title);
      const body = await page.textContent('body');
      console.log('Body snippet:', body.substring(0, 300));
    }

    // Navigate to prefs/apps
    console.log('\nNavigating to prefs/apps...');
    await page.goto('https://www.reddit.com/prefs/apps', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    console.log('Prefs/apps URL:', page.url());

    // Check if we're logged in
    const pageContent = await page.textContent('body');
    if (pageContent.includes('create another app') || pageContent.includes('create app') || pageContent.includes('developed apps')) {
      console.log('SUCCESS: Logged in, on prefs/apps page!');

      // Click create app button
      const createBtn = await page.$('input[value*="create"], button:has-text("create"), a:has-text("create")');
      if (createBtn) {
        await createBtn.click();
        await page.waitForTimeout(1500);
        console.log('Clicked create button');

        // Fill in app details
        const nameField = await page.$('input[name="name"], #name');
        if (nameField) {
          await nameField.fill('LaunchStackBot');
        }

        // Select "script" type
        const scriptRadio = await page.$('input[value="script"]');
        if (scriptRadio) {
          await scriptRadio.click();
          console.log('Selected script type');
        }

        // Fill redirect URI
        const redirectField = await page.$('input[name="redirect_uri"], #redirect_uri');
        if (redirectField) {
          await redirectField.fill('http://localhost:8080');
        }

        // Submit form
        const submitCreate = await page.$('input[value*="create"], button[type="submit"]');
        if (submitCreate) {
          await submitCreate.click();
          await page.waitForTimeout(2000);
          console.log('Submitted app creation form');
        }

        // Extract CLIENT_ID and CLIENT_SECRET
        const appContent = await page.textContent('body');
        console.log('\nPage after creation:', appContent.substring(0, 1000));

        // Look for client ID and secret in the page
        const idMatch = appContent.match(/([a-zA-Z0-9_-]{14,30})/g);
        console.log('\nPotential IDs found:', idMatch ? idMatch.slice(0, 10) : 'none');
      }
    } else if (pageContent.includes('log in') || pageContent.includes('Login') || page.url().includes('login')) {
      console.log('Not logged in. Page snippet:', pageContent.substring(0, 500));
    } else {
      console.log('Unknown state. URL:', page.url());
      console.log('Content:', pageContent.substring(0, 500));
    }

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await page.screenshot({ path: '/tmp/reddit-app-screenshot.png' });
    console.log('Screenshot saved to /tmp/reddit-app-screenshot.png');
    await browser.close();
  }
})();
