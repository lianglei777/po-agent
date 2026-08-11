import { createStore } from "zustand/vanilla";
import type {
  AgentMessage,
  AttachedImage,
  ModelInfo,
  SessionTreeNode,
  ThinkingLevel,
  ToolResultMessage,
} from "../agent-types";
import { streamReducer, type StreamingState } from "../chat-logic";

type StateUpdater<T> = T | ((current: T) => T);
type RunningTool = { toolCallId: string; toolName: string };
type RetryInfo = {
  attempt: number;
  maxAttempts: number;
  errorMessage?: string;
} | null;

export type ChatState = {
  messages: AgentMessage[];
  entryIds: string[];
  tree: SessionTreeNode[];
  activeLeafId: string | null;
  loading: boolean;
  error: string;
  actionError: string;
  draft: string;
  images: AttachedImage[];
  running: boolean;
  stopping: boolean;
  runningTools: RunningTool[];
  partialToolResults: Map<string, ToolResultMessage>;
  retryInfo: RetryInfo;
  isCompacting: boolean;
  models: ModelInfo[];
  modelKey: string;
  thinkingLevel: ThinkingLevel;
  forkingEntryId: string | null;
  undoable: { leafId: string } | null;
  stream: StreamingState;
};

export type ChatActions = {
  setMessages: (next: StateUpdater<AgentMessage[]>) => void;
  setEntryIds: (next: StateUpdater<string[]>) => void;
  setTree: (next: StateUpdater<SessionTreeNode[]>) => void;
  setActiveLeafId: (next: string | null) => void;
  setLoading: (next: boolean) => void;
  setError: (next: string) => void;
  setActionError: (next: string) => void;
  setDraft: (next: StateUpdater<string>) => void;
  setImages: (next: StateUpdater<AttachedImage[]>) => void;
  setRunning: (next: boolean) => void;
  setStopping: (next: boolean) => void;
  setRunningTools: (next: StateUpdater<RunningTool[]>) => void;
  setPartialToolResults: (
    next: StateUpdater<Map<string, ToolResultMessage>>,
  ) => void;
  setRetryInfo: (next: RetryInfo) => void;
  setIsCompacting: (next: boolean) => void;
  setModels: (next: ModelInfo[]) => void;
  setModelKey: (next: StateUpdater<string>) => void;
  setThinkingLevel: (next: ThinkingLevel) => void;
  setForkingEntryId: (next: string | null) => void;
  setUndoable: (next: { leafId: string } | null) => void;
  dispatchStream: (action: Parameters<typeof streamReducer>[1]) => void;
};

export type ChatStore = ChatState & ChatActions;
export type ChatStoreApi = ReturnType<typeof createChatStore>;

export const DEFAULT_CHAT_STATE: ChatState = {
  messages: [],
  entryIds: [],
  tree: [],
  activeLeafId: null,
  loading: false,
  error: "",
  actionError: "",
  draft: "",
  images: [],
  running: false,
  stopping: false,
  runningTools: [],
  partialToolResults: new Map(),
  retryInfo: null,
  isCompacting: false,
  models: [],
  modelKey: "",
  thinkingLevel: "auto",
  forkingEntryId: null,
  undoable: null,
  stream: { isStreaming: false, streamingMessage: null },
};

function resolveUpdater<T>(current: T, next: StateUpdater<T>): T {
  return typeof next === "function"
    ? (next as (value: T) => T)(current)
    : next;
}

export function createChatStore(initialState: Partial<ChatState> = {}) {
  return createStore<ChatStore>()((set) => ({
    ...DEFAULT_CHAT_STATE,
    // 可变容器必须按 Store 实例创建，避免测试或多个 Chat 实例共享引用。
    partialToolResults: new Map(),
    ...initialState,
    setMessages: (next) =>
      set((state) => ({ messages: resolveUpdater(state.messages, next) })),
    setEntryIds: (next) =>
      set((state) => ({ entryIds: resolveUpdater(state.entryIds, next) })),
    setTree: (next) =>
      set((state) => ({ tree: resolveUpdater(state.tree, next) })),
    setActiveLeafId: (activeLeafId) => set({ activeLeafId }),
    setLoading: (loading) => set({ loading }),
    setError: (error) => set({ error }),
    setActionError: (actionError) => set({ actionError }),
    setDraft: (next) =>
      set((state) => ({ draft: resolveUpdater(state.draft, next) })),
    setImages: (next) =>
      set((state) => ({ images: resolveUpdater(state.images, next) })),
    setRunning: (running) => set({ running }),
    setStopping: (stopping) => set({ stopping }),
    setRunningTools: (next) =>
      set((state) => ({
        runningTools: resolveUpdater(state.runningTools, next),
      })),
    setPartialToolResults: (next) =>
      set((state) => ({
        partialToolResults: resolveUpdater(state.partialToolResults, next),
      })),
    setRetryInfo: (retryInfo) => set({ retryInfo }),
    setIsCompacting: (isCompacting) => set({ isCompacting }),
    setModels: (models) => set({ models }),
    setModelKey: (next) =>
      set((state) => ({ modelKey: resolveUpdater(state.modelKey, next) })),
    setThinkingLevel: (thinkingLevel) => set({ thinkingLevel }),
    setForkingEntryId: (forkingEntryId) => set({ forkingEntryId }),
    setUndoable: (undoable) => set({ undoable }),
    // 流式消息转换保持纯函数，SSE 的连接与清理仍由 Controller Hook 负责。
    dispatchStream: (action) =>
      set((state) => ({ stream: streamReducer(state.stream, action) })),
  }));
}
