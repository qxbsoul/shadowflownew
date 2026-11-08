import { setByokKey, setDefaultProvider, type ByokProvider } from './api';

export type ApiConfigMode = 'official' | 'custom';
export const MIMO_BASE_URL = 'https://api.xiaomimimo.com/v1';
export const MIMO_MODEL = 'mimo-v2.6-pro';

export interface ApiSettingsState {
  mode: ApiConfigMode;
  provider: ByokProvider;
  model: string;
  baseUrl: string;
  hasKey: boolean;
}

export interface ApiSettingsInput {
  mode: ApiConfigMode;
  provider: ByokProvider;
  model: string;
  baseUrl: string;
  apiKey: string;
}

export const PROVIDER_LABELS: Record<ByokProvider, string> = {
  anthropic: 'Anthropic Claude', openai: 'OpenAI', deepseek: 'DeepSeek', zhipu: '智谱 GLM',
  mimo: 'MiMo', google: 'Google Gemini', qwen: '通义千问', moonshot: 'Moonshot AI',
  mistral: 'Mistral AI', groq: 'Groq', openrouter: 'OpenRouter', ollama: 'Ollama（本地）',
  lmstudio: 'LM Studio（本地）', azure: 'Azure OpenAI',
};

function read(key: string): string {
  try { return localStorage.getItem(key) ?? ''; } catch { return ''; }
}

export function loadApiSettings(): ApiSettingsState {
  return {
    mode: 'official', provider: 'mimo', model: MIMO_MODEL, baseUrl: MIMO_BASE_URL,
    hasKey: Boolean(read('sf_mimo_key')),
  };
}

export function saveApiSettings(input: ApiSettingsInput): ApiSettingsState {
  setDefaultProvider('mimo');
  if (input.apiKey.trim()) setByokKey('mimo', input.apiKey.trim());
  localStorage.setItem('sf_selected_model', MIMO_MODEL);
  localStorage.setItem('sf_api_config_mode', 'official');
  return loadApiSettings();
}

export function hasStoredApiKey(mode: ApiConfigMode, provider: ByokProvider): boolean {
  return mode === 'custom'
    ? Boolean(read('sf_custom_api_key'))
    : Boolean(read(`sf_${provider}_key`));
}

export function clearApiKey(target: { mode: ApiConfigMode; provider: ByokProvider }): ApiSettingsState {
  if (target.mode === 'custom') localStorage.removeItem('sf_custom_api_key');
  else setByokKey(target.provider, '');
  return loadApiSettings();
}
