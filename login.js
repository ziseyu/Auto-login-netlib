const axios = require('axios');
const { chromium } = require('playwright');

const token = process.env.BOT_TOKEN;
const chatId = process.env.CHAT_ID;
const accounts = process.env.ACCOUNTS;

if (!accounts) {
  console.log('❌ 未配置账号');
  process.exit(1);
}

const [user, pass] = accounts.split(":").map(s => s.trim());
if (!user || !pass) {
  console.log('❌ 账号格式错误，应为 username:password');
  process.exit(1);
}

async function sendTelegram(message) {
  if (!token || !chatId) return;

  const now = new Date();
  const hkTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
  const timeStr = hkTime.toISOString().replace('T', ' ').substr(0, 19) + " HKT";

  const fullMessage = `🎉 Netlib 登录通知\n\n${message}`;

  try {
    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId,
      text: fullMessage
    }, { timeout: 10000 });
    console.log('✅ Telegram 通知发送成功');
  } catch (e) {
    console.log('⚠️ Telegram 发送失败');
  }
}

async function main() {
  console.log(`开始登录账号: ${user}`);
  
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  let page;
  try {
    page = await browser.newPage();
    page.setDefaultTimeout(30000);
    
    console.log('正在访问网站...');
    await page.goto('https://www.netlib.re/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    
    console.log('点击登录按钮...');
    await page.click('text=Login', { timeout: 5000 });
    
    // 如果上面失败，可以尝试其他方法
    // 方法2: 通过XPath查找
    // await page.click('//a[contains(text(), "Login")]', { timeout: 5000 });
    
    // 方法3: 通过CSS选择器查找
    // await page.click('a[href*="login"]', { timeout: 5000 });
    
    await page.waitForTimeout(2000);
    
    console.log('填写用户名...');
    // 使用更通用的选择器
    await page.fill('input[name="username"], input[type="text"]', user);
    await page.waitForTimeout(1000);
    
    console.log('填写密码...');
    await page.fill('input[name="password"], input[type="password"]', pass);
    await page.waitForTimeout(1000);
    
    console.log('提交登录...');
    await page.click('button:has-text("Validate"), input[type="submit"]');
    
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(5000);
    
    const pageContent = await page.content();
    if (pageContent.includes('exclusive owner') || pageContent.includes(user)) {
      console.log('✅ 登录成功');
      await sendTelegram(`✅ ${user} 登录成功`);
    } else {
      console.log('❌ 登录失败');
      const errorText = await page.textContent('body');
      const errorSnippet = errorText.includes('Error') ? 
        errorText.match(/Error[^\.]*\.?/)?.[0] || '未知错误' : '未知错误';
      await sendTelegram(`❌ ${user} 登录失败: ${errorSnippet}`);
    }
    
  } catch (e) {
    console.log(`❌ 登录异常: ${e.message}`);
    await sendTelegram(`❌ ${user} 登录异常: ${e.message}`);
  } finally {
    if (page) await page.close();
    await browser.close();
  }
}

main().catch(console.error);
