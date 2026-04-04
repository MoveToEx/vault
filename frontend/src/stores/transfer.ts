import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

type TransferStatus =
  | "pending"
  | "running"
  | "completed"
  | "canceled"
  | "paused"
  | "error";
type ChunkStatus = "pending" | "running" | "completed" | "error";

type ChunkItem = {
  status: ChunkStatus;
  size: number;
  sent: number;
  error?: string;
};

type TransferItem = {
  id: string;
  kind: "upload" | "download" | "download-share";
  filename: string;
  status: TransferStatus;
  chunks: ChunkItem[];
  size: number;
  sent: number;
  error?: string;
  createdAt: number;
};

function createChunks(size: number, chunkSize: number) {
  const result: ChunkItem[] = Array.from({ length: size / chunkSize }, () => ({
    sent: 0,
    size: chunkSize,
    status: "pending",
  }));

  if (size % chunkSize !== 0) {
    result.push({
      sent: 0,
      size: size % chunkSize,
      status: "pending",
    });
  }

  return result;
}

export const TransferSlice = createSlice({
  name: "transfer",
  initialState: {
    items: {} as Record<string, TransferItem>,
  },
  reducers: {
    transferCreated(
      state,
      action: PayloadAction<{
        transferId: string;
        kind: "upload" | "download" | "download-share";
        filename: string;
        size: number;
      }>,
    ) {
      const { payload } = action;

      state.items[payload.transferId] = {
        id: payload.transferId,
        kind: payload.kind,
        filename: payload.filename,
        size: payload.size,
        sent: 0,
        status: "pending",
        chunks: [],
        createdAt: new Date().getTime(),
      };
    },

    transferStarted: (
      state,
      action: PayloadAction<{
        transferId: string;
        filename?: string;
        size?: number;
        chunks: number;
        chunkSize: number;
      }>,
    ) => {
      const { transferId, chunkSize, filename, size } = action.payload;
      if (filename) {
        state.items[transferId].filename = filename;
      }
      if (size) {
        state.items[transferId].size = size;
      }
      state.items[transferId].status = "running";
      state.items[transferId].chunks = createChunks(
        state.items[transferId].size,
        chunkSize,
      );
    },

    chunkProgressUpdated: (
      state,
      action: PayloadAction<{
        transferId: string;
        chunkIndex: number;
        sent: number;
      }>,
    ) => {
      const { transferId, chunkIndex, sent } = action.payload;
      const transfer = state.items[transferId];
      if (!transfer) return;

      transfer.status = "running";

      if (!transfer.chunks[chunkIndex]) return;

      transfer.chunks[chunkIndex].status = "running";
      transfer.chunks[chunkIndex].sent = sent;
    },

    chunkCompleted: (
      state,
      action: PayloadAction<{
        transferId: string;
        chunkIndex: number;
      }>,
    ) => {
      const { transferId, chunkIndex } = action.payload;
      const transfer = state.items[transferId];
      if (!transfer) return;

      const chunk = transfer.chunks[chunkIndex];

      transfer.chunks[chunkIndex] = {
        status: "completed",
        sent: chunk.size,
        size: chunk.size,
      };
    },

    transferProgressUpdated: (
      state,
      action: PayloadAction<{
        transferId: string;
        sent: number;
      }>,
    ) => {
      const { transferId, sent } = action.payload;
      const transfer = state.items[transferId];
      if (!transfer) return;

      transfer.status = "running";
      transfer.sent = sent;
    },

    transferPaused: (state, action: PayloadAction<{ transferId: string }>) => {
      const transfer = state.items[action.payload.transferId];
      if (transfer) {
        transfer.status = "paused";
      }
    },

    transferResumed: (state, action: PayloadAction<{ transferId: string }>) => {
      const transfer = state.items[action.payload.transferId];
      if (transfer) {
        transfer.status = "running";
      }
    },

    transferCompleted: (
      state,
      action: PayloadAction<{ transferId: string }>,
    ) => {
      const transfer = state.items[action.payload.transferId];
      if (transfer) {
        transfer.status = "completed";
        transfer.sent = transfer.size;
      }
    },

    transferCanceled: (
      state,
      action: PayloadAction<{ transferId: string }>,
    ) => {
      const transfer = state.items[action.payload.transferId];
      if (transfer) {
        transfer.status = "canceled";
      }
    },

    transferFailed: (
      state,
      action: PayloadAction<{ transferId: string; error: string }>,
    ) => {
      const transfer = state.items[action.payload.transferId];
      if (transfer) {
        transfer.status = "error";
        transfer.error = action.payload.error;
      }
    },

    removeTransfer: (state, action: PayloadAction<{ transferId: string }>) => {
      const { transferId } = action.payload;
      if (state.items[transferId]) {
        delete state.items[transferId];
      }
    },

    clear: (state) => {
      state.items = {};
    },
  },
});

export const {
  chunkCompleted,
  chunkProgressUpdated,
  removeTransfer,
  transferCanceled,
  transferCompleted,
  transferFailed,
  transferPaused,
  transferProgressUpdated,
  transferCreated,
  transferResumed,
  transferStarted,
  clear,
} = TransferSlice.actions;

export default TransferSlice.reducer;
