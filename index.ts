import dotenv from 'dotenv';
dotenv.config();

import { ImapFlow } from 'imapflow';
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
const client = new ImapFlow({
  host: process.env.IMAP_HOST || 'imap.qq.com',
  port: parseInt(process.env.IMAP_PORT || '993'),
  secure: true,
  auth: {
    user: process.env.EMAIL_USER || '',
    pass: process.env.EMAIL_PASSWORD || ''
  },
  logger: false
});

// 监听错误事件
client.on('error', (err: Error) => {
  console.log('IMAP错误：', err);
});

// 监听结束事件
client.on('close', () => {
  console.log('IMAP连接已关闭');
});

// 存储已处理过的邮件ID
const processedMessageIds = new Set<number>();

// 处理新邮件
async function handleNewEmails(client: ImapFlow) {
  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const mailbox = await client.mailboxOpen('INBOX');
      const currentCount = mailbox.exists;
      console.log(`检查新邮件，当前邮件数: ${currentCount}`);

      // 获取最新的邮件
      const messages = await client.fetch(`${currentCount}:*`, {
        envelope: true,
        bodyStructure: true,
        source: true,
        uid: true
      });

      for await (const message of messages) {
        // 如果已经处理过这个邮件，跳过
        if (processedMessageIds.has(message.uid)) {
          continue;
        }

        console.log(`处理新邮件 #${message.uid}`);
        processedMessageIds.add(message.uid);
        
        const parsed = await simpleParser(Readable.from(message.source));
        
        console.log('---------------------------');
        console.log(`发件人: ${String(parsed.from || '未知')}`);
        console.log(`收件人: ${String(parsed.to || '未知')}`);
        console.log(`主题: ${parsed.subject || '无主题'}`);
        console.log(`日期: ${parsed.date?.toLocaleString() || '未知'}`);
        console.log(`正文: ${parsed.text?.substring(0, 100)}...`);
        console.log('---------------------------');

        const result = await parseEmail({ 
          subject: parsed.subject || '', 
          content: parsed.text || '' 
        });
        console.log(result);
        await sendNotification(result as { 
          isVerification: boolean, 
          verificationCode?: string, 
          verificationLink?: string, 
          message?: string, 
          sender: string 
        });
      }
    } finally {
      lock.release();
    }
  } catch (err: unknown) {
    console.error('处理新邮件时发生错误:', err);
  }
}

// 主函数
async function main() {
  try {
    // 连接到IMAP服务器
    console.log('正在连接到IMAP服务器...');
    await client.connect();
    console.log('IMAP连接已建立');

    // 获取初始邮件ID
    const lock = await client.getMailboxLock('INBOX');
    try {
      const mailbox = await client.mailboxOpen('INBOX');
      // 获取当前所有邮件的ID
      const messages = await client.fetch('*', {
        uid: true
      });
      for await (const message of messages) {
        processedMessageIds.add(message.uid);
      }
      console.log(`已记录 ${processedMessageIds.size} 封现有邮件`);
    } finally {
      lock.release();
    }

    // 定期检查新邮件
    while (true) {
      try {
        // 使用 NOOP 命令触发服务器检查新邮件
        await client.noop();
        
        // 检查新邮件
        await handleNewEmails(client);
        
        // 等待一段时间后再次检查
        await new Promise(resolve => setTimeout(resolve, 5000));
      } catch (err) {
        console.error('检查新邮件时出错:', err);
        // 等待一段时间后重试
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  } catch (err: unknown) {
    console.error('发生错误:', err);
  }
}

// 启动程序
main();
