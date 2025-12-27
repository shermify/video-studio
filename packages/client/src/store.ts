import { createLogger } from 'redux-logger';
import { configureStore, type Middleware } from '@reduxjs/toolkit';
import {
  type TypedUseSelectorHook,
  useDispatch,
  useSelector,
} from 'react-redux';
import { api } from './api';
import jobsReducer from './features/jobs/jobsSlice';

const isProd = import.meta.env.PROD;

const reducer = {
  [api.reducerPath]: api.reducer,
  jobs: jobsReducer,
};

const middleware = [api.middleware] as Middleware[];

const baseMiddleware = [...middleware].concat(isProd ? [] : createLogger());

const store = configureStore({
  reducer,

  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      thunk: true,
      immutableCheck: !isProd,
      serializableCheck: {
        ignoredActions: [
          // RTK Query uses non-serializable internals
          'api/executeQuery/fulfilled',
          'api/executeMutation/fulfilled',
        ],
      },
    }).concat(...baseMiddleware),
});

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>;

// Inferred type: {posts: PostsState, comments: CommentsState, users: UsersState}
export type AppDispatch = typeof store.dispatch;
// Reselect
export type Selector<S> = (state: RootState) => S;
export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

export default store;
