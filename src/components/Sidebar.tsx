import React from 'react';
import { FaRocket, FaUserSecret, FaExclamationTriangle, FaLifeRing } from 'react-icons/fa';
import './Sidebar.css';

const Sidebar: React.FC = () => {
  return (
    <aside className="sidebar">
      <h2 className="sidebar-title">Menú</h2>
      <nav>
        <ul>
          <li>
            <a href="/start-analysis">
              <FaRocket className="sidebar-icon" />
              Start New Analysis
            </a>
          </li>
          <li>
            <a href="/hall-of-scammers">
              <FaUserSecret className="sidebar-icon" />
              Hall of Scammers
            </a>
          </li>
          <li>
            <a href="/common-crypto-scams">
              <FaExclamationTriangle className="sidebar-icon" />
              Common Crypto Scams
            </a>
          </li>
          <li>
            <a href="/get-help">
              <FaLifeRing className="sidebar-icon" />
              Got Scammed? Get Help
            </a>
          </li>
        </ul>
      </nav>
    </aside>
  );
};

export default Sidebar;
