export interface ConversationMeta {
  id: string;
  title: string;
  projectId?: string;
  kind?: 'single' | 'group';
  updatedAt: string;
}

export interface ConversationWorkspace {
  activeId: string;
  items: ConversationMeta[];
}

const PREFIX = 'sf_conversations:v1:';
const keyFor = (scope: string) => `${PREFIX}${encodeURIComponent(scope)}`;

export function restoreConversationWorkspace(scope: string): ConversationWorkspace {
  try {
    const raw = localStorage.getItem(keyFor(scope));
    if (!raw) return { activeId: '', items: [] };
    const parsed = JSON.parse(raw) as Partial<ConversationWorkspace>;
    const items = Array.isArray(parsed.items) ? parsed.items.flatMap(item => {
      if (!item || typeof item.id !== 'string' || typeof item.title !== 'string') return [];
      return [{
        id: item.id,
        title: item.title,
        projectId: typeof item.projectId === 'string' ? item.projectId : undefined,
        kind: item.kind === 'group' ? 'group' as const : 'single' as const,
        updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : new Date().toISOString(),
      }];
    }) : [];
    return { activeId: typeof parsed.activeId === 'string' ? parsed.activeId : '', items };
  } catch {
    return { activeId: '', items: [] };
  }
}

export function persistConversationWorkspace(scope: string, workspace: ConversationWorkspace): void {
  try { localStorage.setItem(keyFor(scope), JSON.stringify(workspace)); } catch { /* 存储不可用不阻断项目流程 */ }
}
