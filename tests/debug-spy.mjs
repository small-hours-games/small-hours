import puppeteer from 'puppeteer-core';

const BASE_URL = 'https://quiz.aldervall.se';

async function test() {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu'],
  });

  try {
    console.log('Creating spy game room...\n');
    const page = await browser.newPage();
    await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
    await page.click('#spy-btn');
    
    // Wait for navigation
    await page.waitForNavigation({ waitUntil: 'networkidle2' });
    console.log(`Room URL: ${page.url()}\n`);
    
    // Check what HTML elements exist
    const allIds = await page.$$eval('[id]', els => els.map(e => e.id));
    console.log('Element IDs on page:');
    allIds.slice(0, 20).forEach(id => console.log(`  - ${id}`));
    
    const allClasses = await page.$$eval('[class*="game"]', els => 
      els.map(e => ({ tag: e.tagName, classes: e.className }))
    );
    console.log('\nElements with "game" in class:');
    allClasses.slice(0, 10).forEach(e => console.log(`  - <${e.tag}> class="${e.classes}"`));
    
    const bodyContent = await page.$eval('body', b => b.innerHTML.substring(0, 500));
    console.log('\nFirst 500 chars of body:');
    console.log(bodyContent);
  } finally {
    await browser.close();
  }
}

test();
