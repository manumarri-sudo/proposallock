// Reddit login via Playwright - v2 with better selectors + Chrome profile
const { chromium } = require('/Users/manaswimarri/agentOS-sim/lattice/node_modules/playwright');
const path = require('path');

const REDDIT_USERNAME = 'launchstack';
const REDDIT_PASSWORD = process.env.REDDIT_PASSWORD || 'MSKBTmKO2sqZ4oQZyDdA';

(async () => {
  // Try with existing Chrome user profile first (may already be logged in)
  const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const userDataDir = path.join(process.env.HOME, 'Library/Application Support/Google/Chrome');

  let browser;
  let usedProfile = false;

  try {
    console.log('Trying with existing Chrome profile...');
    browser = await chromium.launchPersistentContext(userDataDir, {
      executablePath: chromePath,
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--profile-directory=Default'
      ]
    });
    usedProfile = true;
  } catch (e) {
    console.log('Chrome profile failed:', e.message, '\nFalling back to fresh Chromium...');
    browser = await chromium.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-blink-features=AutomationControlled']
    });
  }

  let page;
  if (usedProfile) {
    const pages = browser.pages();
    page = pages.length > 0 ? pages[0] : await browser.newPage();
  } else {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });
    page = await context.newPage();
  }

  try {
    // First check if already logged in by going to reddit
    console.log('Checking Reddit login status...');
    await page.goto('https://www.reddit.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    const url = page.url();
    const title = await page.title();
    console.log('URL:', url, '| Title:', title);

    // Check if logged in by looking for username
    const bodyText = await page.evaluate(() => document.body.innerText);
    const isLoggedIn = bodyText.includes(REDDIT_USERNAME) || !bodyText.includes('Log In');
    console.log('Appears logged in:', isLoggedIn);

    if (!isLoggedIn) {
      console.log('Not logged in. Navigating to login...');
      await page.goto('https://www.reddit.com/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000);

      // Try different selectors for the login form
      const selectors = [
        { user: 'input[placeholder="Email or username"]', pass: 'input[placeholder="Password"]' },
        { user: '#login-username', pass: '#login-password' },
        { user: 'input[name="username"]', pass: 'input[name="password"]' },
        { user: 'faceplate-text-input[name="username"] input', pass: 'faceplate-text-input[name="password"] input' },
      ];

      let loginSuccess = false;
      for (const sel of selectors) {
        const userField = await page.$(sel.user);
        const passField = await page.$(sel.pass);
        if (userField && passField) {
          console.log('Found fields with selector:', sel.user);
          await userField.click();
          await userField.type(REDDIT_USERNAME, { delay: 50 });
          await passField.click();
          await passField.type(REDDIT_PASSWORD, { delay: 50 });
          await page.waitForTimeout(500);

          // Click login button
          const loginBtn = await page.$('button:has-text("Log In"), button[type="submit"]');
          if (loginBtn) {
            await loginBtn.click();
          } else {
            await passField.press('Enter');
          }

          await page.waitForTimeout(4000);
          console.log('After login attempt URL:', page.url());

          if (!page.url().includes('/login')) {
            loginSuccess = true;
            break;
          }
        }
      }

      if (!loginSuccess) {
        // Try evaluating page for shadow DOM inputs
        console.log('Trying shadow DOM approach...');
        await page.evaluate((username, password) => {
          // Reddit uses custom web components - find inputs inside shadow roots
          const allInputs = Array.from(document.querySelectorAll('input'));
          console.log('Found inputs:', allInputs.length);
          const userInput = allInputs.find(i => i.type === 'text' || i.placeholder?.toLowerCase().includes('user') || i.name === 'username');
          const passInput = allInputs.find(i => i.type === 'password');
          if (userInput) { userInput.value = username; userInput.dispatchEvent(new Event('input', {bubbles: true})); }
          if (passInput) { passInput.value = password; passInput.dispatchEvent(new Event('input', {bubbles: true})); }
        }, REDDIT_USERNAME, REDDIT_PASSWORD);
        await page.waitForTimeout(1000);
        const loginBtn = await page.$('button[type="submit"]');
        if (loginBtn) await loginBtn.click();
        await page.waitForTimeout(4000);
      }
    }

    // Now try to go to prefs/apps
    console.log('\nNavigating to prefs/apps...');
    await page.goto('https://www.reddit.com/prefs/apps', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    console.log('Prefs/apps URL:', page.url());
    const appsContent = await page.evaluate(() => document.body.innerText);
    console.log('Apps page content (first 800 chars):', appsContent.substring(0, 800));

    await page.screenshot({ path: '/tmp/reddit-prefs-apps.png' });
    console.log('Screenshot saved to /tmp/reddit-prefs-apps.png');

    if (page.url().includes('/prefs/apps') && !page.url().includes('/login')) {
      console.log('\nSUCCESS: On prefs/apps page!');

      // Look for existing apps or create new one
      const createBtn = await page.$('input[value*="create"], button:has-text("create"), a:has-text("create another")');
      if (createBtn) {
        await createBtn.click();
        await page.waitForTimeout(1500);

        // Fill app form
        const nameInput = await page.$('input[name="name"]');
        const redirectInput = await page.$('input[name="redirect_uri"]');
        const scriptRadio = await page.$('input[value="script"]');

        if (nameInput) await nameInput.fill('LaunchStackBot2');
        if (scriptRadio) await scriptRadio.click();
        if (redirectInput) await redirectInput.fill('http://localhost:8080');

        const submitBtn = await page.$('input[value*="create app"], button[type="submit"]');
        if (submitBtn) {
          await submitBtn.click();
          await page.waitForTimeout(2000);
        }

        const afterContent = await page.evaluate(() => document.body.innerText);
        console.log('\nAfter creation (first 1500 chars):', afterContent.substring(0, 1500));
        await page.screenshot({ path: '/tmp/reddit-after-creation.png' });
      }

      // Extract credentials from page
      const credContent = await page.evaluate(() => {
        const text = document.body.innerText;
        // Look for patterns like CLIENT_ID and SECRET
        const lines = text.split('\n');
        return lines.filter(l => l.trim().length > 10 && l.trim().length < 100).slice(0, 50).join('\n');
      });
      console.log('\nFiltered page content:\n', credContent);
    } else {
      console.log('Still on login page or redirected. Login failed.');
      await page.screenshot({ path: '/tmp/reddit-login-failed.png' });
    }

  } catch (err) {
    console.error('Error:', err.message);
    await page.screenshot({ path: '/tmp/reddit-error.png' });
  } finally {
    await browser.close();
  }
})();
