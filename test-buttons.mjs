import puppeteer from 'puppeteer-core';

(async () => {
  console.log('Testing button functionality...\n');
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--ignore-certificate-errors'],
  });

  try {
    const page = await browser.newPage();
    
    await page.goto('https://localhost:3000', { waitUntil: 'networkidle2', timeout: 10000 });
    console.log('✓ Page loaded\n');
    
    // Check buttons
    const buttons = await page.$$eval('button', btns => 
      btns.map(b => ({ id: b.id, text: b.textContent.trim().substring(0, 30) }))
    );
    console.log(`Found ${buttons.length} buttons:`);
    buttons.forEach(b => console.log(`  ✓ ${b.text} [${b.id}]`));
    console.log('');
    
    // Try clicking Create Room
    console.log('Clicking Create Room button...');
    await page.click('#create-btn');
    
    try {
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 5000 });
      console.log('✅ SUCCESS - Page navigated to:', page.url());
    } catch {
      console.log('⏳ No navigation (might still be working)');
    }
  } catch (err) {
    console.log('❌ Error:', err.message);
  } finally {
    await browser.close();
  }
})();
