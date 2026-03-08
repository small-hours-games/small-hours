import puppeteer from 'puppeteer-core';

const BASE_URL = 'https://quiz.aldervall.se';

async function test() {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu'],
  });

  try {
    console.log('Checking quiz.aldervall.se for Spy Game button...\n');
    const page = await browser.newPage();
    await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
    
    const buttons = await page.$$eval('button', btns => 
      btns.map(b => ({ id: b.id, text: b.textContent.trim() }))
    );
    
    console.log('Buttons found:');
    buttons.forEach(b => console.log(`  - ${b.text || '(empty)'} [id: ${b.id}]`));
    
    const hasSpyBtn = buttons.some(b => b.id === 'spy-btn');
    if (hasSpyBtn) {
      console.log('\n✅ SPY GAME BUTTON DEPLOYED!');
    } else {
      console.log('\n❌ Spy game button NOT found');
      console.log('   (may be cached - try hard refresh with Ctrl+Shift+R)');
    }
  } finally {
    await browser.close();
  }
}

test();
