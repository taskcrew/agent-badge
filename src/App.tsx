import { APITester } from "./APITester";
import "./index.css";

import agentBadge from "./agentbadge.png";

export function App() {
  return (
    <div className="app">
      <div className="logo-container">
        <img src={agentBadge} alt="Agent Badge" className="logo" />
      </div>
    </div>
  );
}

export default App;
