import { createSlice, type PayloadAction } from "@reduxjs/toolkit";


export const UMKSlice = createSlice({
  name: 'umk',
  initialState: {
    value: null as string | null
  },
  reducers: {
    set: (state, action: PayloadAction<string>) => {
      state.value = action.payload;
    },
    reset: (state) => {
      state.value = null;
    }
  }
});

export const { set, reset } = UMKSlice.actions;

export default UMKSlice.reducer;