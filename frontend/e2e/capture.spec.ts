import { test } from '@playwright/test';
import * as fs from 'fs';

test('capture html and screenshot', async ({ page }) => {
    await page.goto('http://localhost:5173/');
    await page.waitForTimeout(2000);

    // screenshot
    await page.screenshot({ path: 'e2e/screenshot.png' });

    // HTML
    const html = await page.content();
    fs.writeFileSync('e2e/page.html', html);

    // Root content
    const rootHtml = await page.locator('#root').innerHTML();
    console.log('--- ROOT CONTENT ---');
    console.log(rootHtml);
    console.log('--------------------');
});
