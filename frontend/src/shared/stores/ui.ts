import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export const UISlice = createSlice({
  name: "ui",
  initialState: {
    transferListOpen: false,
    loginDialogOpen: false,
    registerDialogOpen: false,
  },
  reducers: {
    toggleTransferList: (state, action: PayloadAction<boolean>) => {
      state.transferListOpen = action.payload;
    },
    toggleLoginDialog: (state, action: PayloadAction<boolean>) => {
      state.loginDialogOpen = action.payload;
    },
    toggleRegisterDialog: (state, action: PayloadAction<boolean>) => {
      state.registerDialogOpen = action.payload;
    },
  },
});

export const { toggleTransferList, toggleLoginDialog, toggleRegisterDialog } =
  UISlice.actions;

export default UISlice.reducer;
