import { createLogger } from 'redux-logger';
import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import { useDispatch, useSelector } from 'react-redux';
import { api } from './api';
import jobsReducer from './features/jobs/jobsSlice';

const isProd = import.meta.env.PROD;

const reducer = {
  [api.reducerPath]: api.reducer,
  jobs: jobsReducer,
};

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
    })
      .concat(api.middleware)
      .concat(isProd ? [] : [createLogger()]),
});

setupListeners(store.dispatch);

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>;

// Inferred type: {posts: PostsState, comments: CommentsState, users: UsersState}
export type AppDispatch = typeof store.dispatch;
// Reselect
export type Selector<S> = (state: RootState) => S;
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();

export default store;
