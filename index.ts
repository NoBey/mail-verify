import dotenv from 'dotenv';
dotenv.config();

import Imap from 'imap';
import { simpleParser } from 'mailparser';
import { Readable } from 'stream';
import { sendNotification } from './send';

async function parseEmail({ subject, content }: { subject: string, content: string }): Promise<{ isVerification: boolean, verificationCode?: string, verificationLink?: string, message: string, sender?: string }> {
    // 如果没有内容则返回不是验证邮件
    if (!content) {
      return {
        isVerification: false,
        message: '邮件内容为空'
      };
    }
    console.time('parseEmail');
  
    // 调用 API 进行内容分析
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GOOGLE_API_KEY}`
      },
      body: JSON.stringify({
        model: "gemini-2.0-flash",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "你是一个邮件验证码分析助手,请从邮件内容中提取验证码和验证链接，并且分析邮箱发送人或公司的名称 返回格式 {verificationCode: '验证码', verificationLink: '验证链接', sender: '发送人或公司名称'}" },
          { role: "user", content: subject + '\n' + content }
        ]
      })
    });
    console.timeEnd('parseEmail');
  
    const result = await response.json() as { choices: { message: { content: string } }[] };
    try {
      const resultData = JSON.parse(result?.choices?.[0]?.message?.content || '{}');
      // 解析返回结果
      const verificationCode = resultData.verificationCode || null;
      const verificationLink = resultData.verificationLink || null;
      const sender = resultData.sender || null;
      const isVerification = !!(verificationCode || verificationLink);
  
    return {
      isVerification,
      verificationCode, 
      verificationLink,
        message: isVerification ? '验证邮件解析成功' : '不是验证邮件',
        sender
      };
    } catch (error) {
      console.error('解析邮件失败:', error);
      return {
        isVerification: false,
        message: '解析邮件失败'
      };
    }
  }


// 配置IMAP连接
const imapConfig = {
  user: process.env.EMAIL_USER || '', // 你的QQ邮箱地址
  password: process.env.EMAIL_PASSWORD || '', // 你的QQ邮箱授权码
  host: process.env.IMAP_HOST || 'imap.qq.com',
  port: parseInt(process.env.IMAP_PORT || '993'),
  tls: true,
  tlsOptions: { rejectUnauthorized: true }
};

// 创建IMAP实例
const imap = new Imap(imapConfig);

// 解析邮件内容的函数
function openInbox(cb: (err: Error | null, mailbox: any) => void) {
  imap.openBox('INBOX', false, cb);
}

// 监听错误事件
imap.once('error', (err: Error) => {
  console.log('IMAP错误：', err);
});

// 监听结束事件
imap.once('end', () => {
  console.log('IMAP连接已关闭');
});

// 监听就绪事件
imap.once('ready', () => {
  console.log('IMAP连接已建立');
  
  openInbox((err, mailbox) => {
    if (err) {
      console.log('打开收件箱失败：', err);
      return;
    }
    
    console.log('收件箱已打开');
    console.log(`收件箱总邮件数: ${mailbox.messages.total}`);

    // 监听新邮件
    imap.on('mail', (numNewMsgs: number) => {
      console.log(`收到 ${numNewMsgs} 封新邮件`);
      
      // 获取最新邮件
      const fetch = imap.seq.fetch(`${mailbox.messages.total - numNewMsgs + 1}:*`, {
        bodies: '',
        struct: true
      });

      fetch.on('message', (msg, seqno) => {
        console.log(`处理邮件 #${seqno}`);

        msg.on('body', (stream, info) => {
          // 使用 mailparser 解析邮件内容
          const chunks: Buffer[] = [];
          
          stream.on('data', (chunk) => {
            chunks.push(chunk);
          });
          
          stream.once('end', async () => {
            const buffer = Buffer.concat(chunks);
            const parsed = await simpleParser(Readable.from(buffer));
            
            console.log('---------------------------');
            console.log(`发件人: ${String(parsed.from || '未知')}`);
            console.log(`收件人: ${String(parsed.to || '未知')}`);
            console.log(`主题: ${parsed.subject || '无主题'}`);
            console.log(`日期: ${parsed.date?.toLocaleString() || '未知'}`);
            console.log(`正文: ${parsed.text?.substring(0, 100)}...`);
            console.log('---------------------------');

            const result = await parseEmail({ subject: parsed.subject || '', content: parsed.text || '' });
            console.log(result);
            await sendNotification(result as { isVerification: boolean, verificationCode?: string, verificationLink?: string, message?: string, sender: string })
          });
        });
      });

      fetch.once('error', (err: Error) => {
        console.log('获取邮件失败: ', err);
      });

      fetch.once('end', () => {
        console.log('所有邮件已获取');
      });
    });
  });
});

// 连接到IMAP服务器
console.log('正在连接到IMAP服务器...');
imap.connect();
