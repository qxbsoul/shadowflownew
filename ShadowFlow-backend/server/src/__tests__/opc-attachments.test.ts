import { describe, expect, it } from 'vitest';
import { validateChatAttachments } from '../services/opc-attachments';
import { toOpenAiMessages } from '../transport/api-clients/openai-compat-api-client';

const file = (name: string, mimetype: string, content: string, size?: number) => ({
  originalname: name, mimetype, buffer: Buffer.from(content), size: size ?? Buffer.byteLength(content),
});

describe('聊天附件与多模态契约', () => {
  it('TXT 按 UTF-8 解码，图片转为 data URL', () => {
    const result = validateChatAttachments([file('需求.txt', 'text/plain', '真实需求'), file('图.png', 'image/png', 'png-bytes')]);
    expect(result[0]).toMatchObject({ kind: 'text', text: '真实需求' });
    expect(result[1].data_url).toBe('data:image/png;base64,cG5nLWJ5dGVz');
  });

  it('拒绝伪装扩展名和不支持格式', () => {
    expect(() => validateChatAttachments([file('伪装.pdf', 'image/png', 'x')])).toThrow(/格式不支持/);
    expect(() => validateChatAttachments([file('文档.pdf', 'application/pdf', 'x')])).toThrow(/格式不支持/);
  });

  it('图片和视频使用 MiMo 官方 content parts', () => {
    const [message] = toOpenAiMessages([{ role: 'user', blocks: [
      { kind: 'image', data_url: 'data:image/png;base64,AA' },
      { kind: 'video', data_url: 'data:video/mp4;base64,BB' },
      { kind: 'text', text: '分析附件' },
    ] }]);
    expect(message).toMatchObject({ role: 'user', content: [
      { type: 'image_url', image_url: { url: 'data:image/png;base64,AA' } },
      { type: 'video_url', video_url: { url: 'data:video/mp4;base64,BB' }, fps: 2 },
      { type: 'text', text: '分析附件' },
    ] });
  });
});
