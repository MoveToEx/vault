import type { Keypair, Serialized } from "@/shared/lib/types";
import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

type Payload = {
  umk: string;
  kem: Serialized<Keypair>;
  sign: Serialized<Keypair>;
};

export const KeySlice = createSlice({
  name: "key",
  initialState: {
    value: null as Payload | null,
  },
  reducers: {
    set: (state, action: PayloadAction<Payload>) => {
      state.value = {
        ...action.payload
      }
    },
    reset: (state) => {
      state.value = null;
    },
  },
});

export const { set, reset } = KeySlice.actions;

export default KeySlice.reducer;
