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
    await new Promise(r => setTimeout(r, 2000)); // Extra wait for JS
    
    const buttons = await page.$$eval('button', btns => 
      btns.map(b => ({ id: b.id, text: b.textContent.trim().substring(0, 30) }))
    );
    
    console.log(`Found ${buttons.length} buttons:\n`);
    buttons.forEach((b, i) => console.log(`  ${i+1}. ${b.text} ${b.id ? `[${b.id}]` : ''}`));
    
    const hasSpy = buttons.some(b => b.id === 'spy-btn');
    console.log(hasSpy ? '\n❌ Spy button still present!' : '\n✅ Spy button successfully removed!');
  } finally {
    await browser.close();
  }
}

test();
