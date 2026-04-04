import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

type Payload = {
  umk: string;
  privKey: string;
};

export const KeySlice = createSlice({
  name: "key",
  initialState: {
    value: {
      umk: null as string | null,
      privKey: null as string | null,
    },
  },
  reducers: {
    setUMK: (state, action: PayloadAction<string>) => {
      state.value.umk = action.payload;
    },
    setPrivateKey: (state, action: PayloadAction<string>) => {
      state.value.privKey = action.payload;
    },
    set: (state, action: PayloadAction<Payload>) => {
      state.value.umk = action.payload.umk;
      state.value.privKey = action.payload.privKey;
    },
    reset: (state) => {
      state.value.umk = null;
      state.value.privKey = null;
    },
  },
});

export const { set, setUMK, setPrivateKey, reset } = KeySlice.actions;

export default KeySlice.reducer;
