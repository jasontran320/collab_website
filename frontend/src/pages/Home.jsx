import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { auth } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { useAuth } from '../contexts/AuthContext'; // adjust the path as needed
import Dashboard from '../components/Dashboard';
import Tierlist from '../components/Tierlist';
import CursorTest from '../components/test'
import CollaborativeTierlist from '../components/CollaborativeTierlist';
import SessionJoinForm from '../components/SessionJoinForm';

export default function Home() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [sessionId, setSessionId] = useState(null);
  return (
    <div>
      {/* <h1>Home Page</h1>

      {currentUser ? (
        <div>
          <p>Welcome, {currentUser.displayName || currentUser.email}!</p>
          <p>UID: {currentUser.uid}</p>
        </div>
      ) : (
        <p>No user is logged in.</p>
      )} */}
      {/* <CursorTest/> */}






      {sessionId ? (
      <CollaborativeTierlist 
        sessionId={sessionId}
        onLeaveSession={() => setSessionId(null)}
      />
    ) : (
      <SessionJoinForm onJoinSession={setSessionId} />
    )}







      {/* <Tierlist/> */}
    </div>
  );
}
