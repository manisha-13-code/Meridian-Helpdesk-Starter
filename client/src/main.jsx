import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider, useSelector } from 'react-redux';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { store } from './app/store';
import Layout from './components/Layout';
import Login from './features/auth/Login';
import TicketList from './features/tickets/TicketList';
import TicketDetail from './features/tickets/TicketDetail';
import './styles.css';

function Protected({ children }) {
  const token = useSelector((s) => s.auth.token);
  return token ? children : <Navigate to="/" replace />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Provider store={store}>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Login />} />
            <Route path="/tickets" element={<Protected><TicketList /></Protected>} />
            <Route path="/tickets/:id" element={<Protected><TicketDetail /></Protected>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </Provider>
  </React.StrictMode>
);
