import { configureStore, createSlice } from '@reduxjs/toolkit';

const stored = localStorage.getItem('helpdesk.session');

const authSlice = createSlice({
  name: 'auth',
  initialState: stored ? JSON.parse(stored) : { token: null, user: null },
  reducers: {
    signedIn(state, action) {
      state.token = action.payload.token;
      state.user = action.payload.user;
      localStorage.setItem('helpdesk.session', JSON.stringify(state));
    },
    signedOut(state) {
      state.token = null;
      state.user = null;
      localStorage.removeItem('helpdesk.session');
    },
  },
});

export const { signedIn, signedOut } = authSlice.actions;
export const store = configureStore({ reducer: { auth: authSlice.reducer } });
