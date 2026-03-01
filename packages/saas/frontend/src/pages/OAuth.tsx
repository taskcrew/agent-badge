import { useEffect, useState } from "react";

const API = "";

interface OAuthConnection {
  id: string;
  provider: string;
  label: string;
  googleEmail: string;
  scopes: string;
  createdAt: string;
}

export default function OAuth() {
  const [connections, setConnections] = useState<OAuthConnection[]>([]);

  const fetchConnections = async () => {
    const res = await fetch(`${API}/oauth/connections`);
    setConnections(await res.json());
  };

  useEffect(() => {
    fetchConnections();
  }, []);

  const deleteConnection = async (id: string) => {
    await fetch(`${API}/oauth/connections/${id}`, { method: "DELETE" });
    fetchConnections();
  };

  return (
    <>
      <div className="term-form">
        <div className="term-form-title">Connect OAuth Provider</div>
        <div className="term-form-row">
          <a
            href={`${API}/oauth/google/authorize`}
            className="term-submit"
            style={{ textDecoration: "none", textAlign: "center" }}
          >
            Connect Google Account
          </a>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Provider</th>
            <th>Label</th>
            <th>Email</th>
            <th>Scopes</th>
            <th>Connected</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {connections.map((conn) => (
            <tr key={conn.id}>
              <td>{conn.provider.toUpperCase()}</td>
              <td>{conn.label}</td>
              <td>{conn.googleEmail}</td>
              <td style={{ fontSize: "0.7rem" }}>{conn.scopes}</td>
              <td>{new Date(conn.createdAt).toLocaleDateString()}</td>
              <td>
                <button
                  className="row-action-btn delete"
                  onClick={() => deleteConnection(conn.id)}
                >
                  Revoke
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {connections.length === 0 && (
        <div className="empty-state">
          NO OAUTH CONNECTIONS // USE BUTTON ABOVE TO CONNECT A GOOGLE ACCOUNT
        </div>
      )}
    </>
  );
}
