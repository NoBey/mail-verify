// 实现发送 bark 通知
import dotenv from 'dotenv';    
dotenv.config();

const barkUrl = process.env.BARK_URL;
const barkKey = process.env.BARK_KEY;

if (!barkUrl || !barkKey) {
    throw new Error('BARK_URL 和 BARK_KEY 未设置');
}

export const sendNotification = async ({
    isVerification,
    verificationCode,
    verificationLink,
    sender
}: {
    isVerification: boolean,
    verificationCode?: string,
    verificationLink?: string,
    sender: string
}) => { 
    if (isVerification) {
        if (verificationCode) {
            const title = `验证码: ${verificationCode}`
            const body = `来自 ${sender} 的验证邮件`
            await sendAutoCopyBark({
                title,
                body,
                copy: verificationCode,
            });
        }
        if (verificationLink) {
            const title = `来自 ${sender} 的验证邮件`
            const body = `${verificationLink}`
            await sendOpenUrlBark({
                title,
                body,
                url: verificationLink,
            });
        }
   
    }

}

export const sendAutoCopyBark = async ({
    title, copy,
    body
}: {
    title: string,
    copy: string,
    body?: string
}) => {
  const response = await fetch(`${barkUrl}${barkKey}/${title}/${body}?copy=${copy}&autoCopy=1`);
  return response.json();
};


export const sendOpenUrlBark = async ({
    title,
    url,
    body
}: {
    title: string,
    url: string,
    body: string
}) => {
    const response = await fetch(`${barkUrl}${barkKey}/${title}/${body}/${url}`);
    return response.json();
};
    