/**
 * IPC 通道常量定义
 * 用于 Electron 主进程与渲染进程通信
 */

export const IPC_CHANNELS = {
    // 本地推理
    LLM_INIT: 'llm:init',
    LLM_CHAT: 'llm:chat',
    LLM_CHAT_STREAM: 'llm:chat:stream',  // 流式响应通道
    LLM_ABORT: 'llm:abort',
    LLM_STATUS: 'llm:status',
    LLM_UNLOAD: 'llm:unload',

    // 知识库 (Phase 2)
    KB_UPSERT: 'kb:upsert',
    KB_DELETE: 'kb:delete',
    KB_SEARCH: 'kb:search',
    KB_STATS: 'kb:stats',
    KB_IMPORT_COURSE: 'kb:import-course',

    // 同步 (Phase 2)
    SYNC_STATE: 'sync:state',
    SYNC_TRIGGER: 'sync:trigger',
    SYNC_DOWNLOAD_COURSE: 'sync:download-course',

    // 模型管理
    MODEL_LIST: 'model:list',
    MODEL_DOWNLOAD: 'model:download',
    MODEL_DELETE: 'model:delete',
    MODEL_DOWNLOAD_PROGRESS: 'model:download:progress',
} as const;

export type IpcChannel = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS];
