import { OpcChatError } from './opc-chat';

export interface OpcChatAttachment {
  kind: 'image' | 'video' | 'text';
  name: string;
  mime: string;
  size: number;
  data_url?: string;
  text?: string;
}

interface UploadLike { originalname: string; mimetype: string; size: number; buffer: Buffer }

const IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const VIDEO_MIMES = new Set(['video/mp4', 'video/webm']);
const MAX_FILES = 4;
const MAX_TOTAL_BYTES = 25 * 1024 * 1024;

function extension(name: string): string {
  return name.toLowerCase().split('.').pop() || '';
}

export function validateChatAttachments(files: UploadLike[]): OpcChatAttachment[] {
  if (files.length > MAX_FILES) throw new OpcChatError(413, 'TOO_MANY_FILES', '每条消息最多上传 4 个文件');
  if (files.reduce((sum, file) => sum + file.size, 0) > MAX_TOTAL_BYTES) {
    throw new OpcChatError(413, 'FILES_TOO_LARGE', '单条消息附件总大小不能超过 25 MB');
  }
  return files.map(file => {
    const ext = extension(file.originalname);
    const name = file.originalname.replace(/[\r\n\0]/g, '').slice(0, 180) || '未命名文件';
    if (IMAGE_MIMES.has(file.mimetype) && ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) {
      if (file.size > 10 * 1024 * 1024) throw new OpcChatError(413, 'IMAGE_TOO_LARGE', `${name} 超过图片 10 MB 限制`);
      return { kind: 'image', name, mime: file.mimetype, size: file.size, data_url: `data:${file.mimetype};base64,${file.buffer.toString('base64')}` };
    }
    if (VIDEO_MIMES.has(file.mimetype) && ['mp4', 'webm'].includes(ext)) {
      if (file.size > 25 * 1024 * 1024) throw new OpcChatError(413, 'VIDEO_TOO_LARGE', `${name} 超过视频 25 MB 限制`);
      return { kind: 'video', name, mime: file.mimetype, size: file.size, data_url: `data:${file.mimetype};base64,${file.buffer.toString('base64')}` };
    }
    if ((file.mimetype === 'text/plain' || file.mimetype === 'application/octet-stream') && ext === 'txt') {
      if (file.size > 1024 * 1024) throw new OpcChatError(413, 'TEXT_TOO_LARGE', `${name} 超过 TXT 1 MB 限制`);
      try {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(file.buffer);
        return { kind: 'text', name, mime: 'text/plain', size: file.size, text };
      } catch {
        throw new OpcChatError(422, 'TEXT_ENCODING_INVALID', `${name} 不是有效的 UTF-8 TXT 文件`);
      }
    }
    throw new OpcChatError(415, 'UNSUPPORTED_FILE_TYPE', `${name} 格式不支持，仅支持 PNG、JPG、WebP、GIF、MP4、WebM 和 TXT`);
  });
}
