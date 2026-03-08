import puppeteer from 'puppeteer-core';

async function test() {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium',
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu'],
  });

  try {
    const page = await browser.newPage();
    await page.goto('https://quiz.aldervall.se', { waitUntil: 'networkidle2' });
    
    const buttons = await page.$$eval('button', btns => 
      btns.map(b => ({ id: b.id, text: b.textContent.trim() }))
    );
    
    console.log('Buttons on landing page:');
    buttons.forEach(b => console.log(`  ✓ ${b.text || '(empty)'}`));
    
    const hasSpy = buttons.some(b => b.id === 'spy-btn');
    console.log(hasSpy ? '\n❌ Spy button still present!' : '\n✅ Spy button removed!');
  } finally {
    await browser.close();
  }
}

test();
