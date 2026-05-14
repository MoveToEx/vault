import { configureStore } from "@reduxjs/toolkit";
import KeyReducer from "./key";
import PathReducer from "./path";
import TransferReducer from "./transfer";
import UIReducer from "./ui";
import type { TypedUseSelectorHook } from "react-redux";
import { useDispatch, useSelector, useStore } from "react-redux";
import { from_base64 } from "libsodium-wrappers";

export const store = configureStore({
  reducer: {
    key: KeyReducer,
    path: PathReducer,
    transfer: TransferReducer,
    ui: UIReducer,
  },
});

export type AppStore = typeof store;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];

export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
export const useAppStore: () => AppStore = useStore;

export const useKeys = () => {
  const keys = useAppSelector(state => state.key.value);

  if (keys === null) return null;

  return {
    umk: from_base64(keys.umk),
    kem: {
      publicKey: from_base64(keys.kem.publicKey),
      privateKey: from_base64(keys.kem.privateKey),
    },
    sign: {
      publicKey: from_base64(keys.sign.publicKey),
      privateKey: from_base64(keys.sign.privateKey),
    },
  }
}