import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { signedOut } from '../app/store';

export default function Layout() {
  const user = useSelector((s) => s.auth.user);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  return (
    <div className="layout">
      <header>
        <Link to="/tickets">Meridian Helpdesk</Link>
        {user && (
          <nav>
            <span>{user.name} ({user.role})</span>
            <button onClick={() => { dispatch(signedOut()); navigate('/'); }}>Sign out</button>
          </nav>
        )}
      </header>
      <main><Outlet /></main>
    </div>
  );
}
