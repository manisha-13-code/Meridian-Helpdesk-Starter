import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { api } from '../../app/api';

export default function TicketDetail() {
  const { id } = useParams();
  const user = useSelector((s) => s.auth.user);

  const [ticket, setTicket] = useState(null);
  const [comments, setComments] = useState([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    api(`/tickets/${id}`)
      .then((data) => {
        setTicket(data.ticket);
        setComments(data.comments);
      })
      .catch((e) => setError(e.message));
  }, [id]);

  async function addComment(e) {
    e.preventDefault();
    if (!draft.trim()) return;
    const created = await api(`/tickets/${id}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body: draft, isInternal: false }),
    });
    setComments([...comments, { ...created, author_name: user.name, author_role: user.role }]);
    setDraft('');
  }

  async function claim() {
    try {
      const updated = await api(`/tickets/${id}/assign`, { method: 'PATCH' });
      setTicket(updated);
    } catch (e) {
      setError(e.message);
    }
  }

  if (error) return <p className="error">{error}</p>;
  if (!ticket) return <p>Loading…</p>;

  return (
    <div className="ticket-detail">
      <h1>{ticket.subject}</h1>
      <p className="meta">
        #{ticket.id} · {ticket.status} · {ticket.priority}
        {ticket.breached && <span className="badge-breached">BREACHED</span>} ·
        requested by {ticket.requester_name} ({ticket.requester_email})
      </p>
      <p className="body">{ticket.body}</p>

      {!ticket.assignee_id && <button onClick={claim}>Claim this ticket</button>}
      {ticket.assignee_id && <p className="meta">Assigned to {ticket.assignee_name}</p>}

      <h2>Comments</h2>
      <ul className="comments">
        {comments.map((c) => (
          <li key={c.id} className={c.is_internal ? 'internal' : ''}>
            <strong>{c.author_name}</strong>
            <span className="when">{new Date(c.created_at).toLocaleString()}</span>
            <div className="comment-body">{c.body}</div>
          </li>
        ))}
      </ul>

      <form onSubmit={addComment}>
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={4} />
        <button type="submit">Reply</button>
      </form>
    </div>
  );
}