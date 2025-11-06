const axios = require('axios');
const { chromium } = require('playwright');

const token = process.env.BOT_TOKEN;
const chatId = process.env.CHAT_ID;
const accounts = (process.env.ACCOUNTS || "").split(";")
  .filter(x => x.trim())
  .map(item => {
    const [user, pass] = item.split(":");
    return { user: user?.trim(), pass: pass?.trim() };
  })
  .filter(acc => acc.user && acc.pass);

async function sendTelegram(message) {
  if (!token || !chatId) return;

  const now = new Date();
  const hkTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
  const timeStr = hkTime.toISOString().replace('T', ' ').substr(0, 19) + " HKT";

  const fullMessage = `📌 Netlib 登录通知\n🕒 ${timeStr}\n\n${message}`;

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
  if (accounts.length === 0) {
    console.log('❌ 未配置账号');
    await sendTelegram('❌ 未配置账号');
    return;
  }

  console.log(`找到 ${accounts.length} 个账号`);
  let results = [];

  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'] // 添加这些参数以提高稳定性
  });
  
  for (const { user, pass } of accounts) {
    let page;
    try {
      page = await browser.newPage();
      
      // 增加超时设置
      page.setDefaultTimeout(30000);
      page.setDefaultNavigationTimeout(30000);
      
      console.log(`正在登录: ${user}`);
      await page.goto('https://www.netlib.re/', { waitUntil: 'networkidle' });
      await page.waitForTimeout(3000);
      
      // 更健壮的选择器
      await page.click('a:has-text("Login"), text=Login', { timeout: 5000 });
      await page.waitForTimeout(2000);
      
      // 等待输入框出现
      await page.waitForSelector('input[name="username"], input[type="text"]', { timeout: 5000 });
      await page.fill('input[name="username"], input[type="text"]', user);
      await page.waitForTimeout(1000);
      
      await page.waitForSelector('input[name="password"], input[type="password"]', { timeout: 5000 });
      await page.fill('input[name="password"], input[type="password"]', pass);
      await page.waitForTimeout(1000);
      
      await page.click('button:has-text("Validate"), input[type="submit"]', { timeout: 5000 });
      
      // 等待页面加载完成
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(5000);
      
      // 更健壮的成功检查
      const successSelectors = [
        'text=exclusive owner',
        'text=You are the exclusive owner',
        'text=Dashboard',
        `text=${user}` // 页面显示用户名也算成功
      ];
      
      let loginSuccess = false;
      for (const selector of successSelectors) {
        const element = await page.$(selector);
        if (element) {
          loginSuccess = true;
          break;
        }
      }
      
      if (loginSuccess) {
        results.push(`✅ ${user}`);
        console.log(`${user} 登录成功`);
      } else {
        // 检查是否有错误信息
        const errorSelectors = [
          'text=Invalid',
          'text=Error',
          'text=Failed',
          'text=incorrect'
        ];
        
        let errorMsg = "未知错误";
        for (const selector of errorSelectors) {
          const element = await page.$(selector);
          if (element) {
            const text = await element.textContent();
            errorMsg = text || "登录失败";
            break;
          }
        }
        
        results.push(`❌ ${user} (${errorMsg})`);
        console.log(`${user} 登录失败: ${errorMsg}`);
        
        // 保存截图用于调试
        await page.screenshot({ path: `/tmp/${user}_error.png` });
        console.log(`截图已保存: /tmp/${user}_error.png`);
      }
      
    } catch (e) {
      results.push(`❌ ${user} (异常: ${e.message})`);
      console.log(`${user} 登录异常: ${e.message}`);
      
      // 保存截图用于调试
      if (page) {
        await page.screenshot({ path: `/tmp/${user}_exception.png` });
        console.log(`异常截图已保存: /tmp/${user}_exception.png`);
      }
    } finally {
      if (page) {
        await page.close();
      }
    }
    
    await new Promise(r => setTimeout(r, 3000));
  }
  
  await browser.close();
  const message = `处理完成:\n${results.join('\n')}`;
  await sendTelegram(message);
}

main().catch(async (error) => {
  console.error('脚本执行失败:', error);
  await sendTelegram(`💥 脚本执行失败: ${error.message}`);
});
