import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export const UISlice = createSlice({
  name: "ui",
  initialState: {
    transferListOpen: false,
  },
  reducers: {
    toggleTransferList: (state, action: PayloadAction<boolean>) => {
      state.transferListOpen = action.payload;
    },
  },
});

export const { toggleTransferList } = UISlice.actions;

export default UISlice.reducer;
