import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

type PathItem = {
  folderName: string;
  id: number;
};

export const PathSlice = createSlice({
  name: "path",
  initialState: {
    value: [] as PathItem[],
  },
  reducers: {
    push: (state, action: PayloadAction<PathItem>) => {
      state.value = [...state.value, action.payload];
    },
    pop: (state) => {
      if (state.value.length === 0) return;

      state.value = state.value.slice(0, -1);
    },
    reset: (state) => {
      state.value = [];
    },
    popUntil: (state, action: PayloadAction<number>) => {
      const idx = state.value.findIndex((val) => val.id === action.payload);

      if (idx === -1) return;

      state.value = state.value.slice(0, idx + 1);
    },
  },
});

export const { push, pop, reset, popUntil } = PathSlice.actions;

export default PathSlice.reducer;
