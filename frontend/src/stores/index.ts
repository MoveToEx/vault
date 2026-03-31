import { configureStore } from '@reduxjs/toolkit'
import UMKReducer from './umk'
import PathReducer from './path'
import TransferReducer from './transfer'
import UIReducer from './ui'
import type { TypedUseSelectorHook } from 'react-redux'
import { useDispatch, useSelector, useStore } from 'react-redux'

export const store = configureStore({
  reducer: {
    umk: UMKReducer,
    path: PathReducer,
    transfer: TransferReducer,
    ui: UIReducer
  }
});

export type AppStore = typeof store
export type RootState = ReturnType<AppStore['getState']>
export type AppDispatch = AppStore['dispatch']

export const useAppDispatch: () => AppDispatch = useDispatch
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector
export const useAppStore: () => AppStore = useStore